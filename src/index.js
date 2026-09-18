const AF = "https://v3.football.api-sports.io";
const FD = "https://api.football-data.org/v4";
const BBC = "https://feeds.bbci.co.uk/sport/football/rss.xml";

const KV_KEY = "latest";
const PARIS_TIME_ZONE = "Europe/Paris";

const LEAGUES = {
  2: "Champions League",
  3: "Europa League",
  848: "Conference League",
  39: "Premier League",
  140: "La Liga",
  135: "Serie A",
  78: "Bundesliga",
  61: "Ligue 1"
};

const FD_LEAGUES = {
  CL: "Champions League",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};

function json(data, status = 200, maxAge = 30) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=${maxAge}`,
      "access-control-allow-origin": "*"
    }
  });
}

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PARIS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const out = {};

  for (const p of parts) {
    out[p.type] = p.value;
  }

  return out;
}

function previousParisDate() {
  const p = parisParts();

  const d = new Date(
    Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      12
    )
  );

  d.setUTCDate(d.getUTCDate() - 1);

  return d;
}

function isoDateUTC(d) {
  return d.toISOString().slice(0, 10);
}

function guardianDateUrl(date) {
  const p = parisParts(date);

  const month = new Intl.DateTimeFormat("en-US", {
    timeZone: PARIS_TIME_ZONE,
    month: "short"
  })
    .format(date)
    .toLowerCase();

  return `https://www.theguardian.com/football/results/${p.year}/${month}/${p.day}`;
}

function guardianDateLabel(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: PARIS_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function stripHtml(text = "") {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    )
    .replace(/\s+/g, " ")
    .trim();
}

function guardianLeagueId(name) {
  const n = name.toLowerCase();

  if (n.includes("champions league")) return 2;
  if (n.includes("europa league")) return 3;
  if (n.includes("conference league")) return 848;
  if (n.includes("premier league")) return 39;
  if (n.includes("la liga")) return 140;
  if (n.includes("serie a")) return 135;
  if (n.includes("bundesliga")) return 78;
  if (n.includes("ligue 1")) return 61;

  return null;
}

/* -------------------------------------------------------
   GUARDIAN DAILY RESULTS
------------------------------------------------------- */

function parseGuardianResults(html, targetDate) {
  const wanted = guardianDateLabel(targetDate);

  const tokens = [];

  const re =
    /<h2\b[^>]*>([\s\S]*?)<\/h2>|<h3\b[^>]*>([\s\S]*?)<\/h3>|<li\b[^>]*>([\s\S]*?)<\/li>/gi;

  let m;

  while ((m = re.exec(html))) {
    if (m[1] != null) {
      tokens.push({
        type: "date",
        text: stripHtml(m[1])
      });
    } else if (m[2] != null) {
      tokens.push({
        type: "league",
        text: stripHtml(m[2])
      });
    } else {
      tokens.push({
        type: "result",
        text: stripHtml(m[3])
      });
    }
  }

  let active = false;
  let sawDate = false;
  let league = "";

  const events = [];

  for (const token of tokens) {
    if (token.type === "date") {
      sawDate = true;
      active = token.text.includes(wanted);

      if (!active) {
        league = "";
      }

      continue;
    }

    if (!active) continue;

    if (token.type === "league") {
      league = guardianLeagueId(token.text)
        ? token.text
        : "";

      continue;
    }

    if (token.type !== "result" || !league) {
      continue;
    }

    const match = token.text.match(
      /^FT\s+(.+?)\s+(\d{2,3})\s+(.+)$/i
    );

    if (!match) continue;

    const scoreToken = match[2];

    let homeScore;
    let awayScore;

    if (scoreToken.length === 2) {
      homeScore = Number(scoreToken[0]);
      awayScore = Number(scoreToken[1]);
    } else {
      const firstTwo = Number(
        scoreToken.slice(0, 2)
      );

      if (firstTwo >= 10) {
        homeScore = firstTwo;
        awayScore = Number(
          scoreToken.slice(2)
        );
      } else {
        homeScore = Number(scoreToken[0]);
        awayScore = Number(scoreToken.slice(1));
      }
    }

    const home = match[1].trim();

    let away = match[3].trim();

    away = away
      .replace(
        /\s+[A-Z][A-Za-z .'-]*\s+win\s+\d+-\d+\s+on\s+penalties$/i,
        ""
      )
      .replace(
        /\s+\(AET\)$/i,
        ""
      )
      .trim();

    const leagueId =
      guardianLeagueId(league);

    if (
      !home ||
      !away ||
      !leagueId
    ) {
      continue;
    }

    events.push({
      id:
        `guardian-${isoDateUTC(targetDate)}-${events.length + 1}`,

      date:
        `${isoDateUTC(targetDate)}T12:00:00Z`,

      league:
        LEAGUES[leagueId],

      leagueId,

      leagueCode:
        String(leagueId),

      status: "FT",

      statusLong:
        "Match Finished",

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
        home: homeScore,
        away: awayScore
      },

      source:
        "The Guardian football results"
    });
  }

  if (!sawDate) {
    // Exact-date URL fallback:
    // parse the page's result blocks.
  }

  return events;
}

