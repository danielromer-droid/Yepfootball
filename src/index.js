/* =====================================================
   YepFootball Worker
   Version: 2026-09-21.1

   SCORES
   - Soccerbase
   - football-data.org supplement
   - No API-Football for daily scores

   MATCH CENTRE
   - API-Football

   FIXTURES
   - Single football-data.org request
   - 7 days ahead

   NEWS
   - BBC Sport RSS
   - BBC Sport football page fallback

   FIXES
   - Soccerbase date cannot become a score
   - Correct competition boundaries
   - Fixtures uses one API request
   - BBC RSS has fallback
   - Health reports fixture/news status
===================================================== */

const VERSION = "2026-09-21.1";

const TZ = "Europe/Paris";

const SCORE_KEY = "latest_scores";
const OLD_SCORE_KEY = "yesterday_scores";

const SOCCERBASE_URL =
  "https://www.soccerbase.com/matches/results.sd";

const FOOTBALL_DATA_URL =
  "https://api.football-data.org/v4";

const API_FOOTBALL_URL =
  "https://v3.football.api-sports.io";

const BBC_RSS_URL =
  "https://feeds.bbci.co.uk/sport/football/rss.xml";

const BBC_FOOTBALL_URL =
  "https://www.bbc.com/sport/football";


/* =====================================================
   GENERAL HELPERS
===================================================== */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}


function nowISO() {
  return new Date().toISOString();
}


function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}


function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      try {
        return String.fromCharCode(Number(n));
      } catch {
        return "";
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try {
        return String.fromCharCode(
          parseInt(n, 16)
        );
      } catch {
        return "";
      }
    });
}


function normalize(value) {
  return cleanText(
    decodeHtml(value)
  )
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .trim();
}


function teamKey(value) {
  return normalize(value)
    .replace(
      /\b(fc|cf|sc|afc)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}


async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = 8000
) {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeoutMs
    );

  try {

    return await fetch(
      url,
      {
        ...options,
        signal:
          controller.signal
      }
    );

  } finally {

    clearTimeout(timer);
  }
}


/* =====================================================
   DATE
===================================================== */

function getYesterdayString() {

  const now =
    new Date();

  const local =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(now);

  const values = {};

  for (
    const item
    of local
  ) {

    if (
      item.type !==
      "literal"
    ) {

      values[item.type] =
        item.value;
    }
  }

  const todayUTC =
    new Date(
      `${values.year}-${values.month}-${values.day}T12:00:00Z`
    );

  todayUTC.setUTCDate(
    todayUTC.getUTCDate() - 1
  );

  return todayUTC
    .toISOString()
    .slice(0, 10);
}


/* =====================================================
   SOCCERBASE COMPETITIONS
===================================================== */

const SOCCERBASE_COMPETITIONS = [

  {
    names: [
      "premier league"
    ],
    league:
      "Premier League",
    leagueId:
      39,
    leagueCode:
      "PL"
  },

  {
    names: [
      "italian serie a"
    ],
    league:
      "Serie A",
    leagueId:
      135,
    leagueCode:
      "SA"
  },

  {
    names: [
      "german bundesliga"
    ],
    league:
      "Bundesliga",
    leagueId:
      78,
    leagueCode:
      "BL1"
  },

  {
    names: [
      "spanish la liga"
    ],
    league:
      "La Liga",
    leagueId:
      140,
    leagueCode:
      "PD"
  },

  {
    names: [
      "french ligue 1"
    ],
    league:
      "Ligue 1",
    leagueId:
      61,
    leagueCode:
      "FL1"
  },

  {
    names: [
      "uefa champions league",
      "champions league"
    ],
    league:
      "Champions League",
    leagueId:
      2,
    leagueCode:
      "CL"
  },

  {
    names: [
      "uefa europa league",
      "europa league"
    ],
    league:
      "Europa League",
    leagueId:
      3,
    leagueCode:
      "EL"
  },

  {
    names: [
      "uefa europa conference league",
      "europa conference league",
      "conference league"
    ],
    league:
      "Conference League",
    leagueId:
      848,
    leagueCode:
      "ECL"
  }
];


