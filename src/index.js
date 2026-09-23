/* =========================================================
   YepFootball Cloudflare Worker
   Version: 2026-09-23.3

   SCORES:
   Existing LATEST_SCORES / API-Football fallback

   FIXTURES:
   football-data.org via /api/fixtures-v2

   NEWS:
   BBC Sport RSS

   IMPORTANT:
   /api/fixtures-v2 is intentionally a NEW endpoint
   to avoid the old Cloudflare /api/fixtures cache.
   ========================================================= */

const API_FOOTBALL_BASE =
  "https://v3.football.api-sports.io";

const FOOTBALL_DATA_BASE =
  "https://api.football-data.org/v4";

const FIXTURE_CACHE_SECONDS = 1800;


/* =========================================================
   COMPETITIONS
   ========================================================= */

const COMPETITIONS = [
  {
    code: "CL",
    name: "Champions League",
    footballDataCode: "CL",
    apiFootballId: 2
  },
  {
    code: "EL",
    name: "Europa League",
    footballDataCode: "EL",
    apiFootballId: 3
  },
  {
    code: "ECL",
    name: "Conference League",
    footballDataCode: "ECL",
    apiFootballId: 848
  },
  {
    code: "PL",
    name: "Premier League",
    footballDataCode: "PL",
    apiFootballId: 39
  },
  {
    code: "PD",
    name: "La Liga",
    footballDataCode: "PD",
    apiFootballId: 140
  },
  {
    code: "SA",
    name: "Serie A",
    footballDataCode: "SA",
    apiFootballId: 135
  },
  {
    code: "BL1",
    name: "Bundesliga",
    footballDataCode: "BL1",
    apiFootballId: 78
  },
  {
    code: "FL1",
    name: "Ligue 1",
    footballDataCode: "FL1",
    apiFootballId: 61
  }
];

const SCORE_LEAGUE_IDS = new Set(
  COMPETITIONS.map(c => c.apiFootballId)
);


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

function json(
  data,
  status = 200,
  extraHeaders = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store, max-age=0",

        ...corsHeaders(),
        ...extraHeaders
      }
    }
  );
}


/* =========================================================
   DATE HELPERS
   ========================================================= */

function todayUTC() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function addDays(
  dateString,
  days
) {
  const d =
    new Date(
      `${dateString}T00:00:00Z`
    );

  d.setUTCDate(
    d.getUTCDate() + days
  );

  return d
    .toISOString()
    .slice(0, 10);
}


/* =========================================================
   API-FOOTBALL
   ========================================================= */

async function apiFootball(
  path,
  env
) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error(
      "Missing Cloudflare secret API_FOOTBALL_KEY"
    );
  }

  const response =
    await fetch(
      `${API_FOOTBALL_BASE}${path}`,
      {
        method: "GET",
        headers: {
          "x-apisports-key":
            env.API_FOOTBALL_KEY,

          "Accept":
            "application/json"
        }
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  return {
    httpStatus:
      response.status,

    ok:
      response.ok,

    data
  };
}


/* =========================================================
   FOOTBALL-DATA.ORG
   ========================================================= */

async function footballData(
  path,
  env
) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );
  }

  const response =
    await fetch(
      `${FOOTBALL_DATA_BASE}${path}`,
      {
        method: "GET",

        headers: {
          "X-Auth-Token":
            env.FOOTBALL_DATA_TOKEN,

          "Accept":
            "application/json"
        }
      }
    );

  let data = null;

  try {
    data =
      await response.json();
  } catch {
    data = null;
  }

  return {
    httpStatus:
      response.status,

    ok:
      response.ok,

    data
  };
}


/* =========================================================
   API-FOOTBALL FIXTURE NORMALISER
   ========================================================= */

function normaliseApiFootballFixture(
  item,
  competition
) {
  const fixture =
    item?.fixture || {};

  const league =
    item?.league || {};

  const teams =
    item?.teams || {};

  const goals =
    item?.goals || {};

  return {
    id:
      fixture.id ?? null,

    date:
      fixture.date ?? null,

    timestamp:
      fixture.timestamp ?? null,

    status:
      fixture.status?.short ?? null,

    statusLong:
      fixture.status?.long ?? null,

    league:
      league.name ||
      competition.name,

    leagueCode:
      competition.code,

    leagueId:
      league.id ||
      competition.apiFootballId,

    homeTeam: {
      id:
        teams.home?.id ?? null,

      name:
        teams.home?.name || "",

      shortName:
        teams.home?.name || "",

      crest:
        teams.home?.logo || ""
    },

    awayTeam: {
      id:
        teams.away?.id ?? null,

      name:
        teams.away?.name || "",

      shortName:
        teams.away?.name || "",

      crest:
        teams.away?.logo || ""
    },

    homeScore:
      goals.home ?? null,

    awayScore:
      goals.away ?? null
  };
}


