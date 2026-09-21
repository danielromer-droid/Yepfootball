/* =========================================================
   YepFootball Cloudflare Worker
   Version: 2026-09-21.1

   ARCHITECTURE

   /api/scores
      -> LATEST_SCORES KV
      -> Existing scores snapshot preserved

   /api/fixtures
      -> football-data.org v4
      -> Upcoming fixtures
      -> PL, CL, PD, SA, BL1, FL1

   /api/news
      -> BBC Sport Football RSS
      -> CDATA cleaned

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


/*
   Football-data.org competitions
*/
const COMPETITIONS = {
  PL: "Premier League",
  CL: "UEFA Champions League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};


/*
   API-Football competition IDs
*/
const API_FOOTBALL_LEAGUES = {
  PL: 39,
  CL: 2,
  PD: 140,
  SA: 135,
  BL1: 78,
  FL1: 61
};


/* =========================================================
   COMMON RESPONSE HELPERS
========================================================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store"
  };
}


function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders(),
        "Content-Type": "application/json; charset=utf-8"
      }
    }
  );
}


/* =========================================================
   DATE HELPERS
========================================================= */

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}


function todayUTC() {
  return isoDate(new Date());
}


function addDays(dateString, days) {
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}


/* =========================================================
   /api/scores
   ---------------------------------------------------------
   IMPORTANT:
   This keeps the existing LATEST_SCORES architecture.

   The frontend expects:

      events
      live
      finished
      upcoming
      count
      liveCount
      message
      updated
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
      message: "LATEST_SCORES KV binding is missing.",
      updated: new Date().toISOString()
    };
  }


  /*
     The existing snapshot is stored under "latest".
  */

  let raw = null;

  try {
    raw = await env.LATEST_SCORES.get("latest");
  } catch (error) {
    return {
      events: [],
      live: [],
      finished: [],
      upcoming: [],
      count: 0,
      liveCount: 0,
      message: "Unable to read LATEST_SCORES.",
      error: String(error),
      updated: new Date().toISOString()
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
      message: "No scores snapshot available yet.",
      updated: new Date().toISOString()
    };
  }


  try {

    const data = JSON.parse(raw);

    /*
       If the stored snapshot already has the expected
       structure, return it essentially unchanged.
    */

    if (
      data &&
      Array.isArray(data.events) &&
      Array.isArray(data.live) &&
      Array.isArray(data.finished) &&
      Array.isArray(data.upcoming)
    ) {

      return {
        ...data,
        count: Number.isFinite(data.count)
          ? data.count
          : data.events.length,

        liveCount: Number.isFinite(data.liveCount)
          ? data.liveCount
          : data.live.length,

        updated:
          data.updated ||
          new Date().toISOString()
      };
    }


    /*
       If the KV contains only an events array,
       rebuild the categories.
    */

    const events =
      Array.isArray(data)
        ? data
        : Array.isArray(data.events)
          ? data.events
          : [];


    const live = [];
    const finished = [];
    const upcoming = [];


    for (const event of events) {

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

      } else if (
        status === "FINISHED" ||
        status === "FT" ||
        status === "AET" ||
        status === "PEN" ||
        status === "AWARDED" ||
        status === "POSTPONED" ||
        status === "CANCELLED" ||
        status === "SUSPENDED"
      ) {

        finished.push(event);

      } else {

        upcoming.push(event);

      }
    }


    return {
      events,
      live,
      finished,
      upcoming,
      count: events.length,
      liveCount: live.length,
      message:
        events.length
          ? ""
          : "No matches scheduled today.",
      updated:
        data.updated ||
        new Date().toISOString()
    };

  } catch (error) {

    return {
      events: [],
      live: [],
      finished: [],
      upcoming: [],
      count: 0,
      liveCount: 0,
      message: "Invalid scores snapshot.",
      error: String(error),
      updated: new Date().toISOString()
    };
  }
}


/* =========================================================
   FOOTBALL-DATA.ORG REQUEST
========================================================= */

async function footballDataFetch(url, env) {

  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );
  }


  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "Accept": "application/json"
    }
  });


  const text = await response.text();


  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      error: text
    };
  }


  if (!response.ok) {

    const message =
      data?.message ||
      data?.error ||
      `football-data.org returned HTTP ${response.status}`;

    throw new Error(message);
  }


  return data;
}


