const params = new URLSearchParams(location.search);
document.getElementById("site").textContent = params.get("site") || "This site";

chrome.storage.local.get(["studyTopic"], (data) => {
  if (data.studyTopic) {
    document.getElementById("topicText").textContent = data.studyTopic;
    document.getElementById("topic").style.display = "block";
  }
});

document.getElementById("back").addEventListener("click", () => {
  history.length > 1 ? history.back() : window.close();
});
