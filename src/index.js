const LEAGUES={
 UCL:{name:'Champions League',espn:'uefa.champions'},EPL:{name:'Premier League',espn:'eng.1'},LL:{name:'La Liga',espn:'esp.1'},SA:{name:'Serie A',espn:'ita.1'},BL:{name:'Bundesliga',espn:'ger.1'},L1:{name:'Ligue 1',espn:'fra.1'}
};
const NEWS_QUERIES={
 UCL:'Champions League football',EPL:'Premier League football',LL:'La Liga football',SA:'Serie A football',BL:'Bundesliga football',L1:'Ligue 1 football'
};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const iso=d=>d.toISOString().slice(0,10).replaceAll('-','');
const date=(off=0)=>{const d=new Date();d.setUTCDate(d.getUTCDate()+off);return d;};
async function espn(league,from,to){
 const url=`https://site.api.espn.com/apis/site/v2/sports/soccer/${league.espn}/scoreboard?dates=${iso(from)}-${iso(to)}`;
 const r=await fetch(url,{headers:{'user-agent':'YepFootball/3.0'}});if(!r.ok)throw new Error('score feed '+r.status);const j=await r.json();
 return (j.events||[]).map(ev=>{const c=ev.competitions?.[0],h=c?.competitors?.find(x=>x.homeAway==='home'),a=c?.competitors?.find(x=>x.homeAway==='away'),s=ev.status?.type||{};const live=s.state==='in';return {id:String(ev.id),league:Object.keys(LEAGUES).find(k=>LEAGUES[k].espn===league.espn),comp:league.name,home:h?.team?.displayName||'Home',away:a?.team?.displayName||'Away',hs:h?.score??'—',as:a?.score??'—',date:ev.date,status:live?(ev.status.displayClock?`LIVE ${ev.status.displayClock}`:'LIVE'):s.completed?'FT':new Date(ev.date).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),live,completed:!!s.completed};}).filter(x=>x.home&&x.away);
}
async function allGames(from,to){const arr=await Promise.all(Object.values(LEAGUES).map(l=>espn(l,from,to).catch(()=>[])));return arr.flat().sort((a,b)=>new Date(a.date)-new Date(b.date));}
function strip(html){return html.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function parseRSS(xml,source,league){const out=[];for(const m of xml.matchAll(/<item[\s\S]*?<\/item>/gi)){const x=m[0];const title=(x.match(/<title>([\s\S]*?)<\/title>/i)||[])[1];const link=(x.match(/<link>([\s\S]*?)<\/link>/i)||[])[1];const desc=(x.match(/<description>([\s\S]*?)<\/description>/i)||[])[1];const pub=(x.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)||[])[1];if(title&&link)out.push({title:strip(title.replace(/<!\[CDATA\[|\]\]>/g,'')),url:strip(link),summary:strip((desc||'').replace(/<!\[CDATA\[|\]\]>/g,'' )).slice(0,180),date:pub?new Date(strip(pub)).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'Today',source,league});}return out;}
async function news(){
 const feeds=Object.entries(NEWS_QUERIES).map(async([key,q])=>{const u='https://news.google.com/rss/search?q='+encodeURIComponent(q)+'&hl=en-GB&gl=GB&ceid=GB:en';try{const r=await fetch(u,{headers:{'user-agent':'YepFootball/3.0'}});return r.ok?parseRSS(await r.text(),'Google News',LEAGUES[key].name):[];}catch{return[];}});const all=(await Promise.all(feeds)).flat();const seen=new Set();return all.filter(x=>{const k=x.title.toLowerCase();if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,12);
}
export default {async fetch(request,env,ctx){const url=new URL(request.url);try{if(url.pathname==='/api/scores'){const games=await allGames(date(0),date(1));return json({updatedAt:new Date().toISOString(),games});}if(url.pathname==='/api/fixtures'){const games=await allGames(date(0),date(7));return json({updatedAt:new Date().toISOString(),fixtures:games.filter(x=>!x.completed)});}if(url.pathname==='/api/news'){return json({updatedAt:new Date().toISOString(),items:await news()});}return env.ASSETS.fetch(request);}catch(e){return json({error:'temporary feed error',message:e.message},502);}},async scheduled(controller,env,ctx){ctx.waitUntil((async()=>{try{await Promise.all([allGames(date(0),date(1)),allGames(date(0),date(7)),news()]);}catch(e){console.log('scheduled refresh failed',e.message);}})());}};
