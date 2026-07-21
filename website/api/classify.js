// Vercel serverless function: lets signed-in users classify tabs without
// supplying their own Anthropic key. The extension calls this first when a
// Supabase session is present, and falls back to a direct Anthropic call
// with the user's own key (see background.js) if this proxy is unreachable,
// unauthenticated, or the caller is over their daily cap.
//
// Auth model: the extension sends the user's Supabase access token as a
// bearer token. We forward it to Supabase's GoTrue /auth/v1/user endpoint to
// confirm it's valid (rather than verifying the JWT locally), then use that
// same token for the usage-count read/increment below — Postgres RLS scopes
// both to the caller's own row, so this function never needs a service-role
// key or to pass user_id explicitly.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const DAILY_LIMIT = Number(process.env.CLASSIFY_DAILY_LIMIT) || 200;

async function getUserId(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id || null;
}

async function isUnderDailyLimit(accessToken) {
  const today = new Date().toISOString().slice(0, 10);
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/classification_usage?select=count&day=eq.${today}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (!response.ok) return true; // fail open on our own read — don't block on a transient error
  const rows = await response.json();
  const count = rows[0]?.count || 0;
  return count < DAILY_LIMIT;
}

async function recordUsage(accessToken) {
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_classification_count`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: "{}",
  });
}

async function classify(hostname, title, topic) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 60,
      messages: [
        {
          role: "user",
          content: `Study topic: "${topic}"\nWebsite hostname: ${hostname}\nPage title: "${title || ""}"\n\nIs this website/page likely relevant to studying the topic above?\n\nGuidelines:\n- If this is a generic homepage, search page, or other navigational page with no specific content shown yet (e.g. just "YouTube" or "Google" as the title), treat it as RELEVANT — the user may be about to search for or navigate to on-topic content, and blocking navigation itself would prevent that.\n- Only reply DISTRACTING if the page shows SPECIFIC content (a video, article, product, etc.) that is clearly unrelated to the topic.\n\nReply in exactly this format, two lines:\nRELEVANT or DISTRACTING\n<a short one-sentence reason why, under 15 words>`,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`anthropic status ${response.status}`);
  }

  const data = await response.json();
  const rawText = (data.content?.[0]?.text || "").trim();
  const lines = rawText.split("\n").map((line) => line.trim()).filter(Boolean);
  const verdict = (lines[0] || "").toUpperCase();
  const isDistracting = verdict.includes("DISTRACTING");
  const reason = lines.slice(1).join(" ").trim();
  return { isDistracting, reason };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!accessToken) {
    res.status(401).json({ error: "missing bearer token" });
    return;
  }

  const { hostname, title, topic } = req.body || {};
  if (!hostname || !topic) {
    res.status(400).json({ error: "hostname and topic are required" });
    return;
  }

  try {
    const userId = await getUserId(accessToken);
    if (!userId) {
      res.status(401).json({ error: "invalid session" });
      return;
    }

    const underLimit = await isUnderDailyLimit(accessToken);
    if (!underLimit) {
      res.status(429).json({ error: "daily classification limit reached" });
      return;
    }

    const result = await classify(hostname, title, topic);
    await recordUsage(accessToken);
    res.status(200).json(result);
  } catch (err) {
    res.status(502).json({ error: "classification upstream error" });
  }
};
