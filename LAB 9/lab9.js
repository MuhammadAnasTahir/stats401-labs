// ===================== Setup =====================

const WIDTH = 900, HEIGHT = 480;

const tooltip = d3.select("#tooltip");

function formatGDP(v) {
    if (v == null) return "No data";
    if (v >= 1000) return "$" + (v / 1000).toFixed(2) + "T";
    return "$" + v.toFixed(1) + "B";
}

// Zoom via drag-to-pan + explicit +/-/reset buttons only. Wheel/trackpad-pinch
// zooming is disabled on purpose -- it was too sensitive/twitchy for this map.
function setupZoom(svg, zoomLayer, targetName) {
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .filter((event) => event.type !== "wheel")
        .on("zoom", (event) => {
            zoomLayer.attr("transform", event.transform);
        });
    svg.call(zoom);

    d3.selectAll(`.zoom-btn[data-target="${targetName}"]`).on("click", function () {
        const action = this.getAttribute("data-action");
        if (action === "in") {
            svg.transition().duration(300).call(zoom.scaleBy, 1.4);
        } else if (action === "out") {
            svg.transition().duration(300).call(zoom.scaleBy, 1 / 1.4);
        } else {
            svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity);
        }
    });

    return zoom;
}

// Shared highlight state: hovering a country in either map highlights the
// same iso3 in both (Part D: coordinated / linked highlighting).
function setHighlight(iso3) {
    // "-99" is a shared placeholder for ~20 disputed/non-dataset territories
    // (see Section 1) -- never treat it as a real match.
    const active = iso3 && iso3 !== "-99";
    d3.selectAll(".country, .cartogram-circle")
        .classed("highlighted", (d) => active && d.iso3 === iso3);
}

// ===================== Load data =====================

Promise.all([
    d3.json("../data/world.geojson"),
    d3.csv("../data/lab9_gdp_2025_top50.csv", (d) => ({
        iso3: d.iso3,
        country: d.country,
        gdp: +d.gdp_2025_billion_usd,
        rank: +d.rank,
    })),
]).then(([geoData, gdpRows]) => {
    const gdpByIso3 = new Map(gdpRows.map((d) => [d.iso3, d]));

    geoData.features.forEach((f) => {
        const match = gdpByIso3.get(f.properties.iso3);
        f.properties.gdp = match ? match.gdp : null;
        f.properties.rank = match ? match.rank : null;
        f.properties.country = match ? match.country : f.properties.name;
    });

    const gdpExtent = d3.extent(gdpRows, (d) => d.gdp);
    const colorScale = d3.scaleSequentialLog(d3.interpolateYlGnBu).domain(gdpExtent);

    renderChoropleth(geoData, colorScale, gdpExtent);
    renderCartogram(geoData, gdpRows, colorScale, gdpExtent);
});

// ===================== 2. Choropleth =====================

function renderChoropleth(geoData, colorScale, gdpExtent) {
    const svg = d3.select("#choropleth-svg").attr("width", WIDTH).attr("height", HEIGHT);

    const projection = d3.geoNaturalEarth1().fitSize([WIDTH, HEIGHT], geoData);
    const path = d3.geoPath().projection(projection);

    const zoomLayer = svg.append("g").attr("class", "zoom-layer");

    zoomLayer.selectAll("path.country")
        .data(geoData.features, (d) => d.properties.iso3)
        .join("path")
        .attr("class", (d) => "country" + (d.properties.gdp == null ? " no-data" : ""))
        .attr("d", path)
        .datum((d) => ({ iso3: d.properties.iso3, name: d.properties.country, gdp: d.properties.gdp, rank: d.properties.rank }))
        .attr("fill", (d) => (d.gdp == null ? null : colorScale(d.gdp)))
        .on("mouseover", function (event, d) {
            setHighlight(d.iso3);
            tooltip.style("opacity", 1).html(
                `<strong>${d.name}</strong><br>GDP: ${formatGDP(d.gdp)}` +
                (d.rank ? `<br>Rank: #${d.rank} of 50` : "<br>Not in top 50 dataset")
            );
        })
        .on("mousemove", (event) => {
            tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY + 10 + "px");
        })
        .on("mouseout", function () {
            setHighlight(null);
            tooltip.style("opacity", 0);
        });

    setupZoom(svg, zoomLayer, "choropleth");

    renderChoroplethLegend(colorScale, gdpExtent);
}

