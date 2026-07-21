const test = require("node:test");
const assert = require("node:assert/strict");
const { computeStreak: computeStreakExtension } = require("../sync.js");

function daysAgoISO(n) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

test("extension sync.js: empty history has no streak", () => {
  assert.equal(computeStreakExtension([]), 0);
});

test("extension sync.js: a session today alone counts as a 1-day streak", () => {
  assert.equal(computeStreakExtension([daysAgoISO(0)]), 1);
});

test("extension sync.js: yesterday still counts as an active streak (grace period)", () => {
  assert.equal(computeStreakExtension([daysAgoISO(1)]), 1);
});

test("extension sync.js: a 2-day-old gap with nothing since resets the streak", () => {
  assert.equal(computeStreakExtension([daysAgoISO(2)]), 0);
});

test("extension sync.js: consecutive days ending yesterday count fully", () => {
  const days = [daysAgoISO(1), daysAgoISO(2), daysAgoISO(3)];
  assert.equal(computeStreakExtension(days), 3);
});

test("extension sync.js: a break partway through stops the count at the break", () => {
  const days = [daysAgoISO(0), daysAgoISO(1), daysAgoISO(3), daysAgoISO(4)];
  assert.equal(computeStreakExtension(days), 2);
});

test("website streak.mjs matches the extension's behavior", async () => {
  const { computeStreak: computeStreakWebsite } = await import("../website/streak.mjs");
  const days = [daysAgoISO(0), daysAgoISO(1), daysAgoISO(2)];
  assert.equal(computeStreakWebsite(days), 3);
  assert.equal(computeStreakWebsite([]), 0);
});