/* =========================================================
   FOOTBALL-DATA.ORG FIXTURE NORMALISER
   ========================================================= */

function normaliseFootballDataFixture(
  item
) {
  return {
    id:
      item.id ?? null,

    date:
      item.utcDate ?? null,

    timestamp:
      item.utcDate
        ? Math.floor(
            new Date(
              item.utcDate
            ).getTime() / 1000
          )
        : null,

    status:
      item.status ?? null,

    statusLong:
      item.status ?? null,

    league:
      item.competition?.name ||
      "Football",

    leagueCode:
      item.competition?.code ||
      "",

    leagueId:
      item.competition?.id ??
      null,

    homeTeam: {
      id:
        item.homeTeam?.id ??
        null,

      name:
        item.homeTeam?.name ||
        "",

      shortName:
        item.homeTeam?.shortName ||
        item.homeTeam?.name ||
        "",

      crest:
        item.homeTeam?.crest ||
        ""
    },

    awayTeam: {
      id:
        item.awayTeam?.id ??
        null,

      name:
        item.awayTeam?.name ||
        "",

      shortName:
        item.awayTeam?.shortName ||
        item.awayTeam?.name ||
        "",

      crest:
        item.awayTeam?.crest ||
        ""
    },

    homeScore:
      item.score?.fullTime?.home ??
      null,

    awayScore:
      item.score?.fullTime?.away ??
      null
  };
}


/* =========================================================
   FIXTURE TEST
   ========================================================= */

async function fixtureTest(env) {
  try {

    const from =
      todayUTC();

    const to =
      addDays(
        from,
        9
      );

    const path =
      `/matches?competitions=PL,CL,PD,SA,BL1,FL1` +
      `&dateFrom=${from}` +
      `&dateTo=${to}`;

    const result =
      await footballData(
        path,
        env
      );

    return json({
      ok:
        result.ok,

      source:
        "football-data.org",

      httpStatus:
        result.httpStatus,

      request: {
        competitions:
          "PL,CL,PD,SA,BL1,FL1",

        dateFrom:
          from,

        dateTo:
          to
      },

      apiCount:
        result.data?.count ??
        0,

      matches:
        result.data?.matches ??
        [],

      message:
        result.data?.message ||
        null,

      checked:
        new Date().toISOString()
    });

  } catch (error) {

    return json({
      ok: false,

      source:
        "football-data.org",

      error:
        error?.message ||
        String(error),

      checked:
        new Date().toISOString()
    }, 500);
  }
}


/* =========================================================
   FIXTURES
   NEW ENDPOINT: /api/fixtures-v2
   ========================================================= */

