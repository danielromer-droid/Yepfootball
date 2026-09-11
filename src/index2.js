const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const LEAGUES = ["uefa.champions","eng.1","esp.1","ita.1","ger.1","fra.1"];
const NEWS_URL = "https://site.api.espn.com/apis/site/v2/sports/soccer/news";

function json(data, maxAge=120) {
  return new Response(JSON.stringify(data), {
    headers: {"content-type":"application/json; charset=utf-8","cache-control":`public, max-age=${maxAge}`}
  });
}
async function fetchJSON(url, cacheSeconds=120) {
  const cache = caches.default;
  const req = new Request(url, {method:"GET"});
  let hit = await cache.match(req);
  if (hit) return hit.json();
  const res = await fetch(req, {cf:{cacheTtl:cacheSeconds, cacheEverything:true}});
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  const data = await res.json();
  await cache.put(req, new Response(JSON.stringify(data), {headers:{"content-type":"application/json","cache-control":`public,max-age=${cacheSeconds}`}}));
  return data;
}
async function scores(league) {
  const paths = league ? [league] : LEAGUES;
  const chunks = await Promise.all(paths.map(async p=>{
    try {
      const d = await fetchJSON(`${ESPN}/${p}/scoreboard`, 120);
      return (d.events||[]).map(e=>({...e, league:d.leagues?.[0]?.name||p}));
    } catch { return []; }
  }));
  return {events:chunks.flat().sort((a,b)=>new Date(a.date)-new Date(b.date)), updated:new Date().toISOString()};
}
async function fixtures() {
  const now=new Date(), dates=[];
  for(let i=0;i<7;i++){const d=new Date(now);d.setUTCDate(d.getUTCDate()+i);dates.push(d.toISOString().slice(0,10).replaceAll("-",""))}
  const out=[];
  for(const p of LEAGUES){
    for(const day of dates){
      try{
        const d=await fetchJSON(`${ESPN}/${p}/scoreboard?dates=${day}`, 900);
        for(const e of d.events||[]) if(new Date(e.date)>=now) out.push({...e,league:d.leagues?.[0]?.name||p});
      }catch{}
    }
  }
  const seen=new Set(); const events=out.filter(e=>!seen.has(e.id)&&(seen.add(e.id),true)).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,60);
  return {events,updated:new Date().toISOString()};
}
async function news(){
  const d=await fetchJSON(NEWS_URL, 1800);
  const articles=(d.articles||[]).map(a=>({title:a.headline||a.title,link:a.links?.web?.href||a.links?.mobile?.href,source:a.source?.description||a.source?.name,published:a.published||a.lastModified})).filter(a=>a.title&&a.link);
  return {articles,updated:new Date().toISOString()};
}
async function handle(req){
  const u=new URL(req.url);
  try{
    if(u.pathname==="/api/scores") return json(await scores(u.searchParams.get("league")),120);
    if(u.pathname==="/api/fixtures") return json(await fixtures(),900);
    if(u.pathname==="/api/news") return json(await news(),1800);
  }catch(e){return json({error:"Data feed temporarily unavailable",detail:e.message},30)}
  return null;
}
export default {
  async fetch(request, env, ctx) {
    const api=await handle(request); if(api) return api;
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async()=>{
      await Promise.allSettled([
        scores(),
        fixtures(),
        news()
      ]);
    })());
  }
};
