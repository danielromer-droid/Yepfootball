/* =====================================================
   YEPFOOTBALL WORKER
   Version: 2026-09-28.1

   SCORES    football-data.org latest results + API-Football live
   FIXTURES  football-data.org (SCHEDULED + TIMED)
   NEWS      BBC Sport RSS
   VIDEOS    Official UEFA / Premier League / LaLiga YouTube feeds
   BRIEFING  Cloudflare Workers AI, written only from the data above

   Everything is cached in KV (LATEST_SCORES) and refreshed by the
   15-minute cron, so visitors rarely trigger upstream API calls.
===================================================== */

const VERSION = "2026-09-28.1";

// Model used for the matchday briefing. Any Workers AI text model works.
const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct";

/* =====================================================
   COMPETITIONS
===================================================== */

const COMPETITIONS = [
  { code: "CL",  name: "Champions League",  footballDataCode: "CL",  apiFootballId: 2 },
  { code: "EL",  name: "Europa League",     footballDataCode: "EL",  apiFootballId: 3 },
  { code: "ECL", name: "Conference League", footballDataCode: "ECL", apiFootballId: 848 },
  { code: "PL",  name: "Premier League",    footballDataCode: "PL",  apiFootballId: 39 },
  { code: "PD",  name: "La Liga",           footballDataCode: "PD",  apiFootballId: 140 },
  { code: "SA",  name: "Serie A",           footballDataCode: "SA",  apiFootballId: 135 },
  { code: "BL1", name: "Bundesliga",        footballDataCode: "BL1", apiFootballId: 78 },
  { code: "FL1", name: "Ligue 1",           footballDataCode: "FL1", apiFootballId: 61 }
];

const SCORE_LEAGUE_IDS = new Set(COMPETITIONS.map(c => c.apiFootballId));
const FD_CODES = COMPETITIONS.map(c => c.footballDataCode).join(",");

const FINISHED_STATUSES = ["FINISHED", "AWARDED", "FINISHED_AET", "FINISHED_PEN"];
const UPCOMING_STATUSES = ["SCHEDULED", "TIMED"];

const VIDEO_CHANNELS = [
  { category: "UEFA",           channelId: "UCyGa1YEx9ST66rYrJTGIKOw" },
  { category: "Premier League", channelId: "UCSZbXT5TLLW_i-5W8FZBfRA" },
  { category: "LaLiga",         channelId: "UCWCl6G7i9JcJ6xWmYw6JxqA" }
];

/* Cache lifetimes (seconds) for KV-backed data. */
const TTL = {
  scores: 90,
  fixtures: 15 * 60,
  news: 15 * 60,
  videos: 30 * 60,
  briefing: 6 * 60 * 60
};

