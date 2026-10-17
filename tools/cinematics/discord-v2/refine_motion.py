"""Apply the final keyed shutter to an already rendered scene; rerender only changed frames."""
import bpy, argparse, sys
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--frames',default='');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.source).resolve();bpy.ops.wm.open_mainfile(filepath=str(out/'discord.blend'));s=bpy.context.scene;s.render.resolution_percentage=100;s.render.use_motion_blur=True
for f,v in [(1,0),(117,0),(123,.24),(128,.48),(140,.36),(152,0),(240,0)]:s.render.motion_blur_shutter=v;s.render.keyframe_insert('motion_blur_shutter',frame=f)
s.render.filepath=str(out/'frames/frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'discord.blend'))
frames=list(map(int,a.frames.split(','))) if a.frames else range(118,152)
for f in frames:
 s.frame_set(f);s.render.filepath=str(out/'frames'/f'frame-{f:04d}.png');bpy.ops.render.render(write_still=True)
