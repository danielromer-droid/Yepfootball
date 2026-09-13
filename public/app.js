const leagues = {
  all: { name: "All Europe", code: null },
  ucl: { name: "Champions League", code: "CL" },
  epl: { name: "Premier League", code: "PL" },
  laliga: { name: "La Liga", code: "PD" },
  seriea: { name: "Serie A", code: "SA" },
  bundesliga: { name: "Bundesliga", code: "BL1" },
  ligue1: { name: "Ligue 1", code: "FL1" }
};

let selected = "all";

// Keep the last valid score feed visible if a refresh is temporarily
// empty or fails.
let lastGoodScores = null;

const $ = (s) => document.querySelector(s);

function tabs() {
  const container = $("#league-tabs");
  if (!container) return;

  container.innerHTML = Object.entries(leagues)
    .map(([k, v]) =>
      `<button class="tab ${k === selected ? "active" : ""}" data-league="${k}">${v.name}</button>`
    )
    .join("");

  document.querySelectorAll(".tab").forEach((b) => {
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
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]
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

function fmtTime(v) {
  try {
    return new Date(v).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

async function getJSON(url) {
  const separator = url.includes("?") ? "&" : "?";

  const r = await fetch(
    `${url}${separator}_=${Date.now()}`,
    {
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    }
  );

  if (!r.ok) {
    throw Error(`HTTP ${r.status}`);
  }

  return r.json();
}

function teamHtml(team) {
  const name =
    team?.shortName ||
    team?.name ||
    "Team";

  const crest = team?.crest || "";

  return `
    <span class="team-name">
      ${
        crest
          ? `<img class="team-crest" src="${esc(crest)}" alt="" loading="lazy">`
          : ""
      }
      ${esc(name)}
    </span>
  `;
}

function scoreValue(e, side) {
  const fullTime = e.score?.fullTime || {};
  const regularTime = e.score?.regularTime || {};
  const current = e.score?.current || {};

  if (
    ["FINISHED", "AWARDED"].includes(e.status)
  ) {
    return (
      fullTime[side] ??
      regularTime[side] ??
      current[side] ??
      "-"
    );
  }

  if (
    ["IN_PLAY", "PAUSED", "LIVE"].includes(e.status)
  ) {
    return (
      current[side] ??
      fullTime[side] ??
      regularTime[side] ??
      0
    );
  }

  return "-";
}

function statusLabel(e) {
  if (
    ["IN_PLAY", "LIVE"].includes(e.status)
  ) {
    return e.minute
      ? `${e.minute}'`
      : "LIVE";
  }

  if (e.status === "PAUSED")
    return "HALF-TIME";

  if (e.status === "FINISHED")
    return "FT";

  if (e.status === "AWARDED")
    return "AWARDED";

  if (e.status === "POSTPONED")
    return "POSTPONED";

  if (e.status === "CANCELLED")
    return "CANCELLED";

  if (e.status === "SUSPENDED")
    return "SUSPENDED";

  if (
    ["TIMED", "SCHEDULED"].includes(e.status)
  ) {
    return fmtTime(e.date);
  }

  return e.status || "Scheduled";
}

function eventCard(e) {
  const live =
    ["IN_PLAY", "PAUSED", "LIVE"].includes(e.status);

  return `
    <article class="score-card">

      <div class="score-meta">
        <span>
          ${esc(e.league || "Football")}
        </span>

        <span class="${live ? "live" : ""}">
          ${esc(statusLabel(e))}
        </span>
      </div>

      <div class="teams">

        ${teamHtml(e.homeTeam)}

        <strong class="score">
          ${scoreValue(e, "home")}
          —
          ${scoreValue(e, "away")}
        </strong>

        ${teamHtml(e.awayTeam)}

      </div>

    </article>
  `;
}

function fixtureCard(e) {
  return `
    <article class="fixture-card">

      <div class="fixture-date">
        ${fmtDate(e.date)}
      </div>

      <div class="fixture-teams">

        ${teamHtml(e.homeTeam)}

        <span class="vs">
          vs
        </span>

        ${teamHtml(e.awayTeam)}

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

function filterLeague(events) {
  const league = leagues[selected];
  if (!league) return events;

  const code = league.code;

  if (!code)
    return events;

  return events.filter(
    (e) => e.leagueCode === code
  );
}

/* -------------------------------------------------------
   EUROPEAN MATCH CENTRE
------------------------------------------------------- */

function getMatchCentreElement() {
  const existing =
    $("#match-centre") ||
    $("#matchCentre") ||
    $(".match-centre") ||
    $(".matchCentre") ||
    document.querySelector("[data-match-centre]");

  if (existing) return existing;

  // If the HTML does not have a dedicated Match Centre
  // container, create one immediately before the Scores section.
  const scoresSection =
    $("#scores") ||
    $("#scores-section") ||
    $("#scores-grid")?.closest("section");

  if (!scoresSection?.parentNode) return null;

  const wrapper = document.createElement("section");
  wrapper.id = "match-centre";
  wrapper.className = "match-centre";

  wrapper.innerHTML = `
    <div class="match-centre-header">
      <div>
        <div class="match-centre-title">European Match Centre</div>
      </div>
      <div id="match-centre-status" class="match-centre-status">
        ● LIVE DATA
      </div>
    </div>
    <div id="match-centre-content" class="match-centre-content"></div>
  `;

  scoresSection.parentNode.insertBefore(wrapper, scoresSection);
  return wrapper;
}

function ensureMatchCentreMarkup() {
  const centre = getMatchCentreElement();
  if (!centre) return null;

  let content =
    centre.querySelector("#match-centre-content") ||
    centre.querySelector(".match-centre-content");

  if (!content) {
    content = document.createElement("div");
    content.id = "match-centre-content";
    content.className = "match-centre-content";
    centre.appendChild(content);
  }

  let status =
    centre.querySelector("#match-centre-status") ||
    centre.querySelector(".match-centre-status");

  if (!status) {
    status = document.createElement("div");
    status.id = "match-centre-status";
    status.className = "match-centre-status";
    status.textContent = "● LIVE DATA";
    centre.prepend(status);
  }

  return { centre, content, status };
}

function matchCentreCard(e) {
  const live =
    ["IN_PLAY", "PAUSED", "LIVE"].includes(e.status);

  return `
    <article class="match-centre-card ${live ? "is-live" : ""}">
      <div class="match-centre-league">
        ${esc(e.league || "European football")}
      </div>

      <div class="match-centre-teams">
        <div class="match-centre-team">
          ${teamHtml(e.homeTeam)}
        </div>

        <div class="match-centre-score">
          <strong>
            ${scoreValue(e, "home")}
            —
            ${scoreValue(e, "away")}
          </strong>
          <span class="${live ? "live" : ""}">
            ${esc(statusLabel(e))}
          </span>
        </div>

        <div class="match-centre-team">
          ${teamHtml(e.awayTeam)}
        </div>
      </div>
    </article>
  `;
}

function renderMatchCentre(data) {
  const ui = ensureMatchCentreMarkup();
  if (!ui) return;

  const events = Array.isArray(data?.events)
    ? data.events
    : [];

  const live = Array.isArray(data?.live)
    ? data.live
    : events.filter((e) =>
        ["IN_PLAY", "PAUSED", "LIVE"].includes(e.status)
      );

  const finished = Array.isArray(data?.finished)
    ? data.finished
    : events.filter((e) =>
        ["FINISHED", "AWARDED"].includes(e.status)
      );

  const upcoming = Array.isArray(data?.upcoming)
    ? data.upcoming
    : events.filter((e) =>
        ["SCHEDULED", "TIMED"].includes(e.status)
      );

  // The Match Centre prioritises live matches, then
  // finished matches, then today's upcoming matches.
  const display = [
    ...live,
    ...finished,
    ...upcoming
  ].slice(0, 6);

  if (!display.length) {
    ui.content.innerHTML = `
      <div class="match-centre-empty">
        <div class="match-centre-placeholder">
          <span class="mc-badge">YF</span>
          <span class="mc-dash">—</span>
          <span class="mc-badge">EU</span>
        </div>
        <p>No European matches are currently available.</p>
        <small>Live data connection is working.</small>
      </div>
    `;
  } else {
    ui.content.innerHTML = display
      .map(matchCentreCard)
      .join("");
  }

  ui.status.textContent =
    live.length > 0
      ? `● ${live.length} LIVE`
      : "● LIVE DATA";

  ui.status.classList.toggle(
    "has-live",
    live.length > 0
  );
}

async function loadMatchCentre() {
  const ui = ensureMatchCentreMarkup();

  if (ui) {
    ui.status.textContent = "● CONNECTING…";
    ui.status.classList.remove("has-live");
  }

  try {
    const data = await getJSON("/api/scores");
    renderMatchCentre(data);
  } catch (e) {
    if (ui) {
      ui.status.textContent = "● DATA UNAVAILABLE";
      ui.status.classList.remove("has-live");

      ui.content.innerHTML = `
        <div class="match-centre-empty">
          European Match Centre is temporarily unavailable.
        </div>
      `;
    }

    console.error("Match Centre API error:", e);
  }
}

/* -------------------------------------------------------
   SCORES
------------------------------------------------------- */

function renderScores(data) {
  const events = filterLeague(data.events || []);
  const live = filterLeague(data.live || []);
  const finished = filterLeague(data.finished || []);
  const upcoming = filterLeague(data.upcoming || []);

  // Do not erase a working display because of a transient empty response.
  if (!events.length && lastGoodScores) {
    data = lastGoodScores;
    return renderScores(data);
  }

  if (!events.length) {
    $("#scores-grid").innerHTML = `
      <div class="empty">
        No matches scheduled today
        for ${esc(leagues[selected].name)}.
        <br>
        <small>See Upcoming Fixtures for the next matches.</small>
      </div>
    `;
    return;
  }

  const sections = [];

  if (live.length) {
    sections.push(`
      <div class="score-group">
        <h3>🔴 LIVE NOW</h3>
        ${live.map(eventCard).join("")}
      </div>
    `);
  }

  if (finished.length) {
    sections.push(`
      <div class="score-group">
        <h3>FINISHED TODAY</h3>
        ${finished.map(eventCard).join("")}
      </div>
    `);
  }

  if (upcoming.length) {
    sections.push(`
      <div class="score-group">
        <h3>TODAY'S MATCHES</h3>
        ${upcoming.map(eventCard).join("")}
      </div>
    `);
  }

  $("#scores-grid").innerHTML = sections.join("");
}
async function loadScores() {
  $("#scores-status").textContent = "Updating…";

  try {
    const data = await getJSON("/api/scores");

    const useful =
      (Array.isArray(data?.events) && data.events.length > 0) ||
      (Array.isArray(data?.live) && data.live.length > 0) ||
      (Array.isArray(data?.finished) && data.finished.length > 0) ||
      (Array.isArray(data?.upcoming) && data.upcoming.length > 0);

    // Save only a useful response. An empty/transient response cannot
    // wipe the scores already visible on the page.
    if (useful) lastGoodScores = data;

    const displayData = lastGoodScores || data;

    renderScores(displayData);
    renderMatchCentre(displayData);

    const events = filterLeague(displayData.events || []);
    const live = filterLeague(displayData.live || []);

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    $("#scores-status").textContent = live.length
      ? `${live.length} LIVE · Updated ${time}`
      : `${events.length} matches · Updated ${time}`;

    $("#updated").textContent = `Scores updated ${time}`;

  } catch (e) {
    // Keep the last successful scores visible while reconnecting.
    if (lastGoodScores) {
      renderScores(lastGoodScores);
      renderMatchCentre(lastGoodScores);
      $("#scores-status").textContent = "Live feed reconnecting…";
    } else {
      $("#scores-grid").innerHTML = `
        <div class="empty">
          Scores API error: ${esc(e.message || String(e))}
        </div>
      `;
      $("#scores-status").textContent = "Feed unavailable";
    }

    console.error("Scores API error:", e);
  }
}
/* -------------------------------------------------------
   FIXTURES
------------------------------------------------------- */

async function loadFixtures() {
  try {
    const data =
      await getJSON(
        "/api/fixtures"
      );

    const events =
      data.events || [];

    $("#fixtures-grid")
      .innerHTML = events.length
        ? events
            .map(fixtureCard)
            .join("")
        : `
          <div class="empty">
            No upcoming fixtures found.
          </div>
        `;

  } catch (e) {
    $("#fixtures-grid").innerHTML =
      `<div class="empty">
        Fixtures API error: ${esc(e.message || String(e))}
      </div>`;

    console.error(
      "Fixtures API error:",
      e
    );
  }
}

/* -------------------------------------------------------
   BBC FOOTBALL NEWS
------------------------------------------------------- */

async function loadNews() {
  try {
    const data =
      await getJSON(
        "/api/news"
      );

    const items =
      data.articles || [];

    $("#news-grid")
      .innerHTML = items.length

        ? items
            .slice(0, 9)
            .map(
              (n) => `

              <a
                class="news-card"
                href="${esc(n.link)}"
                target="_blank"
                rel="noopener"
              >

                ${
                  n.image
                    ? `
                      <img
                        src="${esc(n.image)}"
                        alt=""
                        loading="lazy"
                      >
                    `
                    : ""
                }

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

                  ${
                    n.description
                      ? `
                        <p>
                          ${esc(
                            n.description
                          )}
                        </p>
                      `
                      : ""
                  }

                </div>

                <span class="source">
                  ${
                    n.published
                      ? fmtDate(
                          n.published
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

  } catch (e) {
    $("#news-grid")
      .innerHTML = `
        <div class="empty">
          News feed is temporarily
          unavailable.
        </div>
      `;

    console.error(
      "News API error:",
      e
    );
  }
}

/* -------------------------------------------------------
   START APPLICATION
------------------------------------------------------- */

document.addEventListener(
  "DOMContentLoaded",
  () => {

    tabs();

    if ($("#year")) {
      $("#year")
        .textContent =
        new Date().getFullYear();
    }

    // Load all live data immediately.
    loadScores();
    loadFixtures();
    loadNews();

    if ($("#updated")) {
      $("#updated")
        .textContent =
        `Last checked ${
          new Date().toLocaleTimeString(
            [],
            {
              hour: "2-digit",
              minute: "2-digit"
            }
          )
        }`;
    }

    // Scores and Match Centre:
    // refresh every 15 seconds with ONE API request.
    setInterval(loadScores, 15000);

    // Fixtures:
    // refresh every 15 minutes.
    setInterval(
      loadFixtures,
      900000
    );

    // BBC News:
    // refresh every 30 minutes.
    setInterval(
      loadNews,
      1800000
    );

  }
);