function renderChoroplethLegend(colorScale, gdpExtent) {
    const width = 440, barW = 300, barH = 16, height = 72;
    const svg = d3.select("#choropleth-legend").append("svg").attr("width", width).attr("height", height);

    const defs = svg.append("defs");
    const gradId = "choropleth-gradient";
    const gradient = defs.append("linearGradient").attr("id", gradId)
        .attr("x1", "0%").attr("x2", "100%").attr("y1", "0%").attr("y2", "0%");
    d3.range(0, 1.0001, 0.05).forEach((t) => {
        const logVal = Math.exp(Math.log(gdpExtent[0]) + t * (Math.log(gdpExtent[1]) - Math.log(gdpExtent[0])));
        gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(logVal));
    });

    const gx = (width - barW) / 2;
    svg.append("rect").attr("x", gx).attr("y", 14).attr("width", barW).attr("height", barH)
        .attr("fill", `url(#${gradId})`).attr("stroke", "#999");

    const legendScale = d3.scaleLog().domain(gdpExtent).range([gx, gx + barW]);
    const tickVals = [300, 1000, 3000, 10000, 30000].filter((v) => v >= gdpExtent[0] && v <= gdpExtent[1] * 1.01);

    svg.append("g").attr("transform", `translate(0,${14 + barH})`)
        .call(d3.axisBottom(legendScale).tickValues(tickVals).tickFormat((d) => formatGDP(d)))
        .attr("font-size", 12);

    svg.append("text").attr("x", width / 2).attr("y", height - 2)
        .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#444")
        .text("2025 GDP (log scale, billions USD)");

    d3.select("#choropleth-legend").append("div").attr("class", "no-data-swatch")
        .html('<span class="swatch"></span> No data in top-50 dataset');
}

// ===================== 3. Cartogram (Dorling) =====================

function renderCartogram(geoData, gdpRows, colorScale, gdpExtent) {
    const svg = d3.select("#cartogram-svg").attr("width", WIDTH).attr("height", HEIGHT);
    const zoomLayer = svg.append("g").attr("class", "zoom-layer");

    const projection = d3.geoNaturalEarth1().fitSize([WIDTH, HEIGHT], geoData);
    const rScale = d3.scaleSqrt().domain(gdpExtent).range([5, 55]);

    const byIso3 = new Map(geoData.features.map((f) => [f.properties.iso3, f]));

    const nodes = gdpRows.map((d) => {
        const feature = byIso3.get(d.iso3);
        const centroid = feature ? projection(d3.geoCentroid(feature)) : [WIDTH / 2, HEIGHT / 2];
        return {
            iso3: d.iso3,
            name: d.country,
            gdp: d.gdp,
            rank: d.rank,
            r: rScale(d.gdp),
            targetX: centroid[0],
            targetY: centroid[1],
            x: centroid[0],
            y: centroid[1],
        };
    });

    const circles = zoomLayer.selectAll("circle.cartogram-circle")
        .data(nodes, (d) => d.iso3)
        .join("circle")
        .attr("class", "cartogram-circle")
        .attr("r", (d) => d.r)
        .attr("fill", (d) => colorScale(d.gdp))
        .on("mouseover", function (event, d) {
            setHighlight(d.iso3);
            tooltip.style("opacity", 1).html(
                `<strong>${d.name}</strong><br>GDP: ${formatGDP(d.gdp)}<br>Rank: #${d.rank} of 50`
            );
        })
        .on("mousemove", (event) => {
            tooltip.style("left", event.pageX + 14 + "px").style("top", event.pageY + 10 + "px");
        })
        .on("mouseout", function () {
            setHighlight(null);
            tooltip.style("opacity", 0);
        });

    const labels = zoomLayer.selectAll("text.cartogram-label")
        .data(nodes.filter((d) => d.r >= 14), (d) => d.iso3)
        .join("text")
        .attr("class", "cartogram-label")
        .text((d) => d.iso3);

    const simulation = d3.forceSimulation(nodes)
        .force("x", d3.forceX((d) => d.targetX).strength(0.12))
        .force("y", d3.forceY((d) => d.targetY).strength(0.12))
        .force("collide", d3.forceCollide((d) => d.r + 1).strength(0.9).iterations(3))
        .on("tick", () => {
            circles.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
            labels.attr("x", (d) => d.x).attr("y", (d) => d.y + 3);
        });

    setupZoom(svg, zoomLayer, "cartogram");

    renderCartogramLegend(rScale);
}

function renderCartogramLegend(rScale) {
    const refValues = [300, 3000, 30000];
    const radii = refValues.map((v) => rScale(v));
    const maxR = Math.max(...radii);

    // Lay out every dimension from maxR so the largest circle can never be
    // clipped, however big rScale's range turns out to be.
    const titleY = 18;
    const circlesTop = titleY + 16;
    const baselineY = circlesTop + 2 * maxR;
    const labelY = baselineY + 22;
    const height = labelY + 8;

    const spacing = maxR * 2 + 50;
    const sideMargin = maxR + 30;
    const width = sideMargin * 2 + spacing * (refValues.length - 1);

    const svg = d3.select("#cartogram-legend").append("svg").attr("width", width).attr("height", height);

    svg.append("text").attr("x", width / 2).attr("y", titleY)
        .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#444")
        .text("Circle area represents 2025 GDP (reference sizes)");

    refValues.forEach((v, i) => {
        const r = radii[i];
        const cx = sideMargin + spacing * i;
        svg.append("circle").attr("cx", cx).attr("cy", baselineY - r).attr("r", r)
            .attr("fill", "none").attr("stroke", "#2a5d84").attr("stroke-width", 1.5);
        svg.append("text").attr("x", cx).attr("y", labelY)
            .attr("text-anchor", "middle").attr("font-size", 13).attr("fill", "#333")
            .text(formatGDP(v));
    });
}