/* =====================================================
   RESPONSE HELPERS
===================================================== */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data, status = 200, maxAge = 60) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${maxAge}`,
      ...CORS
    }
  });
}

/* =====================================================
   DATE / TEXT HELPERS
===================================================== */

const isoDate = date => date.toISOString().slice(0, 10);

function addDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function cleanText(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function xmlValue(block, tag) {
  const match = block.match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i")
  );
  return match ? cleanText(match[1]) : "";
}

function xmlAttr(block, tag, attr) {
  const match = block.match(
    new RegExp(`<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`, "i")
  );
  return match ? match[1] : "";
}

function toISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toISOString();
}

/* =====================================================
   KV CACHE
   Serves fresh cache; rebuilds when stale; falls back to
   stale data (flagged) if the upstream source fails.
===================================================== */

async function cached(env, key, ttl, builder, { force = false } = {}) {
  const kv = env.LATEST_SCORES;
  let hit = null;

  if (kv) {
    try {
      hit = await kv.get(key, "json");
    } catch (error) {
      console.error(`KV read ${key}:`, error);
    }
  }

  const age = hit?.updated ? (Date.now() - Date.parse(hit.updated)) / 1000 : Infinity;

  if (!force && hit && age < ttl) {
    return { ...hit, cache: "hit" };
  }

  const fresh = await builder(env);

  if (fresh?.ok) {
    if (kv) {
      try {
        await kv.put(key, JSON.stringify(fresh));
      } catch (error) {
        console.error(`KV write ${key}:`, error);
      }
    }
    return { ...fresh, cache: "miss" };
  }

  if (hit) {
    return { ...hit, cache: "stale", stale: true };
  }

  return fresh;
}

/* =====================================================
   UPSTREAM APIS
===================================================== */

async function footballDataFetch(env, path) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error("Missing FOOTBALL_DATA_TOKEN");
  }

  const response = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "User-Agent": "YepFootball/2026"
    },
    cf: { cacheTtl: 300, cacheEverything: true }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`football-data.org ${response.status}: ${text.slice(0, 300)}`);
  }

  return JSON.parse(text);
}

async function apiFootballFetch(env, path) {
  if (!env.API_FOOTBALL_KEY) return null;

  const response = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
    cf: { cacheTtl: 60, cacheEverything: true }
  });

  return response.ok ? response.json() : null;
}

/* =====================================================
   MATCH NORMALISERS
===================================================== */

function normalizeFootballDataMatch(match) {
  const competition = COMPETITIONS.find(c => c.footballDataCode === match.competition?.code);
  const status = match.status || "SCHEDULED";

  const team = t => ({
    id: t?.id ?? null,
    name: t?.name || "",
    shortName: t?.shortName || t?.name || "",
    crest: t?.crest || ""
  });

  return {
    id: match.id,
    date: toISO(match.utcDate),
    timestamp: match.utcDate ? Math.floor(new Date(match.utcDate).getTime() / 1000) : null,
    status,
    statusLong: status,
    minute: null,
    league: competition?.name || match.competition?.name || "",
    leagueCode: competition?.code || match.competition?.code || "",
    leagueId: competition?.apiFootballId ?? null,
    homeTeam: team(match.homeTeam),
    awayTeam: team(match.awayTeam),
    homeScore: match.score?.fullTime?.home ?? null,
    awayScore: match.score?.fullTime?.away ?? null
  };
}

function normalizeApiFootballLive(item) {
  const team = t => ({
    id: t?.id ?? null,
    name: t?.name || "",
    shortName: t?.name || "",
    crest: t?.logo || ""
  });

  return {
    id: item.fixture?.id,
    date: item.fixture?.date,
    timestamp: item.fixture?.timestamp,
    status: item.fixture?.status?.short || "LIVE",
    statusLong: item.fixture?.status?.long || "Live",
    minute: item.fixture?.status?.elapsed ?? null,
    league: item.league?.name || "",
    leagueCode: COMPETITIONS.find(c => c.apiFootballId === item.league?.id)?.code || "",
    leagueId: item.league?.id ?? null,
    homeTeam: team(item.teams?.home),
    awayTeam: team(item.teams?.away),
    homeScore: item.goals?.home ?? null,
    awayScore: item.goals?.away ?? null
  };
}

const dedupe = matches =>
  Array.from(new Map(matches.map(m => [`${m.leagueCode}-${m.id}`, m])).values());

/* =====================================================
   SCORES
===================================================== */

async function buildScores(env) {
  const now = new Date();
  const today = isoDate(now);
  const yesterday = isoDate(addDays(now, -1));

  let matches = [];
  let source = "football-data.org";
  let upstreamOk = true;

  try {
    for (let offset = 0; offset < 31; offset += 10) {
      const from = isoDate(addDays(now, -(offset + 9)));
      const to = isoDate(addDays(now, -offset));
      const data = await footballDataFetch(
        env,
        `/matches?dateFrom=${from}&dateTo=${to}&competitions=${encodeURIComponent(FD_CODES)}`
      );
      if (Array.isArray(data.matches)) {
        matches.push(...data.matches.map(normalizeFootballDataMatch));
      }
    }
  } catch (error) {
    upstreamOk = false;
    source = "football-data.org unavailable";
    console.error("Scores error:", error);
  }

  const finished = dedupe(
    matches.filter(m => SCORE_LEAGUE_IDS.has(m.leagueId) && FINISHED_STATUSES.includes(m.status))
  );

  // Most recent matchday per competition.
  const latestDateByLeague = {};
  for (const match of finished) {
    const date = (match.date || "").slice(0, 10);
    if (date && (!latestDateByLeague[match.leagueCode] || date > latestDateByLeague[match.leagueCode])) {
      latestDateByLeague[match.leagueCode] = date;
    }
  }

  const latestAvailable = [];
  for (const competition of COMPETITIONS) {
    const date = latestDateByLeague[competition.code];
    if (!date) continue;
    latestAvailable.push(
      ...finished
        .filter(m => m.leagueCode === competition.code && (m.date || "").slice(0, 10) === date)
        .sort((a, b) => new Date(b.date) - new Date(a.date))
    );
  }

  let live = [];
  try {
    const liveData = await apiFootballFetch(env, "/fixtures?live=all");
    if (liveData?.response) {
      live = liveData.response
        .filter(item => SCORE_LEAGUE_IDS.has(item.league?.id))
        .map(normalizeApiFootballLive);
    }
  } catch (error) {
    console.error("Live scores error:", error);
  }

  const onDay = day => finished.filter(m => (m.date || "").slice(0, 10) === day);

  return {
    ok: upstreamOk || live.length > 0,
    source,
    yesterday,
    today,
    events: latestAvailable,
    live,
    finished: latestAvailable,
    upcoming: [],
    yesterdayEvents: onDay(yesterday),
    todayEvents: onDay(today),
    count: latestAvailable.length,
    liveCount: live.length,
    latestAvailable,
    latestDateByLeague,
    scoreWindow: "latest-available",
    updated: new Date().toISOString()
  };
}

/* =====================================================
   FIXTURES
   Note: football-data.org marks matches with a confirmed
   kickoff time as TIMED, so both statuses are included.
===================================================== */

async function buildFixtures(env) {
  const now = new Date();
  const fromDate = isoDate(now);
  const toDate = isoDate(addDays(now, 19));
  const fixtures = [];

  try {
    for (let offset = 0; offset < 20; offset += 10) {
      const from = isoDate(addDays(now, offset));
      const to = isoDate(addDays(now, Math.min(offset + 9, 19)));
      const data = await footballDataFetch(
        env,
        `/matches?dateFrom=${from}&dateTo=${to}&competitions=${encodeURIComponent(FD_CODES)}`
      );
      if (Array.isArray(data.matches)) {
        fixtures.push(...data.matches.map(normalizeFootballDataMatch));
      }
    }
  } catch (error) {
    console.error("Fixtures error:", error);
    return {
      ok: false,
      source: "football-data.org",
      error: error.message,
      fixtures: [],
      events: [],
      from: fromDate,
      to: toDate,
      mode: "next",
      isNextAvailable: false,
      updated: new Date().toISOString()
    };
  }

  const upcoming = dedupe(
    fixtures.filter(
      m => SCORE_LEAGUE_IDS.has(m.leagueId) && UPCOMING_STATUSES.includes(m.status)
    )
  ).sort((a, b) => new Date(a.date) - new Date(b.date));

  return {
    ok: true,
    source: "football-data.org",
    from: fromDate,
    to: toDate,
    mode: "next",
    isNextAvailable: upcoming.length > 0,
    fixtures: upcoming,
    events: upcoming,
    count: upcoming.length,
    updated: new Date().toISOString()
  };
}

/* =====================================================
   NEWS — BBC Sport RSS
===================================================== */

function parseBBCNews(xml) {
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return items
    .slice(0, 20)
    .map((item, index) => {
      const title = xmlValue(item, "title");
      const link = xmlValue(item, "link");
      const pubDate = xmlValue(item, "pubDate");

      let image =
        xmlAttr(item, "media:content", "url") ||
        xmlAttr(item, "media:thumbnail", "url") ||
        xmlAttr(item, "enclosure", "url") ||
        "";

      const htmlImage = item.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (!image && htmlImage) image = htmlImage[1];

      // BBC thumbnails come at 240px; request a sharper size.
      image = image.replace(/\/ace\/standard\/\d+\//, "/ace/standard/976/");

      return {
        id: `bbc-${index}-${pubDate}`,
        title,
        description: xmlValue(item, "description"),
        url: link,
        link,
        image,
        thumbnail: image,
        published: pubDate,
        source: "BBC Sport"
      };
    })
    .filter(a => a.title && a.url);
}

async function buildNews() {
  try {
    const response = await fetch("https://feeds.bbci.co.uk/sport/football/rss.xml", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YepFootball/1.0)" },
      cf: { cacheTtl: 900, cacheEverything: true }
    });

    if (!response.ok) throw new Error(`BBC RSS ${response.status}`);

    const articles = parseBBCNews(await response.text());

    return {
      ok: true,
      source: "BBC Sport",
      articles,
      news: articles,
      count: articles.length,
      updated: new Date().toISOString()
    };
  } catch (error) {
    console.error("BBC news error:", error);
    return {
      ok: false,
      source: "BBC Sport",
      articles: [],
      news: [],
      count: 0,
      error: error.message,
      updated: new Date().toISOString()
    };
  }
}

/* =====================================================
   VIDEOS — YouTube RSS
===================================================== */

async function fetchYouTubeRSS(channelId, category) {
  const response = await fetch(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
    {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; YepFootball/1.0)" },
      cf: { cacheTtl: 900, cacheEverything: true }
    }
  );

  if (!response.ok) throw new Error(`YouTube RSS ${response.status}`);

  const entries = (await response.text()).match(/<entry>[\s\S]*?<\/entry>/gi) || [];

  return entries
    .slice(0, 6)
    .map(entry => {
      const videoId = xmlValue(entry, "yt:videoId");
      if (!videoId) return null;

      const thumbnail =
        xmlAttr(entry, "media:thumbnail", "url") ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      const url = `https://www.youtube.com/watch?v=${videoId}`;

      return {
        id: videoId,
        videoId,
        category,
        title: xmlValue(entry, "title"),
        published: xmlValue(entry, "published"),
        updated: xmlValue(entry, "updated"),
        thumbnail,
        image: thumbnail,
        url,
        videoURL: url,
        source: category
      };
    })
    .filter(Boolean);
}

