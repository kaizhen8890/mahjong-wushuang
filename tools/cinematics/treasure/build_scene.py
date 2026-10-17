"""Treasure Hunter: original offline tomb/coffer film, 192 frames / 6.4 s.
Blender 4.5 LTS. Procedural geometry/materials; no downloaded models or textures.
The coins are theatrical imagery, never game rewards or hidden tile information.
"""
import argparse, math, os, random, sys
import bpy
from mathutils import Vector

p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--preview',action='store_true');p.add_argument('--start',type=int,default=1);p.add_argument('--end',type=int,default=192)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);a.out=os.path.abspath(a.out);os.makedirs(a.out,exist_ok=True)
random.seed(12102026)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=64;s.eevee.use_raytracing=True
s.render.resolution_x,s.render.resolution_y=(1000,1600) if a.portrait else (1600,1000)
s.render.resolution_percentage=100;s.render.fps=30;s.frame_start=a.start;s.frame_end=a.end
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB'
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.022,.029,.045,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.17
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.25

def material(name,color,metal=0,rough=.4,noise=0,emission=0,wood=False):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough;bs.inputs['Coat Weight'].default_value=.18
    if emission:bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emission
    if noise:
        tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=noise;tex.inputs['Detail'].default_value=4;tex.inputs['Roughness'].default_value=.72
        coords=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(.30,2,4) if wood else (1,1,1)
        l.new(coords.outputs['Generated'],mapping.inputs[0]);l.new(mapping.outputs[0],tex.inputs['Vector'])
        ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].color=(*[v*.22 for v in color],1);ramp.color_ramp.elements[1].color=(*color,1)
        l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],bs.inputs['Base Color'])
        bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.23;bump.inputs['Distance'].default_value=.035 if wood else .014
        l.new(tex.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],bs.inputs['Normal'])
    return m

stone=material('Wet carved volcanic stone',(.040,.044,.057),.20,.30,13)
wood=material('Centuries-old lacquered rosewood',(.055,.015,.012),.08,.47,8,wood=True)
wood.node_tree.nodes['Principled BSDF'].inputs['Coat Weight'].default_value=0
wood.node_tree.nodes['Principled BSDF'].inputs['Specular IOR Level'].default_value=.20
iron=material('Pitted gunmetal bindings',(.045,.050,.061),.87,.34,38)
bronze=material('Ancient gilded bronze',(.42,.235,.055),.88,.28,55)
gold=material('Worn bright edge gold',(.82,.53,.18),.88,.22,80)
inside=material('Soot-dark coffer interior',(.018,.013,.009),.1,.65,10)
jade=material('Blackened jade seal',(.017,.047,.033),.45,.22,20)
warm=material('Amber seam light',(1,.35,.042),.25,.25,emission=3)
spark=material('Gold sparks',(1,.62,.20),.3,.25,emission=6)
soft=material('Distant gold dust',(.85,.47,.14),.2,.3,emission=1.5)
wave=material('Single expanding gold shockwave',(1,.48,.09),.1,.3,emission=5)

def key(o,prop,f,value):setattr(o,prop,value);o.keyframe_insert(data_path=prop,frame=f)
def mesh(name,verts,faces,mat):
    d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(mat);return o
def bevel(o,w=.04):
    b=o.modifiers.new('Rounded worn edges','BEVEL');b.width=w;b.segments=3;o.modifiers.new('Weighted metal normals','WEIGHTED_NORMAL');return o
def cube(name,loc,size,mat,b=.035):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
    return bevel(o,b) if b else o
def line(name,points,mat,r=.02):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=3;sp=d.splines.new('POLY');sp.points.add(len(points)-1)
    for v,pt in zip(sp.points,points):v.co=(*pt,1)
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(mat);return o
def torus(name,r,t,loc,mat,rotation=(0,0,0),segments=64):
    bpy.ops.mesh.primitive_torus_add(major_segments=segments,minor_segments=8,major_radius=r,minor_radius=t,location=loc,rotation=rotation);o=bpy.context.object;o.name=name;o.data.materials.append(mat)
    for poly in o.data.polygons:poly.use_smooth=True
    return o
