/* YepFootball app.js
   Daily Latest Scores + live European Match Centre
   - Latest Scores are a persistent daily snapshot.
   - If the API temporarily fails, the last successful results remain visible.
   - The browser also keeps a local fallback so a short network failure does
     not make the page look empty.
*/

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
let lastMatchCentreData = null;

const $ = selector => document.querySelector(selector);

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function fmtDate(value) {
  try {
    return new Date(value).toLocaleString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return value;
  }
}

function fmtDay(value) {
  try {
    return new Date(`${value}T12:00:00Z`).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  } catch {
    return value || "Latest results";
  }
}

function fmtTime(value) {
  try {
    return new Date(value).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

async function getJSON(url) {
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}_=${Date.now()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

function saveBrowserSnapshot(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage errors; server-side KV remains the main persistence layer.
  }
}

function readBrowserSnapshot(key) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function labels() {
  document.querySelectorAll('a[href="#scores"]').forEach(link => {
    link.textContent = "Latest Scores";
  });

  if ($("#scores h2")) $("#scores h2").textContent = "Latest Scores";
  if ($("#scores .eyebrow")) $("#scores .eyebrow").textContent = "DAILY RESULTS";

  const button = document.querySelector('.hero-actions a[href="#scores"]');
  if (button) button.textContent = "See latest scores";
}

function tabs() {
  const container = $("#league-tabs");
  if (!container) return;

  container.innerHTML = Object.entries(leagues)
    .map(([key, league]) => `
      <button class="tab ${key === selected ? "active" : ""}" data-league="${key}">
        ${league.name}
      </button>
    `)
    .join("");

  document.querySelectorAll(".tab").forEach(button => {
    button.onclick = () => {
      selected = button.dataset.league;
      tabs();
      renderLatestScores(latestScoresData);
    };
  });
}

function team(teamData) {
  return `
    <span class="team-name">
      ${teamData?.crest
        ? `<img class="team-crest" src="${esc(teamData.crest)}" alt="" loading="lazy">`
        : ""}
      ${esc(teamData?.shortName || teamData?.name || "Team")}
    </span>
  `;
}

function score(event, side) {
  if (event.source === "API-Football") {
    return side === "home"
      ? (event.score?.home ?? "-")
      : (event.score?.away ?? "-");
  }

  const fullTime = event.score?.fullTime || {};
  const regularTime = event.score?.regularTime || {};
  return fullTime[side]
    ?? regularTime[side]
    ?? event.score?.current?.[side]
    ?? "-";
}

function card(event) {
  return `
    <article class="score-card">
      <div class="score-meta">
        <span>${esc(event.league || "Football")}</span>
        <span>${esc(event.statusLong || event.status || "Final")}</span>
      </div>
      <div class="teams">
        ${team(event.homeTeam)}
        <strong class="score">${score(event, "home")} — ${score(event, "away")}</strong>
        ${team(event.awayTeam)}
      </div>
    </article>
  `;
}

function fixture(event) {
  return `
    <article class="fixture-card">
      <div class="fixture-date">${fmtDate(event.date)}</div>
      <div class="fixture-teams">
        ${team(event.homeTeam)}
        <span class="vs">vs</span>
        ${team(event.awayTeam)}
      </div>
      <div class="fixture-league">${esc(event.league || "European football")}</div>
    </article>
  `;
}

function filter(events) {
  const code = leagues[selected]?.code;
  return code ? events.filter(event => String(event.leagueCode) === code) : events;
}

function renderLatestScores(data, options = {}) {
  if (!data) return;

  latestScoresData = data;

  const grid = $("#scores-grid");
  if (!grid) return;

  const events = filter(data.events || []);

  if (!events.length) {
    grid.innerHTML = `
      <div class="empty">
        No completed matches were recorded for ${esc(leagues[selected].name)}.
        <br>
        <small>New daily results are published at 23:50 CET.</small>
      </div>
    `;
  } else {
    const day = fmtDay(data.date);
    const fallbackText = options.fallback
      ? `<small>Showing the last successfully published results.</small>`
      : "";

    grid.innerHTML = `
      <div class="score-group">
        <h3>FINAL SCORES · ${esc(day)}</h3>
        ${fallbackText}
        ${events.map(card).join("")}
      </div>
    `;
  }
}

async function loadScores() {
  const status = $("#scores-status");
  if (status) status.textContent = "Loading…";

  try {
    const data = await getJSON("/api/scores");

    if (data?.events) {
      saveBrowserSnapshot("yepfootball_latest_scores", data);
    }

    renderLatestScores(data);

    const count = filter(data.events || []).length;
    if (status) {
      status.textContent = data.publishedAt
        ? `${count} results · Published ${fmtTime(data.publishedAt)}`
        : `${count} results`;
    }

    if ($("#updated")) {
      $("#updated").textContent = data.date
        ? `Latest scores · ${data.date}`
        : "Waiting for the first daily snapshot";
    }
  } catch (error) {
    // Never replace an already-visible successful snapshot with an error.
    const fallback = latestScoresData || readBrowserSnapshot("yepfootball_latest_scores");

    if (fallback?.events?.length) {
      renderLatestScores(fallback, { fallback: true });

      if (status) {
        status.textContent = `Last successful results · ${fallback.date || ""}`;
      }

      if ($("#updated")) {
        $("#updated").textContent = "Showing last successfully published scores";
      }
    } else {
      if ($("#scores-grid")) {
        $("#scores-grid").innerHTML = `
          <div class="empty">
            Latest scores are not available yet.
            <br><small>The first daily snapshot is published at 23:50 CET.</small>
          </div>
        `;
      }

      if (status) status.textContent = "Waiting for daily snapshot";
    }

    console.error("Latest scores:", error);
  }
}

function centreUI() {
  let container = $("#match-centre")
    || $("#matchCentre")
    || document.querySelector(".match-centre")
    || document.querySelector("[data-match-centre]");

  if (!container) {
    const scores = $("#scores") || $("#scores-grid")?.closest("section");
    if (!scores?.parentNode) return null;

    container = document.createElement("section");
    container.id = "match-centre";
    container.className = "match-centre";
    container.innerHTML = `
      <div class="match-centre-header">
        <div>
          <div class="match-centre-title">European Match Centre</div>
        </div>
        <div id="match-centre-status" class="match-centre-status">● LIVE DATA</div>
      </div>
      <div id="match-centre-content" class="match-centre-content"></div>
    `;

    scores.parentNode.insertBefore(container, scores);
  }

  return {
    content: container.querySelector("#match-centre-content,.match-centre-content"),
    status: container.querySelector("#match-centre-status,.match-centre-status")
  };
}

function mcCard(event) {
  return `
    <article class="match-centre-card ${event.live ? "is-live" : ""}">
      <div class="match-centre-league">${esc(event.league)}</div>
      <div class="match-centre-teams">
        <div class="match-centre-team">${team(event.homeTeam)}</div>
        <div class="match-centre-score">
          <strong>${score(event, "home")} — ${score(event, "away")}</strong>
          <span class="${event.live ? "live" : ""}">
            ${esc(event.minute ? `${event.minute}'` : event.statusLong || event.status)}
          </span>
        </div>
        <div class="match-centre-team">${team(event.awayTeam)}</div>
      </div>
    </article>
  `;
}

function renderMatchCentre(data, options = {}) {
  const ui = centreUI();
  if (!ui || !data) return;

  const events = data.events || [];

  if (events.length) {
    ui.content.innerHTML = events.slice(0, 12).map(mcCard).join("");
  } else {
    ui.content.innerHTML = `
      <div class="match-centre-empty">
        No European matches are live right now.
        <br><small>Live data connection is working.</small>
      </div>
    `;
  }

  if (options.fallback) {
    ui.status.textContent = "● LAST AVAILABLE DATA";
  } else {
    ui.status.textContent = data.liveCount
      ? `● ${data.liveCount} LIVE`
      : "● LIVE DATA";
  }
}

async function loadMatchCentre() {
  const ui = centreUI();
  if (!ui) return;

  ui.status.textContent = "● CONNECTING…";

  try {
    const data = await getJSON("/api/match-centre");

    lastMatchCentreData = data;
    saveBrowserSnapshot("yepfootball_match_centre", data);
    renderMatchCentre(data);
  } catch (error) {
    const fallback = lastMatchCentreData || readBrowserSnapshot("yepfootball_match_centre");

    if (fallback) {
      renderMatchCentre(fallback, { fallback: true });
    } else {
      ui.status.textContent = "● DATA UNAVAILABLE";
      ui.content.innerHTML = `
        <div class="match-centre-empty">
          European Match Centre is temporarily unavailable.
          <br><small>Please try again shortly.</small>
        </div>
      `;
    }

    console.error("Match Centre:", error);
  }
}

async function loadFixtures() {
  try {
    const data = await getJSON("/api/fixtures");
    const events = data.events || [];

    if ($("#fixtures-grid")) {
      $("#fixtures-grid").innerHTML = events.length
        ? events.map(fixture).join("")
        : `<div class="empty">No upcoming fixtures found.</div>`;
    }
  } catch (error) {
    if ($("#fixtures-grid")) {
      $("#fixtures-grid").innerHTML = `<div class="empty">Fixtures are temporarily unavailable.</div>`;
    }
    console.error("Fixtures:", error);
  }
}

async function loadNews() {
  try {
    const data = await getJSON("/api/news");
    const articles = data.articles || [];

    if ($("#news-grid")) {
      $("#news-grid").innerHTML = articles.length
        ? articles.slice(0, 9).map(article => `
            <a class="news-card" href="${esc(article.link)}" target="_blank" rel="noopener">
              ${article.image ? `<img src="${esc(article.image)}" alt="" loading="lazy">` : ""}
              <div>
                <small>${esc(article.source || "Football news")}</small>
                <h3>${esc(article.title)}</h3>
                ${article.description ? `<p>${esc(article.description)}</p>` : ""}
              </div>
              <span class="source">${article.published ? fmtDate(article.published) : "Latest"}</span>
            </a>
          `).join("")
        : `<div class="empty">No news available right now.</div>`;
    }
  } catch (error) {
    if ($("#news-grid")) {
      $("#news-grid").innerHTML = `<div class="empty">News feed is temporarily unavailable.</div>`;
    }
    console.error("News:", error);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  labels();
  tabs();

  if ($("#year")) {
    $("#year").textContent = new Date().getFullYear();
  }

  // Load immediately.
  loadScores();
  loadMatchCentre();
  loadFixtures();
  loadNews();

  // Live Match Centre: refresh frequently, but keep the previous data if a request fails.
  setInterval(loadMatchCentre, 30000);

  // Fixtures and news can be refreshed less frequently.
  setInterval(loadFixtures, 900000);
  setInterval(loadNews, 1800000);

  // Latest Scores is a daily KV snapshot, so it does not need constant polling.
  // Check periodically so a browser left open around 23:50 can pick up the new snapshot.
  setInterval(loadScores, 300000);
});
