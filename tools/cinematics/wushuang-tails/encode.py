"""Original shrine judgment sound and six-second film encoding."""
import argparse,hashlib,json,subprocess,wave
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--output',required=True);p.add_argument('--delivery',required=True);p.add_argument('--ffmpeg',required=True);a=p.parse_args()
source=Path(a.source).resolve();out=Path(a.output).resolve();delivery=Path(a.delivery).resolve();out.mkdir(parents=True,exist_ok=True);delivery.mkdir(parents=True,exist_ok=True)
sr=48000;t=np.arange(sr*6)/sr;rng=np.random.default_rng(31042026)
def noise(lo,hi):
    hz=np.fft.rfftfreq(len(t),1/sr);sp=np.fft.rfft(rng.normal(size=len(t)));sp*=np.minimum(1,hz/max(1,lo))**3/(1+(hz/hi)**8)
    y=np.fft.irfft(sp,n=len(t));return y/max(.001,y.std())
bass=noise(22,145);wind=noise(130,1500);air=noise(2000,11000)
def gong(at,gain,hz,decay):
    u=np.maximum(0,t-at);partials=sum(np.sin(2*np.pi*hz*r*u+np.sin(u*5+i)*.04)*np.exp(-u*(1+i*.26)/decay)/(1+i*.8) for i,r in enumerate([1,1.43,1.97,2.62,4.14,5.49]))
    return (t>=at)*gain*(partials*.31+air*.09*np.exp(-u*90))
def slam(at,gain,hz):
    u=np.maximum(0,t-at);return (t>=at)*gain*(np.sin(2*np.pi*(hz*u+3*(1-np.exp(-u*25))))*.67*np.exp(-u*4)+bass*.20*np.exp(-u*2.1)+wind*.28*np.exp(-u*17)+air*.14*np.exp(-u*65))
value=(bass*.028+wind*.008)*np.clip(t/.07,0,1)
value+=gong(.20,.095,82.41,2.2)+slam(.92,.30,40)
open_gate=np.clip((t-.85)/.3,0,1)*np.clip((2.65-t)/.6,0,1)
value+=open_gate*(wind*.048+np.sin(2*np.pi*(61*t+3*np.sin(t*4)))*.033)
value+=gong(1.75,.08,164.81,1.3)+gong(2.27,.10,329.63,1.3)
# Sustained electrical pressure, rising in pitch as heaven gathers around the blade.
charge=np.clip((t-2.0)/2.2,0,1)*(t<4.46)
value+=charge*(wind*.035+air*.017+np.sin(2*np.pi*(110*t+10*t*t))*.024)
for i in range(22):
    at=2.3+i*.085;u=np.maximum(0,t-at)
    value+=(t>=at)*np.exp(-u*70)*air*.042*(.4+i/30)
value+=gong(3.78,.065,73.415,1.0)
# Short vacuum before the physical sword impact and rolling thunder tail.
value*=1-.94*np.clip((t-4.33)/.17,0,1)*(t<4.62)
value+=slam(4.63,1,28)+slam(4.76,.25,53)+gong(4.64,.13,55,1.9)
u=np.maximum(0,t-4.65)
value+=(t>=4.65)*(bass*.15+wind*.041)*np.exp(-u*1.6)
value+=gong(4.83,.045,1234,.3)+gong(4.89,.045,1744,.25)
value+=np.exp(-((t-5.48)/.25)**2)*(wind*.13+air*.022)
left=value.copy();right=value.copy()
for delay,gain in [(.033,.18),(.082,.14),(.163,.10),(.282,.07),(.438,.045),(.677,.029)]:
    n=int(sr*delay);left[n:]+=value[:-n]*gain;n=int(sr*delay*1.13);right[n:]+=value[:-n]*gain
