import { supabase } from "./supabaseClient.js";
import { pushSessionToExtension, pushSignOutToExtension } from "./extensionBridge.js";

const emailEl = document.getElementById("userEmail");
const totalBlocksEl = document.getElementById("totalBlocks");
const topSitesEl = document.getElementById("topSites");
const allowlistEl = document.getElementById("allowlistList");
const newSiteInput = document.getElementById("newSite");
const addSiteError = document.getElementById("addSiteError");
const signOutBtn = document.getElementById("signOut");

const DOMAIN_REGEX = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;

async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) {
    window.location.href = "auth.html";
    return;
  }
  emailEl.textContent = data.session.user.email;

  // Re-push on every dashboard load — covers the case where the extension
  // was installed (or reinstalled) after the user already signed in here.
  pushSessionToExtension(data.session);

  await loadStats();
  await loadAllowlist();
}

async function loadStats() {
  const { data, error } = await supabase
    .from("site_blocks")
    .select("hostname, block_count")
    .order("block_count", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const total = data.reduce((sum, row) => sum + row.block_count, 0);
  totalBlocksEl.textContent = total;

  topSitesEl.innerHTML = "";
  if (!data.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No blocks yet";
    topSitesEl.appendChild(empty);
    return;
  }
  data.slice(0, 10).forEach((row) => {
    const rowEl = document.createElement("div");
    rowEl.className = "site-row";
    const label = document.createElement("span");
    label.textContent = row.hostname;
    const value = document.createElement("span");
    value.textContent = row.block_count;
    rowEl.appendChild(label);
    rowEl.appendChild(value);
    topSitesEl.appendChild(rowEl);
  });
}

async function loadAllowlist() {
  const { data, error } = await supabase
    .from("allowlist")
    .select("id, hostname")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  allowlistEl.innerHTML = "";
  if (!data.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No sites added yet";
    allowlistEl.appendChild(empty);
    return;
  }
  data.forEach((row) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = row.hostname;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.addEventListener("click", async () => {
      await supabase.from("allowlist").delete().eq("id", row.id);
      loadAllowlist();
    });
    li.appendChild(label);
    li.appendChild(removeBtn);
    allowlistEl.appendChild(li);
  });
}

document.getElementById("addSite").addEventListener("click", async () => {
  addSiteError.textContent = "";
  const raw = newSiteInput.value.trim().toLowerCase();
  if (!raw) return;
  const hostname = raw.replace(/^https?:\/\//, "").split("/")[0].split(":")[0];

  if (!DOMAIN_REGEX.test(hostname)) {
    addSiteError.textContent = "Enter a valid domain, e.g. docs.google.com";
    return;
  }

  const { error } = await supabase.from("allowlist").insert({ hostname });
  // Postgres unique_violation (already in the list) — treat as success, not an error.
  if (error && error.code !== "23505") {
    addSiteError.textContent = error.message;
    return;
  }
  newSiteInput.value = "";
  loadAllowlist();
});

document.getElementById("resetStats").addEventListener("click", async () => {
  await supabase.rpc("reset_site_blocks");
  loadStats();
});

signOutBtn.addEventListener("click", async () => {
  await supabase.auth.signOut();
  pushSignOutToExtension();
  window.location.href = "auth.html";
});

init();
