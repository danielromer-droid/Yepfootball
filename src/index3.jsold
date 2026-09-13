const API_FD="https://api.football-data.org/v4";
const API_AF="https://v3.football.api-sports.io";
const BBC_FOOTBALL_RSS="https://feeds.bbci.co.uk/sport/football/rss.xml";

const LEAGUES={
  CL:{name:"Champions League",id:2},
  PL:{name:"Premier League",id:39},
  PD:{name:"La Liga",id:140},
  SA:{name:"Serie A",id:135},
  BL1:{name:"Bundesliga",id:78},
  FL1:{name:"Ligue 1",id:61}
};
const EURO_IDS=new Set(Object.values(LEAGUES).map(x=>x.id));

function json(data,status=200,maxAge=30){
  return new Response(JSON.stringify(data),{status,headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":`public, max-age=${maxAge}`,
    "access-control-allow-origin":"*",
    "access-control-allow-methods":"GET, OPTIONS",
    "access-control-allow-headers":"Content-Type"
  }});
}
function isoDate(d){return d.toISOString().slice(0,10)}

async function fetchJSON(url,options={},cacheSeconds=30){
  const r=await fetch(url,{...options,cf:{cacheTtl:cacheSeconds,cacheEverything:true}});
  const t=await r.text();
  if(!r.ok)throw new Error(`${url} ${r.status}: ${t.slice(0,300)}`);
  try{return JSON.parse(t)}catch{throw new Error("Upstream returned invalid JSON")}
}
async function fdFetch(path,env,cache=300){
  if(!env.FOOTBALL_DATA_TOKEN)throw new Error("Missing Cloudflare secret FOOTBALL_DATA_TOKEN");
  return fetchJSON(`${API_FD}${path}`,{headers:{
    "X-Auth-Token":env.FOOTBALL_DATA_TOKEN,"Accept":"application/json"
  }},cache);
}
async function afFetch(path,env,cache=20){
  if(!env.API_FOOTBALL_KEY)throw new Error("Missing Cloudflare secret API_FOOTBALL_KEY");
  return fetchJSON(`${API_AF}${path}`,{headers:{
    "x-apisports-key":env.API_FOOTBALL_KEY,"Accept":"application/json"
  }},cache);
}

function fdNormalize(m){
  return {
    id:String(m.id),date:m.utcDate,status:m.status,minute:m.minute??null,
    league:LEAGUES[m.competition?.code]?.name||m.competition?.name||"",
    leagueCode:m.competition?.code||"",matchday:m.matchday??null,stage:m.stage??null,
    homeTeam:{id:m.homeTeam?.id,name:m.homeTeam?.name||"",shortName:m.homeTeam?.shortName||m.homeTeam?.name||"",crest:m.homeTeam?.crest||""},
    awayTeam:{id:m.awayTeam?.id,name:m.awayTeam?.name||"",shortName:m.awayTeam?.shortName||m.awayTeam?.name||"",crest:m.awayTeam?.crest||""},
    score:m.score||{}
  };
}
function afStatus(s){
  const c=s?.short||"";
  if(["1H","HT","2H","ET","BT","P","LIVE"].includes(c))return c==="HT"?"PAUSED":"IN_PLAY";
  if(["FT","AET","PEN"].includes(c))return "FINISHED";
  if(["AWD","WO"].includes(c))return "AWARDED";
  if(c==="PST")return "POSTPONED";
  if(c==="CANC")return "CANCELLED";
  if(["SUSP","ABD"].includes(c))return "SUSPENDED";
  if(["NS","TBD"].includes(c))return "TIMED";
  return c||"SCHEDULED";
}
function afNormalize(f){
  const id=f.league?.id;
  const entry=Object.entries(LEAGUES).find(([,v])=>v.id===id);
  const home=f.goals?.home??null,away=f.goals?.away??null;
  return {
    id:String(f.fixture?.id),date:f.fixture?.date,status:afStatus(f.fixture?.status),
    minute:f.fixture?.status?.elapsed??null,
    league:entry?.[1]?.name||f.league?.name||"Football",
    leagueCode:entry?.[0]||"",matchday:f.league?.round||null,stage:f.league?.round||null,
    homeTeam:{id:f.teams?.home?.id,name:f.teams?.home?.name||"",shortName:f.teams?.home?.name||"",crest:f.teams?.home?.logo||""},
    awayTeam:{id:f.teams?.away?.id,name:f.teams?.away?.name||"",shortName:f.teams?.away?.name||"",crest:f.teams?.away?.logo||""},
    score:{
      current:{home,away},
      regularTime:{home,away},
      fullTime:{home:f.score?.fulltime?.home??home,away:f.score?.fulltime?.away??away},
      halftime:{home:f.score?.halftime?.home??null,away:f.score?.halftime?.away??null}
    }
  };
}
function dedupe(ms){
  const m=new Map();
  for(const x of ms)if(x?.id){
    const old=m.get(x.id);
    if(!old||["IN_PLAY","PAUSED"].includes(x.status))m.set(x.id,x);
  }
  return [...m.values()];
}
async function scores(env){
  const today=isoDate(new Date());
  const [liveData,todayData]=await Promise.all([
    afFetch("/fixtures?live=all",env,15),
    afFetch(`/fixtures?date=${today}`,env,20)
  ]);
  const live=(liveData.response||[]).filter(x=>EURO_IDS.has(x.league?.id)).map(afNormalize);
  const todayMatches=(todayData.response||[]).filter(x=>EURO_IDS.has(x.league?.id)).map(afNormalize);
  const events=dedupe([...live,...todayMatches]).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const liveMatches=events.filter(e=>["IN_PLAY","PAUSED"].includes(e.status));
  const finished=events.filter(e=>["FINISHED","AWARDED","POSTPONED","CANCELLED","SUSPENDED"].includes(e.status));
  const upcoming=events.filter(e=>["SCHEDULED","TIMED"].includes(e.status));
  return {events,live:liveMatches,finished,upcoming,count:events.length,liveCount:liveMatches.length,
    message:events.length?null:"No matches scheduled today.",updated:new Date().toISOString()};
}
async function fdFixtures(env){
  const q=new URLSearchParams({competitions:Object.keys(LEAGUES).join(","),dateFrom:isoDate(new Date()),dateTo:isoDate(new Date(Date.now()+7*86400000))});
  const d=await fdFetch(`/matches?${q}`,env,300),now=new Date();
  return (d.matches||[]).map(fdNormalize).filter(e=>new Date(e.date)>=now).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,60);
}
async function afFixturesFallback(env){
  const now=new Date(),dates=[];
  for(let i=0;i<=7;i++){const d=new Date(now);d.setUTCDate(d.getUTCDate()+i);dates.push(isoDate(d))}
  const all=(await Promise.all(dates.map(d=>afFetch(`/fixtures?date=${d}`,env,300)))).flatMap(x=>x.response||[]);
  return all.filter(x=>EURO_IDS.has(x.league?.id)).map(afNormalize).filter(e=>new Date(e.date)>=now).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,60);
}
async function fixtures(env){
  try{
    const events=await fdFixtures(env);
    return {events,count:events.length,source:"football-data.org",message:events.length?null:"No upcoming fixtures found.",updated:new Date().toISOString()};
  }catch(error){
    const events=await afFixturesFallback(env);
    return {events,count:events.length,source:"API-Football fallback",message:events.length?null:"No upcoming fixtures found.",fallbackReason:error.message,updated:new Date().toISOString()};
  }
}

