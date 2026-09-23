/* =====================================================
   YEPFOOTBALL WORKER
   Version: 2026-09-23.6

   Scores:
   football-data.org latest completed results
   + API-Football live fallback

   Fixtures:
   football-data.org

   News:
   BBC Sport RSS

   Videos:
   Official UEFA / Premier League / LaLiga
   YouTube RSS feeds
===================================================== */

const VERSION = "2026-09-23.6";


/* =====================================================
   COMPETITIONS
===================================================== */

const COMPETITIONS = [
  {
    code: "CL",
    name: "Champions League",
    footballDataCode: "CL",
    apiFootballId: 2
  },
  {
    code: "EL",
    name: "Europa League",
    footballDataCode: "EL",
    apiFootballId: 3
  },
  {
    code: "ECL",
    name: "Conference League",
    footballDataCode: "ECL",
    apiFootballId: 848
  },
  {
    code: "PL",
    name: "Premier League",
    footballDataCode: "PL",
    apiFootballId: 39
  },
  {
    code: "PD",
    name: "La Liga",
    footballDataCode: "PD",
    apiFootballId: 140
  },
  {
    code: "SA",
    name: "Serie A",
    footballDataCode: "SA",
    apiFootballId: 135
  },
  {
    code: "BL1",
    name: "Bundesliga",
    footballDataCode: "BL1",
    apiFootballId: 78
  },
  {
    code: "FL1",
    name: "Ligue 1",
    footballDataCode: "FL1",
    apiFootballId: 61
  }
];


/* =====================================================
   ALLOWED API-FOOTBALL LEAGUE IDS
===================================================== */

const SCORE_LEAGUE_IDS = new Set(
  COMPETITIONS.map(c => c.apiFootballId)
);


/* =====================================================
   FOOTBALL-DATA.ORG COMPETITION CODES
===================================================== */

const FD_CODES = COMPETITIONS
  .map(c => c.footballDataCode)
  .join(",");


/* =====================================================
   OFFICIAL VIDEO CHANNELS
===================================================== */

const VIDEO_CHANNELS = [
  {
    category: "UEFA",
    handle: "@UEFA"
  },
  {
    category: "Premier League",
    handle: "@premierleague"
  },
  {
    category: "LaLiga",
    handle: "@LaLiga"
  }
];


/* =====================================================
   JSON HEADERS
===================================================== */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=300"
};


/* =====================================================
   JSON RESPONSE
===================================================== */

function json(data, status = 200, extra = {}) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        ...JSON_HEADERS,
        ...extra
      }
    }
  );
}


/* =====================================================
   CORS
===================================================== */

function corsHeaders() {

  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}


function withCors(response) {

  const headers =
    new Headers(response.headers);

  Object.entries(corsHeaders())
    .forEach(([key, value]) => {
      headers.set(key, value);
    });

  return new Response(
    response.body,
    {
      status: response.status,
      headers
    }
  );
}


/* =====================================================
   DATE HELPERS
===================================================== */

function isoDate(date) {

  return date
    .toISOString()
    .slice(0, 10);
}


function addDays(date, days) {

  const d =
    new Date(date);

  d.setUTCDate(
    d.getUTCDate() + days
  );

  return d;
}


/* =====================================================
   XML / TEXT HELPERS
===================================================== */

function cleanText(value = "") {

  return String(value)

    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )

    .replace(
      /<[^>]*>/g,
      " "
    )

    .replace(
      /&amp;/g,
      "&"
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
      /&quot;/g,
      '"'
    )

    .replace(
      /&#39;|&#x27;/g,
      "'"
    )

    .replace(
      /\s+/g,
      " "
    )

    .trim();
}


function xmlValue(block, tag) {

  const regex =
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );

  const match =
    block.match(regex);

  return match
    ? cleanText(match[1])
    : "";
}


function xmlAttr(block, tag, attr) {

  const regex =
    new RegExp(
      `<${tag}\\b[^>]*\\b${attr}=["']([^"']+)["']`,
      "i"
    );

  const match =
    block.match(regex);

  return match
    ? match[1]
    : "";
}


/* =====================================================
   DATE NORMALISATION
===================================================== */

function formatDateTime(value) {

  if (!value) {
    return null;
  }

  const d =
    new Date(value);

  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return value;
  }

  return d.toISOString();
}


/* =====================================================
   FOOTBALL-DATA.ORG MATCH NORMALISATION
===================================================== */

