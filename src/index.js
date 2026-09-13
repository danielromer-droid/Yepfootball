const API_FOOTBALL =
  "https://v3.football.api-sports.io";

const API_FOOTBALL_KEY =
  "API_FOOTBALL_KEY";

const FOOTBALL_DATA_API =
  "https://api.football-data.org/v4";

const BBC_FOOTBALL_RSS =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";

/*
-------------------------------------------------------
  EUROPEAN COMPETITIONS
-------------------------------------------------------
  API-Football league IDs

  Premier League      39
  Champions League     2
  La Liga             140
  Serie A             135
  Bundesliga           78
  Ligue 1              61
-------------------------------------------------------
*/

const LEAGUES = {
  2: {
    code: "CL",
    name: "Champions League"
  },
  39: {
    code: "PL",
    name: "Premier League"
  },
  140: {
    code: "PD",
    name: "La Liga"
  },
  135: {
    code: "SA",
    name: "Serie A"
  },
  78: {
    code: "BL1",
    name: "Bundesliga"
  },
  61: {
    code: "FL1",
    name: "Ligue 1"
  }
};

const EUROPEAN_LEAGUE_IDS =
  Object.keys(LEAGUES).map(Number);


/*
-------------------------------------------------------
  JSON RESPONSE
-------------------------------------------------------
*/

function json(data, status = 200, maxAge = 10) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          `public, max-age=${maxAge}`,

        "access-control-allow-origin": "*"
      }
    }
  );
}


/*
-------------------------------------------------------
  DATE
-------------------------------------------------------
*/

function isoDate(date) {

  return date
    .toISOString()
    .slice(0, 10);

}


/*
-------------------------------------------------------
  API-FOOTBALL FETCH
-------------------------------------------------------
*/

async function apiFootballFetch(
  path,
  env,
  cacheSeconds = 10
) {

  const key =
    env[API_FOOTBALL_KEY];

  if (!key) {

    throw new Error(
      "Missing Cloudflare secret API_FOOTBALL_KEY"
    );

  }

  const response =
    await fetch(
      `${API_FOOTBALL}${path}`,
      {
        method: "GET",

        headers: {
          "x-apisports-key": key,
          "Accept": "application/json"
        },

        cf: {
          cacheTtl: cacheSeconds,
          cacheEverything: true
        }
      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `API-Football ${response.status}: ${text.slice(0, 300)}`
    );

  }

  let data;

  try {

    data =
      JSON.parse(text);

  } catch {

    throw new Error(
      "API-Football returned invalid JSON"
    );

  }

  if (
    data.errors &&
    Object.keys(data.errors).length > 0
  ) {

    throw new Error(
      `API-Football error: ${JSON.stringify(data.errors)}`
    );

  }

  return data;

}


/*
-------------------------------------------------------
  NORMALIZE API-FOOTBALL MATCH
-------------------------------------------------------
*/

