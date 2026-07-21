// Split out from background.js (rather than left inline) so it can be
// require()'d directly in tests — background.js itself calls importScripts()
// at load time, which only exists in a service-worker context and throws in
// plain Node.

function matchesAllowlist(hostname, allowlist) {
  return allowlist.some((site) => hostname === site || hostname.endsWith("." + site));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { matchesAllowlist };
}