async function buildVideos() {
  const results = await Promise.allSettled(
    VIDEO_CHANNELS.map(c => fetchYouTubeRSS(c.channelId, c.category))
  );

  const videos = results
    .filter(r => r.status === "fulfilled")
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.published || 0) - new Date(a.published || 0));

  return {
    ok: videos.length > 0,
    source: "Official UEFA, Premier League and LaLiga YouTube channels",
    categories: VIDEO_CHANNELS.map(c => c.category),
    videos,
    count: videos.length,
    updated: new Date().toISOString()
  };
}

/* =====================================================
   AI MATCHDAY BRIEFING
   The model only sees real results, fixtures and headlines,
   and is told not to add anything else. If AI is unavailable,
   a plain summary is built from the same facts.
===================================================== */

const matchLine = m =>
  `${m.league}: ${m.homeTeam.shortName || m.homeTeam.name} ${m.homeScore ?? "?"}-${m.awayScore ?? "?"} ${m.awayTeam.shortName || m.awayTeam.name}`;

function briefingFacts(scores, fixtures, news) {
  const live = (scores?.live || []).slice(0, 8).map(m => `${matchLine(m)} (live, ${m.minute ?? "?"}')`);

  const results = (scores?.latestAvailable || [])
    .slice()
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 14)
    .map(m => `${matchLine(m)} (${(m.date || "").slice(0, 10)})`);

  const next = (fixtures?.fixtures || [])
    .slice(0, 8)
    .map(m => `${m.league}: ${m.homeTeam.shortName} v ${m.awayTeam.shortName} (${(m.date || "").slice(0, 16).replace("T", " ")} UTC)`);

  const headlines = (news?.articles || []).slice(0, 8).map(a => a.title);

  return { live, results, next, headlines };
}