function normalizeApiFootball(match) {

  const leagueId =
    Number(match.league?.id);

  const league =
    LEAGUES[leagueId];

  const status =
    match.fixture?.status || {};

  let normalizedStatus =
    status.short || "NS";

  /*
    API-Football status codes:

    NS    Not Started
    1H    First Half
    HT    Half Time
    2H    Second Half
    ET    Extra Time
    BT    Break Time
    P     Penalty
    FT    Full Time
    AET   After Extra Time
    PEN   Penalty Shootout
    PST   Postponed
    CANC  Cancelled
    SUSP  Suspended
  */

  const liveStatuses = [
    "1H",
    "HT",
    "2H",
    "ET",
    "BT",
    "P"
  ];

  const finishedStatuses = [
    "FT",
    "AET",
    "PEN"
  ];

  if (
    liveStatuses.includes(normalizedStatus)
  ) {

    normalizedStatus =
      "IN_PLAY";

  } else if (
    finishedStatuses.includes(normalizedStatus)
  ) {

    normalizedStatus =
      "FINISHED";

  } else if (
    normalizedStatus === "PST"
  ) {

    normalizedStatus =
      "POSTPONED";

  } else if (
    normalizedStatus === "CANC"
  ) {

    normalizedStatus =
      "CANCELLED";

  } else if (
    normalizedStatus === "SUSP"
  ) {

    normalizedStatus =
      "SUSPENDED";

  } else {

    normalizedStatus =
      "SCHEDULED";

  }

  return {

    id:
      String(
        match.fixture?.id
      ),

    date:
      match.fixture?.date || "",

    status:
      normalizedStatus,

    apiStatus:
      status.short || "",

    statusLong:
      status.long || "",

    minute:
      status.elapsed ?? null,

    league:
      league?.name ||
      match.league?.name ||
      "",

    leagueCode:
      league?.code ||
      "",

    leagueId,

    matchday:
      null,

    stage:
      match.league?.round ||
      null,

    homeTeam: {

      id:
        match.teams?.home?.id,

      name:
        match.teams?.home?.name ||
        "",

      shortName:
        match.teams?.home?.name ||
        "",

      crest:
        match.teams?.home?.logo ||
        ""

    },

    awayTeam: {

      id:
        match.teams?.away?.id,

      name:
        match.teams?.away?.name ||
        "",

      shortName:
        match.teams?.away?.name ||
        "",

      crest:
        match.teams?.away?.logo ||
        ""

    },

    score: {

      fullTime: {

        home:
          match.goals?.home ?? null,

        away:
          match.goals?.away ?? null

      },

      halfTime: {

        home:
          match.score?.halftime?.home ??
          null,

        away:
          match.score?.halftime?.away ??
          null

      },

      extraTime: {

        home:
          match.score?.extratime?.home ??
          null,

        away:
          match.score?.extratime?.away ??
          null

      },

      penalties: {

        home:
          match.score?.penalty?.home ??
          null,

        away:
          match.score?.penalty?.away ??
          null

      }

    }

  };

}


/*
-------------------------------------------------------
  API-FOOTBALL TODAY
-------------------------------------------------------
*/

async function apiFootballToday(env) {

  const today =
    isoDate(new Date());

  /*
    One request gets today's fixtures.

    We then keep only the six European
    competitions used by YepFootball.
  */

  const data =
    await apiFootballFetch(
      `/fixtures?date=${today}`,
      env,
      10
    );

  const matches =
    Array.isArray(data.response)
      ? data.response
      : [];

  return matches

    .filter(match =>
      EUROPEAN_LEAGUE_IDS.includes(
        Number(match.league?.id)
      )
    )

    .map(normalizeApiFootball);

}


/*
-------------------------------------------------------
  API-FOOTBALL LIVE
-------------------------------------------------------
*/

async function apiFootballLive(env) {

  const data =
    await apiFootballFetch(
      "/fixtures?live=all",
      env,
      10
    );

  const matches =
    Array.isArray(data.response)
      ? data.response
      : [];

  return matches

    .filter(match =>
      EUROPEAN_LEAGUE_IDS.includes(
        Number(match.league?.id)
      )
    )

    .map(normalizeApiFootball);

}


/*
-------------------------------------------------------
  SCORES
-------------------------------------------------------
*/

