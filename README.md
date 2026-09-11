# YepFootball v3

Cloudflare Workers + Static Assets version.

## What is new
- Correct YepFootball branding everywhere.
- Server-side `/api/scores`, `/api/fixtures`, and `/api/news` endpoints.
- Scores/fixtures cover Champions League, Premier League, La Liga, Serie A, Bundesliga and Ligue 1.
- Scores refresh in the browser every 2 minutes.
- Cloudflare Cron Trigger runs every 15 minutes to warm the football/news feeds even when nobody is visiting.
- News is fetched server-side from Google News RSS searches by competition and displayed with source links.
- Static HTML/CSS/JS are served by the same Worker.

## Deploying to an existing Cloudflare Worker
This package is intended for Cloudflare Workers with Static Assets, not Pages Direct Upload.
If using Wrangler: `npx wrangler deploy` from this folder.
If using the Cloudflare dashboard, use the Worker code editor / deploy flow and make sure the Worker has Static Assets configured with `public/` as its assets directory and the Cron Trigger is `*/15 * * * *`.

## Important
The site currently uses ESPN's public scoreboard endpoints for scores/fixtures and Google News RSS for news, so no API key is required in this version. For a commercial/high-volume product, consider moving to a licensed football-data/news provider and respecting their terms/rate limits.
YepFootball V3 - automatic deployment enabled.
