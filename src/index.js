/* YepFootball Worker
   Secrets:
   - API_FOOTBALL_KEY
   - FOOTBALL_DATA_TOKEN

   KV binding:
   - LATEST_SCORES -> YepFootball Scores

   Cron:
   - Every 15 minutes

   Latest Scores:
   - football-data.org for domestic leagues + Champions League
   - football-data.org Europa League when available
   - The Guardian as supplementary source
*/

const AF = "https://v3.football.api-sports.io";
const FD = "https://api.football-data.org/v4";
const BBC = "https://feeds.bbci.co.uk/sport/football/rss.xml";
const GUARDIAN_RESULTS = "https://www.theguardian.com/football/results";


/* =====================================================
   FOOTBALL-DATA.ORG LEAGUES
===================================================== */

const FD_LEAGUES = {
  CL: "Champions League",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};

const FD_IDS = {
  CL: 2,
  PL: 39,
  PD: 140,
  SA: 135,
  BL1: 78,
  FL1: 61
};


/* =====================================================
   API-FOOTBALL LEAGUES
===================================================== */

const AF_LEAGUES = {
  2: "Champions League",
  3: "Europa League",
  848: "Conference League",
  39: "Premier League",
  140: "La Liga",
  135: "Serie A",
  78: "Bundesliga",
  61: "Ligue 1"
};


/* =====================================================
   WEB LEAGUES
===================================================== */

const WEB_LEAGUES = {
  "Europa League": "3",
  "Conference League": "848"
};


/* =====================================================
   JSON RESPONSE
===================================================== */

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


/* =====================================================
   PARIS DATE / TIME
===================================================== */

function parisParts(d = new Date()) {

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(d);

  const out = {};

  for (const p of parts) {
    if (p.type !== "literal") {
      out[p.type] = p.value;
    }
  }

  return out;
}


function previousParisDate(d = new Date()) {

  const p = parisParts(d);

  const x = new Date(
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      12
    )
  );

  x.setUTCDate(x.getUTCDate() - 1);

  return x.toISOString().slice(0, 10);
}


/* =====================================================
   API-FOOTBALL FETCH
===================================================== */

async function afFetch(path, env, ttl = 60) {

  if (!env.API_FOOTBALL_KEY) {
    throw new Error(
      "Missing Cloudflare secret API_FOOTBALL_KEY"
    );
  }

  const r = await fetch(`${AF}${path}`, {
    headers: {
      "x-apisports-key": env.API_FOOTBALL_KEY,
      Accept: "application/json"
    },
    cf: {
      cacheTtl: ttl,
      cacheEverything: true
    }
  });

  const text = await r.text();

  if (!r.ok) {
    throw new Error(
      `API-Football ${r.status}: ${text.slice(0, 400)}`
    );
  }

  const data = JSON.parse(text);

  if (
    data.errors &&
    Object.keys(data.errors).length
  ) {
    throw new Error(
      `API-Football error: ${JSON.stringify(data.errors)}`
    );
  }

  return data;
}


/* =====================================================
   FOOTBALL-DATA.ORG FETCH
===================================================== */

async function fdFetch(path, env, ttl = 300) {

  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );
  }

  const r = await fetch(`${FD}${path}`, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      Accept: "application/json"
    },
    cf: {
      cacheTtl: ttl,
      cacheEverything: true
    }
  });

  const text = await r.text();

  if (!r.ok) {
    throw new Error(
      `football-data.org ${r.status}: ${text.slice(0, 300)}`
    );
  }

  return JSON.parse(text);
}


/* =====================================================
   API-FOOTBALL NORMALISATION
===================================================== */

