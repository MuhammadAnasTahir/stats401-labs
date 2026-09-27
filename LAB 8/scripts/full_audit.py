from playwright.sync_api import sync_playwright

URL = "http://localhost:8765/LAB%208/index.html"
results = []

def check(name, cond):
    results.append((name, bool(cond)))

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1000})
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1000)

    # --- Section presence / order ---
    h2s = page.eval_on_selector_all("h2", "els => els.map(e => e.textContent.trim())")
    check("6 sections present in order", h2s == [
        "1. Bulletin / Corpus Description",
        "2. Corpus Overview",
        "3. Semantic Embedding Map",
        "4. Topic × Bulletin Section Matrix",
        "5. Semantic Findings",
        "6. Design Description",
    ])

    # --- Part A: corpus description text ---
    sec1 = page.inner_text(".dataset-section >> nth=0")
    check("Part A: has title/version/source/date", all(w in sec1 for w in ["Version:", "Source:", "Date accessed:"]))
    check("Part A: reports raw passages count", "2,813 raw passages" in sec1)
    check("Part A: reports cleaned passages count", "1,165 cleaned passages" in sec1)
    check("Part A: reports avg length", "85 words" in sec1)
    check("Part A: reports formal sections count", "85 distinct" in sec1)

    # --- Part B: >=2 corpus summaries ---
    n_bars_chapter = page.eval_on_selector_all("#chart-by-chapter rect", "e => e.length")
    n_bars_tfidf = page.eval_on_selector_all("#chart-tfidf rect", "e => e.length")
    n_hist = page.eval_on_selector_all("#chart-wordcount rect", "e => e.length")
    n_table = page.eval_on_selector_all("#table-sections tbody tr", "e => e.length")
    check("Part B: 4 corpus summaries render", all(n > 0 for n in [n_bars_chapter, n_bars_tfidf, n_hist, n_table]))

    # --- Part C: embedding/UMAP/clustering documented ---
    sec6 = page.inner_text(".dataset-section >> nth=5")
    check("Part C: embedding model documented", "all-MiniLM-L6-v2" in sec6)
    check("Part C: UMAP settings documented", "n_neighbors" in sec6 and "min_dist" in sec6)
    check("Part C: clustering method + k documented", "K-Means" in sec6 and "k=12" in sec6)

    # --- Part D: semantic map ---
    n_points = page.eval_on_selector_all("circle.point", "e => e.length")
    check("Part D: 1 point per passage (1165)", n_points == 1165)

    fills = set(page.eval_on_selector_all("circle.point", "els => els.slice(0,50).map(e=>e.getAttribute('fill'))"))
    check("Part D: color varies by topic", len(fills) > 1)

    radii = set(page.eval_on_selector_all("circle.point", "els => els.slice(0,50).map(e=>e.getAttribute('r'))"))
    check("Part D: size varies (additional attribute)", len(radii) > 1)

    # click for details
    page.click("circle.point >> nth=200", force=True)
    page.wait_for_timeout(300)
    detail_txt = page.inner_text("#detail-panel")
    check("Part D: click shows passage details", "Page:" in detail_txt and "Topic:" in detail_txt)
    neighbor_items = page.eval_on_selector_all("#neighbors-panel .neighbor-item", "e => e.length")
    check("Part D: nearest neighbors shown", neighbor_items >= 3)

    # search highlight
    page.fill("#search-input", "graduation")
    page.wait_for_timeout(300)
    dimmed_search = page.eval_on_selector_all("circle.point.dimmed", "e => e.length")
    check("Part D: search dims non-matching points", 0 < dimmed_search < 1165)
    page.fill("#search-input", "")
    page.wait_for_timeout(200)

    # topic filter
    page.select_option("#topic-filter", label="Tuition, Financial Aid & Costs")
    page.wait_for_timeout(300)
    dimmed_topic = page.eval_on_selector_all("circle.point.dimmed", "e => e.length")
    check("Part D: topic filter dims non-matching", 0 < dimmed_topic < 1165)
    page.select_option("#topic-filter", label="All topics")
    page.wait_for_timeout(200)

    # chapter (section) filter
    page.select_option("#chapter-filter", label="P5: Financial Information")
    page.wait_for_timeout(300)
    dimmed_chapter = page.eval_on_selector_all("circle.point.dimmed", "e => e.length")
    check("Part D: section/chapter filter dims non-matching", 0 < dimmed_chapter < 1165)
    page.select_option("#chapter-filter", label="All chapters")
    page.wait_for_timeout(200)

    # zoom/pan (wheel zoom on svg triggers d3.zoom -> transform on zoom-layer)
    box = page.eval_on_selector("#semantic-map", "el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; }")
    page.mouse.move(box["x"] + box["w"] / 2, box["y"] + box["h"] / 2)
    page.mouse.wheel(0, -300)
    page.wait_for_timeout(300)
    transform_after = page.eval_on_selector(".zoom-layer", "el => el.getAttribute('transform')")
    check("Part D: zoom changes transform", transform_after not in (None, "", "translate(0,0) scale(1)"))
    page.click("#reset-zoom-btn")
    page.wait_for_timeout(500)

    # --- Part E: matrix ---
    n_cells = page.eval_on_selector_all("rect.matrix-cell", "e => e.length")
    check("Part E: 12x12 = 144 matrix cells", n_cells == 144)

    page.hover("rect.matrix-cell >> nth=60")
    page.wait_for_timeout(200)
    tooltip_txt = page.inner_text("#matrix-tooltip")
    check("Part E: tooltip shows section+topic+count", "passages" in tooltip_txt)

    # --- Part F: coordination both directions ---
    page.click("rect.matrix-cell >> nth=60", force=True)
    page.wait_for_timeout(300)
    dimmed_after_cell = page.eval_on_selector_all("circle.point.dimmed", "e => e.length")
    check("Part F: matrix click -> map highlight", 0 < dimmed_after_cell < 1165)

    # reset filters then click a point, check matrix cell gets outlined
    page.select_option("#chapter-filter", label="All chapters")
    page.select_option("#topic-filter", label="All topics")
    page.wait_for_timeout(200)
    page.click("circle.point >> nth=300", force=True)
    page.wait_for_timeout(300)
    selected_cells = page.eval_on_selector_all("rect.matrix-cell.cell-selected", "e => e.length")
    check("Part F: map click -> matrix cell highlighted", selected_cells >= 1)

    # --- Part G: findings ---
    sec5 = page.inner_text(".dataset-section >> nth=4")
    n_questions = page.eval_on_selector_all("#findings dl dt", "e => e.length")
    check("Part G: >=4 analytical questions answered", n_questions >= 4)
    check("Part G: mentions credit/graduation/registration/academic integrity", all(
        w in sec5.lower() for w in ["credit", "graduation", "registration", "academic integrity"]
    ))

    # --- Part H: design description word count ---
    design_para = page.inner_text(".dataset-section >> nth=5 >> p.justification")
    wc = len(design_para.split())
    check(f"Part H: design description 200-300 words (actual={wc})", 200 <= wc <= 300)

    # --- Legends/titles ---
    check("Legend: topic legend has 12 items", page.eval_on_selector_all(".legend-item", "e => e.length") == 12)
    check("Legend: matrix color legend present", page.eval_on_selector("#matrix-legend-svg rect", "e => !!e") is not None)

    browser.close()

    print("\n=== AUDIT RESULTS ===")
    all_pass = True
    for name, ok in results:
        mark = "PASS" if ok else "FAIL"
        if not ok:
            all_pass = False
        print(f"[{mark}] {name}")

    print("\n=== console/page errors ===")
    if errors:
        for e in errors:
            print(e)
    else:
        print("(none)")

    print("\nALL PASS" if all_pass else "\nSOME FAILURES")
