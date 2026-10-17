"""Original offline shrine / destiny coin cinematic. Blender 4.5 LTS.

13 s / 30 fps. The coin is airborne and continuously flipping at t=3..9.5.
Both outcomes are identical until frame 286. A result argument selects an
authored ending; this script is NOT a source of game randomness.
"""
import argparse, math, os, random, sys
from pathlib import Path
import bpy
from mathutils import Vector

p=argparse.ArgumentParser()
p.add_argument('--out',required=True)
p.add_argument('--portrait',action='store_true')
p.add_argument('--result',choices=['heads','tails'],default='heads')
p.add_argument('--preview',action='store_true')
p.add_argument('--frames',default='')
p.add_argument('--start',type=int,default=1)
p.add_argument('--end',type=int,default=390)
p.add_argument('--scale',type=int,default=100)
p.add_argument('--samples',type=int,default=32)
p.add_argument('--save-only',action='store_true')
a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
random.seed(10032026)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT'
s.eevee.taa_render_samples=a.samples;s.eevee.use_raytracing=True
s.eevee.volumetric_tile_size='16';s.eevee.volumetric_samples=32
s.render.resolution_x,s.render.resolution_y=(1000,1600) if a.portrait else (1600,1000)
s.render.resolution_percentage=a.scale;s.render.fps=30
s.frame_start=a.start;s.frame_end=a.end
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.render.image_settings.compression=20
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.055,.11,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.12
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.35

def key(o,prop,f,val):
    setattr(o,prop,val);o.keyframe_insert(data_path=prop,frame=f)
def scalar(socket,f,val):
    socket.default_value=val;socket.keyframe_insert(data_path='default_value',frame=f)
def mat(name,c,metal=0,rough=.4,noise=0,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*c,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
    if emission:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=emission
    if noise:
        tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=noise;tex.inputs['Detail'].default_value=3
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*[v*.40 for v in c],1);ramp.color_ramp.elements[1].color=(*c,1)
        l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],b.inputs['Base Color'])
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.18;bump.inputs['Distance'].default_value=.005
        l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],b.inputs['Normal'])
    return m
def mesh(name,v,f,m):
    d=bpy.data.meshes.new(name);d.from_pydata(v,[],f);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(m);return o
def bevel(o,w=.03):
    b=o.modifiers.new('Hand-finished edges','BEVEL');b.width=w;b.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
def cube(name,loc,size,m,b=.02):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m)
    return bevel(o,b) if b else o
