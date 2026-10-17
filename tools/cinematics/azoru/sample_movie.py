"""Standalone review copy with example declaration 5 (never packaged in the app)."""
import argparse,json,pathlib,subprocess
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--source',required=True);p.add_argument('--font',required=True);p.add_argument('--output',required=True);a=p.parse_args()
source=pathlib.Path(a.source);w,h=1600,1000
anchors=json.loads((source/'landscape/text-anchors.json').read_text())
font=lambda size:ImageFont.truetype(a.font,size)
glyph=Image.new('RGBA',(640,960));d=ImageDraw.Draw(glyph)
d.text((320,165),'宣 告 之 数',font=font(38),fill='#edac78',anchor='mm')
d.text((320,482),'5',font=font(500),fill='#ffcf92',anchor='mm')
d.text((320,799),'赤 染 成 玉',font=font(36),fill='#dc9466',anchor='mm')
glow=Image.new('RGBA',glyph.size,'#dd3918');glow.putalpha(glyph.getchannel('A').filter(ImageFilter.GaussianBlur(14)).point(lambda x:round(x*.6)))
glyph=Image.alpha_composite(glow,glyph)
def sample(time):
    after=next((i for i,x in enumerate(anchors) if x['time']>=time),-1)
    if after<=0:return np.array(anchors[0 if after==0 else -1]['points'])*[w,h]
    x,y=anchors[after-1],anchors[after];t=(time-x['time'])/(y['time']-x['time'])
    return (np.array(x['points'])*(1-t)+np.array(y['points'])*t)*[w,h]
def coeff(quad):
    rows=[];values=[]
    for (x,y),(u,v) in zip(quad,[(0,0),(640,0),(640,960),(0,960)]):
        rows.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);values.extend([u,v])
    return np.linalg.solve(np.array(rows),np.array(values))
command=[a.ffmpeg,'-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1600x1000','-r','30','-i','-','-i',str(source/'azorubine-sound.wav'),'-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-t','6','-movflags','+faststart',a.output]
proc=subprocess.Popen(command,stdin=subprocess.PIPE)
try:
    for i in range(1,181):
        t=(i-1)/30;base=Image.open(source/f'landscape/frames/frame-{i:04d}.png').convert('RGBA')
        if t>=3.65:
            transformed=glyph.transform((w,h),Image.Transform.PERSPECTIVE,coeff(sample(t)),Image.Resampling.BICUBIC)
            fade=min(1,(t-3.65)/.45)
            transformed.putalpha(transformed.getchannel('A').point(lambda x:round(x*fade)))
            base=Image.alpha_composite(base,transformed)
        overlay=Image.new('RGBA',(w,h));d=ImageDraw.Draw(overlay)
        for pos,text,size,color,anchor in [((68,58),'偶氮玉红',56,'#f6dfc0','lt'),((72,128),'赤 染 炼 成',24,'#ce967c','lt'),((800,916),'和牌时 · 每两张声明数字牌，追加一张宝牌',27,'#f6dfc0','mm'),((800,956),'演示声明：5  ·  实际游戏随本次声明改变',19,'#b2988c','mm')]:
            d.text(pos,text,font=font(size),fill=color,anchor=anchor,stroke_width=2,stroke_fill='#10050bcc')
        base=Image.alpha_composite(base,overlay)
        proc.stdin.write(base.convert('RGB').tobytes())
finally:proc.stdin.close()
if proc.wait()!=0:raise RuntimeError('Sample encode failed')
print(a.output)
