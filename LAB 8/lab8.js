// ===================== Constants =====================

const CHAPTER_ORDER = [
    "Part 1: General Information",
    "Part 2: A Liberal Arts Education at Duke Kunshan University",
    "Part 3: The Curriculum",
    "Part 4: Admission, Scholarships and Financial Aid",
    "Part 5: Financial Information",
    "Part 6: Academic Procedures and Information",
    "Part 7: Academic Advising and Support",
    "Part 8: Career Services, Research Opportunities, and Study Away",
    "Part 9: Student Experience and Campus Life",
    "Part 10: Majors and Courses",
    "Part 11: DKU Academic Calendar Academic Year 2025-2026",
    "Part 12: Useful Contacts",
];

const CLUSTER_ORDER = [
    "Degree & Major Requirement Structures",
    "History, Literature & Global Cultures",
    "Academic Standing, Grading & Registration",
    "Math, Science & Physical Education Courses",
    "Public Policy, Politics & Environment",
    "China & Chinese Language/Culture Studies",
    "Arts, Media & Digital Design",
    "Student Life, Research & Signature Work",
    "DKU Policies, Credit Transfer & Degree Standards",
    "Anthropology, Global Health & Course Updates",
    "Tuition, Financial Aid & Costs",
    "Quantitative Social Science (Econometrics)",
];

const COLOR_PALETTE = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728",
    "#9467bd", "#8c564b", "#e377c2", "#7f7f7f",
    "#bcbd22", "#17becf", "#aec7e8", "#f7b6d2",
];

const colorScale = d3.scaleOrdinal().domain(CLUSTER_ORDER).range(COLOR_PALETTE);

function chapterShort(chapter) {
    const m = chapter.match(/^Part (\d+): (.*)$/);
    if (!m) return chapter;
    return `P${m[1]}: ${m[2]}`;
}

function fieldOr(v) {
    return v ? v : "—";
}

// ===================== Global state =====================

const state = {
    data: [],
    byId: new Map(),
    selectedId: null,
    selectedCell: null, // {chapter, cluster}
    searchQuery: "",
    chapterFilter: "",
    topicFilter: "",
};

let mapPoints = null; // d3 selection of circles
let xScale, yScale, zoomBehavior, zoomLayer;
let matrixCells = null;

const tooltip = d3.select("#tooltip");

// ===================== Load data =====================

Promise.all([
    d3.csv("../data/lab8_embedding_map.csv", (d) => ({
        passage_id: d.passage_id,
        chapter: d.chapter,
        section: d.section,
        subsection: d.subsection,
        page: +d.page,
        text: d.text,
        word_count: +d.word_count,
        cluster: +d.cluster,
        cluster_name: d.cluster_name,
        x: +d.x,
        y: +d.y,
        neighbors: d.neighbors ? d.neighbors.split("|") : [],
    })),
    d3.csv("../data/lab8_topic_section_matrix.csv", (d) => ({
        chapter: d.chapter,
        cluster_name: d.cluster_name,
        count: +d.count,
    })),
    d3.json("../data/lab8_top_tfidf_terms.json"),
]).then(([data, matrixData, tfidfTerms]) => {
    state.data = data;
    data.forEach((d) => state.byId.set(d.passage_id, d));

    renderStatCards(data);
    renderChapterChart(data);
    renderTfidfChart(tfidfTerms);
    renderWordCountHistogram(data);
    renderSectionTable(data);

    populateFilters();
    renderTopicLegend();
    renderSemanticMap(data);
    renderTopicMatrix(matrixData);
});

// ===================== 2. Corpus overview =====================

