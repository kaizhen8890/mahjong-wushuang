"""Author synchronized original stereo sound and encode all four shrine films.
Requires NumPy, Pillow and FFmpeg. No game state, scoring or RNG is touched.
"""
import argparse, hashlib, json, os, subprocess, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from motion import phase as coin_phase

p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--ffmpeg',required=True)
p.add_argument('--audio-only',action='store_true');p.add_argument('--orientation',choices=['both','landscape','portrait'],default='both');a=p.parse_args()
source=Path(a.source).resolve();out=Path(a.output).resolve();out.mkdir(parents=True,exist_ok=True)
sr=48000;duration=13.;t=np.arange(int(sr*duration))/sr
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
# Continuous airborne wind, modulated at the authored flip phase, not a repeated loop.
u=np.clip((t-3)/6.5,0,1);phase=np.fromiter((coin_phase(float(x)) for x in t),dtype=float,count=len(t))
flight=(t>=3)*(t<9.43)*np.minimum(1,(t-3)*5)*np.minimum(1,(9.43-t)*9)
swish=(.3+.7*np.abs(np.cos(2*np.pi*phase))**10)
bed+=flight*(wind*(.037+.032*u)*swish+air*.009*swish)
bed+=flight*.025*np.sin(2*np.pi*(92*t+8*np.sin(t*.7)))*(1-u*.30)
for j,at in enumerate([3.35,3.96,4.72,5.60,6.52,7.43,8.14,8.70,9.14]):
    bed+=metal(at,.024 if j<6 else .032,410+j*27,.60)
# Brief held breath before contact. Sound stays on the same clock as the video.
bed*=1-.92*np.clip((t-9.30)/.13,0,1)*(t<9.51)
bed+=impact(9.52,.86,34)+impact(10.13,.32,74)
for j,at in enumerate([10.31,10.46,10.58,10.68,10.76,10.82]):bed+=metal(at,.065*np.exp(-j*.33),780+j*38,.24)
for j in range(25):bed+=metal(9.55+j*.024,.024*np.exp(-j*.07),float(rng.uniform(900,3400)),.3)
def audio(result):
    value=bed.copy()
    chord=[146.83,220.0,293.66,440.0] if result=='heads' else [164.81,246.94,329.63,493.88]
    for i,hz in enumerate(chord):
        at=10.95+i*.09;v=np.maximum(0,t-at)
        value+=(t>=at)*.046*np.sin(2*np.pi*hz*v)*(1-np.exp(-v*9))*np.exp(-v/2.0)
    value+=metal(10.95,.12,587.33 if result=='heads' else 659.25,1.5)
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
            # Same opening pixels in both results; first branch change occurs after t=9.5.
            for i in range(1,287):
                dest=folder/f'frame-{i:04d}.png';original=source/f'{orientation}-heads'/'frames'/dest.name
                if not dest.exists():os.link(original,dest)
        missing=[i for i in range(1,391) if not (folder/f'frame-{i:04d}.png').is_file()]
        if missing:raise RuntimeError(f'Incomplete {orientation}/{result}: {missing[:12]}')
        movie=out/f'{result}-{orientation}.mp4'
        subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(folder/'frame-%04d.png'),'-i',str(sounds[result][0]),'-vf','scale=out_color_matrix=bt709:out_range=tv,format=yuv420p','-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','13',str(movie)],check=True)
        poster=out/f'{result}-{orientation}.jpg';Image.open(folder/'frame-0370.png').save(poster,quality=94)
        for item in [movie,poster]:assets.append({'file':item.name,'bytes':item.stat().st_size,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()})
        cells=[]
        for f in [35,79,144,199,270,292,333,370]:
            im=Image.open(folder/f'frame-{f:04d}.png').convert('RGB');im.thumbnail((400,400));cell=Image.new('RGB',(400,430),'#0c111b');cell.paste(im,((400-im.width)//2,(400-im.height)//2));ImageDraw.Draw(cell).text((12,410),f'{(f-1)/30:.2f}s | {result}',fill='#ead2a4');cells.append(cell)
        sheet=Image.new('RGB',(1600,860),'#0c111b')
        for i,cell in enumerate(cells):sheet.paste(cell,((i%4)*400,(i//4)*430))
        sheet.save(source/f'contact-{orientation}-{result}.jpg',quality=91)
assets=[{'file':item.name,'bytes':item.stat().st_size,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()} for item in sorted(out.iterdir()) if item.suffix in ['.mp4','.jpg']]
manifest={'version':'2.0.0','name':'麻将无双 · 高速残影决策币','durationSeconds':13,'fps':30,'frames':390,'airborneStartSeconds':3,'airborneEndSeconds':9.5,'continuousAirborneFlipSeconds':6.5,'airborneTurns':52.3,'previousAirborneTurns':6.3,'motionBlurShutter':.7,'afterimageLagsSeconds':[.009,.021,.037],'resultReadableSeconds':11,'revealSeconds':11.25,'sharedOpeningFrames':286,'outcomeMapping':{'0':'tails','1':'heads'},'probability':'No RNG in media; caller supplies already persisted Host result. Presentation only.','audio':{r:m for r,(_,m) in sounds.items()},'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'provenance':'Upgrade of existing procedural Blender coin. Original geometry, coin faces, camera, landing and result retained; faster airborne spin, temporal rim afterimages, shutter motion blur and synchronized synthesized sound. No third-party models or sound samples.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
