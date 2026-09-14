/* =========================================================
   YepFootball Cloudflare Worker

   Secrets:
     API_FOOTBALL_KEY
     FOOTBALL_DATA_TOKEN

   KV binding:
     LATEST_SCORES

   Latest Scores:
     - Published once per day at 23:50 Europe/Paris.
     - The previous successful snapshot stays available until
       the new snapshot has been successfully published.
     - A temporary API failure NEVER overwrites the last good
       snapshot.

   Match Centre:
     - API-Football live data.
     - Refreshed by the browser every 30 seconds.
   ========================================================= */

const AF = "https://v3.football.api-sports.io";
const FD = "https://api.football-data.org/v4";
const BBC = "https://feeds.bbci.co.uk/sport/football/rss.xml";

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

const FINAL = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

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
  for (const part of parts) {
    if (part.type !== "literal") out[part.type] = part.value;
  }
  return out;
}

function parisDate(d = new Date()) {
  const p = parisParts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

function parisMinutes(d = new Date()) {
  const p = parisParts(d);
  return Number(p.hour) * 60 + Number(p.minute);
}

async function afFetch(path, env, ttl = 15) {
  if (!env.API_FOOTBALL_KEY) {
    throw Error("Missing Cloudflare secret API_FOOTBALL_KEY");
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
    throw Error(`API-Football ${r.status}: ${text.slice(0, 300)}`);
  }

  const data = JSON.parse(text);

  if (data.errors && Object.keys(data.errors).length) {
    throw Error(`API-Football error: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

async function fdFetch(path, env, ttl = 120) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw Error("Missing Cloudflare secret FOOTBALL_DATA_TOKEN");
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
    throw Error(`football-data.org ${r.status}: ${text.slice(0, 300)}`);
  }

  return JSON.parse(text);
}

function afNorm(x) {
  const s = x.fixture?.status || {};
  const h = x.teams?.home || {};
  const a = x.teams?.away || {};
  const lid = Number(x.league?.id);

  return {
    id: String(x.fixture?.id),
    date: x.fixture?.date || null,
    status: s.short || "",
    statusLong: s.long || "",
    minute: s.elapsed ?? null,
    live: ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(s.short),
    league: AF_LEAGUES[lid] || x.league?.name || "European football",
    leagueCode: String(lid || ""),
    leagueId: lid,
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

async function dailyScores(env, date = parisDate()) {
  const q = new URLSearchParams({
    date,
    timezone: "Europe/Paris"
  });

  const data = await afFetch(`/fixtures?${q.toString()}`, env, 60);

  return (data.response || [])
    .filter((x) => AF_LEAGUES[Number(x.league?.id)])
    .filter((x) => FINAL.has(x.fixture?.status?.short))
    .map(afNorm)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* =========================================================
   LATEST SCORES SNAPSHOT
   ========================================================= */

async function publish(env, date = parisDate()) {
  if (!env.LATEST_SCORES) {
    throw Error("Missing Cloudflare KV binding LATEST_SCORES");
  }

  /*
     IMPORTANT:
     We only write to KV AFTER API-Football has responded
     successfully. Therefore a failed API request can never
     destroy the previous snapshot.
  */
  const events = await dailyScores(env, date);

  const now = new Date();

  const snapshot = {
    events,
    count: events.length,
    date,
    source: "API-Football",
    publishedAt: now.toISOString(),
    lastSuccessfulUpdate: now.toISOString(),
    message: events.length
      ? null
      : "No completed matches recorded today."
  };

  await env.LATEST_SCORES.put(
    "latest",
    JSON.stringify(snapshot)
  );

  await env.LATEST_SCORES.put(
    `scores:${date}`,
    JSON.stringify(snapshot)
  );

  return snapshot;
}

async function getStoredScores(env) {
  if (!env.LATEST_SCORES) {
    throw Error("Missing Cloudflare KV binding LATEST_SCORES");
  }

  return await env.LATEST_SCORES.get("latest", "json");
}

async function latest(env) {
  if (!env.LATEST_SCORES) {
    throw Error("Missing Cloudflare KV binding LATEST_SCORES");
  }

  const stored = await getStoredScores(env);
  const today = parisDate();
  const minutes = parisMinutes();

  /*
     Before 23:50:
     NEVER replace yesterday's snapshot with today's partial
     results. The daily snapshot is deliberately published only
     at 23:50.
  */
  if (minutes < 23 * 60 + 50) {
    if (stored) return stored;

    /* First-ever installation: provide today's completed
       results if available, but do not overwrite a snapshot
       because there is none yet. */
    const events = await dailyScores(env, today);
    const now = new Date().toISOString();

    return {
      events,
      count: events.length,
      date: today,
      source: "API-Football",
      publishedAt: null,
      lastSuccessfulUpdate: now,
      provisional: true,
      message: events.length
        ? null
        : "No completed matches recorded today."
    };
  }

  /*
     At/after 23:50:
     Publish today's snapshot if it has not already been
     published. If the API fails, return the previous snapshot.
  */
  if (stored?.date === today) {
    return stored;
  }

  try {
    return await publish(env, today);
  } catch (error) {
    if (stored) {
      return {
        ...stored,
        stale: true,
        publicationPending: true,
        error: error.message || String(error)
      };
    }

    throw error;
  }
}

/* =========================================================
   EUROPEAN MATCH CENTRE
   ========================================================= */

async function matchCentre(env) {
  const data = await afFetch(
    "/fixtures?live=all&timezone=Europe/Paris",
    env,
    10
  );

  const events = (data.response || [])
    .filter((x) => AF_LEAGUES[Number(x.league?.id)])
    .map(afNorm)
    .filter((x) => x.live)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    events,
    live: events,
    finished: [],
    upcoming: [],
    count: events.length,
    liveCount: events.length,
    source: "API-Football",
    updated: new Date().toISOString()
  };
}

/* =========================================================
   FIXTURES - FOOTBALL-DATA.ORG
   ========================================================= */

function fdNorm(m) {
  return {
    id: String(m.id),
    date: m.utcDate,
    status: m.status,
    minute: m.minute ?? null,
    league:
      FD_LEAGUES[m.competition?.code] ||
      m.competition?.name ||
      "",
    leagueCode: m.competition?.code || "",
    matchday: m.matchday ?? null,
    stage: m.stage ?? null,
    homeTeam: {
      id: m.homeTeam?.id,
      name: m.homeTeam?.name || "",
      shortName:
        m.homeTeam?.shortName ||
        m.homeTeam?.name ||
        "",
      crest: m.homeTeam?.crest || ""
    },
    awayTeam: {
      id: m.awayTeam?.id,
      name: m.awayTeam?.name || "",
      shortName:
        m.awayTeam?.shortName ||
        m.awayTeam?.name ||
        "",
      crest: m.awayTeam?.crest || ""
    },
    score: m.score || {}
  };
}

async function fixtures(env) {
  const now = new Date();
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 7);

  const q = new URLSearchParams({
    competitions: Object.keys(FD_LEAGUES).join(","),
    dateFrom: now.toISOString().slice(0, 10),
    dateTo: end.toISOString().slice(0, 10)
  });

  const data = await fdFetch(
    `/matches?${q.toString()}`,
    env,
    300
  );

  const events = (data.matches || [])
    .map(fdNorm)
    .filter((x) => new Date(x.date) >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 60);

  return {
    events,
    count: events.length,
    message: events.length
      ? null
      : "No upcoming fixtures found.",
    source: "football-data.org",
    updated: new Date().toISOString()
  };
}

/* =========================================================
   BBC NEWS
   ========================================================= */

function dec(text = "") {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function xv(xml, tag) {
  const match = xml.match(
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    )
  );

  return match ? dec(match[1].trim()) : "";
}

function parseNews(xml) {
  const out = [];
  const items =
    xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) || [];

  for (const item of items) {
    const title = xv(item, "title");
    const link = xv(item, "link");

    if (!title || !link) continue;

    const mediaContent = item.match(
      /<media:content[^>]+url=["']([^"']+)["']/i
    );

    const mediaThumbnail = item.match(
      /<media:thumbnail[^>]+url=["']([^"']+)["']/i
    );

    const enclosure = item.match(
      /<enclosure[^>]+url=["']([^"']+)["']/i
    );

    out.push({
      title,
      link,
      source: "BBC Sport",
      published:
        xv(item, "pubDate") ||
        xv(item, "dc:date"),
      description: xv(item, "description")
        .replace(/<[^>]+>/g, "")
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

async function news() {
  const response = await fetch(BBC, {
    headers: {
      "User-Agent":
        "YepFootball/1.0 (+https://yepfootball.com)",
      Accept:
        "application/rss+xml, application/xml, text/xml"
    },
    cf: {
      cacheTtl: 900,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw Error(`BBC RSS ${response.status}`);
  }

  const articles = parseNews(
    await response.text()
  ).slice(0, 12);

  return {
    articles,
    count: articles.length,
    source: {
      name: "BBC Sport",
      url: "https://www.bbc.com/sport/football"
    },
    updated: new Date().toISOString()
  };
}

/* =========================================================
   HEALTH
   ========================================================= */

async function health(env) {
  const started = Date.now();
  const result = {
    ok: true,
    upstreams: {},
    elapsedMs: 0,
    checked: new Date().toISOString()
  };

  try {
    await afFetch(
      "/fixtures?live=all&timezone=Europe/Paris",
      env,
      10
    );
    result.upstreams.apiFootball = "ok";
  } catch (e) {
    result.ok = false;
    result.upstreams.apiFootball = e.message;
  }

  try {
    await fdFetch("/matches", env, 30);
    result.upstreams.footballData = "ok";
  } catch (e) {
    result.ok = false;
    result.upstreams.footballData = e.message;
  }

  if (!env.LATEST_SCORES) {
    result.ok = false;
    result.upstreams.latestScores =
      "Missing KV binding LATEST_SCORES";
  } else {
    result.upstreams.latestScores = "ok";
  }

  result.elapsedMs = Date.now() - started;
  return result;
}

/* =========================================================
   REQUEST HANDLER
   ========================================================= */

async function handle(request, env) {
  const pathname = new URL(request.url).pathname;

  try {
    if (pathname === "/api/health") {
      const result = await health(env);
      return json(
        result,
        result.ok ? 200 : 502,
        30
      );
    }

    if (pathname === "/api/scores") {
      return json(
        await latest(env),
        200,
        30
      );
    }

    if (pathname === "/api/match-centre") {
      return json(
        await matchCentre(env),
        200,
        10
      );
    }

    if (pathname === "/api/fixtures") {
      return json(
        await fixtures(env),
        200,
        300
      );
    }

    if (pathname === "/api/news") {
      return json(
        await news(),
        200,
        900
      );
    }
  } catch (error) {
    return json(
      {
        error: "Football data feed unavailable",
        detail: error.message || String(error),
        checked: new Date().toISOString()
      },
      502,
      30
    );
  }

  return null;
}

/* =========================================================
   CLOUDFLARE WORKER
   ========================================================= */

export default {
  async fetch(request, env, ctx) {
    const response = await handle(
      request,
      env
    );

    if (response) return response;

    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    /*
       The Worker can be triggered hourly or more frequently.
       We only publish when Paris local time has reached 23:50.

       If the API fails, publish() throws BEFORE KV is changed,
       so the previous day's snapshot remains untouched.
    */
    const p = parisParts(new Date());

    if (
      p.hour === "23" &&
      p.minute === "50"
    ) {
      ctx.waitUntil(
        publish(env).catch((error) => {
          console.error(
            "Latest Scores publication failed:",
            error
          );
        })
      );
    }
  }
};
