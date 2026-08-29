const width = 330;
const height = 380;
const margin = { top: 30, right: 20, bottom: 50, left: 55 };
const legendPanelWidth = 130;

const tooltip = d3.select("#tooltip");

function showTooltip(event, d) {
    tooltip.style("opacity", 1).html(`
        <strong>${d.city}</strong><br>
        Population: ${d.population}M<br>
        Temp: ${d.temp_c}&deg;C<br>
        Development: ${d.development_level}<br>
        Region: ${d.region}
    `);
}
function moveTooltip(event) {
    tooltip.style("left", `${event.pageX + 10}px`).style("top", `${event.pageY + 10}px`);
}
function hideTooltip() {
    tooltip.style("opacity", 0);
}

function addAxes(svg, xScale, yScale, xLabel, yLabel) {
    svg.append("g")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(xScale));
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale));
    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 12)
        .attr("text-anchor", "middle")
        .text(xLabel);
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 16)
        .attr("text-anchor", "middle")
        .text(yLabel);
}

const legendItemHeight = 32;
const legendGroupGap = 55;

function addLegend(svg, x, y, title, items, drawSymbol) {
    const legend = svg.append("g").attr("transform", `translate(${x}, ${y})`);
    legend.append("text").attr("y", -10).attr("font-weight", "bold").text(title);
    const g = legend.selectAll("g").data(items).join("g")
        .attr("transform", (d, i) => `translate(0, ${i * legendItemHeight})`);
    drawSymbol(g);
    g.append("text").attr("x", 16).attr("y", 4).text(d => d);
}

d3.csv("../data/cities_multivariate.csv", d => ({
    city: d.city,
    population: +d.population,
    temp_c: +d.temp_c,
    development_level: d.development_level,
    region: d.region
})).then(data => {
    const regions = Array.from(new Set(data.map(d => d.region)));
    const devLevels = ["Low", "Medium", "High"];
    renderChart1(data, regions, devLevels);
    renderChart2(data, regions, devLevels);
});

// Visualization 1: population -> x, temp_c -> y, development_level -> size, region -> color
function renderChart1(data, regions, devLevels) {
    const xScale = d3.scaleLinear().domain(d3.extent(data, d => d.population)).nice()
        .range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().domain(d3.extent(data, d => d.temp_c)).nice()
        .range([height - margin.bottom, margin.top]);
    const sizeScale = d3.scaleOrdinal().domain(devLevels).range([6, 10, 14]);
    const colorScale = d3.scaleOrdinal().domain(regions).range(d3.schemeSet2);

    const wrap = d3.select("#chart1").append("div").attr("class", "chart1-wrap");

    const legendSvg = wrap.append("svg").attr("class", "legend-panel")
        .attr("width", legendPanelWidth).attr("height", height);

    addLegend(legendSvg, 18, margin.top, "Region", regions,
        g => g.append("circle").attr("r", 6).attr("fill", d => colorScale(d)));

    addLegend(legendSvg, 18, margin.top + regions.length * legendItemHeight + legendGroupGap, "Development", devLevels,
        g => g.append("circle").attr("r", d => sizeScale(d)).attr("fill", "#999"));

    const svg = wrap.append("svg").attr("width", width).attr("height", height);
    addAxes(svg, xScale, yScale, "Population (millions)", "Temperature (°C)");

    svg.selectAll("circle").data(data).join("circle")
        .attr("cx", d => xScale(d.population))
        .attr("cy", d => yScale(d.temp_c))
        .attr("r", d => sizeScale(d.development_level))
        .attr("fill", d => colorScale(d.region))
        .attr("stroke", "#333")
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);
}

// Visualization 2: development_level -> x, population -> bar height, temp_c -> color, region -> facet (grouping)
function renderChart2(data, regions, devLevels) {
    const facetWidth = 205;
    const facetHeight = 175;
    const fMargin = { top: 10, right: 8, bottom: 34, left: 42 };

    const yScale = d3.scaleLinear().domain([0, d3.max(data, d => d.population)]).nice()
        .range([facetHeight - fMargin.bottom, fMargin.top]);
    const x0 = d3.scaleBand().domain(devLevels)
        .range([fMargin.left, facetWidth - fMargin.right]).padding(0.3);
    const tempScale = d3.scaleSequential(d3.interpolateYlOrRd).domain(d3.extent(data, d => d.temp_c));

    const container = d3.select("#chart2");

    regions.forEach(region => {
        const cities = data.filter(d => d.region === region);

        const facet = container.append("div").attr("class", "facet");
        facet.append("div").attr("class", "facet-title").text(region);

        const svg = facet.append("svg").attr("width", facetWidth).attr("height", facetHeight);

        svg.append("g")
            .attr("transform", `translate(0, ${facetHeight - fMargin.bottom})`)
            .call(d3.axisBottom(x0));
        svg.append("g")
            .attr("transform", `translate(${fMargin.left}, 0)`)
            .call(d3.axisLeft(yScale).ticks(4));

        svg.append("text")
            .attr("class", "facet-axis-label")
            .attr("x", (fMargin.left + facetWidth - fMargin.right) / 2)
            .attr("y", facetHeight - 4)
            .attr("text-anchor", "middle")
            .text("Development Level");

        svg.append("text")
            .attr("class", "facet-axis-label")
            .attr("transform", "rotate(-90)")
            .attr("x", -facetHeight / 2)
            .attr("y", 11)
            .attr("text-anchor", "middle")
            .text("Population (M)");

        devLevels.forEach(level => {
            const group = cities.filter(d => d.development_level === level);
            const x1 = d3.scaleBand().domain(group.map(d => d.city))
                .range([x0(level), x0(level) + x0.bandwidth()]).padding(0.15);

            svg.selectAll(null).data(group).join("rect")
                .attr("x", d => x1(d.city))
                .attr("y", d => yScale(d.population))
                .attr("width", x1.bandwidth())
                .attr("height", d => yScale(0) - yScale(d.population))
                .attr("fill", d => tempScale(d.temp_c))
                .attr("stroke", "#333")
                .attr("stroke-width", 0.5)
                .on("mouseover", showTooltip)
                .on("mousemove", moveTooltip)
                .on("mouseout", hideTooltip);
        });
    });

    addGradientLegend(container, tempScale);
}

function addGradientLegend(container, colorScale) {
    const w = 160;
    const h = 14;
    const [min, max] = colorScale.domain();

    const wrap = container.append("div").attr("class", "gradient-legend");
    wrap.append("div").attr("class", "legend-title").text("Temperature (°C)");

    const svg = wrap.append("svg").attr("width", w).attr("height", h + 16);
    const gradient = svg.append("defs").append("linearGradient").attr("id", "temp-gradient");
    d3.range(0, 1.01, 0.1).forEach(t => {
        gradient.append("stop").attr("offset", `${t * 100}%`).attr("stop-color", colorScale(min + t * (max - min)));
    });

    svg.append("rect").attr("width", w).attr("height", h).attr("fill", "url(#temp-gradient)");
    svg.append("text").attr("x", 0).attr("y", h + 14).text(min.toFixed(1));
    svg.append("text").attr("x", w).attr("y", h + 14).attr("text-anchor", "end").text(max.toFixed(1));
}
