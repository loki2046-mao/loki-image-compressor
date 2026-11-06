from PIL import Image, ImageOps
from io import BytesIO
from pathlib import Path
import json, warnings
from wechat import PRESETS, config as wechat_config, transform as wechat_transform, validate as wechat_validate
DATA=Path('/work');DATA.mkdir(exist_ok=True)
Image.MAX_IMAGE_PIXELS=20_000_000
warnings.simplefilter('error',Image.DecompressionBombWarning)
class Progress(dict):
 def update(self,*args,**kwargs):
  super().update(*args,**kwargs)
  try:
   from js import report_progress
   report_progress(json.dumps({k:v for k,v in self.items() if k!='output'}))
  except ImportError: pass
jobs={}
def encode(frames,durations,fmt,q,colors,loop,bg):
    out=BytesIO(); opts={}
    if fmt=='JPEG':
        base=Image.new('RGB',frames[0].size,bg); base.paste(frames[0],mask=frames[0].getchannel('A')); frames=[base]; opts=dict(quality=q,optimize=True,progressive=True)
    elif fmt=='GIF':
        converted=[]
        for frame in frames:
            p=frame.convert('RGB').quantize(colors=colors-1,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.FLOYDSTEINBERG)
            p.paste(255,mask=frame.getchannel('A').point(lambda a:255 if a<128 else 0)); p.info['transparency']=255; converted.append(p)
        frames=converted; opts=dict(optimize=True,disposal=2,transparency=255)
    elif fmt=='PNG':
        if colors<256: frames=[f.quantize(colors=colors,method=Image.Quantize.FASTOCTREE) for f in frames] if len(frames)==1 else frames
        opts=dict(optimize=True,compress_level=9)
    elif fmt=='WEBP': opts=dict(quality=q,method=5)
    elif fmt=='AVIF': opts=dict(quality=q)
    if len(frames)>1: opts.update(save_all=True,append_images=frames[1:],duration=durations,loop=loop)
    frames[0].save(out,format=fmt,**opts); return out.getvalue()

def process(jid,src,o):
    j=jobs[jid]
    try:
        preset=None
        if o.get('preset'): o,preset=wechat_config(o)
        j.update(status='processing',progress=5,message='读取图片与动画帧')
        im=Image.open(BytesIO(src.read_bytes())); original_fmt=im.format; n=getattr(im,'n_frames',1)
        if n>600 or im.width*im.height*n>60_000_000: raise ValueError('图片过大：最多 600 帧、总计 6000 万像素，请先裁剪')
        fmt=o.get('format','original'); fmt=original_fmt if fmt=='original' else fmt.upper(); fmt={'JPG':'JPEG','APNG':'PNG'}.get(fmt,fmt)
        if fmt not in ('GIF','JPEG','PNG','WEBP','AVIF','BMP','TIFF'): raise ValueError('该输出格式暂不支持，请选择 PNG 或 WebP')
        flatten=fmt in ('JPEG','BMP','AVIF','TIFF') or bool(preset and (preset['animation'] is False or fmt!='GIF')); frames=[]; ds=[]
        first=max(0,min(n-1,int(o.get('frame',0)))) if flatten else 0
        for i in (range(first,first+1) if flatten else range(n)):
            im.seek(i); frames.append(ImageOps.exif_transpose(im).convert('RGBA')); ds.append(im.info.get('duration',100) or 100)
        if preset:
            if len(frames)*preset['width']*preset['height']>60_000_000: raise ValueError('输出动画过大，请减少帧数或使用本地版')
            frames=wechat_transform(frames,o,preset)
        w,h=frames[0].size
        mw=max(1,int(o.get('width') or w)); mh=max(1,int(o.get('height') or h)); ratio=min(1,mw/w,mh/h)
        w,h=max(1,round(w*ratio)),max(1,round(h*ratio))
        frames=[f.resize((w,h),Image.Resampling.LANCZOS) if f.size!=(w,h) else f for f in frames]
        target=float(o.get('target') or 0)*int(o.get('unit',1000)); level=o.get('level','medium')
        qualities={'low':[92,85,75,65,50],'medium':[85,75,65,50,35],'high':[70,60,45,30,20]}[level]
        palette={'low':[256,192,128,96,64],'medium':[256,128,96,64,32],'high':[128,96,64,32,16]}[level]
        if o.get('preset')=='icon': palette=[256]*5
        scales=[1,.9,.8,.7,.6,.5,.4,.3,.2] if target and o.get('autoResize',True) else [1]
        best=None; chosen=None; attempt=0; total=len(scales)*(5 if target else 1)
        for scale in scales:
            size=(max(1,round(w*scale)),max(1,round(h*scale)))
            fs=[f.resize(size,Image.Resampling.LANCZOS) for f in frames] if scale!=1 else frames
            for k in range(5 if target else 1):
                if j.get('cancel'): j.update(status='cancelled',message='已取消'); return
                attempt+=1; j.update(progress=min(95,5+int(attempt/total*90)),message=f'尝试 {size[0]} × {size[1]} · 方案 {attempt}')
                b=encode(fs,ds,fmt,qualities[k],palette[k],0 if preset else im.info.get('loop',0),o.get('background','#ffffff'))
                if best is None or len(b)<len(best): best=b; chosen=(size,qualities[k],palette[k])
                if not target or len(b)<target: best=b; chosen=(size,qualities[k],palette[k]); break
            if not target or len(best)<target: break
        # Retain exact original when no transformation is needed and it is smaller.
        if not preset and fmt==original_fmt and not (n>1 and flatten) and (w,h)==im.size and src.stat().st_size<len(best): best=src.read_bytes(); chosen=(im.size,100,256)
        ext={'JPEG':'jpg','PNG':'png','WEBP':'webp','GIF':'gif','AVIF':'avif','BMP':'bmp','TIFF':'tiff'}[fmt]
        name=Path(j['name']).stem+'-'+(preset['label'] if preset else '轻一点')+'.'+ext; dest=DATA/(jid+'.'+ext); dest.write_bytes(best)
        j.update(status='done',progress=100,message='已达到目标' if target and len(best)<target else ('未达到目标，可放宽尺寸或更换格式' if target else '处理完成'),output=str(dest),outputName=name,bytes=len(best),width=chosen[0][0],height=chosen[0][1],frames=len(frames),duration=sum(ds),met=not target or len(best)<target,warning='此格式导出首帧静态图' if n>1 and flatten else '',quality=chosen[1])
        if preset:
            checks=wechat_validate(best,preset,float(o['target']))
            j.update(encoding='全彩 PNG · 无损编码' if o['preset']=='icon' else '',checks=checks,compatible=all(c['ok'] for c in checks),preset=o['preset'])
            j['message']='技术规格检查通过' if j['compatible'] else '已生成，请检查未满足项'
            if n>1 and flatten: j['warning']=f'已选第 {first+1} 帧导出静态图'
    except Exception as e: j.update(status='error',message=str(e))

