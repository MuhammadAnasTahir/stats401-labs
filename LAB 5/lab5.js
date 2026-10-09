// ======================== Lab 5: Network Visualization ========================

const DISTRICT_COLORS = {
    Central: "#4e79a7",
    North:   "#f28e2b",
    South:   "#e15759",
    East:    "#76b7b2",
    West:    "#59a14f"
};

// Matrix cells still encode route type with color (not a line, so pattern doesn't apply there).
const ROUTE_COLORS = {
    Metro:   "#9467bd",
    Express: "#1f77b4",
    Shuttle: "#8c564b"
};

// Network links encode route type with line style instead of color, since color is already
// used for district on the nodes. Ranked by frequency: Express (17) > Shuttle (17, tied —
// broken by chain-backbone count 14 vs 13) > Metro (16).
const ROUTE_DASH = {
    Express: null,     // solid
    Shuttle: "9,5",     // dashed
    Metro:   "1,5"      // dotted (with round linecap)
};

function typeStroke(t) {
    if (t === "Terminal") return { color: "#1a1a1a", width: 3,   dasharray: null  };
    if (t === "Transfer") return { color: "#1a1a1a", width: 3,   dasharray: "4,3" };
    return                       { color: "#ccc",    width: 0.5, dasharray: null  };
}

const tooltip = d3.select("#tooltip");

// ======================== Load data ========================

Promise.all([
    d3.csv("../data/lab5_assignment_stations.csv", d => ({
        id:         d.id,
        name:       d.station_name,
        district:   d.district,
        passengers: +d.daily_passengers,
        type:       d.station_type
    })),
    d3.csv("../data/lab5_assignment_routes.csv", d => ({
        source: d.source,
        target: d.target,
        time:   +d.travel_time_min,
        route:  d.route_type
    }))
]).then(([nodes, links]) => {

    // Build these BEFORE forceLink replaces source/target strings with node objects
    const connectedPairs = new Set(
        links.flatMap(l => [
            `${l.source}-${l.target}`,
            `${l.target}-${l.source}`
        ])
    );

    // Mark isolated stations (no routes at all) so the layout can gently pull
    // them nearer the main cluster instead of letting repulsion fling them away.
    const connectedNodeIds = new Set(links.flatMap(l => [l.source, l.target]));
    nodes.forEach(d => { d.isolated = !connectedNodeIds.has(d.id); });

    const linkByPair = new Map();
    links.forEach(l => {
        const info = { time: l.time, route: l.route };
        linkByPair.set(`${l.source}-${l.target}`, info);
        linkByPair.set(`${l.target}-${l.source}`, info);
    });

    renderNetwork(nodes, links, connectedPairs);
    renderMatrix(nodes, linkByPair);
});

// ======================== Node-Link Diagram ========================

