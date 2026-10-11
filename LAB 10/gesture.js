// ======================== Lab 10: Hand Gesture Interaction ========================
//
// Uses MediaPipe's pre-trained Gesture Recognizer (part of @mediapipe/tasks-vision)
// rather than hand-rolling gesture classification from raw landmarks. It already
// recognizes a fixed vocabulary of 7 gestures (Open_Palm, Closed_Fist, Thumb_Up,
// Thumb_Down, Pointing_Up, Victory, ILoveYou), four of which are mapped to actions
// below; the rest (Pointing_Up, Victory, ILoveYou) are ignored.

import {
    GestureRecognizer,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

const CONFIDENCE_THRESHOLD = 0.6;
const COOLDOWN_MS = 1200; // one action per gesture hold, not dozens per second

const cameraButton = document.getElementById("camera-button");
const cameraStatus = document.getElementById("camera-status");
const video = document.getElementById("camera");

let gestureRecognizer = null;
let running = false;
let lastActionTime = 0;
let rafId = null;

const GESTURE_ACTIONS = {
    Open_Palm: () => {
        window.lab10.applyFilters();
        return "Applied filters (Run)";
    },
    Closed_Fist: () => {
        window.lab10.resetAllFilters();
        return "Reset all filters";
    },
    Thumb_Down: () => {
        window.lab10.scrollTableDown();
        return "Scrolled table down";
    },
    Thumb_Up: () => {
        window.lab10.scrollTableUp();
        return "Scrolled table up";
    }
};

async function loadRecognizer() {
    cameraStatus.textContent = "Loading gesture model...";
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 1
    });
}

async function startCamera() {
    cameraButton.disabled = true;
    try {
        if (!gestureRecognizer) {
            await loadRecognizer();
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
        await video.play();
        running = true;
        cameraStatus.textContent = "Camera active. Show one hand to the camera.";
        cameraButton.textContent = "Stop Camera";
        cameraButton.classList.add("active");
        predictLoop();
    } catch (err) {
        cameraStatus.textContent = `Camera error: ${err.message}`;
    } finally {
        cameraButton.disabled = false;
    }
}

function stopCamera() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
    cameraStatus.textContent = "Camera inactive";
    cameraButton.textContent = "Start Camera";
    cameraButton.classList.remove("active");
}

function predictLoop() {
    if (!running) return;

    if (video.readyState >= 2) {
        const result = gestureRecognizer.recognizeForVideo(video, performance.now());
        if (result.gestures.length > 0) {
            const top = result.gestures[0][0];
            handleDetection(top.categoryName, top.score);
        }
    }

    rafId = requestAnimationFrame(predictLoop);
}

function handleDetection(name, score) {
    if (score < CONFIDENCE_THRESHOLD || name === "None") return;

    window.lab10.reportDetected(`${name.replace("_", " ")} (${Math.round(score * 100)}%)`);

    const action = GESTURE_ACTIONS[name];
    if (!action) return; // a recognized gesture we don't map to anything (e.g. Thumb_Up, Victory)

    const now = performance.now();
    if (now - lastActionTime < COOLDOWN_MS) return; // ignore repeats while the same gesture is held
    lastActionTime = now;

    const executed = action();
    window.lab10.reportExecuted(executed);
}

// Camera only ever activates after this explicit click, or the equivalent
// explicit "start camera" voice command exposed below — never automatically.
cameraButton.addEventListener("click", () => {
    if (running) {
        stopCamera();
    } else {
        startCamera();
    }
});

// Exposed so a voice command ("start camera" / "stop camera") can trigger
// the same camera toggle as the button. startCamera() itself is async and
// reports progress through cameraStatus as it loads the model and requests
// permission, so these return an immediate synchronous acknowledgment for
// the Executed feedback field rather than awaiting the final result.
window.lab10gesture = {
    startCamera: () => {
        if (running) return "Camera already active";
        startCamera();
        return "Starting camera...";
    },
    stopCamera: () => {
        if (!running) return "Camera already inactive";
        stopCamera();
        return "Camera stopped";
    }
};
