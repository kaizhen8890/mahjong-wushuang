"""Positive outcome: 6-second offline 'Ten Thousand Tiles Become One' film.
Load the matching wushuang-coin heads .blend first. Frame 1 continues frame 390.
No real hand, player identity, scoring, randomness or card effect is represented.
"""
import argparse,ast,math,random,sys,json
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--preview',action='store_true');p.add_argument('--frames',default='');p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=180);p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=40);p.add_argument('--save-only',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.frame_set(390);bpy.context.view_layer.update()
assert s.get('cinematic')=='wushuang-coin-v1' and s.get('result')=='heads','Load the matching HEADS source scene first'
assert s.render.resolution_x==(1000 if a.portrait else 1600),'Source scene orientation mismatch'
cam=s.camera;start_cam=cam.location.copy();start_target=start_cam+cam.rotation_euler.to_quaternion()@Vector((0,0,-cam.data.dof.focus_distance));start_lens=cam.data.lens
# Freeze every evaluated property at the exact last coin frame before removing curves.
for datablocks in [bpy.data.objects,bpy.data.meshes,bpy.data.curves,bpy.data.cameras,bpy.data.lights,bpy.data.materials,bpy.data.worlds]:
    for d in datablocks:
        if hasattr(d,'animation_data_clear'):d.animation_data_clear()
        if getattr(d,'node_tree',None):d.node_tree.animation_data_clear()
if s.node_tree:s.node_tree.animation_data_clear()
s.animation_data_clear();s.frame_set(1)
s.render.fps=30;s.frame_start=a.start;s.frame_end=a.end;s.render.resolution_percentage=a.scale
s.eevee.taa_render_samples=a.samples;s.eevee.volumetric_tile_size='16';s.eevee.volumetric_samples=32
s.eevee.shadow_pool_size='1024'
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=20
random.seed(31032026)
# Reuse modeling helpers, not the source scene's construction or render side effects.
src=Path(__file__).parent.parent/'wushuang-coin/build_scene.py';tree=ast.parse(src.read_text(encoding='utf-8'))
names={'key','scalar','mat','mesh','bevel','cube','cyl','tor','line','empty','light','text','smooth'}
env=globals();env['font']=bpy.data.objects['Heads top inscription'].data.font
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),str(src),'exec'),env)
gold=bpy.data.materials['Raised brushed gold'];bronze=bpy.data.materials['Antique gold'];black=bpy.data.materials['Shakudo black copper']
ivory=mat('Spirit tile ivory porcelain',(.46,.40,.28),.18,.28,130)
jade=mat('Spirit tile deep jade back',(.018,.073,.047),.65,.25,110)
inkgold=mat('Spirit tile gold engraving',(.82,.50,.16),.8,.22,90)
energy=mat('Golden collected spirit',(1,.38,.035),.1,.22,emission=5)
ember=mat('White gold embers',(1,.66,.24),.2,.25,emission=6)
sealmat=mat('Colossal raised gold seal',(.72,.40,.075),.88,.23,100)
sealb=sealmat.node_tree.nodes['Principled BSDF'];sealb.inputs['Emission Color'].default_value=(1,.37,.028,1)
for f,v in [(1,0),(72,.04),(103,.10),(123,.15),(143,3)]:scalar(sealb.inputs['Emission Strength'],f,v)

