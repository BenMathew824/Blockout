import { supabase } from "./supabaseClient.js";

const newPasswordInput = document.getElementById("newPassword");
const errorEl = document.getElementById("error");
const submitBtn = document.getElementById("submit");

submitBtn.addEventListener("click", async () => {
  errorEl.textContent = "";
  const password = newPasswordInput.value;
  if (password.length < 6) {
    errorEl.textContent = "Password must be at least 6 characters.";
    return;
  }

  // supabase-js parses the recovery token out of this page's URL on load and
  // establishes a temporary session from it, which updateUser then acts on.
  // If the link was missing, already used, or expired, Supabase reports that
  // back here as an error instead of silently failing.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    errorEl.textContent = error.message;
    return;
  }
  window.location.href = "dashboard.html";
});
