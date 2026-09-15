/* YepFootball Worker
   Secrets: API_FOOTBALL_KEY, FOOTBALL_DATA_TOKEN
   KV binding: LATEST_SCORES -> YepFootball Scores
   Cron: Every 15 minutes (recommended). No exact 23:50 run is required.
*/
const AF="https://v3.football.api-sports.io",FD="https://api.football-data.org/v4",BBC="https://feeds.bbci.co.uk/sport/football/rss.xml";
const FD_LEAGUES={CL:"Champions League",PL:"Premier League",PD:"La Liga",SA:"Serie A",BL1:"Bundesliga",FL1:"Ligue 1"};
const AF_LEAGUES={2:"Champions League",3:"Europa League",848:"Conference League",39:"Premier League",140:"La Liga",135:"Serie A",78:"Bundesliga",61:"Ligue 1"};
const FINAL=new Set(["FT","AET","PEN","AWD","WO"]);
function json(data,status=200,maxAge=60){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":`public, max-age=${maxAge}`,"access-control-allow-origin":"*"}})}
function parisParts(d=new Date()){const a=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(d),o={};for(const x of a)if(x.type!=="literal")o[x.type]=x.value;return o}
function previousParisDate(d=new Date()){const p=parisParts(d),x=new Date(Date.UTC(+p.year,+p.month-1,+p.day,12));x.setUTCDate(x.getUTCDate()-1);return x.toISOString().slice(0,10)}
async function afFetch(path,env,ttl=60){if(!env.API_FOOTBALL_KEY)throw Error("Missing Cloudflare secret API_FOOTBALL_KEY");const r=await fetch(`${AF}${path}`,{headers:{"x-apisports-key":env.API_FOOTBALL_KEY,Accept:"application/json"},cf:{cacheTtl:ttl,cacheEverything:true}}),t=await r.text();if(!r.ok)throw Error(`API-Football ${r.status}: ${t.slice(0,400)}`);const d=JSON.parse(t);if(d.errors&&Object.keys(d.errors).length)throw Error(`API-Football error: ${JSON.stringify(d.errors)}`);return d}
async function fdFetch(path,env,ttl=300){if(!env.FOOTBALL_DATA_TOKEN)throw Error("Missing Cloudflare secret FOOTBALL_DATA_TOKEN");const r=await fetch(`${FD}${path}`,{headers:{"X-Auth-Token":env.FOOTBALL_DATA_TOKEN,Accept:"application/json"},cf:{cacheTtl:ttl,cacheEverything:true}}),t=await r.text();if(!r.ok)throw Error(`football-data.org ${r.status}: ${t.slice(0,300)}`);return JSON.parse(t)}
function afNorm(x){const s=x.fixture?.status||{},h=x.teams?.home||{},a=x.teams?.away||{},lid=Number(x.league?.id);return{id:String(x.fixture?.id),date:x.fixture?.date||null,status:s.short||"",statusLong:s.long||"",minute:s.elapsed??null,live:["1H","HT","2H","ET","BT","P","LIVE"].includes(s.short),league:AF_LEAGUES[lid]||x.league?.name||"European football",leagueCode:String(lid||""),leagueId:lid,homeTeam:{id:h.id,name:h.name||"",shortName:h.name||"",crest:h.logo||""},awayTeam:{id:a.id,name:a.name||"",shortName:a.name||"",crest:a.logo||""},score:{home:x.goals?.home??null,away:x.goals?.away??null}}}
function guardianLeagueId(name=""){
  const n=name.toLowerCase();
  if(n.includes("premier league")) return 39;
  if(n.includes("la liga")) return 140;
  if(n.includes("serie a")) return 135;
  if(n.includes("bundesliga")) return 78;
  if(n.includes("ligue 1")) return 61;
  if(n.includes("champions league")) return 2;
  return null;
}
function stripHtml(s=""){
  return s.replace(/<script[\s\S]*?<\/script>/gi,"")
    .replace(/<style[\s\S]*?<\/style>/gi,"")
    .replace(/<br\s*\/?>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&").replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'").replace(/&apos;/g,"'")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))
    .replace(/\s+/g," ").trim();
}
function guardianDateLabel(date){
  const [y,m,d]=date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Paris",weekday:"long",day:"numeric",month:"long",year:"numeric"})
    .format(new Date(Date.UTC(y,m-1,d,12)));
}
function parseGuardianResults(html,date){
  const wanted=new Set(["Premier League","La Liga","Serie A","Bundesliga","Ligue 1","Champions League"]);
  const label=guardianDateLabel(date);
  const h2re=/<h2\b[^>]*>[\s\S]*?<\/h2>/gi;
  const hs=[...html.matchAll(h2re)];
  let section="";
  for(let i=0;i<hs.length;i++){
    const text=stripHtml(hs[i][0]);
    if(text===label || text.includes(label)){
      const next=hs[i+1];
      section=html.slice(hs[i].index+hs[i][0].length,next?next.index:html.length);
      break;
    }
  }
  if(!section) return [];
  const out=[];
  const h3re=/<h3\b[^>]*>[\s\S]*?<\/h3>/gi;
  const h3s=[...section.matchAll(h3re)];
  for(let i=0;i<h3s.length;i++){
    const league=stripHtml(h3s[i][0]);
    if(!wanted.has(league)) continue;
    const chunk=section.slice(h3s[i].index+h3s[i][0].length,h3s[i+1]?.index??section.length);
    const are=/<a\b[^>]*href=["'][^"']*football\.theguardian\.com[^"']*["'][^>]*>[\s\S]*?<\/a>/gi;
    for(const m of chunk.matchAll(are)){
      const text=stripHtml(m[0]).replace(/^FT\s*/i,"").trim();
      let mm=text.match(/^(.+?)\s+(\d+)\s*[-–—]\s*(\d+)\s+(.+)$/);
      if(!mm){
        mm=text.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(.+)$/);
      }
      if(!mm) continue;
      const home=mm[1].trim(), hs=Number(mm[2]), as=Number(mm[3]), away=mm[4].trim();
      const lid=guardianLeagueId(league);
      if(!lid) continue;
      out.push({
        id:`web-${date}-${lid}-${home}-${away}`.replace(/\s+/g,"-"),
        date:`${date}T12:00:00Z`,
        status:"FINISHED", statusLong:"Full Time", minute:null, live:false,
        league, leagueCode:String(lid), leagueId:lid,
        homeTeam:{id:null,name:home,shortName:home,crest:""},
        awayTeam:{id:null,name:away,shortName:away,crest:""},
        score:{home:hs,away:as}
      });
    }
  }
  return out;
}
async function dailyScoresFromWeb(env,date){
  const url="https://www.theguardian.com/football/results";
  const r=await fetch(url,{headers:{
    "User-Agent":"Mozilla/5.0 YepFootball/1.0 (+https://yepfootball.com)",
    "Accept":"text/html,application/xhtml+xml"
  },cf:{cacheTtl:900,cacheEverything:true}});
  if(!r.ok) throw Error(`Guardian results ${r.status}`);
  const html=await r.text();
  const events=parseGuardianResults(html,date);
  if(!events.length) throw Error(`No completed results found on Guardian for ${date}`);
  return events.sort((a,b)=>a.league.localeCompare(b.league)||a.homeTeam.name.localeCompare(b.homeTeam.name));
}
async function publishYesterday(env){if(!env.LATEST_SCORES)throw Error("Missing Cloudflare KV binding LATEST_SCORES");const date=previousParisDate();const existing=await env.LATEST_SCORES.get(`scores:${date}`,"json");if(existing)return{ok:true,skipped:true,date,reason:"Already published"};const events=await dailyScoresFromWeb(env,date);const p={events,count:events.length,date,source:"The Guardian results",publishedAt:new Date().toISOString(),message:events.length?null:"No completed matches recorded for the previous day."};await env.LATEST_SCORES.put(`scores:${date}`,JSON.stringify(p));await env.LATEST_SCORES.put("latest",JSON.stringify(p));return p}
async function latest(env){if(!env.LATEST_SCORES)throw Error("Missing Cloudflare KV binding LATEST_SCORES");const p=await env.LATEST_SCORES.get("latest","json");return p||{events:[],count:0,date:null,source:"Cloudflare KV",publishedAt:null,message:"No daily snapshot is available yet."}}
async function matchCentre(env){const d=await afFetch("/fixtures?live=all&timezone=Europe/Paris",env,60),events=(d.response||[]).filter(x=>AF_LEAGUES[Number(x.league?.id)]).map(afNorm).filter(x=>x.live).sort((a,b)=>new Date(a.date)-new Date(b.date));return{events,live:events,finished:[],upcoming:[],count:events.length,liveCount:events.length,source:"API-Football",updated:new Date().toISOString()}}
function fdNorm(m){return{id:String(m.id),date:m.utcDate,status:m.status,minute:m.minute??null,league:FD_LEAGUES[m.competition?.code]||m.competition?.name||"",leagueCode:m.competition?.code||"",matchday:m.matchday??null,stage:m.stage??null,homeTeam:{id:m.homeTeam?.id,name:m.homeTeam?.name||"",shortName:m.homeTeam?.shortName||m.homeTeam?.name||"",crest:m.homeTeam?.crest||""},awayTeam:{id:m.awayTeam?.id,name:m.awayTeam?.name||"",shortName:m.awayTeam?.shortName||m.awayTeam?.name||"",crest:m.awayTeam?.crest||""},score:m.score||{}}}
async function fixtures(env){const n=new Date(),e=new Date(n);e.setUTCDate(e.getUTCDate()+7);const q=new URLSearchParams({competitions:Object.keys(FD_LEAGUES).join(","),dateFrom:n.toISOString().slice(0,10),dateTo:e.toISOString().slice(0,10)}),d=await fdFetch(`/matches?${q}`,env,300),events=(d.matches||[]).map(fdNorm).filter(x=>new Date(x.date)>=n).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,60);return{events,count:events.length,message:events.length?null:"No upcoming fixtures found.",source:"football-data.org",updated:new Date().toISOString()}}
function dec(t=""){return t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function xv(x,tag){const m=x.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,"i"));return m?dec(m[1].trim()):""}
function parseNews(x){const out=[],items=x.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];for(const i of items){const title=xv(i,"title"),link=xv(i,"link");if(!title||!link)continue;const mc=i.match(/<media:content[^>]+url=["']([^"']+)["']/i),mt=i.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i),en=i.match(/<enclosure[^>]+url=["']([^"']+)["']/i);out.push({title,link,source:"BBC Sport",published:xv(i,"pubDate")||xv(i,"dc:date"),description:xv(i,"description").replace(/<[^>]+>/g,"").trim().slice(0,240),image:mc?.[1]||mt?.[1]||en?.[1]||""})}return out}
async function news(){const r=await fetch(BBC,{headers:{"User-Agent":"YepFootball/1.0 (+https://yepfootball.com)",Accept:"application/rss+xml, application/xml, text/xml"},cf:{cacheTtl:900,cacheEverything:true}});if(!r.ok)throw Error(`BBC RSS ${r.status}`);const a=parseNews(await r.text()).slice(0,12);return{articles:a,count:a.length,source:{name:"BBC Sport",url:"https://www.bbc.com/sport/football"},updated:new Date().toISOString()}}
async function health(env){const r={ok:true,upstreams:{},elapsedMs:0,checked:new Date().toISOString()},started=Date.now();r.upstreams.apiFootball=env.API_FOOTBALL_KEY?"configured":"Missing secret";r.upstreams.footballData=env.FOOTBALL_DATA_TOKEN?"configured":"Missing secret";if(!env.API_FOOTBALL_KEY||!env.FOOTBALL_DATA_TOKEN)r.ok=false;if(!env.LATEST_SCORES){r.ok=false;r.upstreams.latestScores="Missing KV binding LATEST_SCORES"}else{const p=await env.LATEST_SCORES.get("latest","json");r.upstreams.latestScores=p?`ok (${p.date||"unknown date"})`:"configured but empty"}r.elapsedMs=Date.now()-started;return r}
async function handle(req,env){const p=new URL(req.url).pathname;try{if(p==="/api/health"){const r=await health(env);return json(r,r.ok?200:502,30)}if(p==="/api/scores")return json(await latest(env),200,300);if(p==="/api/match-centre")return json(await matchCentre(env),200,60);if(p==="/api/fixtures")return json(await fixtures(env),200,300);if(p==="/api/news")return json(await news(),200,900)}catch(e){return json({error:"Football data feed unavailable",detail:e.message||String(e),checked:new Date().toISOString()},502,30)}return null}
export default{async fetch(req,env,ctx){const r=await handle(req,env);return r||env.ASSETS.fetch(req)},async scheduled(event,env,ctx){ctx.waitUntil(publishYesterday(env).catch(err=>{console.error("Daily scores snapshot not published:",err)}))}};
