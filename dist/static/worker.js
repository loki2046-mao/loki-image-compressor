let py,queue=Promise.resolve();
self.report_progress=s=>self.postMessage({type:'progress',value:JSON.parse(s)});
const ready=(async()=>{
 self.postMessage({type:'status',message:'正在载入图片引擎，首次打开需要稍候…'});
 importScripts('/vendor/pyodide/pyodide.js');
 py=await loadPyodide({indexURL:'/vendor/pyodide/'});
 await py.loadPackage('pillow');
 for(const name of ['wechat.py','engine.py']){let r=await fetch('/static/'+name);if(!r.ok)throw Error('引擎文件加载失败');py.FS.writeFile('/home/pyodide/'+name,await r.text())}
 await py.runPythonAsync('from engine import *');
 const supported=JSON.parse(py.runPython("Image.init(); json.dumps(sorted(Image.SAVE.keys()))"));
 self.postMessage({type:'ready',supported});
})();
ready.catch(e=>self.postMessage({type:'fatal',error:e.message}));
self.onmessage=({data:m})=>{queue=queue.then(async()=>{try{await ready;let result;
 if(m.bytes)py.FS.writeFile('/work/input',new Uint8Array(m.bytes));
 py.globals.set('request_json',JSON.stringify(m.args||{}));
 if(m.op==='inspect'){
  result=JSON.parse(py.runPython(`
a=json.loads(request_json)
with Image.open('/work/input') as im:
 n=getattr(im,'n_frames',1)
 if n>600 or im.width*im.height*n>60_000_000: raise ValueError('浏览器版支持最多 600 帧、6000 万总像素，请先裁剪或使用本地版')
 f=ImageOps.exif_transpose(im).convert('RGBA')
 meta=dict(width=f.width,height=f.height,frames=n,format=im.format)
 f.thumbnail((600,600));f.save('/work/frame.png',format='PNG')
json.dumps(meta)
`));result.thumbnail=py.FS.readFile('/work/frame.png').slice();
 }else if(m.op==='frame'){
  py.runPython(`
a=json.loads(request_json)
with Image.open('/work/input') as im:
 im.seek(min(int(a.get('frame',0)),getattr(im,'n_frames',1)-1))
 f=ImageOps.exif_transpose(im).convert('RGBA');f.thumbnail((1800,1800));f.save('/work/frame.png',format='PNG')
`);result={bytes:py.FS.readFile('/work/frame.png').slice()};
 }else if(m.op==='process'){
  result=JSON.parse(py.runPython(`
a=json.loads(request_json)
jobs[a['id']]=Progress(id=a['id'],name=a['name'])
process(a['id'],Path('/work/input'),a['options'])
json.dumps(jobs[a['id']])
`));if(result.status==='done'){result.data=py.FS.readFile(result.output).slice();py.FS.unlink(result.output)}
  py.runPython("jobs.clear()");
 }else if(m.op==='zip'){
  // Files are generated locally and only read by Python's standard zip encoder.
  py.FS.mkdirTree('/bundle');for(let [i,f] of m.files.entries())py.FS.writeFile('/bundle/'+i,new Uint8Array(f.bytes));
  py.globals.set('bundle_names',JSON.stringify(m.files.map(f=>f.name)));
  py.runPython(`
import zipfile
with zipfile.ZipFile('/work/bundle.zip','w',zipfile.ZIP_DEFLATED) as z:
 for i,name in enumerate(json.loads(bundle_names)):z.write('/bundle/'+str(i),f'{i+1:03d}-'+name)
`);result={bytes:py.FS.readFile('/work/bundle.zip').slice()};py.FS.unlink('/work/bundle.zip');for(let i=0;i<m.files.length;i++)py.FS.unlink('/bundle/'+i);
 }
 for(const p of ['/work/input','/work/frame.png'])try{py.FS.unlink(p)}catch{}
 self.postMessage({type:'result',id:m.id,result});
 }catch(e){self.postMessage({type:'result',id:m.id,error:e.message})}})};
