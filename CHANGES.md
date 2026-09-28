# YepFootball — September 2026 update

## Deploy
1. `npx wrangler deploy` (same Worker name, KV namespace and secrets as before).
2. Workers AI is enabled by the `"ai"` block in wrangler.jsonc — no API key needed.
   Remove that block to switch AI off; the site falls back to a plain summary.
3. Check `/api/health` — `bindings.AI` should be `true`.

## Bug fixes
- Videos now load: the page had no `#videos-grid` element, so the YouTube feed never rendered.
- Live scores now display (the Worker returned them; the page ignored them).
- Fixtures include `TIMED` matches (football-data.org's status for confirmed kick-offs);
  previously only `SCHEDULED` was requested, so most fixtures were missing.
- The 15-minute cron now runs: added a `scheduled` handler that refreshes KV.
- About/Terms moved inside `<main>`; fake "YepFootball v Europe" scoreline removed.

## New
- AI matchday briefing (`/api/briefing`), written only from real results, fixtures and
  BBC headlines; regenerated only when the data changes; labelled as AI on the page.
- KV caching for every endpoint, with stale-data fallback if an upstream API is down.
- Live ticker, featured-match scoreboard, league filters on scores and fixtures,
  fixtures grouped by day in the visitor's local time, inline video playback
  (UEFA still opens on YouTube — see OPEN_ON_YOUTUBE in app.js).
- Faster refresh while matches are live; pauses when the tab is hidden.
- SEO / sharing: Open Graph + Twitter tags, og-image.png, JSON-LD, canonical URL,
  favicon.svg, web app manifest (installable on phones).
- Accessibility: skip link, visible focus, aria-live scores, reduced-motion support.
