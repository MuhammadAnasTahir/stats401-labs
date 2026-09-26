// Horizontal diverging bar chart: length and position from a zero line encode change.
// Used for sector bars, company drill-down, and the compare panel.

function makeBars(axisSel, bodySel) {
    const W = 480;
    const M = { left: 150, right: 60 };
    const LABEL_ROOM = 48; // space for the signed value label past the bar end

    const axisSvg = d3.select(axisSel).append("svg")
        .attr("viewBox", `0 0 ${W} 24`);
    const axisG = axisSvg.append("g").attr("class", "axis")
        .attr("transform", "translate(0,20)");

    const svg = d3.select(bodySel).append("svg");
    const zero = svg.append("line").attr("class", "zero-line");
    const rowsG = svg.append("g");

    let rowSel = rowsG.selectAll("g.row");
    let last = null; // last render arguments, reused by recolor()

    // rows: [{key, label, value, cap?, data, tip}], sorted by the caller
    function render(rows, opts) {
        last = [rows, opts];
        const rowH = opts.rowH;
        const H = rows.length * rowH + 8;
        const maxAbs = d3.max(rows, d => Math.abs(d.value)) || 1;

        const x = d3.scaleLinear()
            .domain([-maxAbs, maxAbs])
            .range([M.left + LABEL_ROOM, W - M.right - LABEL_ROOM])
            .nice();
        const y = d3.scaleBand()
            .domain(rows.map(d => d.key))
            .range([4, H - 4])
            .padding(0.22);

        const t = svg.transition().duration(500);

        svg.attr("viewBox", `0 0 ${W} ${H}`);

        // the axis sits in its own svg, so it gets its own transition
        axisG.transition().duration(500).call(
            d3.axisTop(x).ticks(5)
                .tickFormat(d => d === 0 ? "0%" : d3.format("+")(d) + "%")
        );

        zero.transition(t)
            .attr("x1", x(0)).attr("x2", x(0))
            .attr("y1", 0).attr("y2", H);

        const fontSize = rowH >= 30 ? 13 : 11;

        rowSel = rowsG.selectAll("g.row")
            .data(rows, d => d.key)
            .join(
                enter => {
                    const g = enter.append("g").attr("class", "row")
                        .attr("transform", d => `translate(0,${y(d.key)})`)
                        .style("opacity", 0);
                    g.append("rect").attr("class", "hit").attr("fill", "transparent");
                    g.append("rect").attr("class", "dbar")
                        .attr("x", x(0)).attr("width", 0);
                    g.append("text").attr("class", "name")
                        .attr("text-anchor", "end").attr("dy", "0.35em");
                    g.append("text").attr("class", "val").attr("dy", "0.35em");
                    g.append("text").attr("class", "cap")
                        .attr("text-anchor", "end").attr("dy", "0.35em")
                        .attr("fill", "#777");
                    return g;
                },
                update => update,
                exit => exit.transition(t).style("opacity", 0).remove()
            );

        rowSel.on("mouseenter", (event, d) => {
                Tip.show(d.tip, event);
                if (opts.onHover) opts.onHover(d.key);
            })
            .on("mousemove", event => Tip.move(event))
            .on("mouseleave", () => {
                Tip.hide();
                if (opts.onHover) opts.onHover(null);
            })
            .on("click", (event, d) => {
                if (opts.onClick) { Tip.hide(); opts.onClick(d.key); }
            })
            .style("cursor", opts.onClick ? "pointer" : "default");

        rowSel.transition(t)
            .style("opacity", 1)
            .attr("transform", d => `translate(0,${y(d.key)})`);

        const bh = y.bandwidth();
        const mid = bh / 2;

        rowSel.select(".hit")
            .attr("x", 0).attr("y", -y.step() * y.paddingInner() / 2)
            .attr("width", W).attr("height", y.step());

        rowSel.select(".dbar")
            .transition(t)
            .attr("y", 0).attr("height", bh)
            .attr("x", d => x(Math.min(0, d.value)))
            .attr("width", d => Math.abs(x(d.value) - x(0)))
            .style("fill", d => Color.flatFill(d.value));

        rowSel.select(".name")
            .attr("x", M.left - 8).attr("y", mid)
            .attr("font-size", fontSize)
            .text(d => d.label);

        rowSel.select(".val")
            .attr("font-size", fontSize)
            .attr("font-weight", "bold")
            .attr("text-anchor", d => d.value >= 0 ? "start" : "end")
            .text(d => fmtPct(d.value))
            .transition(t)
            .attr("y", mid)
            .attr("x", d => x(d.value) + (d.value >= 0 ? 4 : -4));

        rowSel.select(".cap")
            .attr("x", W - 2).attr("y", mid)
            .attr("font-size", fontSize - 1)
            .text(d => d.cap != null ? fmtCap(d.cap) : "");
    }

    // Dim every row except the hovered one, and deepen that row's color so the
    // link back to the treemap (or another bar) reads clearly.
    function highlight(key) {
        rowSel.style("opacity", d => key == null || d.key === key ? 1 : 0.35);
        rowSel.select(".dbar").style("fill", d =>
            key != null && d.key === key
                ? d3.color(Color.flatFill(d.value)).darker(1.1)
                : Color.flatFill(d.value));
    }

    // Palette toggle: re-render so any running transition picks up the new colors.
    function recolor() {
        if (last) render(...last);
    }

    return { render, highlight, recolor };
}
