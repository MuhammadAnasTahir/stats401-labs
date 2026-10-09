// ======================== Lab 6: GDP Hierarchy Treemaps ========================

const STATUS_COLORS = {
    Increase:  "#4daf4a",
    Unchanged: "#999999",
    Decrease:  "#e41a1c"
};

const tooltip = d3.select("#tooltip");

d3.json("../data/lab6_gdp_hierarchy.json").then(data => {
    renderTreemap(data, "#treemap1-svg", "#treemap1-legend-svg", d3.treemapSquarify);
    renderTreemap(data, "#treemap2-svg", "#treemap2-legend-svg", d3.treemapBinary);
});

// Shrinks a text element until it fits inside maxWidth, adding an ellipsis.
// Hides the label entirely if even one character plus ellipsis does not fit.
function fitText(selection, maxWidth) {
    selection.each(function() {
        const node = d3.select(this);
        const full = node.text();
        if (maxWidth < 10) { node.text(""); return; }
        if (node.node().getComputedTextLength() <= maxWidth) return;
        let text = full;
        while (text.length > 0 && node.node().getComputedTextLength() > maxWidth) {
            text = text.slice(0, -1);
            node.text(text + "…");
        }
        if (text.length === 0) node.text("");
    });
}

function renderTreemapLegend(selector) {
    const W = 170;
    const svg = d3.select(selector).attr("width", W);

    const TOP_PAD = 20, ITEM_H = 26;
    let y = TOP_PAD;

    svg.append("text").attr("x", 10).attr("y", y)
       .attr("font-size", 13).attr("font-weight", "bold").attr("fill", "#222")
       .text("GDP Status");
    y += 10;
    svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", W - 10).attr("y2", y)
       .attr("stroke", "#ddd");
    y += 18;

    Object.entries(STATUS_COLORS).forEach(([status, color]) => {
        svg.append("rect").attr("x", 10).attr("y", y - 10)
           .attr("width", 15).attr("height", 15)
           .attr("fill", color);
        svg.append("text").attr("x", 32).attr("y", y)
           .attr("font-size", 11.5).attr("fill", "#333")
           .attr("dominant-baseline", "middle")
           .text(status);
        y += ITEM_H;
    });
    y += 6;

    svg.attr("height", y);
}

// A fixed header reservation (for the continent/area name label) can exceed
// the actual size of a small box, which silently collapses that box to zero
// size and makes the country disappear. This is binary rather than graded:
// a box either has enough room for a clean header label and gets the full
// reservation, or it does not and gets almost none, so there is never a
// partial reservation that is too small for the label but still eats into
// the child country's space and causes the two labels to overlap. The
// CONTINENT_MIN_H / AREA_MIN_H thresholds below must match the height
// checks used when deciding whether to draw each label (see renderTreemap).
const CONTINENT_MIN_H = 40, CONTINENT_PAD = 17;
const AREA_MIN_H = 28, AREA_PAD = 13;

function adaptiveTopPad(d) {
    if (d.depth === 0) return 0;
    const h = d.y1 - d.y0;
    if (d.depth === 1) return h > CONTINENT_MIN_H ? CONTINENT_PAD : 1;
    if (d.depth === 2) return h > AREA_MIN_H ? AREA_PAD : 1;
    return 1;
}

