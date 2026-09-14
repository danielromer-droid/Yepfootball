// YepFootball Cloudflare Worker
//
// Services used:
//   API-Football       -> Latest Scores + European Match Centre
//   football-data.org  -> Upcoming Fixtures
//   BBC Sport RSS      -> Football News
//   Cloudflare KV      -> Persistent Latest Scores snapshot
//
// Required Cloudflare bindings/secrets:
//   Secret: API_FOOTBALL_KEY
//   Secret: FOOTBALL_DATA_TOKEN
//   KV binding: LATEST_SCORES -> your "YepFootball Scores" namespace
//   Assets binding: ASSETS (created by Cloudflare Pages/Workers Assets)

const API_FOOTBALL = "https://v3.football.api-sports.io";
const FOOTBALL_DATA = "https://api.football-data.org/v4";
const BBC = "https://feeds.bbci.co.uk/sport/football/rss.xml";
const PARIS_TIME_ZONE = "Europe/Paris";
const KV_KEY = "latest";

const LEAGUES = {
  CL: { id: 2, name: "Champions League" },
  PL: { id: 39, name: "Premier League" },
  PD: { id: 140, name: "La Liga" },
  SA: { id: 135, name: "Serie A" },
  BL1: { id: 78, name: "Bundesliga" },
  FL1: { id: 61, name: "Ligue 1" }
};

const FOOTBALL_DATA_LEAGUES = {
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

const FINAL_STATUSES = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const LIVE_STATUSES = new Set(["1H", "HT", "2H", "ET", "BT", "P", "LIVE"]);

function json(data, status = 200, maxAge = 30) {
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
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== "literal") out[p.type] = p.value;
  return out;
}

