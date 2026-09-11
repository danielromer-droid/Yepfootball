const API = "https://api.football-data.org/v4";

const BBC_FOOTBALL_RSS =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";

const LEAGUES = {
  CL: "Champions League",
  PL: "Premier League",
  PD: "La Liga",
  SA: "Serie A",
  BL1: "Bundesliga",
  FL1: "Ligue 1"
};

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

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

function normalize(match) {
  return {
    id: String(match.id),
    date: match.utcDate,
    status: match.status,
    minute: match.minute ?? null,

    league:
      LEAGUES[match.competition?.code] ||
      match.competition?.name ||
      "",

    leagueCode: match.competition?.code || "",

    matchday: match.matchday ?? null,
    stage: match.stage ?? null,

    homeTeam: {
      id: match.homeTeam?.id,
      name: match.homeTeam?.name || "",
      shortName:
        match.homeTeam?.shortName ||
        match.homeTeam?.name ||
        "",
      crest: match.homeTeam?.crest || ""
    },

    awayTeam: {
      id: match.awayTeam?.id,
      name: match.awayTeam?.name || "",
      shortName:
        match.awayTeam?.shortName ||
        match.awayTeam?.name ||
        "",
      crest: match.awayTeam?.crest || ""
    },

    score: match.score || {}
  };
}

async function fdFetch(path, env, cacheSeconds = 60) {
  if (!env.FOOTBALL_DATA_TOKEN) {
    throw new Error(
      "Missing Cloudflare secret FOOTBALL_DATA_TOKEN"
    );
  }

  const res = await fetch(`${API}${path}`, {
    method: "GET",

    headers: {
      "X-Auth-Token": env.FOOTBALL_DATA_TOKEN,
      "Accept": "application/json"
    },

    cf: {
      cacheTtl: cacheSeconds,
      cacheEverything: true
    }
  });

  const text = await res.text();

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

async function matchesForDates(env, from, to) {
  const competitions = Object.keys(LEAGUES).join(",");

  const q = new URLSearchParams({
    competitions,
    dateFrom: from,
    dateTo: to
  });

  const data = await fdFetch(
    `/matches?${q.toString()}`,
    env,
    120
  );

  return (data.matches || []).map(normalize);
}

async function scores(env) {
  const now = new Date();
  const today = isoDate(now);

  const events = await matchesForDates(
    env,
    today,
    today
  );

  return {
    events: events.sort(
      (a, b) =>
        new Date(a.date) - new Date(b.date)
    ),

    count: events.length,

    message:
      events.length === 0
        ? "No matches scheduled today."
        : null,

    updated: new Date().toISOString()
  };
}

async function fixtures(env) {
  const now = new Date();

  const end = new Date(now);
  end.setUTCDate(
    end.getUTCDate() + 7
  );

  const events = await matchesForDates(
    env,
    isoDate(now),
    isoDate(end)
  );

  const upcoming = events
    .filter(
      e => new Date(e.date) >= now
    )
    .sort(
      (a, b) =>
        new Date(a.date) -
        new Date(b.date)
    )
    .slice(0, 60);

  return {
    events: upcoming,
    count: upcoming.length,

    message:
      upcoming.length === 0
        ? "No upcoming fixtures found."
        : null,

    updated: new Date().toISOString()
  };
}

/* -------------------------------------------------------
   BBC FOOTBALL NEWS
------------------------------------------------------- */

function decodeEntities(text = "") {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) =>
      String.fromCharCode(Number(n))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function xmlValue(xml, tag) {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = xml.match(re);

  return match
    ? decodeEntities(match[1].trim())
    : "";
}

function parseBBCNews(xml) {
  const items = [];

  const matches =
    xml.match(
      /<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi
    ) || [];

  for (const item of matches) {
    const title = xmlValue(item, "title");
    const link = xmlValue(item, "link");
    const description = xmlValue(
      item,
      "description"
    );
    const published =
      xmlValue(item, "pubDate") ||
      xmlValue(item, "dc:date");

    if (!title || !link) continue;

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
      description: description
        .replace(/<[^>]+>/g, "")
        .trim()
        .slice(0, 240),

      image
    });
  }

  return items;
}

async function news() {
  const res = await fetch(
    BBC_FOOTBALL_RSS,
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

  const xml = await res.text();

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

    count: articles.length,

    source: {
      name: "BBC Sport",
      url: "https://www.bbc.com/sport/football"
    },

    updated:
      new Date().toISOString()
  };
}

/* -------------------------------------------------------
   HEALTH CHECK
------------------------------------------------------- */

async function health(env) {
  const started = Date.now();

  try {
    const data = await fdFetch(
      "/matches",
      env,
      30
    );

    return {
      ok: true,
      upstream: "football-data.org",
      status: 200,
      matchesReturned:
        data.matches?.length || 0,
      elapsedMs:
        Date.now() - started,
      checked:
        new Date().toISOString()
    };

  } catch (error) {
    return {
      ok: false,
      upstream: "football-data.org",
      error:
        error.message ||
        String(error),

      elapsedMs:
        Date.now() - started,

      checked:
        new Date().toISOString()
    };
  }
}

/* -------------------------------------------------------
   REQUEST HANDLER
------------------------------------------------------- */

async function handle(request, env) {
  const url = new URL(request.url);

  try {

    if (
      url.pathname ===
      "/api/health"
    ) {
      const result =
        await health(env);

      return json(
        result,
        result.ok ? 200 : 502,
        30
      );
    }

    if (
      url.pathname ===
      "/api/scores"
    ) {
      return json(
        await scores(env),
        200,
        60
      );
    }

    if (
      url.pathname ===
      "/api/fixtures"
    ) {
      return json(
        await fixtures(env),
        200,
        300
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

/* -------------------------------------------------------
   CLOUDFLARE WORKER
------------------------------------------------------- */

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
