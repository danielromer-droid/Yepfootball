/* =========================================================
   YepFootball Cloudflare Worker
   Version: 2026-09-22.1

   API ENDPOINTS

   /api/scores
      -> LATEST_SCORES KV

   /api/fixtures
      -> API-Football
      -> Automatically finds NEXT available fixtures
      -> No problem during international breaks

   /api/news
      -> BBC Sport RSS

   /api/match-centre
      -> API-Football

   /api/health
      -> Diagnostics
========================================================= */


/* =========================================================
   CONFIGURATION
========================================================= */

const FOOTBALL_DATA_BASE =
  "https://api.football-data.org/v4";

const API_FOOTBALL_BASE =
  "https://v3.football.api-sports.io";

const BBC_RSS =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";


/* =========================================================
   COMPETITIONS
========================================================= */

const COMPETITIONS = {

  PL: {
    name: "Premier League",
    id: 39
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
  }

};


/* =========================================================
   COMMON RESPONSE HELPERS
========================================================= */

function corsHeaders() {

  return {

    "Access-Control-Allow-Origin": "*",

    "Access-Control-Allow-Methods":
      "GET, OPTIONS",

    "Access-Control-Allow-Headers":
      "Content-Type",

    "Cache-Control":
      "no-store"

  };

}


function json(
  data,
  status = 200
) {

  return new Response(

    JSON.stringify(data),

    {

      status,

      headers: {

        ...corsHeaders(),

        "Content-Type":
          "application/json; charset=utf-8"

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
      `${dateString}T12:00:00Z`
    );

  d.setUTCDate(
    d.getUTCDate() + days
  );

  return d
    .toISOString()
    .slice(0, 10);

}


/* =========================================================
   SCORES
========================================================= */

async function latestScores(env) {

  if (!env.LATEST_SCORES) {

    return {

      events: [],

      live: [],

      finished: [],

      upcoming: [],

      count: 0,

      liveCount: 0,

      message:
        "LATEST_SCORES KV binding is missing.",

      updated:
        new Date().toISOString()

    };

  }


  let raw = null;


  try {

    raw =
      await env.LATEST_SCORES.get(
        "latest"
      );

  }

  catch (error) {

    return {

      events: [],

      live: [],

      finished: [],

      upcoming: [],

      count: 0,

      liveCount: 0,

      message:
        "Unable to read LATEST_SCORES.",

      error:
        String(error),

      updated:
        new Date().toISOString()

    };

  }


  if (!raw) {

    return {

      events: [],

      live: [],

      finished: [],

      upcoming: [],

      count: 0,

      liveCount: 0,

      message:
        "No scores snapshot available yet.",

      updated:
        new Date().toISOString()

    };

  }


  try {

    const data =
      JSON.parse(raw);


    if (

      data &&

      Array.isArray(
        data.events
      ) &&

      Array.isArray(
        data.live
      ) &&

      Array.isArray(
        data.finished
      ) &&

      Array.isArray(
        data.upcoming
      )

    ) {

      return {

        ...data,

        count:
          Number.isFinite(
            data.count
          )
            ? data.count
            : data.events.length,

        liveCount:
          Number.isFinite(
            data.liveCount
          )
            ? data.liveCount
            : data.live.length,

        updated:
          data.updated ||
          new Date().toISOString()

      };

    }


    const events =

      Array.isArray(data)

        ? data

        : Array.isArray(
            data.events
          )

          ? data.events

          : [];


    const live = [];

    const finished = [];

    const upcoming = [];


    for (
      const event of events
    ) {

      const status =

        String(

          event.status ||

          event.statusShort ||

          ""

        ).toUpperCase();


      if (

        status === "LIVE" ||

        status === "IN_PLAY" ||

        status === "PAUSED" ||

        status === "1H" ||

        status === "2H" ||

        status === "HT"

      ) {

        live.push(event);

      }

      else if (

        status === "FINISHED" ||

        status === "FT" ||

        status === "AET" ||

        status === "PEN" ||

        status === "AWARDED"

      ) {

        finished.push(event);

      }

      else {

        upcoming.push(event);

      }

    }


    return {

      events,

      live,

      finished,

      upcoming,

      count:
        events.length,

      liveCount:
        live.length,

      message:
        events.length
          ? ""
          : "No matches scheduled today.",

      updated:
        data.updated ||
        new Date().toISOString()

    };

  }

  catch (error) {

    return {

      events: [],

      live: [],

      finished: [],

      upcoming: [],

      count: 0,

      liveCount: 0,

      message:
        "Invalid scores snapshot.",

      error:
        String(error),

      updated:
        new Date().toISOString()

    };

  }

}


/* =========================================================
   API-FOOTBALL REQUEST
========================================================= */

async function apiFootballFetch(
  url,
  env
) {

  if (!env.API_FOOTBALL_KEY) {

    throw new Error(
      "Missing Cloudflare secret API_FOOTBALL_KEY"
    );

  }


  const response =
    await fetch(

      url,

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


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(text);

  }

  catch {

    data = {

      response: [],

      errors: {

        parse:
          "Invalid JSON response"

      }

    };

  }


  if (!response.ok) {

    throw new Error(

      `API-Football HTTP ${response.status}: ` +

      JSON.stringify(
        data?.errors || {}
      )

    );

  }


  return data;

}


/* =========================================================
   API-FOOTBALL FIXTURE CONVERSION
========================================================= */

function convertFixture(
  match,
  competition
) {

  const fixture =
    match.fixture || {};

  const teams =
    match.teams || {};

  const league =
    match.league || {};

  const goals =
    match.goals || {};


  return {

    id:
      fixture.id ??
      null,

    date:
      fixture.date ||
      "",

    status:
      fixture.status?.short ||
      fixture.status?.long ||
      "",

    statusLong:
      fixture.status?.long ||
      "",

    minute:
      fixture.status?.elapsed ??
      null,

    league:
      competition.name,

    leagueCode:
      competition.code,

    leagueId:
      competition.id,

    homeTeam: {

      id:
        teams.home?.id ??
        null,

      name:
        teams.home?.name ||
        "",

      shortName:
        teams.home?.name ||
        "",

      crest:
        teams.home?.logo ||
        ""

    },

    awayTeam: {

      id:
        teams.away?.id ??
        null,

      name:
        teams.away?.name ||
        "",

      shortName:
        teams.away?.name ||
        "",

      crest:
        teams.away?.logo ||
        ""

    },

    homeScore:
      goals.home ??
      null,

    awayScore:
      goals.away ??
      null,

    venue:
      fixture.venue?.name ||
      "",

    city:
      fixture.venue?.city ||
      "",

    referee:
      fixture.referee ||
      "",

    timestamp:
      fixture.timestamp ??
      null

  };

}


/* =========================================================
   FIXTURE CACHE
   ---------------------------------------------------------
   We cache the complete fixture response for 30 minutes.

   This is important because your API-Football plan has a
   daily request limit.

   The frontend refreshes every 15 minutes, but the Worker
   only goes back to API-Football approximately every
   30 minutes.
========================================================= */

const FIXTURE_CACHE_SECONDS =
  1800;


/* =========================================================
   /api/fixtures
   ---------------------------------------------------------
   IMPORTANT:

   We use API-Football "next" instead of a fixed date range.

   This means:

   21-28 September -> no matches
   ↓
   API automatically finds
   the next available matches
   ↓
   October fixtures appear

   This works through international breaks.
========================================================= */

async function fixtures(
  request,
  env
) {

  const cache =
    caches.default;


  /*
     Cache key is based on the endpoint.
  */

  const cacheUrl =
    new URL(
      request.url
    );


  cacheUrl.search =
    "";


  const cacheRequest =
    new Request(
      cacheUrl.toString(),
      {
        method: "GET"
      }
    );


  /*
     Try Cloudflare edge cache first.
  */

  const cached =
    await cache.match(
      cacheRequest
    );


  if (cached) {

    const cachedText =
      await cached.text();


    try {

      const cachedData =
        JSON.parse(
          cachedText
        );


      return json(
        cachedData
      );

    }

    catch {

      /*
         Ignore bad cache and continue.
      */

    }

  }


  const competitions = [

    {
      code: "PL",
      name: "Premier League",
      id: 39
    },

    {
      code: "CL",
      name: "Champions League",
      id: 2
    },

    {
      code: "EL",
      name: "Europa League",
      id: 3
    },

    {
      code: "ECL",
      name: "Conference League",
      id: 848
    },

    {
      code: "PD",
      name: "La Liga",
      id: 140
    },

    {
      code: "SA",
      name: "Serie A",
      id: 135
    },

    {
      code: "BL1",
      name: "Bundesliga",
      id: 78
    },

    {
      code: "FL1",
      name: "Ligue 1",
      id: 61
    }

  ];


  const diagnostics = [];


  /*
     Query all competitions.

     "next=5" means API-Football returns the next
     available matches rather than only today's
     or the next seven days.

     Therefore an international break is no problem.
  */

  const requests =
    competitions.map(
      async competition => {

        const url =

          `${API_FOOTBALL_BASE}/fixtures` +

          `?league=${competition.id}` +

          `&season=2026` +

          `&next=5`;


        try {

          const data =
            await apiFootballFetch(
              url,
              env
            );


          const matches =

            Array.isArray(
              data.response
            )

              ? data.response

              : [];


          diagnostics.push({

            competition:
              competition.code,

            returned:
              matches.length,

            apiResults:
              data.results ??
              matches.length

          });


          return matches.map(
            match =>
              convertFixture(
                match,
                competition
              )
          );

        }

        catch (error) {

          diagnostics.push({

            competition:
              competition.code,

            returned:
              0,

            error:
              String(
                error?.message ||
                error
              )

          });


          return [];

        }

      }

    );


  const results =
    await Promise.all(
      requests
    );


  const allFixtures =
    results.flat();


  /*
     Keep only genuinely upcoming matches.
  */

  const now =
    Date.now();


  const upcoming =

    allFixtures

      .filter(
        fixture => {

          if (!fixture.date) {

            return false;

          }


          const time =
            new Date(
              fixture.date
            ).getTime();


          return (

            Number.isFinite(time) &&

            time >=
              now - 60 * 1000

          );

        }

      );


  /*
     Remove duplicates.
  */

  const unique =

    Array.from(

      new Map(

        upcoming.map(
          fixture => [
            fixture.id,
            fixture
          ]
        )

      ).values()

    );


  /*
     Sort by date.
  */

  unique.sort(

    (a, b) =>

      new Date(a.date) -
      new Date(b.date)

  );


  /*
     Work out the date of the first fixture.
  */

  let firstFixtureDate =
    null;


  if (unique.length) {

    firstFixtureDate =
      unique[0].date;

  }


  /*
     Determine whether we are showing fixtures
     outside the current seven-day period.

     This is useful to the frontend so it can say:

     "No fixtures during the current period.
      Showing the next available matches."
  */

  const today =
    todayUTC();


  const sevenDays =
    addDays(
      today,
      7
    );


  let isNextAvailable =
    false;


  if (firstFixtureDate) {

    const firstDate =
      new Date(
        firstFixtureDate
      );


    const sevenDayEnd =
      new Date(
        `${sevenDays}T23:59:59Z`
      );


    isNextAvailable =
      firstDate >
      sevenDayEnd;

  }


  const result = {

    ok: true,

    source:
      "API-Football",

    /*
       These indicate the actual fixtures returned,
       not the old fixed 7-day search.
    */

    from:
      firstFixtureDate
        ? firstFixtureDate.slice(
            0,
            10
          )
        : today,

    to:
      firstFixtureDate
        ? unique[
            unique.length - 1
          ].date.slice(
            0,
            10
          )
        : sevenDays,

    mode:
      isNextAvailable
        ? "next"
        : "upcoming",

    isNextAvailable,

    fixtures:
      unique,

    events:
      unique,

    count:
      unique.length,

    diagnostics,

    updated:
      new Date().toISOString()

  };


  /*
     Store in Cloudflare edge cache.

     30 minutes.

     This prevents every frontend refresh from consuming
     API-Football quota.
  */

  try {

    const cacheResponse =
      new Response(

        JSON.stringify(
          result
        ),

        {

          status: 200,

          headers: {

            "Content-Type":
              "application/json; charset=utf-8",

            "Cache-Control":
              `public, max-age=${FIXTURE_CACHE_SECONDS}`

          }

        }

      );


    await cache.put(
      cacheRequest,
      cacheResponse
    );

  }

  catch (error) {

    /*
       Cache failure must never break
       the actual API response.
    */

    console.error(
      "Fixture cache error:",
      error
    );

  }


  return json(
    result
  );

}


/* =========================================================
   BBC XML HELPERS
========================================================= */

function removeCDATA(
  value
) {

  if (!value) {

    return "";

  }


  return String(value)

    .replace(
      /<!\[CDATA\[/gi,
      ""
    )

    .replace(
      /\]\]>/gi,
      ""
    );

}


function decodeEntities(
  value
) {

  if (!value) {

    return "";

  }


  let s =
    String(value);


  /*
     Decimal entities
  */

  s =
    s.replace(
      /&#(\d+);/g,
      (_, n) => {

        const code =
          Number.parseInt(
            n,
            10
          );


        if (

          !Number.isFinite(
            code
          ) ||

          code < 0 ||

          code >
            0x10FFFF

        ) {

          return _;

        }


        return String.fromCodePoint(
          code
        );

      }
    );


  /*
     Hex entities
  */

  s =
    s.replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) => {

        const code =
          Number.parseInt(
            n,
            16
          );


        if (

          !Number.isFinite(
            code
          ) ||

          code < 0 ||

          code >
            0x10FFFF

        ) {

          return _;

        }


        return String.fromCodePoint(
          code
        );

      }
    );


  const entities = {

    "&amp;": "&",

    "&lt;": "<",

    "&gt;": ">",

    "&quot;": '"',

    "&apos;": "'",

    "&nbsp;": " ",

    "&ndash;": "–",

    "&mdash;": "—",

    "&hellip;": "…",

    "&rsquo;": "’",

    "&lsquo;": "‘",

    "&rdquo;": "”",

    "&ldquo;": "“"

  };


  for (
    const [key, value2]
    of Object.entries(
      entities
    )
  ) {

    s =
      s.replace(
        new RegExp(
          key,
          "gi"
        ),
        value2
      );

  }


  return s;

}


