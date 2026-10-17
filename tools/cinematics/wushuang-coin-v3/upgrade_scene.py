"""Load a preserved v1 scene and author v3 flight, camera and clock together."""
import argparse,sys,json,math,ast
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from motion import *
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--result',choices=['heads','tails'],default='heads');p.add_argument('--portrait',action='store_true');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=32);p.add_argument('--frames',default='');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);s=bpy.context.scene
def key(o,prop,f,value):setattr(o,prop,value);o.keyframe_insert(data_path=prop,frame=f)
# Retime every authored prop/particle/light/node animation from the v1 clock.
for action in bpy.data.actions:
 for fc in action.fcurves:
  for k in fc.keyframe_points:
   for point in [k.co,k.handle_left,k.handle_right]:point.x=1+30*old_to_new((point.x-1)/30)
  fc.update()
coin=bpy.data.objects['DESTINY COIN - authoritative ending selected externally'];coin.animation_data_clear()
for sub in range(1201):
 f=1+sub/4;loc,rot=pose((f-1)/30,a.result);key(coin,'location',f,loc);key(coin,'rotation_euler',f,rot)
cam=s.camera
# Rebuild the complete camera action. Retimed fractional keys must not remain
# between the baked keys: that would produce camera jitter and false motion blur.
tree=ast.parse((Path(__file__).parent/'build_scene.py').read_text(encoding='utf-8-sig'))
selected=[node for node in tree.body if (isinstance(node,ast.Assign) and any(isinstance(x,ast.Name) and x.id=='shots' for x in node.targets)) or (isinstance(node,ast.FunctionDef) and node.name=='camera_pose')]
old_namespace={'Vector':Vector,'smooth':smooth}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<original camera>','exec'),old_namespace)
old_camera=old_namespace['camera_pose']
cam.animation_data_clear();cam.data.animation_data_clear()
for f in range(1,302):
 t=(f-1)/30
 old_t=t if t<3 else (3+(t-3)*6.5/3.5 if t<=6.5 else t+3)
 pos,target,lens=camera_pose(t) if 3<=t<=8 else old_camera(old_t)
 pos=Vector(pos);target=Vector(target)
 if a.portrait:
  pos.x*=.66;pos.y*=.93
  lens*=.87+.15*smooth((old_t-2)/1.5)+.33*smooth((old_t-10)/1.2)
  if old_t<2:target.z+=.8
 shake=math.exp(-(t-6.55)*8)*.10 if 6.55<t<7.3 else 0
 pos+=Vector((math.sin((t+3)*81)*shake,0,math.cos((t+3)*97)*shake*.5))
 key(cam,'location',f,pos);key(cam,'rotation_euler',f,(target-pos).to_track_quat('-Z','Y').to_euler());key(cam.data,'lens',f,lens);key(cam.data.dof,'focus_distance',f,(target-pos).length)
# The tracking softboxes follow the true new position, not a remapped sine curve.
hero=bpy.data.objects['Coin travelling warm softbox'];fill=bpy.data.objects['Coin travelling silver softbox']
for o in [hero,fill]:o.animation_data_clear()
for f in range(1,302):
 loc,_=pose((f-1)/30,a.result);z=loc[2]
 for o,lightloc in [(hero,(-4,-4,z+4)),(fill,(4,2,z+4))]:key(o,'location',f,lightloc);key(o,'rotation_euler',f,(Vector(loc)-Vector(lightloc)).to_track_quat('-Z','Y').to_euler())
def trail_mat(name,color,alpha):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.surface_render_method='DITHERED';m.use_transparency_overlap=False;n=m.node_tree.nodes;n.clear();l=m.node_tree.links
 tr=n.new('ShaderNodeBsdfTransparent');em=n.new('ShaderNodeEmission');em.inputs['Color'].default_value=(*color,1);em.inputs['Strength'].default_value=1.8
 mix=n.new('ShaderNodeMixShader');l.new(tr.outputs[0],mix.inputs[1]);l.new(em.outputs[0],mix.inputs[2]);output=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],output.inputs[0])
 for f in range(1,302):
  t=(f-1)/30;mix.inputs[0].default_value=alpha*trail_strength(t)*min(1,speed(t)/9.2);mix.inputs[0].keyframe_insert(data_path='default_value',frame=f)
 return m
for index,(delay,alpha) in enumerate([(.009,.21),(.021,.12),(.037,.065)]):
 root=bpy.data.objects.new(f'FAST SPIN residual {index+1}',None);s.collection.objects.link(root);edge=trail_mat(f'Temporal coin rim {index+1}',(1,.64,.27),alpha);face=trail_mat(f'Temporal coin surface {index+1}',(.60,.66,.72),alpha*.12)
 for z in [-.13,.13]:
  bpy.ops.mesh.primitive_torus_add(major_segments=80,minor_segments=6,major_radius=1.69,minor_radius=.020,location=(0,0,z));o=bpy.context.object;o.name=f'Afterimage rim {index+1}';o.parent=root;o.data.materials.append(edge)
  for poly in o.data.polygons:poly.use_smooth=True
 bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=1.67,depth=.025);disk=bpy.context.object;disk.name=f'Afterimage coin silhouette {index+1}';disk.parent=root;disk.data.materials.append(face)
 for sub in range(1201):
  f=1+sub/4;loc,rot=pose(max(0,(f-1)/30-delay),a.result);key(root,'location',f,loc);key(root,'rotation_euler',f,rot)
s.render.use_motion_blur=True;s.render.motion_blur_shutter=.60;s.render.motion_blur_position='CENTER';s.eevee.motion_blur_steps=3;s.eevee.motion_blur_max=96;s.eevee.shadow_pool_size='1024'
s.render.resolution_percentage=a.scale;s.eevee.taa_render_samples=a.samples;s.frame_start=1;s.frame_end=300
for o in [coin,cam,cam.data,hero,fill,*[o for o in bpy.data.objects if o.name.startswith('FAST SPIN')]]:
 if o.animation_data and o.animation_data.action:
  for fc in o.animation_data.action.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'
for marker in s.timeline_markers:marker.frame=round(1+30*old_to_new((marker.frame-1)/30))
s['cinematic']='wushuang-coin-v3';s['result']=a.result;s['gravity']=G;s['apex_seconds']=APEX;s['impact_seconds']=IMPACT;s['duration_seconds']=DURATION;s['reveal_seconds']=REVEAL;s['stop_spin_at_apex']=True
bpy.ops.file.pack_all();s.frame_set(275);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(out/f'wushuang-coin-{a.result}.blend'))
(out/'scene-settings.json').write_text(json.dumps({'g':G,'apexSeconds':APEX,'apexHeight':APEX_Z,'impactSeconds':IMPACT,'turnsBeforeStop':TURNS,'durationSeconds':DURATION,'revealSeconds':REVEAL,'fps':30,'frames':300},indent=2))
for f in [int(x) for x in a.frames.split(',') if x]:s.frame_set(f);s.render.filepath=str(out/f'key-{f:04d}.png');bpy.ops.render.render(write_still=True)