function afNorm(x) {

  const s = x.fixture?.status || {};
  const h = x.teams?.home || {};
  const a = x.teams?.away || {};

  const lid = Number(x.league?.id);

  return {

    id: String(x.fixture?.id),

    date:
      x.fixture?.date || null,

    status:
      s.short || "",

    statusLong:
      s.long || "",

    minute:
      s.elapsed ?? null,

    live:
      [
        "1H",
        "HT",
        "2H",
        "ET",
        "BT",
        "P",
        "LIVE"
      ].includes(s.short),

    league:
      AF_LEAGUES[lid] ||
      x.league?.name ||
      "European football",

    leagueCode:
      String(lid || ""),

    leagueId:
      lid,

    homeTeam: {
      id: h.id,
      name: h.name || "",
      shortName: h.name || "",
      crest: h.logo || ""
    },

    awayTeam: {
      id: a.id,
      name: a.name || "",
      shortName: a.name || "",
      crest: a.logo || ""
    },

    score: {
      home: x.goals?.home ?? null,
      away: x.goals?.away ?? null
    }
  };
}


/* =====================================================
   GUARDIAN HTML HELPERS
===================================================== */

function htmlDecode(text = "") {

  return text

    .replace(/&amp;/g, "&")

    .replace(/&quot;/g, '"')

    .replace(/&#39;/g, "'")

    .replace(/&apos;/g, "'")

    .replace(/&lt;/g, "<")

    .replace(/&gt;/g, ">")

    .replace(
      /&#(\d+);/g,
      (_, n) => String.fromCharCode(+n)
    )

    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCharCode(
          parseInt(n, 16)
        )
    );
}


function normaliseText(text = "") {

  return htmlDecode(
    text.replace(/<[^>]+>/g, " ")
  )

    .replace(/\u00a0/g, " ")

    .replace(/\s+/g, " ")

    .trim();
}


/* =====================================================
   GUARDIAN DATE PARSER
===================================================== */

function dateHeadingToIso(text) {

  const m =
    normaliseText(text).match(
      /^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/i
    );

  if (!m) {
    return null;
  }

  const months = {

    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12

  };

  const month =
    months[m[2].toLowerCase()];

  if (!month) {
    return null;
  }

  return `${m[3]}-${String(month).padStart(2, "0")}-${String(+m[1]).padStart(2, "0")}`;
}


/* =====================================================
   TEAM NAME CLEANING
===================================================== */

function cleanTeamName(name) {

  return normaliseText(name)

    .replace(
      /\s+(?:won|win|wins)\s+.*$/i,
      ""
    )

    .trim();
}


/* =====================================================
   GUARDIAN RESULTS PARSER
===================================================== */

function parseGuardianResults(
  html,
  targetDate
) {

  const out = [];

  let currentDate = null;
  let currentLeague = null;

  /*
    Process Guardian headings and result
    list items in document order.
  */

  const tokens =
    html.match(
      /<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>|<li\b[\s\S]*?<\/li>/gi
    ) || [];

  for (const token of tokens) {

    /* -----------------------------
       Heading
    ----------------------------- */

    if (/^<h/i.test(token)) {

      const heading =
        normaliseText(token);

      const date =
        dateHeadingToIso(heading);

      if (date) {

        currentDate = date;
        currentLeague = null;

        continue;
      }

      const league =
        Object.keys(WEB_LEAGUES).find(
          name =>
            name.toLowerCase() ===
            heading.toLowerCase()
        );

      if (league) {
        currentLeague = league;
      }

      continue;
    }


    /* -----------------------------
       Result item
    ----------------------------- */

    if (
      !currentDate ||
      currentDate !== targetDate ||
      !currentLeague
    ) {
      continue;
    }

    const text =
      normaliseText(token);

    if (!/^FT\s+/i.test(text)) {
      continue;
    }

    const body =
      text.replace(
        /^FT\s+/i,
        ""
      ).trim();

    const scoreMatch =
      body.match(
        /^(.+?)\s+(\d+)\s+(\d+)\s+(.+)$/
      );

    if (!scoreMatch) {
      continue;
    }

    const home =
      cleanTeamName(scoreMatch[1]);

    const away =
      cleanTeamName(scoreMatch[4]);

    const homeScore =
      Number(scoreMatch[2]);

    const awayScore =
      Number(scoreMatch[3]);

    if (
      !home ||
      !away ||
      home.length > 80 ||
      away.length > 80
    ) {
      continue;
    }

    if (
      !Number.isInteger(homeScore) ||
      !Number.isInteger(awayScore)
    ) {
      continue;
    }

    out.push({

      id:
        `web-${targetDate}-${currentLeague}-${home}-${away}`
          .replace(
            /[^a-z0-9_-]+/gi,
            "-"
          ),

      date:
        `${targetDate}T12:00:00Z`,

      status:
        "FINISHED",

      statusLong:
        "Full Time",

      minute:
        null,

      league:
        currentLeague,

      leagueCode:
        currentLeague,

      leagueId:
        Number(
          WEB_LEAGUES[currentLeague]
        ),

      homeTeam: {
        id: null,
        name: home,
        shortName: home,
        crest: ""
      },

      awayTeam: {
        id: null,
        name: away,
        shortName: away,
        crest: ""
      },

      score: {
        home: homeScore,
        away: awayScore
      }

    });
  }


  /* Remove duplicates */

  const seen = new Set();

  return out.filter(event => {

    if (seen.has(event.id)) {
      return false;
    }

    seen.add(event.id);

    return true;

  });
}


