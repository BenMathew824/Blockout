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

// hostname|topic -> boolean (true = classified as distracting)
const classificationCache = new Map();

async function classifyTabRelevance(hostname, title, topic, apiKey) {
  const cacheKey = `${hostname}|${topic}`;
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
      console.warn("LockedIn: classification request failed", response.status);
      return false;
    }

    const data = await response.json();
    const answer = (data.content?.[0]?.text || "").trim().toUpperCase();
    const isDistracting = answer.includes("DISTRACTING");
    classificationCache.set(cacheKey, isDistracting);
    return isDistracting;
  } catch (err) {
    console.warn("LockedIn: classification error", err);
    return false;
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  if (!tab.url.startsWith("http")) return;

  chrome.storage.sync.get(["focusModeOn"], (syncData) => {
    if (!syncData.focusModeOn) return;

    const hostname = new URL(tab.url).hostname;

    chrome.storage.local.get(["studyTopic", "anthropicApiKey"], (localData) => {
      if (!localData.studyTopic || !localData.anthropicApiKey) return;

      classifyTabRelevance(hostname, tab.title, localData.studyTopic, localData.anthropicApiKey).then(
        (isDistracting) => {
          if (isDistracting) {
            const blockedUrl = chrome.runtime.getURL(
              `blocked.html?site=${encodeURIComponent(hostname)}`
            );
            chrome.tabs.update(tabId, { url: blockedUrl });
          }
        }
      );
    });
  });
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
  const endTime = Date.now() + minutes * 60 * 1000;
  chrome.storage.local.set({ sessionActive: true, sessionEndTime: endTime, studyTopic: topic || "" });
  chrome.storage.sync.set({ focusModeOn: true });
  chrome.alarms.create(SESSION_END_ALARM, { when: endTime });
  chrome.alarms.create(SESSION_TICK_ALARM, { periodInMinutes: 1 });
  updateBadge();
}

function stopSession() {
  chrome.alarms.clear(SESSION_END_ALARM);
  chrome.alarms.clear(SESSION_TICK_ALARM);
  chrome.storage.local.set({ sessionActive: false, sessionEndTime: null });
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
