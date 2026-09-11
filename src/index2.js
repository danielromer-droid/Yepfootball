const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LEAGUES = [
  ["uefa.champions", "Champions League"],
  ["eng.1", "Premier League"],
  ["esp.1", "La Liga"],
  ["ita.1", "Serie A"],
  ["ger.1", "Bundesliga"],
  ["fra.1", "Ligue 1"]
];

function json(data, maxAge = 120) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`
    }
  });
}

async function fetchJSON(url, cacheSeconds = 120) {
  const cache = caches.default;
  const req = new Request(url, { method: "GET" });
  const hit = await cache.match(req);
  if (hit) return hit.json();

  const res = await fetch(req, {
    cf: { cacheTtl: cacheSeconds, cacheEverything: true }
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);

  const data = await res.json();
  await cache.put(
    req,
    new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json",
        "cache-control": `public, max-age=${cacheSeconds}`
      }
    })
  );
  return data;
}

async function leagueEvents(path, dates = "") {
  const url = dates
    ? `${ESPN}/${path}/scoreboard?dates=${dates}`
    : `${ESPN}/${path}/scoreboard`;
  try {
    const data = await fetchJSON(url, dates ? 600 : 120);
    return (data.events || []).map(e => ({
      ...e,
      league: data.leagues?.[0]?.name || LEAGUES.find(x => x[0] === path)?.[1] || path
    }));
  } catch {
    return [];
  }
}

async function scores(league) {
  const paths = league
    ? LEAGUES.filter(x => x[0] === league).map(x => x[0])
    : LEAGUES.map(x => x[0]);

  const events = (await Promise.all(paths.map(p => leagueEvents(p)))).flat();

  return {
    events: events.sort((a, b) => new Date(a.date) - new Date(b.date)),
    updated: new Date().toISOString()
  };
}

async function fixtures() {
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10).replaceAll("-", "");
  });

  // Six competitions × seven days, but all requests run in parallel.
  const jobs = [];
  for (const [path] of LEAGUES) {
    for (const day of days) jobs.push(leagueEvents(path, day));
  }

  const results = await Promise.all(jobs);
  const seen = new Set();
  const events = results.flat()
    .filter(e => new Date(e.date) >= now)
    .filter(e => !seen.has(e.id) && (seen.add(e.id), true))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 60);

  return { events, updated: new Date().toISOString() };
}

async function news() {
  const results = await Promise.all(
    LEAGUES.map(async ([path, name]) => {
      try {
        const data = await fetchJSON(`${ESPN}/${path}/news`, 1800);
        return (data.articles || []).map(a => ({
          title: a.headline || a.title,
          link: a.links?.web?.href || a.links?.mobile?.href,
          source: a.source?.description || a.source?.name || name,
          published: a.published || a.lastModified,
          league: name
        }));
      } catch {
        return [];
      }
    })
  );

  const seen = new Set();
  const articles = results.flat()
    .filter(a => a.title && a.link)
    .filter(a => !seen.has(a.link) && (seen.add(a.link), true))
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0))
    .slice(0, 18);

  return { articles, updated: new Date().toISOString() };
}

async function handle(request) {
  const url = new URL(request.url);

  try {
    if (url.pathname === "/api/scores") {
      return json(await scores(url.searchParams.get("league")), 120);
    }

    if (url.pathname === "/api/fixtures") {
      return json(await fixtures(), 600);
    }

    if (url.pathname === "/api/news") {
      return json(await news(), 1800);
    }
  } catch (error) {
    return json({
      error: "Data feed temporarily unavailable",
      detail: error.message
    }, 30);
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
    // Warm the feeds so recently requested data is available from cache.
    ctx.waitUntil(Promise.allSettled([
      scores(),
      fixtures(),
      news()
    ]));
  }
};
