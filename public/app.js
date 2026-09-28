/* =========================================================
   YepFootball — front end
   Briefing / Ticker / Scores / Fixtures / News / Videos
   ========================================================= */

"use strict";

/* ---------------- Config ---------------- */

const LEAGUES = [
  { id: 2,   code: "CL",  name: "Champions League",  short: "UCL",        color: "#3b82f6" },
  { id: 3,   code: "EL",  name: "Europa League",     short: "UEL",        color: "#f97316" },
  { id: 848, code: "ECL", name: "Conference League", short: "UECL",       color: "#22c55e" },
  { id: 39,  code: "PL",  name: "Premier League",    short: "Premier Lg", color: "#a855f7" },
  { id: 140, code: "PD",  name: "La Liga",           short: "La Liga",    color: "#ef4444" },
  { id: 135, code: "SA",  name: "Serie A",           short: "Serie A",    color: "#06b6d4" },
  { id: 78,  code: "BL1", name: "Bundesliga",        short: "Bundesliga", color: "#e11d48" },
  { id: 61,  code: "FL1", name: "Ligue 1",           short: "Ligue 1",    color: "#eab308" }
];

const LEAGUE_BY_ID = new Map(LEAGUES.map(l => [l.id, l]));
const VIDEO_CATEGORIES = ["UEFA", "Premier League", "LaLiga"];

// These channels open on YouTube instead of playing inline
// (kept from the previous site behaviour for UEFA).
const OPEN_ON_YOUTUBE = new Set(["UEFA"]);

const FINISHED = new Set(["FINISHED", "FT", "AET", "PEN", "AWARDED", "FINISHED_AET", "FINISHED_PEN"]);
const LIVE = new Set(["1H", "2H", "HT", "ET", "BT", "P", "LIVE", "IN_PLAY", "PAUSED", "INT"]);

const FIXTURES_PAGE = 40;

const state = {
  scores: null,
  scoresLeague: null,
  fixtures: [],
  fixturesLeague: null,
  fixturesShown: FIXTURES_PAGE,
  videos: [],
  videoCategory: "ALL"
};

/* ---------------- Helpers ---------------- */

const $ = id => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const toDate = value => {
  const d = new Date(value || 0);
  return Number.isNaN(d.getTime()) || !value ? null : d;
};

const fmtTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const fmtDay = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
const fmtLongDay = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long" });

function dayKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function relativeDay(date) {
  if (!date) return "";
  const today = new Date();
  const diff = Math.round(
    (new Date(date.getFullYear(), date.getMonth(), date.getDate()) -
      new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return fmtDay.format(date);
}

function timeAgo(value) {
  const date = toDate(value);
  if (!date) return "";
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return fmtDay.format(date);
}

async function api(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (!data) throw new Error(`${url} returned ${response.status}`);
  return data;
}

const isLive = m => LIVE.has(String(m?.status || "").toUpperCase());
const isFinished = m => FINISHED.has(String(m?.status || "").toUpperCase());
const teamName = t => t?.shortName || t?.name || "TBC";

function initials(name) {
  return esc(
    String(name || "?")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0])
      .join("")
      .toUpperCase()
  );
}

function crest(team) {
  const name = teamName(team);
  if (team?.crest) {
    return `<img src="${esc(team.crest)}" alt="" loading="lazy" decoding="async" width="26" height="26" data-initials="${initials(name)}">`;
  }
  return `<span class="crest-fallback" aria-hidden="true">${initials(name)}</span>`;
}

function statusLabel(m) {
  if (isLive(m)) {
    const s = String(m.status).toUpperCase();
    if (s === "HT") return "HT";
    return m.minute != null ? `${m.minute}'` : "Live";
  }
  if (isFinished(m)) return "FT";
  const d = toDate(m.date);
  return d ? fmtTime.format(d) : "TBC";
}

/* ---------------- Chips (shared) ---------------- */

