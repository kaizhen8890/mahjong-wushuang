"""Author synchronized original stereo sound and encode all four shrine films.
Requires NumPy, Pillow and FFmpeg. No game state, scoring or RNG is touched.
"""
import argparse, hashlib, json, os, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from motion import phase as coin_phase, APEX, G, V0, APEX_Z, TURNS, speed

p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--ffmpeg',required=True)
p.add_argument('--audio-only',action='store_true');p.add_argument('--orientation',choices=['both','landscape','portrait'],default='both');a=p.parse_args()
source=Path(a.source).resolve();out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
sr=48000;duration=10.;t=np.arange(int(sr*duration))/sr
rng=np.random.default_rng(10032026)
def noise(lo,hi):
    freq=np.fft.rfftfreq(len(t),1/sr);spectrum=np.fft.rfft(rng.normal(size=len(t)))
    spectrum*=np.minimum(1,freq/max(1,lo))**3/(1+(freq/hi)**6)
    v=np.fft.irfft(spectrum,n=len(t));return v/max(.001,v.std())
bass=noise(22,140);wind=noise(150,1400);air=noise(2200,10000)
def metal(at,gain,hz,decay=.7):
    u=np.maximum(0,t-at);gate=t>=at
    partials=sum(np.sin(mathratio*2*np.pi*hz*u)*np.exp(-u/(decay/(1+i*.6)))/(1+i*.7) for i,mathratio in enumerate([1,1.51,2.09,2.77,4.21]))
    return gate*gain*(partials*.36+air*.08*np.exp(-u/.009))
def impact(at,gain,depth=46):
    u=np.maximum(0,t-at)
    tone=np.sin(2*np.pi*(depth*u+2.3*(1-np.exp(-u*28))))*np.exp(-u*4.0)
    return (t>=at)*gain*(tone*.78+bass*.20*np.exp(-u*2.7)+wind*.28*np.exp(-u*16)+air*.065*np.exp(-u*60))
bed=(bass*.014+wind*.006)*np.clip(t/.65,0,1)
for hz,gain in [(36.7,.018),(55,.011),(73.4,.006)]:bed+=gain*np.sin(2*np.pi*hz*t)*np.clip(t/1.2,0,1)
bed+=metal(.22,.06,110,2.0)+metal(1.25,.055,146.83,2.2)
bed+=impact(2.95,.53,39)
rise=np.clip((t-1.85)/1.15,0,1)**1.7*(t<3.0)
bed+=rise*(wind*.055+air*.012)
# Spin swishes stop with angular motion. Falling wind follows increasing speed.
phase=np.fromiter((coin_phase(float(x)) for x in t),dtype=float,count=len(t))
spin=(t>=3)*(t<APEX)*np.clip((t-3)/.13,0,1)*np.clip((APEX-t)/.28,0,1)
swish=.3+.7*np.abs(np.cos(2*np.pi*phase))**10
bed+=spin*(wind*.067+air*.009)*swish
fall=np.clip((t-APEX)/(6.5-APEX),0,1)**1.3*(t>=APEX)*(t<6.5)
bed+=fall*(wind*.093+air*.024)
flight=spin+fall
for j,at in enumerate([3.35,3.78,4.22]):bed+=metal(at,.022,410+j*70,.40)
bed+=impact(6.52,.86,34)+impact(7.13,.32,74)
for j,at in enumerate([7.31,7.46,7.58,7.68,7.76,7.82]):bed+=metal(at,.065*np.exp(-j*.33),780+j*38,.24)
for j in range(25):bed+=metal(6.55+j*.024,.024*np.exp(-j*.07),float(rng.uniform(900,3400)),.3)
def audio(result):
    value=bed.copy()
    chord=[146.83,220.0,293.66,440.0] if result=='heads' else [164.81,246.94,329.63,493.88]
    for i,hz in enumerate(chord):
        at=7.95+i*.09;v=np.maximum(0,t-at)
        value+=(t>=at)*.046*np.sin(2*np.pi*hz*v)*(1-np.exp(-v*9))*np.exp(-v/2.0)
    value+=metal(7.95,.12,587.33 if result=='heads' else 659.25,1.5)
    # Asymmetric early reflections and diffuse long reverb, original synthesized audio.
    left=value.copy();right=value.copy()
    for delay,gain in [(.039,.16),(.089,.12),(.153,.09),(.267,.065),(.431,.045),(.677,.027)]:
        n=int(sr*delay);left[n:]+=value[:-n]*gain
        n=int(sr*(delay*1.137));right[n:]+=value[:-n]*gain*.95
    pan=np.sin(t*1.1)*flight*.13
    stereo=np.column_stack([left*(1-pan),right*(1+pan)])
    stereo*=np.clip(t/.04,0,1)[:,None]*np.clip((duration-t)/.65,0,1)[:,None]
    stereo*=.87/max(.87,float(np.abs(stereo).max()))
    path=source/f'sound-{result}.wav'
    with wave.open(str(path),'wb') as f:
        f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())
    return path,{'peak':float(np.abs(stereo).max()),'rms':float(np.sqrt(np.mean(stereo**2)))}
