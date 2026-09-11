const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const LEAGUES = [
  ["uefa.champions", "Champions League"],
  ["eng.1", "Premier League"],
  ["esp.1", "La Liga"],
  ["ita.1", "Serie A"],
  ["ger.1", "Bundesliga"],
  ["fra.1", "Ligue 1"]
];

const ESPN_HEADERS = {
  "accept": "application/json",
  "user-agent": "YepFootball/3.3"
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

async function fetchJSON(url, cacheSeconds = 120) {
  const res = await fetch(url, {
    method: "GET",
    headers: ESPN_HEADERS,
    cf: {
      cacheTtl: cacheSeconds,
      cacheEverything: true
    }
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`ESPN ${res.status} for ${url}: ${text.slice(0, 180)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`ESPN returned invalid JSON for ${url}`);
  }
}

function dateKey(date) {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function normalizeEvents(data, path) {
  return (data?.events || []).map(e => ({
    ...e,
    league:
      data?.leagues?.[0]?.name ||
      LEAGUES.find(x => x[0] === path)?.[1] ||
      path
  }));
}

async function leagueEvents(path, dates = "") {
  const url = dates
    ? `${ESPN}/${path}/scoreboard?dates=${dates}`
    : `${ESPN}/${path}/scoreboard`;

  const data = await fetchJSON(url, dates ? 300 : 60);
  return normalizeEvents(data, path);
}

async function scores(league) {
  const paths = league
    ? LEAGUES.filter(x => x[0] === league).map(x => x[0])
    : LEAGUES.map(x => x[0]);

  // Ask ESPN explicitly for today's UTC date. This avoids relying on
  // ESPN's default scoreboard date and makes the behaviour deterministic.
  const today = dateKey(new Date());

  const results = await Promise.allSettled(
    paths.map(path => leagueEvents(path, today))
  );

  const events = [];
  const errors = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      events.push(...result.value);
    } else {
      errors.push({
        league: paths[i],
        error: result.reason?.message || String(result.reason)
      });
    }
  });

  return {
    events: events.sort((a, b) => new Date(a.date) - new Date(b.date)),
    updated: new Date().toISOString(),
    ...(errors.length ? { warnings: errors } : {})
  };
}

async function fixtures() {
  const now = new Date();

  // Use seven explicit calendar dates so ESPN is queried for the exact
  // requested window rather than relying on a default scoreboard date.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    return dateKey(d);
  });

  const jobs = [];
  for (const [path] of LEAGUES) {
    for (const day of days) {
      jobs.push(
        leagueEvents(path, day).then(events => ({ path, events }))
      );
    }
  }

  const results = await Promise.allSettled(jobs);
  const seen = new Set();
  const events = [];
  const warnings = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const event of result.value.events) {
        const eventTime = new Date(event.date);
        if (eventTime >= now && !seen.has(event.id)) {
          seen.add(event.id);
          events.push(event);
        }
      }
    } else {
      warnings.push(result.reason?.message || String(result.reason));
    }
  }

  events.sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    events: events.slice(0, 60),
    updated: new Date().toISOString(),
    ...(warnings.length ? { warnings } : {})
  };
}

async function news() {
  const results = await Promise.allSettled(
    LEAGUES.map(async ([path, name]) => {
      const data = await fetchJSON(`${ESPN}/${path}/news`, 900);

      return (data?.articles || []).map(a => ({
        title: a.headline || a.title,
        link: a.links?.web?.href || a.links?.mobile?.href,
        source:
          a.source?.description ||
          a.source?.name ||
          name,
        published: a.published || a.lastModified,
        league: name
      }));
    })
  );

  const articles = [];
  const seen = new Set();
  const warnings = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
    } else {
      warnings.push({
        league: LEAGUES[i][1],
        error: result.reason?.message || String(result.reason)
      });
    }
  });

  const clean = articles
    .filter(a => a.title && a.link)
    .filter(a => {
      if (seen.has(a.link)) return false;
      seen.add(a.link);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.published || 0) -
        new Date(a.published || 0)
    )
    .slice(0, 18);

  return {
    articles: clean,
    updated: new Date().toISOString(),
    ...(warnings.length ? { warnings } : {})
  };
}

async function health() {
  const started = Date.now();
  const testUrl = `${ESPN}/eng.1/scoreboard?dates=${dateKey(new Date())}`;

  try {
    const data = await fetchJSON(testUrl, 30);

    return {
      ok: true,
      upstream: "ESPN",
      status: 200,
      events: data?.events?.length || 0,
      elapsedMs: Date.now() - started,
      checked: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      upstream: "ESPN",
      error: error.message || String(error),
      elapsedMs: Date.now() - started,
      checked: new Date().toISOString()
    };
  }
}

async function handle(request) {
  const url = new URL(request.url);

  try {
    if (url.pathname === "/api/health") {
      const result = await health();
      return json(result, result.ok ? 200 : 502, 30);
    }

    if (url.pathname === "/api/scores") {
      const result = await scores(url.searchParams.get("league"));
      return json(result, 200, 60);
    }

    if (url.pathname === "/api/fixtures") {
      return json(await fixtures(), 200, 300);
    }

    if (url.pathname === "/api/news") {
      return json(await news(), 200, 900);
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
    const api = await handle(request);
    if (api) return api;
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      Promise.allSettled([
        scores(),
        fixtures(),
        news(),
        health()
      ])
    );
  }
};
