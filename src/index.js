// YepFootball Cloudflare Worker
// Latest Scores snapshot with KV fallback.
// Required bindings:
//   - API_FOOTBALL_KEY : Secret
//   - LATEST_SCORES    : KV Namespace binding
//
// The Worker checks the Paris local time. At 23:50 it fetches the
// completed matches for the day and stores the successful snapshot
// in KV. If the upstream API is temporarily unavailable, the last
// successful snapshot remains available.

const API_FOOTBALL = "https://v3.football.api-sports.io";

const LEAGUES = {
  CL: { id: 2, name: "Champions League" },
  PL: { id: 39, name: "Premier League" },
  PD: { id: 140, name: "La Liga" },
  SA: { id: 135, name: "Serie A" },
  BL1: { id: 78, name: "Bundesliga" },
  FL1: { id: 61, name: "Ligue 1" }
};

const KV_KEY = "latest";
const PARIS_TIME_ZONE = "Europe/Paris";

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

function isoDate(d) {
  return d.toISOString().slice(0, 10);
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
  for (const p of parts) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

function parisDate(date = new Date()) {
  const p = parisParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function is2350Paris(date = new Date()) {
  const p = parisParts(date);
  return p.hour === "23" && p.minute === "50";
}

function normalizeFixture(item) {
  const f = item.fixture || {};
  const league = item.league || {};
  const teams = item.teams || {};
  const goals = item.goals || {};
  const status = f.status || {};

  const leagueCode = Object.entries(LEAGUES)
    .find(([, value]) => value.id === league.id)?.[0] || "";

  return {
    id: String(f.id ?? ""),
    date: f.date || null,
    status: status.short || "",
    minute: status.elapsed ?? null,
    league: league.name || "",
    leagueCode,
    leagueId: league.id ?? null,
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
      halftime: {
        home: goals.halftime?.home ?? null,
        away: goals.halftime?.away ?? null
      },
      fulltime: {
        home: goals.fulltime?.home ?? null,
        away: goals.fulltime?.away ?? null
      },
      extratime: {
        home: goals.extratime?.home ?? null,
        away: goals.extratime?.away ?? null
      },
      penalty: {
        home: goals.penalty?.home ?? null,
        away: goals.penalty?.away ?? null
      }
    }
  };
}

async function apiFootball(path, env, cacheSeconds = 30) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("Missing Cloudflare secret API_FOOTBALL_KEY");
  }

  const response = await fetch(`${API_FOOTBALL}${path}`, {
    method: "GET",
    headers: {
      "x-apisports-key": env.API_FOOTBALL_KEY,
      "Accept": "application/json"
    },
    cf: {
      cacheTtl: cacheSeconds,
      cacheEverything: true
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `API-Football ${response.status}: ${text.slice(0, 300)}`
    );
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("API-Football returned invalid JSON");
  }

  if (data.errors && Object.keys(data.errors).length) {
    throw new Error(
      `API-Football error: ${JSON.stringify(data.errors).slice(0, 300)}`
    );
  }

  return data;
}

async function matchesForDate(env, date) {
  const leagueIds = Object.values(LEAGUES).map(x => x.id);

  const responses = await Promise.all(
    leagueIds.map(async (leagueId) => {
      const q = new URLSearchParams({
        league: String(leagueId),
        date,
        timezone: PARIS_TIME_ZONE
      });

      const data = await apiFootball(
        `/fixtures?${q.toString()}`,
        env,
        60
      );

      return Array.isArray(data.response)
        ? data.response
        : [];
    })
  );

  return responses
    .flat()
    .map(normalizeFixture)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function isCompleted(status) {
  return [
    "FT",
    "AET",
    "PEN"
  ].includes(status);
}

function isLive(status) {
  return [
    "1H",
    "HT",
    "2H",
    "ET",
    "BT",
    "P",
    "LIVE"
  ].includes(status);
}

function buildSnapshot(events, sourceDate, now = new Date()) {
  const finished = events.filter(e => isCompleted(e.status));
  const live = events.filter(e => isLive(e.status));
  const upcoming = events.filter(e => !isCompleted(e.status) && !isLive(e.status));

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
    publishedAt: now.toISOString(),
    updated: now.toISOString(),
    message:
      finished.length === 0
        ? "No completed matches were recorded for this day."
        : null
  };
}

async function readLatest(env) {
  if (!env.LATEST_SCORES) return null;

  try {
    return await env.LATEST_SCORES.get(KV_KEY, "json");
  } catch {
    return null;
  }
}

async function writeLatest(env, snapshot) {
  if (!env.LATEST_SCORES) {
    throw new Error("Missing Cloudflare KV binding LATEST_SCORES");
  }

  await env.LATEST_SCORES.put(
    KV_KEY,
    JSON.stringify(snapshot)
  );
}

async function scores(env) {
  const now = new Date();
  const todayParis = parisDate(now);

  // Before the daily publication time, deliberately keep showing
  // the previous successful snapshot rather than replacing it with
  // an empty/new-day result.
  if (!is2350Paris(now)) {
    const cached = await readLatest(env);

    if (cached) {
      return {
        ...cached,
        cacheStatus: "last-successful-snapshot",
        checked: now.toISOString()
      };
    }
  }

  try {
    const events = await matchesForDate(env, todayParis);
    const snapshot = buildSnapshot(events, todayParis, now);

    // Only replace the KV snapshot when the upstream request succeeds.
    await writeLatest(env, snapshot);

    return {
      ...snapshot,
      cacheStatus: "fresh",
      checked: now.toISOString()
    };
  } catch (error) {
    // Critical fallback: never erase the previous successful scores.
    const cached = await readLatest(env);

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

async function fixtures(env) {
  const now = new Date();

  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);

  const dates = [];
  const cursor = new Date(now);

  while (cursor <= end) {
    dates.push(parisDate(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const all = [];

  for (const date of [...new Set(dates)]) {
    const events = await matchesForDate(env, date);
    all.push(...events);
  }

  const upcoming = all
    .filter(e => !isCompleted(e.status) && new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 60);

  return {
    events: upcoming,
    count: upcoming.length,
    source: "API-Football",
    message:
      upcoming.length === 0
        ? "No upcoming fixtures found."
        : null,
    updated: now.toISOString()
  };
}

async function health(env) {
  const started = Date.now();

  try {
    await apiFootball(
      "/status",
      env,
      30
    );

    return {
      ok: true,
      upstream: "API-Football",
      status: 200,
      kv: Boolean(env.LATEST_SCORES),
      elapsedMs: Date.now() - started,
      checked: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      upstream: "API-Football",
      kv: Boolean(env.LATEST_SCORES),
      error: error.message || String(error),
      elapsedMs: Date.now() - started,
      checked: new Date().toISOString()
    };
  }
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

    if (url.pathname === "/api/fixtures") {
      return json(await fixtures(env), 200, 300);
    }

    return null;
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
}

export default {
  async fetch(request, env, ctx) {
    const api = await handle(request, env);

    if (api) {
      return api;
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // Run at the 50th minute of every hour. The scores() function
    // performs the actual 23:50 Europe/Paris publication check.
    ctx.waitUntil(
      Promise.allSettled([
        scores(env),
        health(env)
      ])
    );
  }
};