function findCompetition(
  heading
) {

  const normalizedHeading =
    normalize(
      heading
    );

  return SOCCERBASE_COMPETITIONS.find(
    competition =>
      competition.names.some(
        name =>
          normalizedHeading ===
          normalize(name)
      )
  );
}


/* =====================================================
   SOCCERBASE HELPERS
===================================================== */

function stripTags(value) {

  return decodeHtml(
    String(value || "")
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


function extractAnchors(html) {

  const anchors = [];

  const regex =
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match;

  while (
    (match =
      regex.exec(html)) !== null
  ) {

    const text =
      stripTags(
        match[2]
      );

    if (!text) {
      continue;
    }

    anchors.push({
      text,
      normalized:
        normalize(text),
      attributes:
        match[1] || ""
    });
  }

  return anchors;
}


function parseScoreText(
  value
) {

  const text =
    cleanText(value);

  const match =
    text.match(
      /^(\d{1,2})\s*-\s*(\d{1,2})$/
    );

  if (!match) {
    return null;
  }

  return {
    home:
      Number(match[1]),

    away:
      Number(match[2])
  };
}


/* =====================================================
   SOCCERBASE SCORE PARSER
===================================================== */

function parseSoccerbase(
  html,
  date
) {

  const events = [];

  const headingRegex =
    /<h2\b[^>]*>([\s\S]*?)<\/h2>/gi;

  const headings = [];

  let headingMatch;

  while (
    (headingMatch =
      headingRegex.exec(html)) !== null
  ) {

    const headingText =
      stripTags(
        headingMatch[1]
      );

    headings.push({

      position:
        headingMatch.index,

      end:
        headingRegex.lastIndex,

      heading:
        headingText,

      competition:
        findCompetition(
          headingText
        )
    });
  }


  for (
    let i = 0;
    i < headings.length;
    i++
  ) {

    const section =
      headings[i];

    if (
      !section.competition
    ) {
      continue;
    }


    const nextPosition =
      i + 1 <
      headings.length
        ? headings[i + 1].position
        : html.length;


    const sectionHtml =
      html.slice(
        section.end,
        nextPosition
      );


    const rowRegex =
      /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;


    while (
      (rowMatch =
        rowRegex.exec(
          sectionHtml
        )) !== null
    ) {

      const rowHtml =
        rowMatch[1];

      const anchors =
        extractAnchors(
          rowHtml
        );


      if (
        anchors.length < 3
      ) {
        continue;
      }


      let scoreIndex =
        -1;

      let score =
        null;


      for (
        let a = 0;
        a < anchors.length;
        a++
      ) {

        const parsed =
          parseScoreText(
            anchors[a].text
          );

        if (!parsed) {
          continue;
        }

        scoreIndex =
          a;

        score =
          parsed;

        break;
      }


      if (
        scoreIndex < 0 ||
        !score
      ) {
        continue;
      }


      if (
        scoreIndex <= 0 ||
        scoreIndex >=
          anchors.length - 1
      ) {
        continue;
      }


      const home =
        anchors[
          scoreIndex - 1
        ].text;


      const away =
        anchors[
          scoreIndex + 1
        ].text;


      if (
        !home ||
        !away
      ) {
        continue;
      }


      const homeNormalized =
        normalize(home);

      const awayNormalized =
        normalize(away);


      if (
        homeNormalized.includes(
          "football"
        ) ||
        awayNormalized.includes(
          "football"
        )
      ) {
        continue;
      }


      if (
        homeNormalized.includes(
          "results"
        ) ||
        awayNormalized.includes(
          "results"
        )
      ) {
        continue;
      }


      if (
        /\b20\d{2}\b/.test(home) ||
        /\b20\d{2}\b/.test(away)
      ) {
        continue;
      }


      events.push({

        id:
          `web-${date}-` +
          `${section.competition.leagueCode}-` +
          `${teamKey(home)}-` +
          `${teamKey(away)}`,

        date:
          `${date}T12:00:00Z`,

        status:
          "FINISHED",

        statusLong:
          "Full Time",

        minute:
          null,

        league:
          section.competition.league,

        leagueCode:
          section.competition.leagueCode,

        leagueId:
          section.competition.leagueId,

        homeTeam: {

          id:
            null,

          name:
            home,

          shortName:
            home,

          crest:
            ""
        },

        awayTeam: {

          id:
            null,

          name:
            away,

          shortName:
            away,

          crest:
            ""
        },

        score:
          score
      });
    }
  }

  return events;
}


/* =====================================================
   SOCCERBASE REQUEST
===================================================== */

async function getSoccerbaseResults(
  date
) {

  const url =
    `${SOCCERBASE_URL}?date=` +
    `${encodeURIComponent(date)}`;

  try {

    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {

            "User-Agent":
              "YepFootball/1.0",

            "Accept":
              "text/html,application/xhtml+xml"
          }
        },
        8000
      );


    if (!response.ok) {

      throw new Error(
        `Soccerbase HTTP ${response.status}`
      );
    }


    const html =
      await response.text();


    const events =
      parseSoccerbase(
        html,
        date
      );


    return {

      ok:
        true,

      events,

      message:
        null
    };

  } catch (error) {

    return {

      ok:
        false,

      events: [],

      message:
        String(error)
    };
  }
}


