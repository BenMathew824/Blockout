const test = require("node:test");
const assert = require("node:assert/strict");
const { matchesAllowlist } = require("../allowlist.js");

test("matches an exact hostname", () => {
  assert.equal(matchesAllowlist("example.com", ["example.com"]), true);
});

test("matches a subdomain of an allowlisted domain", () => {
  assert.equal(matchesAllowlist("docs.google.com", ["google.com"]), true);
});

test("does not match an unrelated domain", () => {
  assert.equal(matchesAllowlist("evil.com", ["example.com"]), false);
});

test("does not match a domain that merely shares a suffix without a dot boundary", () => {
  // "notexample.com" ends with "example.com" as a raw string, but isn't a
  // subdomain of it — the "." + site check exists specifically to reject this.
  assert.equal(matchesAllowlist("notexample.com", ["example.com"]), false);
});

test("an empty allowlist matches nothing", () => {
  assert.equal(matchesAllowlist("example.com", []), false);
});
