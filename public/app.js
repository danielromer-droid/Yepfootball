document.addEventListener("DOMContentLoaded", () => {
  fetchScores();
});

async function fetchScores() {
  const container = document.getElementById("matches-container");
  try {
    const res = await fetch("/api/scores");
    const data = await res.json();
    
    if (!data.matches || data.matches.length === 0) {
      container.innerHTML = "<p>No matches found today.</p>";
      return;
    }

    container.innerHTML = data.matches.map(m => `
      <div class="match-card">
        <strong>${m.homeTeam.name} ${m.score.fullTime.home ?? 0} - ${m.score.fullTime.away ?? 0} ${m.awayTeam.name}</strong>
        <div>Status: ${m.status}</div>
      </div>
    `).join("");
  } catch (err) {
    container.innerHTML = "<p>Error fetching real-time data.</p>";
  }
}