/* =====================================================
   FOOTBALL-DATA.ORG
===================================================== */

const FOOTBALL_DATA_COMPETITIONS = [
  "PL",
  "PD",
  "SA",
  "BL1",
  "FL1",
  "CL"
];


function footballDataHeaders(
  env
) {

  return {

    "X-Auth-Token":
      env.FOOTBALL_DATA_TOKEN ||
      "",

    "Accept":
      "application/json"
  };
}


function mapFootballDataMatch(
  match
) {

  const competition =
    match.competition ||
    {};

  const code =
    competition.code ||
    "";


  const leagueMap = {

    PL: {
      name:
        "Premier League",
      id:
        39
    },

    PD: {
      name:
        "La Liga",
      id:
        140
    },

    SA: {
      name:
        "Serie A",
      id:
        135
    },

    BL1: {
      name:
        "Bundesliga",
      id:
        78
    },

    FL1: {
      name:
        "Ligue 1",
      id:
        61
    },

    CL: {
      name:
        "Champions League",
      id:
        2
    }
  };


  const league =
    leagueMap[code] ||
    {
      name:
        competition.name ||
        "Football",

      id:
        null
    };


  const score =
    match.score ||
    {};

  const fullTime =
    score.fullTime ||
    {};


  if (
    fullTime.home == null ||
    fullTime.away == null
  ) {
    return null;
  }


  const home =
    match.homeTeam ||
    {};

  const away =
    match.awayTeam ||
    {};


  return {

    id:
      `fd-${match.id}`,

    date:
      match.utcDate ||
      `${getYesterdayString()}T12:00:00Z`,

    status:
      "FINISHED",

    statusLong:
      "Full Time",

    minute:
      null,

    league:
      league.name,

    leagueCode:
      code,

    leagueId:
      league.id,

    homeTeam: {

      id:
        home.id ??
        null,

      name:
        home.name ||
        "Home",

      shortName:
        home.shortName ||
        home.tla ||
        home.name ||
        "Home",

      crest:
        home.crest ||
        ""
    },

    awayTeam: {

      id:
        away.id ??
        null,

      name:
        away.name ||
        "Away",

      shortName:
        away.shortName ||
        away.tla ||
        away.name ||
        "Away",

      crest:
        away.crest ||
        ""
    },

    score: {

      home:
        Number(
          fullTime.home
        ),

      away:
        Number(
          fullTime.away
        )
    }
  };
}


/* =====================================================
   FOOTBALL-DATA SCORES
===================================================== */

async function getFootballDataResults(
  env,
  date
) {

  if (
    !env.FOOTBALL_DATA_TOKEN
  ) {
    return [];
  }


  const results = [];


  for (
    const competition
    of FOOTBALL_DATA_COMPETITIONS
  ) {

    try {

      const url =
        `${FOOTBALL_DATA_URL}` +
        `/competitions/${competition}` +
        `/matches?dateFrom=${date}` +
        `&dateTo=${date}`;


      const response =
        await fetchWithTimeout(
          url,
          {
            headers:
              footballDataHeaders(
                env
              )
          },
          7000
        );


      if (!response.ok) {
        continue;
      }


      const data =
        await response.json();


      for (
        const match
        of data.matches || []
      ) {

        if (
          match.status !==
            "FINISHED" &&
          match.status !==
            "AWARDED"
        ) {
          continue;
        }


        const event =
          mapFootballDataMatch(
            match
          );


        if (event) {
          results.push(
            event
          );
        }
      }

    } catch {
      /*
        Ignore one failed
        competition.
      */
    }
  }


  return results;
}


