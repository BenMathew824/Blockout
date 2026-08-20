const focusToggle = document.getElementById("focusToggle");
const toggleRow = focusToggle.closest(".toggle-row");
const sessionActiveBox = document.getElementById("sessionActiveBox");
const sessionSetupBox = document.getElementById("sessionSetupBox");
const countdownEl = document.getElementById("countdown");
const presetButtons = document.querySelectorAll(".presets button");
const modeTabs = document.querySelectorAll(".mode-tab");
const durationMode = document.getElementById("durationMode");
const untilMode = document.getElementById("untilMode");
const customHours = document.getElementById("customHours");
const customMinutes = document.getElementById("customMinutes");
const untilTime = document.getElementById("untilTime");
const studyTopicInput = document.getElementById("studyTopic");
const studyTopicDisplay = document.getElementById("studyTopicDisplay");
const apiKeyInput = document.getElementById("apiKeyInput");
const candleBody = document.getElementById("candleBody");
const wickNub = document.getElementById("wickNub");
const flameSvg = document.getElementById("flameSvg");
const candleCaption = document.getElementById("candleCaption");
const meltDrip = document.getElementById("meltDrip");
const waxPool = document.getElementById("waxPool");

let sessionMode = "duration";
let countdownInterval = null;
let lastSeenSessionBlocks = 0;
let currentSessionBlocks = 0;

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// Candle: burns down over the course of a session (burnFraction 0 -> 1),
// the TikTok "study until the candle melts" mechanic. Idle shows a fresh,
// unburnt candle; ending a session early snuffs the flame briefly instead
// of just silently resetting.
const CANDLE_MAX_HEIGHT = 44;
const CANDLE_MIN_HEIGHT = 8;
const CANDLE_BASE_Y = 64;

function setCandleBurn(burnFraction) {
  const fraction = Math.max(0, Math.min(1, burnFraction));
  const height = CANDLE_MAX_HEIGHT - (CANDLE_MAX_HEIGHT - CANDLE_MIN_HEIGHT) * fraction;
  const y = CANDLE_BASE_Y - height;
  candleBody.setAttribute("height", height.toFixed(1));
  candleBody.setAttribute("y", y.toFixed(1));
  wickNub.setAttribute("y", (y - 5).toFixed(1));
  flameSvg.setAttribute("y", (y - 27).toFixed(1));

  // A visible drip running down the candle's side and a widening wax pool
  // at the base — both grow monotonically, which reads as "melting" far
  // more clearly than the small height change alone.
  meltDrip.setAttribute("y", (y + 2).toFixed(1));
  meltDrip.setAttribute("height", (fraction * 40).toFixed(1));
  waxPool.setAttribute("rx", (16 + fraction * 11).toFixed(1));
  waxPool.setAttribute("ry", (5 + fraction * 4.5).toFixed(1));
}

function renderIdleCandle(lifetimeStats) {
  flameSvg.classList.remove("snuffed");
  setCandleBurn(0);
  candleCaption.textContent = lifetimeStats?.totalBlocks ? "a fresh candle" : "ready to light";
}

function renderActiveCandle(progress, sessionBlocks) {
  flameSvg.classList.remove("snuffed");
  setCandleBurn(progress);
  candleCaption.textContent = sessionBlocks > 0 ? `${sessionBlocks} blocked along the way` : "burning while you focus";
}

function flareCandle() {
  flameSvg.classList.add("flare");
  setTimeout(() => flameSvg.classList.remove("flare"), 260);
}

function snuffCandle() {
  flameSvg.classList.add("snuffed");
  candleCaption.textContent = "snuffed out early";
}

