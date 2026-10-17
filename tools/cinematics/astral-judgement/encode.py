"""Original synced sound and H.264 deliverables for Astral Judgement, 10 seconds."""
import argparse, json, hashlib, shutil, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--delivery',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--audio-only',action='store_true');a=p.parse_args()
source=Path(a.source).resolve();out=Path(a.output).resolve();delivery=Path(a.delivery).resolve();out.mkdir(parents=True,exist_ok=True);delivery.mkdir(parents=True,exist_ok=True)
sr=48000;t=np.arange(sr*10)/sr;rng=np.random.default_rng(43003)
def noise(lo,hi):
 hz=np.fft.rfftfreq(len(t),1/sr);sp=np.fft.rfft(rng.normal(size=len(t)));sp*=np.minimum(1,hz/lo)**3/(1+(hz/hi)**8);v=np.fft.irfft(sp,n=len(t));return v/max(.001,v.std())
bass=noise(22,135);wind=noise(130,2200);air=noise(2200,8800)
def chime(at,gain,hz,decay):
 u=np.maximum(0,t-at);return (t>=at)*gain*sum(np.sin(2*np.pi*hz*r*u)*np.exp(-u*(1+i*.5)/decay)/(1+i)**1.5 for i,r in enumerate([1,2.003,2.758,4.091]))*.5
def impact(at,gain,hz):
 u=np.maximum(0,t-at);return (t>=at)*gain*(.68*np.sin(2*np.pi*(hz*u+1.8*(1-np.exp(-u*21))))*np.exp(-u*3.4)+.24*bass*np.exp(-u*4.0)+.20*wind*np.exp(-u*17))
v=.011*bass+.006*wind;left=np.zeros_like(t);right=np.zeros_like(t)
# Airy original harmonic bed: slow attack, slight detuning, no sampled voice.
intro=np.clip(t/.7,0,1)*np.clip((6.5-t)/1.5,0,1)
for hz,gain in [(146.83,.018),(220,.012),(293.66,.011),(440,.007)]:
 v+=gain*intro*(np.sin(2*np.pi*hz*t)+.25*np.sin(2*np.pi*(hz*1.003)*t))*(.75+.25*np.sin(t*.9))
for at,hz in [(.25,880),(.76,1174.66),(1.42,1318.51),(1.90,1760),(2.4,987.77)]:v+=chime(at,.055,hz,1.0)
for i in range(30):
 at=.25+i*.081;u=t-at;c=.017*np.exp(-(u/.08)**2)*air;pan=np.sin(i*.7);left+=c*(1-pan*.7);right+=c*(1+pan*.7)
v+=impact(1.85,.13,66)+impact(2.8,.26,58)
# Successively denser waves of star projectiles sweep across the stereo field.
for i in range(48):
 at=2.82+i*.060;u=t-at;env=np.exp(-(u/(.11-.04*i/48))**2);c=(.019+.020*i/48)*env*(wind+.22*air);pan=np.sin(i*.72);left+=c*(1-pan*.85);right+=c*(1+pan*.85)
for i in range(55):
 at=3.0+i*.048;c=chime(at,.011,float(rng.uniform(900,3600)),.16);pan=float(rng.uniform(-1,1));left+=c*(1-pan*.7);right+=c*(1+pan*.7)
build=np.clip((t-3)/3.5,0,1)*np.clip((6.6-t)/.12,0,1)
v+=build*(.050*wind+.028*bass+.022*np.sin(2*np.pi*(55*t+8*t*t)))
v+=np.exp(-((t-6.25)/.36)**2)*(.10*wind+.014*air)
# A brief vacuum before the axial beam; soft energy collapse, then sustained force.
hush=np.where((t>=6.60)&(t<6.80),.055,1);v*=hush;left*=hush;right*=hush
v+=impact(6.80,.86,33)
beam=np.clip((t-6.80)/.09,0,1)*np.clip((7.98-t)/.16,0,1)
v+=beam*(.11*bass+.09*wind+.017*air+.095*np.sin(2*np.pi*(37*t+1.3*t*t)))
for at in [6.92,7.10,7.29,7.46]:v+=impact(at,.16,48)
# Whiteout breath and one heavy, luminous four-character title landing.
v*=1-.55*np.exp(-((t-8.05)/.08)**2)
v+=impact(8.22,.42,45)
for hz,gain in [(293.66,.070),(440,.047),(587.33,.035),(1174.66,.023)]:v+=chime(8.23,gain,hz,1.25)
left+=v;right+=v
for delay,gain in [(.041,.19),(.09,.14),(.18,.11),(.31,.07),(.48,.045),(.73,.025)]:
 n=int(sr*delay);left[n:]+=v[:-n]*gain;n=int(sr*delay*1.07);right[n:]+=v[:-n]*gain
