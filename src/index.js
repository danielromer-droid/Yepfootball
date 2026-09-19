/* =====================================================
   YepFootball Worker
   Version: 2026-09-19.3

   - Static website via Cloudflare Assets
   - /api/* handled by Worker
   - Latest Scores:
       Soccerbase + football-data.org
   - Match Centre:
       API-Football
   - Fixtures:
       football-data.org
   - News:
       BBC Sport RSS
   - Persistent daily snapshot:
       Cloudflare KV
===================================================== */

const VERSION = "2026-09-19.3";

const TZ = "Europe/Paris";

const SOCCERBASE_RESULTS =
  "https://www.soccerbase.com/matches/results.sd";

const FOOTBALL_DATA_API =
  "https://api.football-data.org/v4";

const API_FOOTBALL_API =
  "https://v3.football.api-sports.io";

const BBC_RSS =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";

/* -----------------------------------------------------
   Competitions
----------------------------------------------------- */

const COMPETITIONS = {
  PL: {
    name: "Premier League",
    id: 39
  },

  PD: {
    name: "La Liga",
    id: 140
  },

  SA: {
    name: "Serie A",
    id: 135
  },

  BL1: {
    name: "Bundesliga",
    id: 78
  },

  FL1: {
    name: "Ligue 1",
    id: 61
  },

  CL: {
    name: "Champions League",
    id: 2
  },

  EL: {
    name: "Europa League",
    id: 3
  },

  ECL: {
    name: "Conference League",
    id: 848
  }
};

const FOOTBALL_DATA_COMPETITIONS =
  "PL,PD,SA,BL1,FL1,CL,EL";

const SOCCERBASE_LEAGUES = {
  "Premier League": COMPETITIONS.PL,
  "Italian Serie A": COMPETITIONS.SA,
  "German Bundesliga": COMPETITIONS.BL1,
  "Spanish La Liga": COMPETITIONS.PD,
  "French Ligue 1": COMPETITIONS.FL1,

  "Champions League": COMPETITIONS.CL,
  "European Cup": COMPETITIONS.CL,

  "Europa League": COMPETITIONS.EL,

  "Europa Conference League": COMPETITIONS.ECL,
  "Conference League": COMPETITIONS.ECL
};

/* -----------------------------------------------------
   Generic helpers
----------------------------------------------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function nowISO() {
  return new Date().toISOString();
}

/*
   IMPORTANT:
   Every external request has a timeout.
   This prevents the Worker from hanging.
*/
async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 8000
) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    );
}

