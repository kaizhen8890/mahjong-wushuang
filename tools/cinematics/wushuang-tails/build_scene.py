"""Six-second tails follow-up: shrine gate, descending divine sword and thunder.
Offline presentation only. Load matching coin TAILS .blend before this script.
"""
import argparse,ast,math,random,sys,json
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--preview',action='store_true');p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=40);p.add_argument('--save-only',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);s=bpy.context.scene
assert s.get('cinematic')=='wushuang-coin-v1' and s.get('result')=='tails','Load TAILS source scene'
assert s.render.resolution_x==(1000 if a.portrait else 1600),'Wrong orientation'
s.frame_set(390);bpy.context.view_layer.update();cam=s.camera;start_cam=cam.location.copy();start_target=start_cam+cam.rotation_euler.to_quaternion()@Vector((0,0,-cam.data.dof.focus_distance));start_lens=cam.data.lens
for seq in [bpy.data.objects,bpy.data.meshes,bpy.data.curves,bpy.data.cameras,bpy.data.lights,bpy.data.materials,bpy.data.worlds]:
    for d in seq:
        if hasattr(d,'animation_data_clear'):d.animation_data_clear()
        if getattr(d,'node_tree',None):d.node_tree.animation_data_clear()
s.node_tree.animation_data_clear();s.animation_data_clear();s.frame_set(1);random.seed(31042026)
s.render.fps=30;s.frame_start=1;s.frame_end=180;s.render.resolution_percentage=a.scale;s.eevee.taa_render_samples=a.samples;s.eevee.volumetric_tile_size='16';s.eevee.volumetric_samples=32
s.eevee.shadow_pool_size='1024'
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=20
src=Path(__file__).parent.parent/'wushuang-coin/build_scene.py';tree=ast.parse(src.read_text(encoding='utf-8'))
names={'key','scalar','mat','mesh','bevel','cube','cyl','tor','line','empty','light','text','smooth'};font=bpy.data.objects['Heads top inscription'].data.font
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in names],type_ignores=[]),str(src),'exec'),globals())
silver=mat('Divine hammered palladium',(.62,.71,.83),.94,.19,110)
dark=mat('Obsidian shrine lacquer',(.015,.022,.035),.76,.22,48)
gold=mat('Ancient gate gold',(.52,.28,.069),.88,.25,80)
blue=mat('Silver blue arc',(.16,.47,1),.1,.20,emission=7)
white=mat('Thunder white core',(.72,.89,1),.2,.18,emission=12)
paper=mat('Cold sacred paper',(.32,.45,.59),.18,.35,30)
root=empty('Monumental gate root',(0,2,3.6))
def child(o,parent=root):o.parent=parent;return o
for f,v in [(1,0),(24,0),(41,.35),(61,1),(151,1),(176,0)]:key(root,'scale',f,(v,)*3)
for f,z in [(1,-2),(24,-2),(45,1),(69,3.6),(145,3.6),(173,3.6)]:key(root,'location',f,(0,2,z))
# Great black-lacquer torii: modeled stepped collars and upturned kasagi.
for sign in [-1,1]:
    x=sign*6.5
    child(cyl('Great sacred pillar',.55,15,(x,0,7.5),dark,48,r2=.46))
    for z in [.6,1.05,11.7,13.8,14.4]:child(cyl('Pillar silver collar',.57,.12,(x,0,z),silver,48))
    for z in [1.4,11.9]:child(cyl('Pillar old gold band',.56,.18,(x,0,z),gold,48))
    for side in [-1,1]:child(line('Pillar runic filament',[(x+side*.25,-.5,1.25),(x+side*.25,-.5,13.8)],blue,.012))
child(cube('Great gate lower lintel',(0,0,12.2),(15,.65,.6),dark,.08))
child(cube('Great gate silver lower edge',(0,-.37,12.1),(15,.045,.07),silver,.012))
for dz,material,thick in [(0,dark,.65),(.42,silver,.12),(.59,gold,.045)]:
    vs=[];fs=[]
    for j in range(81):
        x=(j/80-.5)*18.4;z=15+dz+.85*(abs(x)/9.2)**4
        vs.extend([(x,-.62,z-thick/2),(x,.62,z-thick/2),(x,.62,z+thick/2),(x,-.62,z+thick/2)])
    for j in range(80):
        for k in range(4):fs.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
    child(bevel(mesh('Heavenly swept kasagi',vs,fs,material),.03))