async function scores(env) {

  const started =
    Date.now();

  try {

    /*
      Get today's fixtures.
    */

    const todayMatches =
      await apiFootballToday(env);

    /*
      Get currently live matches.

      This is important because API-Football
      updates the live endpoint frequently.
    */

    const liveMatches =
      await apiFootballLive(env);

    /*
      Merge today's fixtures and live matches.

      Live data replaces the older version
      of the same fixture.
    */

    const map =
      new Map();

    for (
      const match of todayMatches
    ) {

      map.set(
        match.id,
        match
      );

    }

    for (
      const match of liveMatches
    ) {

      map.set(
        match.id,
        match
      );

    }

    const events =
      Array.from(map.values())
        .sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        );

    const live =
      events.filter(
        e =>
          e.status ===
          "IN_PLAY"
      );

    const finished =
      events.filter(
        e =>
          [
            "FINISHED",
            "AWARDED",
            "POSTPONED",
            "CANCELLED",
            "SUSPENDED"
          ].includes(e.status)
      );

    const upcoming =
      events.filter(
        e =>
          [
            "SCHEDULED",
            "TIMED"
          ].includes(e.status)
      );

    return {

      events,

      live,

      finished,

      upcoming,

      count:
        events.length,

      liveCount:
        live.length,

      finishedCount:
        finished.length,

      upcomingCount:
        upcoming.length,

      source:
        "API-Football",

      elapsedMs:
        Date.now() -
        started,

      message:
        events.length === 0
          ? "No European matches found today."
          : null,

      updated:
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

      finishedCount: 0,

      upcomingCount: 0,

      source:
        "API-Football",

      error:
        error.message ||
        String(error),

      checked:
        new Date().toISOString()

    };

  }

}


/*
-------------------------------------------------------
  FOOTBALL-DATA.ORG
-------------------------------------------------------
*/

async function footballDataFetch(
  path,
  env,
  cacheSeconds = 120
) {

  if (
    !env.FOOTBALL_DATA_TOKEN
  ) {

    throw new Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );

  }

  const response =
    await fetch(
      `${FOOTBALL_DATA_API}${path}`,
      {
        method: "GET",

        headers: {

          "X-Auth-Token":
            env.FOOTBALL_DATA_TOKEN,

          "Accept":
            "application/json"

        },

        cf: {
          cacheTtl:
            cacheSeconds,

          cacheEverything:
            true
        }

      }
    );

  const text =
    await response.text();

  if (!response.ok) {

    throw new Error(
      `football-data.org ${response.status}: ${text.slice(0, 300)}`
    );

  }

  return JSON.parse(text);

}


/*
-------------------------------------------------------
  FOOTBALL-DATA NORMALIZER
-------------------------------------------------------
*/

function normalizeFootballData(
  match
) {

  return {

    id:
      String(match.id),

    date:
      match.utcDate,

    status:
      match.status,

    minute:
      match.minute ??
      null,

    league:
      LEAGUES[match.competition?.code]?.name ||
      match.competition?.name ||
      "",

    leagueCode:
      LEAGUES[match.competition?.code]?.code ||
      match.competition?.code ||
      "",

    leagueId:
      null,

    matchday:
      match.matchday ??
      null,

    stage:
      match.stage ??
      null,

    homeTeam: {

      id:
        match.homeTeam?.id,

      name:
        match.homeTeam?.name ||
        "",

      shortName:
        match.homeTeam?.shortName ||
        match.homeTeam?.name ||
        "",

      crest:
        match.homeTeam?.crest ||
        ""

    },

    awayTeam: {

      id:
        match.awayTeam?.id,

      name:
        match.awayTeam?.name ||
        "",

      shortName:
        match.awayTeam?.shortName ||
        match.awayTeam?.name ||
        "",

      crest:
        match.awayTeam?.crest ||
        ""

    },

    score:
      match.score ||
      {}

  };

}


/*
-------------------------------------------------------
  FIXTURES
-------------------------------------------------------
*/