/* =====================================================
   GUARDIAN DAILY SCORES
===================================================== */

async function webDailyScores(
  env,
  date
) {

  const r =
    await fetch(
      GUARDIAN_RESULTS,
      {
        headers: {
          "User-Agent":
            "YepFootball/1.0 (+https://yepfootball.com)",
          Accept:
            "text/html,application/xhtml+xml"
        },

        cf: {
          cacheTtl: 300,
          cacheEverything: true
        }
      }
    );

  if (!r.ok) {

    throw new Error(
      `The Guardian results ${r.status}`
    );
  }

  const html =
    await r.text();

  return parseGuardianResults(
    html,
    date
  );
}


/* =====================================================
   FOOTBALL-DATA DAILY NORMALISATION
===================================================== */

function fdDailyNorm(m) {

  const status =
    m.status || "";

  if (
    ![
      "FINISHED",
      "AWARDED"
    ].includes(status)
  ) {
    return null;
  }

  const code =
    m.competition?.code || "";

  return {

    id:
      String(m.id),

    date:
      m.utcDate,

    status,

    statusLong:
      status === "AWARDED"
        ? "Awarded"
        : "Full Time",

    minute:
      m.minute ?? null,

    league:
      FD_LEAGUES[code] ||
      m.competition?.name ||
      "European football",

    leagueCode:
      code,

    leagueId:
      FD_IDS[code] || null,

    homeTeam: {

      id:
        m.homeTeam?.id,

      name:
        m.homeTeam?.name || "",

      shortName:
        m.homeTeam?.shortName ||
        m.homeTeam?.name ||
        "",

      crest:
        m.homeTeam?.crest || ""

    },

    awayTeam: {

      id:
        m.awayTeam?.id,

      name:
        m.awayTeam?.name || "",

      shortName:
        m.awayTeam?.shortName ||
        m.awayTeam?.name ||
        "",

      crest:
        m.awayTeam?.crest || ""

    },

    score: {

      home:
        m.score?.fullTime?.home ??
        m.score?.home ??
        null,

      away:
        m.score?.fullTime?.away ??
        m.score?.away ??
        null

    }

  };
}


/* =====================================================
   FOOTBALL-DATA DAILY SCORES
===================================================== */

async function footballDataDailyScores(
  env,
  date
) {

  const competitions =
    Object.keys(
      FD_LEAGUES
    ).join(",");

  const q =
    new URLSearchParams({

      competitions,

      dateFrom:
        date,

      dateTo:
        date,

      status:
        "FINISHED"

    });

  const data =
    await fdFetch(
      `/matches?${q}`,
      env,
      300
    );

  return (
    data.matches || []
  )

    .map(fdDailyNorm)

    .filter(Boolean);
}