def cyl(name,r,h,loc,m,n=64,r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=n,radius1=r,radius2=r if r2 is None else r2,depth=h,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(m);return bevel(o,.018)
def tor(name,r,t,loc,m,rot=(0,0,0),n=96):
    bpy.ops.mesh.primitive_torus_add(major_segments=n,minor_segments=8,major_radius=r,minor_radius=t,location=loc,rotation=rot)
    o=bpy.context.object;o.name=name;o.data.materials.append(m)
    for f in o.data.polygons:f.use_smooth=True
    return o
def line(name,pts,m,r=.015):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=2
    sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
    for v,pt in zip(sp.points,pts):v.co=(*pt,1)
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(m);return o
def empty(name,loc=(0,0,0)):
    o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.location=loc;return o
def light(name,loc,c,power,size,target,kind='AREA',shadow=True):
    d=bpy.data.lights.new(name,kind);d.energy=power;d.color=c;d.use_shadow=shadow
    if kind=='AREA':d.shape='DISK';d.size=size
    elif kind=='SPOT':d.spot_size=size;d.spot_blend=.7;d.shadow_soft_size=.1
    else:d.shadow_soft_size=size
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

stone=mat('Rain-dark volcanic stone',(.075,.089,.12),.32,.26,21)
wood=mat('Vermilion weathered lacquer',(.28,.024,.011),.22,.30,17)
black=mat('Shakudo black copper',(.026,.035,.048),.82,.29,90)
roofmat=mat('Moonlit ceramic roof',(.032,.071,.10),.6,.30,45)
timber=mat('Dark shrine hinoki',(.058,.029,.012),.12,.42,6)
gold=mat('Antique gold',(.72,.40,.095),.86,.26,100)
goldbright=mat('Raised brushed gold',(.95,.66,.23),.86,.20,130)
silver=mat('Palladium silver',(.58,.72,.84),.90,.24,110)
paper=mat('Warm shide paper',(.7,.66,.48),0,.65,18)
rope=mat('Rice straw rope',(.23,.15,.069),0,.80,24)
amber=mat('Lantern fire',(1,.28,.024),.2,.3,emission=5)
sparkmat=mat('Hot gold particles',(1,.54,.10),.1,.3,emission=8)
moonmat=mat('Clouded moon',(.34,.43,.62),0,.6,noise=9,emission=.65)
blue=mat('Cold silver energy',(.23,.55,1),.1,.3,emission=6)
inlay=mat('Awakening gold channels',(1,.48,.08),.6,.25,emission=.1)

# Wet courtyard and raised stone stage. Fine joints remain visible in grazing light.
cube('Endless courtyard',(0,5,-.42),(140,150,.6),stone,0)
for x in range(-8,9):
    for y in range(-9,18):
        o=cube('Individual rain-polished paving',(x*1.55,y*1.55,-.08+random.uniform(-.012,.012)),(1.50,1.50,.16),stone,.018)
for z,r in [(.10,4.8),(.26,4.45),(.43,4.12)]:cyl('Octagonal sacred plinth',r,.22,(0,0,z),stone,8)
cyl('Inlaid black metal striking surface',3.8,.13,(0,0,.60),black,128)
for r in [1.97,3.28,3.52,3.75]:tor('Fine gilded stage inlay',r,.016,(0,0,.678),gold)
for i in range(48):
    ang=i*math.tau/48;r=3.4
    o=cube('Compass cut brass',(r*math.cos(ang),r*math.sin(ang),.682),(.026,.17 if i%4 else .32,.015),gold,.003);o.rotation_euler.z=ang
for i in range(8):
    ang=i*math.tau/8;line('Sacred radial floor channel',[(r*math.cos(ang),r*math.sin(ang),.69) for r in [3.82,4.1,4.6,5.8,8.0,12]],inlay,.018)
for f,v in [(1,0),(35,.03),(69,1.4),(90,6),(100,.3),(285,.3),(289,9),(313,3),(348,4),(390,2)]:scalar(inlay.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'],f,v)

font_path=Path(__file__).resolve().parents[3]/'public/fonts/Wushuang-Jianghu.ttf'
font=bpy.data.fonts.load(str(font_path))
def text(name,body,loc,size,m,rot=(0,0,0),parent=None):
    d=bpy.data.curves.new(name,'FONT');d.body=body;d.align_x='CENTER';d.align_y='CENTER';d.size=size;d.font=font;d.extrude=.014;d.bevel_depth=.004;d.bevel_resolution=2
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=rot;d.materials.append(m)
    if parent:o.parent=parent
    return o

# Characteristic upswept torii lintels, tapering posts and braided shimenawa.
def torii(y,w,h,detail=True):
    for side in [-1,1]:
        cyl('Torii vermilion pillar',.29*h/6,h,(side*w*.40,y,h/2),wood,32,r2=.24*h/6)
        cyl('Torii black pillar shoe',.32*h/6,.65,(side*w*.40,y,.35),black,32)
        for z in [.70,h*.80]:cyl('Torii gold collar',.315*h/6,.10,(side*w*.40,y,z),gold,32)
        cube('Torii stone footing',(side*w*.4,y,.12),(.9,.9,.24),stone)
    cube('Torii lower tie beam',(0,y,h*.76),(w,.34,.31),wood)
    cube('Torii central vertical tie',(0,y,h*.86),(.32,.39,h*.30),wood)
    for dz,m,thick in [(0,wood,.38),(.27,black,.17),(.38,gold,.035)]:
        vs=[];fs=[]
        for j in range(41):
            x=(j/40-.5)*w*1.22;z=h+dz+.52*(abs(x)/(w*.61))**4
            vs.extend([(x,y-.30,z-thick/2),(x,y+.30,z-thick/2),(x,y+.30,z+thick/2),(x,y-.30,z+thick/2)])
        for j in range(40):
            for k in range(4):fs.append((j*4+k,j*4+(k+1)%4,(j+1)*4+(k+1)%4,(j+1)*4+k))
        bevel(mesh('Swept torii kasagi',vs,fs,m),.025)
    cube('Torii dedication plaque',(0,y-.24,h*.85),(.69,.12,1.0),black)
    text('Torii gilded dedication','无\n双',(0,y-.32,h*.86),.31,goldbright,(math.pi/2,0,0))
    if detail:
        for twist in [0,math.pi]:
            pts=[]
            for j in range(180):
                u=j/179;x=(u-.5)*w*.78;z=h*.70-.65*math.sin(math.pi*u)
                pts.append((x,y-.12+.08*math.sin(u*math.tau*22+twist),z+.08*math.cos(u*math.tau*22+twist)))
            line('Twisted rice-straw shimenawa',pts,rope,.075)
        for i in range(7):
            x=(i-3)*w*.085;z=h*.70-.65*math.sin(math.pi*(.5+x/(w*.78)))
            root=empty('Windblown paper streamer',(x,y-.13,z))
            pts=[(-.09,0,0),(.10,0,-.14),(.0,0,-.32),(.21,0,-.46),(.10,0,-.67)]
            vs=[]
            for xx,yy,zz in pts:vs.extend([(xx-.08,yy,zz),(xx+.08,yy,zz)])
            o=mesh('Folded shide',vs,[(j*2,j*2+1,j*2+3,j*2+2) for j in range(4)],paper);o.parent=root
            for f in range(1,391,12):key(root,'rotation_euler',f,(.1+.19*math.sin(f*.10+i),.12*math.sin(f*.14+i),.06*math.sin(f*.06)))
torii(-15,13,9,True)
torii(9,11,7.1,True)
for side in [-1,1]:
    for y in [17,25,33]:
        before=set(bpy.data.objects);torii(y,5.8,5.1,False)
        for o in set(bpy.data.objects)-before:o.location.x+=side*13

# Honden with broad curved tiled eaves and a steep central ridge.
cube('Shrine foundation',(0,18,.52),(12,8,1.05),stone,.08)
for j in range(6):cube('Approach stone stair',(0,12.9+j*.40,.12+j*.13),(5.2,.50,.26),stone)
cube('Shrine timber sanctuary',(0,18,3.0),(9.7,5.8,4.2),timber)
for x in [-5,-2.5,0,2.5,5]:
    for y in [14.8,21.2]:
        cyl('Shrine lacquer column',.19,4.5,(x,y,3.2),wood,24)
        cyl('Shrine bronze post collar',.22,.24,(x,y,1.24),gold,24)
for y in [14.6,21.4]:
    for z in [1.45,4.2,5.0]:cube('Shrine transverse tie',(0,y,z),(11.2,.24,.22),wood)
for x in [-3.65,3.65]:
    cube('Paper lattice window',(x,15.075,3.1),(1.7,.045,2.6),paper)
    for dx in [-.8,-.4,0,.4,.8]:cube('Window vertical lattice',(x+dx,15.0,3.1),(.055,.07,2.68),black,.004)
    for z in [2.0,2.4,2.8,3.2,3.6,4.0]:cube('Window horizontal lattice',(x,15.0,z),(1.70,.07,.045),black,.004)
for x in [-1.02,1.02]:
    cube('Shrine bronze bound double door',(x,15.015,2.8),(1.95,.1,3.35),wood)
    for dx in [-.88,.88]:cube('Door frame gold',(x+dx,14.94,2.8),(.045,.045,3.3),gold)
    tor('Door sacred ring',.20,.025,(x*.18,14.87,2.8),gold,(math.pi/2,0,0),48)
def roofheight(x,y):return 5.05+3.3*(1-abs(x)/6.8)**.82+.53*(abs(x)/6.8)**9+.20*(abs(y-18)/4.9)**6
vs=[];fs=[];nx=48;ny=20
for i in range(nx+1):
    x=(i/nx-.5)*13.6
    for j in range(ny+1):
        y=18+(j/ny-.5)*9.8;vs.append((x,y,roofheight(x,y)))
for i in range(nx):
    for j in range(ny):k=i*(ny+1)+j;fs.append((k,k+1,k+ny+2,k+ny+1))
mesh('Curved tiled shrine roof',vs,fs,roofmat)
for j in range(43):
    y=13.1+j*9.8/42
    for side in [-1,1]:line('Raised ceramic roof rib',[(side*i*6.8/32,y,roofheight(side*i*6.8/32,y)+.04) for i in range(33)],roofmat,.055)
for y in [13.08,22.92]:
    line('Golden curved gable eave',[(x,y,roofheight(x,y)) for x in [(i/64-.5)*13.6 for i in range(65)]],gold,.08)
    line('Deep lacquered roof fascia',[(x,y,roofheight(x,y)-.14) for x in [(i/64-.5)*13.6 for i in range(65)]],wood,.13)
line('Gilded shrine ridge',[(0,y,8.50+.36*(abs(y-18)/5.3)**5) for y in [12.7+i*10.6/50 for i in range(51)]],gold,.12)
for y in [14,21.8]:
    for side in [-1,1]:line('Chigi crossed roof finial',[(side*-1.1,y,7.95),(side*1.2,y,9.8)],black,.14)
for y in [15,16.5,18,19.5,21]:
    o=cyl('Katsuogi ridge log',.14,1.25,(0,y,8.65),black,24);o.rotation_euler.y=math.pi/2

# Lanterns light in a wave from the approach to the shrine.
for side in [-1,1]:
    for j,y in enumerate([-12,-5,2,9,16,24,32]):
        x=side*(6.5 if y<16 else 8)
        cube('Stone lantern foot',(x,y,.16),(.9,.9,.32),stone)
        cyl('Stone lantern shaft',.20,1.35,(x,y,.95),stone,12)
        cube('Lantern hearth base',(x,y,1.69),(.85,.85,.16),stone)
        cube('Lantern warm interior',(x,y,2.02),(.46,.46,.55),amber)
        for dx in [-.32,.32]:
            for dy in [-.32,.32]:cube('Lantern stone corner',(x+dx,y+dy,2.03),(.12,.12,.62),stone)
        cyl('Lantern pagoda cap',.69,.31,(x,y,2.50),stone,4,r2=.17)
        cyl('Lantern finial',.13,.35,(x,y,2.81),stone,12,r2=.01)
        lamp=light('Amber lantern pool',(x,y,2.12),(1,.36,.075),80,.22,(0,0,0),'POINT',False)
        for f,v in [(1,8),(5+j*6,8),(18+j*6,150),(90,170),(300,160),(390,110)]:key(lamp.data,'energy',f,v)

# Irregular continuous mountain ridges, kept behind several depths of atmosphere.
for ridge in range(3):
    vs=[];fs=[]
    for j in range(101):
        x=(j-50)*1.8;z=9+ridge*2+3.7*math.sin(j*.19+ridge)+2.2*math.sin(j*.53+ridge*3)+random.uniform(-.6,.6)
        vs.extend([(x,48+ridge*8,-4),(x,48+ridge*8,z)])
    for j in range(100):fs.append((j*2,j*2+1,j*2+3,j*2+2))
    mesh('Distant layered mountain silhouette',vs,fs,black)
# Cedar silhouettes made from crooked branches and irregular masses, not cones.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1)
foliage=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);foliage.materials.append(black)
for side in [-1,1]:
    for j in range(9):
        x=side*random.uniform(17,25);y=random.uniform(-5,40);h=random.uniform(9,17)
        cyl('Sacred cedar trunk',.33,h,(x,y,h/2),timber,12,r2=.12)
        for k in range(8):
            ang=k*2.4;z=h-6+k*.7;r=2.7*(1-k*.075)
            end=(x+math.cos(ang)*r,y+math.sin(ang)*r,z+.3)
            line('Crooked cedar branch',[(x,y,z-.3),end],timber,.075)
            o=bpy.data.objects.new('Irregular cedar foliage',foliage);s.collection.objects.link(o);o.location=end;o.scale=(r*.72,r*.47,.65);o.rotation_euler.z=ang
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,radius=4.1,location=(-15,54,27));bpy.context.object.name='Full moon beyond the shrine';bpy.context.object.data.materials.append(moonmat)

