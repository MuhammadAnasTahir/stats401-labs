const width = 600;
const height = 400;
const margin = { top: 30, right: 150, bottom: 50, left: 60 };

const sentimentOrder = ["negative", "neutral", "positive"];
const color = d3.scaleOrdinal().domain(sentimentOrder).range(["#e15759", "#bab0ac", "#59a14f"]);

const tooltip = d3.select("#tooltip");

d3.csv("../data/lab4_clean_tweets.csv", d => ({
    airline: d.airline,
    sentiment: d.sentiment
})).then(data => {
    const airlines = Array.from(new Set(data.map(d => d.airline))).sort();

    const rows = airlines.map(airline => {
        const subset = data.filter(d => d.airline === airline);
        const entry = { airline, total: subset.length };
        sentimentOrder.forEach(s => {
            entry[s] = subset.filter(d => d.sentiment === s).length / subset.length;
        });
        return entry;
    });

    const stacked = d3.stack().keys(sentimentOrder)(rows);

    const xScale = d3.scaleBand().domain(airlines)
        .range([margin.left, width - margin.right]).padding(0.3);
    const yScale = d3.scaleLinear().domain([0, 1])
        .range([height - margin.bottom, margin.top]);

    const svg = d3.select("#chart").append("svg").attr("width", width).attr("height", height);

    svg.append("g")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(d3.axisBottom(xScale));
    svg.append("g")
        .attr("transform", `translate(${margin.left}, 0)`)
        .call(d3.axisLeft(yScale).tickFormat(d3.format(".0%")));

    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 10)
        .attr("text-anchor", "middle")
        .text("Airline");

    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", 16)
        .attr("text-anchor", "middle")
        .text("Share of Tweets");

    svg.selectAll("g.layer")
        .data(stacked)
        .join("g")
        .attr("class", "layer")
        .attr("fill", d => color(d.key))
        .selectAll("rect")
        .data(d => d.map(v => ({ ...v, key: d.key })))
        .join("rect")
        .attr("x", d => xScale(d.data.airline))
        .attr("y", d => yScale(d[1]))
        .attr("height", d => yScale(d[0]) - yScale(d[1]))
        .attr("width", xScale.bandwidth())
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(
                `<strong>${d.data.airline}</strong><br>${d.key}: ${((d[1] - d[0]) * 100).toFixed(1)}%`
            );
        })
        .on("mousemove", event => {
            tooltip.style("left", `${event.pageX + 10}px`).style("top", `${event.pageY + 10}px`);
        })
        .on("mouseout", () => tooltip.style("opacity", 0));

    const legend = svg.append("g")
        .attr("transform", `translate(${width - margin.right + 20}, ${margin.top})`);

    sentimentOrder.forEach((s, i) => {
        const g = legend.append("g").attr("transform", `translate(0, ${i * 22})`);
        g.append("rect").attr("width", 14).attr("height", 14).attr("fill", color(s));
        g.append("text").attr("x", 20).attr("y", 12).text(s);
    });
});