child(cube('Great central plaque',(0,-.7,13.7),(1.65,.22,2.2),dark,.08))
child(text('Gate invocation','神\n罚',(0,-.86,13.75),.69,silver,(math.pi/2,0,0)))
# Shimenawa and folded sacred streamers below the giant gate.
for twist in [0,math.pi]:
    pts=[]
    for j in range(200):
        u=j/199;x=(u-.5)*12;z=11.15-.7*math.sin(math.pi*u)
        pts.append((x,-.4+.085*math.sin(u*math.tau*26+twist),z+.085*math.cos(u*math.tau*26+twist)))
    child(line('Great braided shimenawa',pts,gold,.12))
for i in range(9):
    x=(i-4)*1.25;z=11.15-.7*math.sin(math.pi*(.5+x/12));piv=child(empty('Large sacred shide pivot',(x,-.5,z)))
    vs=[]
    for xx,zz in [(-.15,0),(.14,-.25),(-.02,-.5),(.29,-.8),(.12,-1.15)]:vs.extend([(xx-.12,0,zz),(xx+.12,0,zz)])
    o=mesh('Hanging silver shide',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],paper);o.parent=piv
    for f in range(1,181,4):key(piv,'rotation_euler',f,(.3*math.sin(f*.12+i),.22*math.cos(f*.1+i),0))
# The sealed doors split aside, letting a white-blue seam expand.
for sign in [-1,1]:
    panel=child(empty('Ritual door panel',(sign*2.9,.05,6.15)))
    o=cube('Black ritual door',(0,0,0),(5.6,.25,10),dark,.07);o.parent=panel
    for x in [-2.65,2.65]:
        o=cube('Door brass upright',(x,-.16,0),(.06,.04,9.7),gold,.005);o.parent=panel
    for z in [-4.85,4.85]:
        o=cube('Door brass horizontal',(0,-.16,z),(5.3,.04,.06),gold,.005);o.parent=panel
    o=text('Door seal inscription','封' if sign<0 else '神',(0,-.21,.5),3.2,silver,(math.pi/2,0,0));o.parent=panel
    for f,x in [(1,sign*2.9),(51,sign*2.9),(69,sign*4.4),(86,sign*6.8),(141,sign*6.8),(156,sign*7.8)]:key(panel,'location',f,(x,.05,6.15))
    for f,v in [(1,1),(57,1),(80,.6),(90,0)]:key(panel,'scale',f,(v,1,1))
seam=child(cube('Gate dividing light',(0,-.04,6.15),(.055,.02,10),white,0))
for f,v in [(1,0),(43,0),(56,1),(70,13),(85,0)]:key(seam,'scale',f,(v,1,1))

# Ancient double-edged tsurugi; fully modeled front ridge, cutting edges and grip.
sword=empty('Divine descending sword',(0,-1.5,10.6))
for f,v in [(1,0),(57,0),(70,1),(160,1),(179,0)]:key(sword,'scale',f,(v,)*3)
outline=[(0,0),(-.66,1.5),(-.62,9.1),(-.48,10),(.48,10),(.62,9.1),(.66,1.5)]
vs=[(x,y,z) for y in [-.13,.13] for x,z in outline];fs=[];N=len(outline)
for j in range(N):fs.append((j,(j+1)%N,(j+1)%N+N,j+N))
fs+=[tuple(range(N-1,-1,-1)),tuple(range(N,N*2))]
o=bevel(mesh('Solid tsurugi blade',vs,fs,silver),.025);o.parent=sword
for sign in [-1,1]:
    o=mesh('Sharp blade ridge',[(0,-.24,0),(0,-.27,10),(sign*.61,-.132,9.1),(sign*.65,-.132,1.5)],[(0,1,2,3)],silver);o.parent=sword
    o=line('Blue temper line',[(sign*.13,-.285,1),(sign*.16,-.285,8.6),(sign*.1,-.285,9.6)],blue,.018);o.parent=sword