/* =====================================================
   DEDUPE
===================================================== */

function dedupeEvents(
  events
) {

  const map =
    new Map();


  for (
    const event
    of events
  ) {

    const key =
      `${event.leagueCode || event.leagueId}` +
      `|${teamKey(event.homeTeam?.name)}` +
      `|${teamKey(event.awayTeam?.name)}` +
      `|${event.score?.home}` +
      `|${event.score?.away}`;


    if (
      !map.has(key)
    ) {

      map.set(
        key,
        event
      );
    }
  }


  return Array.from(
    map.values()
  );
}


/* =====================================================
   SORT
===================================================== */

function sortEvents(
  events
) {

  return events.sort(
    (a, b) => {

      const leagueOrder = {

        PL: 1,
        PD: 2,
        SA: 3,
        BL1: 4,
        FL1: 5,
        CL: 6,
        EL: 7,
        ECL: 8
      };


      const aOrder =
        leagueOrder[
          a.leagueCode
        ] || 99;


      const bOrder =
        leagueOrder[
          b.leagueCode
        ] || 99;


      if (
        aOrder !==
        bOrder
      ) {

        return (
          aOrder -
          bOrder
        );
      }


      return String(
        a.homeTeam?.name
      ).localeCompare(
        String(
          b.homeTeam?.name
        )
      );
    }
  );
}


/* =====================================================
   SNAPSHOT
===================================================== */

async function readSnapshot(
  env
) {

  if (
    !env.LATEST_SCORES
  ) {
    return null;
  }


  try {

    const data =
      await env.LATEST_SCORES.get(
        SCORE_KEY,
        "json"
      );


    return data ||
      null;

  } catch {

    return null;
  }
}


async function writeSnapshot(
  env,
  snapshot
) {

  if (
    !env.LATEST_SCORES
  ) {
    return;
  }


  await env.LATEST_SCORES.put(
    SCORE_KEY,
    JSON.stringify(
      snapshot
    )
  );


  await env.LATEST_SCORES.put(
    OLD_SCORE_KEY,
    JSON.stringify(
      snapshot
    )
  );
}


/* =====================================================
   PUBLISH SCORES
===================================================== */

async function publishYesterday(
  env,
  force = false
) {

  const date =
    getYesterdayString();


  const existing =
    await readSnapshot(
      env
    );


  if (
    existing &&
    existing.date === date &&
    !force
  ) {

    return existing;
  }


  const soccerbase =
    await getSoccerbaseResults(
      date
    );


  let events =
    soccerbase.events ||
    [];


  const footballData =
    await getFootballDataResults(
      env,
      date
    );


  events =
    dedupeEvents([
      ...events,
      ...footballData
    ]);


  events =
    sortEvents(
      events
    );


  if (
    !events.length
  ) {

    if (existing) {
      return existing;
    }


    return {

      events: [],

      count:
        0,

      date,

      source:
        "Soccerbase + football-data.org",

      publishedAt:
        nowISO(),

      message:
        "No completed matches were retrieved."
    };
  }


  const snapshot = {

    events,

    count:
      events.length,

    date,

    source:
      "Soccerbase + football-data.org",

    publishedAt:
      nowISO(),

    message:
      null
  };


  await writeSnapshot(
    env,
    snapshot
  );


  return snapshot;
}


/* =====================================================
   FIXTURES
   SINGLE football-data.org REQUEST
===================================================== */

