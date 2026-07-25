import { supabase } from "./supabaseClient.js";
import { pushSessionToExtension } from "./extensionBridge.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorEl = document.getElementById("error");
const modeTabs = document.querySelectorAll(".mode-tab");
const submitBtn = document.getElementById("submit");
const forgotPasswordRow = document.getElementById("forgotPasswordRow");

let mode = "signin";

modeTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    mode = tab.dataset.mode;
    modeTabs.forEach((t) => t.classList.toggle("selected", t === tab));
    submitBtn.textContent = mode === "signin" ? "Sign In" : "Sign Up";
    // Resetting a password only makes sense from the sign-in side.
    forgotPasswordRow.style.display = mode === "signin" ? "flex" : "none";
    errorEl.textContent = "";
  });
});

// --- Forgot password: swaps the credentials form for an email-only panel
// that calls Supabase's resetPasswordForEmail. The emailed link lands the
// user on reset-password.html with a recovery session already established
// (supabase-js parses the recovery token from the URL automatically).
const credentialsForm = document.getElementById("credentialsForm");
const forgotForm = document.getElementById("forgotForm");
const forgotEmailInput = document.getElementById("forgotEmail");
const forgotErrorEl = document.getElementById("forgotError");
const forgotSuccessEl = document.getElementById("forgotSuccess");

document.getElementById("forgotPasswordLink").addEventListener("click", () => {
  forgotEmailInput.value = emailInput.value;
  forgotErrorEl.textContent = "";
  forgotSuccessEl.textContent = "";
  credentialsForm.hidden = true;
  forgotForm.hidden = false;
});

document.getElementById("backToSignIn").addEventListener("click", () => {
  forgotForm.hidden = true;
  credentialsForm.hidden = false;
});

document.getElementById("forgotSubmit").addEventListener("click", async () => {
  forgotErrorEl.textContent = "";
  forgotSuccessEl.textContent = "";
  const email = forgotEmailInput.value.trim();
  if (!email) return;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });

  if (error) {
    forgotErrorEl.textContent = error.message;
    return;
  }
  forgotSuccessEl.textContent = "Check your email for a link to reset your password.";
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
