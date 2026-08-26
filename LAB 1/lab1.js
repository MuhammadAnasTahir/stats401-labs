const width = 700;
const height = 400;
const margin = { top: 20, right: 20, bottom: 60, left: 40 };

const svg = d3.select("#chart")
    .append("svg")
    .attr("width", width)
    .attr("height", height);

d3.csv("../data/students.csv", d => ({
    name: d.name,
    score: +d.score
})).then(data => {

    const xScale = d3.scaleBand()
        .domain(data.map(d => d.name))
        .range([margin.left, width - margin.right])
        .padding(0.3);

    const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([height - margin.bottom, margin.top]);

    svg.selectAll("rect")
        .data(data)
        .join("rect")
        .attr("class", "bar")
        .attr("x", d => xScale(d.name))
        .attr("y", d => yScale(d.score))
        .attr("width", xScale.bandwidth())
        .attr("height", d => yScale(0) - yScale(d.score));

    svg.selectAll(".label")
        .data(data)
        .join("text")
        .attr("class", "label")
        .attr("x", d => xScale(d.name) + xScale.bandwidth() / 2)
        .attr("y", height - margin.bottom + 20)
        .attr("text-anchor", "middle")
        .text(d => `${d.name}: ${d.score}`);

});
