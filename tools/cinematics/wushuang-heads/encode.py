"""Encode the original six-second heads film plus delivery-only joined showcases."""
import argparse, hashlib, json, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

p=argparse.ArgumentParser()
p.add_argument('--source',required=True);p.add_argument('--output',required=True)
p.add_argument('--delivery',required=True);p.add_argument('--ffmpeg',required=True)
p.add_argument('--audio-only',action='store_true');a=p.parse_args()
source=Path(a.source).resolve();out=Path(a.output).resolve();delivery=Path(a.delivery).resolve()
out.mkdir(parents=True,exist_ok=True);delivery.mkdir(parents=True,exist_ok=True)
sr=48000;duration=6;t=np.arange(sr*duration)/sr;rng=np.random.default_rng(31032026)

def noise(lo,hi):
    hz=np.fft.rfftfreq(len(t),1/sr);sp=np.fft.rfft(rng.normal(size=len(t)))
    sp*=np.minimum(1,hz/max(1,lo))**3/(1+(hz/hi)**8)
    y=np.fft.irfft(sp,n=len(t));return y/max(.001,y.std())

bass=noise(24,130);wind=noise(160,1600);air=noise(1800,8500)
def impact(at,gain,depth):
    u=np.maximum(0,t-at)
    return (t>=at)*gain*(np.sin(2*np.pi*(depth*u+3*(1-np.exp(-u*22))))*.6*np.exp(-u*4)+bass*.18*np.exp(-u*3)+wind*.19*np.exp(-u*13)+air*.06*np.exp(-u*70))

def chime(at,gain,hz,decay=.3):
    u=np.maximum(0,t-at)
    sound=sum(np.sin(2*np.pi*hz*r*u)*np.exp(-u*(1+i*.8)/decay)/(1+i*.8) for i,r in enumerate([1,1.57,2.39,3.98]))
    return (t>=at)*gain*(sound*.38+air*.15*np.exp(-u/.007))

# A sustained, changing sound bed; no repeated sample or silent loop boundary.
grow=np.clip((t-.18)/2.4,0,1);fade=np.clip((5.1-t)/.7,0,1)
value=(.022*bass+.008*wind)*np.clip(t/.12,0,1)
value+=(np.sin(2*np.pi*36.7*t)*.024+np.sin(2*np.pi*55*t)*.011)*grow*fade
value+=chime(.16,.045,146.83,2.0)+impact(.66,.26,48)
flight=np.clip((t-.60)/.4,0,1)*np.clip((4.18-t)/.25,0,1)
swish=.4+.6*(.5+.5*np.sin(t*9+t*t*3))**4
value+=flight*grow*(wind*.09*swish+air*.012)
# Glazed ceramic voices cross the listener while the tiles assemble.
left=np.zeros_like(t);right=np.zeros_like(t)
for i in range(76):
    at=float(rng.uniform(.74,3.9));hz=float(rng.uniform(1150,3100));pan=float(rng.uniform(-.75,.75))
    tick=chime(at,float(rng.uniform(.01,.026)),hz,float(rng.uniform(.035,.12)))
    left+=tick*(1-pan);right+=tick*(1+pan)
value+=impact(2.73,.34,44)
for i,hz in enumerate([146.83,220,293.66,440,587.33]):
    u=np.maximum(0,t-2.77-i*.065)
    value+=(t>=2.77+i*.065)*.022*np.sin(2*np.pi*hz*u)*(1-np.exp(-u*11))*np.exp(-u*.95)
# Audible inhale and falling pitch as the array contracts, then a brief held breath.
u=np.clip((t-4.04)/.74,0,1);inhale=(t>=4.04)*(t<4.78)
value+=inhale*(wind*.14*u**1.4+air*.024*u**2+.026*np.sin(2*np.pi*(320*t-24*t*t)))
value*=1-.88*np.clip((t-4.70)/.08,0,1)*(t<4.82)
value+=impact(4.84,.94,31)+chime(4.85,.09,73.415,1.5)
for i in range(26):value+=chime(4.86+i*.011,.022*np.exp(-i*.05),float(rng.uniform(950,3600)),.22)
launch=np.exp(-((t-5.48)/.19)**2)
value+=launch*(wind*.18+air*.032)+impact(5.67,.27,57)
left+=value;right+=value
for delay,gain in [(.038,.17),(.081,.13),(.146,.09),(.251,.065),(.403,.039),(.637,.024)]:
    n=int(sr*delay);left[n:]+=value[:-n]*gain
    n=int(sr*delay*1.13);right[n:]+=value[:-n]*gain
