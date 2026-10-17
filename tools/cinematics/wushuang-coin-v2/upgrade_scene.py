"""Upgrade an existing v1 saved scene; preserve its coin design and camera.
Pass Blender -b ORIGINAL.blend --python upgrade_scene.py -- --out NEW_DIR.
"""
import argparse,sys,math,json
from pathlib import Path
import bpy
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from motion import pose,trail_strength,speed
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--result',choices=['heads','tails'],default='heads');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=32);p.add_argument('--frames',default='');p.add_argument('--font');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);s=bpy.context.scene
coin=bpy.data.objects['DESTINY COIN - authoritative ending selected externally']
coin.animation_data_clear()
def key(o,prop,f,value):
 setattr(o,prop,value);o.keyframe_insert(data_path=prop,frame=f)
# Four substeps per delivered frame keep shutter samples on a smooth rotation.
for sub in range(1561):
 f=1+sub/4;t=(f-1)/30;loc,rot=pose(t,a.result)
 key(coin,'location',f,loc);key(coin,'rotation_euler',f,rot)

# Three trailing coin-edge impressions at true earlier poses. Thin rings plus a
# faint face disk retain a coin silhouette instead of turning into a neon orb.
def trail_material(name,color,alpha):
 m=bpy.data.materials.new(name);m.use_nodes=True;m.surface_render_method='DITHERED';m.use_transparency_overlap=False
 n=m.node_tree.nodes;n.clear();links=m.node_tree.links
 transparent=n.new('ShaderNodeBsdfTransparent');emission=n.new('ShaderNodeEmission');emission.inputs['Color'].default_value=(*color,1);emission.inputs['Strength'].default_value=1.8
 mix=n.new('ShaderNodeMixShader');mix.inputs[0].default_value=0;links.new(transparent.outputs[0],mix.inputs[1]);links.new(emission.outputs[0],mix.inputs[2]);output=n.new('ShaderNodeOutputMaterial');links.new(mix.outputs[0],output.inputs[0])
 for f in range(1,392):
  t=(f-1)/30;mix.inputs[0].default_value=alpha*trail_strength(t)*min(1,speed(t)/8.2);mix.inputs[0].keyframe_insert(data_path='default_value',frame=f)
 return m
for index,(delay,alpha) in enumerate([(.009,.21),(.021,.12),(.037,.065)]):
 root=bpy.data.objects.new(f'FAST SPIN residual {index+1}',None);s.collection.objects.link(root)
 edge=trail_material(f'Temporal coin rim {index+1}',(1,.64,.27),alpha)
 face=trail_material(f'Temporal coin surface {index+1}',(.60,.66,.72),alpha*.12)
 for z in [-.13,.13]:
  bpy.ops.mesh.primitive_torus_add(major_segments=80,minor_segments=6,major_radius=1.69,minor_radius=.020,location=(0,0,z))
  o=bpy.context.object;o.name=f'Afterimage rim {index+1}';o.parent=root;o.data.materials.append(edge)
  for poly in o.data.polygons:poly.use_smooth=True
 bpy.ops.mesh.primitive_cylinder_add(vertices=80,radius=1.67,depth=.025)
 disk=bpy.context.object;disk.name=f'Afterimage coin silhouette {index+1}';disk.parent=root;disk.data.materials.append(face)
 for sub in range(1561):
  f=1+sub/4;t=(f-1)/30;loc,rot=pose(max(0,t-delay),a.result)
  key(root,'location',f,loc);key(root,'rotation_euler',f,rot)

s.render.use_motion_blur=True;s.render.motion_blur_shutter=.70;s.render.motion_blur_position='CENTER'
s.eevee.motion_blur_steps=3;s.eevee.motion_blur_max=96
s.eevee.shadow_pool_size='1024'
s.render.resolution_percentage=a.scale;s.eevee.taa_render_samples=a.samples;s.frame_start=1;s.frame_end=390
for obj in bpy.data.objects:
 if obj.animation_data and obj.animation_data.action and (obj==coin or obj.name.startswith('FAST SPIN')):
  for fc in obj.animation_data.action.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'
# Protect glyph availability when sources are moved to the delivery folder.
font_path=Path(a.font).resolve() if a.font else Path(__file__).resolve().parents[3]/'public/fonts/Wushuang-Jianghu.ttf'
for font in bpy.data.fonts:
 if font.name!='Bfont Regular' and not font.packed_file:
  if not Path(bpy.path.abspath(font.filepath)).exists():font.filepath=str(font_path)
bpy.ops.file.pack_all()
s['cinematic']='wushuang-coin-v2';s['result']=a.result;s['airborne_turns']=52.3;s['afterimage_lags_seconds']=[.009,.021,.037];s['duration_seconds']=13
s.frame_set(365);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(out/f'wushuang-coin-{a.result}.blend'))
(out/'scene-settings.json').write_text(json.dumps({'turns':52.3,'shutter':.7,'afterimageLagsSeconds':[.009,.021,.037],'fps':30,'frames':390,'scale':a.scale,'samples':a.samples},indent=2))
for f in [int(x) for x in a.frames.split(',') if x]:
 s.frame_set(f);s.render.filepath=str(out/f'key-{f:04d}.png');bpy.ops.render.render(write_still=True)
