const leagues={
  all:{name:"All Europe",code:null},ucl:{name:"Champions League",code:"CL"},epl:{name:"Premier League",code:"PL"},
  laliga:{name:"La Liga",code:"PD"},seriea:{name:"Serie A",code:"SA"},bundesliga:{name:"Bundesliga",code:"BL1"},ligue1:{name:"Ligue 1",code:"FL1"}
};
let selected="all";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function fmtDate(v){try{return new Date(v).toLocaleString(undefined,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}catch{return v}}
function fmtTime(v){try{return new Date(v).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}catch{return ""}}
async function getJSON(url){
  const r=await fetch(`${url}${url.includes("?")?"&":"?"}_=${Date.now()}`,{headers:{Accept:"application/json"},cache:"no-store"});
  if(!r.ok){let d={};try{d=await r.json()}catch{}throw Error(d.detail||d.error||`HTTP ${r.status}`)}return r.json();
}
function tabs(){
  const c=$("#league-tabs");if(!c)return;
  c.innerHTML=Object.entries(leagues).map(([k,v])=>`<button class="tab ${k===selected?"active":""}" data-league="${k}">${v.name}</button>`).join("");
  c.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{selected=b.dataset.league;tabs();loadScores()});
}
function teamHtml(t){
  return `<span class="team-name">${t?.crest?`<img class="team-crest" src="${esc(t.crest)}" alt="" loading="lazy">`:""}${esc(t?.shortName||t?.name||"Team")}</span>`;
}
function scoreValue(e,side){
  const c=e.score?.current||{},f=e.score?.fullTime||{},r=e.score?.regularTime||{};
  if(["FINISHED","AWARDED"].includes(e.status))return f[side]??r[side]??c[side]??"-";
  if(["IN_PLAY","PAUSED","LIVE"].includes(e.status))return c[side]??f[side]??r[side]??0;
  return "-";
}
function statusLabel(e){
  if(["IN_PLAY","LIVE"].includes(e.status))return e.minute?`${e.minute}'`:"LIVE";
  if(e.status==="PAUSED")return"HALF-TIME";if(e.status==="FINISHED")return"FT";if(e.status==="AWARDED")return"AWARDED";
  if(e.status==="POSTPONED")return"POSTPONED";if(e.status==="CANCELLED")return"CANCELLED";if(e.status==="SUSPENDED")return"SUSPENDED";
  return["TIMED","SCHEDULED"].includes(e.status)?fmtTime(e.date):e.status||"Scheduled";
}
function filterLeague(events){const c=leagues[selected]?.code;return c?events.filter(e=>e.leagueCode===c):events}
function eventCard(e){
  const live=["IN_PLAY","PAUSED","LIVE"].includes(e.status);
  return `<article class="score-card"><div class="score-meta"><span>${esc(e.league||"Football")}</span><span class="${live?"live":""}">${esc(statusLabel(e))}</span></div><div class="teams">${teamHtml(e.homeTeam)}<strong class="score">${scoreValue(e,"home")} — ${scoreValue(e,"away")}</strong>${teamHtml(e.awayTeam)}</div></article>`;
}
function fixtureCard(e){
  return `<article class="fixture-card"><div class="fixture-date">${fmtDate(e.date)}</div><div class="fixture-teams">${teamHtml(e.homeTeam)}<span class="vs">vs</span>${teamHtml(e.awayTeam)}</div><div class="fixture-league">${esc(e.league||"European football")}</div></article>`;
}

/* The Match Centre shown in the existing hero is now live. */
function renderHero(data){
  const hero=$(".hero-match");if(!hero)return;
  const events=filterLeague(data.events||[]),live=filterLeague(data.live||[]);
  const match=(live[0]||events[0]);
  const head=`<div class="match-head"><span>European Match Centre</span><b>${live.length?`● ${live.length} LIVE`:"● LIVE DATA"}</b></div>`;
  if(!match){hero.innerHTML=head+`<div class="scoreline"><div><span class="team-badge">YF</span><strong>YepFootball</strong></div><div class="big-score">— <i>—</i> —</div><div><span class="team-badge alt">EU</span><strong>Europe</strong></div></div><p class="muted">No European matches are currently available.</p>`;return}
  hero.innerHTML=head+`<div class="scoreline">
    <div><span class="team-badge">${match.homeTeam?.crest?`<img src="${esc(match.homeTeam.crest)}" alt="">`:"YF"}</span><strong>${esc(match.homeTeam?.shortName||match.homeTeam?.name||"Home")}</strong></div>
    <div class="big-score">${scoreValue(match,"home")} <i>—</i> ${scoreValue(match,"away")}<small>${esc(statusLabel(match))}</small></div>
    <div><span class="team-badge alt">${match.awayTeam?.crest?`<img src="${esc(match.awayTeam.crest)}" alt="">`:"EU"}</span><strong>${esc(match.awayTeam?.shortName||match.awayTeam?.name||"Away")}</strong></div>
  </div><p class="muted">${esc(match.league||"European football")} · ${esc(statusLabel(match))}</p>`;
}

