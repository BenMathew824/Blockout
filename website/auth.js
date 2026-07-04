import { supabase } from "./supabaseClient.js";
import { pushSessionToExtension } from "./extensionBridge.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorEl = document.getElementById("error");
const modeTabs = document.querySelectorAll(".mode-tab");
const submitBtn = document.getElementById("submit");

let mode = "signin";

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    modeTabs.forEach((t) => t.classList.toggle("selected", t === tab));
    submitBtn.textContent = mode === "signin" ? "Sign In" : "Sign Up";
    errorEl.textContent = "";
  });
});

submitBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  const { data, error } =
    mode === "signin"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });

  if (error) {
    errorEl.textContent = error.message;
    return;
  }

  if (mode === "signup" && !data.session) {
    errorEl.textContent = "Check your email to confirm your account, then sign in.";
    return;
  }

  pushSessionToExtension(data.session);
  window.location.href = "dashboard.html";
});

// Already signed in? Skip straight to the dashboard.
supabase.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = "dashboard.html";
});
