const video = document.getElementById("videoPlayer");
const cameraVideo = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const startOverlay = document.getElementById("startOverlay");
const startButton = document.getElementById("startButton");
const cameraButton = document.getElementById("cameraButton");
const centerPlay = document.getElementById("centerPlay");
const muteButton = document.getElementById("muteButton");
const backButton = document.getElementById("backButton");
const forwardButton = document.getElementById("forwardButton");
const fullscreenButton = document.getElementById("fullscreenButton");
const progress = document.getElementById("progress");
const timeLabel = document.getElementById("timeLabel");
const status = document.getElementById("status");
const gestureBadge = document.getElementById("gestureBadge");

let handCamera = null;
let cameraRunning = false;
let lastActionTime = 0;
let lastGesture = "";

const ACTION_COOLDOWN = 1100;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function updateUI() {
  centerPlay.textContent = video.paused ? "▶" : "❚❚";
  muteButton.textContent = video.muted ? "🔇" : "🔊";
  if (video.duration) {
    progress.value = (video.currentTime / video.duration) * 100;
  }
  timeLabel.textContent =
    `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
}

function togglePlay() {
  if (video.paused) {
    video.play().catch(() => {});
  } else {
    video.pause();
  }
  updateUI();
}

function seekBy(seconds) {
  if (!Number.isFinite(video.duration)) return;
  video.currentTime = Math.max(
    0,
    Math.min(video.duration, video.currentTime + seconds)
  );
  updateUI();
}

function toggleMute() {
  video.muted = !video.muted;
  updateUI();
}

video.addEventListener("loadedmetadata", updateUI);
video.addEventListener("timeupdate", updateUI);
video.addEventListener("play", updateUI);
video.addEventListener("pause", updateUI);
video.addEventListener("volumechange", updateUI);

video.addEventListener("click", togglePlay);
centerPlay.addEventListener("click", (e) => {
  e.stopPropagation();
  togglePlay();
});

muteButton.addEventListener("click", toggleMute);
backButton.addEventListener("click", () => seekBy(-5));
forwardButton.addEventListener("click", () => seekBy(5));

progress.addEventListener("input", () => {
  if (video.duration) {
    video.currentTime = (Number(progress.value) / 100) * video.duration;
  }
});

fullscreenButton.addEventListener("click", async () => {
  const target = document.querySelector(".video-card");
  if (!document.fullscreenElement) {
    await target.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    togglePlay();
  }
  if (e.key.toLowerCase() === "m") toggleMute();
  if (e.key === "ArrowRight") seekBy(5);
  if (e.key === "ArrowLeft") seekBy(-5);
});

async function startCamera() {
  if (cameraRunning) return;

  try {
    status.textContent = "Mengaktifkan kamera…";
    status.className = "status";

    if (!window.Hands || !window.Camera) {
      throw new Error("MediaPipe belum termuat. Periksa koneksi internet.");
    }

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.65,
      minTrackingConfidence: 0.65
    });

    hands.onResults(onHandsResults);

    handCamera = new Camera(cameraVideo, {
      onFrame: async () => {
        await hands.send({ image: cameraVideo });
      },
      width: 640,
      height: 480
    });

    await handCamera.start();

    cameraRunning = true;
    status.textContent = "Kamera aktif";
    status.className = "status online";
    cameraButton.textContent = "📷 Aktif";
  } catch (err) {
    console.error(err);
    status.textContent = "Kamera gagal";
    status.className = "status offline";
    gestureBadge.textContent =
      "Izinkan kamera & gunakan HTTPS (GitHub Pages).";
  }
}

startButton.addEventListener("click", async () => {
  startOverlay.classList.add("hidden");
  await startCamera();
});

cameraButton.addEventListener("click", startCamera);

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Menentukan apakah jari terbuka berdasarkan landmark.
// Index: 8, middle: 12, ring: 16, pinky: 20.
// Ibu jari memakai jarak sederhana terhadap telapak.
function countFingers(lm) {
  let count = 0;

  // Ibu jari: cek apakah ujungnya cukup jauh dari MCP.
  const thumbOpen =
    distance(lm[4], lm[2]) > distance(lm[3], lm[2]) * 1.15;
  if (thumbOpen) count++;

  // 4 jari lainnya: ujung berada lebih "atas" dari sendi PIP
  // pada koordinat kamera MediaPipe (y lebih kecil = lebih atas).
  if (lm[8].y < lm[6].y) count++;
  if (lm[12].y < lm[10].y) count++;
  if (lm[16].y < lm[14].y) count++;
  if (lm[20].y < lm[18].y) count++;

  return count;
}

function classifyGesture(lm) {
  const fingers = countFingers(lm);

  if (fingers === 0) return { name: "✊ Kepalan — PAUSE", action: "pause" };
  if (fingers === 1) return { name: "☝️ 1 jari — PLAY", action: "play" };
  if (fingers === 2) return { name: "✌️ 2 jari — +5 DETIK", action: "forward" };
  if (fingers === 3) return { name: "🤟 3 jari — -5 DETIK", action: "back" };
  if (fingers >= 4) return { name: "🖐️ Tangan terbuka — MUTE", action: "mute" };

  return { name: "Tangan terdeteksi", action: null };
}

function performGesture(action) {
  const now = Date.now();

  // Play/pause tidak perlu dilakukan setiap frame.
  if (action === "play") {
    if (!video.paused && now - lastActionTime < ACTION_COOLDOWN) return;
    video.play().catch(() => {});
    lastActionTime = now;
    return;
  }

  if (action === "pause") {
    if (video.paused && now - lastActionTime < ACTION_COOLDOWN) return;
    video.pause();
    lastActionTime = now;
    return;
  }

  // Aksi sekali-per-gesture memakai cooldown.
  if (now - lastActionTime < ACTION_COOLDOWN) return;

  if (action === "forward") {
    seekBy(5);
    lastActionTime = now;
  } else if (action === "back") {
    seekBy(-5);
    lastActionTime = now;
  } else if (action === "mute") {
    toggleMute();
    lastActionTime = now;
  }
}

function onHandsResults(results) {
  if (!canvas.width || canvas.width !== cameraVideo.videoWidth) {
    canvas.width = cameraVideo.videoWidth || 640;
    canvas.height = cameraVideo.videoHeight || 480;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
    gestureBadge.textContent = "Menunggu tangan…";
    lastGesture = "";
    return;
  }

  const landmarks = results.multiHandLandmarks[0];

  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
    color: "#ffffff",
    lineWidth: 3
  });

  drawLandmarks(ctx, landmarks, {
    color: "#ff2d55",
    lineWidth: 1,
    radius: 3
  });

  const gesture = classifyGesture(landmarks);
  gestureBadge.textContent = gesture.name;

  if (gesture.action) {
    performGesture(gesture.action);
  }

  lastGesture = gesture.action || "";
}