async function fixtures(env) {

  const now =
    new Date();

  const end =
    new Date(now);

  end.setUTCDate(
    end.getUTCDate() + 7
  );

  const from =
    isoDate(now);

  const to =
    isoDate(end);

  try {

    const competitions =
      "CL,PL,PD,SA,BL1,FL1";

    const query =
      new URLSearchParams({

        competitions,

        dateFrom:
          from,

        dateTo:
          to

      });

    const data =
      await footballDataFetch(
        `/matches?${query.toString()}`,
        env,
        300
      );

    const events =
      (data.matches || [])
        .map(
          normalizeFootballData
        )
        .filter(
          e =>
            new Date(e.date) >=
            now
        )
        .sort(
          (a, b) =>
            new Date(a.date) -
            new Date(b.date)
        )
        .slice(0, 60);

    return {

      events,

      count:
        events.length,

      source:
        "football-data.org",

      message:
        events.length === 0
          ? "No upcoming fixtures found."
          : null,

      updated:
        new Date().toISOString()

    };

  } catch (error) {

    /*
      If football-data.org is unavailable,
      use API-Football as a fallback.
    */

    try {

      const today =
        await apiFootballToday(env);

      const endDate =
        new Date(now);

      endDate.setUTCDate(
        endDate.getUTCDate() + 7
      );

      const endIso =
        isoDate(endDate);

      const upcoming =
        today
          .filter(
            e =>
              new Date(e.date) >= now
          );

      /*
        If today's API-Football data is
        not enough for the seven-day fixture
        list, fetch the date range.
      */

      const range =
        await apiFootballFetch(
          `/fixtures?from=${from}&to=${endIso}`,
          env,
          300
        );

      const rangeEvents =
        (range.response || [])
          .filter(
            match =>
              EUROPEAN_LEAGUE_IDS.includes(
                Number(
                  match.league?.id
                )
              )
          )
          .map(
            normalizeApiFootball
          )
          .filter(
            e =>
              new Date(e.date) >= now
          )
          .sort(
            (a, b) =>
              new Date(a.date) -
              new Date(b.date)
          )
          .slice(0, 60);

      return {

        events:
          rangeEvents,

        count:
          rangeEvents.length,

        source:
          "API-Football fallback",

        message:
          rangeEvents.length === 0
            ? "No upcoming fixtures found."
            : null,

        updated:
          new Date().toISOString(),

        fallback:
          true

      };

    } catch (fallbackError) {

      throw new Error(
        `Fixtures unavailable. football-data.org: ${error.message}. API-Football fallback: ${fallbackError.message}`
      );

    }

  }

}


/*
-------------------------------------------------------
  BBC NEWS
-------------------------------------------------------
*/

function decodeEntities(
  text = ""
) {

  return text

    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )

    .replace(
      /&amp;/g,
      "&"
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
      /&apos;/g,
      "'"
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
      /&#(\d+);/g,
      (_, n) =>
        String.fromCharCode(
          Number(n)
        )
    )

    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCharCode(
          parseInt(n, 16)
        )
    );

}


function xmlValue(
  xml,
  tag
) {

  const re =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    xml.match(re);

  return match
    ? decodeEntities(
        match[1].trim()
      )
    : "";

}


function parseBBCNews(
  xml
) {

  const items = [];

  const matches =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    ) || [];

  for (
    const item of matches
  ) {

    const title =
      xmlValue(
        item,
        "title"
      );

    const link =
      xmlValue(
        item,
        "link"
      );

    const description =
      xmlValue(
        item,
        "description"
      );

    const published =
      xmlValue(
        item,
        "pubDate"
      ) ||
      xmlValue(
        item,
        "dc:date"
      );

    if (
      !title ||
      !link
    ) {

      continue;

    }

    let image = "";

    const mediaContent =
      item.match(
        /<media:content[^>]+url=["']([^"']+)["']/i
      );

    const mediaThumbnail =
      item.match(
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i
      );

    const enclosure =
      item.match(
        /<enclosure[^>]+url=["']([^"']+)["']/i
      );

    if (
      mediaContent
    ) {

      image =
        mediaContent[1];

    } else if (
      mediaThumbnail
    ) {

      image =
        mediaThumbnail[1];

    } else if (
      enclosure
    ) {

      image =
        enclosure[1];

    }

    items.push({

      title,

      link,

      source:
        "BBC Sport",

      published,

      description:
        description
          .replace(
            /<[^>]+>/g,
            ""
          )
          .trim()
          .slice(0, 240),

      image

    });

  }

  return items;

}


