// Prefixes the tab's title with the session countdown (e.g. "(24:12) Page
// Title") while a focus session is active — visible right in the tab strip,
// which is otherwise unreachable by any extension UI.
(function () {
  let baseTitle = document.title;
  let lastSetTitle = null;

  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function tick() {
    chrome.storage.local.get(["sessionActive", "sessionEndTime"], (data) => {
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
  }

  tick();
  setInterval(tick, 1000);
})();
