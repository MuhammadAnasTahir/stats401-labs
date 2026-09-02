const columns = ["id", "time", "place", "magnitude", "latitude",
    "longitude", "depth", "type", "status"];

let allData = [];
let filtered = [];
const sortState = { col: null, dir: 1 };

d3.csv("../data/earthquake_info.csv", d => ({
    id: d.id,
    time: d.time,
    place: d.place,
    magnitude: +d.magnitude,
    latitude: +d.latitude,
    longitude: +d.longitude,
    depth: +d.depth,
    type: d.type,
    status: d.status
})).then(data => {
    allData = data;
    populateSelectOptions("filter-type", data.map(d => d.type));
    populateSelectOptions("filter-status", data.map(d => d.status));
    applyFilters();
});

function populateSelectOptions(selectId, values) {
    const select = document.getElementById(selectId);
    Array.from(new Set(values)).sort().forEach(v => select.append(new Option(v, v)));
}

function applyFilters() {
    const minMag = parseFloat(document.getElementById("filter-mag-min").value);
    const maxMag = parseFloat(document.getElementById("filter-mag-max").value);
    const minDepth = parseFloat(document.getElementById("filter-depth-min").value);
    const maxDepth = parseFloat(document.getElementById("filter-depth-max").value);
    const type = document.getElementById("filter-type").value;
    const status = document.getElementById("filter-status").value;

    filtered = allData.filter(d =>
        (isNaN(minMag) || d.magnitude >= minMag) &&
        (isNaN(maxMag) || d.magnitude <= maxMag) &&
        (isNaN(minDepth) || d.depth >= minDepth) &&
        (isNaN(maxDepth) || d.depth <= maxDepth) &&
        (type === "all" || d.type === type) &&
        (status === "all" || d.status === status)
    );

    renderTable();
    document.getElementById("record-count").textContent =
        `Showing ${filtered.length} of ${allData.length} records`;
}

function sortedRows() {
    if (!sortState.col) return filtered;
    const { col, dir } = sortState;
    return [...filtered].sort((a, b) => {
        const va = a[col];
        const vb = b[col];
        if (typeof va === "number") return (va - vb) * dir;
        return String(va).localeCompare(String(vb)) * dir;
    });
}

function renderTable() {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = sortedRows().map(d =>
        `<tr>${columns.map(c => `<td>${d[c]}</td>`).join("")}</tr>`
    ).join("");
}

document.querySelectorAll("#data-table th").forEach(th => {
    th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (sortState.col !== col) {
            sortState.col = col;
            sortState.dir = 1;
        } else if (sortState.dir === 1) {
            sortState.dir = -1;
        } else {
            sortState.col = null;
        }
        document.querySelectorAll("#data-table th").forEach(h => h.classList.remove("sorted-asc", "sorted-desc"));
        if (sortState.col === col) {
            th.classList.add(sortState.dir === 1 ? "sorted-asc" : "sorted-desc");
        }
        renderTable();
    });
});

document.querySelectorAll(".filter-control").forEach(el => {
    el.addEventListener("input", applyFilters);
});