function renderChips(container, options, current, onPick) {
  if (!container) return;
  container.innerHTML = options
    .map(
      o => `<button type="button" class="chip" data-value="${esc(o.value ?? "")}"
        aria-pressed="${String(o.value === current)}">
        ${o.color ? `<span class="league-mark" style="--mark:${o.color}"></span>` : ""}
        ${esc(o.label)}${o.count != null ? ` <span class="count">${o.count}</span>` : ""}
      </button>`
    )
    .join("");

  container.querySelectorAll(".chip").forEach(button => {
    button.addEventListener("click", () => {
      const raw = button.dataset.value;
      const option = options.find(o => String(o.value ?? "") === raw);
      onPick(option ? option.value : null);
    });
  });
}

function leagueOptions(matches) {
  const counts = new Map();
  matches.forEach(m => counts.set(Number(m.leagueId), (counts.get(Number(m.leagueId)) || 0) + 1));
  return [
    { value: null, label: "All", count: matches.length },
    ...LEAGUES.filter(l => counts.has(l.id)).map(l => ({
      value: l.id,
      label: l.name,
      color: l.color,
      count: counts.get(l.id)
    }))
  ];
}

/* ---------------- Match row ---------------- */

function matchRow(m, { showLeague = false } = {}) {
  const live = isLive(m);
  const played = live || isFinished(m);
  const hs = m.homeScore, as = m.awayScore;
  let homeClass = "", awayClass = "";

  if (isFinished(m) && hs != null && as != null && hs !== as) {
    homeClass = hs > as ? "winner" : "loser";
    awayClass = hs > as ? "loser" : "winner";
  }

  const home = teamName(m.homeTeam);
  const away = teamName(m.awayTeam);
  const score = played ? `${hs ?? "–"}–${as ?? "–"}` : "v";
  const league = LEAGUE_BY_ID.get(Number(m.leagueId));

  return `
    <li class="match${live ? " is-live" : ""}" aria-label="${esc(
      `${home} ${played ? `${hs ?? ""} ${away} ${as ?? ""}` : `versus ${away}`}, ${statusLabel(m)}`
    )}">
      <span class="m-status">${live ? '<span class="live-dot" aria-hidden="true"></span>' : ""}${esc(statusLabel(m))}</span>
      <span class="m-team home ${homeClass}"><span title="${esc(home)}">${esc(home)}</span>${crest(m.homeTeam)}</span>
      <span class="m-score${played ? "" : " vs"}">${esc(score)}</span>
      <span class="m-team away ${awayClass}">${crest(m.awayTeam)}<span title="${esc(away)}">${esc(away)}</span></span>
      ${showLeague && league ? `<span class="m-league">${esc(league.name)}</span>` : ""}
    </li>`;
}

/* ---------------- Hero date ---------------- */

function renderHeroDate() {
  const el = $("hero-date");
  if (el) el.textContent = fmtLongDay.format(new Date());
}

/* ---------------- AI briefing ---------------- */

async function loadBriefing() {
  try {
    const data = await api("/api/briefing");
    if (!data?.ok || !data.headline) return;

    $("brief-headline").textContent = data.headline;
    $("brief-summary").textContent = data.summary || "";

    const points = $("brief-points");
    const items = (data.points || []).filter(Boolean).slice(0, 3);
    points.innerHTML = items.map(p => `<li>${esc(p)}</li>`).join("");
    points.hidden = !items.length;

    const updated = toDate(data.updated);
    $("brief-note-text").textContent = data.ai
      ? `AI summary of the latest results and BBC Sport headlines${updated ? `, updated ${fmtTime.format(updated)}` : ""}. Check the scores below for the official record.`
      : `Summary of the latest results and headlines${updated ? `, updated ${fmtTime.format(updated)}` : ""}.`;
    $("brief-note").hidden = false;
  } catch (error) {
    console.warn("YepFootball briefing:", error);
  }
}

/* ---------------- Scores ---------------- */

