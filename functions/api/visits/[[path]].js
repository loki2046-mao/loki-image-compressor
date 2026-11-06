export async function onRequest({request,params,env}) {
 const path=Array.isArray(params.path)?params.path.join('/'):params.path;
 if(!['stats','visit'].includes(path))return new Response('Not found',{status:404});
 const headers=new Headers();headers.set('Content-Type','application/json');headers.set('Origin',request.headers.get('Origin')||new URL(request.url).origin);
 headers.set('CF-Connecting-IP',request.headers.get('CF-Connecting-IP')||'unknown');
 if(!env.STATS)return new Response('Stats service binding missing',{status:503});
 try { return await env.STATS.fetch(new Request('https://stats.internal/'+path,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'})); } catch(e) {return new Response('Statistics temporarily unavailable',{status:503});}
}
