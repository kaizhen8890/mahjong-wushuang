"""Reuse the saved landscape/head scene; rebake only camera and selected ending.
Run Blender with -b BASE.blend --python this_file -- --out ... [--portrait]
The shared opening is rendered once per orientation. Tails start at frame 287.
"""
import argparse, ast, math, sys
from pathlib import Path
from types import SimpleNamespace
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--result',choices=['heads','tails'],default='heads');p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=390);p.add_argument('--frames',default='');p.add_argument('--audit-only',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
# The one source of trajectory truth, evaluated without rebuilding any geometry.
source=Path(__file__).with_name('build_scene.py');tree=ast.parse(source.read_text(encoding='utf-8'))
nodes=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ['smooth','pose','camera_pose'] or isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='shots' for t in n.targets)]
env={'math':math,'Vector':Vector,'a':a};exec(compile(ast.Module(body=nodes,type_ignores=[]),str(source),'exec'),env)
smooth,pose,camera_pose=env['smooth'],env['pose'],env['camera_pose']
def key(o,prop,f,v):setattr(o,prop,v);o.keyframe_insert(data_path=prop,frame=f)
def socket_key(o,f,v):o.default_value=v;o.keyframe_insert(data_path='default_value',frame=f)
s=bpy.context.scene;coin=bpy.data.objects['DESTINY COIN - authoritative ending selected externally'];cam=s.camera
for f in range(1,391):
    t=(f-1)/30;loc,rot=pose(t);key(coin,'location',f,loc);key(coin,'rotation_euler',f,rot)
    pos,target,lens=camera_pose(t)
    if a.portrait:
        pos.x*=.66;pos.y*=.93;lens*=.87+.15*smooth((t-2)/1.5)+.33*smooth((t-10)/1.2)
        if t<2:target.z+=.8
    shake=math.exp(-(t-9.55)*8)*.10 if 9.55<t<10.3 else 0
    pos+=Vector((math.sin(t*81)*shake,0,math.cos(t*97)*shake*.5))
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(target-pos).to_track_quat('-Z','Y').to_euler());key(cam.data,'lens',f,lens);key(cam.data.dof,'focus_distance',f,(target-pos).length)
impact=bpy.data.objects['Synchronized impact bloom'].data
color=bpy.data.materials['Awakening gold channels'].node_tree.nodes['Principled BSDF'].inputs['Emission Color']
for f in [1,333]:key(impact,'color',f,(1,.61,.24));socket_key(color,f,(1,.48,.08,1))
key(impact,'color',345,(.27,.58,1) if a.result=='tails' else (1,.61,.24));socket_key(color,345,(.18,.49,1,1) if a.result=='tails' else (1,.48,.08,1))
for obj in [coin,cam,cam.data]:
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
s.render.resolution_x,s.render.resolution_y=(1000,1600) if a.portrait else (1600,1000)
s.render.resolution_percentage=100;s.eevee.taa_render_samples=32;s.frame_start=a.start;s.frame_end=a.end
s['result']=a.result;s.frame_set(365)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/f'wushuang-coin-{a.result}.blend'))
if a.audit_only:raise SystemExit(0)
if a.frames:
    for f in [int(i) for i in a.frames.split(',')]:s.frame_set(f);s.render.filepath=str(out/f'key-{f:03d}.png');bpy.ops.render.render(write_still=True)
else:
    (out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.render.render(animation=True)
