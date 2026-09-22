/* =========================================================
   YepFootball Cloudflare Worker
   Version: 2026-09-22.2
   ========================================================= */

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

const FIXTURE_CACHE_SECONDS = 1800;

const COMPETITIONS = [
  { code: "PL",  name: "Premier League",      id: 39  },
  { code: "CL",  name: "Champions League",    id: 2   },
  { code: "EL",  name: "Europa League",       id: 3   },
  { code: "ECL", name: "Conference League",   id: 848 },
  { code: "PD",  name: "La Liga",             id: 140 },
  { code: "SA",  name: "Serie A",             id: 135 },
  { code: "BL1", name: "Bundesliga",          id: 78  },
  { code: "FL1", name: "Ligue 1",             id: 61  }
];

/* =========================================================
   CORS
   ========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

/* =========================================================
   JSON RESPONSE
   ========================================================= */

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

/* =========================================================
   DATE HELPERS
   ========================================================= */

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* =========================================================
   API-FOOTBALL REQUEST
   ========================================================= */

async function apiFootball(path, env) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error("Missing Cloudflare secret API_FOOTBALL_KEY");
  }

  const response = await fetch(`${API_FOOTBALL_BASE}${path}`, {
    method: "GET",
    headers: {
      "x-apisports-key": env.API_FOOTBALL_KEY,
      "Accept": "application/json"
    }
  });

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    httpStatus: response.status,
    ok: response.ok,
    data
  };
}

/* =========================================================
   FIXTURE NORMALISER
   ========================================================= */

function normaliseFixture(item, competition) {
  const fixture = item?.fixture || {};
  const league = item?.league || {};
  const teams = item?.teams || {};
  const goals = item?.goals || {};

  return {
    id: fixture.id ?? null,
    date: fixture.date ?? null,
    timestamp: fixture.timestamp ?? null,
    status: fixture.status?.short ?? null,
    statusLong: fixture.status?.long ?? null,

    league: league.name || competition.name,
    leagueCode: competition.code,
    leagueId: league.id || competition.id,

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

    homeScore: goals.home ?? null,
    awayScore: goals.away ?? null
  };
}

/* =========================================================
   /api/fixture-test
   TEMPORARY DIAGNOSTIC ENDPOINT
   ========================================================= */

async function fixtureTest(env) {

  const competition = {
    code: "PL",
    name: "Premier League",
    id: 39
  };

  const url =
    `${API_FOOTBALL_BASE}/fixtures` +
    `?league=${competition.id}` +
    `&season=2026` +
    `&next=5`;

  try {

    if (!env.API_FOOTBALL_KEY) {
      return json({
        ok: false,
        error: "API_FOOTBALL_KEY is missing"
      }, 500);
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "x-apisports-key": env.API_FOOTBALL_KEY,
        "Accept": "application/json"
      }
    });

    const text = await response.text();

    let parsed = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    return json({
      ok: response.ok,
      endpoint: "API-Football diagnostic",
      httpStatus: response.status,

      request: {
        league: competition.id,
        competition: competition.name,
        season: 2026,
        next: 5
      },

      apiMessage: parsed?.message || null,
      apiResults: parsed?.results ?? null,

      response: parsed,

      rawResponsePreview:
        parsed === null
          ? text.slice(0, 2000)
          : null,

      checked: new Date().toISOString()
    });

  } catch (error) {

    return json({
      ok: false,
      endpoint: "API-Football diagnostic",
      error: error?.message || String(error),
      checked: new Date().toISOString()
    }, 500);
  }
}

/* =========================================================
   FIXTURES
   ========================================================= */

