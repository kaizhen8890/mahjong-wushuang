"""Encode offline frames with original synthesized, synchronized alchemy sound."""
import argparse, hashlib, json, pathlib, shutil, subprocess, wave
import numpy as np
from PIL import Image

p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--source',required=True);p.add_argument('--public',required=True);a=p.parse_args()
source=pathlib.Path(a.source).resolve();out=pathlib.Path(a.public).resolve();out.mkdir(parents=True,exist_ok=True)
sr=48000;duration=6;t=np.arange(sr*duration)/sr;rng=np.random.default_rng(2102026)
def noise(low,high):
    freq=np.fft.rfftfreq(len(t),1/sr);spec=np.fft.rfft(rng.normal(size=len(t)))
    mask=np.minimum(1,freq/max(low,1))**4/(1+(freq/high)**6)
    val=np.fft.irfft(spec*mask,n=len(t));return val/max(np.std(val),.001)
rumble=noise(25,160);air=noise(180,1700);hiss=noise(1800,9500)
sound=(rumble*.015+np.sin(2*np.pi*47*t)*.012)*np.clip(t/.35,0,1)
# Porcelain rings: two distinct, short struck resonances before they merge.
for at in [.30,.69]:
    u=np.maximum(0,t-at);gate=t>=at
    for i,r in enumerate([1,1.52,2.79,4.17]):
        sound+=gate*.027/(i+1)*np.sin(2*np.pi*690*r*u)*np.exp(-u/(.25-i*.04))
    sound+=gate*hiss*.013*np.exp(-u/.018)
# Wet turbulent movement, with small granular bubbles travelling upward.
build=np.clip((t-.5)/2.5,0,1)**1.6*(t<95/30)
sound+=air*.035*build+hiss*.008*build
for i in range(33):
    at=.8+i*.068;u=np.maximum(0,t-at)
    sound+=(t>=at)*.008*np.sin(2*np.pi*(210*u+150*(1-np.exp(-u*20))))*np.exp(-u/.04)
# The frame-96 collision is at 95 / 30 seconds in the encoded video.
at=95/30;u=np.maximum(0,t-at);gate=t>=at
sound+=gate*(.39*np.sin(2*np.pi*(44*u+1.5*(1-np.exp(-u*24))))*np.exp(-u*5.8)+.10*air*np.exp(-u*16)+.050*hiss*np.exp(-u*38)+.045*rumble*np.exp(-u*2.6))
for i,r in enumerate([1,1.41,2.33,3.72]):
    sound+=gate*.054/(i+1)*np.sin(2*np.pi*230*r*u)*np.exp(-u/(.48-i*.07))
# Falling scarlet droplets; a restrained crystalline flourish as the number appears.
for i in range(21):
    at=3.25+i*.048;u=np.maximum(0,t-at)
    sound+=(t>=at)*hiss*.017*np.exp(-u/.023)*np.exp(-i*.08)
for i,hz in enumerate([523.25,783.99,1046.50]):
    u=np.maximum(0,t-(3.70+i*.075));gate=t>=(3.70+i*.075)
    sound+=gate*.018*np.sin(2*np.pi*hz*u)*(1-np.exp(-u*32))*np.exp(-u*2.5)
sound*=np.clip((duration-t)/.7,0,1)
delay=round(sr*.043)
left=sound+np.pad(sound[:-delay],(delay,0))*.12
right=sound+np.pad(sound[:-delay*2],(delay*2,0))*.15
stereo=np.column_stack([left,right]);stereo*=.83/max(.83,float(np.max(np.abs(stereo))))
wav=source/'azorubine-sound.wav'
with wave.open(str(wav),'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((stereo*32767).astype('<i2').tobytes())
assets=[]
for orientation in ['landscape','portrait']:
    folder=source/orientation
    expected=[folder/f'frames/frame-{i:04d}.png' for i in range(1,181)]
    if not all(f.is_file() for f in expected):raise RuntimeError(f'Incomplete render: {folder}')
    movie=out/f'intro-{orientation}.mp4'
    subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(folder/'frames/frame-%04d.png'),'-i',str(wav),'-c:v','libx264','-preset','slow','-crf','19','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t','6',str(movie)],check=True)
    poster=out/f'poster-{orientation}.jpg';Image.open(folder/'frames/frame-0143.png').save(poster,quality=92)
    anchor=out/f'anchors-{orientation}.json';shutil.copyfile(folder/'text-anchors.json',anchor)
    for f in [movie,poster,anchor]:assets.append({'file':f.name,'bytes':f.stat().st_size,'sha256':hashlib.sha256(f.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'version':1,'appVersion':'1.1.0-beta.4','fps':30,'durationSeconds':6,'impactSeconds':95/30,'textRevealSeconds':3.65,'returnSeconds':5.35,'audioPeak':float(np.max(np.abs(stereo))),'assets':assets},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'output':str(out),'assets':assets},ensure_ascii=False,indent=2))
