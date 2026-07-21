// Counts consecutive study days ending at today or yesterday (yesterday
// still "counts" so the streak doesn't reset the instant midnight passes
// with no session yet today). Mirrors the same logic in the extension's
// sync.js — duplicated rather than shared since the extension's classic
// scripts and this ES module aren't set up to share code without a build step.
export function computeStreak(sortedDaysDesc) {
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