# Hero coin: real thickness, milled edge, separate floating relief on both faces.
coin=empty('DESTINY COIN - authoritative ending selected externally')
def oncoin(o,parent=coin):o.parent=parent;return o
oncoin(cyl('Blackened gold coin edge',1.70,.30,(0,0,0),gold,128))
for z in [-.13,.13]:oncoin(tor('Coin raised milled rim',1.62,.065,(0,0,z),goldbright))
for i in range(112):
    ang=i*math.tau/112;o=oncoin(cube('Coin edge milling',(1.702*math.cos(ang),1.702*math.sin(ang),0),(.026,.035,.19),black,.004));o.rotation_euler.z=ang
heads=empty('Gold HEADS relief');heads.parent=coin
tails=empty('Silver TAILS relief');tails.parent=coin;tails.rotation_euler.x=math.pi
for root,m in [(heads,goldbright),(tails,silver)]:
    oncoin(cyl('Recessed coin face',1.55,.045,(0,0,.164),black,128),root)
    for r in [1.43,1.48,1.21]:oncoin(tor('Fine raised face border',r,.015,(0,0,.194),m),root)
    for i in range(64):
        ang=i*math.tau/64;rr=1.34
        o=oncoin(cube('Engraved face sunburst',(rr*math.cos(ang),rr*math.sin(ang),.198),(.013,.10 if i%4 else .15,.016),m,.002),root);o.rotation_euler.z=ang