async function fixtures(
  request,
  env
) {

  const now =
    new Date();

  const today =
    todayUTC();


  /* -------------------------------------------------------
     NEW CACHE KEY

     This deliberately does NOT use the old
     /api/fixtures cache.
     ------------------------------------------------------- */

  const cacheUrl =
    new URL(request.url);

  cacheUrl.pathname =
    "/api/fixtures-v20260922";

  cacheUrl.search =
    "";

  const cache =
    caches.default;


  /*
     Only use cache if we previously found
     actual fixtures.
  */

  const cached =
    await cache.match(
      cacheUrl
    );

  if (cached) {
    return cached;
  }


  /* -------------------------------------------------------
     SEARCH UP TO 60 DAYS

     football-data.org has a maximum date
     range of 10 days per request.

     Therefore:
       1. 22 Sep - 1 Oct
       2. 2 Oct - 11 Oct
       3. 12 Oct - 21 Oct
       4. 22 Oct - 31 Oct
       5. 1 Nov - 10 Nov
       6. 11 Nov - 20 Nov
     ------------------------------------------------------- */

  const windows = [];

  for (
    let offset = 0;
    offset < 60;
    offset += 10
  ) {

    windows.push({
      from:
        addDays(
          today,
          offset
        ),

      to:
        addDays(
          today,
          offset + 9
        )
    });
  }


  const allFixtures =
    [];

  const diagnostics =
    [];

  let selectedWindow =
    null;


  /* -------------------------------------------------------
     SEARCH WINDOWS
     ------------------------------------------------------- */

  for (
    const window of windows
  ) {

    /*
       Stop as soon as we find fixtures.
    */

    if (
      allFixtures.length > 0
    ) {
      break;
    }


    const path =
      `/matches?competitions=PL,CL,PD,SA,BL1,FL1` +
      `&dateFrom=${window.from}` +
      `&dateTo=${window.to}`;


    try {

      const result =
        await footballData(
          path,
          env
        );


      const matches =
        result.data?.matches ||
        [];


      diagnostics.push({

        from:
          window.from,

        to:
          window.to,

        httpStatus:
          result.httpStatus,

        returned:
          matches.length,

        apiCount:
          result.data?.count ??
          0,

        message:
          result.data?.message ||
          null
      });


      if (
        matches.length > 0
      ) {

        selectedWindow =
          window;


        for (
          const match of matches
        ) {

          allFixtures.push(
            normaliseFootballDataFixture(
              match
            )
          );
        }
      }


    } catch (error) {

      diagnostics.push({

        from:
          window.from,

        to:
          window.to,

        returned:
          0,

        error:
          error?.message ||
          String(error)
      });
    }
  }


  /* -------------------------------------------------------
     SORT FIXTURES
     ------------------------------------------------------- */

  allFixtures.sort(
    (a, b) =>
      new Date(
        a.date || 0
      ) -
      new Date(
        b.date || 0
      )
  );


  /* -------------------------------------------------------
     REMOVE DUPLICATES
     ------------------------------------------------------- */

  const unique =
    [];

  const seen =
    new Set();


  for (
    const fixture of allFixtures
  ) {

    const key =
      fixture.id ||
      `${fixture.date}-${fixture.homeTeam.name}-${fixture.awayTeam.name}`;


    if (
      seen.has(key)
    ) {
      continue;
    }


    seen.add(key);

    unique.push(
      fixture
    );
  }


  /* -------------------------------------------------------
     LIMIT TO 40 FIXTURES
     ------------------------------------------------------- */

  const fixturesList =
    unique.slice(
      0,
      40
    );


  /* -------------------------------------------------------
     MODE
     ------------------------------------------------------- */

  let mode =
    "upcoming";

  let isNextAvailable =
    false;


  if (
    selectedWindow &&
    selectedWindow.from !== today
  ) {

    mode =
      "next";

    isNextAvailable =
      true;
  }


  /* -------------------------------------------------------
     MESSAGE
     ------------------------------------------------------- */

  let message =
    null;


  if (
    fixturesList.length === 0
  ) {

    message =
      "No fixtures found in the next 60 days.";

  } else if (
    isNextAvailable
  ) {

    message =
      "No fixtures during the current period. Showing the next available matches.";
  }


  /* -------------------------------------------------------
     RESPONSE
     ------------------------------------------------------- */

  const responseData = {

    ok: true,

    source:
      "football-data.org",

    from:
      today,

    to:
      selectedWindow
        ? selectedWindow.to
        : addDays(
            today,
            59
          ),

    mode,

    isNextAvailable,

    fixtures:
      fixturesList,

    /*
       Compatibility with app.js
    */

    events:
      fixturesList,

    count:
      fixturesList.length,

    message,

    diagnostics,

    updated:
      now.toISOString()
  };


  const response =
    json(
      responseData,
      200,
      {
        "Cache-Control":
          `public, max-age=${FIXTURE_CACHE_SECONDS}`
      }
    );


  /*
     IMPORTANT:
     Never cache an empty fixture response.
  */

  if (
    fixturesList.length > 0
  ) {

    await cache.put(
      cacheUrl,
      response.clone()
    );
  }


  return response;
}


/* =========================================================
   SCORES
   ========================================================= */

