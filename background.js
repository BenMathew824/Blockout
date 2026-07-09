importScripts("config.js", "auth.js", "sync.js");

const SESSION_END_ALARM = "focusSessionEnd";
const SESSION_TICK_ALARM = "focusSessionTick";
const SYNC_FLUSH_ALARM = "syncFlush";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["focusModeOn", "allowlist"], (data) => {
    if (data.focusModeOn === undefined) {
      chrome.storage.sync.set({ focusModeOn: false });
    }
    if (data.allowlist === undefined) {
      chrome.storage.sync.set({ allowlist: [] });
    }
  });
  chrome.storage.local.get(["sessionActive", "lifetimeStats"], (data) => {
    if (data.sessionActive === undefined) {
      chrome.storage.local.set({ sessionActive: false, sessionEndTime: null });
    }
    if (data.lifetimeStats === undefined) {
      chrome.storage.local.set({ lifetimeStats: { totalBlocks: 0, siteCounts: {} } });
    }
  });
  updateBadge();
  chrome.alarms.create(SYNC_FLUSH_ALARM, { periodInMinutes: 5 });
  console.log("Blockout installed and ready.");
});

chrome.runtime.onStartup.addListener(updateBadge);

// url|title|topic -> {isDistracting, reason}
// Keyed by url (not just hostname) so multi-page/SPA sites like YouTube or
// Reddit get a fresh verdict per page instead of reusing a previous page's
// answer. Title is also included: on the same url, a stale placeholder
// title (see GENERIC_NOTIFICATION_TITLE below) settling into the real title
// should still bust the cache and reclassify.
const classificationCache = new Map();

async function classifyTabRelevance(hostname, url, title, topic, apiKey) {
  const cacheKey = `${url}|${title}|${topic}`;
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
        max_tokens: 60,
        messages: [
          {
            role: "user",
            content: `Study topic: "${topic}"\nWebsite hostname: ${hostname}\nPage title: "${title || ""}"\n\nIs this website/page likely relevant to studying the topic above?\n\nGuidelines:\n- If this is a generic homepage, search page, or other navigational page with no specific content shown yet (e.g. just "YouTube" or "Google" as the title), treat it as RELEVANT — the user may be about to search for or navigate to on-topic content, and blocking navigation itself would prevent that.\n- Only reply DISTRACTING if the page shows SPECIFIC content (a video, article, product, etc.) that is clearly unrelated to the topic.\n\nReply in exactly this format, two lines:\nRELEVANT or DISTRACTING\n<a short one-sentence reason why, under 15 words>`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.warn("Blockout: classification request failed", response.status, errBody);
      return { isDistracting: false, reason: "" };
    }

    const data = await response.json();
    const rawText = (data.content?.[0]?.text || "").trim();
    const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
    const verdict = (lines[0] || "").toUpperCase();
    const isDistracting = verdict.includes("DISTRACTING");
    const reason = lines.slice(1).join(" ").trim();
    console.log(
      "Blockout: classified",
      hostname,
      `("${title}") as`,
      verdict || "(empty response)",
      reason ? `— ${reason}` : ""
    );
    const result = { isDistracting, reason };
    classificationCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("Blockout: classification error", err);
    return { isDistracting: false, reason: "" };
  }
}

function matchesAllowlist(hostname, allowlist) {
  return allowlist.some((site) => hostname === site || hostname.endsWith("." + site));
}

const YOUTUBE_HOSTNAME = /(^|\.)youtube\.com$/;

// Matches bare "(123) SiteName" titles — the transient notification-badge
// placeholder some sites (YouTube, Gmail) show before the real page title
// loads. The debounce in scheduleClassification catches most of these, but
// occasionally the title settles on exactly this placeholder with no further
// change event to reset the timer. This is a last-chance safety net.
const GENERIC_NOTIFICATION_TITLE = /^\(\d[\d,]*\)\s*[A-Za-z]+$/;

// focusTabTitle.js prepends "(mm:ss) " (or "(h:mm:ss) ") to document.title
// while a session is running, so tab.title read from the tabs API is no
// longer the page's real title — strip our own prefix back off before using
// it for anything classification-related, or every title looks polluted and
// the generic-placeholder check above stops matching real placeholders.
const TAB_TITLE_COUNTDOWN_PREFIX = /^\(\d{1,2}:\d{2}(:\d{2})?\)\s*/;

function stripCountdownPrefix(title) {
  return (title || "").replace(TAB_TITLE_COUNTDOWN_PREFIX, "");
}

