"""Full video decode, delivery hashes, title settings and render error checks."""
import argparse,json,re,subprocess,hashlib
import numpy as np
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--assets',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--report',required=True);a=p.parse_args();assets=Path(a.assets);report=Path(a.report);m=json.loads((assets/'manifest.json').read_text(encoding='utf-8'));items=[]
assert m['title']['font']=='STZhongsong / 华文中宋';assert m['title']['face']=='white' and m['title']['outline']=='violet'
for ori in ['landscape','portrait']:
 f=assets/f'effect-{ori}.mp4';info=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(f)],capture_output=True,text=True).stderr
 r=subprocess.run([a.ffmpeg,'-hide_banner','-v','error','-nostats','-progress','pipe:1','-i',str(f),'-f','null','NUL'],capture_output=True,text=True)
 frames=int(re.findall(r'frame=(\d+)',r.stdout)[-1]);assert frames==300,(ori,frames);assert r.returncode==0 and not r.stderr.strip(),r.stderr
 res='1000x1600' if ori=='portrait' else '1600x1000';assert res in info and '30 fps' in info and '48000 Hz, stereo' in info and 'Duration: 00:00:10.00' in info,info
 sha=hashlib.sha256(f.read_bytes()).hexdigest();assert next(x for x in m['assets'] if x['file']==f.name)['sha256']==sha;copy=report.parent/'成片'/f.name;assert hashlib.sha256(copy.read_bytes()).hexdigest()==sha
 for kind in ['render']:
  log=report.parent/f'{kind}-{ori}.log';text=log.read_text(encoding='utf-8',errors='replace');assert not re.search('Traceback|Error:|Shadow buffer full',text),str(log)
 white=[]
 for at in [6.95,7.60,8.10]:
  sample=subprocess.run([a.ffmpeg,'-hide_banner','-v','error','-ss',str(at),'-i',str(f),'-frames:v','1','-vf','scale=64:64','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],capture_output=True,check=True)
  pixels=np.frombuffer(sample.stdout,dtype=np.uint8);assert len(pixels)==64*64*3 and int(pixels.min())>=230 and int(pixels.max())-int(pixels.min())<=3,(ori,at,pixels.min(),pixels.max())
  white.append({'time':at,'min':int(pixels.min()),'max':int(pixels.max())})
 items.append({'file':str(f.resolve()),'framesDecoded':frames,'duration':10,'resolution':res,'fps':30,'audio':'AAC 48kHz stereo','sha256':sha,'decodeErrors':r.stderr,'whiteHoldSamples':white})
ref=json.loads((report.parent/'reference-sha256.json').read_text(encoding='utf-8-sig'));assert hashlib.sha256(Path(ref['Path']).read_bytes()).hexdigest()==ref['Hash'].lower()
for old in json.loads((report.parent/'v1-preserved-sha256.json').read_text(encoding='utf-8-sig')):assert hashlib.sha256(Path(old['Path']).read_bytes()).hexdigest()==old['Hash'].lower(),old['Path']
report.write_text(json.dumps({'items':items,'referenceUnchanged':True,'v1Unchanged':True,'title':m['title'],'scope':'Desktop full decode, file hashes, white-hold samples and render-log checks. No Android or game-integration test.'},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(items,indent=2))
