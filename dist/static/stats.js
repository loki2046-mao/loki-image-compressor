(async()=>{
 const endpoint='https://loki-image-compressor.pages.dev/api/visits',status=document.getElementById('stats-status');
 try{
  let visitor;try{visitor=localStorage.getItem('loki-compress-visitor');if(!visitor){visitor=crypto.randomUUID();localStorage.setItem('loki-compress-visitor',visitor)}}catch{}
  const production=['pixel-pocket-loki.loki-6b76.chatgpt.site','compress.hiloki.cn','loki-image-compressor.pages.dev'].includes(location.hostname);
  const response=await fetch(endpoint+(visitor&&production?'/visit':'/stats'),visitor&&production?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor,event:crypto.randomUUID()}),signal:AbortSignal.timeout(10000)}:{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('unavailable');const stats=await response.json();
  document.querySelectorAll('[data-stat]').forEach(el=>{let n=stats[el.dataset.stat];if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid count');el.textContent=n.toLocaleString('zh-CN')});
  status.textContent=`北京时间 ${stats.day} · 全站访问统计${visitor?'':' · 浏览器未允许保存标识，本次不计数'}`;
 }catch{status.textContent='访问统计暂时不可用 · 图片处理不受影响'}
})();
