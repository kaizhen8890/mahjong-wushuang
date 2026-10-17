"""Decode complete deliverables and record the actual verification scope."""
import argparse,json,re,subprocess,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--assets',required=True);p.add_argument('--delivery',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--report',required=True);p.add_argument('--outcome',default='heads');a=p.parse_args()
source=Path(a.source).resolve();assets=Path(a.assets).resolve();delivery=Path(a.delivery).resolve()
records=[];joins=[];render_checks=[]
for orientation in ['landscape','portrait']:
    logs=Path(a.report).resolve().parent;original_log=logs/f'render-{orientation}.log'
    if original_log.exists():
        frame=None;affected=set()
        for line in original_log.read_text(encoding='utf-8',errors='replace').splitlines():
            m=re.search(r'Fra:(\d+)',line)
            if m:frame=int(m[1])
            if 'Shadow buffer full' in line and frame is not None:affected.add(frame)
        if affected:
            repair=json.loads((source/orientation/'shadow-repair.json').read_text(encoding='utf-8'))
            assert affected.issubset(set(repair['frames'])),(orientation,'Unrepaired shadow frames')
            repaired_log=(logs/f'repair-{orientation}.log').read_text(encoding='utf-8',errors='replace')
            assert 'Shadow buffer full' not in repaired_log and 'Traceback' not in repaired_log,orientation
            render_checks.append({'orientation':orientation,'shadowPoolMB':repair['shadowPoolMB'],'repairedFrames':len(repair['frames']),'unresolvedWarnings':0})
        else:render_checks.append({'orientation':orientation,'unresolvedWarnings':0})
    for filename,folder,expected in [(f'effect-{orientation}.mp4',assets,180),(f'coin-and-effect-{orientation}.mp4',delivery,570)]:
        file=folder/filename
        info=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(file)],capture_output=True,text=True).stderr
        r=subprocess.run([a.ffmpeg,'-hide_banner','-v','error','-nostats','-progress','pipe:1','-i',str(file),'-f','null','NUL'],capture_output=True,text=True)
        frames=int(re.findall(r'frame=(\d+)',r.stdout)[-1]);assert frames==expected,(file,frames)
        assert r.returncode==0 and not r.stderr.strip(),(file,r.stderr)
        resolution='1000x1600' if orientation=='portrait' else '1600x1000'
        assert resolution in info and '30 fps' in info and '48000 Hz, stereo' in info,info
        records.append({'file':str(file),'framesDecoded':frames,'resolution':resolution,'fps':30,'audio':'AAC, 48000 Hz, stereo','errors':r.stderr,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
    previous=source.parent/'wushuang-coin-v1'/f'{orientation}-{a.outcome}'/'frames'/'frame-0390.png'
    current=source/orientation/'frames'/'frame-0001.png'
    pimg=np.asarray(Image.open(previous).convert('RGB'),dtype=np.float32);cimg=np.asarray(Image.open(current).convert('RGB'),dtype=np.float32)
    joins.append({'orientation':orientation,'meanPixelDifferenceAtCoinJoin':float(np.mean(np.abs(pimg-cimg))),'description':'Same final coin camera and frozen scene; rendering sample noise can differ.'})
report={'media':records,'coinJoins':joins,'renderChecks':render_checks,'scope':'Complete desktop FFmpeg decode. Browser inspection is recorded separately. Android/WebView and actual LAN integration NOT tested.'}
Path(a.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(report,ensure_ascii=False,indent=2))
