/* =====================================================
   YepFootball - Frontend
   Scores / Fixtures / BBC News
===================================================== */


/* =====================================================
   LEAGUES
===================================================== */

const leagues = {

  all: {
    name: "All Europe",
    id: null
  },

  ucl: {
    name: "Champions League",
    id: 2
  },

  europa: {
    name: "Europa League",
    id: 3
  },

  conference: {
    name: "Conference League",
    id: 848
  },

  epl: {
    name: "Premier League",
    id: 39
  },

  laliga: {
    name: "La Liga",
    id: 140
  },

  seriea: {
    name: "Serie A",
    id: 135
  },

  bundesliga: {
    name: "Bundesliga",
    id: 78
  },

  ligue1: {
    name: "Ligue 1",
    id: 61
  }

};


/* =====================================================
   STATE
===================================================== */

let selected = "all";


/* =====================================================
   HELPERS
===================================================== */

const $ = selector =>
  document.querySelector(selector);


function esc(value) {

  return String(value ?? "")
    .replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[character])
    );

}


function fmtDate(value) {

  try {

    return new Date(value)
      .toLocaleString(
        undefined,
        {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  }

  catch {

    return value;

  }

}


function fmtNewsDate(value) {

  try {

    return new Date(value)
      .toLocaleString(
        undefined,
        {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit"
        }
      );

  }

  catch {

    return value || "Latest";

  }

}


async function getJSON(url) {

  const response =
    await fetch(
      url,
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}`
    );

  }


  return response.json();

}


/* =====================================================
   TEAM CREST
===================================================== */

function crestHTML(
  crest,
  teamName
) {

  if (!crest) {

    return "";

  }


  return `
    <img
      class="team-crest"
      src="${esc(crest)}"
      alt="${esc(teamName)} crest"
      loading="lazy"
      referrerpolicy="no-referrer"
      onerror="this.style.display='none'"
    >
  `;

}


/* =====================================================
   LEAGUE TABS
===================================================== */

function tabs() {

  const container =
    $("#league-tabs");


  if (!container) {

    return;

  }


  container.innerHTML =
    Object.entries(leagues)
      .map(
        ([key, league]) =>

          `
          <button
            class="tab ${key === selected ? "active" : ""}"
            data-league="${esc(key)}"
            type="button"
          >
            ${esc(league.name)}
          </button>
          `
      )
      .join("");


  container
    .querySelectorAll(".tab")
    .forEach(button => {

      button.onclick = () => {

        selected =
          button.dataset.league;

        tabs();

        loadScores();

      };

    });

}


/* =====================================================
   LATEST SCORES
===================================================== */

function eventCard(e) {

  const home =
    e.homeTeam?.shortName ||
    e.homeTeam?.name ||
    "Home";


  const away =
    e.awayTeam?.shortName ||
    e.awayTeam?.name ||
    "Away";


  const homeScore =
    e.score?.home ??
    e.homeScore ??
    "-";


  const awayScore =
    e.score?.away ??
    e.awayScore ??
    "-";


  const state =
    e.statusLong ||
    e.status ||
    "Full Time";


  return `

    <article class="score-card">

      <div class="score-meta">

        <span>
          ${esc(
            e.league ||
            "Football"
          )}
        </span>

        <span>
          ${esc(state)}
        </span>

      </div>


      <div class="teams">

        <span>
          ${crestHTML(
            e.homeTeam?.crest,
            home
          )}

          ${esc(home)}
        </span>


        <strong class="score">
          ${esc(homeScore)}
          —
          ${esc(awayScore)}
        </strong>


        <span>
          ${esc(away)}

          ${crestHTML(
            e.awayTeam?.crest,
            away
          )}
        </span>

      </div>

    </article>

  `;

}


/* =====================================================
   LOAD LATEST SCORES
===================================================== */

async function loadScores() {

  const status =
    $("#scores-status");


  const grid =
    $("#scores-grid");


  if (!grid) {

    return;

  }


  if (status) {

    status.textContent =
      "Loading…";

  }


  try {

    const data =
      await getJSON(
        "/api/scores"
      );


    let events =
      data.events || [];


    if (
      selected !== "all"
    ) {

      const leagueId =
        leagues[selected].id;


      events =
        events.filter(
          event =>
            Number(event.leagueId) ===
            Number(leagueId)
        );

    }


    grid.innerHTML =

      events.length

        ? events
            .map(eventCard)
            .join("")

        : `
          <div class="empty">
            No matches found for this competition.
          </div>
        `;


    if (status) {

      if (data.publishedAt) {

        status.textContent =
          `Last updated ${new Date(
            data.publishedAt
          ).toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )}`;

      }

      else {

        status.textContent =
          `Updated ${new Date()
            .toLocaleTimeString(
              [],
              {
                hour: "2-digit",
                minute: "2-digit"
              }
            )}`;

      }

    }

  }

  catch (error) {

    console.error(
      "Scores error:",
      error
    );


    grid.innerHTML =
      `
        <div class="empty">
          Scores are temporarily unavailable.
          Please try again shortly.
        </div>
      `;


    if (status) {

      status.textContent =
        "Feed unavailable";

    }

  }

}


/* =====================================================
   FIXTURE CARD
===================================================== */

function fixtureCard(e) {

  const home =
    e.homeTeam?.shortName ||
    e.homeTeam?.name ||
    "Home";


  const away =
    e.awayTeam?.shortName ||
    e.awayTeam?.name ||
    "Away";


  const homeCrest =
    e.homeTeam?.crest ||
    "";


  const awayCrest =
    e.awayTeam?.crest ||
    "";


  const league =
    e.league ||
    "European football";


  return `

    <article class="fixture-card">

      <div class="fixture-date">
        ${esc(
          fmtDate(e.date)
        )}
      </div>


      <div class="fixture-teams">

        <span class="fixture-team home-team">

          ${crestHTML(
            homeCrest,
            home
          )}

          <strong>
            ${esc(home)}
          </strong>

        </span>


        <strong class="fixture-vs">
          vs
        </strong>


        <span class="fixture-team away-team">

          <strong>
            ${esc(away)}
          </strong>

          ${crestHTML(
            awayCrest,
            away
          )}

        </span>

      </div>


      <div class="fixture-league">
        ${esc(league)}
      </div>

    </article>

  `;

}


/* =====================================================
   LOAD FIXTURES
===================================================== */

async function loadFixtures() {

  const grid =
    $("#fixtures-grid");

  const message =
    $("#fixtures-message");

  const windowLabel =
    $("#fixtures-window");


  if (!grid) {

    return;

  }


  /*
     Initial message
  */

  if (message) {

    message.textContent =
      "Checking upcoming fixtures…";

  }


  if (windowLabel) {

    windowLabel.textContent =
      "Automatic";

  }


  try {

    const data =
      await getJSON(
        "/api/fixtures"
      );


    const events =
      Array.isArray(data.fixtures)
        ? data.fixtures
        : (
            Array.isArray(data.events)
              ? data.events
              : []
          );


    /*
       We now expect the API to return
       the next available fixtures even
       when the current 7-day period is empty.
    */

    if (events.length) {

      grid.innerHTML =
        events
          .map(fixtureCard)
          .join("");


      if (message) {

        if (
          data.isNextAvailable ||
          data.mode === "next"
        ) {

          message.textContent =
            "No fixtures during the current period. Showing the next available matches.";

        }

        else {

          message.textContent =
            "Upcoming European fixtures.";

        }

      }


      if (windowLabel) {

        if (
          data.from &&
          data.to
        ) {

          const from =
            new Date(
              `${data.from}T12:00:00`
            );


          const to =
            new Date(
              `${data.to}T12:00:00`
            );


          windowLabel.textContent =
            `${from.toLocaleDateString(
              undefined,
              {
                day: "numeric",
                month: "short"
              }
            )} – ${to.toLocaleDateString(
              undefined,
              {
                day: "numeric",
                month: "short"
              }
            )}`;

        }

        else {

          windowLabel.textContent =
            "Next available";

        }

      }

      return;

    }


    /*
       No fixtures returned at all.
    */

    grid.innerHTML =
      `
        <div class="empty">
          No upcoming European fixtures are currently available.
        </div>
      `;


    if (message) {

      message.textContent =
        "The next fixture information is not currently available.";

    }


    if (windowLabel) {

      windowLabel.textContent =
        "Automatic";

    }

  }

  catch (error) {

    console.error(
      "Fixtures error:",
      error
    );


    grid.innerHTML =
      `
        <div class="empty">
          Fixtures are temporarily unavailable.
        </div>
      `;


    if (message) {

      message.textContent =
        "Unable to load the fixture feed.";

    }


    if (windowLabel) {

      windowLabel.textContent =
        "Feed unavailable";

    }

  }

}


/* =====================================================
   BBC NEWS CARD
===================================================== */

function newsCard(article) {

  const image =
    article.image ||
    "";


  const imageHTML =
    image

      ? `
        <img
          class="news-image"
          src="${esc(image)}"
          alt="${esc(article.title)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          onerror="this.style.display='none'"
        >
        `

      : "";


  return `

    <a
      class="news-card"
      href="${esc(article.link)}"
      target="_blank"
      rel="noopener"
    >

      ${imageHTML}


      <div class="news-content">

        <div>

          <small>
            ${esc(
              article.source ||
              "BBC Sport"
            )}
          </small>


          <h3>
            ${esc(
              article.title
            )}
          </h3>


          ${
            article.description
              ? `
                <p class="news-description">
                  ${esc(
                    article.description
                  )}
                </p>
              `
              : ""
          }

        </div>


        <span class="source">

          ${
            article.published ||
            article.date
              ? esc(
                  fmtNewsDate(
                    article.published ||
                    article.date
                  )
                )
              : "Latest"
          }

        </span>

      </div>

    </a>

  `;

}


/* =====================================================
   LOAD BBC NEWS
===================================================== */

async function loadNews() {

  const grid =
    $("#news-grid");


  if (!grid) {

    return;

  }


  try {

    const data =
      await getJSON(
        "/api/news"
      );


    const articles =
      data.articles || [];


    grid.innerHTML =

      articles.length

        ? articles
            .slice(0, 9)
            .map(newsCard)
            .join("")

        : `
          <div class="empty">
            No news available right now.
          </div>
        `;

  }

  catch (error) {

    console.error(
      "News error:",
      error
    );


    grid.innerHTML =
      `
        <div class="empty">
          News feed is temporarily unavailable.
        </div>
      `;

  }

}


/* =====================================================
   PAGE UPDATE TIME
===================================================== */

function updatePageTime() {

  const element =
    $("#updated");


  if (!element) {

    return;

  }


  element.textContent =
    `Last checked ${new Date()
      .toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )}`;

}


/* =====================================================
   START APPLICATION
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    tabs();


    const year =
      $("#year");


    if (year) {

      year.textContent =
        new Date().getFullYear();

    }


    loadScores();

    loadFixtures();

    loadNews();

    updatePageTime();


    /* Scores every 2 minutes */

    setInterval(
      loadScores,
      120000
    );


    /* Fixtures every 15 minutes */

    setInterval(
      loadFixtures,
      900000
    );


    /* News every 30 minutes */

    setInterval(
      loadNews,
      1800000
    );


    /* Page time every minute */

    setInterval(
      updatePageTime,
      60000
    );

  }
);