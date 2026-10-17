"""Encode Discord 1.1.0, with synchronized forging impacts and original stereo audio."""
import argparse,json,hashlib,shutil,subprocess,wave
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--delivery',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--audio-only',action='store_true');a=p.parse_args()
source=Path(a.source).resolve();out=Path(a.output).resolve();delivery=Path(a.delivery).resolve();out.mkdir(parents=True,exist_ok=True);delivery.mkdir(parents=True,exist_ok=True)
sr=48000;t=np.arange(8*sr)/sr;rng=np.random.default_rng(43106)
def noise(lo,hi):
 hz=np.fft.rfftfreq(len(t),1/sr);sp=np.fft.rfft(rng.normal(size=len(t)));sp*=np.minimum(1,hz/lo)**3/(1+(hz/hi)**8);y=np.fft.irfft(sp,n=len(t));return y/max(.001,y.std())
bass=noise(24,125);wind=noise(180,1800);air=noise(1600,9000)
def impact(at,gain,hz):
 u=np.maximum(0,t-at);return (t>=at)*gain*(.65*np.sin(2*np.pi*(hz*u+2.1*(1-np.exp(-u*23))))*np.exp(-u*4)+.23*bass*np.exp(-u*3)+.22*wind*np.exp(-u*14)+.03*air*np.exp(-u*80))
def chime(at,gain,hz,decay):
 u=np.maximum(0,t-at);return (t>=at)*gain*sum(np.sin(2*np.pi*hz*r*u)*np.exp(-u*(1+i*.6)/decay)/(1+i) for i,r in enumerate([1,1.414,2.718,4.17]))*.5
v=.02*bass+.008*wind+.018*np.sin(2*np.pi*41.2*t)*(1+.3*np.sin(t*2))
v+=impact(.86,.24,62)+impact(1.10,.27,47)
# Mechanical mass: distinct escalating low-frequency strikes for each forged component.
for i,at in enumerate([1.38,1.70,1.76,1.88,2.08,2.28,2.48,2.68,2.88,3.03]):
 v+=impact(at,.22+i*.026,64-i*2.4)+chime(at,.050,230+i*39,.27)
 u=np.maximum(0,t-at);v+=(t>=at)*(.018*air+.035*wind)*np.exp(-u*32)
build=np.clip((t-1)/2.7,0,1)*np.clip((4.23-t)/.08,0,1)
v+=build*(.045*wind+.013*air+.032*np.sin(2*np.pi*(83*t+14*t*t)))
v+=chime(1.4,.038,196,2.2)+chime(1.48,.022,207.65,2.1)+chime(2.55,.045,293.66,1.5)
for at,amp in [(1.73,.030),(2.08,.030),(2.48,.034),(2.88,.040),(3.03,.045),(4.23,.065),(4.40,.035),(4.73,.030)]:
 u=np.maximum(0,t-at);window=(t>=at)*np.exp(-u*35);v+=amp*window*(np.sign(np.sin(2*np.pi*(1700*u+600*u*u)))*.16+wind*.50)
left=np.zeros_like(t);right=np.zeros_like(t)
for i in range(75):
 at=float(rng.uniform(.8,4.05));c=chime(at,.018,float(rng.uniform(950,3100)),float(rng.uniform(.03,.15)));pan=np.sin(at*5+i);left+=c*(1-pan*.7);right+=c*(1+pan*.7)
# The held breath directly precedes the frame-128 slash, approximately t=4.23.
hush=(t>=4.03)*(t<4.23);v*=1-.95*hush;left*=1-.95*hush;right*=1-.95*hush
v+=np.exp(-((t-4.23)/.07)**2)*(.25*wind+.035*air)+impact(4.28,.93,34)
for i in range(70):
 at=4.29+i*.014;c=chime(at,float(rng.uniform(.015,.042)),float(rng.uniform(850,4800)),float(rng.uniform(.12,.42)));pan=float(rng.uniform(-1,1));left+=c*(1-pan*.8);right+=c*(1+pan*.8)
