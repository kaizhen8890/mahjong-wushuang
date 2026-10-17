"""Encode original frame sequences and synchronized procedural sound design.
Python + numpy + Pillow; pass a local FFmpeg binary, source dir and public dir.
"""
import argparse, pathlib, subprocess, wave, json, hashlib
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--source',required=True);p.add_argument('--public',required=True);p.add_argument('--shatter',required=True);a=p.parse_args()
source=pathlib.Path(a.source).resolve();out=pathlib.Path(a.public).resolve();out.mkdir(parents=True,exist_ok=True)
sr=48000;duration=5.2;t=np.arange(round(sr*duration))/sr;rng=np.random.default_rng(9102026)
def filtered_noise(low,high):
    raw=rng.normal(size=len(t));freq=np.fft.rfftfreq(len(t),1/sr)
    spec=np.fft.rfft(raw);mask=np.minimum(1,freq/max(low,1))**4/(1+(freq/high)**6)
    sound=np.fft.irfft(spec*mask,n=len(t));return sound/max(np.std(sound),.001)
air=filtered_noise(140,1600);dust=filtered_noise(800,7500);rumble=filtered_noise(30,155)
env=np.minimum(t/.3,1)*np.minimum((duration-t)/.65,1)
sound=.025*rumble*env+.012*(np.sin(2*np.pi*55*t)+.5*np.sin(2*np.pi*110*t))*env
def add_hit(at,weight,pitch=165,decay=.2):
    global sound
    u=np.maximum(0,t-at);gate=(t>=at)
    ring=sum(np.sin(2*np.pi*pitch*ratio*u)*np.exp(-u/(decay/(1+i*.15)))/(1+i) for i,ratio in enumerate([1,1.61,2.37,3.13,4.73]))
    sound+=weight*gate*(ring*.32+dust*np.exp(-u/.017)*.15)
for at,w,pitch in [(.12,.12,235),(.55,.07,410),(1.35,.10,183),(2.4,.11,290),(2.72,.13,360),(2.89,.17,470)]:add_hit(at,w,pitch,.45)
# Suspense airflow rises into the exact frame-94 contact (3.10 seconds).
build=np.clip((t-1.85)/1.25,0,1)**2*(t<3.1)
sound+=air*.09*build+np.sin(2*np.pi*(95*t+33*t*t))*.025*build
u=np.maximum(0,t-3.1);impact=(t>=3.1)
sound+=impact*(.3*np.sin(2*np.pi*(43*u+1.8*(1-np.exp(-u*35))))*np.exp(-u*4)+.10*air*np.exp(-u*8)+.06*rumble*np.exp(-u*2))
for i in range(17):add_hit(3.12+i*.037,float(.095*np.exp(-i*.16)),float(rng.uniform(180,1200)),.20)
# User-provided card fracture sound is mixed once, on contact, never looped.
raw=subprocess.check_output([a.ffmpeg,'-v','error','-i',a.shatter,'-f','f32le','-ar',str(sr),'-ac','1','pipe:1'])
fracture=np.frombuffer(raw,dtype='<f4');start=round(3.1*sr);n=min(len(fracture),len(sound)-start)
sound[start:start+n]+=fracture[:n]*.17
sound*=np.clip((duration-t)/.45,0,1)
left=sound.copy();right=sound.copy()
delay=round(sr*.043);reflection=np.pad(sound[:-delay],(delay,0))*.16
left+=reflection;right+=np.pad(sound[:-delay*2],(delay*2,0))*.14
stereo=np.column_stack([left,right]);stereo*=.83/max(.83,float(np.max(np.abs(stereo))))
wav=source/'tribunal-sound.wav'
with wave.open(str(wav),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((stereo*32767).astype('<i2').tobytes())
def run(cmd):subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y',*cmd],check=True)
files=[]
for orientation in ['landscape','portrait']:
    folder=source/orientation
    if len(list((folder/'frames').glob('frame-*.png')))!=156:raise RuntimeError(f'Incomplete render: {folder}')
    full=out/f'intro-{orientation}.mp4'
    run(['-framerate','30','-start_number','1','-i',str(folder/'frames/frame-%04d.png'),'-i',str(wav),'-c:v','libx264','-preset','slow','-crf','19','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','5.2',str(full)])
    short=out/f'judgement-{orientation}.mp4'
    run(['-ss',str(74/30),'-i',str(full),'-t','2.1','-c:v','libx264','-preset','slow','-crf','19','-pix_fmt','yuv420p','-af','afade=t=in:d=0.08,afade=t=out:st=1.8:d=0.3','-c:a','aac','-b:a','192k','-movflags','+faststart',str(short)])
    poster=out/f'poster-{orientation}.jpg';Image.open(folder/'frames/frame-0065.png').save(poster,quality=92)
    for path in [full,short,poster]:files.append({'file':path.name,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'version':1,'appVersion':'1.1.0-beta.1','fps':30,'introSeconds':5.2,'judgementSeconds':2.1,'introImpactSeconds':3.1,'judgementImpactSeconds':3.1-74/30,'assets':files},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(out),'assets':files},ensure_ascii=False,indent=2))
