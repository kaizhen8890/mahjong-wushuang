import bpy,argparse,sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--start',type=int,default=89);p.add_argument('--end',type=int,default=288);p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=32);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);s=bpy.context.scene;s.render.resolution_percentage=a.scale;s.eevee.taa_render_samples=a.samples;s.eevee.shadow_pool_size='1024'
for f in range(a.start,a.end+1):
 path=out/f'frame-{f:04d}.png'
 if path.exists():continue
 s.frame_set(f);s.render.filepath=str(path);bpy.ops.render.render(write_still=True)
