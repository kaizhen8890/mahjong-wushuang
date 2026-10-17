"""Check flower/title framing and exact font, independently of encoded video."""
import bpy,sys,argparse,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--report',required=True);a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);results=[]
for ori in ['landscape','portrait']:
 bpy.ops.wm.open_mainfile(filepath=str(Path(a.source)/ori/'astral-judgement.blend'));s=bpy.context.scene;row={'orientation':ori,'flowerBounds':[],'titleBounds':[]}
 for f in [16,35,50]:
  s.frame_set(f);points=[]
  for o in bpy.data.objects:
   if o.name.startswith('White lily petal'):
    points.extend(world_to_camera_view(s,s.camera,o.matrix_world@v.co) for v in o.data.vertices)
  bounds=[min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)];assert all(0<=x<=1 for x in bounds),(ori,f,bounds);row['flowerBounds'].append({'frame':f,'bounds':bounds})
 for f in [250,270,287]:
  s.frame_set(f);points=[];chars=[]
  for o in bpy.data.objects:
   if o.name.startswith('宿星审判 '):
    assert o.get('font_family')=='STZhongsong';chars.append(o['glyph']);points.extend(world_to_camera_view(s,s.camera,o.matrix_world@Vector(v)) for v in o.bound_box)
  assert sorted(chars)==sorted('宿星审判');bounds=[min(p.x for p in points),min(p.y for p in points),max(p.x for p in points),max(p.y for p in points)];assert all(0<=x<=1 for x in bounds),(ori,f,bounds);row['titleBounds'].append({'frame':f,'bounds':bounds})
 row['font']='STZhongsong';row['whiteFacePurpleOutline']=all(x in bpy.data.materials for x in ['Pure pearl-white title face','Violet title outline']);assert row['whiteFacePurpleOutline']
 full_field=[o for o in bpy.data.objects if o.name.startswith('Full-frame interlaced danmaku ')];assert len(full_field)==4
 row['fullFieldBullets']=sum(len(o.data.vertices)//6 for o in full_field);assert row['fullFieldBullets']==5040
 row['worldBullets']=sum(len(bpy.data.objects[name].data.vertices)//6 for name in ['Floral white bullet fans','Violet counter-rotating star spirals','Pink depth lance storm']);assert row['worldBullets']==5040
 flash=s.node_tree.nodes['Mix'];row['flash']={}
 for f,expected in [(205,0),(206,.5),(207,1),(225,1),(245,1),(251,0)]:
  s.frame_set(f);actual=flash.inputs[0].default_value;assert abs(actual-expected)<.001,(ori,f,actual);row['flash'][str(f)]=actual
 results.append(row)
Path(a.report).write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(results))