async function fixtures(request, env) {

  const now = new Date();

  const from = todayUTC();
  const to = addDays(from, 7);

  const cacheUrl = new URL(request.url);
  cacheUrl.pathname = "/api/fixtures";
  cacheUrl.search = "";

  const cache = caches.default;

  const cached = await cache.match(cacheUrl);

  if (cached) {
    return cached;
  }

  const allFixtures = [];
  const diagnostics = [];

  /*
    First try the normal upcoming 7-day period.
  */

  for (const competition of COMPETITIONS) {

    const path =
      `/fixtures` +
      `?league=${competition.id}` +
      `&season=2026` +
      `&from=${from}` +
      `&to=${to}`;

    try {

      const result = await apiFootball(path, env);

      const apiResults = result.data?.results ?? 0;
      const responseFixtures = result.data?.response ?? [];

      diagnostics.push({
        competition: competition.code,
        returned: responseFixtures.length,
        apiResults,
        httpStatus: result.httpStatus,
        apiMessage: result.data?.message || null
      });

      for (const item of responseFixtures) {
        allFixtures.push(
          normaliseFixture(item, competition)
        );
      }

    } catch (error) {

      diagnostics.push({
        competition: competition.code,
        returned: 0,
        apiResults: 0,
        error: error?.message || String(error)
      });
    }
  }

  /*
    If the 7-day period has no fixtures, try next=5.

    This helps distinguish:
    - genuinely no fixtures
    - a date-window problem
    - API-Football behaviour
  */

  let mode = "upcoming";
  let isNextAvailable = false;

  if (allFixtures.length === 0) {

    mode = "next";

    for (const competition of COMPETITIONS) {

      const path =
        `/fixtures` +
        `?league=${competition.id}` +
        `&season=2026` +
        `&next=5`;

      try {

        const result = await apiFootball(path, env);

        const apiResults = result.data?.results ?? 0;
        const responseFixtures = result.data?.response ?? [];

        diagnostics.push({
          competition: `${competition.code}-NEXT`,
          returned: responseFixtures.length,
          apiResults,
          httpStatus: result.httpStatus,
          apiMessage: result.data?.message || null
        });

        if (responseFixtures.length > 0) {
          isNextAvailable = true;
        }

        for (const item of responseFixtures) {
          allFixtures.push(
            normaliseFixture(item, competition)
          );
        }

      } catch (error) {

        diagnostics.push({
          competition: `${competition.code}-NEXT`,
          returned: 0,
          apiResults: 0,
          error: error?.message || String(error)
        });
      }
    }
  }

  /*
    Sort fixtures by date/time.
  */

  allFixtures.sort((a, b) => {
    return new Date(a.date || 0) - new Date(b.date || 0);
  });

  /*
    Limit response to 40 fixtures.
  */

  const fixturesList = allFixtures.slice(0, 40);

  const responseData = {
    ok: true,
    source: "API-Football",

    from,
    to,

    mode,
    isNextAvailable,

    fixtures: fixturesList,

    /*
      Keep events for compatibility with the existing frontend.
    */
    events: fixturesList,

    count: fixturesList.length,

    diagnostics,

    updated: now.toISOString()
  };

  const response = json(responseData, 200, {
    "Cache-Control": `public, max-age=${FIXTURE_CACHE_SECONDS}`
  });

  /*
    Store in Cloudflare edge cache.
  */

  await cache.put(cacheUrl, response.clone());

  return response;
}

/* =========================================================
   SCORES
   ========================================================= */

async function scores(request, env) {

  /*
    Keep the existing score system available.

    If LATEST_SCORES contains a cached response,
    return it.
  */

  if (env.LATEST_SCORES) {

    try {

      const cached = await env.LATEST_SCORES.get("scores");

      if (cached) {

        return json(
          typeof cached === "string"
            ? JSON.parse(cached)
            : cached
        );
      }

    } catch (error) {

      console.log("LATEST_SCORES read error:", error);
    }
  }

  /*
    Fallback to API-Football.
  */

  try {

    const date = todayUTC();

    const result = await apiFootball(
      `/fixtures?date=${date}`,
      env
    );

    if (!result.ok) {

      return json({
        ok: false,
        error: "API-Football request failed",
        httpStatus: result.httpStatus,
        response: result.data
      }, 502);
    }

    const responseFixtures = result.data?.response ?? [];

    const events = responseFixtures.map(item => {

      const competition = COMPETITIONS.find(
        c => c.id === item?.league?.id
      ) || {
        code: String(item?.league?.id || ""),
        name: item?.league?.name || "Football",
        id: item?.league?.id || null
      };

      return normaliseFixture(item, competition);
    });

    return json({
      ok: true,
      events,
      live: events.filter(e =>
        ["1H", "2H", "HT", "ET", "P"].includes(e.status)
      ),
      finished: events.filter(e =>
        ["FT", "AET", "PEN"].includes(e.status)
      ),
      upcoming: events.filter(e =>
        ["NS", "TBD"].includes(e.status)
      ),
      count: events.length,
      liveCount: events.filter(e =>
        ["1H", "2H", "HT", "ET", "P"].includes(e.status)
      ).length,
      updated: new Date().toISOString()
    });

  } catch (error) {

    return json({
      ok: false,
      error: error?.message || String(error)
    }, 500);
  }
}

