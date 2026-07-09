# Chrome Web Store listing — copy to paste into the Developer Dashboard

## Extension name
Blockout

## Category
Productivity

## Short description (132 char max — currently 108)
AI-powered study focus blocker. Tell it your topic, start a session, and it blocks anything off-topic in real time.

## Detailed description

Blockout keeps you on what you're actually studying.

Most focus extensions rely on a static list of "distracting" sites you have to maintain
yourself. Blockout works differently: tell it what you're studying, start a session, and
every page you visit gets classified against that topic in real time using AI — no
manually curated blocklist required, and no false blocks on a YouTube video or article
that's actually relevant to your subject.

HOW IT WORKS
1. Type what you're studying — as specific as you want ("Calculus 1," "the French
   Revolution," anything).
2. Start a focus session for a set duration or until a specific time.
3. Every page you visit — including single-page apps like YouTube, where the page never
   fully reloads — gets checked against your topic. Off-topic? You're redirected to a
   blocked screen instantly, with a short explanation of why.

FEATURES
- AI topic detection, not a hardcoded blocklist
- Focus sessions with a live countdown, shown right in your browser tab title
- An "Always Allow" list for reference sites you need mid-session
- A study streak that tracks your consecutive days locked in
- Optional account (sign in on the website) to sync your stats and allowlist across
  devices — entirely optional, the extension works fully without one
- A session-complete notification when you finish, so you know your time's up even if
  you're not looking at the tab

WHAT IT NEEDS FROM YOU
Blockout uses Anthropic's Claude API to classify pages, and you provide your own API key
in the extension's settings — Blockout's own servers never see your browsing data, it
goes directly from your browser to Anthropic.

Full privacy policy: [ADD DEPLOYED WEBSITE URL]/privacy.html

## Screenshots needed (take these before submitting)
1. The popup with an active focus session running (countdown + topic visible)
2. The blocked page showing the AI's reasoning for a block
3. (Optional) The website dashboard showing stats/streak

## Privacy practices tab (Developer Dashboard will ask for this separately)
- Single purpose description: "Blocks websites that are off-topic for the user's current
  study session, determined by AI classification against a user-provided topic."
- Permission justifications: see website/privacy.html, "Why Blockout asks for the
  permissions it does" section — same wording works here.
- Data usage disclosure: check "Website content" (page titles/hostnames, sent to
  Anthropic for classification) and, if an account is used, "Personally identifiable
  information" (email) — both should be marked as NOT sold to third parties and used
  only for the extension's core functionality.
