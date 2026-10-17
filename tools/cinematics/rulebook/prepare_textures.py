"""Original parchment and seal textures, generated from noise and project font."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np, argparse, pathlib, random
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--font',required=True);a=p.parse_args()
out=pathlib.Path(a.out);out.mkdir(parents=True,exist_ok=True);rng=np.random.default_rng(13102026);random.seed(13102026)
w,h=1280,1792
small=Image.fromarray(rng.integers(50,200,(30,24),dtype=np.uint8)).resize((w,h),Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(25))
cloud=np.asarray(small,dtype=float)/255
y,x=np.mgrid[0:h,0:w];edge=np.minimum.reduce([x/w,(w-x)/w,y/h,(h-y)/h]);wear=np.exp(-edge*19)
grain=rng.normal(0,2.0,(h,w));base=np.stack([204+cloud*21-wear*55+grain,183+cloud*16-wear*64+grain,137+cloud*22-wear*63+grain],axis=-1)
paper=Image.fromarray(np.uint8(np.clip(base,0,255)))
font=ImageFont.truetype(a.font,78);smallfont=ImageFont.truetype(a.font,58)
for name,written in [('left-page',True),('right-page',False),('turning-page',True)]:
    im=paper.copy();d=ImageDraw.Draw(im)
    for inset in [76,94]:d.rectangle((inset,inset,w-inset,h-inset),outline=(97,57,35),width=3)
    for corner in [(76,76),(w-76,76),(76,h-76),(w-76,h-76)]:
        cx,cy=corner;d.ellipse((cx-20,cy-20,cx+20,cy+20),outline=(108,59,38),width=4)
    if written:
        chars='禁典秘录敕令守约慎言墨契循律无妄界定万象归章'
        for col in range(8):
            for row in range(12):
                if random.random()<.13:continue
                d.text((w-230-col*129,180+row*119),chars[(col*7+row*3)%len(chars)],font=font,fill=(62,43,32))
        d.line((160,1550,1080,1550),fill=(98,64,42),width=3)
    else:
        d.text((170,180),'禁 典 · 改 律',font=smallfont,fill=(97,51,34))
        for yy in [360,1500]:d.line((155,yy,1125,yy),fill=(109,68,42),width=2)
    im.save(out/f'{name}.png')
seal=Image.new('RGBA',(1024,1024));d=ImageDraw.Draw(seal);red=(132,15,21,245)
for inset,width in [(70,26),(112,8)]:d.rounded_rectangle((inset,inset,1024-inset,1024-inset),radius=14,outline=red,width=width)
f=ImageFont.truetype(a.font,680);bbox=d.textbbox((0,0),'敕',font=f)
d.text(((1024-(bbox[2]-bbox[0]))/2-bbox[0],(1024-(bbox[3]-bbox[1]))/2-bbox[1]),'敕',font=f,fill=red)
arr=np.array(seal);mask=rng.random((1024,1024));arr[:,:,3]=np.where(mask<.10,0,arr[:,:,3]);Image.fromarray(arr).save(out/'seal.png')
print(out.resolve())
