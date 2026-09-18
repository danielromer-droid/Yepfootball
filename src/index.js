/* YepFootball Worker
   ---------------------------------------------------------
   Secrets:
     API_FOOTBALL_KEY
     FOOTBALL_DATA_TOKEN

   KV binding:
     LATEST_SCORES -> YepFootball Scores

   Cron:
     Every 15 minutes

   IMPORTANT:
     - Latest Scores = The Guardian football results
     - Match Centre = API-Football
     - Fixtures = football-data.org
     - News = BBC Sport RSS
   ---------------------------------------------------------
*/

const AF =
  "https://v3.football.api-sports.io";

const FD =
  "https://api.football-data.org/v4";

const BBC =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";

const GUARDIAN_RESULTS =
  "https://www.theguardian.com/football/results";


/* -------------------------------------------------------
   LEAGUES
------------------------------------------------------- */

const FD_LEAGUES = {
  CL: "Champions League",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};

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


/* -------------------------------------------------------
   FINAL STATUSES
------------------------------------------------------- */

const FINAL = new Set([
  "FT",
  "AET",
  "PEN",
  "AWD",
  "WO"
]);


/* -------------------------------------------------------
   JSON RESPONSE
------------------------------------------------------- */

function json(
  data,
  status = 200,
  maxAge = 60
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8",

        "cache-control":
          `public, max-age=${maxAge}`,

        "access-control-allow-origin":
          "*"
      }
    }
  );
}


/* -------------------------------------------------------
   PARIS DATE / TIME
------------------------------------------------------- */

function parisParts(d = new Date()) {

  const a =
    new Intl.DateTimeFormat(
      "en-GB",
      {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
      }
    ).formatToParts(d);

  const o = {};

  for (const x of a) {
    if (x.type !== "literal") {
      o[x.type] = x.value;
    }
  }

  return o;
}


function previousParisDate(
  d = new Date()
) {

  const p = parisParts(d);

  const x = new Date(
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      12
    )
  );

  x.setUTCDate(
    x.getUTCDate() - 1
  );

  return x
    .toISOString()
    .slice(0, 10);
}


/* -------------------------------------------------------
   API-FOOTBALL
   Used ONLY for Match Centre
------------------------------------------------------- */

async function afFetch(
  path,
  env,
  ttl = 60
) {

  if (!env.API_FOOTBALL_KEY) {
    throw Error(
      "Missing Cloudflare secret API_FOOTBALL_KEY"
    );
  }

  const r = await fetch(
    `${AF}${path}`,
    {
      headers: {
        "x-apisports-key":
          env.API_FOOTBALL_KEY,

        "Accept":
          "application/json"
      },

      cf: {
        cacheTtl: ttl,
        cacheEverything: true
      }
    }
  );

  const t = await r.text();

  if (!r.ok) {
    throw Error(
      `API-Football ${r.status}: ${t.slice(0, 400)}`
    );
  }

  const d = JSON.parse(t);

  if (
    d.errors &&
    Object.keys(d.errors).length
  ) {
    throw Error(
      `API-Football error: ${JSON.stringify(d.errors)}`
    );
  }

  return d;
}


/* -------------------------------------------------------
   FOOTBALL-DATA.ORG
   Used for Fixtures
------------------------------------------------------- */

async function fdFetch(
  path,
  env,
  ttl = 300
) {

  if (!env.FOOTBALL_DATA_TOKEN) {
    throw Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );
  }

  const r = await fetch(
    `${FD}${path}`,
    {
      headers: {
        "X-Auth-Token":
          env.FOOTBALL_DATA_TOKEN,

        "Accept":
          "application/json"
      },

      cf: {
        cacheTtl: ttl,
        cacheEverything: true
      }
    }
  );

  const t = await r.text();

  if (!r.ok) {
    throw Error(
      `football-data.org ${r.status}: ${t.slice(0, 300)}`
    );
  }

  return JSON.parse(t);
}


/* -------------------------------------------------------
   API-FOOTBALL NORMALISATION
------------------------------------------------------- */

function afNorm(x) {

  const s =
    x.fixture?.status || {};

  const h =
    x.teams?.home || {};

  const a =
    x.teams?.away || {};

  const lid =
    Number(x.league?.id);

  return {

    id:
      String(x.fixture?.id),

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
      home:
        x.goals?.home ?? null,

      away:
        x.goals?.away ?? null
    }
  };
}


