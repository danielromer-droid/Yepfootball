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

/*
  Guardian competition result pages.

  We deliberately use the competition pages instead of:
  /football/results/YYYY/mon/day

  because the Guardian competition pages give us a much
  more reliable date -> league -> result structure.
*/
const GUARDIAN_RESULTS = {
  2: {
    name: "Champions League",
    url: "https://www.theguardian.com/football/championsleague/results"
  },
  3: {
    name: "Europa League",
    url: "https://www.theguardian.com/football/uefa-europa-league/results"
  },
  848: {
    name: "Conference League",
    url: "https://www.theguardian.com/football/europa-conference-league/results"
  },
  39: {
    name: "Premier League",
    url: "https://www.theguardian.com/football/premierleague/results"
  },
  140: {
    name: "La Liga",
    url: "https://www.theguardian.com/football/laligafootball/results"
  },
  135: {
    name: "Serie A",
    url: "https://www.theguardian.com/football/serieafootball/results"
  },
  78: {
    name: "Bundesliga",
    url: "https://www.theguardian.com/football/bundesligafootball/results"
  },
  61: {
    name: "Ligue 1",
    url: "https://www.theguardian.com/football/ligue1football/results"
  }
};


/* ---------------------------------------------------------
   COMMON HELPERS
--------------------------------------------------------- */

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