async function news() {

  const response =
    await fetch(
      BBC_FOOTBALL_RSS,
      {
        headers: {

          "User-Agent":
            "YepFootball/1.0",

          "Accept":
            "application/rss+xml, application/xml, text/xml"

        },

        cf: {

          cacheTtl:
            900,

          cacheEverything:
            true

        }

      }
    );

  if (
    !response.ok
  ) {

    throw new Error(
      `BBC RSS ${response.status}`
    );

  }

  const xml =
    await response.text();

  const articles =
    parseBBCNews(xml)
      .filter(
        a =>
          a.title &&
          a.link
      )
      .slice(0, 12);

  return {

    articles,

    count:
      articles.length,

    source: {

      name:
        "BBC Sport",

      url:
        "https://www.bbc.com/sport/football"

    },

    updated:
      new Date().toISOString()

  };

}


/*
-------------------------------------------------------
  HEALTH
-------------------------------------------------------
*/

async function health(
  env
) {

  const started =
    Date.now();

  const result = {

    ok: false,

    apiFootball:
      null,

    footballData:
      null,

    elapsedMs:
      0,

    checked:
      new Date().toISOString()

  };


  /*
    Check API-Football
  */

  try {

    const data =
      await apiFootballFetch(
        "/fixtures?date=" +
        isoDate(new Date()),
        env,
        5
      );

    result.apiFootball = {

      ok: true,

      status: 200,

      fixtures:
        data.results || 0

    };

  } catch (error) {

    result.apiFootball = {

      ok: false,

      error:
        error.message ||
        String(error)

    };

  }


  /*
    Check football-data.org
  */

  try {

    const data =
      await footballDataFetch(
        "/matches",
        env,
        5
      );

    result.footballData = {

      ok: true,

      status: 200,

      matches:
        data.matches?.length ||
        0

    };

  } catch (error) {

    result.footballData = {

      ok: false,

      error:
        error.message ||
        String(error)

    };

  }


  result.ok =
    result.apiFootball?.ok === true ||
    result.footballData?.ok === true;

  result.elapsedMs =
    Date.now() -
    started;

  result.checked =
    new Date().toISOString();

  return result;

}


/*
-------------------------------------------------------
  REQUEST HANDLER
-------------------------------------------------------
*/

async function handle(
  request,
  env
) {

  const url =
    new URL(
      request.url
    );

  try {

    /*
      HEALTH
    */

    if (
      url.pathname ===
      "/api/health"
    ) {

      const result =
        await health(env);

      return json(
        result,
        result.ok
          ? 200
          : 502,
        10
      );

    }


    /*
      SCORES

      API-Football primary source.
    */

    if (
      url.pathname ===
      "/api/scores"
    ) {

      const result =
        await scores(env);

      return json(
        result,
        result.error
          ? 502
          : 200,
        10
      );

    }


    /*
      EUROPEAN MATCH CENTRE

      Same live score data, but
      provided as a separate endpoint
      for the frontend if needed.
    */

    if (
      url.pathname ===
      "/api/europe"
    ) {

      const result =
        await scores(env);

      return json(
        result,
        result.error
          ? 502
          : 200,
        10
      );

    }


    /*
      FIXTURES
    */

    if (
      url.pathname ===
      "/api/fixtures"
    ) {

      const result =
        await fixtures(env);

      return json(
        result,
        200,
        300
      );

    }


    /*
      NEWS
    */

    if (
      url.pathname ===
      "/api/news"
    ) {

      return json(
        await news(),
        200,
        900
      );

    }

  } catch (error) {

    return json(

      {

        error:
          "Football data feed unavailable",

        detail:
          error.message ||
          String(error),

        checked:
          new Date().toISOString()

      },

      502,

      10

    );

  }

  return null;

}


/*
-------------------------------------------------------
  CLOUDFLARE WORKER
-------------------------------------------------------
*/

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    const api =
      await handle(
        request,
        env
      );

    if (api) {

      return api;

    }

    return env.ASSETS.fetch(
      request
    );

  },


  async scheduled(
    event,
    env,
    ctx
  ) {

    ctx.waitUntil(

      Promise.allSettled([

        scores(env),

        fixtures(env),

        news(),

        health(env)

      ])

    );

  }

};