function stripTags(value) {
  return decodeEntities(
    String(value || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<\/div>/gi, " ")
      .replace(/<\/td>/gi, " ")
      .replace(/<\/th>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeEvents(events) {
  const map = new Map();

  for (const event of events) {
    const key = [
      event.date || "",
      normalizeName(event.homeTeam?.name),
      normalizeName(event.awayTeam?.name),
      event.leagueId || ""
    ].join("|");

    if (!map.has(key)) {
      map.set(key, event);
    }
  }

  return [...map.values()];
}

/* -----------------------------------------------------
   Europe/Paris date helpers
----------------------------------------------------- */

function dateInParis(offsetDays = 0) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = Number(
    parts.find(p => p.type === "year").value
  );

  const month = Number(
    parts.find(p => p.type === "month").value
  );

  const day = Number(
    parts.find(p => p.type === "day").value
  );

  const d = new Date(
    Date.UTC(year, month - 1, day + offsetDays)
  );

  return d.toISOString().slice(0, 10);
}

/* -----------------------------------------------------
   Soccerbase
----------------------------------------------------- */

async function soccerbaseDailyScores(date) {
  const url =
    `${SOCCERBASE_RESULTS}?date=${encodeURIComponent(date)}`;

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0 YepFootball/1.0",
        "Accept":
          "text/html,application/xhtml+xml"
      }
    },
    8000
  );

  if (!response.ok) {
    throw new Error(
      `Soccerbase HTTP ${response.status}`
    );
  }

  const html = await response.text();

  const events = [];

  /*
     Process headings and table rows in document order.
  */
  const blocks =
    html.match(
      /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<tr\b[^>]*>[\s\S]*?<\/tr>/gi
    ) || [];

  let currentLeague = null;

  for (const block of blocks) {
    if (/^<h[1-6]/i.test(block)) {
      const heading = stripTags(block);

      currentLeague =
        SOCCERBASE_LEAGUES[heading] || null;

      continue;
    }

    if (!currentLeague) continue;

    const anchors = [
      ...block.matchAll(
        /<a\b[^>]*>([\s\S]*?)<\/a>/gi
      )
    ].map(match => stripTags(match[1]))
     .filter(Boolean);

    const scoreIndex = anchors.findIndex(
      text => /^\d+\s*-\s*\d+$/.test(text)
    );

    if (
      scoreIndex < 1 ||
      scoreIndex >= anchors.length - 1
    ) {
      continue;
    }

    const home =
      anchors[scoreIndex - 1];

    const score =
      anchors[scoreIndex];

    const away =
      anchors[scoreIndex + 1];

    const match =
      score.match(/(\d+)\s*-\s*(\d+)/);

    if (!match) continue;

    events.push({
      date: `${date}T12:00:00+02:00`,
      league: currentLeague.name,
      leagueId: currentLeague.id,

      homeTeam: {
        name: home,
        shortName: home,
        crest: ""
      },

      awayTeam: {
        name: away,
        shortName: away,
        crest: ""
      },

      score: {
        home: Number(match[1]),
        away: Number(match[2])
      },

      status: "FT",
      statusLong: "Full Time"
    });
  }

  return events;
}

/* -----------------------------------------------------
   football-data.org
----------------------------------------------------- */

async function footballDataMatches(
  env,
  dateFrom,
  dateTo
) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    return [];
  }

  const url =
    `${FOOTBALL_DATA_API}/matches` +
    `?dateFrom=${dateFrom}` +
    `&dateTo=${dateTo}` +
    `&competitions=${FOOTBALL_DATA_COMPETITIONS}`;

  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "X-Auth-Token":
          env.FOOTBALL_DATA_TOKEN,
        "Accept":
          "application/json"
      }
    },
    7000
  );

  if (!response.ok) {
    throw new Error(
      `football-data HTTP ${response.status}`
    );
  }

  const data = await response.json();

  return (data.matches || []).map(match => {
    const code =
      match.competition?.code;

    const competition =
      COMPETITIONS[code];

    if (!competition) {
      return null;
    }

    const finished =
      match.status === "FINISHED";

    return {
      date: match.utcDate,

      league:
        competition.name,

      leagueId:
        competition.id,

      homeTeam: {
        name:
          match.homeTeam?.name || "Home",

        shortName:
          match.homeTeam?.shortName ||
          match.homeTeam?.name ||
          "Home",

        crest:
          match.homeTeam?.crest || ""
      },

      awayTeam: {
        name:
          match.awayTeam?.name || "Away",

        shortName:
          match.awayTeam?.shortName ||
          match.awayTeam?.name ||
          "Away",

        crest:
          match.awayTeam?.crest || ""
      },

      score: {
        home:
          finished
            ? match.score?.fullTime?.home
            : null,

        away:
          finished
            ? match.score?.fullTime?.away
            : null
      },

      status:
        finished ? "FT" : match.status,

      statusLong:
        finished
          ? "Full Time"
          : match.status
    };
  }).filter(Boolean);
}

/* -----------------------------------------------------
   Daily snapshot
----------------------------------------------------- */

async function readSnapshot(env) {
  if (!env.LATEST_SCORES) {
    return null;
  }

  const keys = [
    "latest_scores",
    "yesterday_scores",
    "latest",
    "yesterday"
  ];

  for (const key of keys) {
    try {
      const value =
        await env.LATEST_SCORES.get(
          key,
          { type: "json" }
        );

      if (value) {
        return value;
      }
    } catch {
      // Continue to next key.
    }
  }

  return null;
}

