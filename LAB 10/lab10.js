// ======================== Lab 10: Novel Interaction (built on Lab 3) ========================
//
// Everything in this section down to "Voice interaction" is the original Lab 3
// table/filter logic, unmodified in behavior. Mouse and keyboard continue to work
// exactly as they did in Lab 3; this file only adds voice and gesture as additional
// ways to trigger the same functions.

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

// ======================== New for Lab 10 ========================

function resetAllFilters() {
    document.getElementById("filter-mag-min").value = "";
    document.getElementById("filter-mag-max").value = "";
    document.getElementById("filter-depth-min").value = "";
    document.getElementById("filter-depth-max").value = "";
    document.getElementById("filter-type").value = "all";
    document.getElementById("filter-status").value = "all";
    applyFilters();
    resetFeedbackPanel();
}

// Clears the Heard/Detected/Executed panel back to its starting state. Called
// on reset (function declarations are hoisted, so this is safe to call here
// even though it is defined further down the file).
function resetFeedbackPanel() {
    document.getElementById("feedback-heard").textContent = "—";
    document.getElementById("feedback-detected").textContent = "—";
    document.getElementById("feedback-executed").textContent = "—";
}

function scrollTableDown() {
    document.querySelector(".table-container").scrollBy({ top: 160, behavior: "smooth" });
}

function scrollTableUp() {
    document.querySelector(".table-container").scrollBy({ top: -160, behavior: "smooth" });
}

document.getElementById("run-btn").addEventListener("click", () => {
    applyFilters();
    reportExecuted("Applied filters (Run button)");
});

document.getElementById("reset-btn").addEventListener("click", () => {
    resetAllFilters();
    reportExecuted("Reset all filters (Reset button)");
});

// ---- Feedback panel ----

function flashUpdate(elId, text) {
    const el = document.getElementById(elId);
    el.textContent = text;
    el.classList.remove("flash");
    void el.offsetWidth; // restart the CSS animation
    el.classList.add("flash");
}

function reportHeard(text) {
    flashUpdate("feedback-heard", text);
}

function reportDetected(text) {
    flashUpdate("feedback-detected", text);
}

function reportExecuted(text) {
    flashUpdate("feedback-executed", text);
}

// ---- Voice interaction (Web Speech API) ----

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceButton = document.getElementById("voice-button");
const voiceStatus = document.getElementById("voice-status");

let voiceActive = false;

if (!SpeechRecognition) {
    voiceStatus.textContent = "Speech recognition is not supported in this browser. Use the filters directly.";
    voiceButton.disabled = true;
} else {
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
        voiceStatus.textContent = "Listening...";
        voiceButton.classList.add("active");
        voiceButton.textContent = "Stop Voice Control";
    };

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.toLowerCase().trim();
        reportHeard(`"${transcript}"`);
        voiceStatus.textContent = `Heard: "${transcript}"`;
        handleVoiceCommand(transcript);
    };

    recognition.onerror = (event) => {
        voiceStatus.textContent = `Voice error: ${event.error}`;
        // A permission or hardware problem will not fix itself on retry, so
        // stop the auto-restart loop instead of erroring forever.
        if (["not-allowed", "audio-capture", "service-not-allowed"].includes(event.error)) {
            voiceActive = false;
        }
    };

    recognition.onend = () => {
        voiceButton.classList.remove("active");
        if (voiceActive) {
            // The browser API only ever captures one utterance per start().
            // Restarting here, as long as the user has not explicitly
            // stopped, is what makes every command after the first "started"
            // by the previous command finishing rather than another click.
            recognition.start();
        } else {
            voiceStatus.textContent = "Voice control inactive";
            voiceButton.textContent = "Start Voice Control";
        }
    };

    // Microphone only ever activates after this explicit click (or the
    // spacebar shortcut below, itself also a direct user action); after
    // that, it keeps re-arming itself until voice control is stopped again.
    function toggleVoiceControl() {
        if (voiceActive) {
            voiceActive = false;
            recognition.stop();
        } else {
            voiceActive = true;
            recognition.start();
        }
    }

    voiceButton.addEventListener("click", toggleVoiceControl);

    // Spacebar also toggles voice control, as long as focus is not on a
    // normal interactive control (typing a space in a field, or activating
    // a focused button/dropdown with space, should behave normally instead).
    document.addEventListener("keydown", (event) => {
        if (event.code !== "Space") return;
        const tag = document.activeElement.tagName;
        if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) return;
        event.preventDefault(); // stop the page itself from scrolling on space
        toggleVoiceControl();
    });
}

