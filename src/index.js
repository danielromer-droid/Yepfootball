/* YepFootball Worker
   APIs:
   - API-Football: Latest Scores + European Match Centre
   - football-data.org: Fixtures
   - BBC Sport RSS: News

   Required Cloudflare resources:
   - Secret: API_FOOTBALL_KEY
   - Secret: FOOTBALL_DATA_TOKEN
   - KV binding: LATEST_SCORES

   IMPORTANT:
   Configure BOTH cron triggers in Cloudflare Workers:
     50 21 * * *
     50 22 * * *
   The worker checks Europe/Paris time and publishes only at 23:50 local time.
   This covers CET/CEST daylight-saving changes.
*/

const AF = "https://v3.football.api-sports.io";
const FD = "https://api.football-data.org/v4";
const BBC = "https://feeds.bbci.co.uk/sport/football/rss.xml";

const FD_LEAGUES = {
  CL: "Champions League",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};

const AF_LEAGUES = {
  2: "Champions League",
  3: "Europa League",
  848: "Conference League",
  39: "Premier League",
  140: "La Liga",
  135: "Serie A",
  78: "Bundesliga",
  61: "Ligue 1"
};

const FINAL = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

function json(data, status = 200, maxAge = 60) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "access-control-allow-origin": "*"
    }
  });
}

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const out = {};
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