async function writeSnapshot(env, snapshot) {
  if (!env.LATEST_SCORES) {
    throw new Error(
      "LATEST_SCORES KV binding is missing"
    );
  }

  const value =
    JSON.stringify(snapshot);

  /*
     Keep the snapshot for 7 days.
     This is intentionally longer than 24 hours
     so a temporary source failure cannot erase it.
  */
  await env.LATEST_SCORES.put(
    "latest_scores",
    value,
    {
      expirationTtl: 604800
    }
  );

  await env.LATEST_SCORES.put(
    "yesterday_scores",
    value,
    {
      expirationTtl: 604800
    }
  );
}

async function publishYesterday(
  env,
  force = false
) {
  const date =
    dateInParis(-1);

  const existing =
    await readSnapshot(env);

  /*
     Do not repeatedly refresh the same successful
     snapshot unless explicitly requested.
  */
  if (
    !force &&
    existing &&
    existing.date === date &&
    Array.isArray(existing.events)
  ) {
    return {
      ok: true,
      preserved: true,
      date,
      count: existing.events.length,
      reason:
        "Existing snapshot already covers yesterday"
    };
  }

  const results =
    await Promise.allSettled([
      soccerbaseDailyScores(date),

      footballDataMatches(
        env,
        date,
        date
      )
    ]);

  const soccerbase =
    results[0].status === "fulfilled"
      ? results[0].value
      : [];

  const footballData =
    results[1].status === "fulfilled"
      ? results[1].value
          .filter(e =>
            e.status === "FT"
          )
      : [];

  /*
     Soccerbase is the primary daily source.
     football-data supplements it.
  */
  const events =
    dedupeEvents([
      ...soccerbase,
      ...footballData
    ]);

  /*
     CRITICAL:
     Never replace a good snapshot with an empty one.
  */
  if (!events.length) {
    return {
      ok: false,
      preserved: true,
      date,
      count:
        existing?.events?.length || 0,
      reason:
        "Sources returned no usable results; existing snapshot preserved"
    };
  }

  const snapshot = {
    ok: true,

    version: VERSION,

    date,

    events,

    count: events.length,

    source:
      "Soccerbase + football-data.org",

    publishedAt:
      nowISO(),

    message: null
  };

  await writeSnapshot(
    env,
    snapshot
  );

  return {
    ok: true,
    preserved: false,
    date,
    count: events.length,
    source:
      snapshot.source,
    publishedAt:
      snapshot.publishedAt
  };
}

/* -----------------------------------------------------
   Latest Scores API
----------------------------------------------------- */

async function scores(env, request) {
  const url =
    new URL(request.url);

  const refresh =
    url.searchParams.get("refresh") === "1";

  /*
     Normal page requests only read KV.
     This makes the website extremely fast and
     protects the external sources.
  */
  if (!refresh) {
    const snapshot =
      await readSnapshot(env);

    if (snapshot) {
      return json(snapshot);
    }

    return json({
      ok: true,
      version: VERSION,
      events: [],
      count: 0,
      date: dateInParis(-1),
      source: "KV",
      publishedAt: null,
      message:
        "No daily snapshot is available yet."
    });
  }

  /*
     Manual refresh is deliberately protected
     by the timeouts inside publishYesterday().
  */
  const refreshResult =
    await publishYesterday(
      env,
      true
    );

  const snapshot =
    await readSnapshot(env);

  if (snapshot) {
    return json({
      ...snapshot,
      refresh:
        refreshResult
    });
  }

  return json({
    ok: false,
    events: [],
    count: 0,
    date: dateInParis(-1),
    refresh:
      refreshResult
  }, 503);
}

/* -----------------------------------------------------
   Fixtures
----------------------------------------------------- */