function renderStatCards(data) {
    const chapters = new Set(data.map((d) => d.chapter)).size;
    const sections = new Set(data.map((d) => d.chapter + "||" + d.section)).size;
    const avgWords = d3.mean(data, (d) => d.word_count);

    const cards = [
        { value: data.length.toLocaleString(), label: "Cleaned Passages" },
        { value: chapters, label: "Chapters (Parts)" },
        { value: sections, label: "Formal Sections" },
        { value: Math.round(avgWords), label: "Avg. Words / Passage" },
        { value: 12, label: "Semantic Topics" },
    ];

    const card = d3
        .select("#corpus-stat-cards")
        .selectAll(".stat-card")
        .data(cards)
        .join("div")
        .attr("class", "stat-card");

    card.selectAll(".stat-value").data((d) => [d]).join("div").attr("class", "stat-value").text((d) => d.value);
    card.selectAll(".stat-label").data((d) => [d]).join("div").attr("class", "stat-label").text((d) => d.label);
}

function renderChapterChart(data) {
    const counts = d3.rollup(data, (v) => v.length, (d) => d.chapter);
    const rows = CHAPTER_ORDER.map((c) => ({ chapter: c, count: counts.get(c) || 0 }));

    const width = 980, barHeight = 28, margin = { top: 10, right: 55, bottom: 45, left: 430 };
    const height = rows.length * barHeight + margin.top + margin.bottom;

    const svg = d3.select("#chart-by-chapter").append("svg")
        .attr("width", width).attr("height", height);

    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.count)]).nice()
        .range([0, width - margin.left - margin.right]);
    const y = d3.scaleBand().domain(rows.map((d) => d.chapter)).range([margin.top, height - margin.bottom]).padding(0.18);

    const g = svg.append("g").attr("transform", `translate(${margin.left},0)`);

    // gridlines
    g.append("g").attr("class", "gridline")
        .call(d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
        .attr("transform", `translate(0,${height - margin.bottom})`);

    g.selectAll("rect").data(rows).join("rect")
        .attr("x", 0).attr("y", (d) => y(d.chapter))
        .attr("width", (d) => x(d.count)).attr("height", y.bandwidth())
        .attr("fill", "#2a5d84");

    g.selectAll(".bar-label").data(rows).join("text")
        .attr("class", "bar-label")
        .attr("x", (d) => x(d.count) + 6).attr("y", (d) => y(d.chapter) + y.bandwidth() / 2)
        .attr("dy", "0.35em").attr("font-size", 13).attr("font-weight", "bold").attr("fill", "#222")
        .text((d) => d.count);

    svg.append("g").selectAll("text.rowlabel").data(rows).join("text")
        .attr("class", "rowlabel")
        .attr("x", margin.left - 10).attr("y", (d) => y(d.chapter) + y.bandwidth() / 2)
        .attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 12.5)
        .text((d) => chapterShort(d.chapter));

    g.append("g").attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(6));

    svg.append("text").attr("class", "axis-title")
        .attr("x", margin.left + (width - margin.left - margin.right) / 2).attr("y", height - 6)
        .attr("text-anchor", "middle").text("Number of Passages");
}

function renderTfidfChart(terms) {
    const rows = terms.slice(0, 15);
    const width = 560, barHeight = 24, margin = { top: 10, right: 20, bottom: 45, left: 150 };
    const height = rows.length * barHeight + margin.top + margin.bottom;

    const svg = d3.select("#chart-tfidf").append("svg")
        .attr("width", width).attr("height", height);

    const x = d3.scaleLinear().domain([0, d3.max(rows, (d) => d.score)]).nice()
        .range([0, width - margin.left - margin.right]);
    const y = d3.scaleBand().domain(rows.map((d) => d.term)).range([margin.top, height - margin.bottom]).padding(0.18);

    const g = svg.append("g").attr("transform", `translate(${margin.left},0)`);

    g.append("g").attr("class", "gridline")
        .call(d3.axisBottom(x).ticks(5).tickSize(-(height - margin.top - margin.bottom)).tickFormat(""))
        .attr("transform", `translate(0,${height - margin.bottom})`);

    g.selectAll("rect").data(rows).join("rect")
        .attr("x", 0).attr("y", (d) => y(d.term))
        .attr("width", (d) => x(d.score)).attr("height", y.bandwidth())
        .attr("fill", "#8c564b");

    g.selectAll(".bar-label").data(rows).join("text")
        .attr("x", (d) => x(d.score) + 5).attr("y", (d) => y(d.term) + y.bandwidth() / 2)
        .attr("dy", "0.35em").attr("font-size", 11).attr("fill", "#555")
        .text((d) => d.score.toFixed(3));

    svg.append("g").selectAll("text.rowlabel").data(rows).join("text")
        .attr("x", margin.left - 10).attr("y", (d) => y(d.term) + y.bandwidth() / 2)
        .attr("dy", "0.35em").attr("text-anchor", "end").attr("font-size", 12.5)
        .text((d) => d.term);

    g.append("g").attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(5));

    svg.append("text").attr("class", "axis-title")
        .attr("x", margin.left + (width - margin.left - margin.right) / 2).attr("y", height - 6)
        .attr("text-anchor", "middle").text("Mean TF-IDF Score");
}