function cleanText(
  value
) {

  if (!value) {

    return "";

  }


  let s =
    removeCDATA(
      value
    );


  s =
    s.replace(
      /<br\s*\/?>/gi,
      " "
    );


  s =
    s.replace(
      /<\/?[^>]+>/g,
      " "
    );


  s =
    decodeEntities(
      s
    );


  s =
    s.replace(
      /\s+/g,
      " "
    )
    .trim();


  return s;

}


function xmlValue(
  xml,
  tag
) {

  const regex =
    new RegExp(

      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,

      "i"

    );


  const match =
    xml.match(
      regex
    );


  if (!match) {

    return "";

  }


  return cleanText(
    match[1]
  );

}


function extractItems(
  xml
) {

  const matches =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    );


  return matches || [];

}


/* =========================================================
   BBC NEWS PARSER
========================================================= */

function parseNews(
  xml
) {

  const items =
    extractItems(
      xml
    );


  const news = [];


  for (
    const item
    of items
  ) {

    const title =
      xmlValue(
        item,
        "title"
      );


    const description =
      xmlValue(
        item,
        "description"
      );


    const link =
      xmlValue(
        item,
        "link"
      );


    const pubDate =
      xmlValue(
        item,
        "pubDate"
      );


    const guid =
      xmlValue(
        item,
        "guid"
      );


    if (!title) {

      continue;

    }


    news.push({

      title,

      description,

      link:
        link ||
        guid ||
        "",

      date:
        pubDate ||
        "",

      published:
        pubDate ||
        "",

      source:
        "BBC Sport"

    });

  }


  return news;

}


