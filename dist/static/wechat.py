"""WeChat asset rules transcribed from the user's six screenshots, 2026-11-05.
Thresholds describe platform recompression, not proof of publication acceptance.
"""
from PIL import Image, ImageOps, ImageFilter
import math
PRESETS={
 'sticker_static':dict(label='静态表情',width=240,height=240,kb=500,formats=['PNG','JPEG','GIF'],animation=False,alpha='optional',notes='同一专辑统一静态或动态；表情数量 8–24 张。合理留白，风格统一、内容有差异。'),
 'sticker_dynamic':dict(label='动态表情',width=240,height=240,kb=500,formats=['GIF'],animation=True,alpha='optional',notes='循环播放；同一专辑统一动态，8–24 张。请预览所有帧，确认动作没有被裁掉。'),
 'banner':dict(label='详情页横幅',width=750,height=400,kb=500,formats=['JPEG','PNG'],animation=False,alpha='opaque',notes='1 张。避免文字、白底和透明背景；画面明朗、与表情有关，不拉伸变形。'),
 'cover':dict(label='表情封面',width=240,height=240,kb=500,formats=['PNG'],animation=False,alpha='required',notes='透明背景，无白色描边。建议正面半身或全身，不只截头部；避免过多留白、装饰和文字。'),
 'icon':dict(defaultTarget=50,label='聊天页图标',width=50,height=50,kb=100,formats=['PNG'],animation=False,alpha='required',notes='透明背景，建议清晰的正面头部。避免白描边、方框、硬直角和过多留白。截图要求 100 KB，可手动收紧到 50 KB。'),
 'reward_guide':dict(label='赞赏引导图',width=750,height=560,kb=500,formats=['JPEG','PNG','GIF'],animation='optional',alpha='optional',notes='与表情风格一致，不出现与表情无关的内容。GIF 可保留动画。'),
 'reward_thanks':dict(label='赞赏致谢图',width=750,height=750,kb=500,formats=['JPEG','PNG','GIF'],animation='optional',alpha='optional',notes='与表情风格一致，不出现与表情无关的内容。GIF 可保留动画。')
}
def config(o):
 p=PRESETS[o['preset']]
 fmt=o.get('format') or p['formats'][0]
 if fmt not in p['formats']: raise ValueError('该素材用途不支持所选格式')
 target=float(o.get('target') or p['kb'])
 if not math.isfinite(target) or not 0<target<=p['kb']: raise ValueError(f'目标体积必须在 0 至 {p["kb"]} KB 之间')
 return dict(o,format=fmt,target=target,unit=1000,width=p['width'],height=p['height'],autoResize=False),p

def transform(frames,o,p):
 size=(p['width'],p['height']); result=[]
 crop=o.get('crop'); mode=o.get('fit','contain')
 if mode not in ('contain','crop'): raise ValueError('无效裁剪方式')
 for f in frames:
  if mode=='crop':
   if not isinstance(crop,dict): raise ValueError('请先设置裁剪范围')
   vals=[float(crop.get(k,0)) for k in ('x','y','w','h')]; x,y,w,h=vals
   if not all(math.isfinite(v) for v in vals) or min(x,y)<-1e-6 or min(w,h)<=0 or x+w>1.00001 or y+h>1.00001: raise ValueError('裁剪范围超出原图')
   if abs((w*f.width)/(h*f.height)/(size[0]/size[1])-1)>.015: raise ValueError('裁剪比例与成品尺寸不一致')
   box=(max(0,x*f.width),max(0,y*f.height),min(f.width,(x+w)*f.width),min(f.height,(y+h)*f.height))
   out=f.resize(size,Image.Resampling.LANCZOS,box=box)
  else:
   # ImageOps.contain deliberately permits upscaling to meet exact platform sizes.
   contained=ImageOps.contain(f,size,Image.Resampling.LANCZOS)
   out=Image.new('RGBA',size,(0,0,0,0));out.alpha_composite(contained,((size[0]-contained.width)//2,(size[1]-contained.height)//2))
  if p['alpha']=='opaque' or o.get('format')=='JPEG':
   base=Image.new('RGBA',size,o.get('background','#e4ebd5'));base.alpha_composite(out);out=base
  if o.get('preset')=='icon':
   strength=float(o.get('sharpness',0))
   if not math.isfinite(strength) or not 0<=strength<=2: raise ValueError('边缘增强参数无效')
   if strength:
    alpha=out.getchannel('A')
    out=out.convert('RGB').filter(ImageFilter.UnsharpMask(radius=.6,percent=round(strength*100),threshold=3)).convert('RGBA')
    out.putalpha(alpha)
  result.append(out)
 return result

def validate(data,p,target):
 from io import BytesIO
 with Image.open(BytesIO(data)) as im:
  count=getattr(im,'n_frames',1)
  alpha_min=255;opaque_max=0
  for i in range(count):
   im.seek(i);lo,hi=im.convert('RGBA').getchannel('A').getextrema();alpha_min=min(alpha_min,lo);opaque_max=max(opaque_max,hi)
  checks=[dict(label='精确尺寸',ok=im.size==(p['width'],p['height'])),dict(label='文件格式',ok=im.format in p['formats']),dict(label='目标体积',ok=len(data)<target*1000)]
  if p['animation'] is True: checks.extend([dict(label='包含动画帧',ok=count>1),dict(label='无限循环',ok=im.info.get('loop')==0)])
  elif p['animation'] is False:checks.append(dict(label='静态单帧',ok=count==1))
  if p['alpha']=='required': checks.append(dict(label='包含透明像素',ok=alpha_min==0))
  if p['alpha']=='opaque':checks.append(dict(label='不含透明像素',ok=alpha_min==255))
  checks.append(dict(label='不是全透明空图',ok=opaque_max>0))
  return checks