async function guardianScores(targetDate) {
  const url =
    guardianDateUrl(targetDate);

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "YepFootball/1.0 (+https://yepfootball.com)",

      "Accept":
        "text/html,application/xhtml+xml"
    },

    cf: {
      cacheTtl: 300,
      cacheEverything: true
    }
  });

  if (!res.ok) {
    throw new Error(
      `Guardian results ${res.status}`
    );
  }

  const events =
    parseGuardianResults(
      await res.text(),
      targetDate
    );

  return {
    events,
    count: events.length,
    date: isoDateUTC(targetDate),

    source:
      "The Guardian football results",

    sourceUrl: url,

    publishedAt:
      new Date().toISOString()
  };
}

async function publishYesterday(env) {
  if (!env.LATEST_SCORES) {
    throw new Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }

  const targetDate =
    previousParisDate();

  const dateKey =
    isoDateUTC(targetDate);

  const existing =
    await env.LATEST_SCORES.get(
      KV_KEY,
      "json"
    );

  try {
    const snapshot =
      await guardianScores(targetDate);

    if (!snapshot.events.length) {
      return {
        ...snapshot,
        message:
          "No completed matches recorded for the previous day.",
        preserved:
          Boolean(existing)
      };
    }

    await env.LATEST_SCORES.put(
      KV_KEY,
      JSON.stringify(snapshot)
    );

    await env.LATEST_SCORES.put(
      `scores:${dateKey}`,
      JSON.stringify(snapshot)
    );

    return snapshot;

  } catch (error) {

    if (existing) {
      return {
        ...existing,
        preserved: true,
        sourceError:
          error?.message ||
          String(error)
      };
    }

    throw error;
  }
}

async function latestScores(
  env,
  league
) {
  if (!env.LATEST_SCORES) {
    throw new Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }

  const snapshot =
    await env.LATEST_SCORES.get(
      KV_KEY,
      "json"
    );

  if (!snapshot) {
    return {
      events: [],
      count: 0,

      message:
        "No daily score snapshot is available yet.",

      updated:
        new Date().toISOString()
    };
  }

  let events =
    snapshot.events || [];

  if (league) {
    const id = Number(league);

    events =
      events.filter(
        e => e.leagueId === id
      );
  }

  return {
    ...snapshot,
    events,
    count: events.length
  };
}

/* -------------------------------------------------------
   API-FOOTBALL
   Used only for LIVE MATCH CENTRE
------------------------------------------------------- */