function renderWordCountHistogram(data) {
    const width = 560, height = 340, margin = { top: 15, right: 20, bottom: 45, left: 60 };
    const values = data.map((d) => d.word_count);

    const x = d3.scaleLinear().domain([0, d3.max(values)]).nice()
        .range([margin.left, width - margin.right]);
    const bins = d3.bin().domain(x.domain()).thresholds(20)(values);
    const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length)]).nice()
        .range([height - margin.bottom, margin.top]);

    const svg = d3.select("#chart-wordcount").append("svg")
        .attr("width", width).attr("height", height);

    svg.append("g").attr("class", "gridline")
        .call(d3.axisLeft(y).ticks(6).tickSize(-(width - margin.left - margin.right)).tickFormat(""))
        .attr("transform", `translate(${margin.left},0)`);

    svg.append("g").selectAll("rect").data(bins).join("rect")
        .attr("x", (b) => x(b.x0) + 1).attr("y", (b) => y(b.length))
        .attr("width", (b) => Math.max(0, x(b.x1) - x(b.x0) - 1))
        .attr("height", (b) => y(0) - y(b.length))
        .attr("fill", "#2ca02c");

    svg.append("g").attr("class", "axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(6));
    svg.append("g").attr("class", "axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(6));

    svg.append("text").attr("class", "axis-title")
        .attr("x", margin.left + (width - margin.left - margin.right) / 2).attr("y", height - 6)
        .attr("text-anchor", "middle").text("Words per Passage");

    svg.append("text").attr("class", "axis-title")
        .attr("transform", "rotate(-90)")
        .attr("x", -(margin.top + (height - margin.top - margin.bottom) / 2))
        .attr("y", 16)
        .attr("text-anchor", "middle").text("Number of Passages");
}

function renderSectionTable(data) {
    const rows = Array.from(
        d3.rollup(data, (v) => ({ count: v.length, avg: d3.mean(v, (d) => d.word_count) }),
            (d) => d.chapter + " / " + d.section)
    ).map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

    const table = d3.select("#table-sections").append("table").attr("class", "section-table");
    const thead = table.append("thead").append("tr");
    thead.selectAll("th").data(["Chapter / Section", "Passages", "Avg. Words"]).join("th").text((d) => d);

    const tbody = table.append("tbody");
    tbody.selectAll("tr").data(rows).join("tr").each(function (d) {
        const tr = d3.select(this);
        tr.append("td").text(d.key);
        tr.append("td").text(d.count);
        tr.append("td").text(Math.round(d.avg));
    });
}

// ===================== Filters + Legend =====================

function populateFilters() {
    d3.select("#chapter-filter").selectAll("option.dyn").data(CHAPTER_ORDER).join("option")
        .attr("class", "dyn").attr("value", (d) => d).text((d) => chapterShort(d));

    d3.select("#topic-filter").selectAll("option.dyn").data(CLUSTER_ORDER).join("option")
        .attr("class", "dyn").attr("value", (d) => d).text((d) => d);

    d3.select("#search-input").on("input", function () {
        state.searchQuery = this.value.trim().toLowerCase();
        clearCellSelection();
        refreshMapVisuals();
    });
    d3.select("#chapter-filter").on("change", function () {
        state.chapterFilter = this.value;
        clearCellSelection();
        refreshMapVisuals();
    });
    d3.select("#topic-filter").on("change", function () {
        state.topicFilter = this.value;
        clearCellSelection();
        refreshMapVisuals();
    });
    d3.select("#reset-zoom-btn").on("click", () => {
        d3.select("#semantic-map").transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity);
    });
}

