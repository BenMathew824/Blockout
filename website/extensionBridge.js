// Hands an authenticated Supabase session off to the Locked In extension via
// chrome.runtime.sendMessage, using Manifest V3's externally_connectable —
// this only works if the extension's manifest.json lists this site's origin
// under externally_connectable.matches, and EXTENSION_ID below matches the
// real installed extension's ID (chrome://extensions -> Locked In -> ID).
export const EXTENSION_ID = "YOUR-EXTENSION-ID";

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
        console.warn("Locked In extension not reachable:", chrome.runtime.lastError.message);
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
