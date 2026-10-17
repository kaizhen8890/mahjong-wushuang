import bpy,sys,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=64);p.add_argument('--step',type=int,default=1);a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);s=bpy.context.scene;s.render.resolution_percentage=a.scale;s.eevee.taa_render_samples=a.samples
for f in range(1,193,a.step):
 target=out/f'{f-1:04d}.png'
 if target.exists():continue
 s.frame_set(f);s.render.filepath=str(target);bpy.ops.render.render(write_still=True)
