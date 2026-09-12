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

function tabs() {
  $("#league-tabs").innerHTML = Object.entries(leagues)
    .map(([k, v]) =>
      `<button class="tab ${k === selected ? "active" : ""}" data-league="${k}">${v.name}</button>`
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
        "Accept": "application/json"
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

  if (
    ["FINISHED", "AWARDED"].includes(e.status)
  ) {
    return (
      fullTime[side] ??
      regularTime[side] ??
      "-"
    );
  }

  if (
    ["IN_PLAY", "PAUSED"].includes(e.status)
  ) {
    return (
      fullTime[side] ??
      regularTime[side] ??
      0
    );
  }

  return "-";
}

function statusLabel(e) {
  if (e.status === "IN_PLAY") {
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
    ["IN_PLAY", "PAUSED"].includes(e.status);

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
  const code =
    leagues[selected].code;

  if (!code)
    return events;

  return events.filter(
    e => e.leagueCode === code
  );
}

function renderScores(data) {

  const events =
    filterLeague(
      data.events || []
    );

  const live =
    filterLeague(
      data.live || []
    );

  const finished =
    filterLeague(
      data.finished || []
    );

  const upcoming =
    filterLeague(
      data.upcoming || []
    );

  if (!events.length) {

    $("#scores-grid").innerHTML = `
      <div class="empty">

        No matches scheduled today
        for ${esc(
          leagues[selected].name
        )}.

        <br>

        <small>
          See Upcoming Fixtures
          for the next matches.
        </small>

      </div>
    `;

    return;
  }

  const sections = [];

  if (live.length) {

    sections.push(`
      <div class="score-group">

        <h3>
          🔴 LIVE NOW
        </h3>

        ${live
          .map(eventCard)
          .join("")}

      </div>
    `);
  }

  if (finished.length) {

    sections.push(`
      <div class="score-group">

        <h3>
          FINISHED TODAY
        </h3>

        ${finished
          .map(eventCard)
          .join("")}

      </div>
    `);
  }

  if (upcoming.length) {

    sections.push(`
      <div class="score-group">

        <h3>
          TODAY'S MATCHES
        </h3>

        ${upcoming
          .map(eventCard)
          .join("")}

      </div>
    `);
  }

  $("#scores-grid").innerHTML =
    sections.join("");
}

async function loadScores() {

  $("#scores-status")
    .textContent = "Updating…";

  try {

    const data =
      await getJSON(
        "/api/scores"
      );

    renderScores(data);

    const events =
      filterLeague(
        data.events || []
      );

    const live =
      filterLeague(
        data.live || []
      );

    const time =
      new Date().toLocaleTimeString(
        [],
        {
          hour: "2-digit",
          minute: "2-digit"
        }
      );

    $("#scores-status")
      .textContent = live.length
        ? `${live.length} LIVE · Updated ${time}`
        : `${events.length} matches · Updated ${time}`;

    $("#updated")
      .textContent =
        `Scores updated ${time}`;

  } catch (e) {

    $("#scores-grid").innerHTML = `
      <div class="empty">
        Scores are temporarily
        unavailable.
        Please try again shortly.
      </div>
    `;

    $("#scores-status")
      .textContent =
      "Feed unavailable";
  }
}

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

    $("#fixtures-grid")
      .innerHTML = `
        <div class="empty">
          Fixtures are temporarily
          unavailable.
        </div>
      `;
  }
}

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
            .map(n => `

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

            `)
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
  }
}

document.addEventListener(
  "DOMContentLoaded",
  () => {

    tabs();

    $("#year")
      .textContent =
      new Date().getFullYear();

    loadScores();
    loadFixtures();
    loadNews();

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

    // Scores: every 30 seconds
    setInterval(
      loadScores,
      30000
    );

    // Fixtures: every 15 minutes
    setInterval(
      loadFixtures,
      900000
    );

    // BBC News: every 30 minutes
    setInterval(
      loadNews,
      1800000
    );

  }
);
