"""Framing, branch identity and self-contained source checks for the four scenes."""
import bpy,sys,argparse,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--report',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);results=[]
for ending in ['heads','tails']:
 for ori in ['landscape','portrait']:
  folder=Path(a.source)/f'{ending}-{ori}';bpy.ops.wm.open_mainfile(filepath=str(folder/'heavens-sword.blend'));s=bpy.context.scene;assert s['ending']==ending and s['presentation_only'];assert s.frame_end==330 and s.render.fps==30 and s.render.resolution_percentage==100
  row={'ending':ending,'orientation':ori,'titleBounds':[],'endingBounds':[]};assert bpy.data.objects.get('Broad rectangular forged cleaver') and bpy.data.objects.get('Full width razor ground bevel');assert len([o for o in bpy.data.objects if o.name.startswith('Slash shock assembly')])==3
  def bounds(objects):
   points=[world_to_camera_view(s,s.camera,o.matrix_world@Vector(v)) for o in objects for v in o.bound_box];return [min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)]
  for f in [294,306,317]:
   s.frame_set(f);objects=[o for o in bpy.data.objects if o.name.startswith('Title glyph ')];assert sorted(o['glyph'] for o in objects)==sorted('听天问剑');box=bounds(objects);assert all(0<=x<=1 for x in box),(ending,ori,f,box);row['titleBounds'].append({'frame':f,'bounds':box})
  s.frame_set(266);objects=[o for o in bpy.data.objects if o.name.startswith('Generic skill card back' if ending=='heads' else 'Thick ivory flying tile')];assert len(objects)==(5 if ending=='heads' else 1);box=bounds(objects);assert all(0<=x<=1 for x in box),(ending,ori,box);row['endingBounds'].append({'frame':266,'objects':len(objects),'bounds':box})
  row['packedGlyphs']=len([im for im in bpy.data.images if im.packed_file]);assert row['packedGlyphs']>=(5 if ending=='tails' else 4);results.append(row)
Path(a.report).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(results))
