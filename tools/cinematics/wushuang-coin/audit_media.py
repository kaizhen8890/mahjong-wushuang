"""Decode every final movie and verify the delivery against its manifest."""
import argparse,hashlib,json,re,subprocess
from pathlib import Path
from PIL import Image
p=argparse.ArgumentParser();p.add_argument('--assets',required=True);p.add_argument('--frames',required=True);p.add_argument('--ffmpeg',required=True);p.add_argument('--output',required=True);a=p.parse_args()
assets=Path(a.assets).resolve();frames=Path(a.frames).resolve();manifest=json.loads((assets/'manifest.json').read_text(encoding='utf-8'))
reports=[]
for asset in manifest['assets']:
    file=assets/asset['file'];assert file.stat().st_size==asset['bytes'];assert hashlib.sha256(file.read_bytes()).hexdigest()==asset['sha256']
    if file.suffix!='.mp4':continue
    run=subprocess.run([a.ffmpeg,'-hide_banner','-i',str(file),'-f','null','-'],capture_output=True,text=True,encoding='utf-8',errors='replace')
    assert run.returncode==0,run.stderr
    assert 'Duration: 00:00:13.00' in run.stderr
    assert 'h264 (High)' in run.stderr and 'yuv420p' in run.stderr
    assert 'Audio: aac' in run.stderr and '48000 Hz, stereo' in run.stderr
    assert re.search(r'frame=\s*390\b',run.stderr),run.stderr
    assert '30 fps' in run.stderr
    expected='1000x1600' if 'portrait' in file.name else '1600x1000';assert expected in run.stderr
    assert not re.search(r'(Invalid|Error while|corrupt|Invalid NAL)',run.stderr,re.I)
    reports.append({'file':file.name,'decodedFrames':390,'durationSeconds':13,'dimensions':expected,'codec':'H.264 High / yuv420p','audio':'AAC / 48000 Hz / stereo','bytes':file.stat().st_size,'sha256':asset['sha256']})
for shape in ['landscape','portrait']:
    for i in range(1,287):
        name=f'frame-{i:04d}.png';head=frames/f'{shape}-heads/frames'/name;tail=frames/f'{shape}-tails/frames'/name
        assert head.stat().st_size==tail.stat().st_size
        assert hashlib.sha256(head.read_bytes()).digest()==hashlib.sha256(tail.read_bytes()).digest()
    head=Image.open(frames/f'{shape}-heads/frames/frame-0370.png');tail=Image.open(frames/f'{shape}-tails/frames/frame-0370.png')
    assert head.size==tail.size==tuple(manifest['orientations'][shape]);assert head.tobytes()!=tail.tobytes()
output={'passed':True,'movies':reports,'identicalOpeningSourceFramesPerOrientation':286,'distinctFinalFaceImages':True,'scope':'Offline files and desktop decoding; no Android device test'}
Path(a.output).write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');print(json.dumps(output,ensure_ascii=False))