async function fixtures(env) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    return json({
      events: [],
      count: 0,
      message:
        "Football-data token is not configured."
    });
  }

  /*
     Cache fixtures for 10 minutes.
  */
  if (env.LATEST_SCORES) {
    try {
      const cached =
        await env.LATEST_SCORES.get(
          "fixtures_cache",
          { type: "json" }
        );

      if (
        cached &&
        cached.expiresAt >
          Date.now()
      ) {
        return json(cached.data);
      }
    } catch {
      // Ignore cache failure.
    }
  }

  const from =
    dateInParis(0);

  const to =
    dateInParis(7);

  try {
    const matches =
      await footballDataMatches(
        env,
        from,
        to
      );

    const events =
      matches
        .filter(e =>
          e.status !== "FINISHED"
        )
        .sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        );

    const data = {
      ok: true,
      events,
      count: events.length,
      updated:
        nowISO()
    };

    if (env.LATEST_SCORES) {
      try {
        await env.LATEST_SCORES.put(
          "fixtures_cache",
          JSON.stringify({
            expiresAt:
              Date.now() +
              10 * 60 * 1000,
            data
          }),
          {
            expirationTtl: 900
          }
        );
      } catch {
        // Cache failure must not break fixtures.
      }
    }

    return json(data);

  } catch (error) {
    return json({
      ok: false,
      events: [],
      count: 0,
      message:
        error?.message ||
        "Fixtures unavailable"
    }, 502);
  }
}

/* -----------------------------------------------------
   API-Football Match Centre
----------------------------------------------------- */

