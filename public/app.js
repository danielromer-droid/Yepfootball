const leagues = {
  all: { name: "All Europe", id: null },
  ucl: { name: "Champions League", id: 2 },
  europa: { name: "Europa League", id: 3 },
  conference: { name: "Conference League", id: 848 },
  epl: { name: "Premier League", id: 39 },
  laliga: { name: "La Liga", id: 140 },
  seriea: { name: "Serie A", id: 135 },
  bundesliga: { name: "Bundesliga", id: 78 },
  ligue1: { name: "Ligue 1", id: 61 }
};

let selected = "all";

const $ = s => document.querySelector(s);

function tabs() {
  $("#league-tabs").innerHTML =
    Object.entries(leagues)
      .map(([k, v]) =>
        `<button class="tab ${k === selected ? "active" : ""}"
          data-league="${k}">
          ${v.name}
        </button>`
      )
      .join("");

  document.querySelectorAll(".tab").forEach(b => {
    b.onclick = () => {
      selected = b.dataset.league;
      tabs();
      loadScores();
    };
  });
}

function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c])
  );
}

function fmtDate(v) {
  try {
    return new Date(v).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return v;
  }
}

async function getJSON(url) {
  const r = await fetch(url, {
    headers: {
      "Accept": "application/json"
    }
  });

  if (!r.ok) {
    throw Error(`HTTP ${r.status}`);
  }

  return r.json();
}


/* =====================================================
   LATEST SCORES
   New API format:
   homeTeam / awayTeam / score
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
    e.score?.home ?? "-";

  const awayScore =
    e.score?.away ?? "-";

  const state =
    e.statusLong ||
    e.status ||
    "Full Time";

  return `
    <article class="score-card">

      <div class="score-meta">
        <span>${esc(e.league || "Football")}</span>
        <span>${esc(state)}</span>
      </div>

      <div class="teams">

        <span>
          ${esc(home)}
        </span>

        <strong class="score">
          ${homeScore} — ${awayScore}
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

  $("#scores-status").textContent =
    "Loading…";

  try {

    const data =
      await getJSON("/api/scores");

    let events =
      data.events || [];


    /* Filter locally by league */

    if (selected !== "all") {

      const leagueId =
        leagues[selected].id;

      events =
        events.filter(
          e =>
            Number(e.leagueId) ===
            Number(leagueId)
        );
    }


    $("#scores-grid").innerHTML =
      events.length

        ? events
            .map(eventCard)
            .join("")

        : `
          <div class="empty">
            No matches found for this competition.
          </div>
        `;


    $("#scores-status").textContent =
      `Updated ${new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )}`;

  }

  catch (e) {

    $("#scores-grid").innerHTML =
      `
        <div class="empty">
          Scores are temporarily unavailable.
          Please try again shortly.
        </div>
      `;

    $("#scores-status").textContent =
      "Feed unavailable";
  }
}


/* =====================================================
   FIXTURES
===================================================== */

function fixtureCard(e) {

  const c =
    e.competitions?.[0];

  const a =
    c?.competitors?.find(
      x => x.homeAway === "home"
    );

  const b =
    c?.competitors?.find(
      x => x.homeAway === "away"
    );

  return `
    <article class="fixture-card">

      <div class="fixture-date">
        ${fmtDate(e.date)}
      </div>

      <div class="fixture-teams">
        ${esc(
          a?.team?.displayName ||
          "Home"
        )}

        <br>
        vs
        <br>

        ${esc(
          b?.team?.displayName ||
          "Away"
        )}
      </div>

      <div class="fixture-league">
        ${esc(
          e.league ||
          "European football"
        )}
      </div>

    </article>
  `;
}


async function loadFixtures() {

  try {

    const data =
      await getJSON(
        "/api/fixtures"
      );

    const events =
      data.events || [];

    $("#fixtures-grid").innerHTML =
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

  catch (e) {

    $("#fixtures-grid").innerHTML =
      `
        <div class="empty">
          Fixtures are temporarily unavailable.
        </div>
      `;
  }
}


/* =====================================================
   BBC NEWS
===================================================== */

async function loadNews() {

  try {

    const data =
      await getJSON(
        "/api/news"
      );

    const items =
      data.articles || [];

    $("#news-grid").innerHTML =
      items.length

        ? items
            .slice(0, 9)
            .map(
              n =>
                `
                <a
                  class="news-card"
                  href="${esc(n.link)}"
                  target="_blank"
                  rel="noopener"
                >

                  <div>

                    <small>
                      ${esc(
                        n.source ||
                        "Football news"
                      )}
                    </small>

                    <h3>
                      ${esc(n.title)}
                    </h3>

                  </div>

                  <span class="source">
                    ${
                      n.published
                        ? fmtDate(n.published)
                        : "Latest"
                    }
                  </span>

                </a>
                `
            )
            .join("")

        : `
          <div class="empty">
            No news available right now.
          </div>
        `;

  }

  catch (e) {

    $("#news-grid").innerHTML =
      `
        <div class="empty">
          News feed is temporarily unavailable.
        </div>
      `;
  }
}


/* =====================================================
   START
===================================================== */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    tabs();

    $("#year").textContent =
      new Date().getFullYear();

    loadScores();
    loadFixtures();
    loadNews();

    $("#updated").textContent =
      `Last checked ${new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      )}`;

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

  }
);