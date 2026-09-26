// Loads the snapshot, holds shared state, and coordinates the linked views.

const state = {
    sector: null,       // null = level 1 (all sectors); otherwise drilled into this sector
    weight: "cap",      // "cap" | "equal"
    palette: "finance", // "finance" | "colorblind"
    hover: null         // hovered sector at level 1
};

let companies = [];
let sectorBars;

// Three S&P 500 companies trade as two share classes each (Alphabet as
// GOOGL/GOOG, Fox Corporation as FOXA/FOX, News Corp as NWSA/NWS), so the raw
// snapshot has more rows than companies. Merging each pair into one row here,
// once, keeps every count on the page (tile count, breadth tally, compare
// dropdown) consistent with each other without touching how any view renders.
const DUAL_CLASS = [
    { primary: "GOOGL", secondary: "GOOG", name: "Alphabet Inc." },
    { primary: "FOXA", secondary: "FOX", name: "Fox Corporation" },
    { primary: "NWSA", secondary: "NWS", name: "News Corp" }
];

function mergeDualClassShares(rows) {
    const byTicker = new Map(rows.map(d => [d.ticker, d]));
    const consumed = new Set();
    const merged = [];

    DUAL_CLASS.forEach(({ primary, secondary, name }) => {
        const a = byTicker.get(primary), b = byTicker.get(secondary);
        if (!a || !b) return; // one of the classes is missing from this snapshot
        consumed.add(primary).add(secondary);
        const marketCap = a.marketCap + b.marketCap;
        merged.push({
            ticker: primary,
            name,
            sector: a.sector,
            marketCap,
            price: a.price,
            priceChange: a.priceChange,
            // cap-weighted blend, since the two classes can move by different amounts
            changePercent: Math.round(
                (a.changePercent * a.marketCap + b.changePercent * b.marketCap) / marketCap * 100
            ) / 100,
            classes: [a, b]
        });
    });

    return merged.concat(rows.filter(d => !consumed.has(d.ticker)));
}

d3.json("data/sp500_snapshot.json")
    .then(data => {
        companies = mergeDualClassShares(data.companies);
        Treemap.init("#treemap");
        sectorBars = makeBars("#bars-axis", "#bars-body");
        Compare.init(companies);
        setupControls();
        update();
    })
    .catch(err => {
        console.error(err);
        d3.select("#viz-app").html(
            `<p style="color:#b03a2e">Could not draw the visualization (${err.message}).</p>`);
    });

// ---------- aggregation ----------

function sectorStats(rows) {
    return d3.rollups(rows, v => {
        const cap = d3.sum(v, d => d.marketCap);
        const capW = d3.sum(v, d => d.changePercent * d.marketCap) / cap;
        const eqW = d3.mean(v, d => d.changePercent);
        return {
            cap, capW, eqW,
            value: state.weight === "cap" ? capW : eqW,
            n: v.length,
            up: v.filter(d => d.changePercent > 0).length,
            down: v.filter(d => d.changePercent < 0).length
        };
    }, d => d.sector)
        .map(([sector, s]) => ({ sector, ...s }));
}

// ---------- render ----------

function update() {
    const sectors = sectorStats(companies).sort((a, b) => b.value - a.value);
    const sectorMap = new Map(sectors.map(s => [s.sector, s]));
    const inView = state.sector ? companies.filter(d => d.sector === state.sector) : companies;

    Treemap.render(inView, sectorMap, { hover: onHover, select: drillTo });

    if (state.sector) {
        const rows = inView.slice()
            .sort((a, b) => b.changePercent - a.changePercent)
            .map(d => ({
                key: d.ticker,
                label: `${d.ticker}  ${d.name.length > 14 ? d.name.slice(0, 13) + "…" : d.name}`,
                value: d.changePercent,
                cap: d.marketCap,
                tip: companyTip(d)
            }));
        sectorBars.render(rows, { rowH: 20 });
        d3.select("#bars-title").text(`Ranked Daily Change — ${state.sector}`);
        d3.select("#treemap-title").text(`Market Cap — ${state.sector}`);
    } else {
        const rows = sectors.map(s => ({
            key: s.sector,
            label: s.sector,
            value: s.value,
            tip: sectorTip(s)
        }));
        sectorBars.render(rows, { rowH: 40, onHover: onHover, onClick: drillTo });
        const w = state.weight === "cap" ? "Cap-Weighted" : "Equal-Weighted";
        d3.select("#bars-title").text(`Ranked Daily Change by Sector (${w})`);
        d3.select("#treemap-title").text("Market Cap by Sector");
    }

    d3.select("#bars-body").classed("no-scroll", !state.sector).property("scrollTop", 0);
    renderCrumb();
    renderBreadth(inView);
}