text('Heads top inscription','麻将',(0,.37,.20),.68,goldbright,parent=heads)
text('Heads bottom inscription','无双',(0,-.37,.20),.68,goldbright,parent=heads)
for side in [-1,1]:
    pts=[]
    for i in range(60):
        t=i/59;ang=t*math.pi*1.75;rr=.15*(1-t*.72)
        pts.append((side*.88+side*rr*math.cos(ang),rr*math.sin(ang),.218))
    oncoin(line('Heads raised auspicious cloud',pts,goldbright,.024),heads)
for i,label in enumerate(['东','南','西','北']):
    ang=i*math.pi/2;root=empty('Four wind crest tile');root.parent=tails;root.location=(.68*math.sin(ang),.68*math.cos(ang),.20);root.rotation_euler.z=-ang
    oncoin(cube('Silver enamel mahjong tile',(0,0,0),(.47,.65,.04),silver,.05),root)
    text('Four winds engraving',label,(0,0,.026),.36,black,parent=root)
oncoin(tor('Tails central quatrefoil',.22,.027,(0,0,.22),silver),tails)
for i in range(4):
    ang=i*math.pi/2;oncoin(tor('Four wind crest petal',.08,.02,(.13*math.cos(ang),.13*math.sin(ang),.22),silver,n=32),tails)

