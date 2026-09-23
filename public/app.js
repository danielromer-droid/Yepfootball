/* =========================================================
   YepFootball Frontend
   Clean frontend version
   Scores + Fixtures + BBC News
   ========================================================= */


/* =========================================================
   SUPPORTED LEAGUES
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


/* =========================================================
   CURRENT LEAGUE
   ========================================================= */

let currentLeague = null;


/* =========================================================
   HELPERS
   ========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* ---------------------------------------------------------
   Date formatter
   --------------------------------------------------------- */

function formatDate(date) {

  if (!date) {
    return "";
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleDateString(
    "en-GB",
    {
      weekday: "short",
      day: "numeric",
      month: "short"
    }
  );
}


/* ---------------------------------------------------------
   Long date
   --------------------------------------------------------- */

function formatLongDate(date) {

  if (!date) {
    return "";
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleDateString(
    "en-GB",
    {
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );
}


/* ---------------------------------------------------------
   Time formatter
   --------------------------------------------------------- */

function formatTime(date) {

  if (!date) {
    return "";
  }

  const d = new Date(date);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  return d.toLocaleTimeString(
    "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


/* ---------------------------------------------------------
   API JSON helper
   --------------------------------------------------------- */

async function fetchJSON(url) {

  const response = await fetch(
    url,
    {
      cache: "no-store"
    }
  );

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

function updateYear() {

  const year =
    document.getElementById("year");

  if (year) {

    year.textContent =
      new Date().getFullYear();
  }
}


/* =========================================================
   LEAGUE TABS
   ========================================================= */

function renderLeagueTabs() {

  const container =
    document.getElementById("league-tabs");

  if (!container) {
    return;
  }

  container.innerHTML =
    LEAGUES.map(
      league => {

        const active =
          league.id === currentLeague
            ? " active"
            : "";

        return `
          <button
            type="button"
            class="tab${active}"
            data-league-id="${league.id ?? ""}"
          >
            ${escapeHTML(league.name)}
          </button>
        `;
      }
    ).join("");


  container
    .querySelectorAll(".tab")
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


/* =========================================================
   SCORE STATUS TEXT
   ========================================================= */

function getScoreStatusText(match) {

  const status =
    String(match?.status || "")
      .toUpperCase();


  if (
    status === "FINISHED" ||
    status === "FT" ||
    status === "AET" ||
    status === "PEN"
  ) {
    return "FT";
  }


  if (
    [
      "1H",
      "2H",
      "HT",
      "ET",
      "P"
    ].includes(status)
  ) {
    return "LIVE";
  }


  if (
    status === "TIMED" ||
    status === "NS"
  ) {
    return "UPCOMING";
  }


  return status || "";
}


/* =========================================================
   SCORE CARD
   ========================================================= */

function scoreCard(match) {

  const home =
    match.homeTeam || {};

  const away =
    match.awayTeam || {};


  const homeName =
    home.shortName ||
    home.name ||
    "Home";


  const awayName =
    away.shortName ||
    away.name ||
    "Away";


  const homeScore =
    match.homeScore ??
    "–";


  const awayScore =
    match.awayScore ??
    "–";


  const status =
    getScoreStatusText(match);


  return `
    <article class="score-card">

      <div class="card-top">

        <span>
          ${escapeHTML(
            match.league || ""
          )}
        </span>

        <b>
          ${escapeHTML(status)}
        </b>

      </div>


      <div class="match-time">

        ${escapeHTML(
          formatTime(match.date)
        )}

      </div>


      <div class="teams">


        <!-- HOME -->

        <div class="team">

          ${
            home.crest
              ? `
                <img
                  src="${escapeHTML(home.crest)}"
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
            ${escapeHTML(homeName)}
          </strong>

        </div>


        <!-- SCORE -->

        <div class="score">

          <span>
            ${escapeHTML(homeScore)}
          </span>

          <span>
            –
          </span>

          <span>
            ${escapeHTML(awayScore)}
          </span>

        </div>


        <!-- AWAY -->

        <div class="team">

          ${
            away.crest
              ? `
                <img
                  src="${escapeHTML(away.crest)}"
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
            ${escapeHTML(awayName)}
          </strong>

        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   SCORE LEAGUE HEADING
   ========================================================= */

function scoreLeagueHeading(
  leagueName,
  date
) {

  return `
    <div class="score-day-heading">

      <span>
        ${escapeHTML(leagueName)}
      </span>

      <small>
        ${escapeHTML(
          formatLongDate(date)
        )}
      </small>

    </div>
  `;
}


/* =========================================================
   GROUP SCORES BY LEAGUE
   ========================================================= */

function groupScoresByLeague(events) {

  const groups = new Map();


  events.forEach(
    match => {

      const leagueId =
        Number(match?.leagueId);


      if (
        !SCORE_LEAGUE_IDS.has(
          leagueId
        )
      ) {
        return;
      }


      if (
        currentLeague !== null &&
        leagueId !== currentLeague
      ) {
        return;
      }


      if (!groups.has(leagueId)) {

        groups.set(
          leagueId,
          []
        );
      }


      groups
        .get(leagueId)
        .push(match);

    }
  );


  return groups;
}


/* =========================================================
   SORT LEAGUES
   ========================================================= */

function leagueOrder(leagueId) {

  const index =
    LEAGUES.findIndex(
      league =>
        Number(league.id) ===
        Number(leagueId)
    );

  return index < 0
    ? 999
    : index;
}


/* =========================================================
   RENDER SCORES
   ========================================================= */

function renderScores(events) {

  const grid =
    document.getElementById(
      "scores-grid"
    );


  if (!grid) {
    return;
  }


  if (!events.length) {

    grid.innerHTML = `
      <div class="empty">
        No scores available for the selected competition.
      </div>
    `;

    return;
  }


  const groups =
    groupScoresByLeague(events);


  if (!groups.size) {

    grid.innerHTML = `
      <div class="empty">
        No scores available for the selected competition.
      </div>
    `;

    return;
  }


  const orderedGroups =
    [...groups.entries()]
      .sort(
        (a, b) =>
          leagueOrder(a[0]) -
          leagueOrder(b[0])
      );


  let html = "";


  orderedGroups.forEach(
    ([leagueId, matches]) => {

      const league =
        LEAGUES.find(
          item =>
            Number(item.id) ===
            Number(leagueId)
        );


      const leagueName =
        league?.name ||
        matches[0]?.league ||
        "Football";


      /*
       * Find the latest date represented
       * in this competition.
       */

      const dates =
        matches
          .map(
            match =>
              new Date(
                match.date || 0
              )
          )
          .filter(
            date =>
              !Number.isNaN(
                date.getTime()
              )
          )
          .sort(
            (a, b) =>
              b.getTime() -
              a.getTime()
          );


      const latestDate =
        dates.length
          ? dates[0]
          : null;


      /*
       * Sort matches chronologically.
       */

      matches.sort(
        (a, b) =>
          new Date(
            a.date || 0
          ) -
          new Date(
            b.date || 0
          )
      );


      html +=
        scoreLeagueHeading(
          leagueName,
          latestDate
        );


      html += matches
        .map(scoreCard)
        .join("");

    }
  );


  grid.innerHTML =
    html;
}


/* =========================================================
   LOAD SCORES
   ========================================================= */

async function loadScores() {

  const grid =
    document.getElementById(
      "scores-grid"
    );


  const status =
    document.getElementById(
      "scores-status"
    );


  if (!grid) {
    return;
  }


  try {

    if (status) {
      status.textContent =
        "Loading…";
    }


    const data =
      await fetchJSON(
        "/api/scores"
      );


    if (
      data &&
      data.ok === false
    ) {

      throw new Error(
        data.error ||
        "Scores API error"
      );
    }


    /*
     * The current backend returns:
     *
     * latestAvailable
     * events
     * live
     * finished
     * upcoming
     *
     * During an international break,
     * latestAvailable contains the most
     * recent completed matchday for
     * each competition.
     */


    let events = [];


    if (
      Array.isArray(
        data.latestAvailable
      ) &&
      data.latestAvailable.length
    ) {

      events =
        data.latestAvailable;

    } else if (
      Array.isArray(data.events)
    ) {

      events =
        data.events;

    } else if (
      Array.isArray(data.finished)
    ) {

      events =
        data.finished;
    }


    /*
     * Defensive filtering.
     * Only YepFootball competitions.
     */

    events =
      events.filter(
        match =>
          SCORE_LEAGUE_IDS.has(
            Number(match?.leagueId)
          )
      );


    /*
     * If a specific league is selected,
     * only show that league.
     */

    if (
      currentLeague !== null
    ) {

      events =
        events.filter(
          match =>
            Number(match?.leagueId) ===
            currentLeague
        );
    }


    renderScores(events);


    /*
     * Update match count.
     */

    if (status) {

      status.textContent =
        `${events.length} ${
          events.length === 1
            ? "match"
            : "matches"
        }`;
    }


    /*
     * Update global timestamp.
     */

    const updated =
      document.getElementById(
        "updated"
      );


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
      "YepFootball scores error:",
      error
    );


    grid.innerHTML = `
      <div class="empty">
        Unable to load scores.
      </div>
    `;


    if (status) {
      status.textContent =
        "Scores unavailable";
    }

  }
}


/* =========================================================
   FIXTURE CARD
   ========================================================= */

function fixtureCard(match) {

  const home =
    match.homeTeam || {};

  const away =
    match.awayTeam || {};


  const homeName =
    home.shortName ||
    home.name ||
    "Home";


  const awayName =
    away.shortName ||
    away.name ||
    "Away";


  return `
    <article class="fixture-card">

      <div class="fixture-top">

        <span>
          ${escapeHTML(
            match.league || ""
          )}
        </span>

        <span>
          ${escapeHTML(
            formatDate(match.date)
          )}
        </span>

      </div>


      <div class="fixture-time">

        ${escapeHTML(
          formatTime(match.date)
        )}

      </div>


      <div class="fixture-teams">


        <!-- HOME -->

        <div class="fixture-team">

          ${
            home.crest
              ? `
                <img
                  src="${escapeHTML(home.crest)}"
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
            ${escapeHTML(homeName)}
          </strong>

        </div>


        <!-- VS -->

        <div class="vs">
          VS
        </div>


        <!-- AWAY -->

        <div class="fixture-team">

          ${
            away.crest
              ? `
                <img
                  src="${escapeHTML(away.crest)}"
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
            ${escapeHTML(awayName)}
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


  const message =
    document.getElementById(
      "fixtures-message"
    );


  const windowElement =
    document.getElementById(
      "fixtures-window"
    );


  try {

    grid.innerHTML = `
      <div class="empty">
        Loading fixtures…
      </div>
    `;


    /*
     * IMPORTANT:
     *
     * Use the new endpoint.
     *
     * Do NOT change this back to
     * /api/fixtures
     */

    const data =
      await fetchJSON(
        "/api/fixtures-v2"
      );


    /*
     * The Worker currently returns
     * fixtures and also events.
     */

    let fixtures =
      Array.isArray(data.fixtures)
        ? data.fixtures
        : [];


    if (
      !fixtures.length &&
      Array.isArray(data.events)
    ) {

      fixtures =
        data.events;
    }


    /*
     * Defensive filtering.
     */

    fixtures =
      fixtures.filter(
        match =>
          SCORE_LEAGUE_IDS.has(
            Number(
              match?.leagueId
            )
          )
      );


    /*
     * Sort by date.
     */

    fixtures.sort(
      (a, b) =>
        new Date(
          a.date || 0
        ) -
        new Date(
          b.date || 0
        )
    );


    /*
     * Display API date range.
     */

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


    /*
     * API message.
     */

    if (message) {

      if (data.message) {

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


    /*
     * No fixtures.
     */

    if (!fixtures.length) {

      grid.innerHTML = `
        <div class="empty">
          ${
            data.message ||
            "No upcoming fixtures found."
          }
        </div>
      `;

      return;
    }


    /*
     * Render fixtures.
     */

    grid.innerHTML =
      fixtures
        .map(fixtureCard)
        .join("");


  } catch (error) {

    console.error(
      "YepFootball fixtures error:",
      error
    );


    grid.innerHTML = `
      <div class="empty">
        Unable to load fixtures.
      </div>
    `;


    if (windowElement) {
      windowElement.textContent =
        "Unable to load";
    }
  }
}


/* =========================================================
   NEWS CARD
   ========================================================= */

function newsCard(article) {

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
              href="${escapeHTML(link)}"
              target="_blank"
              rel="noopener noreferrer"
            >

              <img
                src="${escapeHTML(image)}"
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
          href="${escapeHTML(link)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          ${escapeHTML(title)}
        </a>

      </h3>


      ${
        description
          ? `
            <p>
              ${escapeHTML(description)}
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

    const data =
      await fetchJSON(
        "/api/news"
      );


    const articles =
      Array.isArray(
        data.articles
      )
        ? data.articles
        : [];


    if (!articles.length) {

      grid.innerHTML = `
        <div class="empty">
          No news available.
        </div>
      `;

      return;
    }


    grid.innerHTML =
      articles
        .map(newsCard)
        .join("");


  } catch (error) {

    console.error(
      "YepFootball news error:",
      error
    );


    grid.innerHTML = `
      <div class="empty">
        Unable to load news.
      </div>
    `;
  }
}


/* =========================================================
   INITIALISE
   ========================================================= */

function initYepFootball() {

  updateYear();

  renderLeagueTabs();

  loadScores();

  loadFixtures();

  loadNews();
}


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initYepFootball
  );

} else {

  initYepFootball();
}


/* =========================================================
   AUTOMATIC REFRESH
   ========================================================= */

/*
 * Scores:
 * refresh every 2 minutes.
 */

setInterval(
  () => {
    loadScores();
  },
  2 * 60 * 1000
);


/*
 * Fixtures:
 * refresh every 15 minutes.
 */

setInterval(
  () => {
    loadFixtures();
  },
  15 * 60 * 1000
);


/*
 * News:
 * refresh every 30 minutes.
 */

setInterval(
  () => {
    loadNews();
  },
  30 * 60 * 1000
);