// A single speech-recognition result can contain more than one spoken
// command if they are said close together without enough of a pause for the
// recognizer to finalize in between (e.g. "set minimum magnitude to 3 set
// maximum magnitude to 7" arriving as one transcript). The numeric-filter
// pattern below is matched with the global flag and a loop, rather than a
// single .match(), so every "set ... to ..." phrase in the transcript is
// applied, not just the first.
function handleVoiceCommand(transcript) {
    if (/\bstart camera\b/.test(transcript)) {
        reportExecuted(window.lab10gesture ? window.lab10gesture.startCamera() : "Camera module not loaded yet");
        return;
    }
    if (/\bstop camera\b/.test(transcript)) {
        reportExecuted(window.lab10gesture ? window.lab10gesture.stopCamera() : "Camera module not loaded yet");
        return;
    }
    if (/\breset\b/.test(transcript)) {
        resetAllFilters();
        reportExecuted("Reset all filters");
        return;
    }

    const actions = [];

    // "and" is accepted as well as "set"/"change" so a natural chained
    // phrase like "...to 2.5 and maximum magnitude to 6" is recognized
    // without the user having to repeat the word "set" before each clause.
    const setRe =
        /(?:set|change|and)\s+(?:the\s+)?(min|minimum|max|maximum)(?:imum)?\s+(magnitude|mag|depth)\s+to\s+(-?\d+(?:\.\d+)?)/g;
    let m;
    while ((m = setRe.exec(transcript)) !== null) {
        const minmax = m[1].startsWith("min") ? "min" : "max";
        const field = m[2].startsWith("mag") ? "mag" : "depth";
        const value = m[3];
        const fieldLabel = field === "mag" ? "magnitude" : "depth";
        document.getElementById(`filter-${field}-${minmax}`).value = value;
        actions.push(`${minmax} ${fieldLabel} to ${value}`);
    }

    const typeMatch = transcript.match(/(?:select|set)\s+type\s+(?:as|to)\s+(earthquake|landslide|all)/);
    if (typeMatch) {
        document.getElementById("filter-type").value = typeMatch[1];
        actions.push(`type to ${typeMatch[1]}`);
    }

    const statusMatch = transcript.match(/(?:select|set)\s+status\s+(?:as|to)\s+(reviewed|automatic|all)/);
    if (statusMatch) {
        document.getElementById("filter-status").value = statusMatch[1];
        actions.push(`status to ${statusMatch[1]}`);
    }

    const wantsRun = /\brun\b|\bapply\b/.test(transcript);
    if (wantsRun) applyFilters();

    let executed;
    if (actions.length === 0 && !wantsRun) {
        executed = 'Command not recognized. Try "set minimum magnitude to 5", "select type as earthquake", "start camera", "run", or "reset".';
    } else {
        const setPart = actions.length ? `Set ${actions.join(", ")}` : "";
        const runPart = wantsRun ? "Applied filters"
                       : actions.length ? '(not yet applied — say "run")' : "";
        executed = [setPart, runPart].filter(Boolean).join(" — ");
    }

    reportExecuted(executed);
}

// ---- Exposed for gesture.js (ES module, can't reach these via closure) ----
window.lab10 = {
    applyFilters,
    resetAllFilters,
    scrollTableDown,
    scrollTableUp,
    reportDetected,
    reportExecuted
};