o=cyl('Octagonal gold tsuba',1.22,.27,(0,0,10.18),gold,8);o.scale.y=.65;o.parent=sword
o=tor('Silver tsuba edge',1.10,.065,(0,0,10.28),silver);o.scale.y=.66;o.parent=sword
o=cyl('Black wrapped tsuka',.24,2.9,(0,0,11.8),dark,32);o.parent=sword
for i in range(13):
    o=tor('Gold grip bindings',.245,.032,(0,0,10.5+i*.207),gold,rot=(.13,0,i*.6),n=32);o.parent=sword
for z in [10.45,13.35]:o=cyl('Silver hilt cap',.29,.20,(0,0,z),silver,16);o.parent=sword
o=text('Blade divine engraving','裁\n决',(0,-.295,7.5),.35,gold,(math.pi/2,0,0));o.parent=sword
for f,z in [(1,15),(58,15),(81,11.1),(110,11.6),(123,12.1),(130,12.5),(139,.85),(154,.85),(174,.85)]:key(sword,'location',f,(0,-1.5,z))
for f,r in [(1,.3),(69,.3),(108,-.12),(129,0),(139,0),(170,0)]:key(sword,'rotation_euler',f,(0,0,r))

# A high halo and rotating radial prayer marks surround the suspended blade.
halo=empty('Heavenly judgment mandala',(0,1,16))
for f,v in [(1,0),(48,0),(75,1),(125,1.05),(140,1.3),(156,0)]:key(halo,'scale',f,(v,)*3)
for r,thick in [(6.3,.026),(6.6,.012),(5.9,.014)]:
    o=tor('Silver heavenly halo',r,thick,(0,0,0),blue,rot=(math.pi/2,0,0));o.parent=halo
for i in range(72):
    ang=i*math.tau/72;rr=6.1
    o=line('Halo index',[(rr*math.cos(ang),0,rr*math.sin(ang)),((rr-.22 if i%3 else rr-.45)*math.cos(ang),0,(rr-.22 if i%3 else rr-.45)*math.sin(ang))],silver,.018);o.parent=halo
for f in [1,60,120,180]:key(halo,'rotation_euler',f,(0,f*.004,0))

# Fractured branching lightning: staggered onset, tapered reveal, never a static line.
def lightning(name,start,end,radius,parent=None):
    start=Vector(start);end=Vector(end);pts=[]
    for j in range(36):
        u=j/35;q=start.lerp(end,u);spread=math.sin(math.pi*u)
        q+=Vector((random.uniform(-.38,.38)*spread,random.uniform(-.22,.22)*spread,random.uniform(-.14,.14)*spread));pts.append(tuple(q))
    o=line(name,pts,blue,radius)
    if parent:o.parent=parent
    return o,pts
for i in range(14):
    angle=i*math.tau/14
    start=(math.cos(angle)*random.uniform(5,9),random.uniform(-2,4),random.uniform(23,29));end=(0,-1.5,random.uniform(11,18))
    o,pts=lightning('Gathering branched lightning',start,end,.018 if i%3 else .036)
    begin=68+i*3
    for f,v in [(1,0),(begin,0),(begin+7,1),(123,1),(136,0)]:key(o,'scale',f,(v,)*3)
    # Branches inherit the main arc's reveal.
    for j in [10,18]:
        q=Vector(pts[j]);b,_=lightning('Lightning fork',q,q+Vector((random.uniform(-2,2),random.uniform(-1,1),random.uniform(1,3))),.010)
        for f,v in [(1,0),(begin+4,0),(begin+10,1),(121,1),(135,0)]:key(b,'scale',f,(v,)*3)
strike,pts=lightning('Main heaven to earth bolt',(0,-1.5,30),(0,-1.5,.8),.13)
inner=line('White thunder spine',pts,white,.055)
for o in [strike,inner]:
    for f,v in [(1,0),(135,0),(138,1),(142,1),(150,0)]:key(o,'scale',f,(v,)*3)
# Crack spokes spread across the actual stone floor on impact.
for i in range(26):
    ang=i*math.tau/26;r=random.uniform(6,15);pts=[(0,-1.5,.76)]
    for j in range(1,18):
        rr=r*j/17;theta=ang+random.uniform(-.04,.04);pts.append((rr*math.cos(theta),-1.5+rr*math.sin(theta),.76))
    o=line('Ground thunder fracture',pts,blue,.020)
    for f,v in [(1,0),(136,0),(144,1),(164,1),(179,0)]:key(o,'scale',f,(v,)*3)
