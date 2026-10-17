"""Verify staged assembly and unclipped full-sword presentation in both framings."""
import bpy,sys,argparse,json
from pathlib import Path
from bpy_extras.object_utils import world_to_camera_view
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--report',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);source=Path(a.source);results=[]
for ori in ['landscape','portrait']:
 bpy.ops.wm.open_mainfile(filepath=str(source/ori/'discord.blend'));s=bpy.context.scene;hero=bpy.data.objects['Greatsword choreography'];parts=[o for o in hero.children if o.type=='EMPTY'];assert len(parts)==10,len(parts)
 early=[]
 for f in [43,57,69,82,94]:
  s.frame_set(f);early.append({'frame':f,'assembledParts':sum(o.location.length<.18 and o.scale.x>.99 for o in parts)})
 assert early[0]['assembledParts']<early[-1]['assembledParts'];assert early[-1]['assembledParts']==10,early
 boxes=[]
 for f in [95,106,112]:
  s.frame_set(f);coords=[]
  for part in parts:
   for obj in part.children_recursive:
    if obj.type=='MESH':
     coords.extend(world_to_camera_view(s,s.camera,obj.matrix_world@v.co) for v in obj.data.vertices)
  box=[min(p.x for p in coords),min(p.y for p in coords),max(p.x for p in coords),max(p.y for p in coords)];assert all(0<=p<=1 for p in box),(ori,f,box);boxes.append({'frame':f,'normalizedBounds':box})
 results.append({'orientation':ori,'stagedAssembly':early,'heroBounds':boxes})
Path(a.report).write_text(json.dumps(results,indent=2),encoding='utf-8');print(json.dumps(results))