// tabId -> the title actually used for that tab's last classification. On an
// SPA like YouTube, clicking a new video from the sidebar changes the url
// right away, but document.title can lag behind by a second or more while
// the new video's metadata loads — so the very next read can still be the
// PREVIOUS video's title. That title isn't a generic placeholder (it's a
// real, valid-looking title), so it wouldn't trip GENERIC_NOTIFICATION_TITLE
// below, and without this check we'd classify the new video using stale
// data left over from the one before it.
const lastClassifiedTitle = new Map();

async function getSettledTitle(tabId, initialTitle) {
  let title = initialTitle;
  const staleTitle = lastClassifiedTitle.get(tabId);
  for (
    let i = 0;
    i < 4 && (GENERIC_NOTIFICATION_TITLE.test(title) || (staleTitle !== undefined && title === staleTitle));
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      const tab = await chrome.tabs.get(tabId);
      title = stripCountdownPrefix(tab.title) || title;
    } catch (err) {
      return title; // tab closed — just use whatever we had
    }
  }
  return title;
}

async function recordBlock(hostname) {
  const data = await chrome.storage.local.get(["lifetimeStats", "sessionStats"]);
  const lifetimeStats = data.lifetimeStats || { totalBlocks: 0, siteCounts: {} };
  lifetimeStats.totalBlocks += 1;
  lifetimeStats.siteCounts[hostname] = (lifetimeStats.siteCounts[hostname] || 0) + 1;

  const updates = { lifetimeStats };

  if (data.sessionStats) {
    const sessionStats = data.sessionStats;
    sessionStats.totalBlocks += 1;
    sessionStats.siteCounts[hostname] = (sessionStats.siteCounts[hostname] || 0) + 1;
    updates.sessionStats = sessionStats;
  }

  await chrome.storage.local.set(updates);

  // Best-effort mirror to the backend if signed in — never blocks or
  // affects the local write above, which is what the extension itself relies on.
  syncBlockEvent(hostname);
}

// tabId -> last URL we've already run a classification for, so re-firing
// navigation events for the same final URL doesn't double-call the API.
const lastProcessedUrl = new Map();

// tabId -> last URL in that tab classified as RELEVANT, so the blocked page
// can offer to send the user back to on-topic content instead of the page
// that just got blocked (which is what browser history.back() would do).
const lastRelevantUrl = new Map();

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

  const syncData = await chrome.storage.sync.get(["focusModeOn", "allowlist"]);
  if (!syncData.focusModeOn) {
    console.log("Blockout: skipped", url, "- Focus Mode is off");
    return;
  }

  const hostname = new URL(url).hostname;
  if (matchesAllowlist(hostname, syncData.allowlist || [])) {
    lastRelevantUrl.set(tabId, url);
    console.log("Blockout: allowlisted, skipping classification for", hostname);
    return;
  }

  const localData = await chrome.storage.local.get(["studyTopic", "anthropicApiKey"]);
  if (!localData.studyTopic || !localData.anthropicApiKey) {
    console.log("Blockout: skipped", url, {
      hasStudyTopic: !!localData.studyTopic,
      hasApiKey: !!localData.anthropicApiKey,
    });
    return;
  }

  let title = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    title = stripCountdownPrefix(tab.title);
  } catch (err) {
    return; // tab closed before we could read it
  }
  title = await getSettledTitle(tabId, title);
  lastClassifiedTitle.set(tabId, title);

  const { isDistracting, reason } = await classifyTabRelevance(
    hostname,
    url,
    title,
    localData.studyTopic,
    localData.anthropicApiKey
  );
  if (isDistracting) {
    recordBlock(hostname);
    // "Return" would just send them back to the YouTube homepage/previous
    // video, not to actual on-topic content — offer "Close Tab" instead,
    // same as any other site with no relevant page to go back to.
    const returnTo = YOUTUBE_HOSTNAME.test(hostname) ? null : lastRelevantUrl.get(tabId);
    let blockedUrl = `blocked.html?site=${encodeURIComponent(hostname)}&blockedFrom=${encodeURIComponent(url)}`;
    if (reason) {
      blockedUrl += `&reason=${encodeURIComponent(reason)}`;
    }
    if (returnTo) {
      blockedUrl += `&returnTo=${encodeURIComponent(returnTo)}`;
    }
    // The tab may have been closed during the classification delay above —
    // ignore that case rather than letting it surface as an unhandled rejection.
    chrome.tabs.update(tabId, { url: chrome.runtime.getURL(blockedUrl) }).catch(() => {});
    // Otherwise, navigating back to this exact url later (browser back
    // button, re-clicking the same video) would hit this dedup guard and
    // silently skip reclassification, letting the blocked page play again
    // uncontested. Clearing it here means a later revisit is treated as a
    // fresh navigation and gets re-checked (and re-blocked) properly.
    lastProcessedUrl.delete(tabId);
  } else {
    lastRelevantUrl.set(tabId, url);
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
// focusTabTitle.js rewrites the title every second to show the session
// countdown, so most "changes" here are just our own tick, not the page's
// title actually settling — ignore those so the debounce isn't kept alive
// indefinitely and forced into the slower MAX_WAIT_MS fallback every time.
const lastCleanTitleByTab = new Map();

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.title === undefined) return;
  const cleanTitle = stripCountdownPrefix(changeInfo.title);
  if (lastCleanTitleByTab.get(tabId) === cleanTitle) return;
  lastCleanTitleByTab.set(tabId, cleanTitle);

  const pending = pendingNav.get(tabId);
  if (!pending) return;
  scheduleClassification(tabId, pending.url);
});