function parisDate(date = new Date()) {
  const p = parisParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

async function afFetch(path, env, ttl = 15) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("Missing Cloudflare secret API_FOOTBALL_KEY");
  }

  const response = await fetch(`${AF}${path}`, {
    headers: {
      "x-apisports-key": env.API_FOOTBALL_KEY,
      "Accept": "application/json"
    },
    cf: {
      cacheTtl: ttl,
      cacheEverything: true
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API-Football ${response.status}: ${text.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("API-Football returned invalid JSON");
  }

  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

async function fdFetch(path, env, ttl = 120) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("Missing Cloudflare secret FOOTBALL_DATA_TOKEN");
  }

  const response = await fetch(`${FD}${path}`, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "Accept": "application/json"
    },
    cf: {
      cacheTtl: ttl,
      cacheEverything: true
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`football-data.org ${response.status}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("football-data.org returned invalid JSON");
  }
}

function afNorm(item) {
  const status = item.fixture?.status || {};
  const home = item.teams?.home || {};
  const away = item.teams?.away || {};
  const leagueId = Number(item.league?.id);

  return {
    id: String(item.fixture?.id),
    date: item.fixture?.date || null,
    status: status.short || "",
    statusLong: status.long || "",
    minute: status.elapsed ?? null,
    live: ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(status.short),
    league: AF_LEAGUES[leagueId] || item.league?.name || "European football",
    leagueCode: String(leagueId || ""),
    leagueId,
    homeTeam: {
      id: home.id,
      name: home.name || "",
      shortName: home.name || "",
      crest: home.logo || ""
    },
    awayTeam: {
      id: away.id,
      name: away.name || "",
      shortName: away.name || "",
      crest: away.logo || ""
    },
    score: {
      home: item.goals?.home ?? null,
      away: item.goals?.away ?? null
    }
  };
}

async function dailyScores(env, date = parisDate()) {
  const query = new URLSearchParams({
    date,
    timezone: "Europe/Paris"
  });

  const data = await afFetch(`/fixtures?${query.toString()}`, env, 60);

  return (data.response || [])
    .filter(item => AF_LEAGUES[Number(item.league?.id)])
    .filter(item => FINAL.has(item.fixture?.status?.short))
    .map(afNorm)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/*
   Publish one daily snapshot.
   We write the new snapshot only after API-Football has returned successfully.
   Therefore an API failure never destroys the previous KV snapshot.
*/
async function publish(env) {
  if (!env.LATEST_SCORES) {
    throw new Error("Missing Cloudflare KV binding LATEST_SCORES");
  }

  const date = parisDate();
  const events = await dailyScores(env, date);

  const snapshot = {
    events,
    count: events.length,
    date,
    source: "API-Football",
    publishedAt: new Date().toISOString(),
    message: events.length ? null : "No completed matches recorded today."
  };

  // Only reached after a successful API request.
  await env.LATEST_SCORES.put("latest", JSON.stringify(snapshot));
  await env.LATEST_SCORES.put(`scores:${date}`, JSON.stringify(snapshot));

  return snapshot;
}

/*
   Public latest-scores endpoint.
   IMPORTANT: this endpoint NEVER calls the upstream API.
   It serves the persistent KV snapshot, so the page keeps the previous
   successful results between 00:00 and the next 23:50 publication.
*/
async function latest(env) {
  if (!env.LATEST_SCORES) {
    throw new Error("Missing Cloudflare KV binding LATEST_SCORES");
  }

  const snapshot = await env.LATEST_SCORES.get("latest", "json");

  if (snapshot) {
    return {
      ...snapshot,
      fallback: false
    };
  }

  return {
    events: [],
    count: 0,
    date: null,
    source: "API-Football",
    publishedAt: null,
    fallback: false,
    message: "No daily scores have been published yet."
  };
}

async function matchCentre(env) {
  const data = await afFetch(
    "/fixtures?live=all&timezone=Europe/Paris",
    env,
    10
  );

  const events = (data.response || [])
    .filter(item => AF_LEAGUES[Number(item.league?.id)])
    .map(afNorm)
    .filter(item => item.live)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    events,
    live: events,
    finished: [],
    upcoming: [],
    count: events.length,
    liveCount: events.length,
    source: "API-Football",
    updated: new Date().toISOString()
  };
}

function fdNorm(match) {
  return {
    id: String(match.id),
    date: match.utcDate,
    status: match.status,
    minute: match.minute ?? null,
    league: FD_LEAGUES[match.competition?.code] || match.competition?.name || "",
    leagueCode: match.competition?.code || "",
    matchday: match.matchday ?? null,
    stage: match.stage ?? null,
    homeTeam: {
      id: match.homeTeam?.id,
      name: match.homeTeam?.name || "",
      shortName: match.homeTeam?.shortName || match.homeTeam?.name || "",
      crest: match.homeTeam?.crest || ""
    },
    awayTeam: {
      id: match.awayTeam?.id,
      name: match.awayTeam?.name || "",
      shortName: match.awayTeam?.shortName || match.awayTeam?.name || "",
      crest: match.awayTeam?.crest || ""
    },
    score: match.score || {}
  };
}

async function fixtures(env) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);

  const query = new URLSearchParams({
    competitions: Object.keys(FD_LEAGUES).join(","),
    dateFrom: now.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10)
  });

  const data = await fdFetch(`/matches?${query.toString()}`, env, 300);

  const events = (data.matches || [])
    .map(fdNorm)
    .filter(item => new Date(item.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 60);

  return {
    events,
    count: events.length,
    message: events.length ? null : "No upcoming fixtures found.",
    source: "football-data.org",
    updated: new Date().toISOString()
  };
}

function decodeEntities(text = "") {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function xmlValue(xml, tag) {
  const match = xml.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i")
  );
  return match ? decodeEntities(match[1].trim()) : "";
}

function parseNews(xml) {
  const output = [];
  const items = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];

  for (const item of items) {
    const title = xmlValue(item, "title");
    const link = xmlValue(item, "link");
    if (!title || !link) continue;

    const mediaContent = item.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    const mediaThumbnail = item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const enclosure = item.match(/<enclosure[^>]+url=["']([^"']+)["']/i);

    output.push({
      title,
      link,
      source: "BBC Sport",
      published: xmlValue(item, "pubDate") || xmlValue(item, "dc:date"),
      description: xmlValue(item, "description")
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 240),
      image: mediaContent?.[1] || mediaThumbnail?.[1] || enclosure?.[1] || ""
    });
  }

  return output;
}

async function news() {
  const response = await fetch(BBC, {
    headers: {
      "User-Agent": "YepFootball/1.0 (+https://yepfootball.com)",
      "Accept": "application/rss+xml, application/xml, text/xml"
    },
    cf: {
      cacheTtl: 900,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw new Error(`BBC RSS ${response.status}`);
  }

  const articles = parseNews(await response.text()).slice(0, 12);

  return {
    articles,
    count: articles.length,
    source: {
      name: "BBC Sport",
      url: "https://www.bbc.com/sport/football"
    },
    updated: new Date().toISOString()
  };
}

async function health(env) {
  const started = Date.now();
  const result = {
    ok: true,
    upstreams: {},
    elapsedMs: 0,
    checked: new Date().toISOString()
  };

  try {
    await afFetch("/fixtures?live=all&timezone=Europe/Paris", env, 10);
    result.upstreams.apiFootball = "ok";
  } catch (error) {
    result.ok = false;
    result.upstreams.apiFootball = error.message || String(error);
  }

  try {
    await fdFetch("/matches", env, 30);
    result.upstreams.footballData = "ok";
  } catch (error) {
    result.ok = false;
    result.upstreams.footballData = error.message || String(error);
  }

  if (!env.LATEST_SCORES) {
    result.ok = false;
    result.upstreams.latestScores = "Missing KV binding LATEST_SCORES";
  } else {
    result.upstreams.latestScores = "ok";
  }

  result.elapsedMs = Date.now() - started;
  result.checked = new Date().toISOString();
  return result;
}

async function handle(request, env) {
  const path = new URL(request.url).pathname;

  try {
    if (path === "/api/health") {
      const result = await health(env);
      return json(result, result.ok ? 200 : 502, 30);
    }

    if (path === "/api/scores") {
      return json(await latest(env), 200, 300);
    }

    if (path === "/api/match-centre") {
      return json(await matchCentre(env), 200, 10);
    }

    if (path === "/api/fixtures") {
      return json(await fixtures(env), 200, 300);
    }

    if (path === "/api/news") {
      return json(await news(), 200, 900);
    }
  } catch (error) {
    return json(
      {
        error: "Football data feed unavailable",
        detail: error.message || String(error),
        checked: new Date().toISOString()
      },
      502,
      30
    );
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const response = await handle(request, env);
    return response || env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // Cloudflare cron is UTC. The two configured cron times cover CET/CEST.
    // Publish only when the actual Paris local time is 23:50.
    const now = new Date();
    const paris = parisParts(now);

    if (paris.hour === "23" && paris.minute === "50") {
      ctx.waitUntil(
        publish(env).catch(error => {
          // Do not delete or replace the previous KV snapshot on failure.
          console.error("Latest scores publication failed:", error);
        })
      );
    }
  }
};