function fallbackBriefing(facts) {
  const biggest = (scores => {
    let best = null;
    for (const line of scores) {
      const m = line.match(/ (\d+)-(\d+) /);
      if (!m) continue;
      const goals = Number(m[1]) + Number(m[2]);
      if (!best || goals > best.goals) best = { line, goals };
    }
    return best;
  })(facts.results);

  return {
    headline: facts.live.length
      ? `${facts.live.length} ${facts.live.length === 1 ? "match" : "matches"} in play right now`
      : "The latest from Europe's top leagues",
    summary: biggest
      ? `Highest-scoring recent result: ${biggest.line.replace(/ \(.*\)$/, "")}. Full results, upcoming fixtures and the day's headlines are below.`
      : "Full results, upcoming fixtures and the day's headlines are below.",
    points: facts.headlines.slice(0, 3)
  };
}

function parseAIJson(text) {
  if (!text) return null;
  if (typeof text === "object") return text;
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

function validBriefing(b) {
  return (
    b &&
    typeof b.headline === "string" &&
    b.headline.trim() &&
    typeof b.summary === "string" &&
    b.summary.trim()
  );
}

async function buildBriefing(env, { force = false } = {}) {
  const [scores, fixtures, news] = await Promise.all([
    cached(env, "scores", TTL.scores, buildScores),
    cached(env, "fixtures", TTL.fixtures, buildFixtures),
    cached(env, "news", TTL.news, buildNews)
  ]);

  const facts = briefingFacts(scores, fixtures, news);
  const signature = JSON.stringify([facts.live, facts.results.slice(0, 8), facts.headlines.slice(0, 4)]);

  // Reuse the previous briefing if nothing important has changed.
  if (!force && env.LATEST_SCORES) {
    const previous = await env.LATEST_SCORES.get("briefing", "json").catch(() => null);
    if (previous?.signature === signature) return previous;
  }

  let briefing = null;
  let ai = false;

  if (env.AI && (facts.results.length || facts.headlines.length || facts.live.length)) {
    try {
      const result = await env.AI.run(AI_MODEL, {
        max_tokens: 450,
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are the matchday editor for YepFootball, a European football website. " +
              "Write ONLY from the facts provided. Never invent scores, goalscorers, injuries, quotes, " +
              "transfers or standings. If a detail is not in the facts, leave it out. " +
              "Use British English and a lively but factual tone. " +
              'Reply with JSON only, no markdown: {"headline": string (max 12 words), ' +
              '"summary": string (2-3 sentences, max 70 words), "points": [3 strings, max 20 words each]}'
          },
          {
            role: "user",
            content:
              `Today is ${isoDate(new Date())}.\n\n` +
              `LIVE NOW:\n${facts.live.join("\n") || "none"}\n\n` +
              `LATEST RESULTS:\n${facts.results.join("\n") || "none"}\n\n` +
              `NEXT FIXTURES:\n${facts.next.join("\n") || "none"}\n\n` +
              `BBC SPORT HEADLINES:\n${facts.headlines.join("\n") || "none"}`
          }
        ]
      });

      const parsed = parseAIJson(result?.response ?? result);
      if (validBriefing(parsed)) {
        briefing = {
          headline: parsed.headline.trim(),
          summary: parsed.summary.trim(),
          points: (Array.isArray(parsed.points) ? parsed.points : [])
            .filter(p => typeof p === "string" && p.trim())
            .slice(0, 3)
        };
        ai = true;
      }
    } catch (error) {
      console.error("AI briefing error:", error);
    }
  }

  if (!briefing) briefing = fallbackBriefing(facts);

  const payload = {
    ok: true,
    ai,
    model: ai ? AI_MODEL : null,
    ...briefing,
    basedOn: {
      live: facts.live.length,
      results: facts.results.length,
      headlines: facts.headlines.length
    },
    signature,
    updated: new Date().toISOString()
  };

  if (env.LATEST_SCORES) {
    await env.LATEST_SCORES.put("briefing", JSON.stringify(payload)).catch(e =>
      console.error("KV write briefing:", e)
    );
  }

  return payload;
}

