const params = new URLSearchParams(location.search);
document.getElementById("site").textContent = params.get("site") || "This site";

const ringProgress = document.getElementById("ringProgress");
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
ringProgress.style.strokeDashoffset = "0";

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

function startCountdown(startTime, endTime) {
  const countdownBox = document.getElementById("countdownBox");
  const countdownEl = document.getElementById("countdown");
  countdownBox.style.display = "block";

  const totalMs = endTime - startTime;

  const tick = () => {
    const remaining = endTime - Date.now();
    if (remaining <= 0) {
      countdownEl.textContent = "0:00";
      ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
      clearInterval(interval);
      return;
    }
    countdownEl.textContent = formatTime(remaining);
    const remainingFraction = totalMs > 0 ? remaining / totalMs : 0;
    ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - remainingFraction)}`;
  };

  tick();
  const interval = setInterval(tick, 1000);
}

chrome.storage.local.get(
  ["studyTopic", "sessionActive", "sessionStartTime", "sessionEndTime"],
  (data) => {
    if (data.studyTopic) {
      document.getElementById("topicText").textContent = data.studyTopic;
      document.getElementById("topic").style.display = "block";
    }

    if (data.sessionActive && data.sessionStartTime && data.sessionEndTime) {
      startCountdown(data.sessionStartTime, data.sessionEndTime);
    }
  }
);

const returnTo = params.get("returnTo");
const backButton = document.getElementById("back");

if (!returnTo) {
  backButton.textContent = "✕ Close Tab";
}

backButton.addEventListener("click", () => {
  if (returnTo) {
    location.href = returnTo;
  } else {
    window.close();
  }
});

// If the session ends (or Focus Mode is turned off) while this tab is still
// showing the block screen, release it automatically instead of leaving the
// user stuck here with no way of knowing the block is no longer active.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.focusModeOn) return;
  if (changes.focusModeOn.newValue !== false) return;

  if (returnTo) {
    location.href = returnTo;
  } else {
    document.querySelector("h1").textContent = "Session Ended";
    document.querySelector(".subtitle").textContent = "Focus Mode is off — you're free to browse.";
    backButton.textContent = "✕ Close Tab";
  }
});