function renderTreemap(data, svgSelector, legendSelector, tileMethod) {
    const W = 900, H = 560;

    renderTreemapLegend(legendSelector);

    // GDP spans 120 to 27,800 (about 230 to 1). A linear area encoding makes the
    // smallest regions a few pixels wide, too small to color or label. Using the
    // square root of GDP compresses that range while keeping the same ordering,
    // so every leaf stays visible. Tooltips still report the true GDP value.
    const root = d3.hierarchy(data)
        .sum(d => Math.sqrt(d.gdp || 0))
        .sort((a, b) => b.value - a.value);

    d3.treemap()
        .tile(tileMethod)
        .size([W, H])
        .paddingOuter(2)
        .paddingTop(adaptiveTopPad)
        .paddingInner(1)
        (root);

    const svg = d3.select(svgSelector).attr("width", W).attr("height", H);

    // ---- Country leaves (depth 3) — drawn first, borders drawn on top ----
    const leaves = root.leaves();
    const cell = svg.selectAll("g.leaf")
        .data(leaves)
        .join("g")
        .attr("class", "leaf")
        .attr("transform", d => `translate(${d.x0},${d.y0})`);

    cell.append("rect")
        .attr("width",  d => Math.max(0, d.x1 - d.x0))
        .attr("height", d => Math.max(0, d.y1 - d.y0))
        .attr("fill", d => STATUS_COLORS[d.data.status])
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .attr("cursor", "pointer")
        .on("mouseover", function(ev, d) {
            tooltip.style("opacity", 1).html(
                `<strong>${d.data.name}</strong><br>` +
                `Continent: ${d.parent.parent.data.name}<br>` +
                `Area: ${d.parent.data.name}<br>` +
                `GDP: $${d.data.gdp.toLocaleString()}B<br>` +
                `Status: ${d.data.status}`
            );
        })
        .on("mousemove", ev => {
            tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY + 10 + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    const leafLabels = cell.append("text")
        .attr("x", 4).attr("y", 14)
        .attr("font-size", 11).attr("font-weight", 500).attr("fill", "#fff")
        .attr("paint-order", "stroke")
        .attr("stroke", "rgba(0,0,0,0.45)").attr("stroke-width", 2.5)
        .attr("pointer-events", "none")
        .text(d => d.data.name);

    leafLabels.each(function(d) {
        const w = d.x1 - d.x0, h = d.y1 - d.y0;
        if (h < 16) { d3.select(this).text(""); return; }
        fitText(d3.select(this), w - 7);
    });

    // ---- Area containers (depth 2) — outline only, no fill ----
    const areaNodes = root.descendants().filter(d => d.depth === 2);
    svg.selectAll("rect.area-box")
        .data(areaNodes)
        .join("rect")
        .attr("class", "area-box")
        .attr("x", d => d.x0).attr("y", d => d.y0)
        .attr("width",  d => d.x1 - d.x0)
        .attr("height", d => d.y1 - d.y0)
        .attr("fill", "none")
        .attr("stroke", "#8a8a8a")
        .attr("stroke-width", 1.2);

    const areaLabels = svg.selectAll("text.area-label")
        .data(areaNodes)
        .join("text")
        .attr("class", "area-label")
        .attr("x", d => d.x0 + 4)
        .attr("y", d => d.y0 + 11)
        .attr("font-size", 10.5).attr("font-weight", 600).attr("fill", "#333")
        .text(d => d.data.name);

    areaLabels.each(function(d) {
        if (d.y1 - d.y0 <= AREA_MIN_H) { d3.select(this).text(""); return; }
        fitText(d3.select(this), (d.x1 - d.x0) - 7);
    });

    // ---- Continent containers (depth 1) — bold outline, no fill ----
    const continentNodes = root.descendants().filter(d => d.depth === 1);
    svg.selectAll("rect.continent-box")
        .data(continentNodes)
        .join("rect")
        .attr("class", "continent-box")
        .attr("x", d => d.x0).attr("y", d => d.y0)
        .attr("width",  d => d.x1 - d.x0)
        .attr("height", d => d.y1 - d.y0)
        .attr("fill", "none")
        .attr("stroke", "#222")
        .attr("stroke-width", 2);

    const continentLabels = svg.selectAll("text.continent-label")
        .data(continentNodes)
        .join("text")
        .attr("class", "continent-label")
        .attr("x", d => d.x0 + 5)
        .attr("y", d => d.y0 + 14)
        .attr("font-size", 13).attr("font-weight", "bold").attr("fill", "#111")
        .text(d => d.data.name);

    continentLabels.each(function(d) {
        if (d.y1 - d.y0 <= CONTINENT_MIN_H) { d3.select(this).text(""); return; }
        fitText(d3.select(this), (d.x1 - d.x0) - 8);
    });
}