/* -------------------------------------------------------
   GUARDIAN HELPERS
------------------------------------------------------- */

function htmlDecode(
  text = ""
) {

  return text

    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )

    .replace(
      /&nbsp;/gi,
      " "
    )

    .replace(
      /&amp;/gi,
      "&"
    )

    .replace(
      /&quot;/gi,
      '"'
    )

    .replace(
      /&#39;/gi,
      "'"
    )

    .replace(
      /&apos;/gi,
      "'"
    )

    .replace(
      /&lt;/gi,
      "<"
    )

    .replace(
      /&gt;/gi,
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


function stripTags(
  text = ""
) {

  return htmlDecode(
    text
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<[^>]+>/g,
        " "
      )
  )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


/* -------------------------------------------------------
   GUARDIAN DATE FORMATTING
------------------------------------------------------- */

function guardianDateLabel(
  date
) {

  const d =
    new Date(`${date}T12:00:00Z`);

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  ).format(d);
}


/* -------------------------------------------------------
   GUARDIAN RESULTS PARSER
------------------------------------------------------- */

function parseGuardianResults(
  html,
  targetDate
) {

  const events = [];

  const wantedDate =
    guardianDateLabel(targetDate)
      .toLowerCase();

  /*
     Convert the HTML into reasonably readable
     text while retaining line boundaries.
  */

  let text =
    html
      .replace(
        /<\/(h1|h2|h3|h4|h5|h6|li|p|div|article|section|tr)>/gi,
        "\n"
      )
      .replace(
        /<br\s*\/?>/gi,
        "\n"
      );

  text =
    stripTags(text);

  /*
     Guardian pages normally contain date headings
     followed by competition sections and result lines.

     We look for the requested date and then process
     the following text.
  */

  const lines =
    text
      .split(/\n+/)
      .map(x => x.trim())
      .filter(Boolean);

  let inTargetDate = false;
  let currentLeague = "";

  const leagueNames = [
    "Premier League",
    "La Liga",
    "Serie A",
    "Bundesliga",
    "Ligue 1",
    "Champions League",
    "Europa League",
    "Europa Conference League",
    "Conference League"
  ];

  const leagueIds = {
    "Premier League": 39,
    "La Liga": 140,
    "Serie A": 135,
    "Bundesliga": 78,
    "Ligue 1": 61,
    "Champions League": 2,
    "Europa League": 3,
    "Europa Conference League": 848,
    "Conference League": 848
  };


  for (
    let i = 0;
    i < lines.length;
    i++
  ) {

    const line =
      lines[i];

    const lower =
      line.toLowerCase();


    /*
       Detect the requested date.
    */

    if (
      lower.includes(
        wantedDate
      )
    ) {

      inTargetDate = true;
      continue;
    }


    /*
       Stop when another dated section
       is encountered.
    */

    if (
      inTargetDate &&
      /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}\s+\w+\s+\d{4}\b/i
        .test(line)
    ) {

      if (
        !lower.includes(
          wantedDate
        )
      ) {
        break;
      }
    }


    if (!inTargetDate) {
      continue;
    }


    /*
       Detect competition.
    */

    for (
      const name of leagueNames
    ) {

      if (
        lower ===
        name.toLowerCase()
      ) {

        currentLeague =
          name;

        break;
      }
    }


    /*
       Result formats seen on the Guardian
       include examples such as:

       FT Arsenal 2-0 Chelsea
       FT Barcelona 3-1 ...
       FT Inter 5-3 Udinese

       We therefore look for FT followed by
       two team names separated by a score.
    */

    const m =
      line.match(
        /^FT\s+(.+?)\s+(\d+)\s*[-–]\s*(\d+)\s+(.+?)$/i
      );

    if (!m) {
      continue;
    }


    const home =
      m[1].trim();

    const homeScore =
      Number(m[2]);

    const awayScore =
      Number(m[3]);

    const away =
      m[4].trim();


    /*
       Only keep competitions displayed on
       YepFootball.
    */

    const league =
      currentLeague;

    if (!league) {
      continue;
    }


    const leagueId =
      leagueIds[league];

    if (!leagueId) {
      continue;
    }


    events.push({

      id:
        `${targetDate}-${leagueId}-${home}-${away}`
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            "-"
          ),

      date:
        `${targetDate}T12:00:00Z`,

      status:
        "FT",

      statusLong:
        "Match Finished",

      minute:
        null,

      live:
        false,

      league,

      leagueCode:
        String(leagueId),

      leagueId,

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


  /*
     Remove duplicates.
  */

  const seen =
    new Set();

  return events
    .filter(e => {

      if (seen.has(e.id)) {
        return false;
      }

      seen.add(e.id);

      return true;
    })

    .sort(
      (a, b) =>
        a.league.localeCompare(
          b.league
        ) ||
        a.homeTeam.name.localeCompare(
          b.homeTeam.name
        )
    );
}


/* -------------------------------------------------------
   WEB DAILY SCORES
------------------------------------------------------- */

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

          "Accept":
            "text/html,application/xhtml+xml"
        },

        cf: {
          cacheTtl: 900,
          cacheEverything: true
        }
      }
    );

  if (!r.ok) {
    throw Error(
      `The Guardian results ${r.status}`
    );
  }

  const html =
    await r.text();

  const events =
    parseGuardianResults(
      html,
      date
    );

  return events;
}


