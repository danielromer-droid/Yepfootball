/* =========================================================
   YepFootball app.js

   Latest Scores:
     - Uses the daily snapshot from /api/scores.
     - Keeps the last successful snapshot visible when the API
       temporarily fails.
     - Persists the last good snapshot in localStorage as a
       second safety layer across browser refreshes.
     - Does NOT poll Latest Scores every 30 seconds.

   Match Centre:
     - Uses /api/match-centre.
     - Refreshes every 30 seconds.
   ========================================================= */

const leagues = {
  all: { name: "All Europe", code: null },
  ucl: { name: "Champions League", code: "2" },
  epl: { name: "Premier League", code: "39" },
  laliga: { name: "La Liga", code: "140" },
  seriea: { name: "Serie A", code: "135" },
  bundesliga: { name: "Bundesliga", code: "78" },
  ligue1: { name: "Ligue 1", code: "61" }
};

let selected = "all";
let latestScoresData = null;
let matchCentreData = null;

const SCORES_STORAGE_KEY =
  "yepfootball.latestScores.v2";

const $ = (selector) =>
  document.querySelector(selector);

/* =========================================================
   HELPERS
   ========================================================= */

function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]
  );
}

function fmtDate(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleString(
      undefined,
      {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  } catch {
    return value;
  }
}

function fmtTime(value) {
  if (!value) return "";

  try {
    return new Date(value).toLocaleTimeString(
      undefined,
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );
  } catch {
    return "";
  }
}

function fmtLongDate(value) {
  if (!value) return "Latest results";

  try {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString(
      undefined,
      {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }
    );
  } catch {
    return value;
  }
}

/* =========================================================
   API
   ========================================================= */

async function getJSON(url) {
  const separator =
    url.includes("?") ? "&" : "?";

  const response = await fetch(
    `${url}${separator}_=${Date.now()}`,
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/* =========================================================
   LOCAL STORAGE SAFETY CACHE
   ========================================================= */

function saveScoresLocally(data) {
  try {
    if (!data || !Array.isArray(data.events)) return;

    localStorage.setItem(
      SCORES_STORAGE_KEY,
      JSON.stringify({
        ...data,
        cachedAt: new Date().toISOString()
      })
    );
  } catch (error) {
    console.warn(
      "Could not save Latest Scores locally:",
      error
    );
  }
}

function loadScoresLocally() {
  try {
    const raw = localStorage.getItem(
      SCORES_STORAGE_KEY
    );

    if (!raw) return null;

    const data = JSON.parse(raw);

    if (!data || !Array.isArray(data.events)) {
      return null;
    }

    return data;
  } catch (error) {
    console.warn(
      "Could not read local Latest Scores:",
      error
    );
    return null;
  }
}

/* =========================================================
   LABELS
   ========================================================= */

function labels() {
  document
    .querySelectorAll('a[href="#scores"]')
    .forEach((link) => {
      link.textContent = "Latest Scores";
    });

  const heading = $("#scores h2");
  if (heading) heading.textContent = "Latest Scores";

  const eyebrow = $("#scores .eyebrow");
  if (eyebrow) eyebrow.textContent = "DAILY RESULTS";

  const heroButton = document.querySelector(
    '.hero-actions a[href="#scores"]'
  );

  if (heroButton) {
    heroButton.textContent = "See latest scores";
  }
}

/* =========================================================
   TABS
   ========================================================= */

function tabs() {
  const container = $("#league-tabs");
  if (!container) return;

  container.innerHTML = Object.entries(leagues)
    .map(
      ([key, league]) => `
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
    .forEach((button) => {
      button.addEventListener("click", () => {
        selected = button.dataset.league;
        tabs();
        renderLatestScores(latestScoresData);
      });
    });
}

/* =========================================================
   TEAM / SCORE HELPERS
   ========================================================= */

function team(teamData) {
  return `
    <span class="team-name">
      ${
        teamData?.crest
          ? `
            <img
              class="team-crest"
              src="${esc(teamData.crest)}"
              alt=""
              loading="lazy"
            >
          `
          : ""
      }
      ${esc(
        teamData?.shortName ||
        teamData?.name ||
        "Team"
      )}
    </span>
  `;
}

function score(event, side) {
  if (
    event?.source === "API-Football"
  ) {
    return side === "home"
      ? event.score?.home ?? "-"
      : event.score?.away ?? "-";
  }

  const fullTime =
    event?.score?.fullTime || {};

  const regularTime =
    event?.score?.regularTime || {};

  const current =
    event?.score?.current || {};

  return (
    fullTime[side] ??
    regularTime[side] ??
    current[side] ??
    "-"
  );
}

function filter(events) {
  const code = leagues[selected]?.code;

  if (!code) return events || [];

  return (events || []).filter(
    (event) =>
      String(event?.leagueCode ?? "") ===
      String(code)
  );
}

/* =========================================================
   LATEST SCORES CARD
   ========================================================= */

function card(event) {
  return `
    <article class="score-card">

      <div class="score-meta">
        <span>
          ${esc(
            event.league ||
            "European football"
          )}
        </span>

        <span>
          ${esc(
            event.statusLong ||
            event.status ||
            "FT"
          )}
        </span>
      </div>

      <div class="teams">
        ${team(event.homeTeam)}

        <strong class="score">
          ${esc(score(event, "home"))}
          —
          ${esc(score(event, "away"))}
        </strong>

        ${team(event.awayTeam)}
      </div>

    </article>
  `;
}

/* =========================================================
   RENDER LATEST SCORES
   ========================================================= */

function renderLatestScores(data) {
  if (!data) return;

  latestScoresData = data;

  const grid = $("#scores-grid");
  if (!grid) return;

  const events = filter(data.events || []);

  /*
     Never render an API error here.
     If the snapshot is empty, show a normal empty state.
  */
  if (!events.length) {
    grid.innerHTML = `
      <div class="empty">
        No completed matches were recorded for
        ${esc(leagues[selected].name)}.
        <br>
        <small>
          Daily results are published at 23:50 CET.
        </small>
      </div>
    `;
  } else {
    grid.innerHTML = `
      <div class="score-group">

        <h3>
          FINAL SCORES ·
          ${esc(fmtLongDate(data.date))}
        </h3>

        ${events.map(card).join("")}

      </div>
    `;
  }

  updateScoresIndicator(data);
}

/* =========================================================
   LAST UPDATED INDICATOR
   ========================================================= */

function updateScoresIndicator(data) {
  const status = $("#scores-status");
  const updated = $("#updated");

  const timestamp =
    data?.lastSuccessfulUpdate ||
    data?.publishedAt ||
    data?.cachedAt ||
    null;

  const time = timestamp
    ? fmtTime(timestamp)
    : "";

  const stale =
    Boolean(data?.stale) ||
    Boolean(data?.publicationPending);

  if (status) {
    const count =
      filter(data?.events || []).length;

    if (stale) {
      status.textContent =
        `${count} results · Last updated ${time || "previously"} · Waiting for new publication`;
    } else if (data?.provisional) {
      status.textContent =
        `${count} results · Current completed results · Next publication 23:50 CET`;
    } else if (data?.publishedAt) {
      status.textContent =
        `${count} results · Published ${time}`;
    } else {
      status.textContent =
        `${count} results · Last updated ${time || "previously"}`;
    }
  }

  if (updated) {
    if (stale) {
      updated.textContent =
        `Last updated ${time || "previously"}`;
    } else if (data?.publishedAt) {
      updated.textContent =
        `Latest scores published ${time}`;
    } else {
      updated.textContent =
        `Last updated ${time || "today"}`;
    }
  }
}

/* =========================================================
   LOAD LATEST SCORES
   ========================================================= */

async function loadScores() {
  const status = $("#scores-status");

  /*
     FIRST: immediately show the local snapshot, if one exists.
     This prevents an empty screen while the API request is made.
  */
  const local = loadScoresLocally();

  if (local) {
    latestScoresData = local;
    renderLatestScores(local);
  }

  try {
    const data = await getJSON(
      "/api/scores"
    );

    /*
       A successful API response is now the new safety snapshot.
    */
    saveScoresLocally(data);

    renderLatestScores(data);

  } catch (error) {
    console.error(
      "Latest Scores API error:",
      error
    );

    /*
       CRITICAL:
       Do NOT replace the existing scores with an error.
    */
    if (latestScoresData) {
      const existing = {
        ...latestScoresData,
        stale: true
      };

      renderLatestScores(existing);

    } else {
      const grid = $("#scores-grid");

      if (grid) {
        grid.innerHTML = `
          <div class="empty">
            Latest scores are temporarily unavailable.
            <br>
            <small>
              We will keep trying without removing
              the latest available results.
            </small>
          </div>
        `;
      }

      if (status) {
        status.textContent =
          "Waiting for the latest scores";
      }
    }
  }
}

/* =========================================================
   MATCH CENTRE
   ========================================================= */

function centreUI() {
  let container =
    $("#match-centre") ||
    $("#matchCentre") ||
    document.querySelector(".match-centre") ||
    document.querySelector("[data-match-centre]");

  /*
     If the existing hero Match Centre cannot be found,
     create one immediately before Scores.
  */
  if (!container) {
    const scoresSection =
      $("#scores") ||
      $("#scores-grid")?.closest("section");

    if (!scoresSection?.parentNode) {
      return null;
    }

    container =
      document.createElement("section");

    container.id = "match-centre";
    container.className = "match-centre";

    container.innerHTML = `
      <div class="match-centre-header">
        <div class="match-centre-title">
          European Match Centre
        </div>
        <div
          id="match-centre-status"
          class="match-centre-status"
        >
          ● LIVE DATA
        </div>
      </div>

      <div
        id="match-centre-content"
        class="match-centre-content"
      ></div>
    `;

    scoresSection.parentNode.insertBefore(
      container,
      scoresSection
    );
  }

  let content =
    container.querySelector(
      "#match-centre-content"
    ) ||
    container.querySelector(
      ".match-centre-content"
    );

  let status =
    container.querySelector(
      "#match-centre-status"
    ) ||
    container.querySelector(
      ".match-centre-status"
    );

  /*
     If an older hero card has no content area,
     create one without creating another Match Centre.
  */
  if (!content) {
    content =
      document.createElement("div");

    content.id =
      "match-centre-content";

    content.className =
      "match-centre-content";

    container.appendChild(content);
  }

  if (!status) {
    status =
      document.createElement("div");

    status.id =
      "match-centre-status";

    status.className =
      "match-centre-status";

    status.textContent =
      "● LIVE DATA";

    container.prepend(status);
  }

  return {
    content,
    status
  };
}

function mcCard(event) {
  return `
    <article
      class="match-centre-card ${
        event.live ? "is-live" : ""
      }"
    >

      <div class="match-centre-league">
        ${esc(event.league)}
      </div>

      <div class="match-centre-teams">

        <div class="match-centre-team">
          ${team(event.homeTeam)}
        </div>

        <div class="match-centre-score">
          <strong>
            ${esc(score(event, "home"))}
            —
            ${esc(score(event, "away"))}
          </strong>

          <span class="${
            event.live ? "live" : ""
          }">
            ${esc(
              event.minute !== null &&
              event.minute !== undefined
                ? `${event.minute}'`
                : event.statusLong ||
                  event.status ||
                  "LIVE"
            )}
          </span>
        </div>

        <div class="match-centre-team">
          ${team(event.awayTeam)}
        </div>

      </div>

    </article>
  `;
}

async function loadMatchCentre() {
  const ui = centreUI();
  if (!ui) return;

  try {
    const data = await getJSON(
      "/api/match-centre"
    );

    matchCentreData = data;

    const events =
      Array.isArray(data.events)
        ? data.events
        : [];

    if (events.length) {
      ui.content.innerHTML = events
        .slice(0, 12)
        .map(mcCard)
        .join("");
    } else {
      ui.content.innerHTML = `
        <div class="match-centre-empty">
          No European matches are live right now.
          <br>
          <small>
            Live data connection is working.
          </small>
        </div>
      `;
    }

    ui.status.textContent =
      data.liveCount
        ? `● ${data.liveCount} LIVE`
        : "● LIVE DATA";

  } catch (error) {
    console.error(
      "Match Centre API error:",
      error
    );

    /*
       Keep the last successful Match Centre too.
       A short API failure should not make the card disappear.
    */
    if (matchCentreData) {
      const events =
        Array.isArray(matchCentreData.events)
          ? matchCentreData.events
          : [];

      ui.content.innerHTML = events.length
        ? events.slice(0, 12).map(mcCard).join("")
        : `
          <div class="match-centre-empty">
            No European matches are live right now.
          </div>
        `;

      ui.status.textContent =
        "● LIVE DATA · last update retained";

      return;
    }

    ui.status.textContent =
      "● DATA UNAVAILABLE";

    ui.content.innerHTML = `
      <div class="match-centre-empty">
        European Match Centre is temporarily unavailable.
        <br>
        <small>
          Please try again shortly.
        </small>
      </div>
    `;
  }
}

/* =========================================================
   FIXTURES
   ========================================================= */

function fixture(event) {
  return `
    <article class="fixture-card">

      <div class="fixture-date">
        ${esc(fmtDate(event.date))}
      </div>

      <div class="fixture-teams">
        ${team(event.homeTeam)}
        <span class="vs">vs</span>
        ${team(event.awayTeam)}
      </div>

      <div class="fixture-league">
        ${esc(
          event.league ||
          "European football"
        )}
      </div>

    </article>
  `;
}

async function loadFixtures() {
  const grid = $("#fixtures-grid");
  if (!grid) return;

  try {
    const data = await getJSON(
      "/api/fixtures"
    );

    const events =
      Array.isArray(data.events)
        ? data.events
        : [];

    grid.innerHTML = events.length
      ? events.map(fixture).join("")
      : `
        <div class="empty">
          No upcoming fixtures found.
        </div>
      `;

  } catch (error) {
    console.error(
      "Fixtures API error:",
      error
    );

    grid.innerHTML = `
      <div class="empty">
        Fixtures are temporarily unavailable.
      </div>
    `;
  }
}

/* =========================================================
   NEWS
   ========================================================= */

async function loadNews() {
  const grid = $("#news-grid");
  if (!grid) return;

  try {
    const data = await getJSON(
      "/api/news"
    );

    const articles =
      Array.isArray(data.articles)
        ? data.articles
        : [];

    grid.innerHTML = articles.length
      ? articles
          .slice(0, 9)
          .map(
            (article) => `
              <a
                class="news-card"
                href="${esc(article.link)}"
                target="_blank"
                rel="noopener"
              >
                ${
                  article.image
                    ? `
                      <img
                        src="${esc(article.image)}"
                        alt=""
                        loading="lazy"
                      >
                    `
                    : ""
                }

                <div>
                  <small>
                    ${esc(
                      article.source ||
                      "Football news"
                    )}
                  </small>

                  <h3>
                    ${esc(article.title)}
                  </h3>

                  ${
                    article.description
                      ? `
                        <p>
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
                    article.published
                      ? esc(
                          fmtDate(
                            article.published
                          )
                        )
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

  } catch (error) {
    console.error(
      "News API error:",
      error
    );

    grid.innerHTML = `
      <div class="empty">
        News feed is temporarily unavailable.
      </div>
    `;
  }
}

/* =========================================================
   INITIALISE
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  () => {
    labels();
    tabs();

    const year = $("#year");
    if (year) {
      year.textContent =
        new Date().getFullYear();
    }

    /*
       Latest Scores is loaded once on page load.
       We intentionally do NOT poll it every 30 seconds.
    */
    loadScores();

    /* Live Match Centre */
    loadMatchCentre();

    /* Fixtures */
    loadFixtures();

    /* News */
    loadNews();

    /*
       Only Match Centre is refreshed frequently.
    */
    setInterval(
      loadMatchCentre,
      30000
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