v+=np.exp(-((t-5.50)/.4)**2)*(.10*wind+.025*air)
for at,hz in [(6.2,48),(6.3,63),(6.4,52)]:v+=impact(at,.24,hz)
for at,hz in [(6.53,146.83),(6.56,220),(6.60,293.66),(6.67,587.33)]:v+=chime(at,.055,hz,1.1)
left+=v;right+=v
for delay,gain in [(.035,.18),(.077,.14),(.15,.10),(.26,.07),(.42,.04),(.65,.025)]:
 n=int(sr*delay);left[n:]+=v[:-n]*gain;n=int(sr*delay*1.1);right[n:]+=v[:-n]*gain
stereo=np.column_stack([left,right]);stereo*=np.clip(t/.06,0,1)[:,None]*np.clip((8-t)/.30,0,1)[:,None];stereo*=.88/max(.88,float(np.abs(stereo).max()))
wav=source/'discord-stereo.wav'
with wave.open(str(wav),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((stereo*32767).astype('<i2').tobytes())
audio={'source':'Original procedural synchronized stereo','sampleRate':sr,'channels':2,'peak':float(np.abs(stereo).max()),'rms':float(np.sqrt(np.mean(stereo**2))),'silentBeat':[4.03,4.23]}
if a.audio_only:print(json.dumps(audio));raise SystemExit()
def run(args):subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y',*args],check=True)
assets=[]
for ori in ['landscape','portrait']:
 frames=source/ori/'frames';missing=[i for i in range(1,241) if not(frames/f'frame-{i:04}.png').exists()]
 if missing:raise RuntimeError(f'{ori}: missing frames {missing[:10]}')
 movie=out/f'effect-{ori}.mp4';run(['-framerate','30','-start_number','1','-i',str(frames/'frame-%04d.png'),'-i',str(wav),'-vf','hqdn3d=1.2:1.2:2:2','-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','8',str(movie)])
 poster=out/f'effect-{ori}.jpg';Image.open(frames/'frame-0106.png').save(poster,quality=95)
 for file in [movie,poster]:
  assets.append({'file':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()});shutil.copy2(file,delivery/file.name)
 sheet=Image.new('RGB',(1600,900),'#100924')
 for i,f in enumerate([18,57,79,106,128,137,193,210]):
  im=Image.open(frames/f'frame-{f:04}.png');im.thumbnail((400,418));x=(i%4)*400+(400-im.width)//2;y=(i//4)*450+(418-im.height)//2;sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text(((i%4)*400+10,(i//4)*450+426),f'{(f-1)/30:.2f}s',fill='#c6c6ff')
 sheet.save(delivery/f'contact-{ori}.jpg',quality=93)
manifest={'version':'1.1.0','name':'断序杂音 · 崩界铸刃','durationSeconds':8,'fps':30,'frames':240,'handoffSeconds':6.8,'presentationOnly':True,'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'audio':audio,'changes':['17.1-unit long sword with segmented diamond blade, swept guard, inlay and wrapped hilt','Ten individually accelerated assembly parts, damped recoil and synchronized forging impacts','Layered energy helices, ballistic shards, fracture networks and refracted protection impacts','Brief keyed RGB dispersion and horizontal reality-collapse bands'],'timeline':[{'at':0,'event':'Two symbolic attack costs converge'},{'at':1.38,'event':'Hilt and swept guard hammer into place'},{'at':1.88,'event':'Five blade sections accelerate and forge, one by one'},{'at':2.88,'event':'Long needle point and core lock into sword'},{'at':3.75,'event':'Anticipation and held breath'},{'at':4.23,'event':'Cyan slash, ballistic rupture and reality-collapse filter'},{'at':5.45,'event':'Crystal crown forms protection'},{'at':6.2,'event':'Three hostile lances refract away'},{'at':6.8,'event':'Live ally-nameplate handoff window'},{'at':8,'event':'End film and audio'}],'provenance':'Original Blender geometry, materials, animation, camera, procedural nebula and synthesized sound. Art direction follows the supplied card palette; no shrine, character identity, physical hand data, scoring or game randomness in the video.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copy2(out/'manifest.json',delivery/'manifest.json');print(json.dumps(manifest,ensure_ascii=False,indent=2))