/* -------------------------------------------------------
   DAILY SCORES
   IMPORTANT:
   This NO LONGER uses API-Football.
------------------------------------------------------- */

async function dailyScores(
  env,
  date
) {

  return webDailyScores(
    env,
    date
  );
}


/* -------------------------------------------------------
   PUBLISH YESTERDAY
------------------------------------------------------- */

async function publishYesterday(
  env
) {

  if (!env.LATEST_SCORES) {
    throw Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }


  const date =
    previousParisDate();


  /*
     Never regenerate an already-published
     snapshot.
  */

  const existing =
    await env.LATEST_SCORES.get(
      `scores:${date}`,
      "json"
    );

  if (existing) {

    return {
      ok: true,
      skipped: true,
      date,
      reason:
        "Already published"
    };
  }


  const events =
    await dailyScores(
      env,
      date
    );


  const p = {

    events,

    count:
      events.length,

    date,

    source:
      "The Guardian football results",

    publishedAt:
      new Date().toISOString(),

    message:
      events.length
        ? null
        : "No completed matches recorded for the previous day."

  };


  /*
     Write the dated snapshot first.
  */

  await env.LATEST_SCORES.put(
    `scores:${date}`,
    JSON.stringify(p)
  );


  /*
     Then update the current snapshot.
  */

  await env.LATEST_SCORES.put(
    "latest",
    JSON.stringify(p)
  );


  return p;
}


/* -------------------------------------------------------
   LATEST SCORES
------------------------------------------------------- */

async function latest(
  env
) {

  if (!env.LATEST_SCORES) {
    throw Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }


  const p =
    await env.LATEST_SCORES.get(
      "latest",
      "json"
    );


  return (
    p ||
    {
      events: [],
      count: 0,
      date: null,
      source: "Cloudflare KV",
      publishedAt: null,
      message:
        "No daily snapshot is available yet."
    }
  );
}


/* -------------------------------------------------------
   MATCH CENTRE
   API-FOOTBALL REMAINS HERE
------------------------------------------------------- */