function normalizeFootballDataMatch(match) {

  const competition =
    COMPETITIONS.find(
      c =>
        c.footballDataCode ===
        match.competition?.code
    );

  const status =
    match.status ||
    "SCHEDULED";

  const homeScore =
    match.score?.fullTime?.home ??
    null;

  const awayScore =
    match.score?.fullTime?.away ??
    null;

  return {

    id: match.id,

    date:
      formatDateTime(
        match.utcDate
      ),

    timestamp:
      match.utcDate
        ? Math.floor(
            new Date(
              match.utcDate
            ).getTime() / 1000
          )
        : null,

    status,

    statusLong:
      status,

    league:
      competition?.name ||
      match.competition?.name ||
      "",

    leagueCode:
      competition?.code ||
      match.competition?.code ||
      "",

    leagueId:
      competition?.apiFootballId ??
      null,

    homeTeam: {

      id:
        match.homeTeam?.id ??
        null,

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
        match.awayTeam?.id ??
        null,

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

    homeScore,

    awayScore
  };
}


/* =====================================================
   FOOTBALL-DATA.ORG REQUEST
===================================================== */

async function footballDataFetch(
  env,
  path
) {

  if (!env.FOOTBALL_DATA_TOKEN) {

    throw new Error(
      "Missing FOOTBALL_DATA_TOKEN"
    );
  }

  const response =
    await fetch(
      `https://api.football-data.org/v4${path}`,
      {
        headers: {
          "X-Auth-Token":
            env.FOOTBALL_DATA_TOKEN,

          "User-Agent":
            "YepFootball/2026"
        },

        cf: {
          cacheTtl: 300,
          cacheEverything: true
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


/* =====================================================
   API-FOOTBALL REQUEST
===================================================== */

async function apiFootballFetch(
  env,
  path
) {

  if (!env.API_FOOTBALL_KEY) {
    return null;
  }


  const response =
    await fetch(
      `https://v3.football.api-sports.io${path}`,
      {
        headers: {
          "x-apisports-key":
            env.API_FOOTBALL_KEY
        },

        cf: {
          cacheTtl: 60,
          cacheEverything: true
        }
      }
    );


  if (!response.ok) {
    return null;
  }


  return response.json();
}


/* =====================================================
   SCORES
===================================================== */

async function scores(
  request,
  env
) {

  const now =
    new Date();

  const today =
    isoDate(now);

  const yesterday =
    isoDate(
      addDays(now, -1)
    );


  let matches = [];

  let source =
    "football-data.org";


  try {

    /*
      football-data.org allows
      a maximum 10-day period.

      Search backwards through
      several 10-day windows.
    */

    for (
      let offset = 0;
      offset < 31;
      offset += 10
    ) {

      const from =
        isoDate(
          addDays(
            now,
            -(offset + 9)
          )
        );

      const to =
        isoDate(
          addDays(
            now,
            -offset
          )
        );


      const data =
        await footballDataFetch(
          env,
          `/matches?dateFrom=${from}&dateTo=${to}&competitions=${encodeURIComponent(FD_CODES)}`
        );


      if (
        Array.isArray(
          data.matches
        )
      ) {

        matches.push(
          ...data.matches.map(
            normalizeFootballDataMatch
          )
        );
      }
    }

  } catch (error) {

    source =
      "football-data.org unavailable";

    console.error(
      "Scores error:",
      error
    );
  }


  /*
    Only keep the leagues
    configured above.
  */

  matches =
    matches.filter(
      match =>
        SCORE_LEAGUE_IDS.has(
          match.leagueId
        )
    );


  /*
    Completed matches only.
  */

  const finished =
    matches.filter(
      match =>
        [
          "FINISHED",
          "AWARDED",
          "FINISHED_AET",
          "FINISHED_PEN"
        ].includes(
          match.status
        )
    );


  /*
    Remove duplicates.
  */

  const unique =
    Array.from(
      new Map(
        finished.map(
          match => [
            `${match.leagueCode}-${match.id}`,
            match
          ]
        )
      ).values()
    );


  /*
    Find latest completed
    date for every league.
  */

  const latestDateByLeague = {};


  for (
    const match of unique
  ) {

    const date =
      (
        match.date ||
        ""
      ).slice(0, 10);


    if (!date) {
      continue;
    }


    if (
      !latestDateByLeague[
        match.leagueCode
      ] ||
      date >
        latestDateByLeague[
          match.leagueCode
        ]
    ) {

      latestDateByLeague[
        match.leagueCode
      ] = date;
    }
  }


  /*
    Get latest results
    for every competition.
  */

  const latestAvailable = [];


  for (
    const competition
    of COMPETITIONS
  ) {

    const date =
      latestDateByLeague[
        competition.code
      ];


    if (!date) {
      continue;
    }


    const leagueMatches =
      unique

        .filter(
          match =>
            match.leagueCode ===
              competition.code &&
            (
              match.date ||
              ""
            ).slice(0, 10) === date
        )

        .sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );


    latestAvailable.push(
      ...leagueMatches
    );
  }


  /*
    LIVE MATCHES
    API-Football fallback.
  */

  let live = [];


  try {

    const liveData =
      await apiFootballFetch(
        env,
        "/fixtures?live=all"
      );


    if (
      liveData?.response
    ) {

      live =
        liveData.response

          .filter(
            item =>
              SCORE_LEAGUE_IDS.has(
                item.league?.id
              )
          )

          .map(
            item => ({

              id:
                item.fixture?.id,

              date:
                item.fixture?.date,

              timestamp:
                item.fixture?.timestamp,

              status:
                item.fixture?.status?.short ||
                "LIVE",

              statusLong:
                item.fixture?.status?.long ||
                "Live",

              league:
                item.league?.name ||
                "",

              leagueCode:
                COMPETITIONS.find(
                  c =>
                    c.apiFootballId ===
                    item.league?.id
                )?.code ||
                "",

              leagueId:
                item.league?.id ??
                null,

              homeTeam: {

                id:
                  item.teams?.home?.id ??
                  null,

                name:
                  item.teams?.home?.name ||
                  "",

                shortName:
                  item.teams?.home?.name ||
                  "",

                crest:
                  item.teams?.home?.logo ||
                  ""
              },

              awayTeam: {

                id:
                  item.teams?.away?.id ??
                  null,

                name:
                  item.teams?.away?.name ||
                  "",

                shortName:
                  item.teams?.away?.name ||
                  "",

                crest:
                  item.teams?.away?.logo ||
                  ""
              },

              homeScore:
                item.goals?.home ??
                null,

              awayScore:
                item.goals?.away ??
                null
            })
          );
    }

  } catch (error) {

    console.error(
      "Live scores error:",
      error
    );
  }


  const todayEvents =
    unique.filter(
      match =>
        (
          match.date ||
          ""
        ).slice(0, 10) === today
    );


  const yesterdayEvents =
    unique.filter(
      match =>
        (
          match.date ||
          ""
        ).slice(0, 10) === yesterday
    );


  return json({

    ok: true,

    source,

    yesterday,

    today,

    events:
      latestAvailable,

    live,

    finished:
      latestAvailable,

    upcoming: [],

    yesterdayEvents,

    todayEvents,

    count:
      latestAvailable.length,

    liveCount:
      live.length,

    latestAvailable,

    latestDateByLeague,

    scoreWindow:
      "latest-available",

    updated:
      new Date().toISOString()
  });
}


/* =====================================================
   FIXTURES
===================================================== */

async function fixturesV2(
  request,
  env
) {

  const now =
    new Date();

  const fromDate =
    isoDate(now);

  const toDate =
    isoDate(
      addDays(now, 19)
    );


  let fixtures = [];


  try {

    /*
      Split into 10-day windows.
    */

    for (
      let offset = 0;
      offset < 20;
      offset += 10
    ) {

      const from =
        isoDate(
          addDays(
            now,
            offset
          )
        );

      const to =
        isoDate(
          addDays(
            now,
            Math.min(
              offset + 9,
              19
            )
          )
        );


      const data =
        await footballDataFetch(
          env,
          `/matches?dateFrom=${from}&dateTo=${to}&competitions=${encodeURIComponent(FD_CODES)}&status=SCHEDULED`
        );


      if (
        Array.isArray(
          data.matches
        )
      ) {

        fixtures.push(
          ...data.matches.map(
            normalizeFootballDataMatch
          )
        );
      }
    }

  } catch (error) {

    console.error(
      "Fixtures error:",
      error
    );


    return json(
      {

        ok: false,

        source:
          "football-data.org",

        error:
          error.message,

        fixtures: [],

        events: [],

        from:
          fromDate,

        to:
          toDate,

        mode:
          "next",

        isNextAvailable:
          false

      },
      502
    );
  }


  /*
    Filter configured leagues
    and remove duplicates.
  */

  fixtures =
    Array.from(
      new Map(

        fixtures

          .filter(
            match =>
              SCORE_LEAGUE_IDS.has(
                match.leagueId
              )
          )

          .map(
            match => [
              `${match.leagueCode}-${match.id}`,
              match
            ]
          )

      ).values()
    );


  /*
    Sort chronologically.
  */

  fixtures.sort(
    (a, b) =>
      new Date(a.date) -
      new Date(b.date)
  );


  return json({

    ok: true,

    source:
      "football-data.org",

    from:
      fromDate,

    to:
      toDate,

    mode:
      "next",

    isNextAvailable:
      fixtures.length > 0,

    fixtures,

    events:
      fixtures,

    count:
      fixtures.length,

    updated:
      new Date().toISOString()
  });
}


/* =====================================================
   BBC NEWS
===================================================== */

function parseBBCNews(xml) {

  const items =
    xml.match(
      /<item\b[\s\S]*?<\/item>/gi
    ) || [];


  return items

    .slice(0, 20)

    .map(
      (item, index) => {

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


        let image =
          xmlAttr(
            item,
            "media:content",
            "url"
          ) ||

          xmlAttr(
            item,
            "media:thumbnail",
            "url"
          ) ||

          xmlAttr(
            item,
            "enclosure",
            "url"
          ) ||

          "";


        /*
          BBC sometimes places
          the image inside HTML.
        */

        const htmlImage =
          item.match(
            /<img[^>]+src=["']([^"']+)["']/i
          );


        if (
          !image &&
          htmlImage
        ) {

          image =
            htmlImage[1];
        }


        return {

          id:
            `bbc-${index}-${pubDate}`,

          title,

          description,

          url:
            link,

          link,

          image,

          thumbnail:
            image,

          published:
            pubDate,

          source:
            "BBC Sport"
        };
      }
    )

    .filter(
      article =>
        article.title &&
        article.url
    );
}


/* =====================================================
   NEWS ENDPOINT
===================================================== */

async function news(
  request,
  env
) {

  const rssUrl =
    "https://feeds.bbci.co.uk/sport/football/rss.xml";


  try {

    const response =
      await fetch(
        rssUrl,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (compatible; YepFootball/1.0)"
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


    const xml =
      await response.text();


    const articles =
      parseBBCNews(xml);


    return json({

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
    });


  } catch (error) {

    console.error(
      "BBC news error:",
      error
    );


    return json({

      ok: false,

      source:
        "BBC Sport",

      articles: [],

      news: [],

      count: 0,

      error:
        error.message,

      updated:
        new Date().toISOString()

    }, 502);
  }
}


/* =====================================================
   RESOLVE YOUTUBE CHANNEL ID
===================================================== */

async function resolveYouTubeChannelId(
  handle
) {

  const url =
    `https://www.youtube.com/${handle}`;


  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; YepFootball/1.0)"
        },

        cf: {
          cacheTtl: 86400,
          cacheEverything: true
        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `YouTube channel ${handle} returned ${response.status}`
    );
  }


  const html =
    await response.text();


  const patterns = [

    /"channelId":"(UC[a-zA-Z0-9_-]{20,})"/,

    /"externalId":"(UC[a-zA-Z0-9_-]{20,})"/,

    /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[a-zA-Z0-9_-]+)["']/i

  ];


  for (
    const pattern
    of patterns
  ) {

    const match =
      html.match(pattern);


    if (match) {

      return match[1];
    }
  }


  throw new Error(
    `Could not resolve YouTube channel ID for ${handle}`
  );
}


/* =====================================================
   FETCH YOUTUBE RSS
===================================================== */

async function fetchYouTubeRSS(
  channelId,
  category
) {

  const feedUrl =
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;


  const response =
    await fetch(
      feedUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; YepFootball/1.0)"
        },

        cf: {
          cacheTtl: 900,
          cacheEverything: true
        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `YouTube RSS ${response.status}`
    );
  }


  const xml =
    await response.text();


  const entries =
    xml.match(
      /<entry>[\s\S]*?<\/entry>/gi
    ) || [];


  return entries

    .slice(0, 4)

    .map(
      entry => {

        const videoId =
          xmlValue(
            entry,
            "yt:videoId"
          );


        const title =
          xmlValue(
            entry,
            "title"
          );


        const published =
          xmlValue(
            entry,
            "published"
          );


        const updated =
          xmlValue(
            entry,
            "updated"
          );


        if (!videoId) {
          return null;
        }


        const thumbnail =
          xmlAttr(
            entry,
            "media:thumbnail",
            "url"
          ) ||

          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;


        const videoURL =
          `https://www.youtube.com/watch?v=${videoId}`;


        return {

          id:
            videoId,

          videoId,

          category,

          title,

          published,

          updated,

          thumbnail,

          image:
            thumbnail,

          url:
            videoURL,

          videoURL,

          source:
            category
        };
      }
    )

    .filter(Boolean);
}


