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
   New API format:

   e.homeTeam.name
   e.awayTeam.name
   e.score.home
   e.score.away
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
    "-";

  const awayScore =
    e.score?.away ??
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
          ${esc(home)}
        </span>


        <strong class="score">
          ${esc(homeScore)}
          —
          ${esc(awayScore)}
        </strong>


        <span>
          ${esc(away)}
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


    /* -----------------------------------------------
       Filter selected competition
    ------------------------------------------------ */

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


    /* -----------------------------------------------
       Display results
    ------------------------------------------------ */

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


    /* -----------------------------------------------
       Accurate update time
    ------------------------------------------------ */

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
   FIXTURES
   New API format:

   e.homeTeam.name
   e.awayTeam.name
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

        <span>
          ${esc(home)}
        </span>


        <strong>
          vs
        </strong>


        <span>
          ${esc(away)}
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


  if (!grid) {
    return;
  }


  try {

    const data =
      await getJSON(
        "/api/fixtures"
      );


    const events =
      data.events || [];


    grid.innerHTML =

      events.length

        ? events
            .map(fixtureCard)
            .join("")

        : `
          <div class="empty">
            No upcoming fixtures found.
          </div>
        `;

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
          src="${esc(image)}"
          alt="${esc(article.title)}"
          loading="lazy"
          referrerpolicy="no-referrer"
          style="
            width:100%;
            height:180px;
            object-fit:cover;
            display:block;
            border-radius:8px 8px 0 0;
          "
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
      style="
        overflow:hidden;
        display:flex;
        flex-direction:column;
      "
    >

      ${imageHTML}


      <div
        style="
          padding:16px;
          flex:1;
          display:flex;
          flex-direction:column;
          justify-content:space-between;
        "
      >

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

        </div>


        <span class="source">

          ${
            article.published
              ? esc(
                  fmtNewsDate(
                    article.published
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


    /* -----------------------------------------------
       Automatic refresh
    ------------------------------------------------ */

    setInterval(
      loadScores,
      120000
    );


    setInterval(
      loadFixtures,
      900000
    );


    setInterval(
      loadNews,
      1800000
    );


    setInterval(
      updatePageTime,
      60000
    );

  }
);