function renderScores(data){
  const events=filterLeague(data.events||[]),live=filterLeague(data.live||[]),finished=filterLeague(data.finished||[]),upcoming=filterLeague(data.upcoming||[]);
  const grid=$("#scores-grid");if(!grid)return;
  if(!events.length){grid.innerHTML=`<div class="empty">No matches scheduled today for ${esc(leagues[selected].name)}.<br><small>See Upcoming Fixtures for the next matches.</small></div>`;return}
  const s=[];
  if(live.length)s.push(`<div class="score-group"><h3>🔴 LIVE NOW</h3>${live.map(eventCard).join("")}</div>`);
  if(finished.length)s.push(`<div class="score-group"><h3>FINISHED TODAY</h3>${finished.map(eventCard).join("")}</div>`);
  if(upcoming.length)s.push(`<div class="score-group"><h3>TODAY'S MATCHES</h3>${upcoming.map(eventCard).join("")}</div>`);
  grid.innerHTML=s.join("");
}
async function loadScores(){
  const status=$("#scores-status");if(status)status.textContent="Updating…";
  try{
    const data=await getJSON("/api/scores");renderScores(data);renderHero(data);
    const n=filterLeague(data.events||[]).length,l=filterLeague(data.live||[]).length;
    const time=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    if(status)status.textContent=l?`${l} LIVE · Updated ${time}`:`${n} matches · Updated ${time}`;
    if($("#updated"))$("#updated").textContent=`Scores updated ${time}`;
  }catch(e){
    if($("#scores-grid"))$("#scores-grid").innerHTML=`<div class="empty">Scores are temporarily unavailable.<br><small>${esc(e.message)}</small></div>`;
    if(status)status.textContent="Feed unavailable";
    const hero=$(".hero-match");if(hero)hero.innerHTML=`<div class="match-head"><span>European Match Centre</span><b>● DATA UNAVAILABLE</b></div><div class="scoreline"><div><span class="team-badge">YF</span><strong>YepFootball</strong></div><div class="big-score">— <i>—</i> —</div><div><span class="team-badge alt">EU</span><strong>Europe</strong></div></div><p class="muted">European Match Centre is temporarily unavailable.</p>`;
    console.error("Scores API error:",e);
  }
}
async function loadFixtures(){
  try{const d=await getJSON("/api/fixtures"),g=$("#fixtures-grid");if(g)g.innerHTML=(d.events||[]).length?d.events.map(fixtureCard).join(""):`<div class="empty">No upcoming fixtures found.</div>`}
  catch(e){if($("#fixtures-grid"))$("#fixtures-grid").innerHTML=`<div class="empty">Fixtures are temporarily unavailable.<br><small>${esc(e.message)}</small></div>`;console.error(e)}
}
async function loadNews(){
  try{
    const d=await getJSON("/api/news"),g=$("#news-grid"),items=d.articles||[];if(!g)return;
    g.innerHTML=items.length?items.slice(0,9).map(n=>`<a class="news-card" href="${esc(n.link)}" target="_blank" rel="noopener">${n.image?`<img src="${esc(n.image)}" alt="" loading="lazy">`:""}<div><small>${esc(n.source||"Football news")}</small><h3>${esc(n.title)}</h3>${n.description?`<p>${esc(n.description)}</p>`:""}</div><span class="source">${n.published?fmtDate(n.published):"Latest"}</span></a>`).join(""):`<div class="empty">No news available right now.</div>`;
  }catch(e){if($("#news-grid"))$("#news-grid").innerHTML=`<div class="empty">News feed is temporarily unavailable.</div>`;console.error(e)}
}
document.addEventListener("DOMContentLoaded",()=>{
  tabs();if($("#year"))$("#year").textContent=new Date().getFullYear();
  loadScores();loadFixtures();loadNews();
  if($("#updated"))$("#updated").textContent=`Last checked ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`;
  setInterval(loadScores,20000);
  setInterval(loadFixtures,900000);
  setInterval(loadNews,1800000);
});