function renderNetwork(nodes, links, connectedPairs) {
    const W = 830, H = 600;

    const rScale = d3.scaleSqrt()
        .domain(d3.extent(nodes, d => d.passengers))
        .range([5, 18]);

    const wScale = d3.scaleLinear()
        .domain(d3.extent(links, d => d.time))
        .range([1.2, 5.5]);

    const svg = d3.select("#network-svg").attr("width", W).attr("height", H);
    const zoomLayer = svg.append("g").attr("class", "zoom-layer");

    // Links drawn first so nodes render on top
    const linkSel = zoomLayer.append("g")
        .selectAll("line").data(links).join("line")
        .attr("stroke",           "#444")
        .attr("stroke-width",     d => wScale(d.time))
        .attr("stroke-dasharray", d => ROUTE_DASH[d.route])
        .attr("stroke-opacity",   0.8)
        .attr("stroke-linecap",   "round");

    // Invisible wide hit-area so thin links are easy to hover for a tooltip
    const linkHitSel = zoomLayer.append("g")
        .selectAll("line").data(links).join("line")
        .attr("stroke", "transparent")
        .attr("stroke-width", 10)
        .attr("cursor", "pointer")
        .on("mouseover", (ev, d) => {
            tooltip.style("opacity", 1).html(
                `<strong>${d.source.name} ↔ ${d.target.name}</strong><br>` +
                `Route: ${d.route}<br>Travel time: ${d.time} min`
            );
        })
        .on("mousemove", ev => {
            tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY + 10 + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    // Nodes
    const nodeSel = zoomLayer.append("g")
        .selectAll("circle").data(nodes).join("circle")
        .attr("r",              d => rScale(d.passengers))
        .attr("fill",           d => DISTRICT_COLORS[d.district])
        .attr("stroke",         d => typeStroke(d.type).color)
        .attr("stroke-width",   d => typeStroke(d.type).width)
        .attr("stroke-dasharray", d => typeStroke(d.type).dasharray)
        .attr("cursor", "pointer");

    // Force simulation
    const simulation = d3.forceSimulation(nodes)
        .force("link",    d3.forceLink(links).id(d => d.id).distance(75))
        .force("charge",  d3.forceManyBody().strength(-300))
        .force("center",  d3.forceCenter(W / 2, H / 2))
        .force("collide", d3.forceCollide(d => rScale(d.passengers) + 2).strength(0.8))
        // Isolated stations have no link force pulling them in, so charge alone
        // would scatter them far from the main cluster — pull them gently inward.
        .force("isoX", d3.forceX(W / 2).strength(d => d.isolated ? 0.045 : 0))
        .force("isoY", d3.forceY(H / 2).strength(d => d.isolated ? 0.045 : 0))
        .on("tick", () => {
            linkSel
                .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
            linkHitSel
                .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
            nodeSel
                .attr("cx", d => d.x).attr("cy", d => d.y);
        });

    // Drag — container is the zoomed group so drag coords stay correct at any zoom level
    nodeSel.call(d3.drag()
        .container(zoomLayer.node())
        .on("start", (ev, d) => {
            ev.sourceEvent.stopPropagation(); // don't also trigger svg pan
            if (!ev.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
        })
        .on("drag",  (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end",   (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
        })
    );

    // Hover: highlight neighbors, dim others, show tooltip
    nodeSel
        .on("mouseover", function(ev, d) {
            nodeSel.attr("opacity", n =>
                n.id === d.id || connectedPairs.has(`${d.id}-${n.id}`) ? 1 : 0.12
            );
            linkSel.attr("opacity", l =>
                l.source.id === d.id || l.target.id === d.id ? 1 : 0.04
            );
            tooltip.style("opacity", 1).html(
                `<strong>${d.name}</strong><br>` +
                `District: ${d.district}<br>` +
                `Daily passengers: ${d.passengers.toLocaleString()}<br>` +
                `Station type: ${d.type}`
            );
        })
        .on("mousemove", ev => {
            tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY + 10 + "px");
        })
        .on("mouseout", () => {
            nodeSel.attr("opacity", 1);
            linkSel.attr("opacity", 0.8);
            tooltip.style("opacity", 0);
        });

    // Zoom: buttons only trigger it directly, but wheel/drag-pan on empty space also works
    // Buttons + drag-to-pan only; scroll/trackpad-pinch zooming is disabled.
    let fitTransform = d3.zoomIdentity;
    const zoom = d3.zoom()
        .scaleExtent([0.3, 6])
        .filter(ev => ev.type !== "wheel")
        .on("zoom", ev => zoomLayer.attr("transform", ev.transform));
    svg.call(zoom);

    // Once the simulation settles, fit the whole graph inside the viewport so there is
    // no empty margin — this becomes the new "reset" target instead of identity.
    simulation.on("end", () => {
        const radii = nodes.map(d => rScale(d.passengers));
        const minX = Math.min(...nodes.map((d, i) => d.x - radii[i]));
        const maxX = Math.max(...nodes.map((d, i) => d.x + radii[i]));
        const minY = Math.min(...nodes.map((d, i) => d.y - radii[i]));
        const maxY = Math.max(...nodes.map((d, i) => d.y + radii[i]));
        const bw = maxX - minX, bh = maxY - minY;
        const scale = Math.min(W / bw, H / bh) * 0.94;
        const tx = W / 2 - scale * (minX + maxX) / 2;
        const ty = H / 2 - scale * (minY + maxY) / 2;
        fitTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);
        svg.transition().duration(500).call(zoom.transform, fitTransform);
    });

    d3.select("#net-zoom-in").on("click", () =>
        svg.transition().duration(250).call(zoom.scaleBy, 1.4));
    d3.select("#net-zoom-out").on("click", () =>
        svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.4));
    d3.select("#net-zoom-reset").on("click", () =>
        svg.transition().duration(500).call(zoom.transform, fitTransform));

    renderNetworkLegend(rScale, wScale);
}

