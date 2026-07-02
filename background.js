const SESSION_END_ALARM = "focusSessionEnd";
const SESSION_TICK_ALARM = "focusSessionTick";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["focusModeOn"], (data) => {
    if (data.focusModeOn === undefined) {
      chrome.storage.sync.set({ focusModeOn: false });
    }
  });
  chrome.storage.local.get(["sessionActive"], (data) => {
    if (data.sessionActive === undefined) {
      chrome.storage.local.set({ sessionActive: false, sessionEndTime: null });
    }
  });
  updateBadge();
  console.log("LockedIn installed and ready.");
});

chrome.runtime.onStartup.addListener(updateBadge);

// hostname|title|topic -> boolean (true = classified as distracting)
// Keyed by title (not just hostname) so multi-page/SPA sites like YouTube or
// Reddit get a fresh verdict per page instead of reusing the first page's answer.
const classificationCache = new Map();

async function classifyTabRelevance(hostname, title, topic, apiKey) {
  const cacheKey = `${hostname}|${title}|${topic}`;
  if (classificationCache.has(cacheKey)) {
    return classificationCache.get(cacheKey);
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 10,
        messages: [
          {
            role: "user",
            content: `Study topic: "${topic}"\nWebsite hostname: ${hostname}\nPage title: "${title || ""}"\n\nIs this website/page likely relevant to studying the topic above? Reply with exactly one word: RELEVANT or DISTRACTING.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn("LockedIn: classification request failed", response.status, errBody);
      return false;
    }

    const data = await response.json();
    const answer = (data.content?.[0]?.text || "").trim().toUpperCase();
    const isDistracting = answer.includes("DISTRACTING");
    console.log("LockedIn: classified", hostname, `("${title}") as`, answer || "(empty response)");
    classificationCache.set(cacheKey, isDistracting);
    return isDistracting;
  } catch (err) {
    console.warn("LockedIn: classification error", err);
    return false;
  }
}

// tabId -> last URL we've already run a classification for, so re-firing
// navigation events for the same final URL doesn't double-call the API.
const lastProcessedUrl = new Map();

// tabId -> { url, timer, firstSeenAt }. SPA sites (YouTube, etc.) can update
// document.title multiple times in quick succession after a route change
// (e.g. a notification-count title flickers before the real video title
// loads). Rather than guessing a fixed delay, reset the wait timer every
// time the title actually changes, and only classify once it's been quiet.
const pendingNav = new Map();
const DEBOUNCE_MS = 700;
const MAX_WAIT_MS = 4000;

function scheduleClassification(tabId, url) {
  const now = Date.now();
  const existing = pendingNav.get(tabId);
  const sameUrl = existing && existing.url === url;
  const firstSeenAt = sameUrl ? existing.firstSeenAt : now;

  if (existing) clearTimeout(existing.timer);

  const elapsed = now - firstSeenAt;
  const delay = elapsed >= MAX_WAIT_MS ? 0 : DEBOUNCE_MS;

  const timer = setTimeout(() => runClassification(tabId), delay);
  pendingNav.set(tabId, { url, timer, firstSeenAt });
}

async function runClassification(tabId) {
  const pending = pendingNav.get(tabId);
  if (!pending) return;
  pendingNav.delete(tabId);

  const url = pending.url;
  if (!url || !url.startsWith("http")) return;
  if (lastProcessedUrl.get(tabId) === url) return;
  lastProcessedUrl.set(tabId, url);

  const syncData = await chrome.storage.sync.get(["focusModeOn"]);
  if (!syncData.focusModeOn) {
    console.log("LockedIn: skipped", url, "- Focus Mode is off");
    return;
  }

  const localData = await chrome.storage.local.get(["studyTopic", "anthropicApiKey"]);
  if (!localData.studyTopic || !localData.anthropicApiKey) {
    console.log("LockedIn: skipped", url, {
      hasStudyTopic: !!localData.studyTopic,
      hasApiKey: !!localData.anthropicApiKey,
    });
    return;
  }

  let title = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    title = tab.title || "";
  } catch (err) {
    return; // tab closed before we could read it
  }

  const hostname = new URL(url).hostname;
  const isDistracting = await classifyTabRelevance(
    hostname,
    title,
    localData.studyTopic,
    localData.anthropicApiKey
  );
  if (isDistracting) {
    const blockedUrl = chrome.runtime.getURL(`blocked.html?site=${encodeURIComponent(hostname)}`);
    chrome.tabs.update(tabId, { url: blockedUrl });
  }
}

// Full page loads (frameId 0 = main frame, not iframes).
chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0 || !details.url) return;
  scheduleClassification(details.tabId, details.url);
});

// SPA navigations (history.pushState/replaceState) — e.g. clicking between
// videos on YouTube never triggers a full page load, only this event.
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0 || !details.url) return;
  scheduleClassification(details.tabId, details.url);
});

// Fires whenever the tab's displayed title changes — used here purely to
// reset the debounce timer while a classification is pending for that tab.
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.title === undefined) return;
  const pending = pendingNav.get(tabId);
  if (!pending) return;
  scheduleClassification(tabId, pending.url);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  lastProcessedUrl.delete(tabId);
  const pending = pendingNav.get(tabId);
  if (pending) clearTimeout(pending.timer);
  pendingNav.delete(tabId);
});

function updateBadge() {
  chrome.storage.local.get(["sessionActive", "sessionEndTime"], (data) => {
    if (!data.sessionActive || !data.sessionEndTime) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }
    const remainingMs = data.sessionEndTime - Date.now();
    if (remainingMs <= 0) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }
    const remainingMin = Math.ceil(remainingMs / 60000);
    const badgeText = remainingMin >= 60 ? `${Math.ceil(remainingMin / 60)}h` : String(remainingMin);
    chrome.action.setBadgeBackgroundColor({ color: "#e74c3c" });
    chrome.action.setBadgeText({ text: badgeText });
  });
}

function startSession(minutes, topic) {
  const startTime = Date.now();
  const endTime = startTime + minutes * 60 * 1000;
  chrome.storage.local.set({
    sessionActive: true,
    sessionStartTime: startTime,
    sessionEndTime: endTime,
    studyTopic: topic || "",
  });
  chrome.storage.sync.set({ focusModeOn: true });
  chrome.alarms.create(SESSION_END_ALARM, { when: endTime });
  chrome.alarms.create(SESSION_TICK_ALARM, { periodInMinutes: 1 });
  updateBadge();
}

function stopSession() {
  chrome.alarms.clear(SESSION_END_ALARM);
  chrome.alarms.clear(SESSION_TICK_ALARM);
  chrome.storage.local.set({ sessionActive: false, sessionStartTime: null, sessionEndTime: null });
  chrome.storage.sync.set({ focusModeOn: false });
  chrome.action.setBadgeText({ text: "" });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_END_ALARM) {
    stopSession();
  } else if (alarm.name === SESSION_TICK_ALARM) {
    updateBadge();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "startSession") {
    startSession(message.minutes, message.topic);
    sendResponse({ ok: true });
  } else if (message.type === "stopSession") {
    stopSession();
    sendResponse({ ok: true });
  }
  return true;
});