def cylinder(name,r,h,loc,mat,n=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=n,radius=r,depth=h,location=loc);o=bpy.context.object;o.name=name;o.data.materials.append(mat);return bevel(o,.025)
def light(name,loc,color,power,size,target,kind='AREA',shadow=True):
    d=bpy.data.lights.new(name,kind);d.energy=power;d.color=color;d.use_shadow=shadow
    if kind=='AREA':d.shape='DISK';d.size=size
    elif kind=='SPOT':d.spot_size=size;d.spot_blend=.55;d.shadow_soft_size=.06
    else:d.shadow_soft_size=size
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

# A low, weighty stone platform with a real inset compass pattern.
cube('Vault floor',(0,0,-.39),(60,60,.5),stone)
cylinder('Octagonal treasury foundation',4.7,.38,(0,0,-.10),stone,8)
cylinder('Black stone compass',3.97,.18,(0,0,.17),iron,96)
for r in [3.48,3.74,3.9]:torus('Brass floor inlay',r,.017,(0,0,.274),bronze)
for i in range(48):
    ang=i*math.tau/48;o=cube('Engraved compass index',(3.61*math.cos(ang),3.61*math.sin(ang),.277),(.024,.12 if i%4 else .24,.01),gold,.003);o.rotation_euler.z=ang-math.pi/2
for x in [-6.3,6.3]:
    for y in [4,9,14]:
        cube('Vault pier',(x,y,3.8),(1.25,1.4,8.2),stone,.09)
        for z in [.2,.5,6.8]:cube('Pier bronze collar',(x,y,z),(1.31,1.46,.08),bronze,.02)
        for offset in [-.35,0,.35]:cube('Pier cut fluting',(x+offset,y-.71,3.5),(.03,.025,4.8),iron,.008)
for y in [4,9,14]:
    line('Stone vault rib',[(6.3*math.cos(t*math.pi/64),y,3.1+4.6*math.sin(t*math.pi/64)) for t in range(65)],stone,.24)
    line('Vault rib gold hairline',[(6.3*math.cos(t*math.pi/64),y-.25,3.1+4.6*math.sin(t*math.pi/64)) for t in range(65)],bronze,.018)

# A hollow coffer: the light and coins really occupy its interior.
cube('Coffer lower plinth',(0,0,.51),(4.55,2.64,.22),iron,.08)
cube('Gold lower rim',(0,0,.66),(4.48,2.55,.10),bronze)
cube('Interior bottom',(0,0,.80),(4.0,2.08,.18),inside)
for y in [-1.12,1.12]:
    for z in [1.06,1.49,1.91]:cube('Horizontal aged wood plank',(0,y,z),(4.22,.20,.40),wood,.026)
for x in [-2.10,2.10]:cube('End wood panel',(x,0,1.52),(.22,2.15,1.37),wood,.035)
for z in [.83,2.16]:
    for y in [-1.245,1.245]:cube('Long reinforced coffer edge',(0,y,z),(4.52,.11,.11),bronze)
    for x in [-2.20,2.20]:cube('Short reinforced coffer edge',(x,0,z),(.10,2.52,.11),bronze)
for x in [-2.09,-1.10,1.10,2.09]:
    for y in [-1.251,1.251]:
        cube('Iron binding',(x,y,1.49),(.16,.07,1.24),iron,.025)
        for z in [.96,1.23,1.78,2.02]:
            o=cylinder('Gold square rivet',.045,.031,(x,y+(-.052 if y<0 else .052),z),gold,8);o.rotation_euler.x=math.pi/2
for x in [-2.24,2.24]:
    o=torus('Heavy carrying ring',.26,.037,(x,0,1.5),bronze,(0,math.pi/2,0));cube('Handle boss',(x,0,1.66),(.13,.40,.15),iron)
for x in [-1.86,-.78,.78,1.86]:
    for side in [-1,1]:
        pts=[]
        for j in range(43):
            t=j/42;theta=t*math.pi*2.0;r=.17*(1-t*.8);pts.append((x+side*r*math.cos(theta),-1.272,1.49+r*math.sin(theta)))
        line('Gilded front arabesque',pts,bronze,.013)

# Curved barrel lid and bronze endcaps, all rotate around the real rear hinge.
hinge=Vector((0,1.18,2.20));lid=bpy.data.objects.new('Heavy hinged barrel lid',None);s.collection.objects.link(lid);lid.location=hinge
def on_lid(o):o.parent=lid;o.location-=hinge;return o
verts=[];faces=[];N=48
for x in [-2.13,2.13]:
    for j in range(N+1):
        theta=j*math.pi/N;verts.append((x,1.18*math.cos(theta),2.20+.80*math.sin(theta)))