# Fully authored motion. 6.5 continuous seconds in the air; no loop or retiming.
def smooth(u):u=max(0,min(1,u));return u*u*(3-2*u)
def pose(t):
    if t<2:
        return (0,0,1.12+.40*smooth(t/2)),(math.pi*.36,0,.08)
    if t<3:
        u=smooth(t-2);return (0,0,1.52+1.38*u),(math.pi*.36+.40*u,.09*u,.08)
    if t<=9.5:
        u=(t-3)/6.5
        contact=.84+1.70*abs(math.sin(math.pi*.36+.40+math.tau*6.3))
        z=2.9+(contact-2.9)*u+13.8*math.sin(math.pi*u)**.88
        # Faster ascending and descending motion, slower near the apex; always positive spin velocity.
        phase=6.3*u+.30*math.sin(math.tau*u)
        return (.5*math.sin(math.tau*u),.26*math.sin(math.pi*u),z),(math.pi*.36+.40+math.tau*phase,.12*math.sin(math.pi*u),.08+.4*math.sin(math.tau*u))
    # Impact, rebound and rocking. The two branches first differ after the common air sequence.
    end=0 if a.result=='heads' else math.pi
    base=math.pi*.36+.40+math.tau*6.3
    landing=math.tau*7+end
    if t<10.14:
        u=(t-9.5)/.64
        angle=base+(landing-base)*smooth(u)
        z=.84+1.7*abs(math.sin(angle))+.85*math.sin(math.pi*u)
        return (0,0,z),(angle,.08*math.sin(math.pi*u),.08*(1-u))
    u=t-10.14
    wobble=.29*math.exp(-u*2.9)*math.sin(u*22)
    return (0,0,.86+abs(wobble)*1.4),(landing+wobble,wobble*.4,0)
for f in range(1,391):
    loc,rot=pose((f-1)/30);key(coin,'location',f,loc);key(coin,'rotation_euler',f,rot)

