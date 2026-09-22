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

    const response =
      await fetch(
        "/api/scores",
        {
          cache:
            "no-store"
        }
      );


    const data =
      await safeJSON(
        response
      );


    let events =
      data.events ||
      [];


    /*
      Filter by selected competition.
    */

    if (
      currentLeague !== null
    ) {

      events =
        events.filter(
          match =>
            Number(
              match.leagueId
            ) ===
            currentLeague
        );
    }


    if (
      events.length === 0
    ) {

      grid.innerHTML =
        `
          <div class="empty">
            No matches found today.
          </div>
        `;

    } else {

      grid.innerHTML =
        events
          .map(
            scoreCard
          )
          .join("");
    }


    if (status) {

      status.textContent =
        `${events.length} match${
          events.length === 1
            ? ""
            : "es"
        }`;
    }


    const updated =
      document.getElementById(
        "updated"
      );


    if (updated) {

      updated.textContent =
        `Updated ${new Date()
          .toLocaleTimeString(
            "en-GB",
            {
              hour:
                "2-digit",

              minute:
                "2-digit"
            }
          )}`;
    }


  } catch (error) {

    console.error(
      "Scores error:",
      error
    );


    grid.innerHTML =
      `
        <div class="empty">
          Unable to load scores.
        </div>
      `;


    if (status) {

      status.textContent =
        "Error";
    }
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


  return `
    <article class="news-card">

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
) ;