sounds={r:audio(r) for r in ['heads','tails']}
if a.audio_only:print(json.dumps({r:m for r,(_,m) in sounds.items()}));raise SystemExit(0)
assets=[];previews=[]
for orientation in (['landscape','portrait'] if a.orientation=='both' else [a.orientation]):
    for result in ['heads','tails']:
        folder=source/f'{orientation}-{result}'/'frames';folder.mkdir(parents=True,exist_ok=True)
        if result=='tails':
            # Same opening pixels in both results; first branch change occurs after t=6.5.
            for i in range(1,197):
                dest=folder/f'frame-{i:04d}.png';original=source/f'{orientation}-heads'/'frames'/dest.name
                if not dest.exists():os.link(original,dest)
        missing=[i for i in range(1,301) if not (folder/f'frame-{i:04d}.png').is_file()]
        if missing:raise RuntimeError(f'Incomplete {orientation}/{result}: {missing[:12]}')
        movie=out/f'{result}-{orientation}.mp4'
        subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(folder/'frame-%04d.png'),'-i',str(sounds[result][0]),'-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','10',str(movie)],check=True)
        poster=out/f'{result}-{orientation}.jpg';Image.open(folder/'frame-0280.png').save(poster,quality=94)
        for item in [movie,poster]:assets.append({'file':item.name,'bytes':item.stat().st_size,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()})
        cells=[]
        for f in [35,100,143,166,184,196,218,280]:
            im=Image.open(folder/f'frame-{f:04d}.png').convert('RGB');im.thumbnail((400,400));cell=Image.new('RGB',(400,430),'#0c111b');cell.paste(im,((400-im.width)//2,(400-im.height)//2));ImageDraw.Draw(cell).text((12,410),f'{(f-1)/30:.2f}s | {result}',fill='#ead2a4');cells.append(cell)
        sheet=Image.new('RGB',(1600,860),'#0c111b')
        for i,cell in enumerate(cells):sheet.paste(cell,((i%4)*400,(i//4)*430))
        sheet.save(source/f'contact-{orientation}-{result}.jpg',quality=91)
assets=[{'file':item.name,'bytes':item.stat().st_size,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()} for item in sorted(out.iterdir()) if item.suffix in ['.mp4','.jpg']]
manifest={'version':'3.0.0','name':'麻将无双 · 顶点停转与重力下落','durationSeconds':10,'fps':30,'frames':300,'airborneStartSeconds':3,'apexSeconds':APEX,'airborneEndSeconds':6.5,'gravitySceneUnitsPerSecondSquared':G,'launchVerticalSpeed':V0,'apexHeight':APEX_Z,'airborneTurns':TURNS,'peakTurnsPerSecond':speed(3.5),'spinStoppedFromSeconds':APEX,'revealSeconds':8.25,'motionBlurShutter':.6,'afterimageLagsSeconds':[.009,.021,.037],'sharedOpeningFrames':196,'outcomeMapping':{'0':'tails','1':'heads'},'probability':'No RNG in media; caller supplies already persisted Host result. Presentation only.','audio':{r:m for r,(_,m) in sounds.items()},'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'provenance':'Original procedural shrine and coin design. Ballistic flight under constant gravity in scene units; authored angular braking at apex, fixed falling orientation, small impact rebound, synchronized synthesized sound. Apex spin brake is an intentional stylization; not caused by gravity. No third-party models or sound samples.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