async function briefing(env) {
  // Serve the cached briefing if it is recent; otherwise rebuild.
  if (env.LATEST_SCORES) {
    const hit = await env.LATEST_SCORES.get("briefing", "json").catch(() => null);
    if (hit?.updated && Date.now() - Date.parse(hit.updated) < TTL.briefing * 1000) {
      return hit;
    }
  }
  return buildBriefing(env);
}

/* =====================================================
   HEALTH
===================================================== */

function health(env) {
  return {
    ok: true,
    service: "YepFootball API",
    version: VERSION,
    date: isoDate(new Date()),
    bindings: {
      LATEST_SCORES: !!env.LATEST_SCORES,
      FOOTBALL_DATA_TOKEN: !!env.FOOTBALL_DATA_TOKEN,
      API_FOOTBALL_KEY: !!env.API_FOOTBALL_KEY,
      ASSETS: !!env.ASSETS,
      AI: !!env.AI
    },
    aiModel: AI_MODEL,
    scoreSource: "football-data.org (latest results) + API-Football (live)",
    fixtureSource: "football-data.org",
    videoSource: "Official UEFA, Premier League and LaLiga YouTube channels",
    competitions: COMPETITIONS,
    endpoints: [
      "/api/scores",
      "/api/fixtures",
      "/api/fixtures-v2",
      "/api/fixture-test",
      "/api/news",
      "/api/videos",
      "/api/briefing",
      "/api/match-centre",
      "/api/health"
    ],
    updated: new Date().toISOString()
  };
}