function parisDate(date = new Date()) {
  const p = parisParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function isPublicationWindowParis(date = new Date()) {
  const p = parisParts(date);
  return p.hour === "23" && Number(p.minute) >= 50;
}

async function afFetch(path, env, cacheSeconds = 30) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("Missing Cloudflare secret API_FOOTBALL_KEY");
  }

  const response = await fetch(`${API_FOOTBALL}${path}`, {
    headers: {
      "x-apisports-key": env.API_FOOTBALL_KEY,
      Accept: "application/json"
    },
    cf: { cacheTtl: cacheSeconds, cacheEverything: true }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API-Football ${response.status}: ${text.slice(0, 400)}`);
  }

  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error("API-Football returned invalid JSON"); }

  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(`API-Football error: ${JSON.stringify(data.errors).slice(0, 400)}`);
  }

  return data;
}

async function fdFetch(path, env, cacheSeconds = 120) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("Missing Cloudflare secret FOOTBALL_DATA_TOKEN");
  }

  const response = await fetch(`${FOOTBALL_DATA}${path}`, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      Accept: "application/json"
    },
    cf: { cacheTtl: cacheSeconds, cacheEverything: true }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`football-data.org ${response.status}: ${text.slice(0, 400)}`);
  }

  try { return JSON.parse(text); }
  catch { throw new Error("football-data.org returned invalid JSON"); }
}

function normalizeAF(item) {
  const f = item.fixture || {};
  const league = item.league || {};
  const teams = item.teams || {};
  const goals = item.goals || {};
  const status = f.status || {};
  const leagueCode = Object.entries(LEAGUES)
    .find(([, value]) => value.id === Number(league.id))?.[0] || String(league.id || "");

  return {
    id: String(f.id ?? ""),
    date: f.date || null,
    status: status.short || "",
    statusLong: status.long || "",
    minute: status.elapsed ?? null,
    live: LIVE_STATUSES.has(status.short),
    league: AF_LEAGUES[Number(league.id)] || league.name || "European football",
    leagueCode,
    leagueId: Number(league.id) || null,
    round: league.round || "",
    matchday: null,
    stage: null,
    homeTeam: {
      id: teams.home?.id ?? null,
      name: teams.home?.name || "",
      shortName: teams.home?.name || "",
      crest: teams.home?.logo || ""
    },
    awayTeam: {
      id: teams.away?.id ?? null,
      name: teams.away?.name || "",
      shortName: teams.away?.name || "",
      crest: teams.away?.logo || ""
    },
    score: {
      home: goals.home ?? null,
      away: goals.away ?? null,
      halftime: { home: goals.halftime?.home ?? null, away: goals.halftime?.away ?? null },
      fulltime: { home: goals.fulltime?.home ?? null, away: goals.fulltime?.away ?? null },
      extratime: { home: goals.extratime?.home ?? null, away: goals.extratime?.away ?? null },
      penalty: { home: goals.penalty?.home ?? null, away: goals.penalty?.away ?? null }
    }
  };
}

function normalizeFD(match) {
  const competition = match.competition || {};
  const code = competition.code || "";
  return {
    id: String(match.id ?? ""),
    date: match.utcDate || null,
    status: match.status || "",
    statusLong: match.status || "",
    minute: match.minute ?? null,
    live: false,
    league: FOOTBALL_DATA_LEAGUES[code] || competition.name || "European football",
    leagueCode: code,
    leagueId: null,
    matchday: match.matchday ?? null,
    stage: match.stage ?? null,
    homeTeam: {
      id: match.homeTeam?.id ?? null,
      name: match.homeTeam?.name || "",
      shortName: match.homeTeam?.shortName || match.homeTeam?.name || "",
      crest: match.homeTeam?.crest || ""
    },
    awayTeam: {
      id: match.awayTeam?.id ?? null,
      name: match.awayTeam?.name || "",
      shortName: match.awayTeam?.shortName || match.awayTeam?.name || "",
      crest: match.awayTeam?.crest || ""
    },
    score: match.score || {}
  };
}

async function afMatchesForDate(env, date) {
  const leagueIds = Object.values(LEAGUES).map(x => x.id);
  const responses = await Promise.all(leagueIds.map(async leagueId => {
    const q = new URLSearchParams({ league: String(leagueId), date, timezone: PARIS_TIME_ZONE });
    const data = await afFetch(`/fixtures?${q}`, env, 60);
    return Array.isArray(data.response) ? data.response : [];
  }));
  return responses.flat().map(normalizeAF).sort((a, b) => new Date(a.date) - new Date(b.date));
}

function isCompleted(status) {
  return FINAL_STATUSES.has(status);
}

function buildSnapshot(events, sourceDate, now = new Date()) {
  const finished = events.filter(e => isCompleted(e.status));
  const live = events.filter(e => LIVE_STATUSES.has(e.status));
  const upcoming = events.filter(e => !isCompleted(e.status) && !LIVE_STATUSES.has(e.status));
  return {
    events: finished,
    live,
    finished,
    upcoming,
    count: finished.length,
    liveCount: live.length,
    finishedCount: finished.length,
    upcomingCount: upcoming.length,
    source: "API-Football",
    sourceDate,
    date: sourceDate,
    publishedAt: now.toISOString(),
    updated: now.toISOString(),
    message: finished.length ? null : "No completed matches were recorded for this day."
  };
}

async function readLatest(env) {
  if (!env.LATEST_SCORES) return null;
  try { return await env.LATEST_SCORES.get(KV_KEY, "json"); }
  catch { return null; }
}

async function writeLatest(env, snapshot) {
  if (!env.LATEST_SCORES) throw new Error("Missing Cloudflare KV binding LATEST_SCORES");
  await env.LATEST_SCORES.put(KV_KEY, JSON.stringify(snapshot));
  // Keep a dated copy too, so the latest successful day is recoverable.
  if (snapshot.sourceDate) {
    await env.LATEST_SCORES.put(`scores:${snapshot.sourceDate}`, JSON.stringify(snapshot));
  }
}

function yesterdayParisDate(date = new Date()) {
  const p = parisParts(date);
  // Noon UTC is safely inside the Paris calendar date; subtract one UTC day.
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) - 1, 12));
  return d.toISOString().slice(0, 10);
}

async function scores(env) {
  const now = new Date();
  const today = parisDate(now);
  const cached = await readLatest(env);

  // Before publication time, never replace the existing successful snapshot.
  if (!isPublicationWindowParis(now)) {
    if (cached) return { ...cached, cacheStatus: "last-successful-snapshot", checked: now.toISOString() };

    // Bootstrap a new installation with yesterday's completed results.
    try {
      const yesterday = yesterdayParisDate(now);
      const events = await afMatchesForDate(env, yesterday);
      const finished = events.filter(e => isCompleted(e.status));
      if (finished.length) {
        const snapshot = buildSnapshot(events, yesterday, now);
        snapshot.cacheStatus = "bootstrap";
        await writeLatest(env, snapshot);
        return snapshot;
      }
    } catch (_) {}

    throw new Error("No daily scores snapshot has been published yet");
  }

  // Once today's snapshot exists, never publish it again during the same window.
  if (cached?.sourceDate === today && cached?.publishedAt) {
    return { ...cached, cacheStatus: "already-published-today", checked: now.toISOString() };
  }

  try {
    const events = await afMatchesForDate(env, today);
    const finished = events.filter(e => isCompleted(e.status));

    // Do not replace yesterday's good data with an empty/late API response.
    if (!finished.length && cached) {
      return {
        ...cached,
        cacheStatus: "fallback-empty-upstream",
        checked: now.toISOString(),
        warning: "No completed matches were returned yet; keeping the last successful snapshot."
      };
    }

    const snapshot = buildSnapshot(events, today, now);
    await writeLatest(env, snapshot);
    return { ...snapshot, cacheStatus: "fresh", checked: now.toISOString() };
  } catch (error) {
    if (cached) {
      return {
        ...cached,
        cacheStatus: "fallback",
        checked: now.toISOString(),
        warning: "Showing the last successful scores while the feed is temporarily unavailable."
      };
    }
    throw error;
  }
}

async function matchCentre(env) {
  const now = new Date();
  const data = await afFetch(`/fixtures?live=all&timezone=${encodeURIComponent(PARIS_TIME_ZONE)}`, env, 15);
  const allowed = new Set(Object.values(LEAGUES).map(x => x.id));
  const events = (Array.isArray(data.response) ? data.response : [])
    .filter(x => allowed.has(Number(x?.league?.id)))
    .map(normalizeAF)
    .filter(x => x.live)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    events,
    live: events,
    finished: [],
    upcoming: [],
    count: events.length,
    liveCount: events.length,
    source: "API-Football",
    updated: now.toISOString(),
    message: events.length ? null : "No European matches are live right now."
  };
}

async function fixtures(env) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);

  // Preserve the original football-data.org fixture feed when its token is configured.
  // If it is temporarily unavailable, use API-Football so the Fixtures page does not disappear.
  if (env.FOOTBALL_DATA_TOKEN) {
    try {
      const q = new URLSearchParams({
        competitions: Object.keys(FOOTBALL_DATA_LEAGUES).join(","),
        dateFrom: parisDate(now),
        dateTo: parisDate(end)
      });
      const data = await fdFetch(`/matches?${q}`, env, 300);
      const events = (data.matches || [])
        .map(normalizeFD)
        .filter(e => e.date && new Date(e.date) >= now)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 60);

      return {
        events,
        count: events.length,
        source: "football-data.org",
        message: events.length ? null : "No upcoming fixtures found.",
        updated: now.toISOString()
      };
    } catch (error) {
      // Continue to API-Football fallback below.
    }
  }

  const dates = [];
  const cursor = new Date(now);
  while (cursor <= end) {
    dates.push(parisDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  try {
    const all = [];
    for (const date of [...new Set(dates)]) {
      const events = await afMatchesForDate(env, date);
      all.push(...events);
    }
    const events = all
      .filter(e => e.date && !isCompleted(e.status) && new Date(e.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 60);

    return {
      events,
      count: events.length,
      source: "API-Football",
      message: events.length ? null : "No upcoming fixtures found.",
      updated: now.toISOString()
    };
  } catch (error) {
    throw new Error(`Fixtures unavailable: ${error.message || String(error)}`);
  }
}

function decodeXml(text = "") {
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

function xmlValue(item, tag) {
  const match = item.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function parseBBC(text) {
  const items = text.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];
  const articles = [];

  for (const item of items) {
    const title = xmlValue(item, "title");
    const link = xmlValue(item, "link");
    if (!title || !link) continue;

    const media = item.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    const thumb = item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
    const enclosure = item.match(/<enclosure[^>]+url=["']([^"']+)["']/i);

    articles.push({
      title,
      link,
      source: "BBC Sport",
      published: xmlValue(item, "pubDate") || xmlValue(item, "dc:date"),
      description: xmlValue(item, "description").replace(/<[^>]+>/g, "").trim().slice(0, 240),
      image: media?.[1] || thumb?.[1] || enclosure?.[1] || ""
    });
  }

  return articles;
}

async function news() {
  const response = await fetch(BBC, {
    headers: {
      "User-Agent": "YepFootball/1.0 (+https://yepfootball.com)",
      Accept: "application/rss+xml, application/xml, text/xml"
    },
    cf: { cacheTtl: 900, cacheEverything: true }
  });

  if (!response.ok) throw new Error(`BBC RSS ${response.status}`);
  const articles = parseBBC(await response.text()).slice(0, 12);

  return {
    articles,
    count: articles.length,
    source: { name: "BBC Sport", url: "https://www.bbc.com/sport/football" },
    updated: new Date().toISOString()
  };
}

async function health(env) {
  const started = Date.now();
  const result = {
    ok: true,
    upstreams: {},
    kv: Boolean(env.LATEST_SCORES),
    elapsedMs: 0,
    checked: new Date().toISOString()
  };

  try {
    await afFetch("/status", env, 30);
    result.upstreams.apiFootball = "ok";
  } catch (e) {
    result.ok = false;
    result.upstreams.apiFootball = e.message || String(e);
  }

  if (env.FOOTBALL_DATA_TOKEN) {
    try {
      await fdFetch("/matches?limit=1", env, 30);
      result.upstreams.footballData = "ok";
    } catch (e) {
      result.ok = false;
      result.upstreams.footballData = e.message || String(e);
    }
  } else {
    result.upstreams.footballData = "not configured (API-Football fallback used for fixtures)";
  }

  try {
    await fetch(BBC, { cf: { cacheTtl: 60, cacheEverything: true } });
    result.upstreams.bbcSport = "ok";
  } catch (e) {
    result.ok = false;
    result.upstreams.bbcSport = e.message || String(e);
  }

  if (!env.LATEST_SCORES) {
    result.ok = false;
    result.upstreams.latestScores = "Missing KV binding LATEST_SCORES";
  } else {
    result.upstreams.latestScores = "ok";
  }

  result.elapsedMs = Date.now() - started;
  return result;
}

async function handle(request, env) {
  const url = new URL(request.url);

  try {
    if (url.pathname === "/api/health") {
      const result = await health(env);
      return json(result, result.ok ? 200 : 502, 30);
    }

    if (url.pathname === "/api/scores") {
      return json(await scores(env), 200, 30);
    }

    if (url.pathname === "/api/match-centre") {
      return json(await matchCentre(env), 200, 10);
    }

    if (url.pathname === "/api/fixtures") {
      return json(await fixtures(env), 200, 300);
    }

    if (url.pathname === "/api/news") {
      return json(await news(), 200, 900);
    }
  } catch (error) {
    return json({
      error: "Football data feed unavailable",
      detail: error.message || String(error),
      checked: new Date().toISOString()
    }, 502, 30);
  }

  return null;
}

export default {
  async fetch(request, env, ctx) {
    const api = await handle(request, env);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // Keep the Cloudflare Cron at every 5–15 minutes. The code itself decides
    // whether the current Paris time is inside the 23:50 daily publication window.
    ctx.waitUntil(scores(env));
  }
};
