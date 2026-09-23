/* =========================================================
   YepFootball Frontend
   ========================================================= */

const LEAGUES = [

  {
    id: null,
    code: "ALL",
    name: "All"
  },

  {
    id: 2,
    code: "CL",
    name: "Champions League"
  },

  {
    id: 3,
    code: "EL",
    name: "Europa League"
  },

  {
    id: 848,
    code: "ECL",
    name: "Conference League"
  },

  {
    id: 39,
    code: "PL",
    name: "Premier League"
  },

  {
    id: 140,
    code: "PD",
    name: "La Liga"
  },

  {
    id: 135,
    code: "SA",
    name: "Serie A"
  },

  {
    id: 78,
    code: "BL1",
    name: "Bundesliga"
  },

  {
    id: 61,
    code: "FL1",
    name: "Ligue 1"
  }
];

const SCORE_LEAGUE_IDS = new Set(
  LEAGUES
    .filter(league => league.id !== null)
    .map(league => league.id)
);


let currentLeague =
  null;


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHTML(value) {

  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}


function formatDate(
  date
) {

  if (!date) {
    return "";
  }


  const d =
    new Date(date);


  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return "";
  }


  return d.toLocaleDateString(
    "en-GB",
    {
      weekday:
        "short",

      day:
        "numeric",

      month:
        "short"
    }
  );
}


function formatTime(
  date
) {

  if (!date) {
    return "";
  }


  const d =
    new Date(date);


  if (
    Number.isNaN(
      d.getTime()
    )
  ) {
    return "";
  }


  return d.toLocaleTimeString(
    "en-GB",
    {
      hour:
        "2-digit",

      minute:
        "2-digit"
    }
  );
}


function safeJSON(
  response
) {

  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}`
    );
  }

  return response.json();
}


/* =========================================================
   YEAR
   ========================================================= */

const year =
  document.getElementById(
    "year"
  );

if (year) {

  year.textContent =
    new Date()
      .getFullYear();
}


/* =========================================================
   LEAGUE TABS
   ========================================================= */

function renderLeagueTabs() {

  const container =
    document.getElementById(
      "league-tabs"
    );


  if (!container) {
    return;
  }


  container.innerHTML =
    LEAGUES.map(
      league => {

        const active =
          league.id ===
          currentLeague
            ? " active"
            : "";


        return `
          <button
            class="tab${active}"
            data-league-id="${league.id ?? ""}"
          >
            ${escapeHTML(
              league.name
            )}
          </button>
        `;
      }
    ).join("");


  container
    .querySelectorAll(
      ".tab"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            const value =
              button.dataset.leagueId;


            currentLeague =
              value === ""
                ? null
                : Number(value);


            renderLeagueTabs();

            loadScores();
          }
        );
      }
    );
}


renderLeagueTabs();


/* =========================================================
   SCORE CARD
   ========================================================= */

function scoreCard(
  match
) {

  const home =
    match.homeTeam ||
    {};

  const away =
    match.awayTeam ||
    {};


  const status =
    match.status ||
    "";


  let statusText =
    status;


  if (
    status === "FT"
  ) {

    statusText =
      "FT";

  } else if (
    [
      "1H",
      "2H",
      "HT",
      "ET",
      "P"
    ].includes(status)
  ) {

    statusText =
      "LIVE";
  }


  const homeScore =
    match.homeScore ??
    "–";


  const awayScore =
    match.awayScore ??
    "–";


  return `
    <article class="score-card">

      <div class="card-top">

        <span>
          ${escapeHTML(
            match.league ||
            ""
          )}
        </span>

        <b>
          ${escapeHTML(
            statusText
          )}
        </b>

      </div>

      <div class="match-time">
        ${escapeHTML(
          formatTime(
            match.date
          )
        )}
      </div>

      <div class="teams">

        <div class="team">

          ${
            home.crest
              ? `
                <img
                  src="${escapeHTML(
                    home.crest
                  )}"
                  alt=""
                  loading="lazy"
                >
              `
              : `
                <span class="team-badge">
                  ⚽
                </span>
              `
          }

          <strong>
            ${escapeHTML(
              home.shortName ||
              home.name
            )}
          </strong>

        </div>

        <div class="score">
          ${escapeHTML(
            homeScore
          )}
          <span>–</span>
          ${escapeHTML(
            awayScore
          )}
        </div>

        <div class="team">

          ${
            away.crest
              ? `
                <img
                  src="${escapeHTML(
                    away.crest
                  )}"
                  alt=""
                  loading="lazy"
                >
              `
              : `
                <span class="team-badge">
                  ⚽
                </span>
              `
          }

          <strong>
            ${escapeHTML(
              away.shortName ||
              away.name
            )}
          </strong>

        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   LOAD SCORES
   ========================================================= */

