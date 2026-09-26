// Compare panel: a dropdown of all 500+ companies (ticker + name, so a viewer
// never has to remember an abbreviation), chips, and diverging bars on one
// shared axis. Independent of the drill-down state.

const Compare = (() => {
    // Ten widely recognized names, pinned to the top of the dropdown so the
    // panel is useful without scrolling or typing.
    const POPULAR = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "JPM", "V", "WMT"];

    let byTicker, bars;
    let selected = ["NVDA", "MSFT", "AAPL"];

    const select = () => d3.select("#compare-select");

    function init(data) {
        byTicker = new Map(data.map(d => [d.ticker, d]));
        bars = makeBars("#compare-axis", "#compare-body");

        const popularSet = new Set(POPULAR);
        const popular = POPULAR.map(t => byTicker.get(t)).filter(Boolean);
        const rest = data.filter(d => !popularSet.has(d.ticker))
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));

        const sel = select();
        const popGroup = sel.append("optgroup").attr("label", "Popular");
        popGroup.selectAll("option").data(popular).join("option")
            .attr("value", d => d.ticker)
            .text(d => `${d.ticker} — ${d.name}`);

        const allGroup = sel.append("optgroup").attr("label", "All Companies (A–Z)");
        allGroup.selectAll("option").data(rest).join("option")
            .attr("value", d => d.ticker)
            .text(d => `${d.ticker} — ${d.name}`);

        sel.on("change", function () {
            if (this.value) add(this.value);
            this.value = "";
        });

        render();
    }

    function add(ticker) {
        if (!selected.includes(ticker)) selected.push(ticker);
        render();
    }

    function remove(ticker) {
        selected = selected.filter(t => t !== ticker);
        render();
    }

    function render() {
        // Hide already-selected companies from the dropdown so it only ever
        // offers companies that can still be added.
        select().selectAll("option[value]")
            .property("disabled", function () { return selected.includes(this.value); })
            .style("display", function () { return selected.includes(this.value) ? "none" : null; });

        d3.select("#compare-chips").selectAll("span.chip")
            .data(selected, d => d)
            .join(enter => {
                const c = enter.append("span").attr("class", "chip");
                c.append("span").text(d => d);
                c.append("button").attr("aria-label", d => "Remove " + d).text("×")
                    .on("click", (event, d) => remove(d));
                return c;
            });

        const rows = selected.map(t => byTicker.get(t))
            .sort((a, b) => b.changePercent - a.changePercent)
            .map(d => ({
                key: d.ticker,
                label: `${d.ticker}  ${d.name.length > 16 ? d.name.slice(0, 15) + "…" : d.name}`,
                value: d.changePercent,
                cap: d.marketCap,
                tip: companyTip(d)
            }));

        d3.select("#compare-empty").style("display", rows.length ? "none" : null);
        d3.select("#compare-axis").style("display", rows.length ? null : "none");
        bars.render(rows, { rowH: 30 });
    }

    return { init, recolor: () => bars.recolor() };
})();
