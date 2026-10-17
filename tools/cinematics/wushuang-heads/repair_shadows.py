"""Re-render only frames that exhausted the old 512 MB EEVEE shadow pool."""
import argparse,json,re,sys
from pathlib import Path
import bpy
p=argparse.ArgumentParser();p.add_argument('--log',required=True);p.add_argument('--out',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
folder=Path(a.out).resolve();log=Path(a.log).read_text(encoding='utf-8',errors='replace');frame=None;bad=set()
for line in log.splitlines():
    match=re.search(r'Fra:(\d+)',line)
    if match:frame=int(match[1])
    if 'Shadow buffer full' in line and frame is not None:bad.add(frame)
for i in range(1,181):
    if not (folder/'frames'/f'frame-{i:04d}.png').is_file():bad.add(i)
s=bpy.context.scene;s.eevee.shadow_pool_size='1024';s.render.resolution_percentage=100;s.eevee.taa_render_samples=40
# Keep all existing camera and object animation. No scene rebuild or game changes.
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print('FRAMES_TO_REPAIR',json.dumps(sorted(bad)),flush=True)
for f in sorted(bad):
    s.frame_set(f);s.render.filepath=str(folder/'frames'/f'frame-{f:04d}.png');bpy.ops.render.render(write_still=True)
(folder/'shadow-repair.json').write_text(json.dumps({'shadowPoolMB':1024,'frames':sorted(bad)},indent=2),encoding='utf-8')
