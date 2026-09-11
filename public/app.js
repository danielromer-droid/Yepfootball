const leagues = {
  all:{name:"All Europe", path:null},
  ucl:{name:"Champions League", path:"uefa.champions"},
  epl:{name:"Premier League", path:"eng.1"},
  laliga:{name:"La Liga", path:"esp.1"},
  seriea:{name:"Serie A", path:"ita.1"},
  bundesliga:{name:"Bundesliga", path:"ger.1"},
  ligue1:{name:"Ligue 1", path:"fra.1"}
};
let selected="all";
const $=s=>document.querySelector(s);
const dateKey=d=>d.toISOString().slice(0,10).replaceAll("-","");
function tabs(){
  $("#league-tabs").innerHTML=Object.entries(leagues).map(([k,v])=>`<button class="tab ${k===selected?"active":""}" data-league="${k}">${v.name}</button>`).join("");
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{selected=b.dataset.league;tabs();loadScores()});
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fmtDate(v){try{return new Date(v).toLocaleString(undefined,{weekday:"short",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}catch{return v}}
async function getJSON(url){const r=await fetch(url,{headers:{"Accept":"application/json"}});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}
function eventCard(e){
  const c=e.competitions?.[0], a=c?.competitors?.find(x=>x.homeAway==="home"), b=c?.competitors?.find(x=>x.homeAway==="away");
  const state=e.status?.type?.shortDetail||e.status?.type?.detail||"Scheduled";
  const live=e.status?.type?.state==="in";
  return `<article class="score-card"><div class="score-meta"><span>${esc(e.league||"Football")}</span><span class="${live?"live":""}">${esc(state)}</span></div><div class="teams"><span>${esc(a?.team?.shortDisplayName||a?.team?.displayName||"Home")}</span><strong class="score">${a?.score??"-"} — ${b?.score??"-"}</strong><span>${esc(b?.team?.shortDisplayName||b?.team?.displayName||"Away")}</span></div></article>`
}
function fixtureCard(e){
  const c=e.competitions?.[0], a=c?.competitors?.find(x=>x.homeAway==="home"), b=c?.competitors?.find(x=>x.homeAway==="away");
  return `<article class="fixture-card"><div class="fixture-date">${fmtDate(e.date)}</div><div class="fixture-teams">${esc(a?.team?.displayName||"Home")}<br>vs<br>${esc(b?.team?.displayName||"Away")}</div><div class="fixture-league">${esc(e.league||"European football")}</div></article>`
}
async function loadScores(){
  $("#scores-status").textContent="Loading…";
  try{
    const q=selected==="all"?"/api/scores":`/api/scores?league=${encodeURIComponent(leagues[selected].path)}`;
    const data=await getJSON(q);
    const events=data.events||[];
    $("#scores-grid").innerHTML=events.length?events.map(eventCard).join(""):`<div class="empty">No matches found for this competition today.</div>`;
    $("#scores-status").textContent=`Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;
  }catch(e){$("#scores-grid").innerHTML=`<div class="empty">Scores are temporarily unavailable. Please try again shortly.</div>`;$("#scores-status").textContent="Feed unavailable"}
}
async function loadFixtures(){
  try{const data=await getJSON("/api/fixtures");const events=data.events||[];$("#fixtures-grid").innerHTML=events.length?events.map(fixtureCard).join(""):`<div class="empty">No upcoming fixtures found.</div>`}
  catch(e){$("#fixtures-grid").innerHTML=`<div class="empty">Fixtures are temporarily unavailable.</div>`}
}
async function loadNews(){
  try{const data=await getJSON("/api/news");const items=data.articles||[];$("#news-grid").innerHTML=items.length?items.slice(0,9).map(n=>`<a class="news-card" href="${esc(n.link)}" target="_blank" rel="noopener"><div><small>${esc(n.source||"Football news")}</small><h3>${esc(n.title)}</h3></div><span class="source">${n.published?fmtDate(n.published):"Latest"}</span></a>`).join(""):`<div class="empty">No news available right now.</div>`}
  catch(e){$("#news-grid").innerHTML=`<div class="empty">News feed is temporarily unavailable.</div>`}
}
document.addEventListener("DOMContentLoaded",()=>{tabs();$("#year").textContent=new Date().getFullYear();loadScores();loadFixtures();loadNews();$("#updated").textContent=`Last checked ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;setInterval(loadScores,120000);setInterval(loadFixtures,900000);setInterval(loadNews,1800000)})