function startCountdown(sessionStartTime, sessionEndTime) {
  clearInterval(countdownInterval);
  const total = Math.max(1, sessionEndTime - sessionStartTime);
  const tick = () => {
    const remaining = sessionEndTime - Date.now();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      renderSessionState();
      return;
    }
    countdownEl.textContent = formatTime(remaining);
    const progress = Math.min(1, Math.max(0, 1 - remaining / total));
    renderActiveCandle(progress, currentSessionBlocks);
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function renderSessionBlockCount(sessionStats) {
  const count = sessionStats?.totalBlocks || 0;
  document.getElementById("sessionBlockCountText").textContent = `${count} blocked this session`;
  lastSeenSessionBlocks = count;
  currentSessionBlocks = count;
}

function renderSessionState() {
  chrome.storage.local.get(
    ["sessionActive", "sessionStartTime", "sessionEndTime", "studyTopic", "sessionStats", "lifetimeStats"],
    (data) => {
      if (data.sessionActive && data.sessionEndTime) {
        sessionActiveBox.style.display = "block";
        sessionSetupBox.style.display = "none";
        toggleRow.style.display = "none";
        studyTopicDisplay.style.display = data.studyTopic ? "flex" : "none";
        document.getElementById("studyTopicText").textContent = data.studyTopic || "";
        renderSessionBlockCount(data.sessionStats);
        startCountdown(data.sessionStartTime || Date.now(), data.sessionEndTime);
      } else {
        sessionActiveBox.style.display = "none";
        sessionSetupBox.style.display = "block";
        toggleRow.style.display = "flex";
        clearInterval(countdownInterval);
        renderIdleCandle(data.lifetimeStats);
      }
    }
  );
}

function load() {
  chrome.storage.sync.get(["focusModeOn"], (data) => {
    focusToggle.checked = !!data.focusModeOn;
  });
  chrome.storage.local.get(["studyTopic", "anthropicApiKey"], (data) => {
    if (data.studyTopic) studyTopicInput.value = data.studyTopic;
    if (data.anthropicApiKey) apiKeyInput.placeholder = "•••••••• (key saved)";
  });
  renderSessionState();
}

document.querySelectorAll(".settings-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const body = document.getElementById(btn.dataset.target);
    body.style.display = body.style.display === "block" ? "none" : "block";
  });
});

document.getElementById("saveApiKey").addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.local.set({ anthropicApiKey: key }, () => {
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "•••••••• (key saved)";
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.sessionStats) {
    const newCount = changes.sessionStats.newValue?.totalBlocks || 0;
    renderSessionBlockCount(changes.sessionStats.newValue);
    if (newCount > lastSeenSessionBlocks) flareCandle();
  }
});

focusToggle.addEventListener("change", () => {
  chrome.storage.sync.set({ focusModeOn: focusToggle.checked });
});

presetButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const minutes = Number(btn.dataset.minutes);
    customHours.value = Math.floor(minutes / 60);
    customMinutes.value = minutes % 60;
    presetButtons.forEach((b) => b.classList.toggle("selected", b === btn));
  });
});

[customHours, customMinutes].forEach((input) => {
  input.addEventListener("input", () => {
    presetButtons.forEach((b) => b.classList.remove("selected"));
  });
});

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    sessionMode = tab.dataset.mode;
    modeTabs.forEach((t) => t.classList.toggle("selected", t === tab));
    durationMode.style.display = sessionMode === "duration" ? "block" : "none";
    untilMode.style.display = sessionMode === "until" ? "block" : "none";
  });
});

function defaultUntilTime() {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
untilTime.value = defaultUntilTime();

function computeSessionMinutes() {
  if (sessionMode === "until") {
    const [h, m] = untilTime.value.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return 0;
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }
    return Math.round((target.getTime() - Date.now()) / 60000);
  }
  const hours = Number(customHours.value) || 0;
  const minutes = Number(customMinutes.value) || 0;
  return hours * 60 + minutes;
}

document.getElementById("startSession").addEventListener("click", () => {
  const minutes = computeSessionMinutes();
  if (minutes <= 0) return;
  const topic = studyTopicInput.value.trim();
  chrome.runtime.sendMessage({ type: "startSession", minutes, topic }, () => {
    renderSessionState();
  });
});

document.getElementById("stopSession").addEventListener("click", () => {
  // A quick snuff before the state actually flips, so ending early
  // reads as a real (small) cost rather than a silent no-op.
  snuffCandle();
  setTimeout(() => {
    chrome.runtime.sendMessage({ type: "stopSession" }, () => {
      renderSessionState();
    });
  }, 380);
});

load();
