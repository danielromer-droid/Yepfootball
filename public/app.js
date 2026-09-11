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

const $ = s => document.querySelector(s);

const esc = v =>
  String(v ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));

function fmtDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;

  return d.toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusLabel(match) {
  const s = String(match.status || "").toUpperCase();

  return ({
    IN_PLAY: "LIVE",
    PAUSED: "HALF TIME",
    FINISHED: "FT",
    SCHEDULED: "Scheduled",
    TIMED: "Scheduled",
    POSTPONED: "Postponed",
    CANCELLED: "Cancelled",
    SUSPENDED: "Suspended"
  })[s] || match.status || "Scheduled";
}

function isLive(match) {
  return ["IN_PLAY", "PAUSED"].includes(
    String(match.status || "").toUpperCase()
  );
}

function teamName(team) {
  return team?.shortName || team?.name || "Unknown";
}

function crest(team) {
  return team?.crest
    ? `<img class="team-crest"
        src="${esc(team.crest)}"
        alt=""
        loading="lazy">`
    : "";
}

function currentScore(match) {
  const score = match.score || {};

  return {
    home:
      score.fullTime?.home ??
      score.regularTime?.home ??
      score.halfTime?.home ??
      "-",

    away:
      score.fullTime?.away ??
      score.regularTime?.away ??
      score.halfTime?.away ??
      "-"
  };
}

function tabs() {
  const container = $("#league-tabs");
  if (!container) return;

  container.innerHTML = Object.entries(leagues)
    .map(([key, league]) => `
      <button
        class="tab ${key === selected ? "active" : ""}"
        data-league="${key}">
        ${esc(league.name)}
      </button>
    `)
    .join("");

  container.querySelectorAll(".tab").forEach(button => {
    button.onclick = () => {
      selected = button.dataset.league || "all";
      tabs();
      loadScores();
      loadFixtures();
    };
  });
}

async function getJSON(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function filterSelected(events) {
  const code = leagues[selected]?.code;

  if (!code) return events;

  return events.filter(
    match =>
      String(match.leagueCode || "").toUpperCase() === code
  );
}

function eventCard(match) {
  const score = currentScore(match);
  const home = match.homeTeam;
  const away = match.awayTeam;
  const live = isLive(match);

  return `
    <article class="score-card">

      <div class="score-meta">
        <span>
          ${esc(match.league || "European football")}
        </span>

        <span class="${live ? "live" : ""}">
          ${live ? "● " : ""}
          ${esc(statusLabel(match))}
          ${match.minute ? ` · ${esc(match.minute)}'` : ""}
        </span>
      </div>

      <div class="teams">

        <span class="team">
          ${crest(home)}
          ${esc(teamName(home))}
        </span>

        <strong class="score">
          ${score.home} — ${score.away}
        </strong>

        <span class="team">
          ${esc(teamName(away))}
          ${crest(away)}
        </span>

      </div>

      <div class="score-time">
        ${esc(fmtDate(match.date))}
      </div>

    </article>
  `;
}

function fixtureCard(match) {
  const home = match.homeTeam;
  const away = match.awayTeam;

  return `
    <article class="fixture-card">

      <div class="fixture-date">
        ${esc(fmtDate(match.date))}
      </div>

      <div class="fixture-teams">

        <span>
          ${crest(home)}
          ${esc(teamName(home))}
        </span>

        <span class="vs">vs</span>

        <span>
          ${crest(away)}
          ${esc(teamName(away))}
        </span>

      </div>

      <div class="fixture-league">
        ${esc(match.league || "European football")}
      </div>

    </article>
  `;
}

async function loadScores() {
  const status = $("#scores-status");
  const grid = $("#scores-grid");

  if (!grid) return;

  if (status) status.textContent = "Loading…";

  try {

    const data = await getJSON("/api/scores");

    const events = filterSelected(data.events || []);

    grid.innerHTML = events.length
      ? events.map(eventCard).join("")
      : `<div class="empty">
           No matches found for this competition today.
         </div>`;

    if (status) {
      status.textContent =
        `Updated ${new Date(
          data.updated || Date.now()
        ).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        })}`;
    }

  } catch (error) {

    console.error("Scores error:", error);

    grid.innerHTML =
      `<div class="empty">
         Scores are temporarily unavailable.
         Please try again shortly.
       </div>`;

    if (status) status.textContent = "Feed unavailable";
  }
}

async function loadFixtures() {
  const grid = $("#fixtures-grid");

  if (!grid) return;

  try {

    const data = await getJSON("/api/fixtures");

    const events = filterSelected(data.events || []);

    grid.innerHTML = events.length
      ? events.map(fixtureCard).join("")
      : `<div class="empty">
           No upcoming fixtures found.
         </div>`;

  } catch (error) {

    console.error("Fixtures error:", error);

    grid.innerHTML =
      `<div class="empty">
         Fixtures are temporarily unavailable.
       </div>`;
  }
}

async function loadNews() {
  const grid = $("#news-grid");

  if (!grid) return;

  try {

    const data = await getJSON("/api/news");

    const items = data.articles || [];

    if (!items.length) {
      grid.innerHTML =
        `<div class="empty">
          ${esc(
            data.message ||
            "No news available right now."
          )}
        </div>`;

      return;
    }

    grid.innerHTML = items
      .slice(0, 9)
      .map(item => `
        <a
          class="news-card"
          href="${esc(item.link)}"
          target="_blank"
          rel="noopener noreferrer">

          <div>
            <small>
              ${esc(item.source || "Football news")}
            </small>

            <h3>
              ${esc(item.title)}
            </h3>
          </div>

          <span class="source">
            ${
              item.published
                ? esc(fmtDate(item.published))
                : "Latest"
            }
          </span>

        </a>
      `)
      .join("");

  } catch (error) {

    console.error("News error:", error);

    grid.innerHTML =
      `<div class="empty">
         News feed is temporarily unavailable.
       </div>`;
  }
}

async function refreshAll() {

  await Promise.allSettled([
    loadScores(),
    loadFixtures(),
    loadNews()
  ]);

  const updated = $("#updated");

  if (updated) {
    updated.textContent =
      `Last checked ${new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      })}`;
  }
}

document.addEventListener("DOMContentLoaded", () => {

  tabs();

  const year = $("#year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  refreshAll();

  // Scores: every 2 minutes
  setInterval(loadScores, 120000);

  // Fixtures: every 15 minutes
  setInterval(loadFixtures, 900000);

  // News: every 30 minutes
  setInterval(loadNews, 1800000);

});
