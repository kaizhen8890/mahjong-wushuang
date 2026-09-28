"""Render full card faces, including vector text, from the supplied print PDF.
Usage: python scripts/extract-skill-art.py path/to/cards.pdf
Requires pymupdf and Pillow. Existing art is not overwritten.
"""
import json, sys, re
from pathlib import Path
import pymupdf as pdf
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
out = root / 'public/skill-cards'
out.mkdir(parents=True, exist_ok=True)
cards = json.loads((root / 'data/skill-cards.json').read_text(encoding='utf8'))['cards']
doc = pdf.open(sys.argv[1])
entries = []
norm = lambda s: re.sub(r'\s+', '', s)
for index, page in enumerate(doc):
    boxes = [pdf.Rect(info['bbox']) for info in page.get_image_info()
             if 178 < pdf.Rect(info['bbox']).width < 183 and 250 < pdf.Rect(info['bbox']).height < 255]
    boxes.sort(key=lambda box: (round(box.y0 / 20), box.x0))
    for slot, box in enumerate(boxes):
        # Match only the title area, never card rules that mention another card.
        title = page.get_text(clip=pdf.Rect(box.x0+12, box.y0+8, box.x1-25, box.y0+40)).strip().replace('\n', ' ')
        matches = [card for card in cards if norm(card['name']) in norm(title)]
        card = max(matches, key=lambda c: len(c['name'])) if matches else None
        filename = f'pdf-p{index+1:02}-card{slot+1:02}.png'
        target = out / filename
        if target.exists():
            raise RuntimeError(f'Refusing to overwrite {target}')
        # Inset 0.7pt excludes the printer cut line while keeping the full border.
        clip = pdf.Rect(box.x0+.7, box.y0+.7, box.x1-.7, box.y1-.7)
        pix = page.get_pixmap(matrix=pdf.Matrix(4,4), clip=clip, alpha=False)
        pix.save(str(target))
        entries.append({'key': filename[:-4], 'cardId': card['id'] if card else None,
                        'name': title, 'src': '/skill-cards/'+filename, 'page': index+1,
                        'crop': list(clip), 'width':pix.width, 'height':pix.height})
(out / 'manifest.json').write_text(json.dumps({'schemaVersion':1,'cards':entries}, ensure_ascii=False, indent=2)+'\n', encoding='utf8')
sheet = Image.new('RGB', (1000, ((len(entries)+7)//8)*205), '#252039')
draw = ImageDraw.Draw(sheet)
for i, entry in enumerate(entries):
    img = Image.open(out / Path(entry['src']).name)
    img.thumbnail((120,174))
    x,y=(i%8)*125,(i//8)*205
    sheet.paste(img,(x,y))
    draw.text((x+3,y+177),f"p{entry['page']} / ID {entry['cardId']}",fill='white')
sheet.save(root / 'work/skill-art/contact-sheet.png')
print(json.dumps({'extracted':len(entries),'unmatched':[e['key'] for e in entries if e['cardId'] is None]},ensure_ascii=False))