for j in range(N):faces.append((j,j+1,N+2+j,N+1+j))
shell=mesh('Arched rosewood lid',verts,faces,wood);solid=shell.modifiers.new('Solid lid shell','SOLIDIFY');solid.thickness=.12;bevel(shell,.025);on_lid(shell)
for x in [-2.15,2.15]:
    pts=[(x,1.19*math.cos(j*math.pi/N),2.20+.81*math.sin(j*math.pi/N)) for j in range(N+1)]
    cap=mesh('Bronze half-moon endcap',[(x,0,2.20)]+pts,[(0,j+1,j+2) for j in range(N)],bronze);sol=cap.modifiers.new('Endcap thickness','SOLIDIFY');sol.thickness=.045;on_lid(cap)
    on_lid(line('Lid endcap gold beading',pts,gold,.035))
    on_lid(line('Half moon endcap embossed arc',[(x+(.025 if x>0 else -.025),.84*math.cos(j*math.pi/N),2.22+.55*math.sin(j*math.pi/N)) for j in range(N+1)],iron,.025))
for x in [-1.12,1.12]:
    pts=[(x,1.20*math.cos(j*math.pi/N),2.20+.83*math.sin(j*math.pi/N)) for j in range(N+1)]
    on_lid(line('Broad lid iron binding',pts,iron,.09));on_lid(line('Lid fine gold binding edge',[(px-.069,py,pz+.018) for px,py,pz in pts],gold,.017))
for j in [6,15,24,33,42]:
    theta=j*math.pi/N;on_lid(line('Lid wood seam',[(-2.10,1.185*math.cos(theta),2.20+.805*math.sin(theta)),(2.10,1.185*math.cos(theta),2.20+.805*math.sin(theta))],inside,.010))
for y in [-1.21,1.21]:on_lid(cube('Lid long lip',(0,y,2.20),(4.45,.105,.105),gold))
for x in [-1.5,1.5]:
    o=cylinder('Rear hinge barrel',.11,.45,(x,1.27,2.18),bronze,32);o.rotation_euler.y=math.pi/2
for f,angle in [(1,0),(63,0),(76,-.035),(88,-.11),(94,-.22),(103,-1.86),(113,-1.72),(126,-1.80),(192,-1.83)]:key(lid,'rotation_euler',f,(angle,0,0))

# Three concentric rotating lock plates: visible mechanical preparation.
for i,r in enumerate([.55,.40,.25]):
    root=bpy.data.objects.new('Rotating seal lock',None);s.collection.objects.link(root);root.location=(0,-1.33,1.70)
    o=torus('Engraved lock ring',r,.037,(0,0,0),bronze if i%2 else gold,(math.pi/2,0,0));o.parent=root
    for j in range(12):
        ang=j*math.tau/12;o=cube('Lock clockwork tooth',(r*math.cos(ang),-.028,r*math.sin(ang)),(.033,.054,.082),gold,.006);o.rotation_euler.y=math.pi/2-ang;o.parent=root
    for f,angle in [(1,0),(24+i*8,0),(46+i*8,(-1 if i%2 else 1)*math.pi/2),(82,(-1 if i%2 else 1)*math.pi/2),(97,(-1 if i%2 else 1)*math.pi*.85)]:key(root,'rotation_euler',f,(0,angle,0))
    for f,loc,scale in [(1,(0,-1.33,1.7),1),(90,(0,-1.33,1.7),1),(102,((i-1)*.8,-2.2,1.0),1),(112,((i-1)*1.5,-3.2,.3),0)]:key(root,'location',f,loc);key(root,'scale',f,(scale,)*3)
seal=cube('Black jade lock heart',(0,-1.37,1.70),(.29,.10,.29),jade,.04);seal.rotation_euler.y=math.pi/4
for f,v in [(1,1),(91,1),(98,0)]:key(seal,'scale',f,(v,)*3)
for side in [-1,1]:
    line('Thin warm seam',[(side*.36,-1.292,2.20),(side*2.11,-1.292,2.20)],warm,.009)