async function getFixtures(
  env
) {

  if (
    !env.FOOTBALL_DATA_TOKEN
  ) {

    return {

      events: [],

      count:
        0,

      source:
        "football-data.org",

      message:
        "Football-data token not configured."
    };
  }


  /*
    Today + 7 days.
  */

  const now =
    new Date();


  const future =
    new Date(
      now.getTime() +
      7 *
      24 *
      60 *
      60 *
      1000
    );


  const dateFrom =
    now
      .toISOString()
      .slice(0, 10);


  const dateTo =
    future
      .toISOString()
      .slice(0, 10);


  /*
    One request for all selected
    competitions.

    football-data.org documents
    competitions=... together with
    dateFrom/dateTo on /v4/matches.
  */

  const competitions =
    [
      "PL",
      "PD",
      "SA",
      "BL1",
      "FL1",
      "CL"
    ].join(",");


  const url =
    `${FOOTBALL_DATA_URL}` +
    `/matches?dateFrom=${dateFrom}` +
    `&dateTo=${dateTo}` +
    `&competitions=${competitions}`;


  try {

    const response =
      await fetchWithTimeout(
        url,
        {
          headers:
            footballDataHeaders(
              env
            )
        },
        9000
      );


    const responseText =
      await response.text();


    if (!response.ok) {

      return {

        events: [],

        count:
          0,

        source:
          "football-data.org",

        message:
          `football-data HTTP ${response.status}: ${responseText.slice(0, 300)}`
      };
    }


    let data;

    try {

      data =
        JSON.parse(
          responseText
        );

    } catch {

      return {

        events: [],

        count:
          0,

        source:
          "football-data.org",

        message:
          "football-data returned invalid JSON."
      };
    }


    const events =
      (data.matches || [])
        .filter(
          match =>
            [
              "SCHEDULED",
              "TIMED"
            ].includes(
              match.status
            )
        )
        .map(
          match => {

            const competition =
              match.competition ||
              {};

            const home =
              match.homeTeam ||
              {};

            const away =
              match.awayTeam ||
              {};


            return {

              id:
                `fixture-${match.id}`,

              date:
                match.utcDate,

              status:
                match.status,

              statusLong:
                "Scheduled",

              league:
                competition.name ||
                "European football",

              leagueCode:
                competition.code ||
                "",

              leagueId:
                competition.id ??
                null,

              homeTeam: {

                id:
                  home.id ??
                  null,

                name:
                  home.name ||
                  "Home",

                shortName:
                  home.shortName ||
                  home.tla ||
                  home.name ||
                  "Home",

                crest:
                  home.crest ||
                  ""
              },

              awayTeam: {

                id:
                  away.id ??
                  null,

                name:
                  away.name ||
                  "Away",

                shortName:
                  away.shortName ||
                  away.tla ||
                  away.name ||
                  "Away",

                crest:
                  away.crest ||
                  ""
              },

              score: {

                home:
                  null,

                away:
                  null
              }
            };
          }
        );


    return {

      events,

      count:
        events.length,

      source:
        "football-data.org",

      dateFrom,

      dateTo,

      message:
        events.length
          ? null
          : "No fixtures returned for this period."
    };

  } catch (error) {

    return {

      events: [],

      count:
        0,

      source:
        "football-data.org",

      message:
        `Fixtures request failed: ${String(error)}`
    };
  }
}


/* =====================================================
   BBC RSS NEWS
===================================================== */

function xmlValue(
  xml,
  tag
) {

  const regex =
    new RegExp(
      `<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`,
      "i"
    );


  const match =
    xml.match(
      regex
    );


  return match
    ? decodeHtml(
        match[1]
      ).trim()
    : "";
}


function parseBBCNews(
  xml
) {

  const articles = [];

  const itemRegex =
    /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  let match;


  while (
    (match =
      itemRegex.exec(
        xml
      )) !== null
  ) {

    const item =
      match[1];


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
      );


    if (
      !title ||
      !link
    ) {
      continue;
    }


    articles.push({

      title,

      link,

      description,

      published,

      source:
        "BBC Sport"
    });
  }


  return articles.slice(
    0,
    12
  );
}


/* =====================================================
   BBC HTML FALLBACK
===================================================== */

