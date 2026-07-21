// Landing-page "try it" demo. Verdicts are canned per sample chip (not a
// live model call — there's no backend here), so copy only ever claims this
// "mirrors" the real check, never that it IS one.
const topicInput = document.getElementById("demoTopic");
const chips = document.querySelectorAll(".demo-site-chip");
const urlEl = document.getElementById("demoUrl");
const mockup = document.getElementById("demoMockup");
const idleEl = document.getElementById("demoIdle");
const resultEl = document.getElementById("demoResult");
const ringProgress = document.getElementById("demoRingProgress");
const resultIcon = document.getElementById("demoResultIcon");
const resultHeading = document.getElementById("demoResultHeading");
const resultSite = document.getElementById("demoResultSite");
const resultReason = document.getElementById("demoResultReason");
const resultTopic = document.getElementById("demoResultTopic");

const CHECK_ICON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const LOCK_ICON =
  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"/></svg>';

const RING_CIRCUMFERENCE = 188.5;

// Bumped on every click so a fast second click cancels the first click's
// pending reveal instead of both landing out of order.
let classifyToken = 0;

function classify(chip) {
  const token = ++classifyToken;
  const { url, verdict, reason } = chip.dataset;

  chips.forEach((c) => c.classList.toggle("active", c === chip));
  urlEl.textContent = url;

  idleEl.style.display = "none";
  resultEl.style.display = "block";
  resultEl.classList.remove("revealed");
  mockup.classList.remove("verdict-allowed", "verdict-blocked");
  mockup.classList.add("checking");
  resultIcon.innerHTML = "";

  ringProgress.style.transition = "none";
  ringProgress.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
  void ringProgress.offsetWidth; // force reflow so the transition below re-triggers
  ringProgress.style.transition = "stroke-dashoffset 0.6s ease";
  requestAnimationFrame(() => {
    ringProgress.style.strokeDashoffset = "0";
  });

  setTimeout(() => {
    if (token !== classifyToken) return;
    const topic = topicInput.value.trim() || "your topic";

    mockup.classList.remove("checking");
    mockup.classList.add(verdict === "allowed" ? "verdict-allowed" : "verdict-blocked");
    resultIcon.innerHTML = verdict === "allowed" ? CHECK_ICON : LOCK_ICON;
    resultHeading.textContent = verdict === "allowed" ? "Right on topic" : "Blocked Out";
    resultSite.textContent = url;
    resultReason.textContent = reason;
    resultTopic.textContent = topic;
    resultEl.classList.add("revealed");
  }, 650);
}

chips.forEach((chip) => chip.addEventListener("click", () => classify(chip)));