/* =========================================================
   BBC NEWS
   ========================================================= */

function decodeEntities(str) {

  if (!str) return "";

  return str
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

function xmlValue(block, tag) {

  const re = new RegExp(
    `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = block.match(re);

  return match
    ? decodeEntities(match[1])
    : "";
}

function parseBBCNews(xml) {

  const items = [];

  const matches = xml.match(
    /<item[\s\S]*?<\/item>/gi
  ) || [];

  for (const block of matches) {

    const title = xmlValue(block, "title");
    const link = xmlValue(block, "link");
    const description = xmlValue(block, "description");
    const pubDate = xmlValue(block, "pubDate");

    if (!title) continue;

    items.push({
      title,
      description,
      link,
      pubDate,
      source: "BBC Sport"
    });
  }

  return items.slice(0, 12);
}

async function news() {

  const url =
    "https://feeds.bbci.co.uk/sport/football/rss.xml";

  try {

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 YepFootball/2026"
      }
    });

    if (!response.ok) {

      return json({
        ok: false,
        error: `BBC RSS HTTP ${response.status}`,
        articles: []
      }, 502);
    }

    const xml = await response.text();

    const articles = parseBBCNews(xml);

    return json({
      ok: true,
      source: "BBC Sport",
      articles,
      count: articles.length,
      updated: new Date().toISOString()
    });

  } catch (error) {

    return json({
      ok: false,
      error: error?.message || String(error),
      articles: []
    }, 500);
  }
}

/* =========================================================
   HEALTH
   ========================================================= */

async function health(env) {

  return json({
    ok: true,
    service: "YepFootball API",
    version: "2026-09-22.2",
    date: todayUTC(),

    bindings: {
      LATEST_SCORES: !!env.LATEST_SCORES,
      FOOTBALL_DATA_TOKEN: !!env.FOOTBALL_DATA_TOKEN,
      API_FOOTBALL_KEY: !!env.API_FOOTBALL_KEY
    },

    competitions: COMPETITIONS,

    endpoints: [
      "/api/scores",
      "/api/fixtures",
      "/api/fixture-test",
      "/api/news",
      "/api/match-centre",
      "/api/health"
    ],

    updated: new Date().toISOString()
  });
}

/* =========================================================
   MATCH CENTRE
   ========================================================= */

async function matchCentre() {

  return json({
    ok: true,
    message: "Match Centre ready",
    updated: new Date().toISOString()
  });
}

/* =========================================================
   MAIN HANDLER
   ========================================================= */

export default {

  async fetch(request, env, ctx) {

    if (request.method === "OPTIONS") {

      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {

      if (path === "/api/health") {
        return await health(env);
      }

      if (path === "/api/fixture-test") {
        return await fixtureTest(env);
      }

      if (path === "/api/fixtures") {
        return await fixtures(request, env);
      }

      if (path === "/api/scores") {
        return await scores(request, env);
      }

      if (path === "/api/news") {
        return await news();
      }

      if (path === "/api/match-centre") {
        return await matchCentre();
      }

      return new Response("YepFootball Worker OK", {
        status: 200,
        headers: {
          ...corsHeaders(),
          "Content-Type": "text/plain; charset=utf-8"
        }
      });

    } catch (error) {

      return json({
        ok: false,
        error: error?.message || String(error),
        path
      }, 500);
    }
  }
};