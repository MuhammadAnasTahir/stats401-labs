const width = 460;
const height = 380;
const margin = { top: 30, right: 120, bottom: 50, left: 60 };

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

function addLegend(svg, x, y, title, items, drawSymbol) {
    const legend = svg.append("g").attr("transform", `translate(${x}, ${y})`);
    legend.append("text").attr("y", -8).attr("font-weight", "bold").text(title);
    const g = legend.selectAll("g").data(items).join("g")
        .attr("transform", (d, i) => `translate(0, ${i * 20})`);
    drawSymbol(g);
    g.append("text").attr("x", 14).attr("y", 4).text(d => d);
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

    const svg = d3.select("#chart1").append("svg").attr("width", width).attr("height", height);
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

    addLegend(svg, width - margin.right + 20, margin.top, "Region", regions,
        g => g.append("circle").attr("r", 6).attr("fill", d => colorScale(d)));

    addLegend(svg, width - margin.right + 20, margin.top + regions.length * 20 + 30, "Development", devLevels,
        g => g.append("circle").attr("r", d => sizeScale(d)).attr("fill", "#999"));
}

// Visualization 2: temp_c -> x, population -> y, development_level -> color, region -> shape
function renderChart2(data, regions, devLevels) {
    const xScale = d3.scaleLinear().domain(d3.extent(data, d => d.temp_c)).nice()
        .range([margin.left, width - margin.right]);
    const yScale = d3.scaleLinear().domain(d3.extent(data, d => d.population)).nice()
        .range([height - margin.bottom, margin.top]);
    const colorScale = d3.scaleOrdinal().domain(devLevels).range(["#c6dbef", "#4292c6", "#08306b"]);
    const shapeScale = d3.scaleOrdinal().domain(regions)
        .range([d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle, d3.symbolDiamond]);
    const symbol = d3.symbol().size(100);

    const svg = d3.select("#chart2").append("svg").attr("width", width).attr("height", height);
    addAxes(svg, xScale, yScale, "Temperature (°C)", "Population (millions)");

    svg.selectAll("path.point").data(data).join("path")
        .attr("class", "point")
        .attr("d", d => symbol.type(shapeScale(d.region))())
        .attr("transform", d => `translate(${xScale(d.temp_c)}, ${yScale(d.population)})`)
        .attr("fill", d => colorScale(d.development_level))
        .attr("stroke", "#333")
        .on("mouseover", showTooltip)
        .on("mousemove", moveTooltip)
        .on("mouseout", hideTooltip);

    addLegend(svg, width - margin.right + 20, margin.top, "Development", devLevels,
        g => g.append("circle").attr("r", 6).attr("fill", d => colorScale(d)));

    addLegend(svg, width - margin.right + 20, margin.top + devLevels.length * 20 + 30, "Region", regions,
        g => g.append("path").attr("transform", "translate(6,0)")
            .attr("d", d => symbol.type(shapeScale(d))()).attr("fill", "#999"));
}