/* =====================================================
   VIDEOS ENDPOINT
===================================================== */

async function videos(
  request,
  env
) {

  const results =
    await Promise.allSettled(

      VIDEO_CHANNELS.map(
        async channel => {

          const channelId =
            await resolveYouTubeChannelId(
              channel.handle
            );


          return fetchYouTubeRSS(
            channelId,
            channel.category
          );
        }
      )
    );


  const allVideos =
    results

      .filter(
        result =>
          result.status ===
          "fulfilled"
      )

      .flatMap(
        result =>
          result.value
      );


  allVideos.sort(
    (a, b) =>
      new Date(
        b.published || 0
      ) -
      new Date(
        a.published || 0
      )
  );


  return json({

    ok: true,

    source:
      "Official YouTube RSS feeds",

    categories: [
      "UEFA",
      "Premier League",
      "LaLiga"
    ],

    videos:
      allVideos,

    count:
      allVideos.length,

    updated:
      new Date().toISOString()
  });
}


/* =====================================================
   HEALTH
===================================================== */

async function health(
  request,
  env
) {

  return json({

    ok: true,

    service:
      "YepFootball API",

    version:
      VERSION,

    date:
      isoDate(
        new Date()
      ),

    bindings: {

      LATEST_SCORES:
        !!env.LATEST_SCORES,

      FOOTBALL_DATA_TOKEN:
        !!env.FOOTBALL_DATA_TOKEN,

      API_FOOTBALL_KEY:
        !!env.API_FOOTBALL_KEY,

      ASSETS:
        !!env.ASSETS
    },

    scoreSource:
      "football-data.org (latest results) + API-Football (live fallback)",

    fixtureSource:
      "football-data.org",

    fixtureEndpoint:
      "/api/fixtures-v2",

    videoSource:
      "Official UEFA, Premier League and LaLiga YouTube feeds",

    competitions:
      COMPETITIONS,

    endpoints: [

      "/api/scores",

      "/api/fixtures",

      "/api/fixtures-v2",

      "/api/fixture-test",

      "/api/news",

      "/api/videos",

      "/api/match-centre",

      "/api/health"

    ],

    updated:
      new Date().toISOString()
  });
}