for i in range(10):
    x=-1.87+i*.416;line('Antique engraved angular sign',[(x-.045,-1.277,1.07),(x,-1.279,1.13),(x+.045,-1.277,1.07),(x,-1.279,1.01)],bronze,.009)

# The sacrificial chains break away before the lid swings clear.
for side in [-1,1]:
    for j in range(25):
        theta=j*math.pi/24;loc=Vector((side*.62,1.23*math.cos(theta),2.23+.85*math.sin(theta)))
        o=torus('Individual broken chain link',.083,.019,loc,iron,(theta,math.pi/2 if j%2 else .15,0),24)
        start=89+(j%4);key(o,'location',1,loc);key(o,'location',start,loc)
        velocity=Vector((side*random.uniform(1.5,3.0),random.uniform(-1.3,1.3),random.uniform(1.3,2.8)))
        for f in [start+6,start+15,start+27]:
            t=(f-start)/30;key(o,'location',f,loc+velocity*t+Vector((0,0,-3*t*t)));key(o,'rotation_euler',f,(theta+t*4,t*3,j*.2+t*4))
        key(o,'scale',start,(1,1,1));key(o,'scale',start+22,(1,1,1));key(o,'scale',start+29,(0,0,0))

# Ancient square-holed coins, shared mesh for both the pile and slow-motion burst.
vs=[];fs=[];N=32
for z in [-.025,.025]:
    for inner in [False,True]:
        for j in range(N):
            ang=j*math.tau/N;r=.047/max(abs(math.cos(ang)),abs(math.sin(ang))) if inner else .155
            vs.append((r*math.cos(ang),r*math.sin(ang),z))
for j in range(N):
    k=(j+1)%N;fs.extend([(j,k,N+k,N+j),(2*N+j,3*N+j,3*N+k,2*N+k),(j,2*N+j,2*N+k,k),(N+j,N+k,3*N+k,3*N+j)])
prototype=mesh('Coin mesh template',vs,fs,gold);bevel(prototype,.005)
bpy.context.view_layer.objects.active=prototype;prototype.select_set(True)
for mod in list(prototype.modifiers):bpy.ops.object.modifier_apply(modifier=mod.name)
coin=prototype.data;bpy.data.objects.remove(prototype,do_unlink=True)
for i in range(100):
    o=bpy.data.objects.new('Hoard coin',coin);s.collection.objects.link(o);o.location=(random.uniform(-1.9,1.9),random.uniform(-.92,.92),random.uniform(1.54,1.98));o.rotation_euler=(random.uniform(-.30,.30),random.uniform(-.30,.30),random.random()*math.tau)
for i in range(42):
    o=bpy.data.objects.new('Released gold coin',coin);s.collection.objects.link(o)
    start=94+random.randint(0,8);origin=Vector((random.uniform(-1.3,1.3),random.uniform(-.6,.6),2.15));velocity=Vector((random.uniform(-1.5,1.5),random.uniform(-.65,1.1),random.uniform(3.3,5.3)))
    key(o,'scale',1,(0,0,0));key(o,'scale',start,(0,0,0));key(o,'scale',start+2,(1,1,1))
    for f in [start,start+14,start+34,start+62,start+85]:
        t=(f-start)/30*.70;key(o,'location',f,origin+velocity*t+Vector((0,0,-1.75*t*t)));key(o,'rotation_euler',f,(i*.29+t*3,i*.36+t*2,i*.13+t))
    key(o,'scale',170,(1,1,1));key(o,'scale',191,(0,0,0))

bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);speck=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True)
for i in range(270):
    d=speck.copy();d.materials.append(spark if i<190 else soft);o=bpy.data.objects.new('Vault gold mote',d);s.collection.objects.link(o)
    theta=random.random()*math.tau;sz=random.uniform(.009,.030) if i<190 else random.uniform(.006,.016)
    if i<190:
        start=94+random.randint(0,9);origin=Vector((random.uniform(-1.6,1.6),random.uniform(-.6,.5),2.2));v=Vector((math.cos(theta)*random.uniform(.5,3),math.sin(theta)*random.uniform(.5,2),random.uniform(.8,6.0)))
        key(o,'scale',1,(0,0,0));key(o,'scale',start,(0,0,0));key(o,'scale',start+3,(sz,sz,sz*2.4))
        for f in [start,start+12,start+36,start+65,start+90]:
            t=(f-start)/30*.75;key(o,'location',f,origin+v*t+Vector((0,0,-1.5*t*t)))
        key(o,'scale',165,(sz,sz,sz));key(o,'scale',192,(0,0,0))
    else:
        r=random.uniform(2,6);o.scale=(sz,)*3
        for f in [1,64,128,192]:key(o,'location',f,(r*math.cos(theta+f*.0015),r*math.sin(theta+f*.0015),random.uniform(.8,6.8)))
