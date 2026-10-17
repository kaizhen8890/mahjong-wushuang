"""Render exact STZhongsong glyph masks; preserve counters with a true outline.
Only four rasterized glyphs are produced; the installed font file is not copied.
"""
import argparse,json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--font',default='C:/Windows/Fonts/STZHONGS.TTF');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True);font=ImageFont.truetype(a.font,640)
for index,char in enumerate('宿星审判'):
 im=Image.new('RGBA',(800,800));d=ImageDraw.Draw(im);box=d.textbbox((0,0),char,font=font,stroke_width=8);pos=((800-(box[2]-box[0]))/2-box[0],(800-(box[3]-box[1]))/2-box[1]);d.text(pos,char,font=font,fill='#ffffff',stroke_width=8,stroke_fill='#9146d9');im.save(out/f'glyph-{index}.png')
(out/'font.json').write_text(json.dumps({'family':font.getname(),'sourceFont':str(Path(a.font).resolve()),'text':'宿星审判','whiteFill':True,'purpleStroke':True,'fontFileDistributed':False},ensure_ascii=False,indent=2),encoding='utf-8');print(font.getname())
