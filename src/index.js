const API = "https://api.football-data.org/v4";

const LEAGUES = {
  CL: "Champions League",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};

function json(data, status = 200, maxAge = 60) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`
    }
  });
}

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function normalize(match) {
  return {
    id: String(match.id),
    date: match.utcDate,
    status: match.status,
    minute: match.minute ?? null,
    league: LEAGUES[match.competition?.code] || match.competition?.name || "",
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

async function fdFetch(path, env, cacheSeconds = 60) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("Missing Cloudflare secret FOOTBALL_DATA_TOKEN");
  }

  const res = await fetch(`${API}${path}`, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "Accept": "application/json"
    },
    cf: { cacheTtl: cacheSeconds, cacheEverything: true }
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`football-data.org ${res.status}: ${text.slice(0, 250)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("football-data.org returned invalid JSON");
  }
}

async function matchesForDates(env, from, to) {
  const competitions = Object.keys(LEAGUES).join(",");
  const q = new URLSearchParams({ competitions, dateFrom: from, dateTo: to });
  const data = await fdFetch(`/matches?${q}`, env, 120);
  return (data.matches || []).map(normalize);
}

async function scores(env) {
  const today = isoDate(new Date());
  return {
    events: (await matchesForDates(env, today, today))
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
    updated: new Date().toISOString()
  };
}

async function fixtures(env) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);
  const events = await matchesForDates(env, isoDate(now), isoDate(end));

  return {
    events: events
      .filter(e => new Date(e.date) >= now)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 60),
    updated: new Date().toISOString()
  };
}

async function health(env) {
  const started = Date.now();
  try {
    const data = await fdFetch("/matches", env, 30);
    return {
      ok: true,
      upstream: "football-data.org",
      status: 200,
      matchesReturned: data.matches?.length || 0,
      elapsedMs: Date.now() - started,
      checked: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      upstream: "football-data.org",
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
    if (url.pathname === "/api/scores") return json(await scores(env), 200, 60);
    if (url.pathname === "/api/fixtures") return json(await fixtures(env), 200, 300);
    if (url.pathname === "/api/news") {
      return json({
        articles: [],
        message: "News source is not provided by football-data.org.",
        updated: new Date().toISOString()
      }, 200, 900);
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
    ctx.waitUntil(Promise.allSettled([scores(env), fixtures(env), health(env)]));
  }
};