function renderTopicLegend() {
    const items = d3.select("#topic-legend").selectAll(".legend-item").data(CLUSTER_ORDER).join("div")
        .attr("class", "legend-item")
        .on("click", function (event, d) {
            const sel = d3.select("#topic-filter");
            sel.property("value", sel.property("value") === d ? "" : d);
            state.topicFilter = sel.property("value");
            clearCellSelection();
            refreshMapVisuals();
        });
    items.append("div").attr("class", "legend-swatch").style("background", (d) => colorScale(d));
    items.append("div").text((d) => d);
}

function passesFilters(d) {
    if (state.searchQuery && !d.text.toLowerCase().includes(state.searchQuery)) return false;
    if (state.chapterFilter && d.chapter !== state.chapterFilter) return false;
    if (state.topicFilter && d.cluster_name !== state.topicFilter) return false;
    return true;
}

// ===================== 3. Semantic Map =====================

function renderSemanticMap(data) {
    const width = 700, height = 560;
    const svg = d3.select("#semantic-map").attr("width", width).attr("height", height);

    xScale = d3.scaleLinear().domain(d3.extent(data, (d) => d.x)).nice().range([30, width - 30]);
    yScale = d3.scaleLinear().domain(d3.extent(data, (d) => d.y)).nice().range([height - 30, 30]);
    const rScale = d3.scaleSqrt().domain(d3.extent(data, (d) => d.word_count)).range([2.5, 9]);

    zoomLayer = svg.append("g").attr("class", "zoom-layer");

    mapPoints = zoomLayer.selectAll("circle.point").data(data, (d) => d.passage_id).join("circle")
        .attr("class", "point")
        .attr("cx", (d) => xScale(d.x))
        .attr("cy", (d) => yScale(d.y))
        .attr("r", (d) => rScale(d.word_count))
        .attr("fill", (d) => colorScale(d.cluster_name))
        .attr("fill-opacity", 0.85)
        .on("mouseover", function (event, d) {
            tooltip.style("opacity", 1).html(
                `<strong>${fieldOr(d.section)}</strong><br>${chapterShort(d.chapter)} &middot; p.${d.page}<br>` +
                `<em>${d.cluster_name}</em><br>${d.text.slice(0, 120)}...`
            );
        })
        .on("mousemove", function (event) {
            tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY + 10 + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0))
        .on("click", (event, d) => selectPassage(d));

    zoomBehavior = d3.zoom().scaleExtent([0.6, 12]).on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
    });
    svg.call(zoomBehavior);
}

function refreshMapVisuals() {
    if (!mapPoints) return;
    const neighborSet = state.selectedId
        ? new Set(state.byId.get(state.selectedId).neighbors)
        : new Set();

    mapPoints
        .classed("dimmed", (d) => !passesFilters(d))
        .classed("selected-point", (d) => d.passage_id === state.selectedId)
        .classed("neighbor-point", (d) => neighborSet.has(d.passage_id))
        .classed("matrix-highlight", (d) =>
            !state.selectedId &&
            state.selectedCell &&
            d.chapter === state.selectedCell.chapter &&
            d.cluster_name === state.selectedCell.cluster_name
        );
}

// ===================== Detail panel + neighbors =====================