# Floating motes and two precisely-timed bursts made of shared geometry.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
proto=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True)
proto.materials.append(sparkmat)
rockproto=proto.copy();rockproto.materials.clear();rockproto.materials.append(stone)
for i in range(420):
    o=bpy.data.objects.new('Ascending ember' if i<200 else 'Impact ember',proto);s.collection.objects.link(o)
    at=(3+random.uniform(-.10,.28)) if i<200 else (9.51+random.uniform(0,.10))
    theta=random.random()*math.tau;sz=random.uniform(.010,.038)
    origin=Vector((random.uniform(-.8,.8),random.uniform(-.8,.8),2.2 if i<200 else .86))
    vel=Vector((math.cos(theta)*random.uniform(2,8),math.sin(theta)*random.uniform(2,8),random.uniform(4,12) if i<200 else random.uniform(1,6)))
    first=round(at*30)+1;key(o,'scale',1,(0,0,0));key(o,'scale',first-1,(0,0,0));key(o,'scale',first,(sz,sz,sz*2.1))
    for d in [0,.2,.5,1,1.5,2.0]:
        loc=origin+vel*d+Vector((0,0,-3.7*d*d));key(o,'location',first+round(d*30),loc)
    key(o,'scale',first+40,(sz*.6,)*3);key(o,'scale',first+60,(0,0,0))
for i in range(85):
    o=bpy.data.objects.new('Airborne stone chip',rockproto);s.collection.objects.link(o)
    theta=random.random()*math.tau;r=random.uniform(1.8,4.0);sz=random.uniform(.04,.16)
    loc=Vector((r*math.cos(theta),r*math.sin(theta),.73));vel=Vector((math.cos(theta)*random.uniform(1,3),math.sin(theta)*random.uniform(1,3),random.uniform(1.5,4)))
    key(o,'scale',1,(0,0,0));key(o,'scale',286,(0,0,0));key(o,'scale',288,(sz,sz*.6,sz*.5))
    for d in [0,.2,.6,1,1.8]:key(o,'location',287+round(d*30),loc+vel*d+Vector((0,0,-3*d*d)));key(o,'rotation_euler',287+round(d*30),(i+d*4,d*6,i*.3))
    key(o,'scale',331,(sz,sz*.6,sz*.5));key(o,'scale',355,(0,0,0))
for i in range(100):
    o=bpy.data.objects.new('Shrine drifting ember',proto);s.collection.objects.link(o);sz=random.uniform(.007,.018);o.scale=(sz,)*3
    x=random.uniform(-9,9);y=random.uniform(-5,15);z=random.uniform(.8,9)
    key(o,'location',1,(x,y,z));key(o,'location',390,(x+2,y+.6,z+2))
