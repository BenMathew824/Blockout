import { supabase } from "./supabaseClient.js";
import {
  pushSessionToExtension,
  pushSignOutToExtension,
  getExtensionSessionState,
  startExtensionSession,
  stopExtensionSession,
} from "./extensionBridge.js";
import { computeStreak } from "./streak.mjs";

const emailEl = document.getElementById("userEmail");
const totalBlocksEl = document.getElementById("totalBlocks");
const topSitesEl = document.getElementById("topSites");
const allowlistEl = document.getElementById("allowlistList");
const presetChipsEl = document.getElementById("presetChips");
const newSiteInput = document.getElementById("newSite");
const addSiteError = document.getElementById("addSiteError");
const signOutBtn = document.getElementById("signOut");
const streakRowEl = document.getElementById("streakRow");
const streakTextEl = document.getElementById("streakText");
const sessionCardBody = document.getElementById("sessionCardBody");
const activityHeatmapEl = document.getElementById("activityHeatmap");

const DOMAIN_REGEX = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

const PRESET_TOOLS = [
  { name: "Google Docs", hostname: "docs.google.com" },
  { name: "Google Drive", hostname: "drive.google.com" },
  { name: "Google Scholar", hostname: "scholar.google.com" },
  { name: "Notion", hostname: "notion.so" },
  { name: "Quizlet", hostname: "quizlet.com" },
  { name: "Khan Academy", hostname: "khanacademy.org" },
  { name: "Canvas", hostname: "instructure.com" },
  { name: "Blackboard", hostname: "blackboard.com" },
  { name: "Wikipedia", hostname: "wikipedia.org" },
  { name: "ChatGPT", hostname: "chat.openai.com" },
  { name: "Coursera", hostname: "coursera.org" },
  { name: "Google Calendar", hostname: "calendar.google.com" },
  { name: "Desmos", hostname: "desmos.com" },
  { name: "Overleaf", hostname: "overleaf.com" },
  { name: "Zoom", hostname: "zoom.us" },
];

async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = "auth.html";
    return;
  }
  emailEl.textContent = data.session.user.email;

  // Re-push on every dashboard load — covers the case where the extension
  // was installed (or reinstalled) after the user already signed in here.
  pushSessionToExtension(data.session);

  await loadStats();
  await loadAllowlist();
  await loadStreak();
  await loadActivityHeatmap();
  refreshSessionCard();
}

