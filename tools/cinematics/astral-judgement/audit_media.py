"""Full video decode, delivery hashes, title settings and render error checks."""
import argparse,json,re,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--assets',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--report',required=True);a=p.parse_args();assets=Path(a.assets);report=Path(a.report);m=json.loads((assets/'manifest.json').read_text(encoding='utf-8'));items=[]
assert m['title']['font']=='STZhongsong / 华文中宋';assert m['title']['face']=='white' and m['title']['outline']=='violet'
for ori in ['landscape','portrait']:
 f=assets/f'effect-{ori}.mp4';info=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(f)],capture_output=True,text=True).stderr
 r=subprocess.run([a.ffmpeg,'-hide_banner','-v','error','-nostats','-progress','pipe:1','-i',str(f),'-f','null','NUL'],capture_output=True,text=True)
 frames=int(re.findall(r'frame=(\d+)',r.stdout)[-1]);assert frames==300,(ori,frames);assert r.returncode==0 and not r.stderr.strip(),r.stderr
 res='1000x1600' if ori=='portrait' else '1600x1000';assert res in info and '30 fps' in info and '48000 Hz, stereo' in info and 'Duration: 00:00:10.00' in info,info
 sha=hashlib.sha256(f.read_bytes()).hexdigest();assert next(x for x in m['assets'] if x['file']==f.name)['sha256']==sha;copy=report.parent/'成片'/f.name;assert hashlib.sha256(copy.read_bytes()).hexdigest()==sha
 for kind in ['render','title']:
  log=report.parent/f'{kind}-{ori}.log';text=log.read_text(encoding='utf-8',errors='replace');assert not re.search('Traceback|Error:|Shadow buffer full',text),str(log)
 items.append({'file':str(f.resolve()),'framesDecoded':frames,'duration':10,'resolution':res,'fps':30,'audio':'AAC 48kHz stereo','sha256':sha,'decodeErrors':r.stderr})
ref=json.loads((report.parent/'reference-sha256.json').read_text(encoding='utf-8-sig'));assert hashlib.sha256(Path(ref['Path']).read_bytes()).hexdigest()==ref['Hash'].lower()
report.write_text(json.dumps({'items':items,'referenceUnchanged':True,'title':m['title'],'scope':'Desktop full decode, file hashes and render-log checks. No Android or game-integration test.'},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(items,indent=2))
