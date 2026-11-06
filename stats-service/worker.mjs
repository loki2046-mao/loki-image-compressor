const ORIGINS=new Set(['https://pixel-pocket-loki.loki-6b76.chatgpt.site','https://compress.hiloki.cn','https://loki-image-compressor.pages.dev']);
const day=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export default {
 async fetch(req,env){
 const origin=req.headers.get('Origin'),path=new URL(req.url).pathname;
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(ORIGINS.has(origin)?{'Access-Control-Allow-Origin':origin}:{})};
 const reply=(v,status=200)=>new Response(JSON.stringify(v),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST','Access-Control-Allow-Headers':'Content-Type'}});
 if(!['/stats','/visit'].includes(path))return reply({error:'Not found'},404);
 try{
 if(req.method==='POST'&&path==='/visit'){
  if(!ORIGINS.has(origin))return reply({error:'Origin denied'},403);
  if(!(await env.LIMITER.limit({key:req.headers.get('CF-Connecting-IP')||'unknown'})).success)return reply({error:'Rate limited'},429);
  const reader=req.body?.getReader();if(!reader)return reply({error:'Missing body'},400);let size=0,chunks=[];
  while(true){let {done,value}=await reader.read();if(done)break;size+=value.length;if(size>512){await reader.cancel();return reply({error:'Too large'},413)}chunks.push(...value)}
  let data;try{data=JSON.parse(new TextDecoder().decode(new Uint8Array(chunks)))}catch{return reply({error:'Invalid JSON'},400)}
  if(!/^[a-f0-9-]{36}$/.test(data.visitor)||!/^[a-f0-9-]{36}$/.test(data.event)||Object.keys(data).some(k=>!['visitor','event'].includes(k)))return reply({error:'Invalid payload'},400);
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.visitor));const id=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('INSERT OR IGNORE INTO events(id,day,visitor) VALUES(?,?,?)').bind(data.event,day(),id).run();
 }else if(req.method!=='GET'||path!=='/stats')return reply({error:'Method denied'},405);
 const rows=await env.DB.batch([
  env.DB.prepare('SELECT COALESCE(SUM(pv),0) AS value FROM counts'),env.DB.prepare('SELECT COUNT(*) AS value FROM visitors'),
  env.DB.prepare('SELECT COALESCE(SUM(pv),0) AS value FROM counts WHERE day=?').bind(day()),env.DB.prepare('SELECT COUNT(*) AS value FROM daily_visitors WHERE day=?').bind(day())]);
 return reply({totalPV:rows[0].results[0].value,totalUV:rows[1].results[0].value,todayPV:rows[2].results[0].value,todayUV:rows[3].results[0].value,day:day()});
 }catch{return reply({error:'Statistics temporarily unavailable'},503)}
 },
 async scheduled(event,env){await env.DB.batch([env.DB.prepare("DELETE FROM events WHERE day < date('now','-7 days')"),env.DB.prepare("DELETE FROM daily_visitors WHERE day < date('now','-2 days')")])}
};