// Tabs opened before Focus Mode turns on never fire a fresh navigation
// event, so they'd otherwise sit unblocked all session. Whenever Focus
// Mode flips on (session start or manual toggle), check every open tab.
async function sweepOpenTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id !== undefined && tab.url && tab.url.startsWith("http")) {
      // Force a re-check even if this tab/url was already classified earlier.
      lastProcessedUrl.delete(tab.id);
      scheduleClassification(tab.id, tab.url);
    }
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.focusModeOn) return;
  if (changes.focusModeOn.newValue === true && changes.focusModeOn.oldValue !== true) {
    sweepOpenTabs();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  lastProcessedUrl.delete(tabId);
  lastRelevantUrl.delete(tabId);
  lastCleanTitleByTab.delete(tabId);
  lastClassifiedTitle.delete(tabId);
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
    sessionStats: { totalBlocks: 0, siteCounts: {} },
  });
  chrome.storage.sync.set({ focusModeOn: true });
  chrome.alarms.create(SESSION_END_ALARM, { when: endTime });
  chrome.alarms.create(SESSION_TICK_ALARM, { periodInMinutes: 1 });
  updateBadge();
  syncStudyDay();
}

function stopSession(showEndNotification) {
  chrome.alarms.clear(SESSION_END_ALARM);
  chrome.alarms.clear(SESSION_TICK_ALARM);

  if (showEndNotification) {
    Promise.all([
      chrome.storage.local.get(["studyTopic", "sessionStats"]),
      getCurrentStreak(),
    ]).then(([data, streak]) => {
      const topicLine = data.studyTopic ? ` on "${data.studyTopic}"` : "";
      const blocks = data.sessionStats?.totalBlocks || 0;
      const blockLine =
        blocks > 0
          ? ` You stayed on track through ${blocks} distraction${blocks === 1 ? "" : "s"} along the way.`
          : " You stayed distraction-free the whole time.";
      const streakLine =
        streak >= 2 ? ` 🔥 ${streak}-day streak!` : streak === 1 ? " 🔥 Streak started!" : "";
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: `Nice work! Session complete 🎉${streakLine}`,
        message: `You crushed your focus session${topicLine}.${blockLine}`,
      });
    });
  }

  chrome.storage.local.set({ sessionActive: false, sessionStartTime: null, sessionEndTime: null });
  chrome.storage.sync.set({ focusModeOn: false });
  chrome.action.setBadgeText({ text: "" });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SESSION_END_ALARM) {
    stopSession(true);
  } else if (alarm.name === SESSION_TICK_ALARM) {
    updateBadge();
  } else if (alarm.name === SYNC_FLUSH_ALARM) {
    // Flush first so a not-yet-sent local write isn't clobbered by the pull
    // that follows. This is now the only place the allowlist syncs down from
    // the website — the popup no longer has an Account section to trigger it.
    flushPendingQueue().then(() => pullAndReplaceAllowlist());
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "startSession") {
    startSession(message.minutes, message.topic);
    sendResponse({ ok: true });
  } else if (message.type === "stopSession") {
    stopSession();
    sendResponse({ ok: true });
  } else if (message.type === "GET_VALID_SESSION") {
    // All token refresh happens here, centrally — Supabase rotates refresh
    // tokens on use, so letting the popup refresh independently could race
    // with this and revoke each other's session.
    refreshIfNeeded().then((session) => sendResponse({ session }));
    return true;
  }
  return true;
});

// Lets the companion website hand off an authenticated session after the
// user signs in there, so the popup never needs its own sign-in form.
// Requires manifest.json's externally_connectable to match the site's origin.
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (message?.type === "AUTH_SESSION" && message.session) {
    chrome.storage.local.set({ authSession: message.session }, () => {
      pullAndReplaceAllowlist();
      sendResponse({ ok: true });
    });
    return true;
  }
  if (message?.type === "AUTH_SIGN_OUT") {
    chrome.storage.local.remove("authSession", () => sendResponse({ ok: true }));
    return true;
  }
});
