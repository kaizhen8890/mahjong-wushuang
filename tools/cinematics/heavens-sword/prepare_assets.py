"""Rasterized title glyphs from the project's installed presentation typeface."""
import argparse,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--font',default='public/fonts/Wushuang-Jianghu.ttf');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype(a.font,610)
for i,ch in enumerate('听天问剑飞'):
 im=Image.new('RGBA',(800,800));d=ImageDraw.Draw(im);b=d.textbbox((0,0),ch,font=font,stroke_width=14);pos=((800-b[2]+b[0])/2-b[0],(800-b[3]+b[1])/2-b[1]);d.text(pos,ch,font=font,fill='#ffe348',stroke_width=14,stroke_fill='#bb140b');im.save(out/f'glyph-{i}.png')
(out/'font.json').write_text(json.dumps({'family':font.getname(),'font':str(Path(a.font).resolve()),'text':'听天问剑飞','face':'gold yellow','outline':'red','fontCopied':False},ensure_ascii=False,indent=2),encoding='utf-8')
