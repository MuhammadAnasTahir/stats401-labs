// Color scales, palette toggle, shared formatters, and the tooltip.
// Color only reinforces change; position and signed labels carry the value.

const Color = (() => {
    const palettes = {
        finance: { neg: "#b03a2e", mid: "#efefea", pos: "#1e7d46" },
        colorblind: { neg: "#d95f02", mid: "#f2f2f2", pos: "#2166ac" }
    };

    // Company moves beyond +/-3% get the strongest shade.
    const LIMIT = 3;
    let current = "finance";
    let scale;

    function build() {
        const p = palettes[current];
        scale = d3.scaleDiverging()
            .domain([-LIMIT, 0, LIMIT])
            .interpolator(d3.piecewise(d3.interpolateLab, [p.neg, p.mid, p.pos]))
            .clamp(true);
    }
    build();

    return {
        LIMIT,
        set(name) { current = name; build(); },
        // Continuous scale: used on the treemap, where color is reinforcement
        // alongside a separate channel (area).
        fill: v => scale(v),
        // Flat two-tone: used on bars, where length already carries the
        // magnitude, so color only needs to mark the sign (no redundant encoding).
        flatFill: v => v >= 0 ? palettes[current].pos : palettes[current].neg,
        // white text on strongly colored fills, dark text otherwise
        text: v => Math.abs(v) > 1.6 ? "#fff" : "#222",
        up: () => palettes[current].pos,
        down: () => palettes[current].neg
    };
})();

const fmtPct = v => v === 0 ? "0.00%" : d3.format("+.2f")(v) + "%";

const fmtCap = v => v >= 1e12
    ? "$" + (v / 1e12).toFixed(2) + "T"
    : "$" + (v / 1e9).toFixed(1) + "B";

const Tip = (() => {
    let el;
    return {
        show(html, event) {
            el = el || d3.select("body").append("div").attr("class", "tooltip");
            el.html(html).style("opacity", 1);
            Tip.move(event);
        },
        move(event) {
            if (!el) return;
            const node = el.node();
            const w = node.offsetWidth, h = node.offsetHeight;
            let x = event.clientX + 14, y = event.clientY + 14;
            if (x + w > window.innerWidth - 8) x = event.clientX - w - 14;
            if (y + h > window.innerHeight - 8) y = event.clientY - h - 14;
            el.style("left", x + "px").style("top", y + "px");
        },
        hide() { if (el) el.style("opacity", 0); }
    };
})();

function companyTip(d) {
    const classNote = d.classes
        ? `<br><span style="color:#666">Combines ${d.classes.map(c =>
            `${c.ticker} (${fmtPct(c.changePercent)})`).join(" and ")}</span>`
        : "";
    return `<b>${d.ticker}</b> ${d.name}<br>` +
        `<span style="color:#666">${d.sector}</span><br>` +
        `Market cap: <b>${fmtCap(d.marketCap)}</b><br>` +
        `Price: $${d.price.toFixed(2)} (${d3.format("+.2f")(d.priceChange)})<br>` +
        `Daily change: <b>${fmtPct(d.changePercent)}</b>${classNote}`;
}

function sectorTip(s) {
    return `<b>${s.sector}</b><br>` +
        `Market cap: <b>${fmtCap(s.cap)}</b><br>` +
        `Cap-weighted change: <b>${fmtPct(s.capW)}</b><br>` +
        `Equal-weighted change: <b>${fmtPct(s.eqW)}</b><br>` +
        `${s.up} up · ${s.down} down · ${s.n} companies`;
}