async function scores(
  request,
  env
) {

  /*
     Scores behaviour:
       1. Always show live/finished/today results when available.
       2. If there are no matches today or yesterday, automatically
          fall back to the latest completed matchday available for
          each supported European competition.

     This prevents the Scores page from appearing empty during
     international breaks or other gaps in the calendar.
  */

  try {
    const today = todayUTC();
    const yesterday = addDays(today, -1);
    const recentStart = addDays(today, -14);
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = "/api/scores-v20260923-latest";
    cacheUrl.search = `?from=${recentStart}&to=${today}`;

    const cache = caches.default;
    const cached = await cache.match(cacheUrl);
    if (cached) return cached;

    const fetchRange = async (from, to) => {
      try {
        const result = await apiFootball(
          `/fixtures?from=${from}&to=${to}`,
          env
        );
        return Array.isArray(result.data?.response)
          ? result.data.response
          : [];
      } catch {
        return [];
      }
    };

    const [recentFixtures, todayFixtures] = await Promise.all([
      fetchRange(recentStart, yesterday),
      fetchRange(today, today)
    ]);

    const allFixtures = [
      ...recentFixtures,
      ...todayFixtures
    ].filter(item =>
      SCORE_LEAGUE_IDS.has(Number(item?.league?.id))
    );

    const unique = new Map();
    for (const item of allFixtures) {
      const id = String(item?.fixture?.id || "");
      if (id) unique.set(id, item);
    }

    const events = [];
    for (const item of unique.values()) {
      const competition = COMPETITIONS.find(
        c => c.apiFootballId === Number(item?.league?.id)
      ) || {
        code: String(item?.league?.id || ""),
        name: item?.league?.name || "Football",
        apiFootballId: item?.league?.id || null
      };

      const date = String(item?.fixture?.date || "");
      const scoreDate = date.slice(0, 10);
      const event = {
        ...normaliseApiFootballFixture(item, competition),
        scoreDate,
        scoreDay:
          scoreDate === yesterday
            ? "yesterday"
            : scoreDate === today
              ? "today"
              : "recent"
      };

      events.push(event);
    }

    events.sort(
      (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
    );

    const live = events.filter(e =>
      ["1H", "2H", "HT", "ET", "P"].includes(e?.status)
    );

    const finished = events.filter(e =>
      ["FT", "AET", "PEN"].includes(e?.status)
    );

    const upcoming = events.filter(e =>
      ["NS", "TBD"].includes(e?.status)
    );

    const yesterdayEvents = events.filter(
      e => e.scoreDay === "yesterday"
    );
    const todayEvents = events.filter(
      e => e.scoreDay === "today"
    );

    /*
       Latest available results are calculated independently for each
       competition. We take the most recent completed date in that
       competition, then return every completed match from that date.
    */
    const latestDateByLeague = new Map();

    for (const event of finished) {
      const leagueId = Number(event?.leagueId);
      const date = event?.scoreDate;
      if (!leagueId || !date) continue;

      const previous = latestDateByLeague.get(leagueId);
      if (!previous || date > previous) {
        latestDateByLeague.set(leagueId, date);
      }
    }

    const latestAvailable = finished.filter(event =>
      event?.scoreDate ===
      latestDateByLeague.get(Number(event?.leagueId))
    );

    latestAvailable.sort((a, b) => {
      const leagueA = Number(a?.leagueId || 0);
      const leagueB = Number(b?.leagueId || 0);
      if (leagueA !== leagueB) return leagueA - leagueB;
      return new Date(a.date || 0) - new Date(b.date || 0);
    });

    const hasCurrent =
      yesterdayEvents.length > 0 ||
      todayEvents.length > 0;

    const responseData = {
      ok: true,
      yesterday,
      today,
      events,
      live,
      finished,
      upcoming,
      yesterdayEvents,
      todayEvents,
      latestAvailable,
      latestDateByLeague: Object.fromEntries(
        latestDateByLeague.entries()
      ),
      count: events.length,
      liveCount: live.length,
      updated: new Date().toISOString(),
      scoreWindow: hasCurrent
        ? "yesterday-and-today"
        : "latest-available"
    };

    const response = json(
      responseData,
      200,
      {
        "Cache-Control": "public, max-age=60, s-maxage=60"
      }
    );

    await cache.put(cacheUrl, response.clone());
    return response;

  } catch (error) {
    return json({
      ok: false,
      error: error?.message || String(error),
      updated: new Date().toISOString()
    }, 500);
  }
}

function decodeEntities(str) {

  if (!str) {
    return "";
  }

  return str
    .replace(
      /<!\[CDATA\[/g,
      ""
    )
    .replace(
      /\]\]>/g,
      ""
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&#x27;/g,
      "'"
    )
    .trim();
}


function xmlValue(
  block,
  tag
) {

  const re =
    new RegExp(
      `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );


  const match =
    block.match(re);


  return match
    ? decodeEntities(
        match[1]
      )
    : "";
}


function mediaImage(block) {

  const mediaMatch =
    block.match(
      /<media:(?:thumbnail|content)[^>]*\\burl=["']([^"']+)["']/i
    );

  if (mediaMatch?.[1]) {
    return decodeEntities(
      mediaMatch[1]
    );
  }

  const enclosureMatch =
    block.match(
      /<enclosure[^>]*\\burl=["']([^"']+)["']/i
    );

  return enclosureMatch?.[1]
    ? decodeEntities(
        enclosureMatch[1]
      )
    : "";
}


function parseBBCNews(xml) {

  const items =
    [];

  const matches =
    xml.match(
      /<item[\s\S]*?<\/item>/gi
    ) || [];


  for (
    const block of matches
  ) {

    const title =
      xmlValue(
        block,
        "title"
      );

    const link =
      xmlValue(
        block,
        "link"
      );

    const description =
      xmlValue(
        block,
        "description"
      );

    const pubDate =
      xmlValue(
        block,
        "pubDate"
      );

    const image =
      mediaImage(
        block
      );


    if (!title) {
      continue;
    }


    items.push({

      title,

      description,

      link,

      pubDate,

      image,

      source:
        "BBC Sport"
    });
  }


  return items.slice(
    0,
    12
  );
}


async function news() {

  const url =
    "https://feeds.bbci.co.uk/sport/football/rss.xml";


  try {

    const response =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 YepFootball/2026"
          }
        }
      );


    if (
      !response.ok
    ) {

      return json({

        ok: false,

        error:
          `BBC RSS HTTP ${response.status}`,

        articles: []

      }, 502);
    }


    const xml =
      await response.text();


    const articles =
      parseBBCNews(
        xml
      );


    return json({

      ok: true,

      source:
        "BBC Sport",

      articles,

      count:
        articles.length,

      updated:
        new Date().toISOString()

    });


  } catch (error) {

    return json({

      ok: false,

      error:
        error?.message ||
        String(error),

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

    service:
      "YepFootball API",

    version:
      "2026-09-23.3",

    date:
      todayUTC(),

    bindings: {

      LATEST_SCORES:
        !!env.LATEST_SCORES,

      FOOTBALL_DATA_TOKEN:
        !!env.FOOTBALL_DATA_TOKEN,

      API_FOOTBALL_KEY:
        !!env.API_FOOTBALL_KEY
    },

    scoreSource:
      "API-Football",

    fixtureSource:
      "football-data.org",

    fixtureEndpoint:
      "/api/fixtures-v2",

    competitions:
      COMPETITIONS.map(
        c => ({
          code:
            c.code,

          name:
            c.name,

          footballDataCode:
            c.footballDataCode,

          apiFootballId:
            c.apiFootballId
        })
      ),

    endpoints: [

      "/api/scores",

      "/api/fixtures",

      "/api/fixtures-v2",

      "/api/fixture-test",

      "/api/news",

      "/api/match-centre",

      "/api/health"

    ],

    updated:
      new Date().toISOString()
  });
}


/* =========================================================
   MATCH CENTRE
   ========================================================= */

async function matchCentre() {

  return json({

    ok: true,

    message:
      "Match Centre ready",

    updated:
      new Date().toISOString()

  });
}


/* =========================================================
   MAIN HANDLER
   ========================================================= */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    if (
      request.method ===
      "OPTIONS"
    ) {

      return new Response(
        null,
        {
          status: 204,

          headers:
            corsHeaders()
        }
      );
    }


    const url =
      new URL(request.url);

    const path =
      url.pathname;


    try {

      /* -----------------------------------------------
         HEALTH
         ----------------------------------------------- */

      if (
        path ===
        "/api/health"
      ) {

        return await health(
          env
        );
      }


      /* -----------------------------------------------
         FIXTURE TEST
         ----------------------------------------------- */

      if (
        path ===
        "/api/fixture-test"
      ) {

        return await fixtureTest(
          env
        );
      }


      /* -----------------------------------------------
         NEW FIXTURE ENDPOINT
         ----------------------------------------------- */

      if (
        path ===
        "/api/fixtures-v2"
      ) {

        return await fixtures(
          request,
          env
        );
      }


      /* -----------------------------------------------
         OLD FIXTURE ENDPOINT

         Left available for compatibility,
         but frontend will NOT use it.
         ----------------------------------------------- */

      if (
        path ===
        "/api/fixtures"
      ) {

        return await fixtures(
          request,
          env
        );
      }


      /* -----------------------------------------------
         SCORES
         ----------------------------------------------- */

      if (
        path ===
        "/api/scores"
      ) {

        return await scores(
          request,
          env
        );
      }


      /* -----------------------------------------------
         NEWS
         ----------------------------------------------- */

      if (
        path ===
        "/api/news"
      ) {

        return await news();
      }


      /* -----------------------------------------------
         MATCH CENTRE
         ----------------------------------------------- */

      if (
        path ===
        "/api/match-centre"
      ) {

        return await matchCentre();
      }


      /* -----------------------------------------------
         ROOT
         ----------------------------------------------- */

      return new Response(
        "YepFootball Worker OK",
        {
          status: 200,

          headers: {

            ...corsHeaders(),

            "Content-Type":
              "text/plain; charset=utf-8"
          }
        }
      );


    } catch (error) {

      return json({

        ok: false,

        error:
          error?.message ||
          String(error),

        path

      }, 500);
    }
  }
};