# A single detailed shared tile mesh. No actual tile face or hidden hand is used.
parts=[]
parts.append(cube('Tile ivory body',(0,0,0),(.50,.20,.70),ivory,.05))
for sign in [-1,1]:
    parts.append(cube('Inset jade tile back',(0,sign*.104,0),(.428,.026,.62),jade,.033))
    y=sign*.121
    parts.append(line('Fine tile back frame',[(-.177,y,-.256),(.177,y,-.256),(.177,y,.256),(-.177,y,.256),(-.177,y,-.256)],inkgold,.007))
    parts.append(line('Tile back diamond',[(0,y,.13),(.084,y,0),(0,y,-.13),(-.084,y,0),(0,y,.13)],inkgold,.009))
    parts.append(line('Tile back center thread',[(0,y,-.13),(0,y,.13)],inkgold,.004))
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True);bpy.context.view_layer.objects.active=o
    if o.type!='MESH':bpy.ops.object.convert(target='MESH')
    for mod in list(o.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
    o.select_set(False)
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();proto=bpy.context.object;tilemesh=proto.data.copy();bpy.data.objects.remove(proto,do_unlink=True)

core_center=Vector((0,0,12.2))
def ringpose(t,i,n):
    layer=i//60;theta=(i%60)*math.tau/60+layer*.22+.85*min(t,4.02)
    r=5.9+layer*.65+.25*math.sin(theta*3+t)
    z=8.1+layer*1.35+1.6*math.sin(theta+layer*.4)
    if a.portrait:z=12.2+(z-12.2)*1.35
    return Vector((r*math.cos(theta),r*math.sin(theta),z)),theta

tile_count=420
for i in range(tile_count):
    o=bpy.data.objects.new(f'Spirit tile {i:03d}',tilemesh);s.collection.objects.link(o)
    start=.65+random.random()*.65;arrival=2.65+random.random()*.28
    branch=i%4;angle=branch*math.pi/2+random.uniform(-.20,.20);dist=random.uniform(23,33)
    origin=Vector((dist*math.cos(angle),dist*math.sin(angle),random.uniform(.2,.7)))
    collapse=4.04+(i//60)*.035+random.uniform(0,.035);finish=4.72+random.uniform(0,.10)
    for f in range(1,181,2):
        t=(f-1)/30;pos,theta=ringpose(t,i,tile_count)
        if t<start:scale=0;pos=origin
        elif t<arrival:
            u=smooth((t-start)/(arrival-start));pos=origin.lerp(pos,u);pos.z+=3*math.sin(math.pi*u);scale=smooth((t-start)/.13)
        elif t<collapse:scale=1
        elif t<finish:
            u=smooth((t-collapse)/(finish-collapse));rvec=pos-core_center;twist=u*2.4
            rvec=Vector((rvec.x*math.cos(twist)-rvec.y*math.sin(twist),rvec.x*math.sin(twist)+rvec.y*math.cos(twist),rvec.z))
            pos=core_center+rvec*(1-u);scale=1-smooth((u-.55)/.45)
        else:pos=core_center;scale=0
        size=1.05+(i%9)*.037
        key(o,'location',f,pos);key(o,'scale',f,(size*scale,)*3)
        key(o,'rotation_euler',f,(.30*math.sin(i*.2+t*2),.30*math.cos(i*.7+t),theta+math.pi/2))

# Thin wake ribbons trace the four entry paths, then rise into the vortex.
for k in range(12):
    pts=[];phase=k*math.tau/12
    for j in range(130):
        u=j/129;r=21*(1-u)**1.2+2.0;theta=phase+u*math.tau*.8
        pts.append((r*math.cos(theta),r*math.sin(theta),.75+14*u))
    o=line('Flowing collected golden thread',pts,energy,.008 if k%3 else .022)
    for f,v in [(1,0),(22+k,0),(84+k,1)]:key(o.data,'bevel_factor_end',f,v)
    for f,v in [(1,0),(58+k,0),(119+k,1)]:key(o.data,'bevel_factor_start',f,v)

seal_root=empty('Colossal seal group',(0,-10.5,15.1))
seal=text('Colossal Wushuang relief','无双',(0,0,0),3.7,sealmat,(math.pi/2,0,0),seal_root)
seal.data.extrude=.12;seal.data.bevel_depth=.025
for f,v in [(1,0),(76,0),(89,1),(120,1),(133,.85),(145,0)]:key(seal_root,'scale',f,(v,)*3)
for f,y,z in [(1,-10.5,14.2),(78,-10.5,14.2),(100,-10.5,15.1),(123,-10.5,15.1),(145,0,12.2)]:key(seal_root,'location',f,(0,y,z))
shadow=text('Blackened seal relief shadow','无双',(0,.10,-.055),3.84,black,(math.pi/2,0,0),seal_root)
shadow.data.extrude=.14
subtitle=text('Small engraved invocation','万 牌 归 一',(0,-.02,-1.5),.44,inkgold,(math.pi/2,0,0),seal_root)
# Four substantial gilt halo arcs behind the lettering, with fine etched indexes.
for k in range(4):
    pts=[]
    for j in range(61):
        ang=k*math.pi/2+(.12+j/60*1.32);pts.append((4.1*math.cos(ang),.30,4.1*math.sin(ang)))
    o=line('Broken ceremonial seal arc',pts,bronze,.045)
    o.parent=seal_root
for i in range(56):
    ang=i*math.tau/56;r=3.9
    o=line('Seal engraved radial index',[(r*math.cos(ang),.25,r*math.sin(ang)),((r-.16)*math.cos(ang),.25,(r-.16)*math.sin(ang))],gold,.012)
    o.parent=seal_root

# Turbulent black-gold plasma, surrounded by revolving filament shells.
plasma=mat('Turbulent gold plasma',(.07,.015,.002),.5,.28)
pn=plasma.node_tree.nodes;pl=plasma.node_tree.links;pb=pn['Principled BSDF']
nt=pn.new('ShaderNodeTexNoise');nt.noise_dimensions='4D';nt.inputs['Scale'].default_value=4;nt.inputs['Detail'].default_value=5;nt.inputs['Roughness'].default_value=.7
cr=pn.new('ShaderNodeValToRGB');cr.color_ramp.elements[0].position=.32;cr.color_ramp.elements[0].color=(.008,.001,.0001,1);cr.color_ramp.elements[1].position=.73;cr.color_ramp.elements[1].color=(1,.74,.25,1)
mid=cr.color_ramp.elements.new(.56);mid.color=(.8,.20,.004,1)
pl.new(nt.outputs['Fac'],cr.inputs[0]);pl.new(cr.outputs[0],pb.inputs['Base Color']);pl.new(cr.outputs[0],pb.inputs['Emission Color']);pb.inputs['Emission Strength'].default_value=3
bp=pn.new('ShaderNodeBump');bp.inputs['Strength'].default_value=.5;bp.inputs['Distance'].default_value=.18;pl.new(nt.outputs['Fac'],bp.inputs['Height']);pl.new(bp.outputs[0],pb.inputs['Normal'])
for f,v in [(1,0),(120,0),(180,4)]:scalar(nt.inputs['W'],f,v)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5,radius=.8);core=bpy.context.object;core.name='Compressed heart of all tiles';core.data.materials.append(plasma)
for poly in core.data.polygons:poly.use_smooth=True
for f,sz in [(1,0),(116,0),(129,.20),(141,.65),(149,1.1),(159,1.20),(170,2.4),(180,0)]:key(core,'scale',f,(sz,)*3)
for f in [1,120,145,170]:key(core,'rotation_euler',f,(f*.023,f*.015,f*.038))
for k in range(11):
    pts=[]
    for j in range(121):
        ang=j/120*math.tau;rr=1.0+.10*math.sin(ang*5+k)
        pts.append((rr*math.cos(ang),rr*math.sin(ang),.14*math.sin(ang*3+k)))
    o=line('Rotating plasma filament',pts,energy,.009 if k%3 else .018);o.parent=core
    for f in [1,119,145,165,180]:key(o,'rotation_euler',f,(k*.71+f*.028,k*.42-f*.03,k*.83+f*.04))

# Original layered sparks: incoming streams, suspended corona, implosion and outbound flare.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);sparkmesh=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);sparkmesh.materials.append(ember)
for i in range(620):
    o=bpy.data.objects.new('Spiral spirit mote',sparkmesh);s.collection.objects.link(o)
    theta=random.random()*math.tau;r=random.uniform(4,11);z=random.uniform(5,18);size=random.uniform(.012,.045)
    for f in range(1,181,4):
        t=(f-1)/30;ang=theta+t*.95
        pos=Vector((r*math.cos(ang),r*math.sin(ang),z+math.sin(t*2+theta)*.5))
        scale=smooth((t-.7)/1.2)
        if t>4.04:
            u=smooth((t-4.04)/.90);pos=pos.lerp(core_center,u);scale*=1-u
        key(o,'location',f,pos);key(o,'scale',f,(size*scale,size*scale,size*scale*1.8))
for i in range(180):
    o=bpy.data.objects.new('Outward core shard',sparkmesh);s.collection.objects.link(o)
    theta=random.random()*math.tau;v=Vector((math.cos(theta)*random.uniform(6,19),math.sin(theta)*random.uniform(6,19),random.uniform(-4,7)));size=random.uniform(.018,.045)
    for f in range(1,181,3):
        t=(f-1)/30;u=max(0,t-4.83);scale=(t>=4.83)*(1-smooth(u/1.1));pos=core_center+v*u
        key(o,'location',f,pos);key(o,'scale',f,(size*scale,size*scale,size*scale*2))
for k in range(2):
    o=tor('Celestial pressure ring',1,.035,(0,0,12.2+k*.22),energy)
    for f,r in [(1,0),(145+k*2,0),(147+k*2,.8),(157+k*2,8),(172+k*2,20),(179,24)]:key(o,'scale',f,(r,r,.45))
    key(o,'hide_render',1,True);key(o,'hide_render',145+k*2,True);key(o,'hide_render',146+k*2,False);key(o,'hide_render',180,True)

# Illuminate the modeled porcelain and shrine, with volume shafts through the array.
for loc in [(-7,-7,16),(7,-2,19),(0,7,20)]:
    o=light('Tile array photographic softbox',loc,(1,.64,.26),0,9,(0,0,11))
    for f,v in [(1,0),(35,0),(63,2600),(89,5000),(123,5600),(148,1500),(169,0)]:key(o.data,'energy',f,v)
keylight=light('Relief gold key',(0,-16,18),(1,.75,.38),0,6,(0,-10.5,15))
for f,v in [(1,0),(69,0),(89,2200),(122,2900),(144,0)]:key(keylight.data,'energy',f,v)
burst=light('Heart radiance',(0,0,12.2),(1,.43,.10),0,1.4,(0,0,0),'POINT',False)
for f,v in [(1,0),(99,120),(124,450),(139,1500),(147,14500),(152,6000),(162,8500),(170,0)]:key(burst.data,'energy',f,v)
base_light=bpy.data.objects['Synchronized impact bloom']
initial_energy=base_light.data.energy
for f,v in [(1,initial_energy),(19,650),(34,2100),(53,850),(89,1200),(147,4200),(163,1000),(177,0)]:key(base_light.data,'energy',f,v)
inlay=bpy.data.materials['Awakening gold channels'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength']
initial_inlay=inlay.default_value
for f,v in [(1,initial_inlay),(23,6),(48,3),(110,4),(148,9),(166,2)]:scalar(inlay,f,v)
for k in range(5):
    loc=Vector(((k-2)*1.0,0,.85));target=Vector(((k-2)*2.8,0,16))
    o=light('Sacred volume shaft',loc,(1,.51,.15),0,.24,target,'SPOT',False);o.data.diffuse_factor=0;o.data.specular_factor=0
    for f,v in [(1,0),(24,0),(63,1800),(96,2300),(120,3000),(146,0)]:key(o.data,'energy',f,v)

# Camera begins exactly at the previous film's evaluated last frame.
shots=[(0,start_cam,start_target,start_lens),(.85,Vector((0,-9.8,5.8)),Vector((0,0,2.0)),38),
 (1.85,Vector((-2,-19,14)),Vector((0,0,8.5)),34),
 (2.8,Vector((-3,-29,19)),Vector((0,0,11.3)),33),
 (3.95,Vector((1.5,-26,18)),Vector((0,0,12.1)),36),
 (4.83,Vector((0,-22,16.5)),core_center,39),
 (5.5,Vector((0,-19,15.8)),core_center,39),
 (6,Vector((0,-18.5,15.7)),core_center,39)]
def camera_at(t):
    for i in range(len(shots)-1):
        ta,pa,qa,la=shots[i];tb,pb,qb,lb=shots[i+1]
        if ta<=t<=tb:
            u=smooth((t-ta)/(tb-ta));pos=pa.lerp(pb,u);target=qa.lerp(qb,u);lens=la+(lb-la)*u
            if a.portrait:
                # Preserve the shared first frame, then independently frame the full vortex width.
                mix=smooth(t/.9);pos.x*=1-.38*mix;lens*=1+.10*mix
            return pos,target,lens
    return shots[-1][1],shots[-1][2],shots[-1][3]
for f in range(1,181):
    t=(f-1)/30;pos,target,lens=camera_at(t)
    shake=.12*math.exp(-(t-4.85)*10) if t>4.85 else 0
    pos+=Vector((math.sin(t*100)*shake,0,math.sin(t*77)*shake*.6))
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(target-pos).to_track_quat('-Z','Y').to_euler());key(cam.data,'lens',f,lens);key(cam.data.dof,'focus_distance',f,(target-pos).length)
    launch=smooth((t-5.13)/.52);key(core,'location',f,core_center.lerp(pos+(target-pos).normalized()*.50,launch))
    key(burst,'location',f,core.location)

# Broad non-white golden bloom, then a clean dark tail for actor-specific UI overlays.
n=s.node_tree.nodes;l=s.node_tree.links;glare=next(x for x in n if x.type=='GLARE');comp=next(x for x in n if x.type=='COMPOSITE')
for f,v in [(1,-.8),(40,-.6),(86,-.40),(133,-.30),(149,-.15),(180,-.3)]:key(glare,'mix',f,v)
mix=n.new('CompositorNodeMixRGB');mix.blend_type='MIX';mix.inputs[2].default_value=(.003,.004,.008,1);l.new(glare.outputs[0],mix.inputs[1]);l.new(mix.outputs[0],comp.inputs[0])
for f,v in [(1,0),(166,0),(173,.30),(180,1)]:scalar(mix.inputs[0],f,v)
for o in bpy.data.objects:
    if o.animation_data and o.animation_data.action:
        for fc in o.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
for d in [cam.data]:
    if d.animation_data and d.animation_data.action:
        for fc in d.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
s['cinematic']='wushuang-heads-v1';s['duration_seconds']=6;s['handoff_seconds']=5.3;s['tile_count']=tile_count;s['presentation_only']=True
s.frame_set(103);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'wushuang-heads-effect.blend'))
(out/'scene-metadata.json').write_text(json.dumps({'fps':30,'frames':180,'duration':6,'portrait':a.portrait,'tileCount':tile_count,'firstFrameMatches':'wushuang-coin/heads frame 390','handoffSeconds':5.3,'noGameState':True},indent=2),encoding='utf-8')
if a.save_only:raise SystemExit(0)
if a.preview or a.frames:
    frames=[int(x) for x in a.frames.split(',')] if a.frames else [1,32,69,103,128,148,162,174]
    for f in frames:s.frame_set(f);s.render.filepath=str(out/f'key-{f:03d}.png');bpy.ops.render.render(write_still=True)
else:
    (out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.render.render(animation=True)
