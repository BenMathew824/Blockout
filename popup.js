const focusToggle = document.getElementById("focusToggle");
const toggleRow = focusToggle.closest(".toggle-row");
const sessionActiveBox = document.getElementById("sessionActiveBox");
const sessionSetupBox = document.getElementById("sessionSetupBox");
const countdownEl = document.getElementById("countdown");
const sessionBlockCountEl = document.getElementById("sessionBlockCount");
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
const allowlistList = document.getElementById("allowlistList");
const newAllowSiteInput = document.getElementById("newAllowSite");
const statsTotalEl = document.getElementById("statsTotal");
const statsTopSitesEl = document.getElementById("statsTopSites");

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

function renderSessionBlockCount(sessionStats) {
  const count = sessionStats?.totalBlocks || 0;
  sessionBlockCountEl.textContent = `🚫 ${count} blocked this session`;
}

function renderSessionState() {
  chrome.storage.local.get(
    ["sessionActive", "sessionEndTime", "studyTopic", "sessionStats"],
    (data) => {
      if (data.sessionActive && data.sessionEndTime) {
        sessionActiveBox.style.display = "block";
        sessionSetupBox.style.display = "none";
        toggleRow.style.display = "none";
        studyTopicDisplay.textContent = data.studyTopic ? `📚 ${data.studyTopic}` : "";
        renderSessionBlockCount(data.sessionStats);
        startCountdown(data.sessionEndTime);
      } else {
        sessionActiveBox.style.display = "none";
        sessionSetupBox.style.display = "block";
        toggleRow.style.display = "flex";
        clearInterval(countdownInterval);
      }
    }
  );
}

function renderAllowlist(allowlist) {
  allowlistList.innerHTML = "";
  if (!allowlist.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No sites added yet";
    allowlistList.appendChild(empty);
    return;
  }
  allowlist.forEach((site) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = site;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", () => {
      const updated = allowlist.filter((s) => s !== site);
      chrome.storage.sync.set({ allowlist: updated }, () => renderAllowlist(updated));
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    allowlistList.appendChild(li);
  });
}

function renderStats(lifetimeStats) {
  const stats = lifetimeStats || { totalBlocks: 0, siteCounts: {} };
  statsTotalEl.textContent = stats.totalBlocks;

  const topSites = Object.entries(stats.siteCounts || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  statsTopSitesEl.innerHTML = "";
  if (!topSites.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No blocks yet";
    statsTopSitesEl.appendChild(empty);
    return;
  }
  topSites.forEach(([site, count]) => {
    const row = document.createElement("div");
    row.className = "site-row";
    const label = document.createElement("span");
    label.textContent = site;
    const value = document.createElement("span");
    value.textContent = count;
    row.appendChild(label);
    row.appendChild(value);
    statsTopSitesEl.appendChild(row);
  });
}

function load() {
  chrome.storage.sync.get(["focusModeOn", "allowlist"], (data) => {
    focusToggle.checked = !!data.focusModeOn;
    renderAllowlist(data.allowlist || []);
  });
  chrome.storage.local.get(["studyTopic", "anthropicApiKey", "lifetimeStats"], (data) => {
    if (data.studyTopic) studyTopicInput.value = data.studyTopic;
    if (data.anthropicApiKey) apiKeyInput.placeholder = "•••••••• (key saved)";
    renderStats(data.lifetimeStats);
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

document.getElementById("addAllowSite").addEventListener("click", () => {
  const raw = newAllowSiteInput.value.trim().toLowerCase();
  if (!raw) return;
  const hostname = raw.replace(/^https?:\/\//, "").split("/")[0];

  chrome.storage.sync.get(["allowlist"], (data) => {
    const allowlist = data.allowlist || [];
    if (!allowlist.includes(hostname)) {
      allowlist.push(hostname);
      chrome.storage.sync.set({ allowlist }, () => renderAllowlist(allowlist));
    }
    newAllowSiteInput.value = "";
  });
});

document.getElementById("resetStats").addEventListener("click", () => {
  const cleared = { totalBlocks: 0, siteCounts: {} };
  chrome.storage.local.set({ lifetimeStats: cleared }, () => renderStats(cleared));
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.sessionStats) {
    renderSessionBlockCount(changes.sessionStats.newValue);
  }
  if (area === "local" && changes.lifetimeStats) {
    renderStats(changes.lifetimeStats.newValue);
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
  chrome.runtime.sendMessage({ type: "stopSession" }, () => {
    renderSessionState();
  });
});

load();
