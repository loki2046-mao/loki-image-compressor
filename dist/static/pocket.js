// Browser-only transport. Image bytes are never sent through HTTP.
(()=>{
const realFetch=window.fetch.bind(window),jobs=new Map(),assets=new Map(),pending=new Map();let worker,init,initResolve,initReject,serial=0,activeJob=null,workQueue=Promise.resolve(),totalBytes=0;
const MIME={jpg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',tiff:'image/tiff'};
const notify=message=>{const el=document.querySelector('#engineStatus');if(el)el.textContent=message};
function spawn(){init=new Promise((r,j)=>{initResolve=r;initReject=j});init.catch(()=>{});worker=new Worker('/static/worker.js');const timer=setTimeout(()=>{initReject(Error('引擎载入超时，请刷新重试'));notify('图片引擎载入超时，请刷新重试')},120000);
 worker.onmessage=({data:m})=>{if(m.type==='status')notify(m.message);if(m.type==='ready'){clearTimeout(timer);initResolve();notify('● 图片引擎已就绪 · 文件不上传服务器');document.querySelectorAll('option[value="AVIF"]').forEach(o=>{if(!m.supported.includes('AVIF'))o.remove()})}if(m.type==='fatal'){clearTimeout(timer);initReject(Error(m.error));notify('引擎载入失败，请刷新重试')}if(m.type==='progress'){let j=jobs.get(m.value.id);if(j&&j.status!=='cancelled')Object.assign(j,{...m.value,status:m.value.status==='done'?'processing':m.value.status})}if(m.type==='result'){let p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.result)}}};
 worker.onerror=()=>{clearTimeout(timer);initReject(Error('浏览器引擎异常'));for(let p of pending.values())p.reject(Error('图片引擎异常，可能是内存不足，请减少图片尺寸后刷新'));pending.clear();notify('引擎异常，请刷新后重试')};}
function rpc(op,args={},bytes,files){return init.then(()=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});worker.postMessage({id,op,args,bytes,files})}))}
function enqueue(fn){const p=workQueue.then(fn);workQueue=p.catch(()=>{});return p}
function blobURL(bytes,type='image/png'){return URL.createObjectURL(new Blob([bytes],{type}))}
async function inspect(file){if(file.size>50*1024*1024)throw Error('浏览器版单文件最多 50 MB');if(totalBytes+file.size>150*1024*1024)throw Error('本页素材超过 150 MB，请下载结果后刷新，再分批添加');let bytes=await file.arrayBuffer();let r=await enqueue(()=>rpc('inspect',{},bytes));const id=crypto.randomUUID();let asset={id,name:file.name,bytes:file.size,...r,thumb:blobURL(r.thumbnail),source:bytes,framesCache:new Map()};delete asset.thumbnail;assets.set(id,asset);totalBytes+=file.size;return asset}
async function frame(id,index){const a=assets.get(id);if(!a)throw Error('素材已释放，请重新添加');if(index===0&&a.frames===1)return a.thumb;if(a.framesCache.has(index))return a.framesCache.get(index);let r=await enqueue(()=>rpc('frame',{frame:index},a.source));let url=blobURL(r.bytes);a.framesCache.set(index,url);return url}
function resolveURL(url){if(url.startsWith('/api/download/'))return jobs.get(url.split('/')[3].split('?')[0])?.outputURL||'';if(url.startsWith('/api/original/'))return jobs.get(url.split('/')[3])?.originalURL||'';return url}
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
function publicAsset(a){let {source,framesCache,...rest}=a;return rest}
async function transport(url,options={}){url=String(url);if(!url.startsWith('/api/'))return realFetch(url,options);try{
 if(url==='/api/health'){await init;return response({ok:true,service:'pixel-pocket',token:'browser'})}
 if(url==='/api/wechat/presets')return realFetch('/static/presets.json');
 const body=options.body instanceof FormData?options.body:JSON.parse(options.body||'{}');
 if(url==='/api/inspect')return response(publicAsset(await inspect(body.get('file'))));
 if(url==='/api/jobs'){
  let aid=body.get('asset'),a=aid?assets.get(aid):await inspect(body.get('file'));if(!a)throw Error('请重新添加素材');
  let id=crypto.randomUUID(),o=JSON.parse(body.get('options')||'{}'),j={id,name:a.name,originalBytes:a.bytes,status:'queued',progress:0,message:'等待浏览器处理',originalURL:blobURL(a.source,MIME[(a.format||'').toLowerCase()]||'image/'+a.format.toLowerCase())};jobs.set(id,j);
  enqueue(async()=>{if(j.status==='cancelled')return;activeJob=id;try{let r=await rpc('process',{id,name:a.name,options:o},a.source);if(j.status==='cancelled')return;Object.assign(j,r);if(r.data){let ext=r.outputName.split('.').pop();j.outputURL=blobURL(r.data,MIME[ext]);j.blob=new Blob([r.data],{type:MIME[ext]});delete j.data}}catch(e){if(j.status!=='cancelled')Object.assign(j,{status:'error',message:e.message})}finally{activeJob=null}});return response(j);
 }
 if(/^\/api\/jobs\/[^/]+\/cancel$/.test(url)){let id=url.split('/')[3],j=jobs.get(id);if(j){j.status='cancelled';j.message='已取消';if(activeJob===id){worker.terminate();for(let p of pending.values())p.reject(Error('已取消'));pending.clear();spawn()}}return response({ok:true})}
 if(url.startsWith('/api/jobs/')){const j=jobs.get(url.split('/')[3]);if(!j)return response({error:'任务不存在'},404);let {blob,...meta}=j;return response(meta)}
 if(url==='/api/zip'){const files=[];for(const id of body.ids){let j=jobs.get(id);if(j?.blob)files.push({name:j.outputName,bytes:await j.blob.arrayBuffer()})}const r=await enqueue(()=>rpc('zip',{},null,files));return new Response(new Blob([r.bytes],{type:'application/zip'}))}
 throw Error('浏览器版不支持此操作');
 }catch(e){return response({error:e.message},400)}}
async function save(ids){let done=ids.map(id=>jobs.get(id)).filter(j=>j?.blob);if(!done.length)throw Error('没有可保存的成品');if(!window.showDirectoryPicker){let r=await transport('/api/zip',{body:JSON.stringify({ids})});if(!r.ok)throw Error((await r.json()).error);download(URL.createObjectURL(await r.blob()),'轻一点-图片.zip');return '当前浏览器使用 ZIP 下载；保存位置由浏览器设置决定'}
 const dir=await window.showDirectoryPicker({mode:'readwrite'});for(const j of done){let name=j.outputName,n=1;while(true){try{await dir.getFileHandle(name);let pos=j.outputName.lastIndexOf('.');name=j.outputName.slice(0,pos)+'-'+n+++j.outputName.slice(pos)}catch(e){if(e.name==='NotFoundError')break;throw e}}let handle=await dir.getFileHandle(name,{create:true}),w=await handle.createWritable();await w.write(j.blob);await w.close()}return `已保存 ${done.length} 张图片，同名文件自动另存`}
function download(url,name){const a=document.createElement('a');a.href=resolveURL(url);a.download=name;document.body.append(a);a.click();a.remove()}
window.Pocket={fetch:transport,frame,save,url:resolveURL,download};
spawn();
})();