function renderCrumb() {
    const c = d3.select("#crumb").html("");
    if (!state.sector) {
        c.append("span").html("<b>S&amp;P 500</b> · all 11 sectors");
        return;
    }
    c.append("a").text("S&P 500").on("click", () => drillTo(null));
    c.append("span").html(` / <b>${state.sector}</b>`);
}

function renderBreadth(rows) {
    const up = rows.filter(d => d.changePercent > 0).length;
    const down = rows.filter(d => d.changePercent < 0).length;
    const flat = rows.length - up - down;
    const scope = state.sector || "S&P 500";

    const segs = [
        { n: up, label: `▲ ${up} up`, bg: Color.up() },
        { n: flat, label: flat ? `${flat}` : "", bg: "#ccc" },
        { n: down, label: `▼ ${down} down`, bg: Color.down() }
    ];
    d3.select("#breadth-bar").selectAll("div")
        .data(segs)
        .join("div")
        .style("flex", d => `${d.n} 0 0`)
        .style("background", d => d.bg)
        .style("color", d => d.bg === "#ccc" ? "#333" : "#fff")
        .text(d => d.n ? d.label : "");

    d3.select("#breadth-text").html(
        `<b>${scope}:</b> ${up} advancers, ${down} decliners` +
        (flat ? `, ${flat} unchanged` : "") + ` (${rows.length} companies)`);

    const cap = d3.sum(rows, d => d.marketCap);
    const capW = d3.sum(rows, d => d.changePercent * d.marketCap) / cap;
    const eqW = d3.mean(rows, d => d.changePercent);
    d3.select("#index-move").html(
        `Cap-weighted: <b>${fmtPct(capW)}</b> · Equal-weighted: <b>${fmtPct(eqW)}</b>`);
}

function renderLegend() {
    const W = 320, H = 38, x0 = 24, x1 = W - 24;
    const x = d3.scaleLinear().domain([-Color.LIMIT, Color.LIMIT]).range([x0, x1]);
    const svg = d3.select("#legend-svg").attr("viewBox", `0 0 ${W} ${H}`)
        .style("max-width", W + "px");
    svg.selectAll("*").remove();

    const grad = svg.append("defs").append("linearGradient").attr("id", "legend-grad");
    d3.range(0, 1.001, 0.1).forEach(t => {
        grad.append("stop").attr("offset", t)
            .attr("stop-color", Color.fill(-Color.LIMIT + t * 2 * Color.LIMIT));
    });
    svg.append("rect").attr("x", x0).attr("y", 2).attr("width", x1 - x0).attr("height", 12)
        .attr("fill", "url(#legend-grad)").attr("stroke", "#bbb");
    svg.append("g").attr("class", "axis").attr("transform", "translate(0,14)")
        .call(d3.axisBottom(x).tickValues([-3, -2, -1, 0, 1, 2, 3])
            .tickFormat(d => (d === -3 ? "≤" : d === 3 ? "≥" : "") + (d > 0 ? "+" : "") + d + "%"))
        .call(g => g.select(".domain").remove());
}

// ---------- interaction ----------

function onHover(sector) {
    if (state.sector) return;
    state.hover = sector;
    Treemap.highlight(sector);
    sectorBars.highlight(sector);
}

function drillTo(sector) {
    state.sector = sector;
    state.hover = null;
    Tip.hide();
    update();
}

function setupControls() {
    d3.selectAll("#weight-toggle button").on("click", function () {
        state.weight = this.dataset.value;
        d3.selectAll("#weight-toggle button").classed("active", function () {
            return this.dataset.value === state.weight;
        });
        update();
    });

    d3.selectAll("#palette-toggle button").on("click", function () {
        state.palette = this.dataset.value;
        Color.set(state.palette);
        d3.selectAll("#palette-toggle button").classed("active", function () {
            return this.dataset.value === state.palette;
        });
        renderLegend();
        update();
        Compare.recolor();
    });

    renderLegend();
}
