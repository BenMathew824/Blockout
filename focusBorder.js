// Draws a thin gradient border around the edge of every page while Focus
// Mode is on — a visual reminder that's visible no matter what site you're
// on, without touching the actual browser window (extensions can't reach
// the native window chrome; this overlays the page content instead).
(function () {
  const OVERLAY_ID = "locked-in-focus-border";

  function createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      border: 6px solid transparent;
      border-image: linear-gradient(90deg, #e74c3c, #f39c12) 1;
      pointer-events: none;
      z-index: 2147483647;
      display: none;
    `;
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function setVisible(visible) {
    const overlay = document.getElementById(OVERLAY_ID) || createOverlay();
    overlay.style.display = visible ? "block" : "none";
  }

  chrome.storage.sync.get(["focusModeOn"], (data) => {
    setVisible(!!data.focusModeOn);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.focusModeOn) {
      setVisible(!!changes.focusModeOn.newValue);
    }
  });
})();