function selectPassage(d) {
    state.selectedId = d.passage_id;
    state.selectedCell = { chapter: d.chapter, cluster_name: d.cluster_name };

    d3.select("#detail-panel").html(`
        <div class="legend-title">Passage Details</div>
        <div class="detail-field"><span class="field-label">Chapter:</span> ${chapterShort(d.chapter)}</div>
        <div class="detail-field"><span class="field-label">Section:</span> ${fieldOr(d.section)}</div>
        <div class="detail-field"><span class="field-label">Subsection:</span> ${fieldOr(d.subsection)}</div>
        <div class="detail-field"><span class="field-label">Page:</span> ${d.page}</div>
        <div class="detail-field"><span class="field-label">Topic:</span> ${d.cluster_name}</div>
        <div class="detail-field">${d.text}</div>
    `);

    const neighbors = d.neighbors.map((id) => state.byId.get(id)).filter(Boolean);
    const npanel = d3.select("#neighbors-panel");
    npanel.html('<div class="legend-title">Nearest Semantic Neighbors</div>');
    npanel.selectAll(".neighbor-item").data(neighbors).join("div")
        .attr("class", "neighbor-item")
        .on("click", (event, nd) => selectPassage(nd))
        .html((nd) => `
            <div class="neighbor-meta">${chapterShort(nd.chapter)} &middot; ${fieldOr(nd.section)} &middot; p.${nd.page}</div>
            ${nd.text.slice(0, 110)}...
        `);

    refreshMapVisuals();
    refreshMatrixVisuals();
}

function clearCellSelection() {
    state.selectedCell = null;
    if (matrixCells) matrixCells.classed("cell-selected", false);
}

// ===================== 4. Topic x Section Matrix =====================

function renderTopicMatrix(matrixData) {
    const lookup = new Map();
    matrixData.forEach((d) => lookup.set(d.chapter + "||" + d.cluster_name, d.count));

    const cellW = 42, cellH = 30, margin = { top: 210, right: 20, bottom: 10, left: 420 };
    const width = margin.left + CLUSTER_ORDER.length * cellW + margin.right;
    const height = margin.top + CHAPTER_ORDER.length * cellH + margin.bottom;

    const svg = d3.select("#topic-matrix").attr("width", width).attr("height", height);

    const maxCount = d3.max(matrixData, (d) => d.count);
    // Sqrt scale so low (but nonzero) counts still get real color, not near-white;
    // YlGnBu's low end is a visible pale yellow rather than white, so empty-ish
    // cells stay distinguishable from the page background.
    const color = d3.scaleSequentialSqrt(d3.interpolateYlGnBu).domain([0, maxCount]);
    const ZERO_FILL = "#f2f2f2";

    const cellsData = [];
    CHAPTER_ORDER.forEach((chapter, ri) => {
        CLUSTER_ORDER.forEach((cluster_name, ci) => {
            cellsData.push({
                chapter, cluster_name, ri, ci,
                count: lookup.get(chapter + "||" + cluster_name) || 0,
            });
        });
    });

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    matrixCells = g.selectAll("rect.matrix-cell").data(cellsData).join("rect")
        .attr("class", "matrix-cell")
        .attr("x", (d) => d.ci * cellW).attr("y", (d) => d.ri * cellH)
        .attr("width", cellW - 1).attr("height", cellH - 1)
        .attr("fill", (d) => (d.count > 0 ? color(d.count) : ZERO_FILL))
        .on("mouseover", function (event, d) {
            const totalInChapter = d3.sum(cellsData.filter((c) => c.chapter === d.chapter), (c) => c.count);
            const pct = totalInChapter ? ((d.count / totalInChapter) * 100).toFixed(0) : 0;
            d3.select("#matrix-tooltip").style("opacity", 1).html(
                `<strong>${chapterShort(d.chapter)}</strong><br>${d.cluster_name}<br>${d.count} passages (${pct}% of chapter)`
            );
        })
        .on("mousemove", function (event) {
            d3.select("#matrix-tooltip").style("left", event.pageX + 14 + "px").style("top", event.pageY + 10 + "px");
        })
        .on("mouseout", () => d3.select("#matrix-tooltip").style("opacity", 0))
        .on("click", (event, d) => selectMatrixCell(d));

    // row labels (chapters) -- full text, no truncation
    g.selectAll("text.row-label").data(CHAPTER_ORDER).join("text")
        .attr("class", "axis-label-y")
        .attr("x", -8).attr("y", (d, i) => i * cellH + cellH / 2)
        .attr("dy", "0.35em").attr("text-anchor", "end")
        .text((d) => chapterShort(d));

    // column labels (topics), rotated -- full text, no truncation
    g.selectAll("text.col-label").data(CLUSTER_ORDER).join("text")
        .attr("class", "axis-label-x")
        .attr("transform", (d, i) => `translate(${i * cellW + cellW / 2},-10) rotate(-40)`)
        .attr("text-anchor", "start")
        .text((d) => d);

    renderMatrixLegend(color, maxCount, ZERO_FILL);
}

