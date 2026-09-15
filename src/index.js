export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Backend endpoint for fetching scores securely
    if (url.pathname === "/api/scores") {
      try {
        const apiKey = env.FOOTBALL_API_KEY || "";
        const apiResponse = await fetch("https://api.football-data.org/v4/matches", {
          headers: { "X-Auth-Token": apiKey }
        });

        if (!apiResponse.ok) {
          throw new Error(`API returned status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: "Failed to load live data", details: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Serve static files from /public via the ASSETS binding
    return env.ASSETS.fetch(request);
  }
};