for at,z,label in [(3,.74,'Launch pressure wave'),(9.52,.75,'Impact pressure wave')]:
    material=mat(label,(1,.44,.06),.3,.4,emission=5)
    o=tor(label,1,.025,(0,0,z),material)
    first=round(at*30)+1
    key(o,'scale',1,(0,0,0));key(o,'scale',first-1,(0,0,0))
    for d,r in [(0,.6),(.2,3),(.6,8),(1.1,14)]:key(o,'scale',first+round(d*30),(r,r,1))
    for d,v in [(0,8),(.25,5),(.65,1),(1.1,0)]:scalar(material.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'],first+round(d*30),v)
    key(o,'hide_render',1,True);key(o,'hide_render',first-1,True);key(o,'hide_render',first,False);key(o,'hide_render',first+34,True)

# Airborne coin glints and long, curved magical wake ribbons.
for k in range(5):
    pts=[]
    for j in range(160):
        u=j/159;ang=u*math.tau*1.6+k*math.tau/5;r=2.0+.6*math.sin(math.pi*u)
        pts.append((r*math.cos(ang),r*math.sin(ang),2+14*u))
    o=line('Ascending fine metallic wake',pts,sparkmat,.009 if k%2 else .016)
    for f,v in [(1,0),(90+k*2,0),(163+k*2,1)]:key(o.data,'bevel_factor_end',f,v)
    for f,v in [(1,0),(113,0),(202,1)]:key(o.data,'bevel_factor_start',f,v)

# A subtle participating atmosphere, real shadows and large photographic light sources.
fog=bpy.data.materials.new('Moonlit shrine mist');fog.use_nodes=True;fog.node_tree.nodes.clear()
v=fog.node_tree.nodes.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=.0045;v.inputs['Color'].default_value=(.30,.38,.56,1);v.inputs['Anisotropy'].default_value=.35
outnode=fog.node_tree.nodes.new('ShaderNodeOutputMaterial');fog.node_tree.links.new(v.outputs['Volume'],outnode.inputs['Volume'])
cube('Courtyard atmospheric volume',(0,14,10),(85,100,38),fog,0)
light('Moonlight',(-12,9,25),(.42,.60,1),2500,8,(0,0,0))
light('Warm hero key',(-6,-9,10),(1,.63,.28),1050,6,(0,0,3))
light('Cool heroic rim',(6,5,14),(.25,.52,1),2350,5,(0,0,5))
light('Shrine roof blue wash',(0,8,14),(.40,.60,1),1650,8,(0,18,5))
light('Shrine gold threshold',(0,11,5),(1,.39,.09),520,5,(0,18,3))
# Broad moving lights maintain readable specular relief while the coin rises.
hero=light('Coin travelling warm softbox',(-4,-4,7),(1,.78,.48),820,5,(0,0,4))
fill=light('Coin travelling silver softbox',(4,1,7),(.42,.62,1),1050,4,(0,0,4))
for f in range(1,391,3):
    pos,_=pose((f-1)/30);z=pos[2]
    for o,loc in [(hero,(-4,-4,z+4)),(fill,(4,2,z+4))]:
        key(o,'location',f,loc);key(o,'rotation_euler',f,(Vector(pos)-Vector(loc)).to_track_quat('-Z','Y').to_euler())
impact=light('Synchronized impact bloom',(0,0,2),(1,.61,.24),0,3,(0,0,0),'POINT',False)
for f,power in [(1,0),(88,0),(92,3800),(99,450),(115,0),(285,0),(288,6500),(294,1700),(305,0),(333,0),(347,650),(390,420)]:key(impact.data,'energy',f,power)
if a.result=='tails':
    key(impact.data,'color',1,(1,.61,.24));key(impact.data,'color',333,(1,.61,.24));key(impact.data,'color',345,(.27,.58,1))
    color=inlay.node_tree.nodes['Principled BSDF'].inputs['Emission Color']
    scalar(color,1,(1,.48,.08,1));scalar(color,333,(1,.48,.08,1));scalar(color,345,(.18,.49,1,1))

# Sculpted banks of turbulent mist and impact dust, using real volume shading.
def volume(name,c,density,emission=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links
    v=n.new('ShaderNodeVolumePrincipled');v.inputs['Color'].default_value=(*c,1);v.inputs['Anisotropy'].default_value=.30
    v.inputs['Emission Color'].default_value=(*c,1);v.inputs['Emission Strength'].default_value=emission
    tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=4;tex.inputs['Detail'].default_value=3
    ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.35;ramp.color_ramp.elements[0].color=(0,0,0,1);ramp.color_ramp.elements[1].position=.75;ramp.color_ramp.elements[1].color=(density,density,density,1)
    l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],v.inputs['Density']);o=n.new('ShaderNodeOutputMaterial');l.new(v.outputs['Volume'],o.inputs['Volume']);return m
cloud=volume('Layered blue mountain cloud',(.21,.28,.40),.24,.004)
dust=volume('Amber-lit rolling impact dust',(.30,.19,.085),.65,.012)
for i,loc in enumerate([(-13,24,10),(14,29,12),(-9,32,19),(13,36,23),(-21,0,16),(23,6,21)]):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20,ring_count=12,radius=1,location=loc);o=bpy.context.object;o.name='Turbulent night cloud bank';o.data.materials.append(cloud);o.scale=(9,4.5,1.4)
    key(o,'location',1,loc);key(o,'location',390,(loc[0]+3,loc[1],loc[2]+.3))
for i in range(10):
    theta=i*math.tau/10
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1);o=bpy.context.object;o.name='Physical rolling shock dust';o.data.materials.append(dust)
    for f,r,sz in [(1,2,0),(286,2,0),(291,2.8,.6),(302,4.4,1.0),(322,7.5,1.4),(351,11,0)]:
        key(o,'location',f,(r*math.cos(theta),r*math.sin(theta),.72+sz*.35));key(o,'scale',f,(sz*1.7,sz*1.7,max(.001,sz*.70)))