function allScoreMatches() {
  const data = state.scores || {};
  const live = Array.isArray(data.live) ? data.live : [];
  const latest = Array.isArray(data.latestAvailable) && data.latestAvailable.length
    ? data.latestAvailable
    : Array.isArray(data.events) ? data.events : [];

  const liveIds = new Set(live.map(m => `${m.leagueId}-${m.homeTeam?.name}-${m.awayTeam?.name}`));
  const rest = latest.filter(m => !liveIds.has(`${m.leagueId}-${m.homeTeam?.name}-${m.awayTeam?.name}`));

  return [...live, ...rest].filter(m => LEAGUE_BY_ID.has(Number(m.leagueId)));
}

function renderScores() {
  const grid = $("scores-grid");
  const status = $("scores-status");
  const matches = allScoreMatches();

  renderChips($("league-tabs"), leagueOptions(matches), state.scoresLeague, value => {
    state.scoresLeague = value;
    renderScores();
  });

  const filtered = state.scoresLeague == null
    ? matches
    : matches.filter(m => Number(m.leagueId) === state.scoresLeague);

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">No recent scores for this competition yet. Try another competition or check back after the next matchday.</div>`;
  } else {
    const groups = new Map();
    filtered.forEach(m => {
      const id = Number(m.leagueId);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(m);
    });

    grid.innerHTML = LEAGUES.filter(l => groups.has(l.id))
      .map(league => {
        const list = groups.get(league.id).sort((a, b) => {
          if (isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
          return (toDate(a.date) || 0) - (toDate(b.date) || 0);
        });
        const liveCount = list.filter(isLive).length;
        const latest = list.map(m => toDate(m.date)).filter(Boolean).sort((a, b) => b - a)[0];
        const sub = liveCount
          ? `<small style="color:var(--live)"><span class="live-dot" aria-hidden="true"></span>${liveCount} live</small>`
          : `<small>${esc(relativeDay(latest))}</small>`;

        return `
          <article class="league-block">
            <header class="block-head">
              <h3><span class="league-mark" style="--mark:${league.color}"></span>${esc(league.name)}</h3>
              ${sub}
            </header>
            <ul class="match-list">${list.map(m => matchRow(m)).join("")}</ul>
          </article>`;
      })
      .join("");
  }

  const liveTotal = matches.filter(isLive).length;
  const updated = toDate(state.scores?.updated);
  status.innerHTML = liveTotal
    ? `<span class="live-dot" aria-hidden="true"></span>${liveTotal} live now`
    : updated ? `Updated ${esc(fmtTime.format(updated))}` : "";

  renderTicker(matches);
  renderFeatured(matches);
}

async function loadScores() {
  try {
    state.scores = await api("/api/scores");
    renderScores();
  } catch (error) {
    console.error("YepFootball scores:", error);
    if (!state.scores) {
      $("scores-grid").innerHTML = `<div class="empty">Scores could not be loaded. They will retry automatically in a minute.</div>`;
      $("scores-status").textContent = "Scores unavailable";
      $("ticker").innerHTML = `<span class="ticker-empty">Scores unavailable right now.</span>`;
    }
  }
  scheduleScores();
}

let scoresTimer = null;
function scheduleScores() {
  clearTimeout(scoresTimer);
  const anyLive = allScoreMatches().some(isLive);
  scoresTimer = setTimeout(() => {
    if (document.visibilityState === "visible") loadScores();
    else scheduleScores();
  }, anyLive ? 45000 : 120000);
}

/* ---------------- Ticker ---------------- */

function renderTicker(matches) {
  const track = $("ticker");
  if (!track) return;

  const items = matches
    .slice()
    .sort((a, b) => {
      if (isLive(a) !== isLive(b)) return isLive(a) ? -1 : 1;
      return (toDate(b.date) || 0) - (toDate(a.date) || 0);
    })
    .slice(0, 24);

  if (!items.length) {
    track.innerHTML = `<span class="ticker-empty">No recent scores yet.</span>`;
    return;
  }

  track.innerHTML = items
    .map(m => {
      const league = LEAGUE_BY_ID.get(Number(m.leagueId));
      const live = isLive(m);
      return `
        <a class="tick${live ? " is-live" : ""}" href="#scores">
          <span class="t-meta">${live ? '<span class="live-dot" aria-hidden="true"></span>' : ""}${esc(league?.short || m.league)} · ${esc(statusLabel(m))}</span>
          <span class="t-name">${esc(teamName(m.homeTeam))}</span><span class="t-goals">${esc(m.homeScore ?? "–")}</span>
          <span class="t-name">${esc(teamName(m.awayTeam))}</span><span class="t-goals">${esc(m.awayScore ?? "–")}</span>
        </a>`;
    })
    .join("");
}

