from playwright.sync_api import sync_playwright

URL = "http://localhost:8765/LAB%208/index.html"

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 1600})
    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type == "error" else None)
    page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))

    page.goto(URL, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)

    n_points = page.eval_on_selector_all("circle.point", "els => els.length")
    n_cells = page.eval_on_selector_all("rect.matrix-cell", "els => els.length")
    n_stat_cards = page.eval_on_selector_all(".stat-card", "els => els.length")
    n_legend = page.eval_on_selector_all(".legend-item", "els => els.length")
    n_bars_chapter = page.eval_on_selector_all("#chart-by-chapter rect", "els => els.length")
    n_bars_tfidf = page.eval_on_selector_all("#chart-tfidf rect", "els => els.length")
    n_hist_bars = page.eval_on_selector_all("#chart-wordcount rect", "els => els.length")
    n_table_rows = page.eval_on_selector_all("#table-sections tbody tr", "els => els.length")

    print("points:", n_points)
    print("matrix cells:", n_cells)
    print("stat cards:", n_stat_cards)
    print("legend items:", n_legend)
    print("chapter bars:", n_bars_chapter)
    print("tfidf bars:", n_bars_tfidf)
    print("hist bars:", n_hist_bars)
    print("section table rows:", n_table_rows)

    page.screenshot(path="scripts/screenshot_full.png", full_page=True)

    # click a map point
    page.click("circle.point >> nth=100", force=True)
    page.wait_for_timeout(300)
    detail_text = page.inner_text("#detail-panel")
    neighbors_text = page.inner_text("#neighbors-panel")
    print("\n--- after clicking a map point ---")
    print("detail panel snippet:", detail_text[:200].replace("\n", " | "))
    print("neighbors panel snippet:", neighbors_text[:200].replace("\n", " | "))
    page.screenshot(path="scripts/screenshot_after_point_click.png", full_page=True)

    # click a matrix cell
    page.click("rect.matrix-cell >> nth=50", force=True)
    page.wait_for_timeout(300)
    detail_text2 = page.inner_text("#detail-panel")
    print("\n--- after clicking a matrix cell ---")
    print("detail panel snippet:", detail_text2[:250].replace("\n", " | "))
    n_dimmed = page.eval_on_selector_all("circle.point.dimmed", "els => els.length")
    print("dimmed points after cell click:", n_dimmed, "/", n_points)
    page.screenshot(path="scripts/screenshot_after_cell_click.png", full_page=True)

    # test search
    page.fill("#search-input", "graduation")
    page.wait_for_timeout(300)
    n_dimmed2 = page.eval_on_selector_all("circle.point.dimmed", "els => els.length")
    print("\ndimmed points after search 'graduation':", n_dimmed2, "/", n_points)

    print("\n--- console/page errors ---")
    if errors:
        for e in errors:
            print(e)
    else:
        print("(none)")

    browser.close()
