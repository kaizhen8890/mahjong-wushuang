"""Deterministic 48 kHz stereo synthesis. Absolute silence after 4.7 s.
No downloaded samples or music. Requires numpy only.
"""
from pathlib import Path
import argparse,json,wave
import numpy as np
p=argparse.ArgumentParser();p.add_argument('--out',required=True);a=p.parse_args();out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
# AAC transforms smear a hard boundary into the next block. Reserve 40 ms so
# the decoded delivery MP4, not only this PCM master, is silent by 4.7 seconds.
SR=48000;N=307200;SILENCE=4.7;GUARD=.04;CUT=int((SILENCE-GUARD)*SR);t=np.arange(N)/SR;rng=np.random.default_rng(10042026)
def band(lo,hi):
 spec=np.fft.rfft(rng.normal(size=N));freq=np.fft.rfftfreq(N,1/SR);weight=(1/(1+(lo/np.maximum(freq,1))**8))*(1/(1+(freq/hi)**8));signal=np.fft.irfft(spec*weight,n=N);return signal/(np.std(signal)+1e-9)
def env(start,end,attack=.10,release=.10):return np.clip((t-start)/attack,0,1)*np.clip((end-t)/release,0,1)
dry=.024*band(35,170)*env(0,4.72,.3,.03)
dry+=(np.sin(2*np.pi*52*t)*.013+np.sin(2*np.pi*104.2*t)*.011)*env(.2,4.72,.5,.02)
motion=env(.40,4.70,.45,.04)*(1+.29*np.sin(t*27)+.18*np.sin(t*55))
dry+=(band(130,1700)*.033+band(1800,5200)*.010)*motion
for start,strength in [(.56,.020),(1.31,.033),(2.14,.030),(3.33,.024)]:
 q=np.maximum(0,t-start);e=(t>=start)*(1-np.exp(-q*210))*np.exp(-q*7)
 for frequency,gain in [(179,1),(387,.40),(793,.15)]:dry+=strength*gain*np.sin(2*np.pi*(frequency*q-12*q*q))*e
for index,start in enumerate([2.05,2.43,2.83]):
 q=np.maximum(0,t-start);e=(t>=start)*(1-np.exp(-q*28))*np.exp(-q*3.3)
 dry+=(band(90,700)*.037+np.sin(2*np.pi*(210*q-62*q*q))*.025)*e
for start,strength in [(3.91,.030),(4.18,.021),(4.38,.037),(4.60,.055)]:
 q=np.maximum(0,t-start);e=(t>=start)*(1-np.exp(-q*1500))*np.exp(-q*55)
 dry+=band(1700,10500)*strength*e
# Final weight lands immediately before the quiet boundary, with no post-cut tail.
q=np.maximum(0,t-4.60);e=(t>=4.60)*(1-np.exp(-q*450))*np.exp(-q*19)
dry+=(np.sin(2*np.pi*(92*q-39*q*q))*.17+band(70,1200)*.065)*e
stereo=np.zeros((N,2))
for ch in range(2):
 signal=dry.copy()
 for delay,gain in [(int(SR*(.039+.009*ch)),.23),(int(SR*(.091-.013*ch)),.12),(int(SR*.163),.065)]:signal[delay:]+=dry[:-delay]*gain
 stereo[:,ch]=signal
stereo[CUT-144:CUT]*=(.5+.5*np.cos(np.linspace(0,np.pi,144)))[:,None];stereo[CUT:]=0
stereo*=.71/np.max(np.abs(stereo));pcm=(stereo*8388607).round().astype(np.int32);raw=np.empty((N,2,3),dtype=np.uint8)
for shift in range(3):raw[:,:,shift]=((pcm>>(shift*8))&255).astype(np.uint8)
with wave.open(str(out/'intro-sound.wav'),'wb') as w:w.setnchannels(2);w.setsampwidth(3);w.setframerate(SR);w.writeframes(raw.tobytes())
report={'sampleRate':SR,'channels':2,'samples':N,'durationSeconds':6.4,'silenceSeconds':SILENCE,'pcmCutSeconds':CUT/SR,'aacGuardMs':GUARD*1000,'nonzeroAfterSilence':int(np.count_nonzero(pcm[int(SILENCE*SR):])),'peakDbfs':float(20*np.log10(np.max(np.abs(stereo))))}
(out/'audio-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
