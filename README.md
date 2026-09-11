# YepFootball V3.1

Cloudflare Workers + Static Assets version for **yepfootball.com**.

## V3.1 changes
- Correct YepFootball branding.
- Live score endpoint covering Champions League, Premier League, La Liga, Serie A, Bundesliga and Ligue 1.
- Upcoming fixtures endpoint for the next 7 days.
- Automatic European football news feed.
- Browser score refresh every 2 minutes.
- Fixtures refresh every 15 minutes.
- News refresh every 30 minutes.
- Cloudflare Cron runs every 15 minutes to warm the data feeds.
- No API key is required for the included ESPN public data endpoints.

## Deploy
This repository is intended to be connected to the existing Cloudflare Worker:

`falling-morning-0e00`

Cloudflare Workers Builds:
- Build command: blank / None
- Deploy command: `npx wrangler deploy`
- Root directory: `/`
- Production branch: `main`

## Important
The upstream football feed is a public ESPN endpoint and can change without notice. For a production commercial service, replace it with a licensed football-data provider and follow that provider's terms.
