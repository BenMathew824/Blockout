// sync.js — mirrors local block stats and the allowlist to Supabase when
// signed in. Every function no-ops if there's no session. Never sits on the
// blocking decision path — local chrome.storage stays authoritative for that,
// this is purely a best-effort mirror for the website/cross-device view.

const PENDING_QUEUE_KEY = "pendingSyncQueue";

async function getAuthHeaders() {
  const session = await getStoredSession();
  if (!session) return null;
  return {
    "content-type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function queuePendingOp(op) {
  const data = await chrome.storage.local.get([PENDING_QUEUE_KEY]);
  const queue = data[PENDING_QUEUE_KEY] || [];
  queue.push({ ...op, attempts: 0 });
  await chrome.storage.local.set({ [PENDING_QUEUE_KEY]: queue });
}

async function syncBlockEvent(hostname) {
  const headers = await getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_block_count`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_hostname: hostname }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (err) {
    await queuePendingOp({ type: "block", hostname });
  }
}

async function pushAllowlistAdd(hostname) {
  const headers = await getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/allowlist`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ hostname }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (err) {
    await queuePendingOp({ type: "allowlist_add", hostname });
  }
}

async function pushAllowlistRemove(hostname) {
  const headers = await getAuthHeaders();
  if (!headers) return;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/allowlist?hostname=eq.${encodeURIComponent(hostname)}`,
      { method: "DELETE", headers }
    );
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (err) {
    await queuePendingOp({ type: "allowlist_remove", hostname });
  }
}

// Replaces the local allowlist wholesale with the backend's copy. Deliberate
// full replace (not a merge) — only this correctly reflects a deletion made
// on another device/the website. Callers should flushPendingQueue() first so
// not-yet-sent local writes aren't clobbered by a stale pull.
async function pullAndReplaceAllowlist() {
  const headers = await getAuthHeaders();
  if (!headers) return null;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/allowlist?select=hostname`, {
      headers,
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const rows = await response.json();
    const allowlist = rows.map((r) => r.hostname);
    await chrome.storage.sync.set({ allowlist });
    return allowlist;
  } catch (err) {
    return null;
  }
}

// Records today as a study day (idempotent — the unique(user_id, day)
// constraint means calling this more than once in a day is a no-op).
async function syncStudyDay() {
  const headers = await getAuthHeaders();
  if (!headers) return;

  const day = new Date().toISOString().slice(0, 10);
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/study_days`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ day }),
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
  } catch (err) {
    await queuePendingOp({ type: "study_day", day });
  }
}

// Given study-day strings sorted most-recent-first, counts consecutive days
// ending at today or yesterday (yesterday still counts as "active" so the
// streak doesn't reset the instant midnight passes with no session yet).
function computeStreak(sortedDaysDesc) {
  if (!sortedDaysDesc.length) return 0;

  const toISODate = (d) => d.toISOString().slice(0, 10);
  const today = toISODate(new Date());
  const yesterday = toISODate(new Date(Date.now() - 86400000));

  if (sortedDaysDesc[0] !== today && sortedDaysDesc[0] !== yesterday) return 0;

  let streak = 1;
  const cursor = new Date(sortedDaysDesc[0] + "T00:00:00Z");
  for (let i = 1; i < sortedDaysDesc.length; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (sortedDaysDesc[i] === toISODate(cursor)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

async function getCurrentStreak() {
  const headers = await getAuthHeaders();
  if (!headers) return 0;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/study_days?select=day&order=day.desc`, {
      headers,
    });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const rows = await response.json();
    return computeStreak(rows.map((r) => r.day));
  } catch (err) {
    return 0;
  }
}

async function flushPendingQueue() {
  const headers = await getAuthHeaders();
  if (!headers) return;

  const data = await chrome.storage.local.get([PENDING_QUEUE_KEY]);
  const queue = data[PENDING_QUEUE_KEY] || [];
  if (!queue.length) return;

  const remaining = [];
  for (const op of queue) {
    let ok = false;
    try {
      if (op.type === "block") {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_block_count`, {
          method: "POST",
          headers,
          body: JSON.stringify({ p_hostname: op.hostname }),
        });
        ok = response.ok;
      } else if (op.type === "allowlist_add") {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/allowlist`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify({ hostname: op.hostname }),
        });
        ok = response.ok;
      } else if (op.type === "allowlist_remove") {
        const response = await fetch(
          `${SUPABASE_URL}/rest/v1/allowlist?hostname=eq.${encodeURIComponent(op.hostname)}`,
          { method: "DELETE", headers }
        );
        ok = response.ok;
      } else if (op.type === "study_day") {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/study_days`, {
          method: "POST",
          headers: { ...headers, Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify({ day: op.day }),
        });
        ok = response.ok;
      }
    } catch (err) {
      ok = false;
    }

    if (!ok) {
      op.attempts += 1;
      // Drop the op after 5 failed attempts to avoid unbounded queue growth.
      if (op.attempts < 5) remaining.push(op);
    }
  }

  await chrome.storage.local.set({ [PENDING_QUEUE_KEY]: remaining });
}