for k in range(3):
    pts=[]
    for j in range(100):
        t=j/99;ang=k*math.tau/3+t*math.tau*.75;r=.8+2*t;pts.append((r*math.cos(ang),r*math.sin(ang),2.1+3.6*t))
    o=line('Fine departing treasure filament',pts,spark,.010)
    for f,v in [(1,0),(95+k*3,0),(131+k*3,1)]:o.data.bevel_factor_end=v;o.data.keyframe_insert(data_path='bevel_factor_end',frame=f)
    for f,v in [(1,0),(112,0),(160,1)]:o.data.bevel_factor_start=v;o.data.keyframe_insert(data_path='bevel_factor_start',frame=f)
shock=torus('Floor pressure ring',1,.027,(0,0,.29),wave)
for f,v in [(1,0),(96,0),(98,.5),(108,4.0),(122,7.5)]:key(shock,'scale',f,(v,v,.6))
for f,v in [(1,0),(97,6),(110,2),(124,0)]:wave.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value=v;wave.node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].keyframe_insert(data_path='default_value',frame=f)
key(shock,'hide_render',1,True);key(shock,'hide_render',96,True);key(shock,'hide_render',97,False);key(shock,'hide_render',124,True)

fog=bpy.data.materials.new('Suspended vault dust');fog.use_nodes=True;fog.node_tree.nodes.clear();v=fog.node_tree.nodes.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=.008;v.inputs['Color'].default_value=(.38,.33,.26,1);v.inputs['Anisotropy'].default_value=.32
out=fog.node_tree.nodes.new('ShaderNodeOutputMaterial');fog.node_tree.links.new(v.outputs['Volume'],out.inputs['Volume']);cube('Vault atmosphere',(0,4,6),(28,32,17),fog,0)
light('Warm worn-metal key',(-4,-6,6),(1,.69,.38),580,4.5,(0,0,1.7))
light('Cold tomb rim',(4,3,7),(.37,.52,.82),2200,3,(0,0,2.3))
light('Vault reflected fill',(0,-5,3),(.60,.69,1),80,4,(0,0,1.6),shadow=False)
for side in [-1,1]:
    for y in [3.8,8.8]:
        cylinder('Offering brazier stem',.13,1.9,(side*4.8,y,.8),bronze,24);cylinder('Offering brazier bowl',.37,.24,(side*4.8,y,1.9),iron,32)
        flame=cube('Low amber brazier',(side*4.8,y,2.04),(.40,.40,.035),warm,.02)
        light('Warm burial torch',(side*4.8,y,2.35),(1,.26,.045),130,.3,(0,0,1),'POINT',False)
glow=light('Light within the coffer',(0,-.3,2.10),(1,.53,.12),0,.8,(0,0,4),'POINT',False)
for f,power in [(1,2),(30,8),(56,25),(83,90),(94,240),(100,2100),(108,780),(165,500),(192,270)]:glow.data.energy=power;glow.data.keyframe_insert(data_path='energy',frame=f)
for i in [-1,0,1]:
    beam=light('Volumetric treasure shaft',(i*.65,.10,2.06),(1,.61,.22),0,.48,(i*1.4,.40,8),'SPOT',False)
    beam.data.diffuse_factor=0;beam.data.specular_factor=0
    for f,power in [(1,0),(87,0),(96,500),(102,6500),(116,3400),(165,2600),(192,900)]:beam.data.energy=power;beam.data.keyframe_insert(data_path='energy',frame=f)