async function loadStreak() {
  const { data, error } = await supabase
    .from("study_days")
    .select("day")
    .order("day", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const streak = computeStreak(data.map((row) => row.day));
  if (streak > 0) {
    streakTextEl.textContent = `${streak}-day streak`;
    streakRowEl.style.display = "flex";
  } else {
    streakRowEl.style.display = "none";
  }
}

// --- Focus session card: mirrors and controls the real extension session.
// The website has no way to read chrome.storage.local directly, so state
// comes entirely from GET_SESSION_STATE round-trips through extensionBridge.

let selectedSessionMinutes = 25;
let sessionCountdownTimer = null;
let sessionPollTimer = null;

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderSessionUnavailable() {
  clearInterval(sessionCountdownTimer);
  sessionCardBody.innerHTML = `
    <h2 class="friendly-heading">Focus Session</h2>
    <p class="card-subtitle">Install the Blockout extension to start and track sessions from here.</p>
    <a href="https://github.com/BenMathew824/blockout" class="btn-secondary" style="display: inline-block;">Get the extension</a>
  `;
}

function renderSessionIdle() {
  clearInterval(sessionCountdownTimer);
  sessionCardBody.innerHTML = `
    <h2 class="friendly-heading">Start a focus session</h2>
    <p class="card-subtitle">Runs through the Blockout extension in this browser.</p>
    <div class="session-duration-row" id="sessionDurationRow">
      <button type="button" class="preset-chip" data-minutes="25">25m</button>
      <button type="button" class="preset-chip" data-minutes="50">50m</button>
      <button type="button" class="preset-chip" data-minutes="90">90m</button>
    </div>
    <input type="text" id="sessionTopicInput" placeholder="What are you studying?" />
    <button type="button" id="sessionStartBtn" class="btn-primary" style="width: 100%;">Start Focus Session</button>
  `;

  const chips = sessionCardBody.querySelectorAll(".preset-chip");
  chips.forEach((chip) => {
    chip.classList.toggle("selected", Number(chip.dataset.minutes) === selectedSessionMinutes);
    chip.addEventListener("click", () => {
      selectedSessionMinutes = Number(chip.dataset.minutes);
      chips.forEach((c) => c.classList.toggle("selected", c === chip));
    });
  });

  document.getElementById("sessionStartBtn").addEventListener("click", async () => {
    const topic = document.getElementById("sessionTopicInput").value.trim();
    await startExtensionSession(selectedSessionMinutes, topic);
    const state = await getExtensionSessionState();
    if (state?.sessionActive) renderSessionActive(state);
  });
}

function renderSessionActive(state) {
  clearInterval(sessionCountdownTimer);
  const heading = state.studyTopic
    ? `Focusing on “${state.studyTopic}”`
    : "Focus session active";
  sessionCardBody.innerHTML = `
    <h2 class="friendly-heading">${escapeHtml(heading)}</h2>
    <div class="stat-total gradient-text" id="sessionCountdown">--:--</div>
    <div class="card-subtitle" id="sessionBlockedText"></div>
    <button type="button" id="sessionStopBtn" class="btn-secondary" style="width: 100%;">End Session Early</button>
  `;

  const countdownEl = document.getElementById("sessionCountdown");
  const blockedEl = document.getElementById("sessionBlockedText");
  const tick = () => { countdownEl.textContent = formatCountdown(state.sessionEndTime - Date.now()); };
  tick();
  sessionCountdownTimer = setInterval(tick, 1000);
  blockedEl.textContent = `${state.sessionStats?.totalBlocks || 0} blocked this session`;

  document.getElementById("sessionStopBtn").addEventListener("click", async () => {
    await stopExtensionSession();
    renderSessionIdle();
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function refreshSessionCard() {
  const state = await getExtensionSessionState();
  if (!state) {
    renderSessionUnavailable();
    return;
  }
  if (state.sessionActive && state.sessionEndTime) {
    renderSessionActive(state);
  } else {
    renderSessionIdle();
  }

  // Keeps the card in sync if a session is started/stopped from the popup
  // instead of from here — the website has no event to listen for, so poll.
  clearInterval(sessionPollTimer);
  sessionPollTimer = setInterval(async () => {
    const s = await getExtensionSessionState();
    if (!s) return;
    const nowActive = !!(s.sessionActive && s.sessionEndTime);
    const cardShowsActive = !!document.getElementById("sessionCountdown");
    if (nowActive !== cardShowsActive) {
      nowActive ? renderSessionActive(s) : renderSessionIdle();
    } else if (nowActive) {
      const blockedEl = document.getElementById("sessionBlockedText");
      if (blockedEl) blockedEl.textContent = `${s.sessionStats?.totalBlocks || 0} blocked this session`;
    }
  }, 4000);
}

// --- Study activity heatmap: a GitHub-style contribution grid built from
// study_days (one row per calendar day a session was started). Binary per
// day (studied / not) since that's all the table tracks.
async function loadActivityHeatmap() {
  const { data, error } = await supabase.from("study_days").select("day");
  if (error) {
    console.error(error);
    return;
  }
  const studied = new Set(data.map((row) => row.day));

  const WEEKS = 18;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (WEEKS * 7 - 1));
  start.setDate(start.getDate() - start.getDay()); // back up to the preceding Sunday

  const toISODate = (d) => d.toISOString().slice(0, 10);
  const totalCells = Math.round((today - start) / 86400000) + 1;

  activityHeatmapEl.innerHTML = "";
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const iso = toISODate(d);
    const cell = document.createElement("div");
    cell.className = "hm-cell";
    if (d > today) {
      cell.classList.add("hm-future");
    } else if (studied.has(iso)) {
      cell.classList.add("hm-active");
      cell.title = `${d.toDateString()} — studied`;
    } else {
      cell.title = d.toDateString();
    }
    activityHeatmapEl.appendChild(cell);
  }
}

async function loadStats() {
  const { data, error } = await supabase
    .from("site_blocks")
    .select("hostname, block_count")
    .order("block_count", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const total = data.reduce((sum, row) => sum + row.block_count, 0);
  totalBlocksEl.textContent = total;

  topSitesEl.innerHTML = "";
  if (!data.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No blocks yet";
    topSitesEl.appendChild(empty);
    return;
  }
  data.slice(0, 10).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "site-row";
    const label = document.createElement("span");
    label.textContent = row.hostname;
    const value = document.createElement("span");
    value.textContent = row.block_count;
    rowEl.appendChild(label);
    rowEl.appendChild(value);
    topSitesEl.appendChild(rowEl);
  });
}

function renderPresetChips(currentHostnames) {
  presetChipsEl.innerHTML = "";
  PRESET_TOOLS.forEach((tool) => {
    const isAdded = currentHostnames.includes(tool.hostname);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "preset-chip" + (isAdded ? " added" : "");
    chip.textContent = tool.name;
    chip.addEventListener("click", async () => {
      if (isAdded) {
        await supabase.from("allowlist").delete().eq("hostname", tool.hostname);
      } else {
        await supabase.from("allowlist").insert({ hostname: tool.hostname });
      }
      loadAllowlist();
    });
    presetChipsEl.appendChild(chip);
  });
}

async function loadAllowlist() {
  const { data, error } = await supabase
    .from("allowlist")
    .select("id, hostname")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  renderPresetChips(data.map((row) => row.hostname));

  allowlistEl.innerHTML = "";
  if (!data.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No sites added yet";
    allowlistEl.appendChild(empty);
    return;
  }
  data.forEach((row) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = row.hostname;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async () => {
      await supabase.from("allowlist").delete().eq("id", row.id);
      loadAllowlist();
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    allowlistEl.appendChild(li);
  });
}

document.getElementById("addSite").addEventListener("click", async () => {
  addSiteError.textContent = "";
  const raw = newSiteInput.value.trim().toLowerCase();
  if (!raw) return;
  const hostname = raw.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];

  if (!DOMAIN_REGEX.test(hostname)) {
    addSiteError.textContent = "Enter a valid domain, e.g. docs.google.com";
    return;
  }

  const { error } = await supabase.from("allowlist").insert({ hostname });
  // Postgres unique_violation (already in the list) — treat as success, not an error.
  if (error && error.code !== "23505") {
    addSiteError.textContent = error.message;
    return;
  }
  newSiteInput.value = "";
  loadAllowlist();
});

document.getElementById("resetStats").addEventListener("click", async () => {
  await supabase.rpc("reset_site_blocks");
  loadStats();
});

signOutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  pushSignOutToExtension();
  window.location.href = "auth.html";
});

init();
