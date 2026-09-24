/* =========================================================
   YepFootball
   Frontend application
   Scores / Fixtures / News / Videos
   ========================================================= */


/* =========================================================
   LEAGUES
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


const SCORE_LEAGUE_IDS =
  new Set(
    LEAGUES
      .filter(
        league => league.id !== null
      )
      .map(
        league => league.id
      )
  );


/* =========================================================
   CURRENT LEAGUE
   ========================================================= */

let currentLeague = null;


/* =========================================================
   VIDEO CATEGORIES
   ========================================================= */

const VIDEO_CATEGORIES = [
  "UEFA",
  "Premier League",
  "LaLiga"
];


let allVideos = [];


/* =========================================================
   HTML ESCAPE
   ========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


/* =========================================================
   DATE FORMAT
   ========================================================= */

function formatDate(date) {

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
      weekday: "short",
      day: "numeric",
      month: "short"
    }
  );
}


/* =========================================================
   LONG DATE FORMAT
   ========================================================= */

function formatLongDate(date) {

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
      day: "numeric",
      month: "long",
      year: "numeric"
    }
  );
}


/* =========================================================
   TIME FORMAT
   ========================================================= */

function formatTime(date) {

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
      hour: "2-digit",
      minute: "2-digit"
    }
  );
}


/* =========================================================
   FETCH JSON
   ========================================================= */

