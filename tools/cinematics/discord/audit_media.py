"""Complete media decode and offline render checks (not Android device testing)."""
import argparse,json,re,subprocess,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--assets',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--report',required=True);a=p.parse_args();assets=Path(a.assets);report=Path(a.report);m=json.loads((assets/'manifest.json').read_text(encoding='utf-8'));items=[]
for ori in ['landscape','portrait']:
 f=assets/f'effect-{ori}.mp4';info=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(f)],capture_output=True,text=True).stderr
 r=subprocess.run([a.ffmpeg,'-hide_banner','-v','error','-nostats','-progress','pipe:1','-i',str(f),'-f','null','NUL'],capture_output=True,text=True)
 frames=int(re.findall(r'frame=(\d+)',r.stdout)[-1]);assert frames==240,(ori,frames);assert r.returncode==0 and not r.stderr.strip(),r.stderr
 res='1000x1600' if ori=='portrait' else '1600x1000';assert res in info and '30 fps' in info and '48000 Hz, stereo' in info,info
 sha=hashlib.sha256(f.read_bytes()).hexdigest();assert next(x for x in m['assets'] if x['file']==f.name)['sha256']==sha
 for prefix in ['render','refine']:
  log=report.parent/(f'{prefix}-{ori}-final.log' if prefix=='refine' else f'{prefix}-{ori}.log');text=log.read_text(encoding='utf-8',errors='replace');assert not re.search('Traceback|Error:|Shadow buffer full',text),str(log)
 items.append({'file':str(f.resolve()),'framesDecoded':frames,'duration':8,'resolution':res,'fps':30,'audio':'AAC 48kHz stereo','sha256':sha,'decodeErrors':r.stderr})
report.write_text(json.dumps({'items':items,'scope':'Desktop full decode and render-log checks. No Android or game-integration test.'},ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(items,indent=2))