function renderNetworkLegend(rScale, wScale) {
    const W = 230;
    const svg = d3.select("#network-legend-svg").attr("width", W);

    // Shared rhythm so every section reads the same: fixed row height for
    // every item (circle, line, or swatch), fixed gap between sections, and
    // matching padding at the very top and bottom of the panel.
    const TOP_PAD      = 20;
    const BOTTOM_PAD    = 20;
    const ITEM_H       = 24;
    const SECTION_GAP  = 18;

    let y = TOP_PAD;

    function sectionHeading(text) {
        svg.append("text").attr("x", 10).attr("y", y)
           .attr("font-size", 13).attr("font-weight", "bold").attr("fill", "#222")
           .text(text);
        y += 10;
        svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", W - 10).attr("y2", y)
           .attr("stroke", "#ddd");
        y += 16;
    }
    function itemLabel(x, cy, text) {
        svg.append("text").attr("x", x).attr("y", cy)
           .attr("font-size", 11.5).attr("fill", "#333")
           .attr("dominant-baseline", "middle")
           .text(text);
    }

    // ---- 1. District ----
    sectionHeading("District");
    Object.entries(DISTRICT_COLORS).forEach(([dist, color]) => {
        svg.append("circle").attr("cx", 19).attr("cy", y).attr("r", 7).attr("fill", color);
        itemLabel(34, y, dist);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 2. Station Type (border) ----
    sectionHeading("Station Type");
    [
        { type: "Terminal", lbl: "Terminal — solid border"  },
        { type: "Transfer", lbl: "Transfer — dashed border" },
        { type: "Local",    lbl: "Local — no border"        }
    ].forEach(({ type, lbl }) => {
        const st = typeStroke(type);
        svg.append("circle").attr("cx", 19).attr("cy", y).attr("r", 7)
           .attr("fill", "#ccc")
           .attr("stroke", st.color).attr("stroke-width", st.width)
           .attr("stroke-dasharray", st.dasharray);
        itemLabel(34, y, lbl);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 3. Passengers/day (size) — circles on a shared baseline, reserved
    //         to occupy the same vertical space as two normal item rows ----
    sectionHeading("Daily Passengers");
    const sizeBlockH = ITEM_H * 2;
    const baseline = y + sizeBlockH - 18;
    let cx = 26;
    [{ v: 1500, lbl: "~1,500" }, { v: 5500, lbl: "~5,500" }, { v: 9500, lbl: "~9,500" }]
        .forEach(({ v, lbl }) => {
            const r = rScale(v);
            svg.append("circle").attr("cx", cx).attr("cy", baseline - r).attr("r", r)
               .attr("fill", "#999");
            svg.append("text").attr("x", cx).attr("y", baseline + 14)
               .attr("text-anchor", "middle").attr("font-size", 9.5).attr("fill", "#555")
               .text(lbl);
            cx += 2 * r + 24;
        });
    y += sizeBlockH;
    y += SECTION_GAP;

    // ---- 4. Route Type (line style) ----
    sectionHeading("Route Type");
    [
        { dash: ROUTE_DASH.Express, lbl: "Express — solid"  },
        { dash: ROUTE_DASH.Shuttle, lbl: "Shuttle — dashed" },
        { dash: ROUTE_DASH.Metro,   lbl: "Metro — dotted"   }
    ].forEach(({ dash, lbl }) => {
        svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", 34).attr("y2", y)
           .attr("stroke", "#444").attr("stroke-width", 3)
           .attr("stroke-dasharray", dash).attr("stroke-linecap", "round");
        itemLabel(40, y, lbl);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 5. Travel Time (line width) ----
    sectionHeading("Travel Time");
    [{ t: 2, lbl: "2 min" }, { t: 9, lbl: "9 min" }, { t: 16, lbl: "16 min" }]
        .forEach(({ t, lbl }) => {
            svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", 34).attr("y2", y)
               .attr("stroke", "#444").attr("stroke-width", wScale(t))
               .attr("stroke-linecap", "round");
            itemLabel(40, y, lbl);
            y += ITEM_H;
        });
    y += BOTTOM_PAD;

    svg.attr("height", y);
}

// ======================== Adjacency Matrix ========================

// Travel time -> interpolation fraction. A genuine white→color interpolation (used for
// both the cells and the legend below) reads far more clearly than low alpha fill-opacity,
// which barely differs from the page background at the low end of the range.
const timeFrac = d3.scaleLinear().domain([2, 16]).range([0.3, 1]);
function cellColor(route, time) {
    return d3.interpolateRgb("#ffffff", ROUTE_COLORS[route])(timeFrac(time));
}

function renderMatrix(nodes, linkByPair) {
    const districtOrder = ["Central", "North", "South", "East", "West"];

    const sortedNodes = [...nodes].sort((a, b) => {
        const da = districtOrder.indexOf(a.district);
        const db = districtOrder.indexOf(b.district);
        if (da !== db) return da - db;
        return +a.id.slice(1) - +b.id.slice(1);
    });

    const n        = sortedNodes.length;   // 50
    const cellSize = 14;
    const matW     = n * cellSize;         // 700
    const margin   = 85;                   // same white space on all 4 sides
    const svgW     = matW + margin * 2;
    const svgH     = matW + margin * 2;

    const svg = d3.select("#matrix-svg").attr("width", svgW).attr("height", svgH);
    const g   = svg.append("g").attr("transform", `translate(${margin},${margin})`);

    // Build all 50×50 cell records
    const cellData = [];
    sortedNodes.forEach((rowNode, ri) => {
        sortedNodes.forEach((colNode, ci) => {
            const link   = linkByPair.get(`${rowNode.id}-${colNode.id}`) || null;
            const isDiag = ri === ci;
            cellData.push({ ri, ci, rowNode, colNode, link, isDiag });
        });
    });

    // Draw cells
    g.selectAll("rect.cell")
        .data(cellData)
        .join("rect")
        .attr("class", "cell")
        .attr("x", d => d.ci * cellSize)
        .attr("y", d => d.ri * cellSize)
        .attr("width",  cellSize - 1)
        .attr("height", cellSize - 1)
        .attr("fill", d => {
            if (d.isDiag) return "#d0d0d0";
            if (!d.link)  return "#f0f0f0";
            return cellColor(d.link.route, d.link.time);
        })
        .attr("stroke", "#e5e5e5")
        .attr("stroke-width", 0.5)
        .on("mouseover", function(ev, d) {
            if (!d.link && !d.isDiag) return;
            tooltip.style("opacity", 1).html(
                d.isDiag
                    ? `<strong>${d.rowNode.name}</strong><br>` +
                      `${d.rowNode.district} · ${d.rowNode.type}<br>` +
                      `${d.rowNode.passengers.toLocaleString()} passengers/day`
                    : `<strong>${d.rowNode.name} ↔ ${d.colNode.name}</strong><br>` +
                      `Route: ${d.link.route}<br>Travel time: ${d.link.time} min`
            );
        })
        .on("mousemove", ev => {
            tooltip.style("left", ev.pageX + 14 + "px").style("top", ev.pageY + 10 + "px");
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    // District block dividers (after positions 10, 20, 30, 40)
    [10, 20, 30, 40].forEach(pos => {
        const px = pos * cellSize;
        g.append("line")
         .attr("x1", px).attr("y1", 0).attr("x2", px).attr("y2", matW)
         .attr("stroke", "#666").attr("stroke-width", 1.2);
        g.append("line")
         .attr("x1", 0).attr("y1", px).attr("x2", matW).attr("y2", px)
         .attr("stroke", "#666").attr("stroke-width", 1.2);
    });

    // Row labels (left), colored by district
    sortedNodes.forEach((node, i) => {
        g.append("text")
         .attr("x", -5)
         .attr("y", i * cellSize + cellSize / 2)
         .attr("text-anchor", "end")
         .attr("dominant-baseline", "middle")
         .attr("font-size", 9.5)
         .attr("fill", DISTRICT_COLORS[node.district])
         .text(node.id);
    });

    // Column labels (top, rotated −60°), colored by district
    sortedNodes.forEach((node, i) => {
        g.append("text")
         .attr("transform",
               `translate(${i * cellSize + cellSize / 2}, -5) rotate(-60)`)
         .attr("text-anchor", "start")
         .attr("font-size", 9.5)
         .attr("fill", DISTRICT_COLORS[node.district])
         .text(node.id);
    });

    // District group headers above column blocks — full names, bold
    districtOrder.forEach((dist, di) => {
        const centerX = (di * 10 + 4.5) * cellSize;
        g.append("text")
         .attr("x", centerX).attr("y", -margin + 22)
         .attr("text-anchor", "middle")
         .attr("font-size", 14).attr("font-weight", "bold")
         .attr("fill", DISTRICT_COLORS[dist])
         .text(dist);
    });

    // District group headers to the left of row blocks (rotated), full names, bold
    districtOrder.forEach((dist, di) => {
        const centerY = (di * 10 + 4.5) * cellSize;
        g.append("text")
         .attr("transform", `translate(${-(margin - 14)},${centerY}) rotate(-90)`)
         .attr("text-anchor", "middle")
         .attr("font-size", 14).attr("font-weight", "bold")
         .attr("fill", DISTRICT_COLORS[dist])
         .text(dist);
    });

    renderMatrixLegend();
}

function renderMatrixLegend() {
    const W = 200;
    const svg = d3.select("#matrix-legend-svg").attr("width", W);

    // Same rhythm as the network legend: fixed item row height, fixed gap
    // between sections, matching padding at the top and bottom of the panel.
    const TOP_PAD     = 20;
    const BOTTOM_PAD  = 20;
    const ITEM_H      = 24;
    const SECTION_GAP = 18;

    let y = TOP_PAD;

    function sectionHeading(text) {
        svg.append("text").attr("x", 10).attr("y", y)
           .attr("font-size", 13).attr("font-weight", "bold").attr("fill", "#222")
           .text(text);
        y += 10;
        svg.append("line").attr("x1", 10).attr("y1", y).attr("x2", W - 10).attr("y2", y)
           .attr("stroke", "#ddd");
        y += 16;
    }

    // ---- 1. Route Type (color) — one full-saturation swatch per route ----
    sectionHeading("Route Type");
    Object.keys(ROUTE_COLORS).forEach(route => {
        svg.append("rect").attr("x", 10).attr("y", y)
           .attr("width", 17).attr("height", 17)
           .attr("fill", cellColor(route, 16))
           .attr("stroke", "#bbb").attr("stroke-width", 0.5);
        svg.append("text").attr("x", 34).attr("y", y + 13)
           .attr("font-size", 11.5).attr("fill", "#333")
           .text(route);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 2. Travel Time (shade) — generic light→dark strip ----
    sectionHeading("Travel Time");
    svg.append("text").attr("x", 10).attr("y", y)
       .attr("font-size", 10).attr("fill", "#666")
       .text("darker = longer journey");
    y += ITEM_H;
    [{ t: 2, lbl: "2 min"  },
     { t: 9, lbl: "9 min"  },
     { t: 16, lbl: "16 min" }].forEach(({ t, lbl }) => {
        const shade = d3.interpolateRgb("#ffffff", "#444")(timeFrac(t));
        svg.append("rect").attr("x", 10).attr("y", y)
           .attr("width", 17).attr("height", 17)
           .attr("fill", shade).attr("stroke", "#bbb").attr("stroke-width", 0.5);
        svg.append("text").attr("x", 34).attr("y", y + 13)
           .attr("font-size", 11.5).attr("fill", "#333")
           .text(lbl);
        y += ITEM_H;
    });
    y += SECTION_GAP;

    // ---- 3. Reference cells ----
    sectionHeading("Other Cells");
    svg.append("rect").attr("x", 10).attr("y", y)
       .attr("width", 17).attr("height", 17)
       .attr("fill", "#f0f0f0").attr("stroke", "#bbb").attr("stroke-width", 0.5);
    svg.append("text").attr("x", 34).attr("y", y + 13)
       .attr("font-size", 11.5).attr("fill", "#333").text("No connection");
    y += ITEM_H;

    svg.append("rect").attr("x", 10).attr("y", y)
       .attr("width", 17).attr("height", 17).attr("fill", "#d0d0d0");
    svg.append("text").attr("x", 34).attr("y", y + 13)
       .attr("font-size", 11.5).attr("fill", "#333").text("Same station");
    y += ITEM_H;
    y += BOTTOM_PAD;

    svg.attr("height", y);
}
