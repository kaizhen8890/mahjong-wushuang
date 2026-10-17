"""Refine only title frames, preserving all original scene choreography."""
import bpy,argparse,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from title_geometry import replace_title
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--frames',default='');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.source).resolve();bpy.ops.wm.open_mainfile(filepath=str(out/'astral-judgement.blend'));s=bpy.context.scene;replace_title(s,out.parent/'title-glyphs',a.portrait);s.render.resolution_percentage=100;s.render.filepath=str(out/'frames/frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'astral-judgement.blend'))
for f in (map(int,a.frames.split(',')) if a.frames else range(248,301)):
 s.frame_set(f);s.render.filepath=str(out/'frames'/f'frame-{f:04d}.png');bpy.ops.render.render(write_still=True)
