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
const toggleAiSettings = document.getElementById("toggleAiSettings");
const aiSettingsBody = document.getElementById("aiSettingsBody");
const apiKeyInput = document.getElementById("apiKeyInput");

let sessionMode = "duration";
let countdownInterval = null;

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

function startCountdown(sessionEndTime) {
  clearInterval(countdownInterval);
  const tick = () => {
    const remaining = sessionEndTime - Date.now();
    if (remaining <= 0) {
      clearInterval(countdownInterval);
      renderSessionState();
      return;
    }
    countdownEl.textContent = formatTime(remaining);
  };
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function renderSessionState() {
  chrome.storage.local.get(["sessionActive", "sessionEndTime", "studyTopic"], (data) => {
    if (data.sessionActive && data.sessionEndTime) {
      sessionActiveBox.style.display = "block";
      sessionSetupBox.style.display = "none";
      toggleRow.style.display = "none";
      studyTopicDisplay.textContent = data.studyTopic ? `📚 ${data.studyTopic}` : "";
      startCountdown(data.sessionEndTime);
    } else {
      sessionActiveBox.style.display = "none";
      sessionSetupBox.style.display = "block";
      toggleRow.style.display = "flex";
      clearInterval(countdownInterval);
    }
  });
}

function load() {
  chrome.storage.sync.get(["focusModeOn"], (data) => {
    focusToggle.checked = !!data.focusModeOn;
  });
  chrome.storage.local.get(["studyTopic"], (data) => {
    if (data.studyTopic) studyTopicInput.value = data.studyTopic;
  });
  chrome.storage.local.get(["anthropicApiKey"], (data) => {
    if (data.anthropicApiKey) apiKeyInput.placeholder = "•••••••• (key saved)";
  });
  renderSessionState();
}

toggleAiSettings.addEventListener("click", () => {
  const open = aiSettingsBody.style.display === "block";
  aiSettingsBody.style.display = open ? "none" : "block";
});

document.getElementById("saveApiKey").addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.local.set({ anthropicApiKey: key }, () => {
    apiKeyInput.value = "";
    apiKeyInput.placeholder = "•••••••• (key saved)";
  });
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
  chrome.runtime.sendMessage({ type: "stopSession" }, () => {
    renderSessionState();
  });
});

load();