for k in range(3):
    o=tor('Expanding divine pressure wave',1,.025,(0,-1.5,1.1+k*.28),blue)
    for f,v in [(1,0),(137+k*2,0),(140+k*2,1),(153+k*2,12),(171,28)]:key(o,'scale',f,(v,v,.6))
    for f,v in [(1,False),(178,False),(179,True)]:key(o,'hide_render',f,v)

# Turbulent ground dust rolls under the pressure waves, giving impact real mass.
fog=bpy.data.materials.new('Impact cold stone dust');fog.use_nodes=True;fn=fog.node_tree.nodes;fl=fog.node_tree.links;fn.clear()
fo=fn.new('ShaderNodeOutputMaterial');fv=fn.new('ShaderNodeVolumePrincipled');fv.inputs['Color'].default_value=(.24,.32,.44,1)
nt=fn.new('ShaderNodeTexNoise');nt.inputs['Scale'].default_value=3.5;nt.inputs['Detail'].default_value=4
cr=fn.new('ShaderNodeValToRGB');cr.color_ramp.elements[0].position=.35;cr.color_ramp.elements[0].color=(0,0,0,1);cr.color_ramp.elements[1].position=.75;cr.color_ramp.elements[1].color=(1.4,1.4,1.4,1)
fl.new(nt.outputs['Fac'],cr.inputs[0]);fl.new(cr.outputs[0],fv.inputs['Density']);fl.new(fv.outputs[0],fo.inputs['Volume'])
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1);dustmesh=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);dustmesh.materials.append(fog)
for i in range(16):
    theta=i*math.tau/16;o=bpy.data.objects.new('Rolling stone dust',dustmesh);s.collection.objects.link(o)
    for f,r,sz in [(1,0,0),(138,0,0),(147,3,1),(161,8.5,2.1),(173,12,2.4),(180,14,0)]:
        key(o,'location',f,(r*math.cos(theta),-1.5+r*math.sin(theta),.8+sz*.32));key(o,'scale',f,(sz*1.7,sz*1.3,sz*.70))

# Glowing fragments and sparks rush upward before the strike and outwards after it.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);sparkmesh=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);sparkmesh.materials.append(white)
for i in range(550):
    o=bpy.data.objects.new('Silver electric fragment',sparkmesh);s.collection.objects.link(o);ang=random.random()*math.tau;r=random.uniform(2,10);z=random.uniform(1,24);size=random.uniform(.012,.047)
    for f in range(1,181,4):
        t=(f-1)/30;v=smooth((t-1.1)/1.2);theta=ang-t*.9;pos=Vector((r*math.cos(theta),r*math.sin(theta),z+t*1.4));scale=v
        if t>4.5:
            u=(t-4.5);pos=Vector((math.cos(ang)*(1+u*14),-1.5+math.sin(ang)*(1+u*14),1+u*(4+z*.4)-u*u*3));scale=1-smooth((u-.5)/1)
        key(o,'location',f,pos);key(o,'scale',f,(size*scale,size*scale,size*scale*2.2))

# Silver-blue photographic light, rising heavenly shafts and the short impact pulse.
for loc,target in [((-8,-8,17),(0,0,13)),((8,5,20),(0,0,14)),((0,-10,25),(0,-1.5,17))]:
    o=light('Gate cold key',loc,(.42,.66,1),0,7,target)
    for f,v in [(1,0),(32,0),(62,3500),(92,5200),(124,6500),(146,1700),(173,0)]:key(o.data,'energy',f,v)
o=light('Sword edge reflection',(-3,-6,17),(.65,.85,1),0,5,(0,-1.5,16))
for f,v in [(1,0),(57,0),(83,3500),(126,5800),(145,800),(176,0)]:key(o.data,'energy',f,v)
burst=light('Heavenly thunder impact',(0,-1.5,2),(.24,.52,1),0,1.7,(0,0,0),'POINT',False)
for f,v in [(1,0),(129,0),(136,1600),(140,24000),(144,11000),(154,5000),(170,0)]:key(burst.data,'energy',f,v)
for x in [-4,0,4]:
    o=light('Descending volumetric shaft',(x,1,30),(.3,.6,1),0,.30,(x*.4,0,.8),'SPOT',False);o.data.diffuse_factor=0;o.data.specular_factor=0
    for f,v in [(1,0),(37,0),(77,2500),(119,5000),(138,12000),(154,0)]:key(o.data,'energy',f,v)