function isoDateUTC(date) {
  return date.toISOString().slice(0, 10);
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


/* ---------------------------------------------------------
   GUARDIAN RESULTS
--------------------------------------------------------- */

/*
  Parse one Guardian competition page.

  Example Guardian result:

  FT Real Betis 10 Getafe

  The two digits are the home and away score:
  10 = 1-0
  21 = 2-1
  00 = 0-0
  50 = 5-0
*/
function parseGuardianCompetition(html, targetDate, leagueId) {
  const wantedDate = guardianDateLabel(targetDate);

  // Keep line breaks around headings and list items so the
  // Guardian page structure survives HTML stripping.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<\/(?:h1|h2|h3|h4|h5|h6|li|p|div|section|article)>/gi, "\n")
    .replace(/<(?:h1|h2|h3|h4|h5|h6|li|p|div|section|article)[^>]*>/gi, "\n")
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
    );

  const lines = text
    .split(/\n+/)
    .map(x => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const wanted = wantedDate.toLowerCase();

  let active = false;
  const events = [];

  for (const line of lines) {

    // Start of the required date.
    if (line.toLowerCase().includes(wanted)) {
      active = true;
      continue;
    }

    // Stop when the next date heading is reached.
    if (
      active &&
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}$/i.test(line)
    ) {
      break;
    }

    if (!active) continue;

    // We only want FT result lines.
    if (!/^FT\s+/i.test(line)) continue;

    let result = line
      .replace(/^FT\s+/i, "")
      .trim();

    // Remove penalty information.
    result = result
      .replace(
        /\s+[A-Za-z .'-]+?\s+win\s+\d+-\d+\s+on\s+penalties$/i,
        ""
      )
      .replace(/\s+\(AET\)$/i, "")
      .trim();

    /*
      Guardian format:

      Real Betis 10 Getafe
      Barcelona 72 Racing Santander
      Juventus 50 NEC

      The two digits immediately before the away team
      are the score.
    */
    const match = result.match(
      /^(.+?)\s+(\d)(\d)\s+(.+?)$/i
    );

    if (!match) continue;

    const home = match[1].trim();
    const homeScore = Number(match[2]);
    const awayScore = Number(match[3]);
    const away = match[4].trim();

    if (!home || !away) continue;

    events.push({
      id:
        `guardian-${isoDateUTC(targetDate)}-${leagueId}-${events.length + 1}`,

      date:
        `${isoDateUTC(targetDate)}T12:00:00Z`,

      league:
        LEAGUES[leagueId],

      leagueId,

      leagueCode:
        String(leagueId),

      status:
        "FT",

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

  return events;
}
  const wantedDate = guardianDateLabel(targetDate);

  const tokens = [];

  const re =
    /<h2\b[^>]*>([\s\S]*?)<\/h2>|<h3\b[^>]*>([\s\S]*?)<\/h3>|<li\b[^>]*>([\s\S]*?)<\/li>/gi;

  let match;

  while ((match = re.exec(html))) {
    if (match[1] !== undefined) {
      tokens.push({
        type: "date",
        text: stripHtml(match[1])
      });
    } else if (match[2] !== undefined) {
      tokens.push({
        type: "league",
        text: stripHtml(match[2])
      });
    } else {
      tokens.push({
        type: "result",
        text: stripHtml(match[3])
      });
    }
  }

  let activeDate = false;

  const events = [];

  for (const token of tokens) {

    if (token.type === "date") {
      activeDate =
        token.text.toLowerCase() === wantedDate.toLowerCase();

      continue;
    }

    if (!activeDate) {
      continue;
    }

    if (token.type !== "result") {
      continue;
    }

    let text = token.text.trim();

    if (!/^FT\s+/i.test(text)) {
      continue;
    }

    /*
      Remove penalty-shootout text.

      Example:
      FT Peterborough 33 Barnsley
      Peterborough win 7-6 on penalties
    */

    text = text
      .replace(
        /\s+[A-Za-z .'-]+?\s+win\s+\d+-\d+\s+on\s+penalties$/i,
        ""
      )
      .replace(/\s+\(AET\)$/i, "")
      .trim();

    /*
      Match:

      FT Home 21 Away

      The score is always two digits in the Guardian
      result listings.
    */

    const resultMatch = text.match(
      /^FT\s+(.+?)\s+(\d)(\d)\s+(.+?)$/i
    );

    if (!resultMatch) {
      continue;
    }

    const home = resultMatch[1].trim();
    const homeScore = Number(resultMatch[2]);
    const awayScore = Number(resultMatch[3]);
    const away = resultMatch[4].trim();

    if (!home || !away) {
      continue;
    }

    events.push({
      id:
        `guardian-${isoDateUTC(targetDate)}-` +
        `${leagueId}-${events.length + 1}`,

      date: `${isoDateUTC(targetDate)}T12:00:00Z`,

      league: LEAGUES[leagueId],
      leagueId,
      leagueCode: String(leagueId),

      status: "FT",
      statusLong: "Match Finished",

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

      source: "The Guardian football results"
    });
  }

  return events;
}


/*
  Fetch one Guardian competition.
*/
async function guardianCompetitionScores(
  targetDate,
  leagueId,
  competition
) {
  const response = await fetch(competition.url, {
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

  if (!response.ok) {
    throw new Error(
      `Guardian ${competition.name} ${response.status}`
    );
  }

  const html = await response.text();

  const events = parseGuardianCompetition(
    html,
    targetDate,
    leagueId
  );

  return {
    leagueId,
    league: competition.name,
    events,
    url: competition.url
  };
}


/*
  Fetch all eight competitions.

  Promise.allSettled means one failed Guardian page
  doesn't prevent the other competitions from being read.
*/
async function guardianScores(targetDate) {
  const entries = Object.entries(GUARDIAN_RESULTS);

  const results = await Promise.allSettled(
    entries.map(([leagueId, competition]) =>
      guardianCompetitionScores(
        targetDate,
        Number(leagueId),
        competition
      )
    )
  );

  const events = [];
  const errors = [];

  for (const result of results) {

    if (result.status === "fulfilled") {
      events.push(...result.value.events);
    } else {
      errors.push(
        result.reason?.message ||
        String(result.reason)
      );
    }
  }

  /*
    Sort by league then team name so the display
    remains stable.
  */
  events.sort((a, b) => {
    if (a.leagueId !== b.leagueId) {
      return a.leagueId - b.leagueId;
    }

    return a.homeTeam.name.localeCompare(
      b.homeTeam.name
    );
  });

  return {
    events,
    count: events.length,
    date: isoDateUTC(targetDate),
    source: "The Guardian football results",
    publishedAt: new Date().toISOString(),
    errors
  };
}


/* ---------------------------------------------------------
   DAILY SNAPSHOT / KV
--------------------------------------------------------- */

async function publishYesterday(env) {

  if (!env.LATEST_SCORES) {
    throw new Error(
      "Missing Cloudflare KV binding LATEST_SCORES"
    );
  }

  const targetDate = previousParisDate();
  const dateKey = isoDateUTC(targetDate);

  const existing =
    await env.LATEST_SCORES.get(
      KV_KEY,
      "json"
    );

  /*
    If today's snapshot has already been created,
    don't repeatedly fetch Guardian every 15 minutes.
  */
  if (
    existing &&
    existing.date === dateKey
  ) {
    return {
      ...existing,
      alreadyPublished: true
    };
  }

  try {

    const snapshot =
      await guardianScores(targetDate);

    /*
      If every Guardian request failed, preserve the
      previous snapshot.
    */
    if (
      snapshot.count === 0 &&
      snapshot.errors.length ===
        Object.keys(GUARDIAN_RESULTS).length
    ) {

      if (existing) {
        return {
          ...existing,
          preserved: true,
          sourceError:
            snapshot.errors.join("; ")
        };
      }

      throw new Error(
        "Guardian results unavailable for all competitions"
      );
    }

    /*
      A legitimate zero-result day is allowed if Guardian
      responded successfully.
    */

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

    /*
      NEVER erase a working snapshot because the source
      temporarily failed.
    */

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


async function latestScores(env, league) {

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
      updated: new Date().toISOString()
    };
  }

  let events = snapshot.events || [];

  if (league) {
    const leagueId = Number(league);

    events = events.filter(
      event => event.leagueId === leagueId
    );
  }

  return {
    ...snapshot,
    events,
    count: events.length
  };
}


/* ---------------------------------------------------------
   API-FOOTBALL
   MATCH CENTRE ONLY
--------------------------------------------------------- */

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

  const response = await fetch(
    `${AF}${path}`,
    {
      headers: {
        "x-apisports-key":
          env.API_FOOTBALL_KEY,
        "Accept":
          "application/json"
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
      `API-Football ${response.status}: ` +
      text.slice(0, 250)
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
    id: String(
      match.fixture?.id || ""
    ),

    date:
      match.fixture?.date || null,

    timestamp:
      match.fixture?.timestamp || null,

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
        match.teams?.home?.name || "",

      shortName:
        match.teams?.home?.name || "",

      crest:
        match.teams?.home?.logo || ""
    },

    awayTeam: {
      id:
        match.teams?.away?.id,

      name:
        match.teams?.away?.name || "",

      shortName:
        match.teams?.away?.name || "",

      crest:
        match.teams?.away?.logo || ""
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
        event =>
          event.leagueId &&
          LEAGUES[event.leagueId]
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


/* ---------------------------------------------------------
   FOOTBALL-DATA.ORG
   FIXTURES ONLY
--------------------------------------------------------- */

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

  const response =
    await fetch(
      `${FD}${path}`,
      {
        headers: {
          "X-Auth-Token":
            env.FOOTBALL_DATA_TOKEN,

          "Accept":
            "application/json"
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
      `football-data.org ${response.status}: ` +
      text.slice(0, 250)
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
        match.homeTeam?.name || "",

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
        match.awayTeam?.name || "",

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

  const now = new Date();

  const end =
    new Date(now);

  end.setUTCDate(
    end.getUTCDate() + 7
  );

  const query =
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
      `/matches?${query.toString()}`,
      env,
      120
    );

  const events =
    (data.matches || [])
      .map(normalizeFD)
      .filter(
        event =>
          new Date(event.date) >= now
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


/* ---------------------------------------------------------
   BBC NEWS
--------------------------------------------------------- */

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
        String.fromCharCode(Number(n))
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (_, n) =>
        String.fromCharCode(
          parseInt(n, 16)
        )
    );
}


function xmlValue(xml, tag) {

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
      image = mediaContent[1];
    } else if (mediaThumbnail) {
      image = mediaThumbnail[1];
    } else if (enclosure) {
      image = enclosure[1];
    }

    items.push({
      title,
      link,
      source: "BBC Sport",
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

  if (!response.ok) {
    throw new Error(
      `BBC RSS ${response.status}`
    );
  }

  const articles =
    parseBBCNews(
      await response.text()
    ).slice(0, 12);

  return {
    articles,
    count: articles.length,

    source: {
      name: "BBC Sport",
      url:
        "https://www.bbc.com/sport/football"
    },

    updated:
      new Date().toISOString()
  };
}


/* ---------------------------------------------------------
   HEALTH
--------------------------------------------------------- */

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
          value =>
            value === "configured" ||
            value === "ok"
        ),

    upstreams,

    elapsedMs: 0,

    checked:
      new Date().toISOString()
  };
}


/* ---------------------------------------------------------
   API ROUTING
--------------------------------------------------------- */

async function handle(request, env) {

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


/* ---------------------------------------------------------
   WORKER
--------------------------------------------------------- */

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

    /*
      Your cron is every 15 minutes.

      publishYesterday() checks KV first, so after the
      first successful publication it does NOT repeatedly
      fetch Guardian every 15 minutes.
    */

    ctx.waitUntil(
      publishYesterday(env)
    );
  }
};