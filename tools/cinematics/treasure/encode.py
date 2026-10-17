"""Encode the offline coffer film and original synchronized mechanical/gold sound.
Python, NumPy, Pillow and FFmpeg. Nothing is rendered by the Android device.
"""
import argparse, hashlib, json, pathlib, subprocess, wave
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('--source',required=True);p.add_argument('--public',required=True);a=p.parse_args()
source=pathlib.Path(a.source).resolve();out=pathlib.Path(a.public).resolve();out.mkdir(parents=True,exist_ok=True)
sr=48000;duration=6.4;t=np.arange(round(sr*duration))/sr;rng=np.random.default_rng(12102026)
def noise(low,high):
    freq=np.fft.rfftfreq(len(t),1/sr);spectrum=np.fft.rfft(rng.normal(size=len(t)));mask=np.minimum(1,freq/max(low,1))**4/(1+(freq/high)**6)
    values=np.fft.irfft(spectrum*mask,n=len(t));return values/max(np.std(values),.001)
low=noise(25,130);mid=noise(150,1800);high=noise(2100,9500)
sound=(low*.019+np.sin(2*np.pi*43*t)*.014)*np.clip(t/.28,0,1)
def metal(at,gain,hz,decay=.30):
    u=np.maximum(0,t-at);gate=t>=at
    ring=sum(np.sin(2*np.pi*hz*ratio*u)*np.exp(-u/(decay/(1+i*.35)))/(i+1) for i,ratio in enumerate([1,1.59,2.71,4.12]))
    return gate*gain*(ring*.6+high*.20*np.exp(-u/.014))
# Three lock rings catch on their teeth before the retaining chains break.
for i,at in enumerate([.80,1.03,1.24,1.50,1.77,2.03]):sound+=metal(at,.035 if i<3 else .11,130+i*23,.24)
for i in range(22):sound+=metal(.7+i*.061,.013,470+i*12,.045)
creak=np.clip((t-2.14)/.60,0,1)*np.clip((3.27-t)/.22,0,1)
sound+=creak*(mid*.055+np.sin(2*np.pi*(81*t+5*np.sin(t*18)))*.021)
for i in range(13):sound+=metal(2.93+i*.015,.035*np.exp(-i*.05),240+i*79,.22)
# The lid release is aligned with frame 99: 98 / 30 seconds.
impact=98/30;u=np.maximum(0,t-impact);gate=t>=impact
sound+=gate*(.40*np.sin(2*np.pi*(42*u+1.3*(1-np.exp(-u*30))))*np.exp(-u*5.2)+.10*mid*np.exp(-u*12)+.06*low*np.exp(-u*2.1)+.035*high*np.exp(-u*32))
rise=np.clip((t-2.45)/.80,0,1)**1.7*(t<impact)
sound+=rise*(mid*.052+high*.013)
for i in range(39):
    at=3.32+i*.057+rng.uniform(-.012,.012);sound+=metal(at,.035*np.exp(-i*.035),float(rng.uniform(1000,2500)),.28)
# A restrained, resonant treasure chord and long tomb reflection.
for i,hz in enumerate([293.66,440.00,587.33,880.00]):
    at=3.45+i*.065;u=np.maximum(0,t-at)
    sound+=(t>=at)*.023*np.sin(2*np.pi*hz*u)*(1-np.exp(-u*18))*np.exp(-u/1.3)
sound*=np.clip((duration-t)/.70,0,1)
def write_stereo(path,mono):
    delay=round(sr*.041);left=mono+np.pad(mono[:-delay],(delay,0))*.14;right=mono+np.pad(mono[:-delay*2],(delay*2,0))*.17
    stereo=np.column_stack([left,right]);stereo*=.86/max(.86,float(np.max(np.abs(stereo))))
    with wave.open(str(path),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(sr);f.writeframes((stereo*32767).astype('<i2').tobytes())
    return float(np.max(np.abs(stereo)))
wav=source/'treasure-sound.wav';peak=write_stereo(wav,sound)
# Short acknowledgement after the actual Host confirmation; no second opening movie.
confirm=np.zeros_like(t)
for i,hz in enumerate([587.33,880.00,1174.66]):
    at=.04+i*.075;u=np.maximum(0,t-at);confirm+=(t>=at)*.14*np.sin(2*np.pi*hz*u)*np.exp(-u/(.38-i*.025))
confirm+=metal(.03,.10,430,.30);confirm*=np.clip((1.45-t)/.35,0,1)
confirmwav=source/'treasure-confirm.wav';write_stereo(confirmwav,confirm[:round(1.45*sr)])
reveal=out/'reveal.mp3';subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(confirmwav),'-c:a','libmp3lame','-b:a','160k',str(reveal)],check=True)
assets=[]
for orientation in ['landscape','portrait']:
    folder=source/orientation
    frames=[folder/f'frames/frame-{i:04d}.png' for i in range(1,193)]
    if not all(f.is_file() for f in frames):raise RuntimeError(f'Incomplete render: {folder}')
    movie=out/f'intro-{orientation}.mp4'
    subprocess.run([a.ffmpeg,'-hide_banner','-loglevel','error','-y','-framerate','30','-start_number','1','-i',str(folder/'frames/frame-%04d.png'),'-i',str(wav),'-c:v','libx264','-preset','slow','-crf','19','-profile:v','high','-level:v','4.1','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-movflags','+faststart','-t',str(duration),str(movie)],check=True)
    poster=out/f'poster-{orientation}.jpg';Image.open(folder/'frames/frame-0148.png').save(poster,quality=92)
    for asset in [movie,poster]:assets.append({'file':asset.name,'bytes':asset.stat().st_size,'sha256':hashlib.sha256(asset.read_bytes()).hexdigest()})
assets.append({'file':reveal.name,'bytes':reveal.stat().st_size,'sha256':hashlib.sha256(reveal.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'version':1,'appVersion':'1.1.0-beta.6','fps':30,'frames':192,'durationSeconds':duration,'impactSeconds':impact,'returnSeconds':5.8,'audioPeak':peak,'source':'Original procedural Blender geometry, materials, animation and synthesized audio; coins are presentation only','assets':assets},ensure_ascii=False,indent=2)+'\n','utf-8')
print(json.dumps({'output':str(out),'assets':assets},ensure_ascii=False,indent=2))