async function afFetch(
  path,
  env,
  cacheSeconds = 30
) {
  if (!env.API_FOOTBALL_KEY) {
    throw new Error(
      "Missing Cloudflare secret API_FOOTBALL_KEY"
    );
  }

  const res = await fetch(
    `${AF}${path}`,
    {
      headers: {
        "x-apisports-key":
          env.API_FOOTBALL_KEY,

        "Accept":
          "application/json"
      },

      cf: {
        cacheTtl:
          cacheSeconds,

        cacheEverything: true
      }
    }
  );

  const text =
    await res.text();

  if (!res.ok) {
    throw new Error(
      `API-Football ${res.status}: ${text.slice(0, 250)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "API-Football returned invalid JSON"
    );
  }
}

function normalizeAF(match) {
  const leagueId =
    Number(match.league?.id);

  const status =
    match.fixture?.status || {};

  return {
    id:
      String(
        match.fixture?.id || ""
      ),

    date:
      match.fixture?.date ||
      null,

    timestamp:
      match.fixture?.timestamp ||
      null,

    league:
      LEAGUES[leagueId] ||
      match.league?.name ||
      "",

    leagueId,

    leagueCode:
      String(leagueId || ""),

    status:
      status.short || "",

    statusLong:
      status.long || "",

    elapsed:
      status.elapsed ?? null,

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
      home:
        match.goals?.home,

      away:
        match.goals?.away
    }
  };
}

async function matchCentre(env) {
  const data =
    await afFetch(
      "/fixtures?live=all",
      env,
      20
    );

  const events =
    (data.response || [])
      .map(normalizeAF)
      .filter(
        e =>
          e.leagueId &&
          LEAGUES[e.leagueId]
      );

  return {
    events,
    live: events,
    finished: [],
    upcoming: [],
    count: events.length,
    liveCount: events.length,
    updated:
      new Date().toISOString()
  };
}

/* -------------------------------------------------------
   FOOTBALL-DATA.ORG
   Used for FIXTURES
------------------------------------------------------- */

async function fdFetch(
  path,
  env,
  cacheSeconds = 120
) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );
  }

  const res = await fetch(
    `${FD}${path}`,
    {
      headers: {
        "X-Auth-Token":
          env.FOOTBALL_DATA_TOKEN,

        "Accept":
          "application/json"
      },

      cf: {
        cacheTtl:
          cacheSeconds,

        cacheEverything: true
      }
    }
  );

  const text =
    await res.text();

  if (!res.ok) {
    throw new Error(
      `football-data.org ${res.status}: ${text.slice(0, 250)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      "football-data.org returned invalid JSON"
    );
  }
}

function normalizeFD(match) {
  return {
    id:
      String(match.id),

    date:
      match.utcDate,

    status:
      match.status,

    minute:
      match.minute ?? null,

    league:
      FD_LEAGUES[
        match.competition?.code
      ] ||
      match.competition?.name ||
      "",

    leagueCode:
      match.competition?.code ||
      "",

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
      match.score || {}
  };
}

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
        Object.keys(FD_LEAGUES).join(","),

      dateFrom:
        isoDateUTC(now),

      dateTo:
        isoDateUTC(end)
    });

  const data =
    await fdFetch(
      `/matches?${q.toString()}`,
      env,
      120
    );

  const events =
    (data.matches || [])
      .map(normalizeFD)
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
    events,
    count: events.length,

    message:
      events.length
        ? null
        : "No upcoming fixtures found.",

    updated:
      new Date().toISOString()
  };
}

/* -------------------------------------------------------
   BBC SPORT NEWS
------------------------------------------------------- */

function decodeEntities(text = "") {
  return text
    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
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

function parseBBCNews(xml) {
  const items = [];

  const matches =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    ) || [];

  for (const item of matches) {

    const title =
      xmlValue(item, "title");

    const link =
      xmlValue(item, "link");

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

    if (!title || !link) {
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

    if (mediaContent) {
      image =
        mediaContent[1];
    } else if (mediaThumbnail) {
      image =
        mediaThumbnail[1];
    } else if (enclosure) {
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
  const res =
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

  if (!res.ok) {
    throw new Error(
      `BBC RSS ${res.status}`
    );
  }

  const articles =
    parseBBCNews(
      await res.text()
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

/* -------------------------------------------------------
   HEALTH
------------------------------------------------------- */

async function health(env) {
  const upstreams = {
    apiFootball:
      env.API_FOOTBALL_KEY
        ? "configured"
        : "Missing secret",

    footballData:
      env.FOOTBALL_DATA_TOKEN
        ? "configured"
        : "Missing secret",

    latestScores:
      env.LATEST_SCORES
        ? "ok"
        : "Missing KV binding LATEST_SCORES"
  };

  return {
    ok:
      Object.values(upstreams)
        .every(
          v =>
            v === "configured" ||
            v === "ok"
        ),

    upstreams,

    elapsedMs: 0,

    checked:
      new Date().toISOString()
  };
}

/* -------------------------------------------------------
   REQUEST HANDLER
------------------------------------------------------- */

async function handle(
  request,
  env
) {
  const url =
    new URL(request.url);

  if (
    url.pathname ===
    "/api/health"
  ) {
    return json(
      await health(env),
      200,
      10
    );
  }

  if (
    url.pathname ===
    "/api/scores"
  ) {
    return json(
      await latestScores(
        env,
        url.searchParams.get(
          "league"
        )
      ),
      200,
      60
    );
  }

  if (
    url.pathname ===
    "/api/match-centre"
  ) {
    return json(
      await matchCentre(env),
      200,
      20
    );
  }

  if (
    url.pathname ===
    "/api/fixtures"
  ) {
    return json(
      await fixtures(env),
      200,
      120
    );
  }

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

  return null;
}

/* -------------------------------------------------------
   CLOUDFLARE WORKER
------------------------------------------------------- */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    try {

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

    } catch (error) {

      return json(
        {
          error:
            "Football data feed unavailable",

          detail:
            error?.message ||
            String(error),

          checked:
            new Date().toISOString()
        },
        502,
        30
      );
    }
  },

  async scheduled(
    event,
    env,
    ctx
  ) {

    ctx.waitUntil(
      publishYesterday(env)
    );
  }
};