inlay=bpy.data.materials['Awakening gold channels'].node_tree.nodes['Principled BSDF'];initial=inlay.inputs['Emission Strength'].default_value
for f,v in [(1,initial),(26,initial),(49,.1),(116,.12),(140,7),(166,.2)]:scalar(inlay.inputs['Emission Strength'],f,v)

# Starting composition exactly matches the existing tails final frame.
shots=[(0,start_cam,start_target,start_lens),(.80,Vector((0,-10,7)),Vector((0,1,3.3)),37),(1.9,Vector((-2,-33,19)),Vector((0,2,14)),34),(3.05,Vector((-1,-37,20)),Vector((0,0,17)),34),(4.15,Vector((1,-34,21)),Vector((0,-1.5,17)),36),(4.64,Vector((-1,-26,22)),Vector((0,-1.5,5.2)),35),(5.15,Vector((-1,-19,16)),Vector((0,-1.5,3)),34),(6,Vector((0,-8,8)),Vector((0,-1.5,2.9)),31)]
def camera_at(t):
    for i in range(len(shots)-1):
        ta,pa,qa,la=shots[i];tb,pb,qb,lb=shots[i+1]
        if ta<=t<=tb:
            u=smooth((t-ta)/(tb-ta));pos=pa.lerp(pb,u);target=qa.lerp(qb,u);lens=la+(lb-la)*u
            if a.portrait:
                mix=smooth(t/.9);pos.x*=1-.4*mix;lens*=1+.28*mix
            return pos,target,lens
    return shots[-1][1:]
for f in range(1,181):
    t=(f-1)/30;pos,target,lens=camera_at(t);amp=.20*math.exp(-(t-4.63)*9) if t>4.63 else 0
    pos+=Vector((math.sin(t*89)*amp,0,math.sin(t*121)*amp*.7));key(cam,'location',f,pos);key(cam,'rotation_euler',f,(target-pos).to_track_quat('-Z','Y').to_euler());key(cam.data,'lens',f,lens);key(cam.data.dof,'focus_distance',f,(target-pos).length)
n=s.node_tree.nodes;l=s.node_tree.links;glare=next(x for x in n if x.type=='GLARE');comp=next(x for x in n if x.type=='COMPOSITE')
for f,v in [(1,-.8),(55,-.55),(90,-.35),(137,-.15),(149,-.2),(180,-.4)]:key(glare,'mix',f,v)
mix=n.new('CompositorNodeMixRGB');mix.blend_type='MIX';mix.inputs[2].default_value=(.002,.005,.014,1);l.new(glare.outputs[0],mix.inputs[1]);l.new(mix.outputs[0],comp.inputs[0])
for f,v in [(1,0),(166,0),(175,.4),(180,1)]:scalar(mix.inputs[0],f,v)
for obj in bpy.data.objects:
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
for fc in cam.data.animation_data.action.fcurves:
    for k in fc.keyframe_points:k.interpolation='LINEAR'
s['cinematic']='wushuang-tails-v1';s['duration_seconds']=6;s['handoff_seconds']=5.3;s['presentation_only']=True
s.frame_set(105);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(out/'wushuang-tails-effect.blend'))
(out/'scene-metadata.json').write_text(json.dumps({'fps':30,'frames':180,'duration':6,'portrait':a.portrait,'handoffSeconds':5.3,'firstFrameMatches':'wushuang-coin/tails frame 390','noGameState':True},indent=2),encoding='utf-8')
if a.save_only:raise SystemExit(0)
if a.preview or a.frames:
    for f in ([int(x) for x in a.frames.split(',')] if a.frames else [1,40,70,105,125,140,155,173]):
        s.frame_set(f);s.render.filepath=str(out/f'key-{f:03d}.png');bpy.ops.render.render(write_still=True)
else:
    (out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.render.render(animation=True)