async function matchCentre(
  env
) {

  const d =
    await afFetch(
      "/fixtures?live=all&timezone=Europe/Paris",
      env,
      60
    );


  const events =
    (d.response || [])

      .filter(
        x =>
          AF_LEAGUES[
            Number(
              x.league?.id
            )
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

    finished: [],

    upcoming: [],

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


/* -------------------------------------------------------
   FOOTBALL-DATA NORMALISATION
------------------------------------------------------- */

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


/* -------------------------------------------------------
   FIXTURES
   football-data.org remains unchanged
------------------------------------------------------- */

async function fixtures(
  env
) {

  const n =
    new Date();

  const e =
    new Date(n);

  e.setUTCDate(
    e.getUTCDate() + 7
  );


  const q =
    new URLSearchParams({

      competitions:
        Object.keys(
          FD_LEAGUES
        ).join(","),

      dateFrom:
        n.toISOString()
          .slice(0, 10),

      dateTo:
        e.toISOString()
          .slice(0, 10)

    });


  const d =
    await fdFetch(
      `/matches?${q}`,
      env,
      300
    );


  const events =
    (d.matches || [])

      .map(fdNorm)

      .filter(
        x =>
          new Date(x.date) >= n
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


/* -------------------------------------------------------
   BBC NEWS
   UNCHANGED
------------------------------------------------------- */

function dec(
  t = ""
) {

  return t

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


function xv(
  x,
  tag
) {

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


function parseNews(
  x
) {

  const out = [];

  const items =
    x.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    ) || [];


  for (
    const i of items
  ) {

    const title =
      xv(i, "title");

    const link =
      xv(i, "link");


    if (!title || !link) {
      continue;
    }


    const mc =
      i.match(
        /<media:content[^>]+url=["']([^"']+)["']/i
      );

    const mt =
      i.match(
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i
      );

    const en =
      i.match(
        /<enclosure[^>]+url=["']([^"']+)["']/i
      );


    out.push({

      title,

      link,

      source:
        "BBC Sport",

      published:
        xv(i, "pubDate") ||
        xv(i, "dc:date"),

      description:
        xv(i, "description")
          .replace(
            /<[^>]+>/g,
            ""
          )
          .trim()
          .slice(0, 240),

      image:
        mc?.[1] ||
        mt?.[1] ||
        en?.[1] ||
        ""

    });
  }


  return out;
}


async function news() {

  const r =
    await fetch(
      BBC,
      {
        headers: {

          "User-Agent":
            "YepFootball/1.0 (+https://yepfootball.com)",

          "Accept":
            "application/rss+xml, application/xml, text/xml"

        },

        cf: {
          cacheTtl: 900,
          cacheEverything: true
        }
      }
    );


  if (!r.ok) {
    throw Error(
      `BBC RSS ${r.status}`
    );
  }


  const a =
    parseNews(
      await r.text()
    ).slice(0, 12);


  return {

    articles: a,

    count:
      a.length,

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


/* -------------------------------------------------------
   HEALTH
------------------------------------------------------- */

async function health(
  env
) {

  const r = {

    ok: true,

    upstreams: {},

    elapsedMs: 0,

    checked:
      new Date().toISOString()

  };


  const started =
    Date.now();


  r.upstreams.apiFootball =
    env.API_FOOTBALL_KEY
      ? "configured"
      : "Missing secret";


  r.upstreams.footballData =
    env.FOOTBALL_DATA_TOKEN
      ? "configured"
      : "Missing secret";


  if (
    !env.API_FOOTBALL_KEY ||
    !env.FOOTBALL_DATA_TOKEN
  ) {

    r.ok = false;

  }


  if (!env.LATEST_SCORES) {

    r.ok = false;

    r.upstreams.latestScores =
      "Missing KV binding LATEST_SCORES";

  } else {

    const p =
      await env.LATEST_SCORES.get(
        "latest",
        "json"
      );


    r.upstreams.latestScores =
      p
        ? `ok (${p.date || "unknown date"})`
        : "configured but empty";
  }


  r.elapsedMs =
    Date.now() - started;


  return r;
}


/* -------------------------------------------------------
   REQUEST HANDLER
------------------------------------------------------- */

async function handle(
  req,
  env
) {

  const p =
    new URL(req.url).pathname;


  try {

    if (
      p === "/api/health"
    ) {

      const r =
        await health(env);

      return json(
        r,
        r.ok ? 200 : 502,
        30
      );
    }


    if (
      p === "/api/scores"
    ) {

      return json(
        await latest(env),
        200,
        300
      );
    }


    if (
      p === "/api/match-centre"
    ) {

      return json(
        await matchCentre(env),
        200,
        60
      );
    }


    if (
      p === "/api/fixtures"
    ) {

      return json(
        await fixtures(env),
        200,
        300
      );
    }


    if (
      p === "/api/news"
    ) {

      return json(
        await news(),
        200,
        900
      );
    }


  } catch (e) {

    return json(
      {
        error:
          "Football data feed unavailable",

        detail:
          e.message ||
          String(e),

        checked:
          new Date().toISOString()
      },
      502,
      30
    );

  }


  return null;
}


/* -------------------------------------------------------
   CLOUDFLARE WORKER
------------------------------------------------------- */

export default {

  async fetch(
    req,
    env,
    ctx
  ) {

    const r =
      await handle(
        req,
        env
      );


    return (
      r ||
      env.ASSETS.fetch(req)
    );

  },


  async scheduled(
    event,
    env,
    ctx
  ) {

    /*
       The Cron runs every 15 minutes.

       After midnight Paris time, publishYesterday()
       automatically detects the previous calendar day.

       It does NOT need to run at exactly 23:50.
    */

    ctx.waitUntil(
      publishYesterday(
        env
      ).catch(
        err => {

          console.error(
            "Daily scores snapshot not published:",
            err
          );

        }
      )
    );

  }

};