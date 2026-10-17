"""Decode every frame and verify hashes/specs without launching the Android app."""
import argparse,json,re,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--assets',required=True);p.add_argument('--source',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--report',required=True);a=p.parse_args();assets=Path(a.assets);source=Path(a.source);report=Path(a.report);m=json.loads((assets/'manifest.json').read_text(encoding='utf-8'));items=[]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
assert m['presentationOnly'] and m['cardId']==44 and m['frames']==330
for ending in ['heads','tails']:
 for ori in ['landscape','portrait']:
  tag=f'{ending}-{ori}';f=assets/f'effect-{tag}.mp4';info=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(f)],capture_output=True,text=True).stderr;r=subprocess.run([a.ffmpeg,'-hide_banner','-v','error','-nostats','-progress','pipe:1','-i',str(f),'-f','null','NUL'],capture_output=True,text=True);frames=int(re.findall(r'frame=(\d+)',r.stdout)[-1]);assert frames==330 and r.returncode==0 and not r.stderr.strip(),(tag,r.stderr)
  res='1000x1600' if ori=='portrait' else '1600x1000';assert res in info and '30 fps' in info and '48000 Hz, stereo' in info and 'Duration: 00:00:11.00' in info,info
  digest=sha(f);assert next(x for x in m['assets'] if x['file']==f.name)['sha256']==digest;assert sha(report.parent/'成片'/f.name)==digest
  log=report.parent/f'render-{tag}.log';text=log.read_text(encoding='utf-8',errors='replace');assert not re.search('Traceback|Error:|Shadow buffer full',text),str(log)
  items.append({'file':f.name,'framesDecoded':frames,'duration':11,'resolution':res,'fps':30,'audio':'AAC 48kHz stereo','sha256':digest,'decodeErrors':r.stderr})
for ori in ['landscape','portrait']:
 for f in list(range(1,241))+list(range(286,331)):
  name=f'frame-{f:04}.png';assert sha(source/f'heads-{ori}'/'frames'/name)==sha(source/f'tails-{ori}'/'frames'/name),(ori,f)
 assert sha(source/f'heads-{ori}'/'frames/frame-0266.png')!=sha(source/f'tails-{ori}'/'frames/frame-0266.png')
ref=json.loads((report.parent/'reference-sha256.json').read_text(encoding='utf-8-sig'));assert sha(Path(ref['Path']))==ref['Hash'].lower()
report.write_text(json.dumps({'items':items,'referenceUnchanged':True,'commonFramesEqual':True,'differentOutcomeFrame':True,'scope':'Desktop decode and source/asset checks; no Android/game integration test.'},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(items,indent=2))
