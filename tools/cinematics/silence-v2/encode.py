from pathlib import Path
import argparse,subprocess,hashlib,json
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--frames',required=True);p.add_argument('--out',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--orientation',default='both');a=p.parse_args();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
assets=[]
for shape in (['landscape','portrait'] if a.orientation=='both' else [a.orientation]):
 frames=Path(a.frames)/shape
 assert len(list(frames.glob('*.png')))==192
 subprocess.run([a.ffmpeg,'-y','-v','error','-framerate','30','-start_number','0','-i',str(frames/'%04d.png'),'-i',str(out/'intro-sound.wav'),'-map','0:v:0','-map','1:a:0','-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v','libx264','-preset','slow','-crf','17','-profile:v','high','-level:v','4.1','-maxrate','16000k','-bufsize','32000k','-g','30','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t','6.4','-movflags','+faststart',str(out/f'intro-{shape}.mp4')],check=True)
 Image.open(frames/'0000.png').save(out/f'poster-{shape}.jpg',quality=95,subsampling=0)
for path in sorted(out.iterdir()):
 if path.suffix in ['.mp4','.jpg']:
  data=path.read_bytes();assets.append({'file':path.name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest={'version':'2.0.0','name':'寂静之地 · 无声封界','durationSeconds':6.4,'silenceSeconds':4.7,'titleSeconds':5.5,'revealSeconds':6.4,'tailMs':800,'fps':30,'frames':192,'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'assets':assets,'provenance':'Original procedural v2 geometry, continuous pre-fractured pressure waves and deterministic synthesized audio. A development of the supplied silence package; no third-party models, texture images or audio samples.'}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8');print('Encoded and hashed',len(assets),'media assets.')