stereo=np.column_stack([left,right]);stereo*=np.clip(t/.02,0,1)[:,None]*np.clip((6-t)/.17,0,1)[:,None];stereo*=.88/max(.88,float(np.abs(stereo).max()))
wav=source/'sound-tails-effect.wav'
with wave.open(str(wav),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())
audio={'source':'Original procedural stereo sound','sampleRate':sr,'channels':2,'peak':float(np.abs(stereo).max()),'rms':float(np.sqrt(np.mean(stereo**2)))}
def run(args):subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y',*args],check=True)
codec=['-c:v','libx264','-preset','slow','-crf','18','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart']
assets=[];showcases=[]
for ori in ['landscape','portrait']:
    frames=source/ori/'frames';missing=[i for i in range(1,181) if not (frames/f'frame-{i:04d}.png').is_file()];assert not missing,(ori,missing[:8])
    movie=out/f'effect-{ori}.mp4';run(['-framerate','30','-start_number','1','-i',str(frames/'frame-%04d.png'),'-i',str(wav),*codec,'-t','6',str(movie)])
    poster=out/f'effect-{ori}.jpg';Image.open(frames/'frame-0105.png').save(poster,quality=95)
    for item in [movie,poster]:assets.append({'file':item.name,'bytes':item.stat().st_size,'sha256':hashlib.sha256(item.read_bytes()).hexdigest()})
    coin=out.parent.parent/'wushuang-coin'/'v1'/f'tails-{ori}.mp4';joined=delivery/f'coin-and-effect-{ori}.mp4'
    filters='[0:v]trim=duration=13,setpts=PTS-STARTPTS[v0];[0:a]atrim=duration=13,asetpts=PTS-STARTPTS[a0];[1:v]setpts=PTS-STARTPTS[v1];[1:a]asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'
    run(['-i',str(coin),'-i',str(movie),'-filter_complex',filters,'-map','[v]','-map','[a]',*codec,'-r','30','-fps_mode','cfr','-video_track_timescale','15360','-t','19',str(joined)])
    showcases.append({'file':joined.name,'durationSeconds':19,'bytes':joined.stat().st_size,'sha256':hashlib.sha256(joined.read_bytes()).hexdigest()})
    sheet=Image.new('RGB',(1600,900),'#080e18')
    for i,f in enumerate([1,40,70,105,125,140,155,173]):
        im=Image.open(frames/f'frame-{f:04d}.png').convert('RGB');im.thumbnail((400,420));sheet.paste(im,((i%4)*400+(400-im.width)//2,(i//4)*450+(420-im.height)//2));ImageDraw.Draw(sheet).text(((i%4)*400+12,(i//4)*450+429),f'{(f-1)/30:.2f}s',fill='#d0e6ff')
    sheet.save(delivery/f'contact-{ori}.jpg',quality=93)
manifest={'version':'1.0.0','name':'麻将无双 · 反面 · 神罚裁决','durationSeconds':6,'fps':30,'frames':180,'handoffSeconds':5.3,'cinematicStart':'Immediately after wushuang-coin/v1/tails with matching camera','outcome':'tails','presentationOnly':True,'orientations':{'landscape':[1600,1000],'portrait':[1000,1600]},'audio':audio,'timeline':[{'at':0,'event':'Continue settled tails coin'},{'at':.8,'event':'Monumental shrine gate rises'},{'at':1.8,'event':'Sealed gate opens'},{'at':2.3,'event':'Tsurugi and thunder charge'},{'at':4.33,'event':'Brief suspension'},{'at':4.63,'event':'Sword impact and ground shockwave'},{'at':5.3,'event':'Optional target nameplate handoff'},{'at':6,'event':'Restore live table'}],'provenance':'Original procedural Blender geometry, materials, camera, animation and synthesized audio, using the existing shrine and project font. No scoring or player identity in the movie.','assets':assets}
(out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');(delivery/'showcases.json').write_text(json.dumps(showcases,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps({'audio':audio,'assets':assets,'showcases':showcases},ensure_ascii=False,indent=2))