# Sculpted dusty light volumes extend the physical spotlights into a readable fan.
shaft=bpy.data.materials.new('Gold-lit suspended treasure dust');shaft.use_nodes=True;shaft.node_tree.nodes.clear();nodes=shaft.node_tree.nodes;links=shaft.node_tree.links
v=nodes.new('ShaderNodeVolumePrincipled');v.inputs['Color'].default_value=(1,.62,.22,1);v.inputs['Density'].default_value=.018;v.inputs['Anisotropy'].default_value=.22;v.inputs['Emission Color'].default_value=(1,.49,.10,1)
noise=nodes.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=5;mult=nodes.new('ShaderNodeMath');mult.operation='MULTIPLY';mult.inputs[1].default_value=.024;links.new(noise.outputs['Fac'],mult.inputs[0]);links.new(mult.outputs[0],v.inputs['Density'])
out=nodes.new('ShaderNodeOutputMaterial');links.new(v.outputs['Volume'],out.inputs['Volume'])
for f,value in [(1,0),(91,0),(100,.22),(112,.12),(163,.08),(192,.015)]:v.inputs['Emission Strength'].default_value=value;v.inputs['Emission Strength'].keyframe_insert(data_path='default_value',frame=f)
for i in [-2,-1,0,1,2]:
    origin=Vector((i*.39,-.32,2.16));end=Vector((i*1.25,-1.05,7.5));direction=end-origin
    bpy.ops.mesh.primitive_cone_add(vertices=40,radius1=.035,radius2=.30 if i%2 else .43,depth=direction.length,location=origin+direction/2)
    o=bpy.context.object;o.name='Dusty gold light shaft';o.rotation_euler=direction.to_track_quat('Z','Y').to_euler();o.data.materials.append(shaft)
    for f,value in [(1,0),(91,0),(99,1),(155,1),(192,.40)]:key(o,'scale',f,(value,value,1))
flash=light('Lid release impact',(0,-1,3.2),(1,.73,.38),0,3,(0,0,1.5),shadow=False)
for f,power in [(1,0),(96,0),(99,1500),(104,320),(115,0)]:flash.data.energy=power;flash.data.keyframe_insert(data_path='energy',frame=f)

bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Coffer cinematic camera';s.camera=cam;cam.data.lens=48;cam.data.sensor_fit='HORIZONTAL';cam.data.clip_end=100
cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=5.6
for f,lens in [(1,48),(30,46),(66,44 if a.portrait else 40),(96,43 if a.portrait else 38),(192,43 if a.portrait else 38)]:cam.data.lens=lens;cam.data.keyframe_insert(data_path='lens',frame=f)
shots=[(1,(.85,-6.4,2.95),(0,-.75,1.80)),(30,(1.65,-7.15,3.30),(0,-.3,1.9)),(66,(3.7,-9.0,4.2),(0,0,2.0)),(92,(4.3,-9.5,4.9),(0,0,2.45)),(99,(4.0,-9.0,4.9),(0,0,2.7)),(103,(4.5,-10.0,5.20),(0,0,2.65)),(126,(2.3,-9.6,4.8),(0,0,2.8)),(160,(-1.6,-9.3,4.45),(0,0,2.75)),(192,(-3.1,-9.1,4.15),(0,0,2.65))]
for f,pos,target in shots:
    if a.portrait:pos=(pos[0]*.64,pos[1]*.91,pos[2]+.25)
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(Vector(target)-Vector(pos)).to_track_quat('-Z','Y').to_euler());cam.data.dof.focus_distance=(Vector(target)-Vector(pos)).length;cam.data.keyframe_insert(data_path='dof.focus_distance',frame=f)
s.use_nodes=True;n=s.node_tree.nodes;n.clear();l=s.node_tree.links;rl=n.new('CompositorNodeRLayers');glare=n.new('CompositorNodeGlare');glare.glare_type='FOG_GLOW';glare.quality='MEDIUM';glare.threshold=1.5;glare.mix=-.76;l.new(rl.outputs['Image'],glare.inputs[0]);out=n.new('CompositorNodeComposite');l.new(glare.outputs[0],out.inputs[0])
s.frame_set(138);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out,'treasure-hunter.blend'))
if a.preview:
    for f in [18,79,103,148]:s.frame_set(f);s.render.filepath=os.path.join(a.out,f'key-{f:03d}.png');bpy.ops.render.render(write_still=True)
else:
    os.makedirs(os.path.join(a.out,'frames'),exist_ok=True);s.render.filepath=os.path.join(a.out,'frames/frame-');bpy.ops.render.render(animation=True)