async function fetchJSON(url) {

  const response =
    await fetch(
      url,
      {
        cache: "no-store"
      }
    );


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

function updateYear() {

  const year =
    document.getElementById(
      "year"
    );


  if (year) {

    year.textContent =
      new Date().getFullYear();
  }
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
    LEAGUES
      .map(
        league => {

          const active =
            league.id ===
            currentLeague
              ? " active"
              : "";


          return `
            <button
              type="button"
              class="tab${active}"
              data-league-id="${
                league.id ?? ""
              }"
            >
              ${escapeHTML(
                league.name
              )}
            </button>
          `;
        }
      )
      .join("");


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


/* =========================================================
   SCORE STATUS
   ========================================================= */

function getScoreStatusText(
  match
) {

  const status =
    String(
      match?.status || ""
    ).toUpperCase();


  if (
    status === "FINISHED" ||
    status === "FT" ||
    status === "AET" ||
    status === "PEN"
  ) {

    return "FT";
  }


  if (
    [
      "1H",
      "2H",
      "HT",
      "ET",
      "P"
    ].includes(status)
  ) {

    return "LIVE";
  }


  if (
    status === "TIMED" ||
    status === "NS"
  ) {

    return "UPCOMING";
  }


  return status || "";
}


/* =========================================================
   SCORE CARD
   ========================================================= */

function scoreCard(
  match
) {

  const home =
    match.homeTeam || {};


  const away =
    match.awayTeam || {};


  const homeName =
    home.shortName ||
    home.name ||
    "Home";


  const awayName =
    away.shortName ||
    away.name ||
    "Away";


  const homeScore =
    match.homeScore ??
    "–";


  const awayScore =
    match.awayScore ??
    "–";


  const status =
    getScoreStatusText(
      match
    );


  return `
    <article class="score-card">

      <div class="card-top">

        <span>
          ${escapeHTML(
            match.league || ""
          )}
        </span>

        <b>
          ${escapeHTML(
            status
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
              homeName
            )}
          </strong>

        </div>


        <div class="score">

          <span>
            ${escapeHTML(
              homeScore
            )}
          </span>

          <span>–</span>

          <span>
            ${escapeHTML(
              awayScore
            )}
          </span>

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
              awayName
            )}
          </strong>

        </div>

      </div>

    </article>
  `;
}


/* =========================================================
   SCORE LEAGUE HEADING
   ========================================================= */

function scoreLeagueHeading(
  leagueName,
  date
) {

  return `
    <div class="score-day-heading">

      <span>
        ${escapeHTML(
          leagueName
        )}
      </span>

      <small>
        ${escapeHTML(
          formatLongDate(
            date
          )
        )}
      </small>

    </div>
  `;
}


/* =========================================================
   GROUP SCORES BY LEAGUE
   ========================================================= */

function groupScoresByLeague(
  events
) {

  const groups =
    new Map();


  events.forEach(
    match => {

      const leagueId =
        Number(
          match?.leagueId
        );


      if (
        !SCORE_LEAGUE_IDS.has(
          leagueId
        )
      ) {
        return;
      }


      if (
        currentLeague !== null &&
        leagueId !==
          currentLeague
      ) {
        return;
      }


      if (
        !groups.has(
          leagueId
        )
      ) {

        groups.set(
          leagueId,
          []
        );
      }


      groups
        .get(leagueId)
        .push(match);

    }
  );


  return groups;
}


/* =========================================================
   LEAGUE ORDER
   ========================================================= */

function leagueOrder(
  leagueId
) {

  const index =
    LEAGUES.findIndex(
      league =>
        Number(
          league.id
        ) ===
        Number(
          leagueId
        )
    );


  return index < 0
    ? 999
    : index;
}


/* =========================================================
   RENDER SCORES
   ========================================================= */

function renderScores(
  events
) {

  const grid =
    document.getElementById(
      "scores-grid"
    );


  if (!grid) {
    return;
  }


  if (!events.length) {

    grid.innerHTML = `
      <div class="empty">
        No scores available
        for the selected
        competition.
      </div>
    `;

    return;
  }


  const groups =
    groupScoresByLeague(
      events
    );


  if (!groups.size) {

    grid.innerHTML = `
      <div class="empty">
        No scores available
        for the selected
        competition.
      </div>
    `;

    return;
  }


  const orderedGroups =
    [
      ...groups.entries()
    ]
      .sort(
        (a, b) =>
          leagueOrder(
            a[0]
          ) -
          leagueOrder(
            b[0]
          )
      );


  let html = "";


  orderedGroups.forEach(
    ([leagueId, matches]) => {

      const league =
        LEAGUES.find(
          item =>
            Number(
              item.id
            ) ===
            Number(
              leagueId
            )
        );


      const leagueName =
        league?.name ||
        matches[0]?.league ||
        "Football";


      const dates =
        matches
          .map(
            match =>
              new Date(
                match.date || 0
              )
          )
          .filter(
            date =>
              !Number.isNaN(
                date.getTime()
              )
          )
          .sort(
            (a, b) =>
              b.getTime() -
              a.getTime()
          );


      const latestDate =
        dates.length
          ? dates[0]
          : null;


      matches.sort(
        (a, b) =>
          new Date(
            a.date || 0
          ) -
          new Date(
            b.date || 0
          )
      );


      html +=
        scoreLeagueHeading(
          leagueName,
          latestDate
        );


      html +=
        matches
          .map(
            scoreCard
          )
          .join("");

    }
  );


  grid.innerHTML =
    html;
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

    if (status) {

      status.textContent =
        "Loading…";
    }


    const data =
      await fetchJSON(
        "/api/scores"
      );


    if (
      data &&
      data.ok === false
    ) {

      throw new Error(
        data.error ||
        "Scores API error"
      );
    }


    let events = [];


    /*
     * Latest available scores.
     */

    if (
      Array.isArray(
        data.latestAvailable
      ) &&
      data.latestAvailable.length
    ) {

      events =
        data.latestAvailable;

    }


    /*
     * Standard events.
     */

    else if (
      Array.isArray(
        data.events
      )
    ) {

      events =
        data.events;
    }


    /*
     * Finished fallback.
     */

    else if (
      Array.isArray(
        data.finished
      )
    ) {

      events =
        data.finished;
    }


    /*
     * Only use supported
     * YepFootball competitions.
     */

    events =
      events.filter(
        match =>
          SCORE_LEAGUE_IDS.has(
            Number(
              match?.leagueId
            )
          )
      );


    /*
     * Selected competition.
     */

    if (
      currentLeague !== null
    ) {

      events =
        events.filter(
          match =>
            Number(
              match?.leagueId
            ) ===
            currentLeague
        );
    }


    renderScores(
      events
    );


    if (status) {

      status.textContent =
        `${events.length} ${
          events.length === 1
            ? "match"
            : "matches"
        }`;
    }


  } catch (error) {

    console.error(
      "YepFootball scores:",
      error
    );


    grid.innerHTML = `
      <div class="empty">
        Unable to load scores.
      </div>
    `;


    if (status) {

      status.textContent =
        "Scores unavailable";
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
    match.homeTeam || {};


  const away =
    match.awayTeam || {};


  const homeName =
    home.shortName ||
    home.name ||
    "Home";


  const awayName =
    away.shortName ||
    away.name ||
    "Away";


  return `
    <article class="fixture-card">

      <div class="fixture-top">

        <span>
          ${escapeHTML(
            match.league || ""
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
              homeName
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
              awayName
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


  const message =
    document.getElementById(
      "fixtures-message"
    );


  const windowElement =
    document.getElementById(
      "fixtures-window"
    );


  try {

    grid.innerHTML = `
      <div class="empty">
        Loading fixtures…
      </div>
    `;


    /*
     * IMPORTANT:
     * Use fixtures-v2.
     */

    const data =
      await fetchJSON(
        "/api/fixtures-v2"
      );


    let fixtures =
      Array.isArray(
        data.fixtures
      )
        ? data.fixtures
        : [];


    /*
     * Events fallback.
     */

    if (
      !fixtures.length &&
      Array.isArray(
        data.events
      )
    ) {

      fixtures =
        data.events;
    }


    fixtures =
      fixtures.filter(
        match =>
          SCORE_LEAGUE_IDS.has(
            Number(
              match?.leagueId
            )
          )
      );


    fixtures.sort(
      (a, b) =>
        new Date(
          a.date || 0
        ) -
        new Date(
          b.date || 0
        )
    );


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


    if (message) {

      if (data.message) {

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


    if (!fixtures.length) {

      grid.innerHTML = `
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
      "YepFootball fixtures:",
      error
    );


    grid.innerHTML = `
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


  const image =
    article.image ||
    "";


  return `
    <article class="news-card">

      ${
        image
          ? `
            <a
              href="${escapeHTML(
                link
              )}"
              target="_blank"
              rel="noopener noreferrer"
            >

              <img
                src="${escapeHTML(
                  image
                )}"
                alt=""
                loading="lazy"
              >

            </a>
          `
          : ""
      }


      <div class="news-meta">
        BBC SPORT
      </div>


      <h3>

        <a
          href="${escapeHTML(
            link
          )}"
          target="_blank"
          rel="noopener noreferrer"
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

    const data =
      await fetchJSON(
        "/api/news"
      );


    const articles =
      Array.isArray(
        data.articles
      )
        ? data.articles
        : [];


    if (!articles.length) {

      grid.innerHTML = `
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
      "YepFootball news:",
      error
    );


    grid.innerHTML = `
      <div class="empty">
        Unable to load news.
      </div>
    `;
  }
}


/* =========================================================
   VIDEO CATEGORY
   ========================================================= */

function normaliseVideoCategory(
  value
) {

  const text =
    String(
      value || ""
    ).toLowerCase();


  if (
    text.includes("uefa") ||
    text.includes("champions")
  ) {

    return "UEFA";
  }


  if (
    text.includes("premier") ||
    text.includes("epl")
  ) {

    return "Premier League";
  }


  if (
    text.includes("laliga") ||
    text.includes("la liga")
  ) {

    return "LaLiga";
  }


  return value ||
    "Football";
}


/* =========================================================
   YOUTUBE VIDEO ID
   ========================================================= */

function getYouTubeVideoId(
  url
) {

  if (!url) {
    return "";
  }


  const text =
    String(url);


  /*
   * YouTube watch URL
   */

  const watchMatch =
    text.match(
      /[?&]v=([^&]+)/i
    );


  if (watchMatch) {

    return watchMatch[1];
  }


  /*
   * YouTube short URL
   */

  const shortMatch =
    text.match(
      /youtu\.be\/([^?&/]+)/i
    );


  if (shortMatch) {

    return shortMatch[1];
  }


  /*
   * YouTube embed URL
   */

  const embedMatch =
    text.match(
      /youtube\.com\/embed\/([^?&/]+)/i
    );


  if (embedMatch) {

    return embedMatch[1];
  }


  return "";
}


/* =========================================================
   VIDEO THUMBNAIL
   ========================================================= */

function getVideoThumbnail(
  video
) {

  /*
   * API supplied thumbnail.
   */

  if (
    video.thumbnail
  ) {

    return video.thumbnail;
  }


  if (
    video.thumbnailUrl
  ) {

    return video.thumbnailUrl;
  }


  if (
    video.image
  ) {

    return video.image;
  }


  /*
   * Video ID.
   */

  let videoId =
    video.videoId ||
    video.youtubeId ||
    "";


  /*
   * Extract from URL.
   */

  if (!videoId) {

    videoId =
      getYouTubeVideoId(
        video.url ||
        video.link ||
        video.videoUrl ||
        ""
      );
  }


  /*
   * Standard YouTube
   * thumbnail.
   */

  if (videoId) {

    return `
      https://i.ytimg.com/vi/${
        encodeURIComponent(
          videoId
        )
      }/hqdefault.jpg
    `;
  }


  return "";
}


/* =========================================================
   VIDEO URL
   ========================================================= */

/* =========================================================
   VIDEO URL
   ========================================================= */

function getVideoURL(
  video
) {

  const category =
    normaliseVideoCategory(
      video.category ||
      video.source ||
      video.competition
    );


  /*
   * UEFA videos:
   * always open the official UEFA
   * YouTube channel.
   */
  if (
    category === "UEFA"
  ) {

    return "https://www.youtube.com/@uefa";
  }


  /*
   * Premier League and LaLiga:
   * use the actual video URL supplied
   * by the API.
   */

  if (
    video.url
  ) {

    return video.url;
  }


  if (
    video.link
  ) {

    return video.link;
  }


  if (
    video.videoUrl
  ) {

    return video.videoUrl;
  }


  if (
    video.videoId
  ) {

    return `
      https://www.youtube.com/watch?v=${
        encodeURIComponent(
          video.videoId
        )
      }
    `;
  }


  if (
    video.youtubeId
  ) {

    return `
      https://www.youtube.com/watch?v=${
        encodeURIComponent(
          video.youtubeId
        )
      }
    `;
  }


  return "#";
}

/* =========================================================
   VIDEO CARD
   ========================================================= */

function videoCard(
  video
) {

  const title =
    video.title ||
    "Football video";


  const category =
    normaliseVideoCategory(
      video.category ||
      video.source ||
      video.competition
    );


  const thumbnail =
    getVideoThumbnail(
      video
    );


  const url =
    getVideoURL(
      video
    );


  return `
    <article class="video-card">


      <a
        class="video-image"
        href="${escapeHTML(
          url
        )}"
        target="_blank"
        rel="noopener noreferrer"
      >


        ${
          thumbnail
            ? `
              <img
                src="${escapeHTML(
                  thumbnail
                )}"
                alt="${escapeHTML(
                  title
                )}"
                loading="lazy"
                onerror="
                  this.style.display='none';
                  this.parentElement.classList.add(
                    'video-no-image'
                  );
                "
              >
            `
            : `
              <div class="video-placeholder">
                ⚽
              </div>
            `
        }


        <span
          class="video-play"
          aria-label="Play video"
        >
          ▶
        </span>


      </a>


      <div class="video-content">


        <div class="video-meta">

          ${escapeHTML(
            category
          )}

        </div>


        <h3>

          <a
            href="${escapeHTML(
              url
            )}"
            target="_blank"
            rel="noopener noreferrer"
          >

            ${escapeHTML(
              title
            )}

          </a>

        </h3>


        ${
          video.published ||
          video.pubDate ||
          video.date
            ? `
              <small>
                ${escapeHTML(
                  formatDate(
                    video.published ||
                    video.pubDate ||
                    video.date
                  )
                )}
              </small>
            `
            : ""
        }


      </div>

    </article>
  `;
}


/* =========================================================
   VIDEO TABS
   ========================================================= */

function renderVideoSectionHeader() {

  const container =
    document.getElementById(
      "video-tabs"
    );


  if (!container) {
    return;
  }


  container.innerHTML = `

    <button
      type="button"
      class="video-tab active"
      data-video-category="ALL"
    >
      All
    </button>


    <button
      type="button"
      class="video-tab"
      data-video-category="UEFA"
    >
      UEFA
    </button>


    <button
      type="button"
      class="video-tab"
      data-video-category="Premier League"
    >
      Premier League
    </button>


    <button
      type="button"
      class="video-tab"
      data-video-category="LaLiga"
    >
      LaLiga
    </button>

  `;


  container
    .querySelectorAll(
      ".video-tab"
    )
    .forEach(
      button => {

        button.addEventListener(
          "click",
          () => {

            container
              .querySelectorAll(
                ".video-tab"
              )
              .forEach(
                tab =>
                  tab.classList.remove(
                    "active"
                  )
              );


            button.classList.add(
              "active"
            );


            filterVideos(
              button.dataset
                .videoCategory
            );

          }
        );
      }
    );
}


/* =========================================================
   FILTER VIDEOS
   ========================================================= */

function filterVideos(
  category
) {

  const grid =
    document.getElementById(
      "videos-grid"
    ) ||
    document.getElementById(
      "video-grid"
    );


  if (!grid) {
    return;
  }


  let videos =
    allVideos;


  if (
    category &&
    category !== "ALL"
  ) {

    videos =
      allVideos.filter(
        video =>
          normaliseVideoCategory(
            video.category ||
            video.source ||
            video.competition
          ) ===
          category
      );
  }


  if (!videos.length) {

    grid.innerHTML = `
      <div class="empty">
        No videos available.
      </div>
    `;

    return;
  }


  grid.innerHTML =
    videos
      .map(
        videoCard
      )
      .join("");
}


/* =========================================================
   LOAD VIDEOS
   ========================================================= */

async function loadVideos() {

  const grid =
    document.getElementById(
      "videos-grid"
    ) ||
    document.getElementById(
      "video-grid"
    );


  if (!grid) {
    return;
  }


  try {

    grid.innerHTML = `
      <div class="empty">
        Loading latest videos…
      </div>
    `;


    /*
     * YepFootball video API.
     */

    const data =
      await fetchJSON(
        "/api/videos"
      );


    /*
     * Accept several possible
     * API response structures.
     */

    if (
      Array.isArray(
        data.videos
      )
    ) {

      allVideos =
        data.videos;

    }

    else if (
      Array.isArray(
        data.items
      )
    ) {

      allVideos =
        data.items;

    }

    else if (
      Array.isArray(
        data.results
      )
    ) {

      allVideos =
        data.results;

    }

    else {

      allVideos = [];
    }


    /*
     * Only requested competitions.
     */

    allVideos =
      allVideos.filter(
        video =>
          VIDEO_CATEGORIES.includes(
            normaliseVideoCategory(
              video.category ||
              video.source ||
              video.competition
            )
          )
      );


    /*
     * Sort newest first.
     */

    allVideos.sort(
      (a, b) => {

        const dateA =
          new Date(
            a.published ||
            a.pubDate ||
            a.date ||
            0
          ).getTime();


        const dateB =
          new Date(
            b.published ||
            b.pubDate ||
            b.date ||
            0
          ).getTime();


        return dateB -
          dateA;
      }
    );


    /*
     * Keep two latest videos
     * for each competition.
     */

    const selected = [];


    VIDEO_CATEGORIES.forEach(
      category => {

        const categoryVideos =
          allVideos
            .filter(
              video =>
                normaliseVideoCategory(
                  video.category ||
                  video.source ||
                  video.competition
                ) ===
                category
            )
            .slice(
              0,
              2
            );


        selected.push(
          ...categoryVideos
        );

      }
    );


    /*
     * Sort the six selected
     * videos by publication date.
     */

    selected.sort(
      (a, b) => {

        const dateA =
          new Date(
            a.published ||
            a.pubDate ||
            a.date ||
            0
          ).getTime();


        const dateB =
          new Date(
            b.published ||
            b.pubDate ||
            b.date ||
            0
          ).getTime();


        return dateB -
          dateA;
      }
    );


    allVideos =
      selected;


    /*
     * Create category tabs.
     */

    renderVideoSectionHeader();


    /*
     * Display all videos.
     */

    filterVideos(
      "ALL"
    );


  } catch (error) {

    console.error(
      "YepFootball videos:",
      error
    );


    grid.innerHTML = `
      <div class="empty">
        Latest videos are
        temporarily unavailable.
      </div>
    `;
  }
}


/* =========================================================
   INITIALISE
   ========================================================= */

function initYepFootball() {

  updateYear();

  renderLeagueTabs();

  loadScores();

  loadFixtures();

  loadNews();

  loadVideos();
}


/* =========================================================
   START
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initYepFootball
  );

} else {

  initYepFootball();
}


/* =========================================================
   AUTOMATIC REFRESH
   ========================================================= */


/*
 * Scores:
 * every 2 minutes.
 */

setInterval(
  () => {

    loadScores();

  },
  2 * 60 * 1000
);


/*
 * Fixtures:
 * every 15 minutes.
 */

setInterval(
  () => {

    loadFixtures();

  },
  15 * 60 * 1000
);


/*
 * BBC News:
 * every 30 minutes.
 */

setInterval(
  () => {

    loadNews();

  },
  30 * 60 * 1000
);


/*
 * Videos:
 * every 30 minutes.
 */

setInterval(
  () => {

    loadVideos();

  },
  30 * 60 * 1000
);
