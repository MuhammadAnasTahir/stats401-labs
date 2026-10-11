// ======================== Lab 7: Animated Temporal Commercial Network ========================

// Chosen so no two sectors share a similar hue (the previous palette had
// Manufacturing/Technology both blue-purple and Logistics/Wholesale both
// orange-yellow, which were hard to tell apart at swatch size).
const SECTOR_COLORS = {
    Manufacturing: "#3366cc",
    Logistics:     "#ff9900",
    Retail:        "#dc3912",
    Food:          "#109618",
    Technology:    "#990099",
    Wholesale:     "#22aa99",
    Materials:     "#6b4423"
};

// Region is encoded through node border, not color, so it never competes
// with sector (also color) for the same visual channel.
const REGION_STYLE = {
    Asia:            { color: "#1a1a1a", width: 2.5, dasharray: null   },
    Europe:          { color: "#1a1a1a", width: 2.5, dasharray: "5,3" },
    "North America": { color: "#ccc",    width: 0.75, dasharray: null  }
};

// Transaction type is encoded through line style, not color, for the same
// reason. Ranked by frequency: services (104) > goods (77) > shipping (71)
// > components (70) > materials (45).
const TYPE_DASH = {
    services:   null,
    goods:      "9,5",
    shipping:   "1,5",
    components: "9,3,2,3",
    materials:  "16,5"
};

const tooltip = d3.select("#tooltip");

let companies, companyById, transactionsByDay, dayDateMap;
let currentDay = 1;
let timer = null;
let linkGroup, nodeSel, labelSel;
let rScale, wScale;
let NET_W, NET_H;

Promise.all([
    d3.csv("../data/lab7_assignment_companies.csv", d => ({
        id: d.id, name: d.company_name, sector: d.sector, region: d.region
    })),
    d3.csv("../data/lab7_assignment_transactions_60days.csv", d => ({
        date: d.date, day: +d.day, source: d.source, target: d.target,
        amount: +d.amount_usd, type: d.transaction_type, count: +d.transaction_count
    }))
]).then(([companiesData, tx]) => {
    companies = companiesData;
    companyById = new Map(companies.map(c => [c.id, c]));
    transactionsByDay = d3.group(tx, d => d.day);

    dayDateMap = new Map();
    tx.forEach(d => { if (!dayDateMap.has(d.day)) dayDateMap.set(d.day, d.date); });

    const { globalMax, perCompanyMax } = volumeStats(tx);
    wScale = d3.scaleLinear().domain(d3.extent(tx, d => d.amount)).range([1.2, 6]);
    rScale = d3.scaleSqrt().domain([0, globalMax]).range([5, 26]);

    init(tx, perCompanyMax);
    showDay(1);
});

// Largest single-day volume overall (fixes the size scale) and per company
// (used so each node's one-time layout position reserves enough collision
// space for its own worst-case size, never just an average/neutral one).
function volumeStats(tx) {
    const byDayCompany = new Map();
    tx.forEach(d => {
        [d.source, d.target].forEach(id => {
            const key = d.day + "|" + id;
            byDayCompany.set(key, (byDayCompany.get(key) || 0) + d.amount);
        });
    });
    let globalMax = 0;
    const perCompanyMax = new Map();
    byDayCompany.forEach((val, key) => {
        const id = key.slice(key.indexOf("|") + 1);
        perCompanyMax.set(id, Math.max(perCompanyMax.get(id) || 0, val));
        if (val > globalMax) globalMax = val;
    });
    return { globalMax, perCompanyMax };
}

function linkKey(d) {
    return d.source.id < d.target.id ? `${d.source.id}-${d.target.id}` : `${d.target.id}-${d.source.id}`;
}

// ======================== One-time layout ========================