function scoreDayHeading(
  label,
  date
) {

  let title = label;

  if (date) {
    const d = new Date(`${date}T12:00:00Z`);

    if (!Number.isNaN(d.getTime())) {
      const formatted = d.toLocaleDateString(
        "en-GB",
        {
          day: "2-digit",
          month: "short"
        }
      );

      title = `${label} · ${formatted}`;
    }
  }

  return `
    <div class="score-day-heading">
      <span>${escapeHTML(title)}</span>
    </div>
  `;
}


function renderScoreDay(
  label,
  date,
  events
) {

  let html = scoreDayHeading(label, date);

  if (!events.length) {
    html += `
      <div class="empty score-day-empty">
        No matches available in the selected competitions.
      </div>
    `;
    return html;
  }

  html += events
    .map(scoreCard)
    .join("");

  return html;
}


/* =========================================================
   LOAD SCORES
   ========================================================= */

async function loadScores() {

  const grid =
    document.getElementById("scores-grid");

  const status =
    document.getElementById("scores-status");

  if (!grid) {
    return;
  }

  try {

    const response =
      await fetch(
        "/api/scores",
        {
          cache: "no-store"
        }
      );

    const data =
      await safeJSON(response);

    if (data.ok === false) {
      throw new Error(
        data.error ||
        "Scores API returned an error"
      );
    }

    let events =
      Array.isArray(data.events)
        ? data.events
        : [];

    /* Only display YepFootball's supported competitions. */
    events = events.filter(
      match =>
        SCORE_LEAGUE_IDS.has(
          Number(match?.leagueId)
        )
    );

    /* Filter by selected competition. */
    if (currentLeague !== null) {
      events = events.filter(
        match =>
          Number(match.leagueId) ===
          currentLeague
      );
    }

async function scores(
  request,
  env
) {

  /*
     Scores behaviour:
       1. Always show live/finished/today results when available.
       2. If there are no matches today or yesterday, automatically
          fall back to the latest completed matchday available for
          each supported European competition.

     This prevents the Scores page from appearing empty during
     international breaks or other gaps in the calendar.
  */

  try {
    const today = todayUTC();
    const yesterday = addDays(today, -1);
    const recentStart = addDays(today, -14);
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = "/api/scores-v20260923-latest";
    cacheUrl.search = `?from=${recentStart}&to=${today}`;

    const cache = caches.default;
    const cached = await cache.match(cacheUrl);
    if (cached) return cached;

    const fetchRange = async (from, to) => {
      try {
        const result = await apiFootball(
          `/fixtures?from=${from}&to=${to}`,
          env
        );
        return Array.isArray(result.data?.response)
          ? result.data.response
          : [];
      } catch {
        return [];
      }
    };

    const [recentFixtures, todayFixtures] = await Promise.all([
      fetchRange(recentStart, yesterday),
      fetchRange(today, today)
    ]);

    const allFixtures = [
      ...recentFixtures,
      ...todayFixtures
    ].filter(item =>
      SCORE_LEAGUE_IDS.has(Number(item?.league?.id))
    );

    const unique = new Map();
    for (const item of allFixtures) {
      const id = String(item?.fixture?.id || "");
      if (id) unique.set(id, item);
    }

    const events = [];
    for (const item of unique.values()) {
      const competition = COMPETITIONS.find(
        c => c.apiFootballId === Number(item?.league?.id)
      ) || {
        code: String(item?.league?.id || ""),
        name: item?.league?.name || "Football",
        apiFootballId: item?.league?.id || null
      };

      const date = String(item?.fixture?.date || "");
      const scoreDate = date.slice(0, 10);
      const event = {
        ...normaliseApiFootballFixture(item, competition),
        scoreDate,
        scoreDay:
          scoreDate === yesterday
            ? "yesterday"
            : scoreDate === today
              ? "today"
              : "recent"
      };

      events.push(event);
    }

    events.sort(
      (a, b) => new Date(a.date || 0) - new Date(b.date || 0)
    );

    const live = events.filter(e =>
      ["1H", "2H", "HT", "ET", "P"].includes(e?.status)
    );

    const finished = events.filter(e =>
      ["FT", "AET", "PEN"].includes(e?.status)
    );

    const upcoming = events.filter(e =>
      ["NS", "TBD"].includes(e?.status)
    );

    const yesterdayEvents = events.filter(
      e => e.scoreDay === "yesterday"
    );
    const todayEvents = events.filter(
      e => e.scoreDay === "today"
    );

    /*
       Latest available results are calculated independently for each
       competition. We take the most recent completed date in that
       competition, then return every completed match from that date.
    */
    const latestDateByLeague = new Map();

    for (const event of finished) {
      const leagueId = Number(event?.leagueId);
      const date = event?.scoreDate;
      if (!leagueId || !date) continue;

      const previous = latestDateByLeague.get(leagueId);
      if (!previous || date > previous) {
        latestDateByLeague.set(leagueId, date);
      }
    }

    const latestAvailable = finished.filter(event =>
      event?.scoreDate ===
      latestDateByLeague.get(Number(event?.leagueId))
    );

    latestAvailable.sort((a, b) => {
      const leagueA = Number(a?.leagueId || 0);
      const leagueB = Number(b?.leagueId || 0);
      if (leagueA !== leagueB) return leagueA - leagueB;
      return new Date(a.date || 0) - new Date(b.date || 0);
    });

    const hasCurrent =
      yesterdayEvents.length > 0 ||
      todayEvents.length > 0;

    const responseData = {
      ok: true,
      yesterday,
      today,
      events,
      live,
      finished,
      upcoming,
      yesterdayEvents,
      todayEvents,
      latestAvailable,
      latestDateByLeague: Object.fromEntries(
        latestDateByLeague.entries()
      ),
      count: events.length,
      liveCount: live.length,
      updated: new Date().toISOString(),
      scoreWindow: hasCurrent
        ? "yesterday-and-today"
        : "latest-available"
    };

    const response = json(
      responseData,
      200,
      {
        "Cache-Control": "public, max-age=60, s-maxage=60"
      }
    );

    await cache.put(cacheUrl, response.clone());
    return response;

  } catch (error) {
    return json({
      ok: false,
      error: error?.message || String(error),
      updated: new Date().toISOString()
    }, 500);
  }
}


    if (status) {
      status.textContent =
        `${events.length} match${
          events.length === 1 ? "" : "es"
        }`;
    }

    const updated =
      document.getElementById("updated");

    if (updated) {
      updated.textContent =
        `Updated ${new Date().toLocaleTimeString(
          "en-GB",
          {
            hour: "2-digit",
            minute: "2-digit"
          }
        )}`;
    }

  } catch (error) {

    console.error(
      "Scores error:",
      error
    );

    grid.innerHTML = `
      <div class="empty">
        Unable to load scores.
      </div>
    `;

    if (status) {
      status.textContent = "Retrying…";
    }

    window.setTimeout(
      () => loadScores(),
      20000
    );
  }
}