stereo=np.column_stack([left,right]);stereo*=np.clip(t/.12,0,1)[:,None]*np.clip((10-t)/.4,0,1)[:,None];stereo*=.88/max(.88,float(np.abs(stereo).max()));wav=source/'astral-judgement-stereo.wav'
with wave.open(str(wav),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((stereo*32767).astype('<i2').tobytes())
audio={'source':'Original procedural stereo sound, no sampled music or voice','sampleRate':sr,'channels':2,'peak':float(np.abs(stereo).max()),'rms':float(np.sqrt(np.mean(stereo**2))),'silentBeat':[6.6,6.8],'beam':6.8,'title':8.22}
if a.audio_only:print(json.dumps(audio));raise SystemExit()
def run(args):subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y',*args],check=True)
assets=[]
for ori in ['landscape','portrait']:
 frames=source/ori/'frames';missing=[f for f in range(1,301) if not(frames/f'frame-{f:04}.png').exists()];assert not missing,(ori,missing[:10])
 movie=out/f'effect-{ori}.mp4';run(['-framerate','30','-start_number','1','-i',str(frames/'frame-%04d.png'),'-i',str(wav),'-vf','hqdn3d=1.1:1.1:2:2','-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','10',str(movie)])
 poster=out/f'effect-{ori}.jpg';Image.open(frames/'frame-0157.png').save(poster,quality=95)
 for file in [movie,poster]:
  assets.append({'file':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()});shutil.copy2(file,delivery/file.name)
 sheet=Image.new('RGB',(1920,900),'#100921');draw=ImageDraw.Draw(sheet)
 for i,f in enumerate([25,67,103,136,169,196,210,219,241,274]):
  im=Image.open(frames/f'frame-{f:04}.png');im.thumbnail((384,415));x=i%5*384+(384-im.width)//2;y=i//5*450+(415-im.height)//2;sheet.paste(im,(x,y));draw.text((i%5*384+12,i//5*450+426),f'{(f-1)/30:.2f}s',fill='#ddd2f5')
 sheet.save(delivery/f'contact-{ori}.jpg',quality=94)
manifest={'version':'1.0.0','cardId':43,'name':'宿星审判 · 百合星裁','durationSeconds':10,'fps':30,'frames':300,'presentationOnly':True,'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'title':{'text':'宿星审判','font':'STZhongsong / 华文中宋','face':'white','outline':'violet','at':8.22,'fontFileDistributed':False},'audio':audio,'timeline':[{'at':0,'event':'White lily falls through violet cosmos'},{'at':1.85,'event':'Celestial golden-violet annuli awaken'},{'at':2.8,'event':'Floral, spiral and depth-lance projectile waves'},{'at':5.7,'event':'Stars collapse into the flower core'},{'at':6.6,'event':'Held breath'},{'at':6.8,'event':'Giant axial beam rushes toward camera'},{'at':7.9,'event':'Whiteout'},{'at':8.22,'event':'White face, violet outline STZhongsong title lands'},{'at':10,'event':'End'}],'provenance':'Original Blender flower meshes, shader nebula, danmaku choreography, beam, cameras and procedural sound. Style based on supplied card. Existing local STZhongsong used for rendered title only; font file not bundled. No player identity or game state.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');shutil.copy2(out/'manifest.json',delivery/'manifest.json');print(json.dumps(manifest,ensure_ascii=False,indent=2))