for k in range(3):
    pts=[]
    for j in range(70):
        u=j/69;ang=(u-.5)*math.pi*1.65+k*math.tau/3;r=6.5+.3*math.sin(j*.7)
        pts.append((r*math.cos(ang),r*math.sin(ang),14+2.8*u+random.uniform(-.06,.06)))
    o=line('Sky-splitting silver arc',pts,blue,.017)
    key(o,'scale',1,(0,0,0));key(o,'scale',112+k*4,(0,0,0));key(o,'scale',115+k*4,(1,1,1));key(o,'scale',131+k*4,(0,0,0))

# A deliberately continuous camera. Portrait changes position/lens, never crops a landscape movie.
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Shrine cinema camera';s.camera=cam
cam.data.sensor_fit='HORIZONTAL';cam.data.clip_end=220
cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=7.1
shots=[
 (0,(0,-27,6.0),(0,4,4.6),28),
 (1.2,(1.1,-12.5,3.0),(0,3,3.4),34),
 (2.6,(2.6,-8.8,4.1),(0,0,2.5),43),
 (3.0,(2.8,-9.0,4.4),(0,0,3),42),
 (4.3,(6,-10,11),(0,0,10.5),42),
 (5.5,(12,-17,21),(0,2,13.0),39),
 (6.6,(4,-8,20),(0,0,16.4),49),
 (7.5,(-1.6,-9,16),(0,0,14.5),43),
 (8.7,(-5.6,-10.4,10),(0,0,8.4),40),
 (9.5,(-4.7,-10.8,5.7),(0,0,2.1),40),
 (10.0,(-3,-9.5,6.0),(0,0,1.6),44),
 (11.0,(-.7,-5.0,9.0),(0,0,.84),46),
 (12.1,(0,-3.2,9.25),(0,0,.84),46),
 (13.0,(0,-3.1,9.1),(0,0,.84),46)]
def camera_pose(t):
    for i in range(len(shots)-1):
        ta,pa,qa,la=shots[i];tb,pb,qb,lb=shots[i+1]
        if ta<=t<=tb:
            u=smooth((t-ta)/(tb-ta));return Vector(pa).lerp(Vector(pb),u),Vector(qa).lerp(Vector(qb),u),la+(lb-la)*u
    return Vector(shots[-1][1]),Vector(shots[-1][2]),shots[-1][3]
for f in range(1,391):
    t=(f-1)/30;pos,target,lens=camera_pose(t)
    if a.portrait:
        pos.x*=.66;pos.y*=.93
        lens*=.87+.15*smooth((t-2)/1.5)+.33*smooth((t-10)/1.2)
        if t<2:target.z+=.8
    # The impact has a brief authored tremor that settles before result reading.
    shake=math.exp(-(t-9.55)*8)*.10 if 9.55<t<10.3 else 0
    pos+=Vector((math.sin(t*81)*shake,0,math.cos(t*97)*shake*.5))
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(target-pos).to_track_quat('-Z','Y').to_euler())
    key(cam.data,'lens',f,lens);key(cam.data.dof,'focus_distance',f,(target-pos).length)
s.use_nodes=True;n=s.node_tree.nodes;n.clear();links=s.node_tree.links
render=n.new('CompositorNodeRLayers');glare=n.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.quality='MEDIUM';glare.threshold=2;glare.mix=-.80
links.new(render.outputs['Image'],glare.inputs[0]);comp=n.new('CompositorNodeComposite');links.new(glare.outputs[0],comp.inputs[0])
# Linear dense trajectories avoid Bezier overshoot; scale/effect keys remain eased.
for obj in [coin,cam,cam.data,hero,fill]:
    if obj.animation_data and obj.animation_data.action:
        for fc in obj.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
s['cinematic']='wushuang-coin-v1';s['result']=a.result;s['airborne_seconds']=6.5;s['duration_seconds']=13.0
s.frame_set(365)
bpy.ops.wm.save_as_mainfile(filepath=str(out/f'wushuang-coin-{a.result}.blend'))
if a.save_only:sys.exit(0)
if a.preview or a.frames:
    frames=[int(x) for x in a.frames.split(',')] if a.frames else [35,79,144,199,270,292,365]
    for f in frames:
        s.frame_set(f);s.render.filepath=str(out/f'key-{f:03d}.png');bpy.ops.render.render(write_still=True)
else:
    (out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.render.render(animation=True)