/* =========================================================
   /api/news
========================================================= */

async function news() {

  try {

    const response =
      await fetch(

        BBC_RSS,

        {

          method:
            "GET",

          headers: {

            "User-Agent":
              "YepFootball/1.0",

            "Accept":
              "application/rss+xml, application/xml, text/xml"

          }

        }

      );


    if (!response.ok) {

      throw new Error(

        `BBC RSS returned HTTP ${response.status}`

      );

    }


    const xml =
      await response.text();


    const articles =
      parseNews(
        xml
      );


    return {

      ok: true,

      source:
        "BBC Sport",

      articles,

      news:
        articles,

      count:
        articles.length,

      updated:
        new Date().toISOString()

    };

  }

  catch (error) {

    return {

      ok: false,

      source:
        "BBC Sport",

      articles: [],

      news: [],

      count: 0,

      message:
        String(
          error?.message ||
          error
        ),

      updated:
        new Date().toISOString()

    };

  }

}


/* =========================================================
   MATCH CENTRE
========================================================= */

async function matchCentre(
  request,
  env
) {

  try {

    const url =
      new URL(
        request.url
      );


    const league =
      url.searchParams.get(
        "league"
      ) ||
      "PL";


    const date =
      url.searchParams.get(
        "date"
      ) ||
      todayUTC();


    const competition =
      COMPETITIONS[
        league.toUpperCase()
      ];


    if (!competition) {

      return json(

        {

          ok: false,

          message:
            "Unknown league."

        },

        400

      );

    }


    const apiUrl =

      `${API_FOOTBALL_BASE}/fixtures` +

      `?league=${competition.id}` +

      `&season=2026` +

      `&date=${encodeURIComponent(
        date
      )}`;


    const data =
      await apiFootballFetch(
        apiUrl,
        env
      );


    return json({

      ok: true,

      league,

      leagueId:
        competition.id,

      date,

      response:
        Array.isArray(
          data.response
        )
          ? data.response
          : [],

      results:
        data.results ??
        (
          Array.isArray(
            data.response
          )
            ? data.response.length
            : 0
        ),

      errors:
        data.errors ||
        {},

      updated:
        new Date().toISOString()

    });

  }

  catch (error) {

    return json(

      {

        ok: false,

        response: [],

        message:
          String(
            error?.message ||
            error
          ),

        updated:
          new Date().toISOString()

      },

      500

    );

  }

}


