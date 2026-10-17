"""Original 11-second cinematic sound and four H.264 deliveries."""
import argparse,json,hashlib,shutil,subprocess,wave
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--delivery',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--audio-only',action='store_true');a=p.parse_args();source=Path(a.source).resolve();out=Path(a.output).resolve();delivery=Path(a.delivery).resolve();out.mkdir(parents=True,exist_ok=True);delivery.mkdir(parents=True,exist_ok=True)
sr=48000;t=np.arange(sr*11)/sr;rng=np.random.default_rng(44003)
def noise(lo,hi):
 hz=np.fft.rfftfreq(len(t),1/sr);sp=np.fft.rfft(rng.normal(size=len(t)));sp*=np.minimum(1,hz/lo)**3/(1+(hz/hi)**8);v=np.fft.irfft(sp,n=len(t));return v/max(.001,v.std())
bass=noise(25,140);wind=noise(150,2400);air=noise(2000,11000)
def ring(at,gain,hz,decay):
 u=np.maximum(0,t-at);return (t>=at)*gain*sum(np.sin(2*np.pi*hz*r*u)*np.exp(-u*(1+i*.6)/decay)/(1+i)**1.4 for i,r in enumerate([1,1.498,2.731,4.117]))*.5
def impact(at,gain,hz):
 u=np.maximum(0,t-at);return (t>=at)*gain*(.58*np.sin(2*np.pi*(hz*u+2*(1-np.exp(-u*27))))*np.exp(-u*4)+.26*bass*np.exp(-u*4.2)+.25*wind*np.exp(-u*21))
base=.015*bass+.007*wind
base+=.022*np.clip(t/.6,0,1)*np.clip((4.3-t)/.5,0,1)*np.sin(2*np.pi*(49*t+.35*t*t))
# Close blade scrape and fine steel resonance.
base+=np.exp(-((t-.65)/.42)**2)*(.045*air+.016*np.sin(2*np.pi*(1850*t+420*t*t)))
for at,hz in [(.18,1860),(.72,2230),(1.18,1174)]:base+=ring(at,.03,hz,.38)
rise=np.clip((t-1.2)/2.6,0,1)*np.clip((4.38-t)/.14,0,1)
base+=rise*(.075*wind+.045*bass+.028*np.sin(2*np.pi*(41*t+4*t*t)))
left=np.zeros_like(t);right=np.zeros_like(t)
for i in range(48):
 at=1.4+i*.061;u=t-at;v=.014*np.exp(-(u/.085)**2)*(air+.3*wind);pan=np.sin(i*1.7);left+=v*(1-pan*.8);right+=v*(1+pan*.8)
# Three increasingly heavy cuts, each with a vacuum, accelerating whoosh, impact and steel clang.
for j,at in enumerate([4.63,5.35,6.14]):
 gain=[.58,.72,1.0][j];u=t-at
 vacuum=1-.85*np.exp(-((u+.20)/.045)**2);base*=vacuum
 whoosh=gain*.16*np.exp(-((u+.075)/.075)**2)*(wind+.4*air)
 left+=whoosh*(1+np.tanh(-u*35)*.65*(-1 if j%2 else 1));right+=whoosh*(1-np.tanh(-u*35)*.65*(-1 if j%2 else 1))
 base+=impact(at,gain,48-j*8)+ring(at,.08*gain,370-j*48,.75)
 base+=(u>=0)*gain*.055*air*np.exp(-np.maximum(0,u)*7)*(np.maximum(0,np.sin(u*130))**4)
