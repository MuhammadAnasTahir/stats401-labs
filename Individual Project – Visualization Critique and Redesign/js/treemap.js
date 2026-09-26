// Treemap: area = market cap, grouped by sector. Fill reinforces daily change.
// On drill-down it zooms to the selected sector's companies.

const Treemap = (() => {
    const W = 480, H = 520;
    let svg, tilesG, headersG, tileSel, headerSel;

    function init(sel) {
        svg = d3.select(sel).append("svg").attr("viewBox", `0 0 ${W} ${H}`);
        tilesG = svg.append("g");
        headersG = svg.append("g");
        tileSel = tilesG.selectAll("g.tile");
        headerSel = headersG.selectAll("g.header");
    }

    function truncate(text, px, charW) {
        const max = Math.floor(px / charW);
        if (text.length <= max) return text;
        return max > 3 ? text.slice(0, max - 1) + "…" : "";
    }

    // companies: rows to draw; sectorMap: sector name -> stats; handlers: {hover, select}
    function render(companies, sectorMap, handlers) {
        const root = d3.hierarchy({
                children: d3.groups(companies, d => d.sector)
                    .map(([name, children]) => ({ name, children }))
            })
            .sum(d => d.marketCap || 0)
            .sort((a, b) => b.value - a.value);

        d3.treemap()
            .size([W, H])
            .paddingOuter(2)
            .paddingTop(d => d.depth === 1 ? 17 : 2)
            .paddingInner(1)
            .round(true)(root);

        const t = svg.transition().duration(600);

        tileSel = tilesG.selectAll("g.tile")
            .data(root.leaves(), d => d.data.ticker)
            .join(
                enter => {
                    const g = enter.append("g").attr("class", "tile")
                        .attr("transform", d => `translate(${d.x0},${d.y0})`)
                        .style("opacity", 0);
                    g.append("rect");
                    g.append("text").attr("class", "tk").attr("text-anchor", "middle");
                    g.append("text").attr("class", "pc").attr("text-anchor", "middle");
                    return g;
                },
                update => update,
                exit => exit.transition(t).style("opacity", 0).remove()
            );

        tileSel
            .on("mouseenter", (event, d) => {
                Tip.show(companyTip(d.data), event);
                handlers.hover(d.data.sector);
            })
            .on("mousemove", event => Tip.move(event))
            .on("mouseleave", () => { Tip.hide(); handlers.hover(null); })
            .on("click", (event, d) => { Tip.hide(); handlers.select(d.data.sector); });

        tileSel.transition(t)
            .style("opacity", 1)
            .attr("transform", d => `translate(${d.x0},${d.y0})`);

        tileSel.select("rect")
            .transition(t)
            .attr("width", d => Math.max(0, d.x1 - d.x0))
            .attr("height", d => Math.max(0, d.y1 - d.y0))
            .attr("fill", d => Color.fill(d.data.changePercent));

        // Labels: ticker when it fits, plus signed % when there is room for a second line.
        tileSel.each(function (d) {
            const w = d.x1 - d.x0, h = d.y1 - d.y0;
            const fs = Math.max(8, Math.min(16, w / 4.2, h / 2.2));
            const showTk = w >= 24 && h >= 12;
            const showPc = showTk && h >= fs * 2.6 && w >= 40;
            const color = Color.text(d.data.changePercent);
            const g = d3.select(this);

            g.select(".tk")
                .text(showTk ? d.data.ticker : "")
                .attr("font-size", fs).attr("font-weight", "bold")
                .attr("fill", color)
                .attr("x", w / 2)
                .attr("y", showPc ? h / 2 - fs * 0.15 : h / 2 + fs * 0.35);

            g.select(".pc")
                .text(showPc ? fmtPct(d.data.changePercent) : "")
                .attr("font-size", fs * 0.75)
                .attr("fill", color)
                .attr("x", w / 2)
                .attr("y", h / 2 + fs * 0.85);
        });

        // Sector header strips double as click / hover targets for the whole sector.
        headerSel = headersG.selectAll("g.header")
            .data(root.children, d => d.data.name)
            .join(
                enter => {
                    const g = enter.append("g").attr("class", "header");
                    g.append("rect").attr("class", "outline")
                        .attr("fill", "none").attr("pointer-events", "none");
                    g.append("rect").attr("class", "header-strip").attr("fill", "#fff");
                    g.append("text").attr("font-size", 11).attr("font-weight", "bold")
                        .attr("pointer-events", "none");
                    return g;
                },
                update => update,
                exit => exit.remove()
            );

        headerSel
            .on("mouseenter", (event, d) => {
                Tip.show(sectorTip(sectorMap.get(d.data.name)), event);
                handlers.hover(d.data.name);
            })
            .on("mousemove", event => Tip.move(event))
            .on("mouseleave", () => { Tip.hide(); handlers.hover(null); })
            .on("click", (event, d) => { Tip.hide(); handlers.select(d.data.name); });

        headerSel.select(".outline")
            .transition(t)
            .attr("x", d => d.x0).attr("y", d => d.y0)
            .attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0);

        headerSel.select(".header-strip")
            .transition(t)
            .attr("x", d => d.x0 + 1).attr("y", d => d.y0 + 1)
            .attr("width", d => Math.max(0, d.x1 - d.x0 - 2)).attr("height", 15);

        headerSel.select("text")
            .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 12)
            .text(d => {
                const s = sectorMap.get(d.data.name);
                const pct = " " + fmtPct(s.value);
                const room = d.x1 - d.x0 - 8;
                const name = truncate(d.data.name, room - pct.length * 6.2, 6.4);
                return name ? name + pct : truncate(pct.trim(), room, 6.2);
            });

        highlight(null);
    }

    function highlight(sector) {
        tileSel.style("opacity", d => sector == null || d.data.sector === sector ? 1 : 0.3);
        headerSel.select(".outline")
            .attr("stroke", d => d.data.name === sector ? "#222" : "none")
            .attr("stroke-width", 2);
    }

    return { init, render, highlight };
})();
