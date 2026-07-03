// auth.js — Supabase Auth (GoTrue) via plain fetch, no SDK. Loaded in both
// background.js (importScripts) and popup.html (<script src>), so this file
// must stay DOM-free to work in both a service worker and a page context.

async function storeSession(tokenResponse) {
  const authSession = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: Date.now() + tokenResponse.expires_in * 1000,
    user: {
      id: tokenResponse.user?.id,
      email: tokenResponse.user?.email,
    },
  };
  await chrome.storage.local.set({ authSession });
  return authSession;
}

async function getStoredSession() {
  const data = await chrome.storage.local.get(["authSession"]);
  return data.authSession || null;
}

async function signUp(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.msg || data.error_description || "Sign up failed");
  }
  if (data.access_token) {
    await storeSession(data);
  }
  return data;
}

async function signIn(email, password) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.msg || data.error_description || "Sign in failed");
  }
  return storeSession(data);
}

async function signOut() {
  const session = await getStoredSession();
  if (session) {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch (err) {
      // best-effort — clear the local session regardless of network errors
    }
  }
  await chrome.storage.local.remove("authSession");
}

// Refreshes the stored session if it's within 5 minutes of expiring.
// IMPORTANT: only background.js should call this directly. popup.js asks via
// a GET_VALID_SESSION message instead — Supabase rotates refresh tokens on
// use, so two contexts refreshing independently could race and revoke
// each other's session.
async function refreshIfNeeded() {
  const session = await getStoredSession();
  if (!session) return null;

  const fiveMinutes = 5 * 60 * 1000;
  if (session.expires_at - Date.now() > fiveMinutes) {
    return session;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await response.json();
    if (!response.ok) {
      // Refresh token is no longer valid — sign out locally.
      await chrome.storage.local.remove("authSession");
      return null;
    }
    return await storeSession(data);
  } catch (err) {
    // Network error — keep the existing (possibly stale) session rather
    // than signing the user out; try again next time.
    return session;
  }
}