/* =====================================================
   ROUTER
===================================================== */

const ROUTES = {
  "/api/health":       env => [health(env), 30],
  "/api/scores":       async env => [await cached(env, "scores", TTL.scores, buildScores), 60],
  "/api/match-centre": async env => [await cached(env, "scores", TTL.scores, buildScores), 60],
  "/api/fixtures-v2":  async env => [await cached(env, "fixtures", TTL.fixtures, buildFixtures), 300],
  "/api/fixtures":     async env => [await cached(env, "fixtures", TTL.fixtures, buildFixtures), 300],
  "/api/fixture-test": async env => [await cached(env, "fixtures", TTL.fixtures, buildFixtures), 300],
  "/api/news":         async env => [await cached(env, "news", TTL.news, buildNews), 300],
  "/api/videos":       async env => [await cached(env, "videos", TTL.videos, buildVideos), 600],
  "/api/briefing":     async env => [await briefing(env), 300]
};

async function handle(request, env) {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const route = ROUTES[pathname];

  if (route) {
    try {
      const [data, maxAge] = await route(env);
      return json(data, data?.ok === false ? 502 : 200, maxAge);
    } catch (error) {
      console.error(`${pathname}:`, error);
      return json({ ok: false, error: error.message }, 500, 0);
    }
  }

  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS }
  });
}

/* =====================================================
   CRON — refresh every 15 minutes (see wrangler.jsonc)
===================================================== */

async function refreshAll(env) {
  const force = { force: true };
  await Promise.allSettled([
    cached(env, "scores", TTL.scores, buildScores, force),
    cached(env, "fixtures", TTL.fixtures, buildFixtures, force),
    cached(env, "news", TTL.news, buildNews, force),
    cached(env, "videos", TTL.videos, buildVideos, force)
  ]);
  // Rebuilds only if the underlying results or headlines changed.
  await buildBriefing(env);
}

export default {
  fetch: handle,
  scheduled(event, env, ctx) {
    ctx.waitUntil(refreshAll(env));
  }
};