async function apiFootballMatches(env) {
  if (!env.API_FOOTBALL_KEY) {
    return {
      ok: false,
      events: [],
      live: [],
      finished: [],
      upcoming: [],
      message:
        "API_FOOTBALL_KEY is not configured."
    };
  }

  const url =
    `${API_FOOTBALL_API}/fixtures` +
    `?live=39-2-3-848-140-135-78-61`;

  const response =
    await fetchWithTimeout(
      url,
      {
        headers: {
          "x-apisports-key":
            env.API_FOOTBALL_KEY,
          "Accept":
            "application/json"
        }
      },
      7000
    );

  if (!response.ok) {
    throw new Error(
      `API-Football HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const events =
    (data.response || []).map(item => ({
      date:
        item.fixture?.date,

      league:
        item.league?.name ||
        "Football",

      leagueId:
        item.league?.id,

      homeTeam: {
        name:
          item.teams?.home?.name ||
          "Home",

        shortName:
          item.teams?.home?.name ||
          "Home",

        crest:
          item.teams?.home?.logo ||
          ""
      },

      awayTeam: {
        name:
          item.teams?.away?.name ||
          "Away",

        shortName:
          item.teams?.away?.name ||
          "Away",

        crest:
          item.teams?.away?.logo ||
          ""
      },

      score: {
        home:
          item.goals?.home,

        away:
          item.goals?.away
      },

      status:
        item.fixture?.status?.short,

      statusLong:
        item.fixture?.status?.long
    }));

  const live =
    events.filter(e =>
      [
        "1H",
        "HT",
        "2H",
        "ET",
        "P",
        "LIVE"
      ].includes(e.status)
    );

  const finished =
    events.filter(e =>
      [
        "FT",
        "AET",
        "PEN"
      ].includes(e.status)
    );

  const upcoming =
    events.filter(e =>
      !live.includes(e) &&
      !finished.includes(e)
    );

  return {
    ok: true,
    version: VERSION,
    events,
    live,
    finished,
    upcoming,
    count: events.length,
    liveCount: live.length,
    updated:
      nowISO()
  };
}

/* -----------------------------------------------------
   BBC News
----------------------------------------------------- */

function xmlText(value) {
  return stripTags(
    value
      .replace(
        /<!\[CDATA\[([\s\S]*?)\]\]>/g,
        "$1"
      )
  );
}

function parseBBCNews(xml) {
  const articles = [];

  const items =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];

  for (const item of items) {
    const title =
      item.match(
        /<title[^>]*>([\s\S]*?)<\/title>/i
      )?.[1];

    const link =
      item.match(
        /<link[^>]*>([\s\S]*?)<\/link>/i
      )?.[1];

    const description =
      item.match(
        /<description[^>]*>([\s\S]*?)<\/description>/i
      )?.[1];

    const published =
      item.match(
        /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i
      )?.[1];

    if (!title || !link) {
      continue;
    }

    articles.push({
      title:
        xmlText(title),

      link:
        xmlText(link),

      description:
        description
          ? xmlText(description)
          : "",

      published:
        published
          ? xmlText(published)
          : null,

      source:
        "BBC Sport",

      image: ""
    });
  }

  return articles;
}

async function news() {
  const response =
    await fetchWithTimeout(
      BBC_RSS,
      {
        headers: {
          "User-Agent":
            "YepFootball/1.0",
          "Accept":
            "application/rss+xml, application/xml"
        }
      },
      7000
    );

  if (!response.ok) {
    throw new Error(
      `BBC HTTP ${response.status}`
    );
  }

  const xml =
    await response.text();

  const articles =
    parseBBCNews(xml);

  return {
    ok: true,
    articles:
      articles.slice(0, 20),
    count:
      articles.length,
    updated:
      nowISO()
  };
}

/* -----------------------------------------------------
   Health
----------------------------------------------------- */

async function health(env) {
  return json({
    ok: true,

    version:
      VERSION,

    checked:
      nowISO(),

    upstreams: {
      apiFootball:
        env.API_FOOTBALL_KEY
          ? "configured"
          : "missing",

      footballData:
        env.FOOTBALL_DATA_TOKEN
          ? "configured"
          : "missing",

      latestScores:
        env.LATEST_SCORES
          ? "ok"
          : "missing"
    },

    dailyScoresSource:
      "Soccerbase + football-data.org",

    apiFootballUsedForLatestScores:
      false
  });
}

/* -----------------------------------------------------
   API router
----------------------------------------------------- */

async function handleAPI(
  request,
  env
) {
  const url =
    new URL(request.url);

  const path =
    url.pathname;

  if (path === "/api/health") {
    return health(env);
  }

  if (path === "/api/scores") {
    try {
      return await scores(
        env,
        request
      );
    } catch (error) {
      return json({
        ok: false,
        events: [],
        count: 0,
        message:
          error?.message ||
          "Scores unavailable",
        version:
          VERSION
      }, 502);
    }
  }

  if (path === "/api/fixtures") {
    return fixtures(env);
  }

  if (path === "/api/news") {
    try {
      return json(
        await news()
      );
    } catch (error) {
      return json({
        ok: false,
        articles: [],
        count: 0,
        message:
          error?.message ||
          "News unavailable"
      }, 502);
    }
  }

  /*
     Match Centre aliases.
  */
  if (
    path === "/api/matches" ||
    path === "/api/live"
  ) {
    try {
      return json(
        await apiFootballMatches(env)
      );
    } catch (error) {
      return json({
        ok: false,
        events: [],
        live: [],
        finished: [],
        upcoming: [],
        message:
          error?.message ||
          "Match Centre unavailable"
      }, 502);
    }
  }

  return json({
    ok: false,
    error:
      "API endpoint not found",
    path
  }, 404);
}

/* -----------------------------------------------------
   Worker
----------------------------------------------------- */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(request.url);

    /*
       API routes ALWAYS go through Worker.
    */
    if (
      url.pathname.startsWith("/api/")
    ) {
      return handleAPI(
        request,
        env
      );
    }

    /*
       Everything else is the website.
    */
    return env.ASSETS.fetch(
      request
    );
  },

  /*
     Cron runs every 15 minutes.
     It refreshes yesterday's snapshot,
     but does NOT erase a good snapshot
     when sources fail.
  */
  async scheduled(
    controller,
    env,
    ctx
  ) {
    try {
      const result =
        await publishYesterday(
          env,
          false
        );

      console.log(
        "YepFootball scheduled update:",
        JSON.stringify(result)
      );

    } catch (error) {
      console.error(
        "YepFootball scheduled update failed:",
        error
      );
    }
  }
};