/* =====================================================
   MAIN WORKER HANDLER
===================================================== */

async function handle(
  request,
  env,
  ctx
) {

  const url =
    new URL(request.url);

  const path =
    url.pathname;


  /* ---------------------------------------------------
     OPTIONS / CORS
  --------------------------------------------------- */

  if (
    request.method ===
    "OPTIONS"
  ) {

    return withCors(
      new Response(
        null,
        {
          status: 204
        }
      )
    );
  }


  /* ---------------------------------------------------
     HEALTH
  --------------------------------------------------- */

  if (
    path ===
    "/api/health"
  ) {

    return withCors(
      await health(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     SCORES
  --------------------------------------------------- */

  if (
    path ===
    "/api/scores"
  ) {

    return withCors(
      await scores(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     FIXTURES V2
  --------------------------------------------------- */

  if (
    path ===
    "/api/fixtures-v2"
  ) {

    return withCors(
      await fixturesV2(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     OLD FIXTURES URL
     Keep compatibility.
  --------------------------------------------------- */

  if (
    path ===
    "/api/fixtures"
  ) {

    return withCors(
      await fixturesV2(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     FIXTURE TEST
  --------------------------------------------------- */

  if (
    path ===
    "/api/fixture-test"
  ) {

    return withCors(
      await fixturesV2(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     BBC NEWS
  --------------------------------------------------- */

  if (
    path ===
    "/api/news"
  ) {

    return withCors(
      await news(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     VIDEOS
  --------------------------------------------------- */

  if (
    path ===
    "/api/videos"
  ) {

    return withCors(
      await videos(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     MATCH CENTRE
     Keep compatibility with frontend.
  --------------------------------------------------- */

  if (
    path ===
    "/api/match-centre"
  ) {

    return withCors(
      await scores(
        request,
        env
      )
    );
  }


  /* ---------------------------------------------------
     STATIC WEBSITE ASSETS
  --------------------------------------------------- */

  if (env.ASSETS) {

    return env.ASSETS.fetch(
      request
    );
  }


  /* ---------------------------------------------------
     404
  --------------------------------------------------- */

  return withCors(

    new Response(
      "Not Found",
      {
        status: 404,

        headers: {
          "Content-Type":
            "text/plain; charset=utf-8"
        }
      }
    )

  );
}


/* =====================================================
   CLOUDFLARE WORKER ENTRY POINT
===================================================== */

export default {
  fetch: handle
};