// Every company's x/y is computed once, from the aggregate set of company
// pairs that trade at any point across all 60 days, then frozen permanently.
// Only node radius, node opacity, and which links are drawn change from day
// to day — nodes themselves never move again. An earlier version reheated
// the force simulation on every day change, which let the link force pull
// nodes toward wherever that specific day's neighbors were, and watching it
// made nodes visibly drift or jump around day to day — exactly what
// preserving the viewer's mental map is supposed to prevent.
function computeLayout(tx, perCompanyMax, W, H) {
    const pairMap = new Map();
    tx.forEach(l => {
        const key = [l.source, l.target].sort().join("-");
        if (!pairMap.has(key)) pairMap.set(key, { source: l.source, target: l.target });
    });
    const layoutLinks = Array.from(pairMap.values());

    // This only ever runs once, so it can afford a much stronger repulsion
    // than a live, continuously-reheated simulation safely could — the goal
    // here is simply to spread the one-time layout out to use the canvas
    // well, not to stay stable under constant daily disturbance.
    const layoutSim = d3.forceSimulation(companies)
        .force("link",    d3.forceLink(layoutLinks).id(d => d.id).distance(130))
        .force("charge",  d3.forceManyBody().strength(-420))
        .force("center",  d3.forceCenter(W / 2, H / 2))
        .force("x",       d3.forceX(W / 2).strength(0.05))
        .force("y",       d3.forceY(H / 2).strength(0.05))
        .force("collide", d3.forceCollide(d => rScale(perCompanyMax.get(d.id) || 0) + 10).strength(0.9))
        .stop();

    for (let i = 0; i < 400; i++) layoutSim.tick();

    // Clamp once to the canvas, using each company's own largest possible
    // radius so it can never spill outside the frame even on its biggest day.
    companies.forEach(d => {
        const r = rScale(perCompanyMax.get(d.id) || 0);
        d.x = Math.max(r + 4, Math.min(W - r - 4, d.x));
        d.y = Math.max(r + 16, Math.min(H - r - 4, d.y));
    });
}

// ======================== Setup ========================

