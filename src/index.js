/* =====================================================
   YEPFOOTBALL — OFFICIAL VIDEO FEEDS
   UEFA / Premier League / LaLiga
   Uses official YouTube RSS feeds
   No additional API key required
===================================================== */

const VIDEO_CHANNELS = {
  UEFA: {
    name: "UEFA",
    channelId: "UCyGa1YEx9ST66rYrJTGIKOw"
  },

  "Premier League": {
    name: "Premier League",
    channelId: "UCG5qGWdu8nIRZqJ_GgDwQ-w"
  },

  LaLiga: {
    name: "LaLiga",
    channelId: "UCTv-XvfzLX3i4IGWAm4sbmA"
  }
};


/* -----------------------------------------------------
   Decode basic XML entities
----------------------------------------------------- */

function decodeXmlEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}


/* -----------------------------------------------------
   Extract XML tag value
----------------------------------------------------- */

function xmlTag(xml, tag) {
  const re = new RegExp(
    `<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,
    "i"
  );

  const match = xml.match(re);

  return match
    ? decodeXmlEntities(match[1].trim())
    : "";
}


/* -----------------------------------------------------
   Extract attribute
----------------------------------------------------- */

function xmlAttribute(xml, tag, attribute) {
  const re = new RegExp(
    `<${tag}\\b[^>]*\\b${attribute}=["']([^"']+)["']`,
    "i"
  );

  const match = xml.match(re);

  return match
    ? decodeXmlEntities(match[1])
    : "";
}


/* -----------------------------------------------------
   Fetch official YouTube RSS feed
----------------------------------------------------- */

async function fetchYouTubeChannel(channelId, category) {

  const feedURL =
    `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  try {

    const response = await fetch(feedURL, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; YepFootball/1.0)"
      },
      cf: {
        cacheTtl: 1800,
        cacheEverything: true
      }
    });

    if (!response.ok) {
      throw new Error(
        `YouTube RSS returned ${response.status}`
      );
    }

    const xml = await response.text();

    const entries =
      xml.match(/<entry>[\s\S]*?<\/entry>/gi) || [];

    const videos = [];

    for (const entry of entries.slice(0, 5)) {

      const videoId =
        xmlTag(entry, "yt:videoId");

      const title =
        xmlTag(entry, "title");

      const published =
        xmlTag(entry, "published");

      const updated =
        xmlTag(entry, "updated");

      const thumbnail =
        xmlAttribute(
          entry,
          "media:thumbnail",
          "url"
        );

      const link =
        xmlAttribute(
          entry,
          "link",
          "href"
        );

      if (!videoId) {
        continue;
      }

      const videoURL =
        link ||
        `https://www.youtube.com/watch?v=${videoId}`;

      const imageURL =
        thumbnail ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      videos.push({
        id: videoId,

        category,

        title:
          title ||
          `${category} video`,

        published:
          published ||
          updated ||
          null,

        updated:
          updated ||
          published ||
          null,

        thumbnail:
          imageURL,

        image:
          imageURL,

        videoId,

        url:
          videoURL,

        videoURL
      });
    }

    return videos;

  } catch (error) {

    console.error(
      `Video feed error for ${category}:`,
      error
    );

    return [];
  }
}


/* -----------------------------------------------------
   /api/videos
----------------------------------------------------- */

async function videos(request) {

  const results =
    await Promise.all(
      Object.entries(VIDEO_CHANNELS).map(
        async ([category, config]) => {

          return fetchYouTubeChannel(
            config.channelId,
            category
          );

        }
      )
    );

  const allVideos =
    results
      .flat()
      .sort((a, b) => {

        const dateA =
          new Date(a.published || 0).getTime();

        const dateB =
          new Date(b.published || 0).getTime();

        return dateB - dateA;
      });

  return new Response(
    JSON.stringify({
      ok: true,

      source:
        "Official YouTube RSS feeds",

      categories: [
        "UEFA",
        "Premier League",
        "LaLiga"
      ],

      videos:
        allVideos,

      count:
        allVideos.length,

      updated:
        new Date().toISOString()
    }),
    {
      status: 200,

      headers: {
        "Content-Type":
          "application/json; charset=utf-8",

        "Cache-Control":
          "public, max-age=900"
      }
    }
  );
}
export default {
  fetch: handle
};