/* =====================================================
   FOOTBALL-DATA EUROPA LEAGUE
===================================================== */

async function footballDataEuropaScores(
  env,
  date
) {

  try {

    const q =
      new URLSearchParams({

        competitions:
          "EL",

        dateFrom:
          date,

        dateTo:
          date,

        status:
          "FINISHED"

      });

    const data =
      await fdFetch(
        `/matches?${q}`,
        env,
        300
      );

    return (
      data.matches || []
    )

      .map(match => {

        const event =
          fdDailyNorm(match);

        if (!event) {
          return null;
        }

        event.league =
          "Europa League";

        event.leagueCode =
          "Europa League";

        event.leagueId =
          3;

        return event;

      })

      .filter(Boolean);

  } catch (error) {

    /*
      Europa League may not be available
      on the current football-data.org plan.

      In that case Guardian is used below.
    */

    console.warn(
      "football-data.org Europa League unavailable:",
      error.message
    );

    return [];
  }
}


/* =====================================================
   COMBINED DAILY SCORES
===================================================== */

async function dailyScores(
  env,
  date
) {

  const [

    domestic,

    europa,

    guardian

  ] = await Promise.all([

    footballDataDailyScores(
      env,
      date
    ),

    footballDataEuropaScores(
      env,
      date
    ),

    webDailyScores(
      env,
      date
    ).catch(error => {

      console.warn(
        "Guardian supplementary results unavailable:",
        error.message
      );

      return [];

    })

  ]);


  const all = [

    ...domestic,

    ...europa,

    ...guardian

  ];


  /*
    Remove duplicates.
  */

  const seen =
    new Set();

  return all

    .filter(event => {

      const key =
        `${event.leagueId}|${event.homeTeam.name}|${event.awayTeam.name}`
          .toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;

    })

    .sort(
      (a, b) =>
        new Date(a.date) -
        new Date(b.date)
    );
}


/* =====================================================
   PUBLISH YESTERDAY
===================================================== */

async function publishYesterday(
  env,
  force = false
) {

  if (!env.LATEST_SCORES) {

    throw new Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }


  const date =
    previousParisDate();

  const key =
    `scores:${date}`;


  const existing =
    await env.LATEST_SCORES.get(
      key,
      "json"
    );


  /*
    Once a successful snapshot exists,
    don't recreate it every 15 minutes.
  */

  if (
    !force &&
    existing &&
    Number(existing.count) > 0
  ) {

    return {

      ok: true,

      skipped: true,

      date,

      count:
        Number(existing.count),

      reason:
        "Already published"

    };
  }


  const events =
    await dailyScores(
      env,
      date
    );


  /*
    NEVER replace a good snapshot
    with an empty response.
  */

  if (
    events.length === 0 &&
    existing &&
    Number(existing.count) > 0
  ) {

    return {

      ok: true,

      preserved: true,

      date,

      count:
        Number(existing.count),

      reason:
        "Sources returned no results; existing good snapshot preserved"

    };
  }


  const snapshot = {

    events,

    count:
      events.length,

    date,

    source:
      "football-data.org + The Guardian",

    publishedAt:
      new Date().toISOString(),

    message:
      events.length
        ? null
        : "No completed matches recorded for the previous day."

  };


  await env.LATEST_SCORES.put(
    key,
    JSON.stringify(snapshot)
  );


  await env.LATEST_SCORES.put(
    "latest",
    JSON.stringify(snapshot)
  );


  return snapshot;
}


/* =====================================================
   GET LATEST SNAPSHOT
===================================================== */

async function latest(env) {

  if (!env.LATEST_SCORES) {

    throw new Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }


  const snapshot =
    await env.LATEST_SCORES.get(
      "latest",
      "json"
    );


  return snapshot || {

    events: [],

    count: 0,

    date: null,

    source:
      "Cloudflare KV",

    publishedAt:
      null,

    message:
      "No daily snapshot is available yet."

  };
}