function renderMatrixLegend(color, maxCount, zeroFill) {
    const width = 340, height = 56, barW = 260, barH = 14;
    const svg = d3.select("#matrix-legend-svg").attr("width", width).attr("height", height);
    svg.selectAll("*").remove();

    const defs = svg.append("defs");
    const gradId = "matrix-color-gradient";
    const gradient = defs.append("linearGradient").attr("id", gradId)
        .attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
    const stops = d3.range(0, 1.0001, 0.05);
    stops.forEach((t) => {
        gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", color(t * maxCount));
    });

    const gx = 40;
    // zero swatch
    svg.append("rect").attr("x", 0).attr("y", 8).attr("width", 20).attr("height", barH)
        .attr("fill", zeroFill).attr("stroke", "#ccc");
    svg.append("text").attr("x", 24).attr("y", 8 + barH / 2).attr("dy", "0.35em")
        .attr("font-size", 11).attr("fill", "#555").text("0");

    svg.append("rect").attr("x", gx).attr("y", 8).attr("width", barW).attr("height", barH)
        .attr("fill", `url(#${gradId})`).attr("stroke", "#ccc");

    const legendScale = d3.scaleLinear().domain([0, maxCount]).range([gx, gx + barW]);
    svg.append("g").attr("transform", `translate(0,${8 + barH})`)
        .call(d3.axisBottom(legendScale).ticks(5).tickSize(4))
        .attr("font-size", 10);

    svg.append("text").attr("x", gx + barW / 2).attr("y", height - 2)
        .attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#555")
        .text("Passages per cell (low → high)");
}

function refreshMatrixVisuals() {
    if (!matrixCells) return;
    matrixCells.classed("cell-selected", (d) =>
        state.selectedCell &&
        d.chapter === state.selectedCell.chapter &&
        d.cluster_name === state.selectedCell.cluster_name
    );
}

function selectMatrixCell(d) {
    state.selectedId = null;
    state.selectedCell = { chapter: d.chapter, cluster_name: d.cluster_name };
    state.chapterFilter = d.chapter;
    state.topicFilter = d.cluster_name;
    d3.select("#chapter-filter").property("value", d.chapter);
    d3.select("#topic-filter").property("value", d.cluster_name);

    const matches = state.data.filter((p) => p.chapter === d.chapter && p.cluster_name === d.cluster_name);
    const panel = d3.select("#detail-panel");
    panel.html(`
        <div class="legend-title">Passage Details</div>
        <div class="detail-field"><span class="field-label">${chapterShort(d.chapter)}</span></div>
        <div class="detail-field"><span class="field-label">Topic:</span> ${d.cluster_name}</div>
        <div class="detail-field"><span class="field-label">Count:</span> ${matches.length} passages</div>
    `);
    const list = panel.append("div");
    list.selectAll(".neighbor-item").data(matches.slice(0, 10)).join("div")
        .attr("class", "neighbor-item")
        .on("click", (event, pd) => selectPassage(pd))
        .html((pd) => `<div class="neighbor-meta">${fieldOr(pd.section)} &middot; p.${pd.page}</div>${pd.text.slice(0, 100)}...`);

    d3.select("#neighbors-panel").html(
        '<div class="legend-title">Nearest Semantic Neighbors</div><p class="placeholder-text">Click a passage on the left, or a point on the map, to see its neighbors.</p>'
    );

    refreshMapVisuals();
    refreshMatrixVisuals();
}
