// Prefixes the tab's title with the session countdown (e.g. "(24:12) Page
// Title") while a focus session is active — visible right in the tab strip,
// which is otherwise unreachable by any extension UI.
(function () {
  let baseTitle = document.title;
  let lastSetTitle = null;
  let intervalId = null;

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  // Reloading the extension leaves any already-open tab's content script
  // holding a dead reference to the old extension context. Calling a chrome.*
  // API from that stale script throws "Extension context invalidated" —
  // since this runs on a 1s interval, that would otherwise repeat forever
  // until the tab itself is refreshed. Detect it and just stop ticking.
  function isExtensionContextValid() {
    return !!(chrome.runtime && chrome.runtime.id);
  }

  function tick() {
    if (!isExtensionContextValid()) {
      clearInterval(intervalId);
      return;
    }

    try {
      chrome.storage.local.get(["sessionActive", "sessionEndTime"], (data) => {
        if (chrome.runtime.lastError) return;

        if (!data.sessionActive || !data.sessionEndTime) {
          if (lastSetTitle !== null && document.title === lastSetTitle) {
            document.title = baseTitle;
          }
          lastSetTitle = null;
          return;
        }

        // If the title changed since we last set it, the page changed it on its
        // own (e.g. an SPA route change on YouTube) — that's the new base to prefix.
        if (lastSetTitle === null || document.title !== lastSetTitle) {
          baseTitle = document.title;
        }

        const remaining = data.sessionEndTime - Date.now();
        if (remaining <= 0) {
          document.title = baseTitle;
          lastSetTitle = null;
          return;
        }

        lastSetTitle = `(${formatCountdown(remaining)}) ${baseTitle}`;
        document.title = lastSetTitle;
      });
    } catch (err) {
      clearInterval(intervalId);
    }
  }

  tick();
  intervalId = setInterval(tick, 1000);
})();