function decodeEntities(t=""){return t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)))}
function xmlValue(xml,tag){const m=xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`,"i"));return m?decodeEntities(m[1].trim()):""}
function parseBBCNews(xml){
  const out=[],items=xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
  for(const item of items){
    const title=xmlValue(item,"title"),link=xmlValue(item,"link"),description=xmlValue(item,"description");
    const published=xmlValue(item,"pubDate")||xmlValue(item,"dc:date"); if(!title||!link)continue;
    const mc=item.match(/<media:content[^>]+url=["']([^"']+)["']/i),mt=item.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i),en=item.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
    out.push({title,link,source:"BBC Sport",published,description:description.replace(/<[^>]+>/g,"").trim().slice(0,240),image:mc?.[1]||mt?.[1]||en?.[1]||""});
  }return out;
}
async function news(){
  const r=await fetch(BBC_FOOTBALL_RSS,{headers:{"User-Agent":"YepFootball/1.0 (+https://yepfootball.com)","Accept":"application/rss+xml, application/xml, text/xml"},cf:{cacheTtl:900,cacheEverything:true}});
  if(!r.ok)throw new Error(`BBC RSS ${r.status}`);
  const articles=parseBBCNews(await r.text()).filter(x=>x.title&&x.link).slice(0,12);
  return {articles,count:articles.length,source:{name:"BBC Sport",url:"https://www.bbc.com/sport/football"},updated:new Date().toISOString()};
}
async function health(env){
  const result={ok:true,checked:new Date().toISOString(),footballData:null,apiFootball:null};
  try{const d=await fdFetch("/matches",env,30);result.footballData={ok:true,status:200,matchesReturned:d.matches?.length||0}}
  catch(e){result.ok=false;result.footballData={ok:false,error:e.message}}
  try{const d=await afFetch("/status",env,30);result.apiFootball={ok:true,status:200,results:d.results||0,response:d.response||null}}
  catch(e){result.ok=false;result.apiFootball={ok:false,error:e.message}}
  return result;
}
async function handle(request,env){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return json({},204,0);
  try{
    if(url.pathname==="/api/health"){const r=await health(env);return json(r,r.ok?200:502,30)}
    if(url.pathname==="/api/scores")return json(await scores(env),200,15);
    if(url.pathname==="/api/fixtures")return json(await fixtures(env),200,300);
    if(url.pathname==="/api/news")return json(await news(),200,900);
  }catch(e){return json({error:"Football data feed unavailable",detail:e.message||String(e),checked:new Date().toISOString()},502,15)}
  return null;
}
export default{
  async fetch(request,env,ctx){const api=await handle(request,env);return api||env.ASSETS.fetch(request)},
  async scheduled(event,env,ctx){ctx.waitUntil(Promise.allSettled([scores(env),fixtures(env),news(env),health(env)]))}
};
