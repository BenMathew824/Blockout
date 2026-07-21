// Hands an authenticated Supabase session off to the Blockout extension via
// chrome.runtime.sendMessage, using Manifest V3's externally_connectable —
// this only works if the extension's manifest.json lists this site's origin
// under externally_connectable.matches, and EXTENSION_ID below matches the
// real installed extension's ID (chrome://extensions -> Blockout -> ID).
export const EXTENSION_ID = "caahmbjoediomjiacdepnacalbmnnkia";

function hasExtensionMessaging() {
  return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;
}

export function pushSessionToExtension(session) {
  if (!hasExtensionMessaging() || !session) return;
  chrome.runtime.sendMessage(
    EXTENSION_ID,
    {
      type: "AUTH_SESSION",
      session: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: Date.now() + session.expires_in * 1000,
        user: { id: session.user.id, email: session.user.email },
      },
    },
    () => {
      if (chrome.runtime.lastError) {
        // Extension isn't installed, or this origin isn't in its
        // externally_connectable list yet — not an error the user needs to see.
        console.warn("Blockout extension not reachable:", chrome.runtime.lastError.message);
      }
    }
  );
}

export function pushSignOutToExtension() {
  if (!hasExtensionMessaging()) return;
  chrome.runtime.sendMessage(EXTENSION_ID, { type: "AUTH_SIGN_OUT" }, () => {
    void chrome.runtime.lastError; // ignore — same as above
  });
}

// Two-way call used by the dashboard's session card. Resolves to `null`
// (never rejects) when the extension isn't installed, isn't reachable from
// this origin, or doesn't answer within timeoutMs — the caller treats null
// as "no extension" rather than distinguishing the reason.
function callExtension(message, timeoutMs = 1200) {
  return new Promise((resolve) => {
    if (!hasExtensionMessaging()) {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(null);
    }, timeoutMs);
    chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(chrome.runtime.lastError ? null : response || null);
    });
  });
}

export function getExtensionSessionState() {
  return callExtension({ type: "GET_SESSION_STATE" });
}

export function startExtensionSession(minutes, topic) {
  return callExtension({ type: "START_SESSION", minutes, topic });
}

export function stopExtensionSession() {
  return callExtension({ type: "STOP_SESSION" });
}