/* =====================================================
   LIVE MATCH CENTRE
===================================================== */

async function matchCentre(env) {

  const data =
    await afFetch(
      "/fixtures?live=all&timezone=Europe/Paris",
      env,
      60
    );


  const events =
    (data.response || [])

      .filter(
        x =>
          AF_LEAGUES[
            Number(x.league?.id)
          ]
      )

      .map(afNorm)

      .filter(
        x => x.live
      )

      .sort(
        (a, b) =>
          new Date(a.date) -
          new Date(b.date)
      );


  return {

    events,

    live:
      events,

    finished:
      [],

    upcoming:
      [],

    count:
      events.length,

    liveCount:
      events.length,

    source:
      "API-Football",

    updated:
      new Date().toISOString()

  };
}


/* =====================================================
   FOOTBALL-DATA FIXTURE NORMALISATION
===================================================== */

function fdNorm(m) {

  return {

    id:
      String(m.id),

    date:
      m.utcDate,

    status:
      m.status,

    minute:
      m.minute ?? null,

    league:
      FD_LEAGUES[
        m.competition?.code
      ] ||
      m.competition?.name ||
      "",

    leagueCode:
      m.competition?.code ||
      "",

    matchday:
      m.matchday ?? null,

    stage:
      m.stage ?? null,

    homeTeam: {

      id:
        m.homeTeam?.id,

      name:
        m.homeTeam?.name ||
        "",

      shortName:
        m.homeTeam?.shortName ||
        m.homeTeam?.name ||
        "",

      crest:
        m.homeTeam?.crest ||
        ""

    },

    awayTeam: {

      id:
        m.awayTeam?.id,

      name:
        m.awayTeam?.name ||
        "",

      shortName:
        m.awayTeam?.shortName ||
        m.awayTeam?.name ||
        "",

      crest:
        m.awayTeam?.crest ||
        ""

    },

    score:
      m.score || {}

  };
}


/* =====================================================
   FIXTURES
===================================================== */

async function fixtures(env) {

  const now =
    new Date();

  const end =
    new Date(now);

  end.setUTCDate(
    end.getUTCDate() + 7
  );


  const q =
    new URLSearchParams({

      competitions:
        Object.keys(
          FD_LEAGUES
        ).join(","),

      dateFrom:
        now.toISOString()
          .slice(0, 10),

      dateTo:
        end.toISOString()
          .slice(0, 10)

    });


  const data =
    await fdFetch(
      `/matches?${q}`,
      env,
      300
    );


  const events =
    (data.matches || [])

      .map(fdNorm)

      .filter(
        x =>
          new Date(x.date) >= now
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

    message:
      events.length
        ? null
        : "No upcoming fixtures found.",

    source:
      "football-data.org",

    updated:
      new Date().toISOString()

  };
}


/* =====================================================
   BBC NEWS HELPERS
===================================================== */

function dec(text = "") {

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
        String.fromCharCode(+n)
    )

    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCharCode(
          parseInt(n, 16)
        )
    );
}


/* =====================================================
   XML VALUE
===================================================== */