function parseBBCPage(
  html
) {

  const articles = [];

  const seen =
    new Set();


  /*
    Look for BBC Sport football article
    links.

    This is only a fallback if RSS
    does not work.
  */

  const regex =
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let match;


  while (
    (match =
      regex.exec(html)) !== null
  ) {

    let href =
      match[1] || "";


    let title =
      stripTags(
        match[2]
      );


    title =
      cleanText(
        title
      );


    if (
      !title ||
      title.length < 15
    ) {
      continue;
    }


    /*
      BBC article URLs.
    */

    if (
      !href.includes(
        "/sport/football/"
      )
    ) {
      continue;
    }


    /*
      Ignore generic navigation.
    */

    const lower =
      title.toLowerCase();


    if (
      lower === "football" ||
      lower === "scores & fixtures" ||
      lower === "scores and fixtures" ||
      lower === "tables" ||
      lower === "results" ||
      lower === "fixtures"
    ) {
      continue;
    }


    /*
      Convert relative BBC URLs.
    */

    if (
      href.startsWith("/")
    ) {

      href =
        `https://www.bbc.com${href}`;
    }


    if (
      !href.startsWith(
        "http"
      )
    ) {
      continue;
    }


    if (
      seen.has(href)
    ) {
      continue;
    }


    seen.add(href);


    articles.push({

      title,

      link:
        href,

      description:
        "",

      published:
        "",

      source:
        "BBC Sport"
    });


    if (
      articles.length >= 12
    ) {
      break;
    }
  }


  return articles;
}


/* =====================================================
   GET NEWS
===================================================== */

async function getNews() {

  /*
    FIRST:
    BBC RSS.
  */

  try {

    const response =
      await fetchWithTimeout(
        BBC_RSS_URL,
        {
          headers: {

            "User-Agent":
              "Mozilla/5.0 (compatible; YepFootball/1.0)",

            "Accept":
              "application/rss+xml, application/xml, text/xml, */*",

            "Accept-Language":
              "en-GB,en;q=0.9"
          }
        },
        9000
      );


    if (
      response.ok
    ) {

      const xml =
        await response.text();


      const articles =
        parseBBCNews(
          xml
        );


      if (
        articles.length
      ) {

        return {

          articles,

          source:
            "BBC Sport RSS",

          updated:
            nowISO(),

          message:
            null
        };
      }
    }

  } catch {
    /*
      Continue to BBC HTML.
    */
  }


  /*
    SECOND:
    BBC Sport football page.
  */

  try {

    const response =
      await fetchWithTimeout(
        BBC_FOOTBALL_URL,
        {
          headers: {

            "User-Agent":
              "Mozilla/5.0 (compatible; YepFootball/1.0)",

            "Accept":
              "text/html,application/xhtml+xml",

            "Accept-Language":
              "en-GB,en;q=0.9"
          }
        },
        9000
      );


    if (
      response.ok
    ) {

      const html =
        await response.text();


      const articles =
        parseBBCPage(
          html
        );


      if (
        articles.length
      ) {

        return {

          articles,

          source:
            "BBC Sport",

          updated:
            nowISO(),

          message:
            null
        };
      }
    }

  } catch {
    /*
      Continue to final error.
    */
  }


  /*
    Both BBC sources failed.
  */

  return {

    articles: [],

    source:
      "BBC Sport",

    updated:
      nowISO(),

    message:
      "BBC Sport RSS and BBC football page were unavailable."
  };
}


/* =====================================================
   API-FOOTBALL
   MATCH CENTRE ONLY
===================================================== */