base+=np.clip((t-6.14)/.1,0,1)*np.exp(-np.maximum(0,t-6.14)*1.25)*(.18*bass+.07*wind)
base+=ring(6.22,.07,98,1.8)
audios={}
for ending in ['heads','tails']:
 v=base.copy();ll=left.copy();rr=right.copy()
 if ending=='heads':
  for j in range(5):
   at=8.03+j*.105;v+=impact(at,.12,105+j*10)+ring(at,.06,440+j*66,.30)
 else:
  v+=impact(8.0,.24,62)
  for j in range(12):v+=ring(8.09+j*.051,.019,700+j*83,.18)
  v+=ring(8.83,.11,293.66,.6)
 v+=np.exp(-((t-9.19)/.18)**2)*.065*wind+impact(9.53,.60,42)+ring(9.53,.11,147,.9)
 ll+=v;rr+=v
 for delay,gain in [(.039,.20),(.093,.13),(.171,.09),(.29,.065),(.46,.035),(.68,.022)]:
  q=int(sr*delay);ll[q:]+=v[:-q]*gain;q=int(sr*delay*1.08);rr[q:]+=v[:-q]*gain
 audio=np.column_stack([ll,rr]);audio*=np.clip(t/.09,0,1)[:,None]*np.clip((11-t)/.36,0,1)[:,None];audio*=.88/max(.88,float(np.abs(audio).max()));path=source/f'{ending}-stereo.wav'
 with wave.open(str(path),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((audio*32767).astype('<i2').tobytes())
 audios[ending]={'peak':float(np.abs(audio).max()),'rms':float(np.sqrt(np.mean(audio**2))),'sampleRate':sr,'channels':2}
if a.audio_only:print(json.dumps(audios));raise SystemExit()
assets=[]
for ending in ['heads','tails']:
 for ori in ['landscape','portrait']:
  tag=f'{ending}-{ori}';frames=source/tag/'frames';assert all((frames/f'frame-{f:04}.png').exists() for f in range(1,331)),tag
  movie=out/f'effect-{tag}.mp4';subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(frames/'frame-%04d.png'),'-i',str(source/f'{ending}-stereo.wav'),'-vf','hqdn3d=1.1:1.1:2:2','-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','11',str(movie)],check=True)
  poster=out/f'effect-{tag}.jpg';Image.open(frames/'frame-0120.png').save(poster,quality=95)
  for path in [movie,poster]:assets.append({'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()});shutil.copy2(path,delivery/path.name)
  sheet=Image.new('RGB',(1920,900),'#090d14');draw=ImageDraw.Draw(sheet)
  for i,f in enumerate([25,85,122,141,164,188,207,262,279,306]):
   im=Image.open(frames/f'frame-{f:04}.png');im.thumbnail((384,415));x=i%5*384+(384-im.width)//2;y=i//5*450+(415-im.height)//2;sheet.paste(im,(x,y));draw.text((i%5*384+12,i//5*450+426),f'{(f-1)/30:.2f}s',fill='#eed8ba')
  sheet.save(delivery/f'contact-{tag}.jpg',quality=94)
manifest={'version':'1.0.0','cardId':44,'name':'听天问剑 · 断天三斩','durationSeconds':11,'fps':30,'frames':330,'presentationOnly':True,'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'endings':{'heads':'Five generic skill card backs: +5 on each draw this round','tails':'One symbolic revealed wild tile 飞: human selects the real tile'},'title':{'text':'听天问剑','face':'gold yellow','outline':'red','font':'Project Wushuang-Jianghu','fontFileCopied':False},'audio':audios,'timeline':[{'at':0,'event':'Steel cutting-edge macro'},{'at':1.2,'event':'Red blue storm and complete cleaver reveal'},{'at':3,'event':'Weighted preparation'},{'at':4.63,'event':'First heavy slash'},{'at':5.35,'event':'Second heavy slash'},{'at':6.14,'event':'Final cleave and continental fracture'},{'at':8,'event':'Outcome-specific five cards or wild tile'},{'at':9.53,'event':'Gold title with red outline'},{'at':11,'event':'End'}],'provenance':'Original Blender geometry, procedural storm and materials, ballistic particles and synthesized stereo sound. Existing project font rendered into glyph textures. Both endings share frames 1-240 and 286-330 within each orientation; tails may reuse these identical frames. Does not choose coin outcomes, cards or real hand tiles.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copy2(out/'manifest.json',delivery/'manifest.json');print(json.dumps(manifest,ensure_ascii=False,indent=2))