function init(tx, perCompanyMax) {
    const W = 1060, H = 700;
    NET_W = W; NET_H = H;
    const svg = d3.select("#network-svg").attr("width", W).attr("height", H);
    const zoomLayer = svg.append("g").attr("class", "zoom-layer");

    linkGroup = zoomLayer.append("g").attr("class", "links");
    const nodeGroup = zoomLayer.append("g").attr("class", "nodes");

    computeLayout(tx, perCompanyMax, W, H);

    nodeSel = nodeGroup.selectAll("circle")
        .data(companies, d => d.id)
        .join("circle")
        .attr("cx", d => d.x)
        .attr("cy", d => d.y)
        .attr("r", 5)
        .attr("fill", d => SECTOR_COLORS[d.sector])
        .attr("stroke", d => REGION_STYLE[d.region].color)
        .attr("stroke-width", d => REGION_STYLE[d.region].width)
        .attr("stroke-dasharray", d => REGION_STYLE[d.region].dasharray)
        .attr("cursor", "pointer")
        .on("mouseover", function(ev, d) {
            tooltip.style("opacity", 1).html(
                `<strong>${d.name}</strong><br>` +
                `Sector: ${d.sector}<br>` +
                `Region: ${d.region}<br>` +
                `Day ${currentDay} volume: $${Math.round(d.volume || 0).toLocaleString()}`
            );
        })
        .on("mousemove", ev => {
            tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY + 10 + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    labelSel = nodeGroup.selectAll("text")
        .data(companies, d => d.id)
        .join("text")
        .attr("x", d => d.x)
        .attr("y", d => d.y - rScale(0) - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", 10).attr("fill", "#222")
        .attr("paint-order", "stroke")
        .attr("stroke", "white").attr("stroke-width", 3)
        .attr("pointer-events", "none")
        .text(d => d.name);

    // Buttons + drag-to-pan only; scroll/trackpad-pinch zooming is disabled.
    const zoom = d3.zoom()
        .scaleExtent([0.5, 6])
        .filter(ev => ev.type !== "wheel")
        .on("zoom", ev => zoomLayer.attr("transform", ev.transform));
    svg.call(zoom);

    // Default view is one zoom-in step (matching the + button) rather than
    // true 1:1 scale, since the identity transform left too much empty
    // canvas around a 12-node network. This is also the Reset target.
    const defaultTransform = d3.zoomIdentity
        .translate(W / 2, H / 2).scale(1.4).translate(-W / 2, -H / 2);
    svg.call(zoom.transform, defaultTransform);

    d3.select("#net-zoom-in").on("click", () =>
        svg.transition().duration(250).call(zoom.scaleBy, 1.4));
    d3.select("#net-zoom-out").on("click", () =>
        svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.4));
    d3.select("#net-zoom-reset").on("click", () =>
        svg.transition().duration(400).call(zoom.transform, defaultTransform));

    renderLegend();
    wireControls();
}

// ======================== Frame update ========================

function showDay(day) {
    currentDay = day;
    const rawLinks = transactionsByDay.get(day) || [];

    const volMap = new Map(companies.map(c => [c.id, 0]));
    rawLinks.forEach(l => {
        volMap.set(l.source, (volMap.get(l.source) || 0) + l.amount);
        volMap.set(l.target, (volMap.get(l.target) || 0) + l.amount);
    });
    companies.forEach(c => { c.volume = volMap.get(c.id) || 0; });

    // Resolve each row into its own object carrying real company references
    // (fixed x/y already set) rather than mutating the shared source rows —
    // nothing here is reused or overwritten on a later revisit to this day.
    const links = rawLinks.map(l => ({
        date: l.date, day: l.day, amount: l.amount, type: l.type, count: l.count,
        source: companyById.get(l.source),
        target: companyById.get(l.target)
    }));

    const linkSel = linkGroup.selectAll("line.link")
        .data(links, linkKey)
        .join(
            enter => enter.append("line")
                .attr("class", "link")
                .attr("stroke", "#444")
                .attr("stroke-linecap", "round")
                .attr("stroke-dasharray", d => TYPE_DASH[d.type])
                .attr("stroke-width", d => wScale(d.amount))
                .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x).attr("y2", d => d.target.y)
                .attr("opacity", 0)
                .call(e => e.transition().duration(600).attr("opacity", 0.75)),
            update => update
                .call(u => u.transition().duration(500)
                    .attr("stroke-width", d => wScale(d.amount))
                    .attr("stroke-dasharray", d => TYPE_DASH[d.type])),
            exit => exit.transition().duration(550).attr("opacity", 0).remove()
        );

    // Wide invisible hit-area so thin links stay easy to hover for a tooltip.
    linkGroup.selectAll("line.hit")
        .data(links, linkKey)
        .join(
            enter => enter.append("line")
                .attr("class", "hit")
                .attr("stroke", "transparent")
                .attr("stroke-width", 12)
                .attr("cursor", "pointer")
                .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x).attr("y2", d => d.target.y),
            update => update,
            exit => exit.remove()
        )
        .on("mouseover", (ev, d) => {
            tooltip.style("opacity", 1).html(
                `<strong>${d.source.name} ↔ ${d.target.name}</strong><br>` +
                `Type: ${d.type}<br>` +
                `Amount: $${Math.round(d.amount).toLocaleString()}<br>` +
                `Transactions: ${d.count}<br>` +
                `${d.date} (day ${d.day})`
            );
        })
        .on("mousemove", ev => {
            tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY + 10 + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    nodeSel.transition().duration(500)
        .attr("r", d => rScale(d.volume))
        .attr("fill-opacity", d => d.volume > 0 ? 1 : 0.35);

    // Label position (x fixed, y offset by the node's current radius) is the
    // only thing about a label that ever changes day to day.
    labelSel.transition().duration(500)
        .attr("y", d => d.y - rScale(d.volume || 0) - 6);

    const activeCompanies = new Set(links.flatMap(d => [d.source.id, d.target.id])).size;
    const totalValue = d3.sum(links, d => d.amount);

    d3.select("#current-day-label").text(`Day ${day}`);
    d3.select("#day-date-label").text(dayDateMap.get(day) || "");
    d3.select("#summary-stats").html(
        `Active companies: <strong>${activeCompanies}</strong> &nbsp;|&nbsp; ` +
        `Active links: <strong>${links.length}</strong> &nbsp;|&nbsp; ` +
        `Total transaction value: <strong>$${Math.round(totalValue).toLocaleString()}</strong>`
    );
    d3.select("#time-slider").property("value", day);
}

// ======================== Controls ========================

function play() {
    if (timer) return;
    timer = d3.interval(() => {
        showDay(currentDay);
        currentDay += 1;
        if (currentDay > 60) pause();
    }, 650);
}

function pause() {
    if (timer) { timer.stop(); timer = null; }
}

function reset() {
    pause();
    currentDay = 1;
    showDay(1);
}

function wireControls() {
    d3.select("#play-btn").on("click", play);
    d3.select("#pause-btn").on("click", pause);
    d3.select("#reset-btn").on("click", reset);
    d3.select("#time-slider").on("input", function() {
        pause();
        currentDay = +this.value;
        showDay(currentDay);
    });
}

// ======================== Legend ========================

function renderLegend() {
    const W = 230;
    const svg = d3.select("#network-legend-svg").attr("width", W);

    const TOP_PAD = 24, BOTTOM_PAD = 24, ITEM_H = 25, SECTION_GAP = 22;
    let y = TOP_PAD;

    function sectionHeading(text) {
        svg.append("text").attr("x", 10).attr("y", y)
           .attr("font-size", 14).attr("font-weight", "bold").attr("fill", "#111")
           .text(text);
        y += 11;
        svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", W - 10).attr("y2", y)
           .attr("stroke", "#ccc");
        y += 19;
    }
    function itemLabel(x, cy, text) {
        svg.append("text").attr("x", x).attr("y", cy)
           .attr("font-size", 12).attr("fill", "#222")
           .attr("dominant-baseline", "middle")
           .text(text);
    }

    // ---- 1. Sector ----
    sectionHeading("Sector");
    Object.entries(SECTOR_COLORS).forEach(([sector, color]) => {
        svg.append("circle").attr("cx", 19).attr("cy", y).attr("r", 7).attr("fill", color);
        itemLabel(34, y, sector);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 2. Region ----
    sectionHeading("Region (border)");
    [
        { region: "Asia",          lbl: "Asia"          },
        { region: "Europe",        lbl: "Europe"        },
        { region: "North America", lbl: "North America" }
    ].forEach(({ region, lbl }) => {
        const st = REGION_STYLE[region];
        svg.append("circle").attr("cx", 19).attr("cy", y).attr("r", 7)
           .attr("fill", "#ccc")
           .attr("stroke", st.color).attr("stroke-width", st.width)
           .attr("stroke-dasharray", st.dasharray);
        itemLabel(34, y, lbl);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 3. Current volume (size) ----
    sectionHeading("Current Volume");
    const sizeRefs = [{ v: 8000, lbl: "~$8K" }, { v: 40000, lbl: "~$40K" }, { v: 81000, lbl: "~$81K" }];
    // Circles are bottom-aligned at the baseline, so the baseline must clear
    // the largest circle's full diameter, not just a fixed offset, or its
    // top edge crosses up into the section heading above it.
    const maxRefR = d3.max(sizeRefs, d => rScale(d.v));
    const baseline = y + 2 * maxRefR + 4;
    let cx = 26;
    sizeRefs.forEach(({ v, lbl }) => {
            const r = rScale(v);
            svg.append("circle").attr("cx", cx).attr("cy", baseline - r).attr("r", r)
               .attr("fill", "#888");
            svg.append("text").attr("x", cx).attr("y", baseline + 15)
               .attr("text-anchor", "middle").attr("font-size", 9.5).attr("fill", "#444")
               .text(lbl);
            cx += 2 * r + 22;
        });
    y = baseline + 36;
    svg.append("text").attr("x", 10).attr("y", y)
       .attr("font-size", 10.5).attr("fill", "#777")
       .text("dimmed = inactive that day");
    y += ITEM_H; // keep the same rhythm as a normal item row before the gap
    y += SECTION_GAP;

    // ---- 4. Transaction type (line style) ----
    sectionHeading("Transaction Type");
    [
        { t: "services",   lbl: "Services (solid)"     },
        { t: "goods",      lbl: "Goods (dashed)"        },
        { t: "shipping",   lbl: "Shipping (dotted)"     },
        { t: "components", lbl: "Components (dash-dot)" },
        { t: "materials",  lbl: "Materials (long dash)" }
    ].forEach(({ t, lbl }) => {
        svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", 34).attr("y2", y)
           .attr("stroke", "#444").attr("stroke-width", 3)
           .attr("stroke-dasharray", TYPE_DASH[t]).attr("stroke-linecap", "round");
        itemLabel(40, y, lbl);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 5. Transaction amount (width) ----
    sectionHeading("Transaction Amount");
    const amtDomain = wScale.domain();
    [amtDomain[0], (amtDomain[0] + amtDomain[1]) / 2, amtDomain[1]].forEach(v => {
        svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", 34).attr("y2", y)
           .attr("stroke", "#666").attr("stroke-width", wScale(v))
           .attr("stroke-linecap", "round");
        itemLabel(40, y, `$${Math.round(v).toLocaleString()}`);
        y += ITEM_H;
    });
    y += BOTTOM_PAD;

    svg.attr("height", y);
}