/* ---------------- Featured match (hero scoreboard) ---------------- */

function renderFeatured(matches) {
  const box = $("hero-match");
  if (!box) return;

  const priority = id => { const i = LEAGUES.findIndex(l => l.id === Number(id)); return i < 0 ? 99 : i; };
  const goals = m => (Number(m.homeScore) || 0) + (Number(m.awayScore) || 0);

  const live = matches.filter(isLive).sort((a, b) => priority(a.leagueId) - priority(b.leagueId));
  let pick = live[0];

  if (!pick) {
    // Most recent day with results, then the top competition, then the most goals.
    const finished = matches.filter(isFinished);
    const newest = finished.map(m => toDate(m.date)).filter(Boolean).sort((a, b) => b - a)[0];
    pick = finished
      .filter(m => newest && dayKey(toDate(m.date) || new Date(0)) === dayKey(newest))
      .sort((a, b) => priority(a.leagueId) - priority(b.leagueId) || goals(b) - goals(a))[0];
  }

  if (!pick) {
    box.innerHTML = `
      <div class="sb-head"><span>Featured match</span></div>
      <div class="sb-body sb-loading"><span class="sb-digits">– : –</span></div>
      <div class="sb-foot">The next result will appear here.</div>`;
    return;
  }

  const league = LEAGUE_BY_ID.get(Number(pick.leagueId));
  const liveNow = isLive(pick);
  const date = toDate(pick.date);

  box.innerHTML = `
    <div class="sb-head">
      <span>${esc(league?.name || pick.league)}</span>
      <span class="sb-state${liveNow ? " live" : ""}">
        ${liveNow ? '<span class="live-dot" aria-hidden="true"></span>' : ""}${esc(liveNow ? statusLabel(pick) : "Full time")}
      </span>
    </div>
    <div class="sb-body">
      <div class="sb-team">${crest(pick.homeTeam)}<strong>${esc(teamName(pick.homeTeam))}</strong></div>
      <div class="sb-digits">${esc(pick.homeScore ?? "–")}:${esc(pick.awayScore ?? "–")}</div>
      <div class="sb-team">${crest(pick.awayTeam)}<strong>${esc(teamName(pick.awayTeam))}</strong></div>
    </div>
    <div class="sb-foot">${liveNow ? "In play now" : date ? `${esc(relativeDay(date))}, ${esc(fmtTime.format(date))} kick-off` : ""}</div>`;
}

/* ---------------- Fixtures ---------------- */

function renderFixtures() {
  const grid = $("fixtures-grid");
  const more = $("fixtures-more");

  renderChips($("fixture-tabs"), leagueOptions(state.fixtures), state.fixturesLeague, value => {
    state.fixturesLeague = value;
    state.fixturesShown = FIXTURES_PAGE;
    renderFixtures();
  });

  const filtered = state.fixturesLeague == null
    ? state.fixtures
    : state.fixtures.filter(m => Number(m.leagueId) === state.fixturesLeague);

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty">No fixtures scheduled for this competition in the next few weeks.</div>`;
    more.hidden = true;
    return;
  }

  const shown = filtered.slice(0, state.fixturesShown);
  const days = new Map();
  shown.forEach(m => {
    const d = toDate(m.date);
    const key = d ? dayKey(d) : "tbc";
    if (!days.has(key)) days.set(key, { date: d, matches: [] });
    days.get(key).matches.push(m);
  });

  grid.innerHTML = [...days.values()]
    .map(({ date, matches }) => `
      <article class="day-block">
        <header class="block-head">
          <h3>${esc(date ? relativeDay(date) : "Date to be confirmed")}</h3>
          <small>${date && ["Today", "Tomorrow"].includes(relativeDay(date)) ? `${esc(fmtDay.format(date))} · ` : ""}${matches.length} ${matches.length === 1 ? "match" : "matches"}</small>
        </header>
        <ul class="match-list">${matches.map(m => matchRow(m, { showLeague: state.fixturesLeague == null })).join("")}</ul>
      </article>`)
    .join("");

  more.hidden = filtered.length <= state.fixturesShown;
}

