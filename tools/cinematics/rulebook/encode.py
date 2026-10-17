"""Package offline renders, original synchronized Foley and page tracking data."""
import argparse, pathlib, subprocess, wave, json, hashlib, shutil
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--source',required=True);p.add_argument('--public',required=True);a=p.parse_args()
source=pathlib.Path(a.source).resolve();out=pathlib.Path(a.public).resolve();out.mkdir(parents=True,exist_ok=True)
sr=48000;duration=5.6;t=np.arange(round(sr*duration))/sr;rng=np.random.default_rng(13102026)
def noise(low,high):
    freq=np.fft.rfftfreq(len(t),1/sr);spec=np.fft.rfft(rng.normal(size=len(t)));mask=np.minimum(1,freq/max(low,1))**4/(1+(freq/high)**6)
    value=np.fft.irfft(spec*mask,n=len(t));return value/max(np.std(value),.001)
air=noise(180,1600);paper=noise(1600,9000);rumble=noise(28,160)
envelope=np.clip(t/.25,0,1)*np.clip((duration-t)/.7,0,1)
sound=(.018*rumble+.009*np.sin(2*np.pi*48*t))*envelope
# Each turning leaf brushes the next: dry rustle, soft fore-edge contact.
for i in range(9):
    at=(10+i*5+10-1)/30;u=t-at;gust=np.exp(-(u/.13)**2)
    sound+=paper*.038*gust+air*.016*gust
    v=np.maximum(0,u-.12);sound+=(u>.12)*.022*paper*np.exp(-v/.021)
# A creeping wet scrape gathers into the raised bronze seal.
build=np.clip((t-1.6)/1.4,0,1)**2*(t<95/30)
sound+=air*.035*build+np.sin(2*np.pi*(82*t+8*t*t))*.018*build
at=95/30;u=np.maximum(0,t-at);gate=t>=at
sound+=gate*(.36*np.sin(2*np.pi*(46*u+1.4*(1-np.exp(-u*30))))*np.exp(-u*7)+.13*air*np.exp(-u*18)+.065*paper*np.exp(-u*40)+.04*rumble*np.exp(-u*3))
# Damped, inharmonic brass resonance rather than a sustained musical note.
for i,ratio in enumerate([1,1.43,2.37,3.81]):sound+=gate*.046/(i+1)*np.sin(2*np.pi*176*ratio*u)*np.exp(-u/(.42-i*.07))
for i in range(12):
    at=3.24+i*.045;u=np.maximum(0,t-at)
    sound+=(t>=at)*paper*.018*np.exp(-u/.018)*np.exp(-i*.15)
sound+=air*.025*np.exp(-((t-3.92)/.20)**2)
sound*=np.clip((duration-t)/.55,0,1)
delay=round(sr*.047);left=sound+np.pad(sound[:-delay],(delay,0))*.12;right=sound+np.pad(sound[:-delay*2],(delay*2,0))*.15
stereo=np.column_stack([left,right]);stereo*=.83/max(.83,float(np.max(np.abs(stereo))))
wav=source/'forbidden-codex-sound.wav'
with wave.open(str(wav),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((stereo*32767).astype('<i2').tobytes())
files=[]
for orientation in ['landscape','portrait']:
    folder=source/orientation
    if len(list((folder/'frames').glob('frame-*.png')))!=168:raise RuntimeError(f'Incomplete render: {folder}')
    movie=out/f'intro-{orientation}.mp4'
    subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(folder/'frames/frame-%04d.png'),'-i',str(wav),'-c:v','libx264','-preset','slow','-crf','19','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','5.6',str(movie)],check=True)
    poster=out/f'poster-{orientation}.jpg';Image.open(folder/'frames/frame-0130.png').save(poster,quality=92)
    anchor=out/f'anchors-{orientation}.json';shutil.copyfile(folder/'text-anchors.json',anchor)
    for file in [movie,poster,anchor]:files.append({'file':file.name,'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'version':1,'appVersion':'1.1.0-beta.2','fps':30,'durationSeconds':5.6,'impactSeconds':95/30,'textRevealSeconds':3.75,'returnSeconds':5.05,'assets':files},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(out),'assets':files},ensure_ascii=False,indent=2))