function xv(x, tag) {

  const m =
    x.match(
      new RegExp(
        `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
        "i"
      )
    );

  return m
    ? dec(m[1].trim())
    : "";
}


/* =====================================================
   BBC NEWS PARSER
===================================================== */

function parseNews(x) {

  const out = [];

  const items =
    x.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    ) || [];


  for (const item of items) {

    const title =
      xv(item, "title");

    const link =
      xv(item, "link");


    if (!title || !link) {
      continue;
    }


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


    out.push({

      title,

      link,

      source:
        "BBC Sport",

      published:
        xv(item, "pubDate") ||
        xv(item, "dc:date"),

      description:
        xv(item, "description")
          .replace(
            /<[^>]+>/g,
            ""
          )
          .trim()
          .slice(0, 240),

      image:
        mediaContent?.[1] ||
        mediaThumbnail?.[1] ||
        enclosure?.[1] ||
        ""

    });
  }


  return out;
}


/* =====================================================
   BBC NEWS
===================================================== */

async function news() {

  const r =
    await fetch(
      BBC,
      {
        headers: {

          "User-Agent":
            "YepFootball/1.0 (+https://yepfootball.com)",

          Accept:
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


  if (!r.ok) {

    throw new Error(
      `BBC RSS ${r.status}`
    );
  }


  const articles =
    parseNews(
      await r.text()
    ).slice(0, 12);


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


/* =====================================================
   HEALTH CHECK
===================================================== */

async function health(env) {

  const started =
    Date.now();


  const result = {

    ok: true,

    upstreams: {},

    elapsedMs: 0,

    checked:
      new Date().toISOString()

  };


  result.upstreams.apiFootball =
    env.API_FOOTBALL_KEY
      ? "configured"
      : "Missing secret";


  result.upstreams.footballData =
    env.FOOTBALL_DATA_TOKEN
      ? "configured"
      : "Missing secret";


  if (
    !env.API_FOOTBALL_KEY ||
    !env.FOOTBALL_DATA_TOKEN
  ) {

    result.ok =
      false;

  }


  if (!env.LATEST_SCORES) {

    result.ok =
      false;

    result.upstreams.latestScores =
      "Missing KV binding LATEST_SCORES";

  } else {

    const snapshot =
      await env.LATEST_SCORES.get(
        "latest",
        "json"
      );


    result.upstreams.latestScores =
      snapshot

        ? `ok (${snapshot.date || "unknown date"}, ${snapshot.count ?? 0} results)`

        : "configured but empty";

  }


  result.elapsedMs =
    Date.now() - started;


  return result;
}


/* =====================================================
   REQUEST HANDLER
===================================================== */

async function handle(
  req,
  env
) {

  const url =
    new URL(req.url);

  const path =
    url.pathname;


  try {


    /* -----------------------------
       HEALTH
    ----------------------------- */

    if (
      path === "/api/health"
    ) {

      const result =
        await health(env);

      return json(
        result,
        result.ok
          ? 200
          : 502,
        30
      );

    }


    /* -----------------------------
       DAILY SCORES
    ----------------------------- */

    if (
      path === "/api/scores"
    ) {

      /*
        Manual refresh:

        /api/scores?refresh=1
      */

      if (
        url.searchParams.get(
          "refresh"
        ) === "1"
      ) {

        const published =
          await publishYesterday(
            env,
            true
          );


        const current =
          await latest(env);


        return json(

          {
            ...current,

            refresh:
              published

          },

          200,

          0

        );
      }


      return json(
        await latest(env),
        200,
        30
      );
    }


    /* -----------------------------
       MATCH CENTRE
    ----------------------------- */

    if (
      path === "/api/match-centre"
    ) {

      return json(
        await matchCentre(env),
        200,
        60
      );

    }


    /* -----------------------------
       FIXTURES
    ----------------------------- */

    if (
      path === "/api/fixtures"
    ) {

      return json(
        await fixtures(env),
        200,
        300
      );

    }


    /* -----------------------------
       BBC NEWS
    ----------------------------- */

    if (
      path === "/api/news"
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

      30

    );

  }


  return null;
}


/* =====================================================
   CLOUDFLARE WORKER
===================================================== */

export default {

  async fetch(
    req,
    env,
    ctx
  ) {

    const response =
      await handle(
        req,
        env
      );


    return (
      response ||
      env.ASSETS.fetch(req)
    );

  },


  async scheduled(
    event,
    env,
    ctx
  ) {

    /*
      The cron runs every 15 minutes,
      but publishYesterday() only creates
      the snapshot once per day.
    */

    ctx.waitUntil(

      publishYesterday(
        env
      ).catch(error => {

        console.error(
          "Daily scores snapshot not published:",
          error
        );

      })

    );

  }

};