/* =========================================================
   HEALTH
========================================================= */

async function health(
  env
) {

  return {

    ok: true,

    service:
      "YepFootball API",

    version:
      "2026-09-22.1",

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

    competitions:
      Object.entries(
        COMPETITIONS
      ).map(
        ([code, competition]) => ({

          code,

          name:
            competition.name,

          id:
            competition.id

        })
      ),

    endpoints: [

      "/api/scores",

      "/api/fixtures",

      "/api/news",

      "/api/match-centre",

      "/api/health"

    ],

    updated:
      new Date().toISOString()

  };

}


/* =========================================================
   MAIN HANDLER
========================================================= */

async function handle(
  request,
  env
) {

  const url =
    new URL(
      request.url
    );


  const path =
    url.pathname;


  /* -----------------------------------------
     CORS
  ----------------------------------------- */

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


  /* -----------------------------------------
     GET ONLY
  ----------------------------------------- */

  if (
    request.method !==
    "GET"
  ) {

    return json(

      {

        ok: false,

        message:
          "Method not allowed."

      },

      405

    );

  }


  /* -----------------------------------------
     HEALTH
  ----------------------------------------- */

  if (

    path ===
      "/api/health" ||

    path ===
      "/api/health/"

  ) {

    return json(
      await health(env)
    );

  }


  /* -----------------------------------------
     SCORES
  ----------------------------------------- */

  if (

    path ===
      "/api/scores" ||

    path ===
      "/api/scores/"

  ) {

    return json(
      await latestScores(env)
    );

  }


  /* -----------------------------------------
     FIXTURES
  ----------------------------------------- */

  if (

    path ===
      "/api/fixtures" ||

    path ===
      "/api/fixtures/"

  ) {

    return fixtures(
      request,
      env
    );

  }


  /* -----------------------------------------
     NEWS
  ----------------------------------------- */

  if (

    path ===
      "/api/news" ||

    path ===
      "/api/news/"

  ) {

    return json(
      await news()
    );

  }


  /* -----------------------------------------
     MATCH CENTRE
  ----------------------------------------- */

  if (

    path ===
      "/api/match-centre" ||

    path ===
      "/api/match-centre/"

  ) {

    return matchCentre(
      request,
      env
    );

  }


  /* -----------------------------------------
     UNKNOWN API
  ----------------------------------------- */

  if (
    path.startsWith(
      "/api/"
    )
  ) {

    return json(

      {

        ok: false,

        message:
          "API endpoint not found.",

        path

      },

      404

    );

  }


  /* -----------------------------------------
     NON-API
  ----------------------------------------- */

  return new Response(

    "YepFootball API",

    {

      status: 200,

      headers: {

        "Content-Type":
          "text/plain; charset=utf-8"

      }

    }

  );

}


/* =========================================================
   CLOUDFLARE WORKER EXPORT
========================================================= */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    return handle(
      request,
      env
    );

  }

} ;