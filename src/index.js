const API_FOOTBALL = "https://v3.football.api-sports.io";
const TIMEZONE = "Europe/Paris";
const SEASON = 2026;

// API-Football competition IDs.
const LEAGUES = [
  { id: 2, name: "Champions League", aliases: ["uefa.champions", "2", "Champions League"] },
  { id: 39, name: "Premier League", aliases: ["eng.1", "39", "Premier League"] },
  { id: 140, name: "La Liga", aliases: ["esp.1", "140", "La Liga"] },
  { id: 135, name: "Serie A", aliases: ["ita.1", "135", "Serie A"] },
  { id: 78, name: "Bundesliga", aliases: ["ger.1", "78", "Bundesliga"] },
  { id: 61, name: "Ligue 1", aliases: ["fra.1", "61", "Ligue 1"] }
];

const LEAGUE_IDS = new Set(LEAGUES.map(l => l.id));

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

function parisDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function addDays(dateKey, amount) {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + amount);
  return d.toISOString().slice(0, 10);
}

function leagueFor(value) {
  if (!value) return null;
  return LEAGUES.find(l => l.aliases.includes(value)) || null;
}

function normalizeFixture(item) {
  const f = item.fixture || {};
  const league = item.league || {};
  const teams = item.teams || {};
  const goals = item.goals || {};
  const status = f.status || {};

  return {
    id: String(f.id),
    date: f.date,
    timestamp: f.timestamp,
    status: {
      short: status.short,
      long: status.long,
      elapsed: status.elapsed
    },
    league: league.name || "Football",
    leagueId: league.id,
    leagueLogo: league.logo || null,
    country: league.country || null,
    round: league.round || null,
    home: {
      id: teams.home?.id,
      name: teams.home?.name,
      logo: teams.home?.logo || null,
      winner: teams.home?.winner
    },
    away: {
      id: teams.away?.id,
      name: teams.away?.name,
      logo: teams.away?.logo || null,
      winner: teams.away?.winner
    },
    goals: {
      home: goals.home,
      away: goals.away
    }
  };
}

async function fetchFootball(path, params, env, cacheSeconds = 120) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("Missing Cloudflare secret API_FOOTBALL_KEY");
  }

  const url = new URL(`${API_FOOTBALL}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const cache = caches.default;
  const request = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(request);
  if (cached) return cached.json();

  const response = await fetch(request, {
    headers: {
      "x-apisports-key": env.API_FOOTBALL_KEY,
      "accept": "application/json"
    },
    cf: {
      cacheTtl: cacheSeconds,
      cacheEverything: true
    }
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API-Football HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("API-Football returned invalid JSON");
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    throw new Error(`API-Football: ${JSON.stringify(data.errors)}`);
  }

  await cache.put(
    request,
    new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${cacheSeconds}`
      }
    })
  );

  return data;
}

async function getFixturesByDateRange(from, to, env, cacheSeconds = 300) {
  const data = await fetchFootball("/fixtures", {
    from,
    to,
    timezone: TIMEZONE,
    season: SEASON
  }, env, cacheSeconds);

  return (data.response || [])
    .filter(item => LEAGUE_IDS.has(item.league?.id))
    .map(normalizeFixture);
}

async function scores(leagueParam, env) {
  const today = parisDateKey();
  let events = await getFixturesByDateRange(today, today, env, 60);

  const selected = leagueFor(leagueParam);
  if (selected) events = events.filter(e => e.leagueId === selected.id);

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    events,
    updated: new Date().toISOString(),
    source: "API-Football",
    timezone: TIMEZONE,
    season: SEASON
  };
}

async function fixtures(env) {
  const from = parisDateKey();
  const to = addDays(from, 6);
  const events = await getFixturesByDateRange(from, to, env, 600);

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    events: events.slice(0, 100),
    updated: new Date().toISOString(),
    source: "API-Football",
    timezone: TIMEZONE,
    season: SEASON,
    from,
    to
  };
}

// BBC Sport publishes RSS feeds and states that BBC Sport RSS headlines may
// be used on websites with the required attribution. We only expose headlines,
// links and publication dates here. Review BBC's current terms before public/commercial use.
const BBC_FOOTBALL_RSS = "https://feeds.bbci.co.uk/sport/football/rss.xml";

function stripXml(value = "") {
  return value
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function rssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const block = match[1];
    const read = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? stripXml(m[1]).trim() : "";
    };
    return {
      title: read("title"),
      link: read("link"),
      published: read("pubDate") || read("dc:date"),
      source: "BBC Sport",
      league: "European football"
    };
  });
}

async function news() {
  const cache = caches.default;
  const request = new Request(BBC_FOOTBALL_RSS, { method: "GET" });
  const cached = await cache.match(request);
  let xml;

  if (cached) {
    xml = await cached.text();
  } else {
    const response = await fetch(request, {
      headers: { "accept": "application/rss+xml, application/xml, text/xml" },
      cf: { cacheTtl: 1800, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`BBC RSS HTTP ${response.status}`);
    xml = await response.text();
    await cache.put(request, new Response(xml, {
      headers: { "content-type": "application/rss+xml", "cache-control": "public, max-age=1800" }
    }));
  }

  const articles = rssItems(xml)
    .filter(a => a.title && a.link)
    .slice(0, 18);

  return {
    articles,
    updated: new Date().toISOString(),
    source: "BBC Sport RSS",
    attribution: "BBC Sport"
  };
}

async function health(env) {
  const started = Date.now();
  try {
    const today = parisDateKey();
    const data = await fetchFootball("/fixtures", {
      league: 39,
      season: SEASON,
      date: today,
      timezone: TIMEZONE
    }, env, 30);

    return {
      ok: true,
      upstream: "API-Football",
      status: 200,
      events: data.response?.length || 0,
      elapsedMs: Date.now() - started,
      checked: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      upstream: "API-Football",
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
      return json(await scores(url.searchParams.get("league"), env), 200, 60);
    }

    if (url.pathname === "/api/fixtures") {
      return json(await fixtures(env), 200, 600);
    }

    if (url.pathname === "/api/news") {
      return json(await news(), 200, 1800);
    }
  } catch (error) {
    return json({
      error: "Data feed temporarily unavailable",
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
    ctx.waitUntil(Promise.allSettled([
      scores(null, env),
      fixtures(env),
      news(),
      health(env)
    ]));
  }
};