async function loadFixtures() {
  try {
    const data = await api("/api/fixtures-v2");
    let fixtures = Array.isArray(data.fixtures) && data.fixtures.length
      ? data.fixtures
      : Array.isArray(data.events) ? data.events : [];

    state.fixtures = fixtures
      .filter(m => LEAGUE_BY_ID.has(Number(m.leagueId)))
      .sort((a, b) => (toDate(a.date) || 0) - (toDate(b.date) || 0));

    const win = $("fixtures-window");
    if (data.from && data.to) {
      win.textContent = `${fmtDay.format(new Date(data.from))} – ${fmtDay.format(new Date(data.to))}`;
    } else {
      win.textContent = "";
    }

    const msg = $("fixtures-message");
    msg.textContent = data.message || "";
    msg.hidden = !data.message;

    renderFixtures();
  } catch (error) {
    console.error("YepFootball fixtures:", error);
    $("fixtures-grid").innerHTML = `<div class="empty">Fixtures could not be loaded. They will retry automatically.</div>`;
    $("fixtures-window").textContent = "";
  }
}

/* ---------------- News ---------------- */

async function loadNews() {
  const grid = $("news-grid");
  try {
    const data = await api("/api/news");
    const articles = (data.articles || data.news || []).filter(a => a.title && (a.link || a.url));

    if (!articles.length) {
      grid.innerHTML = `<div class="empty">No stories right now. News refreshes every 15 minutes.</div>`;
      return;
    }

    const [lead, ...rest] = articles;
    const link = a => esc(a.link || a.url);

    grid.innerHTML = `
      <a class="news-lead" href="${link(lead)}" target="_blank" rel="noopener noreferrer">
        <div class="img-wrap">${lead.image ? `<img src="${esc(lead.image)}" alt="" loading="lazy">` : ""}</div>
        <h3>${esc(lead.title)}</h3>
        ${lead.description ? `<p>${esc(lead.description)}</p>` : ""}
        <span class="news-time">BBC Sport · ${esc(timeAgo(lead.published))}</span>
      </a>
      <ul class="news-list">
        ${rest.slice(0, 7).map(a => `
          <li>
            <a class="news-item" href="${link(a)}" target="_blank" rel="noopener noreferrer">
              <span>
                <h3>${esc(a.title)}</h3>
                <span class="news-time">${esc(timeAgo(a.published))}</span>
              </span>
              ${a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy">` : "<span></span>"}
            </a>
          </li>`).join("")}
      </ul>`;

    const updated = toDate(data.updated);
    $("news-status").textContent = updated ? `Updated ${fmtTime.format(updated)}` : "";
  } catch (error) {
    console.error("YepFootball news:", error);
    grid.innerHTML = `<div class="empty">News could not be loaded. It will retry automatically.</div>`;
  }
}

/* ---------------- Videos ---------------- */

function normaliseCategory(value) {
  const v = String(value || "").toLowerCase();
  if (v.includes("uefa") || v.includes("champions")) return "UEFA";
  if (v.includes("premier")) return "Premier League";
  if (v.includes("laliga") || v.includes("la liga")) return "LaLiga";
  return value || "";
}

const PLAY_ICON = `<span class="play" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3 1.5v13L14 8z"/></svg></span>`;

function videoCard(v) {
  const category = normaliseCategory(v.category || v.source);
  const id = v.videoId || v.id;
  const url = v.url || v.videoURL || `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const thumb = v.thumbnail || v.image || (id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : "");
  const title = v.title || "Football video";
  const external = OPEN_ON_YOUTUBE.has(category) || !id;

  const media = external
    ? `<a class="video-thumb" href="${esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch on YouTube: ${esc(title)}">
         ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ""}${PLAY_ICON}
       </a>`
    : `<button type="button" class="video-thumb" data-video-id="${esc(id)}" aria-label="Play: ${esc(title)}">
         ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ""}${PLAY_ICON}
       </button>`;

  return `
    <article class="video-card">
      ${media}
      <div class="video-info">
        <small>${esc(category)} · ${esc(timeAgo(v.published))}</small>
        <strong>${esc(title)}</strong>
      </div>
    </article>`;
}

function renderVideos() {
  const grid = $("videos-grid");
  const available = VIDEO_CATEGORIES.filter(c => state.videos.some(v => normaliseCategory(v.category || v.source) === c));

  renderChips(
    $("video-tabs"),
    [{ value: "ALL", label: "All" }, ...available.map(c => ({ value: c, label: c }))],
    state.videoCategory,
    value => { state.videoCategory = value || "ALL"; renderVideos(); }
  );

  const list = state.videoCategory === "ALL"
    ? state.videos.slice(0, 6)
    : state.videos.filter(v => normaliseCategory(v.category || v.source) === state.videoCategory).slice(0, 6);

  grid.innerHTML = list.length
    ? list.map(videoCard).join("")
    : `<div class="empty">No videos from this channel right now.</div>`;
}

async function loadVideos() {
  try {
    const data = await api("/api/videos");
    const videos = (data.videos || data.items || data.results || [])
      .filter(v => VIDEO_CATEGORIES.includes(normaliseCategory(v.category || v.source)))
      .sort((a, b) => (toDate(b.published) || 0) - (toDate(a.published) || 0));

    if (!videos.length) return; // keep the static channel links

    // Two newest per channel for "All", everything for channel filters.
    const mixed = [];
    VIDEO_CATEGORIES.forEach(c =>
      mixed.push(...videos.filter(v => normaliseCategory(v.category || v.source) === c).slice(0, 2))
    );
    mixed.sort((a, b) => (toDate(b.published) || 0) - (toDate(a.published) || 0));
    const ids = new Set(mixed.map(v => v.videoId || v.id));

    state.videos = [...mixed, ...videos.filter(v => !ids.has(v.videoId || v.id))];
    renderVideos();
  } catch (error) {
    console.warn("YepFootball videos:", error);
  }
}

// Inline playback: swap the thumbnail for a privacy-enhanced player.
document.addEventListener("click", event => {
  const button = event.target.closest("button.video-thumb[data-video-id]");
  if (!button) return;
  const id = encodeURIComponent(button.dataset.videoId);
  const frame = document.createElement("iframe");
  frame.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
  frame.title = button.getAttribute("aria-label") || "Video player";
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  frame.allowFullscreen = true;
  const wrap = document.createElement("div");
  wrap.className = "video-thumb";
  wrap.appendChild(frame);
  button.replaceWith(wrap);
});

// Replace any crest that fails to load with the team's initials.
document.addEventListener("error", event => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement)) return;
  if (img.dataset.initials == null) { img.classList.add("img-failed"); return; }
  const span = document.createElement("span");
  span.className = "crest-fallback";
  span.setAttribute("aria-hidden", "true");
  span.textContent = img.dataset.initials;
  img.replaceWith(span);
}, true);

/* ---------------- Start ---------------- */

function init() {
  $("year").textContent = new Date().getFullYear();
  renderHeroDate();

  $("fixtures-more").addEventListener("click", () => {
    state.fixturesShown += FIXTURES_PAGE;
    renderFixtures();
  });

  loadScores();
  loadBriefing();
  loadFixtures();
  loadNews();
  loadVideos();

  setInterval(() => document.visibilityState === "visible" && loadFixtures(), 15 * 60 * 1000);
  setInterval(() => document.visibilityState === "visible" && loadNews(), 15 * 60 * 1000);
  setInterval(() => document.visibilityState === "visible" && loadBriefing(), 15 * 60 * 1000);
  setInterval(() => document.visibilityState === "visible" && loadVideos(), 30 * 60 * 1000);

  // Refresh straight away when someone returns to the tab.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadScores();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