/* =========================================================
   FIXTURE CARD
   ========================================================= */

function fixtureCard(
  match
) {

  const home =
    match.homeTeam ||
    {};

  const away =
    match.awayTeam ||
    {};


  return `
    <article class="fixture-card">

      <div class="fixture-top">

        <span>
          ${escapeHTML(
            match.league ||
            ""
          )}
        </span>

        <span>
          ${escapeHTML(
            formatDate(
              match.date
            )
          )}
        </span>

      </div>

      <div class="fixture-time">

        ${escapeHTML(
          formatTime(
            match.date
          )
        )}

      </div>

      <div class="fixture-teams">

        <div class="fixture-team">

          ${
            home.crest
              ? `
                <img
                  src="${escapeHTML(
                    home.crest
                  )}"
                  alt=""
                  loading="lazy"
                >
              `
              : `
                <span class="team-badge">
                  ⚽
                </span>
              `
          }

          <strong>
            ${escapeHTML(
              home.name
            )}
          </strong>

        </div>

        <div class="vs">
          VS
        </div>

        <div class="fixture-team">

          ${
            away.crest
              ? `
                <img
                  src="${escapeHTML(
                    away.crest
                  )}"
                  alt=""
                  loading="lazy"
                >
              `
              : `
                <span class="team-badge">
                  ⚽
                </span>
              `
          }

          <strong>
            ${escapeHTML(
              away.name
            )}
          </strong>

        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   LOAD FIXTURES
   ========================================================= */

async function loadFixtures() {

  const grid =
    document.getElementById(
      "fixtures-grid"
    );


  if (!grid) {
    return;
  }


  try {

    /*
      IMPORTANT:
      New endpoint deliberately bypasses
      the old /api/fixtures cache.
    */

    const response =
      await fetch(
        "/api/fixtures-v2",
        {
          cache:
            "no-store"
        }
      );


    const data =
      await safeJSON(
        response
      );


    const fixtures =
      data.fixtures ||
      data.events ||
      [];


    /*
      Optional message element.
    */

    const message =
      document.getElementById(
        "fixtures-message"
      );


    const windowElement =
      document.getElementById(
        "fixtures-window"
      );


    if (message) {

      if (
        data.message
      ) {

        message.textContent =
          data.message;

        message.style.display =
          "block";

      } else {

        message.textContent =
          "";

        message.style.display =
          "none";
      }
    }


    if (windowElement) {

      if (
        data.from &&
        data.to
      ) {

        windowElement.textContent =
          `${formatDate(
            data.from
          )} – ${formatDate(
            data.to
          )}`;

      } else {

        windowElement.textContent =
          "";
      }
    }


    if (
      fixtures.length === 0
    ) {

      grid.innerHTML =
        `
          <div class="empty">
            ${
              data.message ||
              "No upcoming fixtures found."
            }
          </div>
        `;

      return;
    }


    grid.innerHTML =
      fixtures
        .map(
          fixtureCard
        )
        .join("");


  } catch (error) {

    console.error(
      "Fixtures error:",
      error
    );


    grid.innerHTML =
      `
        <div class="empty">
          Unable to load fixtures.
        </div>
      `;
  }
}


/* =========================================================
   NEWS CARD
   ========================================================= */

function newsCard(
  article
) {

  const title =
    article.title ||
    "Football news";


  const description =
    article.description ||
    "";


  const link =
    article.link ||
    "#";


  const image =
    article.image ||
    "";


  return `
    <article class="news-card">

      ${
        image
          ? `
            <a
              href="${escapeHTML(
                link
              )}"
              target="_blank"
              rel="noopener"
            >
              <img
                src="${escapeHTML(
                  image
                )}"
                alt=""
                loading="lazy"
              >
            </a>
          `
          : ""
      }

      <div class="news-meta">
        BBC SPORT
      </div>

      <h3>
        <a
          href="${escapeHTML(
            link
          )}"
          target="_blank"
          rel="noopener"
        >
          ${escapeHTML(
            title
          )}
        </a>
      </h3>

      ${
        description
          ? `
            <p>
              ${escapeHTML(
                description
              )}
            </p>
          `
          : ""
      }

    </article>
  `;
}


/* =========================================================
   LOAD NEWS
   ========================================================= */

async function loadNews() {

  const grid =
    document.getElementById(
      "news-grid"
    );


  if (!grid) {
    return;
  }


  try {

    const response =
      await fetch(
        "/api/news",
        {
          cache:
            "no-store"
        }
      );


    const data =
      await safeJSON(
        response
      );


    const articles =
      data.articles ||
      [];


    if (
      articles.length === 0
    ) {

      grid.innerHTML =
        `
          <div class="empty">
            No news available.
          </div>
        `;

      return;
    }


    grid.innerHTML =
      articles
        .map(
          newsCard
        )
        .join("");


  } catch (error) {

    console.error(
      "News error:",
      error
    );


    grid.innerHTML =
      `
        <div class="empty">
          Unable to load news.
        </div>
      `;
  }
}


/* =========================================================
   INITIAL LOAD
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    loadScores();

    loadFixtures();

    loadNews();
  }
);


/* =========================================================
   AUTOMATIC REFRESH
   ========================================================= */

setInterval(
  loadScores,
  2 * 60 * 1000
);


setInterval(
  loadFixtures,
  15 * 60 * 1000
);


setInterval(
  loadNews,
  30 * 60 * 1000
);