/* =========================================================
   /api/fixtures
   ---------------------------------------------------------
   Upcoming fixtures:

   Today -> next 30 days

   Competitions:
      PL
      CL
      PD
      SA
      BL1
      FL1
========================================================= */

async function fixtures(env) {

  const from = todayUTC();
  const to = addDays(from, 7);

  const leagues = [
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

  if (!env.API_FOOTBALL_KEY) {
    return {
      ok: false,
      from,
      to,
      fixtures: [],
      events: [],
      count: 0,
      message: "Missing Cloudflare secret API_FOOTBALL_KEY",
      updated: new Date().toISOString()
    };
  }

  const diagnostics = [];

  const requests = leagues.map(async (league) => {

    const url =
      `${API_FOOTBALL_BASE}/fixtures` +
      `?league=${league.id}` +
      `&season=2026` +
      `&from=${from}` +
      `&to=${to}`;

    try {

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "x-apisports-key":
            env.API_FOOTBALL_KEY,

          "Accept":
            "application/json"
        }
      });

      const data = await response.json();

      if (!response.ok) {

        diagnostics.push({
          competition: league.code,
          returned: 0,
          httpStatus: response.status,
          error:
            data?.errors ||
            `HTTP ${response.status}`
        });

        return [];
      }

      const matches =
        Array.isArray(data.response)
          ? data.response
          : [];

      diagnostics.push({
        competition: league.code,
        returned: matches.length,
        apiResults:
          data.results ?? matches.length
      });

      return matches.map(match => {

        const fixture =
          match.fixture || {};

        const teams =
          match.teams || {};

        const leagueData =
          match.league || {};

        const goals =
          match.goals || {};

        return {

          id:
            fixture.id ?? null,

          date:
            fixture.date || "",

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
            league.name,

          leagueCode:
            league.code,

          leagueId:
            league.id,

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

      });

    } catch (error) {

      diagnostics.push({

        competition:
          league.code,

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

  });


  const results =
    await Promise.all(requests);


  const allFixtures =
    results.flat();


  /*
     Keep only future fixtures.
     We don't want completed matches
     appearing in the Fixtures page.
  */

  const upcoming =
    allFixtures
      .filter(fixture => {

        if (!fixture.date) {
          return false;
        }

        const date =
          new Date(fixture.date);

        return (
          !Number.isNaN(date.getTime()) &&
          date.getTime() >=
            Date.now() - 60 * 1000
        );

      })
      .sort(
        (a, b) =>
          new Date(a.date) -
          new Date(b.date)
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


  return {

    ok: true,

    source:
      "API-Football",

    from,

    to,

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

}
/* =========================================================
   XML HELPERS FOR BBC
========================================================= */


/*
   Remove CDATA completely.

   Example:

   <![CDATA[
      My football story
   ]]>

   becomes:

   My football story
*/

function removeCDATA(value) {

  if (!value) return "";

  return String(value)
    .replace(/<!\[CDATA\[/gi, "")
    .replace(/\]\]>/gi, "");
}


/*
   Decode the most common XML/HTML entities used by BBC RSS.
*/

function decodeEntities(value) {

  if (!value) return "";

  let s = String(value);

  /*
     Numeric decimal entities
     &#39;
     &#8217;
  */

  s = s.replace(
    /&#(\d+);/g,
    (_, n) => {

      const code =
        Number.parseInt(n, 10);

      if (
        !Number.isFinite(code) ||
        code < 0 ||
        code > 0x10FFFF
      ) {
        return _;
      }

      return String.fromCodePoint(code);

    }
  );


  /*
     Numeric hexadecimal entities
     &#x27;
     &#x2019;
  */

  s = s.replace(
    /&#x([0-9a-f]+);/gi,
    (_, n) => {

      const code =
        Number.parseInt(n, 16);

      if (
        !Number.isFinite(code) ||
        code < 0 ||
        code > 0x10FFFF
      ) {
        return _;
      }

      return String.fromCodePoint(code);

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


  for (const [key, value2] of Object.entries(entities)) {

    s = s.replace(
      new RegExp(key, "gi"),
      value2
    );

  }


  return s;
}


/*
   Remove remaining HTML/XML markup from BBC descriptions.
*/

function cleanText(value) {

  if (!value) return "";

  let s =
    removeCDATA(value);


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
    decodeEntities(s);


  /*
     Remove accidental CDATA/XML remnants.
  */

  s =
    s.replace(
      /\s+/g,
      " "
    )
    .trim();


  return s;
}


/*
   Extract an XML tag.

   Handles:

      <title>...</title>

   and:

      <title><![CDATA[...]]></title>
*/

function xmlValue(xml, tag) {

  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );


  const match =
    xml.match(regex);


  if (!match) return "";


  return cleanText(match[1]);
}


/*
   Extract all <item> blocks.
*/

function extractItems(xml) {

  const matches =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    );


  return matches || [];
}


/* =========================================================
   BBC NEWS PARSER
========================================================= */

function parseNews(xml) {

  const items =
    extractItems(xml);


  const news = [];


  for (const item of items) {

    const title =
      xmlValue(item, "title");


    const description =
      xmlValue(item, "description");


    const link =
      xmlValue(item, "link");


    const pubDate =
      xmlValue(item, "pubDate");


    /*
       BBC RSS may use guid as well.
    */

    const guid =
      xmlValue(item, "guid");


    /*
       Skip malformed items.
    */

    if (!title) continue;


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
          method: "GET",
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
      parseNews(xml);


    return {

      ok: true,

      source: "BBC Sport",

      articles,

      /*
         Keep news as an alias in case the
         frontend expects this name.
      */

      news: articles,

      count:
        articles.length,

      updated:
        new Date().toISOString()

    };


  } catch (error) {

    return {

      ok: false,

      source: "BBC Sport",

      articles: [],

      news: [],

      count: 0,

      message:
        String(error?.message || error),

      updated:
        new Date().toISOString()

    };

  }

}


/* =========================================================
   API-FOOTBALL
   MATCH CENTRE
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
  } catch {
    data = {
      response: []
    };
  }


  if (!response.ok) {

    throw new Error(
      `API-Football HTTP ${response.status}`
    );

  }


  return data;

}


/* =========================================================
   /api/match-centre
========================================================= */

async function matchCentre(
  request,
  env
) {

  try {

    const url =
      new URL(request.url);


    const league =
      url.searchParams.get("league") ||
      "PL";


    const date =
      url.searchParams.get("date") ||
      todayUTC();


    const leagueId =
      API_FOOTBALL_LEAGUES[
        league.toUpperCase()
      ];


    if (!leagueId) {

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
      `?league=${leagueId}` +
      `&season=2026` +
      `&date=${encodeURIComponent(date)}`;


    const data =
      await apiFootballFetch(
        apiUrl,
        env
      );


    return json({

      ok: true,

      league,

      leagueId,

      date,

      response:
        Array.isArray(data.response)
          ? data.response
          : [],

      results:
        data.results ??
        (
          Array.isArray(data.response)
            ? data.response.length
            : 0
        ),

      errors:
        data.errors || {},

      updated:
        new Date().toISOString()

    });


  } catch (error) {

    return json(
      {
        ok: false,

        response: [],

        message:
          String(error?.message || error),

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

async function health(env) {

  return {

    ok: true,

    service:
      "YepFootball API",

    version:
      "2026-09-21.1",

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
   MAIN REQUEST HANDLER
========================================================= */

async function handle(
  request,
  env
) {

  const url =
    new URL(request.url);


  const path =
    url.pathname;


  /*
     CORS pre-flight
  */

  if (request.method === "OPTIONS") {

    return new Response(
      null,
      {
        status: 204,
        headers: corsHeaders()
      }
    );

  }


  /*
     Only GET is required.
  */

  if (
    request.method !== "GET"
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
    path === "/api/health" ||
    path === "/api/health/"
  ) {

    return json(
      await health(env)
    );

  }


  /* -----------------------------------------
     SCORES
  ----------------------------------------- */

  if (
    path === "/api/scores" ||
    path === "/api/scores/"
  ) {

    return json(
      await latestScores(env)
    );

  }


  /* -----------------------------------------
     FIXTURES
  ----------------------------------------- */

  if (
    path === "/api/fixtures" ||
    path === "/api/fixtures/"
  ) {

    return json(
      await fixtures(env)
    );

  }


  /* -----------------------------------------
     NEWS
  ----------------------------------------- */

  if (
    path === "/api/news" ||
    path === "/api/news/"
  ) {

    return json(
      await news()
    );

  }


  /* -----------------------------------------
     MATCH CENTRE
  ----------------------------------------- */

  if (
    path === "/api/match-centre" ||
    path === "/api/match-centre/"
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
    path.startsWith("/api/")
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


  /*
     Non-API requests.

     Your normal Cloudflare Pages/site frontend
     handles the website itself.
  */

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

};