stereo=np.column_stack([left,right]);stereo*=np.clip(t/.02,0,1)[:,None]*np.clip((6-t)/.14,0,1)[:,None]
stereo*=.88/max(.88,float(np.abs(stereo).max()))
wav=source/'sound-heads-effect.wav'
with wave.open(str(wav),'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())
audio={'source':'Original procedural stereo sound','sampleRate':sr,'channels':2,'peak':float(np.abs(stereo).max()),'rms':float(np.sqrt(np.mean(stereo**2)))}
if a.audio_only:print(json.dumps(audio));raise SystemExit(0)

def run(args):subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y',*args],check=True)
codec=['-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart']
assets=[];showcases=[]
for ori in ['landscape','portrait']:
    frames=source/ori/'frames';missing=[i for i in range(1,181) if not (frames/f'frame-{i:04d}.png').is_file()]
    if missing:raise RuntimeError(f'{ori} frames missing: {missing[:8]}')
    movie=out/f'effect-{ori}.mp4'
    run(['-framerate','30','-start_number','1','-i',str(frames/'frame-%04d.png'),'-i',str(wav),*codec,'-t','6',str(movie)])
    poster=out/f'effect-{ori}.jpg';Image.open(frames/'frame-0103.png').save(poster,quality=95)
    for item in [movie,poster]:assets.append({'file':item.name,'bytes':item.stat().st_size,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()})
    # These 19-second review copies live outside public/ so they cannot bloat an APK.
    # out is public/cinematics/wushuang-heads/v1.
    coin=out.parent.parent/'wushuang-coin'/'v1'/f'heads-{ori}.mp4'
    joined=delivery/f'coin-and-effect-{ori}.mp4'
    filters='[0:v]trim=duration=13,setpts=PTS-STARTPTS[v0];[0:a]atrim=duration=13,asetpts=PTS-STARTPTS[a0];[1:v]setpts=PTS-STARTPTS[v1];[1:a]asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'
    run(['-i',str(coin),'-i',str(movie),'-filter_complex',filters,'-map','[v]','-map','[a]',*codec,'-r','30','-fps_mode','cfr','-video_track_timescale','15360','-t','19',str(joined)])
    showcases.append({'file':joined.name,'durationSeconds':19,'bytes':joined.stat().st_size,'sha256':hashlib.sha256(joined.read_bytes()).hexdigest()})
    sheet=Image.new('RGB',(1600,900),'#0b0d12')
    for i,f in enumerate([1,32,69,103,128,148,162,174]):
        im=Image.open(frames/f'frame-{f:04d}.png').convert('RGB');im.thumbnail((400,420))
        x=(i%4)*400+(400-im.width)//2;y=(i//4)*450+(420-im.height)//2;sheet.paste(im,(x,y))
        ImageDraw.Draw(sheet).text(((i%4)*400+12,(i//4)*450+429),f'{(f-1)/30:.2f}s',fill='#ead2a4')
    sheet.save(delivery/f'contact-{ori}.jpg',quality=93)
manifest={'version':'1.0.0','name':'麻将无双 · 正面 · 万牌归一','durationSeconds':6,'fps':30,'frames':180,'handoffSeconds':5.3,'cinematicStart':'Immediately after wushuang-coin/v1/heads, with matching final camera','outcome':'heads','presentationOnly':True,'tileCount':420,'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'audio':audio,'timeline':[{'at':0,'event':'Continue settled heads coin'},{'at':.65,'event':'Four streams of symbolic tile backs rise'},{'at':2.73,'event':'Gold Wushuang seal manifests'},{'at':4.04,'event':'Array collapses'},{'at':4.84,'event':'Gold core shockwave'},{'at':5.3,'event':'Optional live UI foreground handoff'},{'at':6,'event':'Film ends; restore live table'}],'provenance':'Original Blender geometry, shading, animation, camera and synthesized sound; existing project shrine and project font reused. No player hand information in the film.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(delivery/'showcases.json').write_text(json.dumps(showcases,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'audio':audio,'assets':assets,'showcases':showcases},ensure_ascii=False,indent=2))