async function getLiveMatches(
  env
) {

  if (
    !env.API_FOOTBALL_KEY
  ) {

    return {

      events: [],

      live: [],

      finished: [],

      upcoming: [],

      count:
        0,

      liveCount:
        0,

      message:
        "API-Football key not configured."
    };
  }


  const url =
    `${API_FOOTBALL_URL}` +
    `/fixtures?live=` +
    `39-2-3-848-140-135-78-61`;


  try {

    const response =
      await fetchWithTimeout(
        url,
        {
          headers: {

            "x-apisports-key":
              env.API_FOOTBALL_KEY
          }
        },
        7000
      );


    if (!response.ok) {

      throw new Error(
        `API-Football HTTP ${response.status}`
      );
    }


    const data =
      await response.json();


    const events =
      (data.response || [])
        .map(
          item => {

            const fixture =
              item.fixture ||
              {};

            const league =
              item.league ||
              {};

            const teams =
              item.teams ||
              {};

            const goals =
              item.goals ||
              {};

            const status =
              fixture.status ||
              {};


            return {

              id:
                fixture.id,

              date:
                fixture.date,

              status:
                status.short ||
                "LIVE",

              statusLong:
                status.long ||
                "",

              minute:
                status.elapsed ??
                null,

              league:
                league.name ||
                "Football",

              leagueCode:
                league.id != null
                  ? String(
                      league.id
                    )
                  : "",

              leagueId:
                league.id ??
                null,

              homeTeam: {

                id:
                  teams.home?.id ??
                  null,

                name:
                  teams.home?.name ||
                  "Home",

                shortName:
                  teams.home?.name ||
                  "Home",

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
                  "Away",

                shortName:
                  teams.away?.name ||
                  "Away",

                crest:
                  teams.away?.logo ||
                  ""
              },

              score: {

                home:
                  goals.home ??
                  null,

                away:
                  goals.away ??
                  null
              }
            };
          }
        );


    const live =
      events.filter(
        event =>
          [
            "1H",
            "2H",
            "ET",
            "P",
            "LIVE",
            "HT"
          ].includes(
            event.status
          )
      );


    const finished =
      events.filter(
        event =>
          [
            "FT",
            "AET",
            "PEN"
          ].includes(
            event.status
          )
      );


    const upcoming =
      events.filter(
        event =>
          [
            "NS",
            "TBD"
          ].includes(
            event.status
          )
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

      message:
        null
    };

  } catch (error) {

    return {

      events: [],

      live: [],

      finished: [],

      upcoming: [],

      count:
        0,

      liveCount:
        0,

      message:
        String(error)
    };
  }
}


/* =====================================================
   HEALTH
===================================================== */

async function health(
  env
) {

  let latestScores =
    "not configured";


  if (
    env.LATEST_SCORES
  ) {

    try {

      await env.LATEST_SCORES.get(
        SCORE_KEY
      );

      latestScores =
        "ok";

    } catch {

      latestScores =
        "error";
    }
  }


  return {

    ok:
      true,

    version:
      VERSION,

    checked:
      nowISO(),

    upstreams: {

      apiFootball:
        env.API_FOOTBALL_KEY
          ? "configured"
          : "missing",

      footballData:
        env.FOOTBALL_DATA_TOKEN
          ? "configured"
          : "missing",

      latestScores
    },

    dailyScoresSource:
      "Soccerbase + football-data.org",

    fixturesSource:
      "football-data.org",

    newsSource:
      "BBC Sport RSS + BBC Sport fallback",

    apiFootballUsedForLatestScores:
      false
  };
}


/* =====================================================
   API ROUTER
===================================================== */

async function handleAPI(
  request,
  env
) {

  const url =
    new URL(request.url);

  const path =
    url.pathname;


  if (
    path ===
    "/api/health"
  ) {

    return json(
      await health(
        env
      )
    );
  }


  if (
    path ===
    "/api/scores"
  ) {

    const force =
      url.searchParams.get(
        "refresh"
      ) === "1";


    return json(
      await publishYesterday(
        env,
        force
      )
    );
  }


  if (
    path === "/api/live" ||
    path === "/api/matches"
  ) {

    return json(
      await getLiveMatches(
        env
      )
    );
  }


  if (
    path ===
    "/api/fixtures"
  ) {

    return json(
      await getFixtures(
        env
      )
    );
  }


  if (
    path ===
    "/api/news"
  ) {

    return json(
      await getNews()
    );
  }


  return json(
    {
      ok:
        false,

      error:
        "API endpoint not found."
    },
    404
  );
}


/* =====================================================
   WORKER
===================================================== */

export default {

  async fetch(
    request,
    env,
    ctx
  ) {

    const url =
      new URL(
        request.url
      );


    if (
      url.pathname.startsWith(
        "/api/"
      )
    ) {

      return handleAPI(
        request,
        env
      );
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
      publishYesterday(
        env,
        false
      )
    );
  }
};