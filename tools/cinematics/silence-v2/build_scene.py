"""Silence v2: heavy gate, fractured pressure waves, an intact silent seal.
Original procedural upgrade. Blender 4.5, 192 frames at 30 fps.
This builds a new scene in memory and saves only into --out.
"""
import bpy, math, random, sys, argparse, json
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi

p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--orientation',default='landscape',choices=['landscape','portrait']);p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=48)
a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True)
random.seed(20261004);bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=a.samples;s.eevee.use_raytracing=True;s.eevee.volumetric_tile_size='8';s.eevee.volumetric_samples=32
s.render.resolution_x,s.render.resolution_y=(1600,1000) if a.orientation=='landscape' else (1000,1600)
s.render.resolution_percentage=a.scale;s.render.fps=30;s.frame_start=1;s.frame_end=192;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=15
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.035,.055,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.14
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.85

def ease(t):
 t=max(0,min(1,t));return t*t*(3-2*t)
def lerp(x,y,t):return x+(y-x)*t
def key(o,prop,f,v):setattr(o,prop,v);o.keyframe_insert(data_path=prop,frame=f)
def scalar(socket,f,v):socket.default_value=v;socket.keyframe_insert(data_path='default_value',frame=f)
def empty(name):
 o=bpy.data.objects.new(name,None);s.collection.objects.link(o);return o
def material(name,color,metal=0,rough=.5,noise=False):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough
 if noise:
  tc=n.new('ShaderNodeTexCoord');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=2.3;tex.inputs['Detail'].default_value=4;l.new(tc.outputs['Object'],tex.inputs['Vector'])
  ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.22;ramp.color_ramp.elements[0].color=(*[x*.32 for x in color],1);ramp.color_ramp.elements[1].position=.8;ramp.color_ramp.elements[1].color=(*color,1);l.new(tex.outputs['Fac'],ramp.inputs[0]);l.new(ramp.outputs[0],b.inputs['Base Color'])
  fine=n.new('ShaderNodeTexNoise');fine.inputs['Scale'].default_value=65;fine.inputs['Detail'].default_value=2;l.new(tc.outputs['Object'],fine.inputs['Vector']);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24 if metal else .38;bump.inputs['Distance'].default_value=.012 if metal else .036;l.new(fine.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],b.inputs['Normal'])
  rr=n.new('ShaderNodeMapRange');rr.inputs['From Min'].default_value=0;rr.inputs['From Max'].default_value=1;rr.inputs['To Min'].default_value=rough*.72;rr.inputs['To Max'].default_value=min(1,rough*1.18);l.new(tex.outputs['Fac'],rr.inputs['Value']);l.new(rr.outputs[0],b.inputs['Roughness'])
 return m
def glowing(name,c,power,metal=.2):
 m=material(name,c,metal,.28);b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=power;return m
def bevel(o,w=.03):
 m=o.modifiers.new('worn rounded edges','BEVEL');m.width=w;m.segments=3;o.modifiers.new('weighted normals','WEIGHTED_NORMAL');return o
def mesh(name,verts,faces,mat,parent=None):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(mat)
 if parent:o.parent=parent
 return o
def cube(name,loc,size,mat,b=.02,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(mat)
 if b:bevel(o,b)
 if parent:o.parent=parent
 return o
def line(name,pts,width,mat,parent=None):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=width;d.bevel_resolution=2;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for v,c in zip(sp.points,pts):v.co=(*c,1)
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(mat)
 if parent:o.parent=parent
 return o
def area(name,loc,color,power,size,target):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
def visible(o,start,end=6.4):
 for f,v in [(1,True),(max(1,round(start*30)+1),False),(min(193,round(end*30)+1),True)]:key(o,'hide_render',f,v)

stone=material('Graphite basalt / dry chipped relief',(.078,.096,.12),.10,.74,True)
dark=material('Obsidian recess',(.019,.026,.037),.20,.52,True)
rim=material('worn basalt bevel',(.19,.215,.24),.2,.48,True)
iron=material('hammered oxidised iron',(.12,.16,.21),.9,.33,True)
silver=material('polished contact silver',(.52,.64,.75),.93,.21,True)
floor=material('limestone floor',(.08,.098,.117),.10,.72,True)
wet=material('wet rail contact surface',(.027,.041,.057),.42,.17,True)
ash=material('fine mineral dust',(.27,.31,.36),0,.87)
cold=glowing('silver rune light',(.37,.66,1),1.8)
waveedge=glowing('pressure stress silver violet',(.40,.66,.92),.62,.35)
glass=material('pressure surface / bent optical sheet',(.18,.29,.40),.03,.10)
bs=glass.node_tree.nodes.get('Principled BSDF');bs.inputs['Transmission Weight'].default_value=.83;bs.inputs['IOR'].default_value=1.18;bs.inputs['Coat Weight'].default_value=.8;bs.inputs['Coat Roughness'].default_value=.12
bs.inputs['Alpha'].default_value=.44
glass.surface_render_method='DITHERED';glass.use_raytrace_refraction=True
bs.inputs['Emission Color'].default_value=(.21,.43,.72,1)
for t,v in [(0,0),(4.52,0),(4.65,.9),(4.7,0),(6.4,0)]:scalar(bs.inputs['Emission Strength'],round(t*30)+1,v)
airglow=glowing('microscopic silver motes',(.48,.70,.95),.9)

# Set: converging architecture, recessed wall planes and local worn surfaces.
cube('foundation',(0,2,-.34),(38,42,.5),dark,0)
for row in range(10):
 for col in range(-6,7):
  tile=cube('individual floor stone',(col*1.45+(row%2)*.72,-11+row*1.7,-.09+random.uniform(-.018,.018)),(1.42,1.67,.20),floor,.024)
  tile.rotation_euler.z=random.uniform(-.004,.004)
for side in [-1,1]:
 for x,z,w,h in [(5.10,4.55,1.12,9.1),(5.70,4.70,.46,9.4),(6.2,4.55,.34,9.1)]:
  cube('stepped gate jamb',(side*x,.25,z),(w,2.7,h),stone,.065)
  cube('jamb polished inner edge',(side*(x-w/2),-1.15,z),(.055,.1,h-.15),iron,.012)
 for z in [.35,1.8,6.7,8.8]:
  cube('massive forged collar',(side*5.08,.25,z),(1.4,2.93,.19),iron,.035)
  cube('collar highlight',(side*5.08,-1.235,z+.036),(1.34,.07,.038),silver,.007)
 for depth in [-2,5,10,16]:
  cube('distant chamber buttress',(side*(7.6+depth*.09),depth,5),(1.8,1.7,10),stone,.1)
  cube('receding narrow light cut',(side*(6.62+depth*.09),depth-.9,5),(.065,.09,8.5),cold,.012)
 cube('enclosing chamber wall',(side*10,5,5),(1,37,10),dark,.08)
cube('great lintel',(0,.15,9.16),(11.5,3.0,.72),stone,.13)
cube('lintel silver line',(0,-1.4,8.86),(10.8,.07,.06),iron,.014)
cube('distant darkness',(0,16,6),(20,1,13),dark,0)
for y in [-.97,-.45]:
 cube('rail trench',(0,y,.04),(11,.23,.1),dark,.005)
 cube('rail silver wear',(0,y,.10),(11,.095,.07),silver,.01)
for i in range(110):
 x=random.uniform(-5.5,5.5);y=random.uniform(-1.5,.35)
 line('directional ground abrasion',[(x,y,.03),(x+random.uniform(.07,.6),y,.03)],random.uniform(.0015,.004),wet)
for i in range(65):
 x=random.uniform(-5.4,5.4);y=random.uniform(-1.75,-.75)
 cube('rail grit',(x,y,.13),(random.uniform(.017,.10),random.uniform(.012,.06),random.uniform(.016,.07)),rim,.004)

doors=[]
for side in [-1,1]:
 root=empty('LEFT giant door' if side<0 else 'RIGHT giant door');doors.append(root)
 cube('thick basalt slab',(side*2.15,.28,4.40),(4.3,1.45,8.55),stone,.11,root)
 cube('front recessed field',(side*2.17,-.485,4.45),(3.64,.15,7.67),dark,.048,root)
 for row,z in enumerate([1.57,4.41,7.25]):
  o=cube('large bevelled stone panel',(side*2.22,-.60,z),(3.27,.31,2.56),stone,.105,root)
  cube('upper silver rim',(side*2.22,-.773,z+1.15),(3.03,.055,.048),iron,.01,root)
  # Nested broken chevrons give the gate a seal identity rather than household panels.
  for offset in [0,.20]:
   pts=[(side*(.91+offset),-.786,z+.55),(side*1.45,-.79,z+.08),(side*3.4,-.79,z-.57-offset)]
   line('deep cut diagonal seal groove',pts,.036,dark,root)
   line('worn silver edge of groove',[(x,y-.012,zz-.024) for x,y,zz in pts],.009,iron,root)
 for x in [.26,4.06]:
  cube('iron vertical spine',(side*x,-.69,4.40),(.18,.26,8.12),iron,.034,root)
  cube('spine edge shine',(side*(x+.047),-.841,4.40),(.021,.036,7.94),silver,.005,root)
 for z in [.56,3.02,5.80,8.2]:
  cube('deep forged cross brace',(side*2.15,-.81,z),(4.14,.29,.22),iron,.043,root)
  for x in [.43,1.25,3.13,3.91]:
   bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,radius=.07,location=(side*x,-.99,z));o=bpy.context.object;o.name='forged countersunk rivet';o.scale=(1,.45,1);o.data.materials.append(silver);o.parent=root
 cube('interlocking lock mass',(side*.49,-.99,4.4),(.94,.55,1.69),iron,.11,root)
 cube('polished lock crest',(side*.30,-1.295,4.4),(.47,.12,1.34),silver,.055,root)
 # Partial polygonal seal is physically attached to the two halves.
 points=[]
 for j in range(7):
  angle=-pi/2+j*pi/6
  points.append((side*(.20+1.04*cos(angle)),-.945,4.4+1.65*sin(angle)))
 line('split gate seal recess',points,.047,dark,root)
 line('split gate seal metallic bevel',[(x,y-.037,z) for x,y,z in points],.016,silver,root)
 for i in range(50):
  x=side*random.uniform(.6,3.9);z=random.uniform(.4,8.45);length=random.uniform(.05,.25)
  line('irregular stone damage',[(x,-.774,z),(x+side*.015,-.781,z+length*.52),(x-side*.04,-.778,z+length)],random.uniform(.0015,.005),dark,root)
 for i in range(18):
  # Three-dimensional chips on the inside edge catch light as it narrows.
  z=random.uniform(.3,8.5);w=random.uniform(.025,.08)
  mesh('broken basalt edge',[(side*.02,-.49,z),(side*w,-.67,z+.09),(side*.11,-.69,z-.08),(side*.015,-.44,z-.11)],[(0,1,2),(0,2,3),(1,3,2),(0,3,1)],rim,root)

def gap(t):
 knots=[(0,2.7),(.38,2.70),(.75,2.62),(1.30,2.36),(1.50,2.32),(2.2,1.69),(3.0,1.11),(3.34,.99),(4.12,.48),(4.7,0),(6.4,0)]
 for (t0,v0),(t1,v1) in zip(knots,knots[1:]):
  if t<=t1:return lerp(v0,v1,ease((t-t0)/(t1-t0)))
 return 0
for f in range(1,193):
 t=(f-1)/30
 for side,root in zip([-1,1],doors):
  shake=(.008*sin(t*73)+.004*sin(t*41))*max(0,min(1,(t-.5)*3))*(1-ease((t-4.68)/.12))
  key(root,'location',f,(side*gap(t)/2,0,shake))

# Backlit depth: several lit planes and shafts, with darkness between them.
backmat=glowing('depth of the last light',(.20,.32,.52),.16)
cube('distant illuminated portal',(0,7.8,5),(5,.1,11),backmat,.02)
for x in [-1.7,0,1.7]:cube('distant occluding vertical rib',(x,5.2,4.8),(.18,1,10),dark,.035)
back=area('last light in the seam',(0,3.2,5.5),(.62,.76,1),2400,3.5,(0,-8,3))
for f in range(1,193):
 t=(f-1)/30;back.data.energy=2400*(1-ease((t-4.38)/.32));back.data.keyframe_insert(data_path='energy',frame=f)
area('silver grazing key',(-4.7,-4.5,10.5),(.65,.80,1),1500,3.1,(0,0,4.4))
area('narrow warm neutral edge',(6,-1.5,6.5),(.80,.73,.68),850,2.2,(0,-1,4.5))
area('restrained violet rim',(-6,1,4),(.32,.23,.50),1000,2.0,(0,-2,4))
area('camera soft fill',(0,-11,6),(.49,.63,.77),95,7,(0,0,4))
wavekey=area('wave specular strip',(0,-8.5,6.8),(.70,.84,1),1500,2.2,(0,-3.0,4))
for f,e in [(1,1500),(139,1700),(142,350),(193,350)]:wavekey.data.energy=e;wavekey.data.keyframe_insert(data_path='energy',frame=f)
vol=bpy.data.materials.new('sparse cinematic mineral atmosphere');vol.use_nodes=True;n=vol.node_tree.nodes;n.clear();v=n.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=.007;v.inputs['Color'].default_value=(.36,.43,.55,1);v.inputs['Anisotropy'].default_value=.4;o=n.new('ShaderNodeOutputMaterial');vol.node_tree.links.new(v.outputs['Volume'],o.inputs['Volume']);cube('atmosphere volume',(0,1,4.6),(25,31,11),vol,0)

# Sound wave surfaces are pre-fractured sectors. Their geometry is identical
# before/after fracture; pieces separate continuously from their own positions.
wave_records=[]
for layer,(start,hit,breaktime,radius) in enumerate([(2.05,3.36,4.03,2.84),(2.43,3.77,4.36,2.40),(2.83,4.06,4.54,1.98)]):
 root=empty(f'pressure front {layer+1}');wave_records.append(root)
 for f in range(1,193):
  t=(f-1)/30;travel=ease((t-start)/(hit-start));contact=ease((t-hit)/.5)
  key(root,'location',f,(0,lerp(.05,-3.05+layer*.085,travel),4.4))
  sc=lerp(.32,1,travel);key(root,'scale',f,(sc,lerp(1,.35,contact),sc))
 weights=[random.uniform(.38,1.7) for _ in range(39)];total=sum(weights);cursor=0
 for j,weight in enumerate(weights):
  theta=cursor;delta=2*pi*weight/total;cursor+=delta;origin=Vector((radius*cos(theta+delta/2),0,radius*sin(theta+delta/2)*.86))
  verts=[];bent=[]
  for k in range(5):
   th=theta+delta*k/4;irregular=.065*sin(th*7+layer)+.025*sin(th*17)
   for edge_index in [0,1]:
    rr=radius+irregular+(-1 if edge_index==0 else 1)*(.12+.047*sin(th*5+layer))
    xyz=Vector((rr*cos(th),.09*sin(th*3+layer),rr*sin(th)*.86));verts.append(tuple(xyz-origin))
    # Fold in image-visible X/Z as well as depth; it must read from the camera.
    rr2=rr+(.17*sin(th*5+layer)+.09*sin(th*11))
    xyz2=Vector((rr2*cos(th)*1.035,.32*sin(th*6+layer),rr2*sin(th)*.78+.14*sin(th*4)))
    bent.append(tuple(xyz2-origin))
  faces=[(k*2,k*2+1,k*2+3,k*2+2) for k in range(4)]
  carrier=empty(f'wave {layer+1} sector {j:02}');carrier.parent=root;carrier.location=origin
  ob=mesh('continuous curved pressure surface',verts,faces,glass,carrier);ob.shape_key_add(name='propagating');fold=ob.shape_key_add(name='visible pressure folding')
  for point,value in zip(fold.data,bent):point.co=value
  for t,value in [(0,0),(hit-.06,0),(breaktime-.08,1),(6.4,1)]:fold.value=value;fold.keyframe_insert(data_path='value',frame=round(t*30)+1)
  solid=ob.modifiers.new('thin refracting thickness','SOLIDIFY');solid.thickness=.027
  bevel(ob,.006)
  for polygon in ob.data.polygons:polygon.use_smooth=True
  # A thin moving highlight follows the same deformation as the parent surface.
  hverts=[];hbent=[]
  for k in range(5):
   vi,vo=Vector(verts[k*2]),Vector(verts[k*2+1]);bi,bo=Vector(bent[k*2]),Vector(bent[k*2+1])
   hverts.extend([tuple(vo+(vi-vo)*.024),tuple(vo)]);hbent.extend([tuple(bo+(bi-bo)*.024),tuple(bo)])
  highlight=mesh('pressure glint',hverts,faces,waveedge,carrier)
  highlight.shape_key_add(name='propagating');hfold=highlight.shape_key_add(name='folding')
  for point,value in zip(hfold.data,hbent):point.co=value
  # Wireframe highlights topology only along the radial strips, kept very fine.
  # Smooth longitudinal glint only: never show the modelling grid.
  for t,value in [(0,0),(hit-.06,0),(breaktime-.08,1),(6.4,1)]:hfold.value=value;hfold.keyframe_insert(data_path='value',frame=round(t*30)+1)
  split=breaktime+.085*sin(theta*3)+random.uniform(-.025,.025);velocity=Vector((cos(theta)*random.uniform(.35,.8),random.uniform(-.50,-.15),sin(theta)*random.uniform(.25,.60)))
  spin=Vector((random.uniform(-1.7,1.7),random.uniform(-2,2),random.uniform(-2,2)))
  for f in range(1,193):
   t=(f-1)/30;q=max(0,t-split);travel=q if t<4.7 else max(0,4.7-split)+.055*max(0,t-5.12)
   key(carrier,'location',f,origin+velocity*travel+Vector((0,0,-.12*max(0,t-5.18)**2)))
   key(carrier,'rotation_euler',f,spin*travel)
   vanish=1-ease((t-(5.22+.4*(j%7)/6))/.65)
   key(carrier,'scale',f,(max(.001,vanish),)*3)
  visible(ob,start,6.3);visible(highlight,start,5.8)

# Intact silent emblem on the gate: same split chevrons converge at closure.
seal_root=empty('INTACT SILENCE SEAL')
for side in [-1,1]:
 for index in range(3):
  z=3.46+index*.91
  ob=line('quiet chevron seal',[(side*.83,-1.42,z+.26),(side*.30,-1.44,z),(0,-1.46,z+.26)],.014,cold,seal_root)
line('silent central closure',[(0,-1.45,3.25),(0,-1.45,5.62)],.012,cold,seal_root)
for f in range(1,193):
 t=(f-1)/30;scale=ease((t-4.59)/.17);key(seal_root,'scale',f,(max(.001,scale),)*3)
seal_energy=cold.node_tree.nodes.get('Principled BSDF').inputs['Emission Strength']
for t,v in [(0,1.8),(4.6,1.8),(4.7,5),(4.91,.9),(6.4,.6)]:scalar(seal_energy,round(t*30)+1,v)

# Instanced dust: glancing light reveals depth, particles follow directional forces.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);seed=bpy.context.object;grain=seed.data.copy();bpy.data.objects.remove(seed,do_unlink=True);grain.materials.append(ash)
spark=grain.copy();spark.materials.clear();spark.materials.append(airglow)
for i in range(470):
 ob=bpy.data.objects.new('floating mineral' if i<170 else 'directional pressure dust',grain if i%7 else spark);s.collection.objects.link(ob)
 if i<170:
  base=Vector((random.uniform(-6,6),random.uniform(-9,2),random.uniform(.2,9)));size=random.uniform(.003,.012);vel=Vector((random.uniform(-.06,.06),-.035,random.uniform(-.025,.035)));start=0
 elif i<300:
  side=random.choice([-1,1]);base=Vector((random.uniform(-5,5),random.uniform(-1.6,-.8),random.uniform(.07,.23)));size=random.uniform(.009,.027);vel=Vector((side*random.uniform(.3,.9),random.uniform(-.6,-.1),random.uniform(.14,.53)));start=random.uniform(.5,2.6)
 else:
  th=random.uniform(0,2*pi);r=random.uniform(1.5,3.15);base=Vector((r*cos(th),random.uniform(-3.5,-3),4.4+r*sin(th)*.82));size=random.uniform(.003,.016);vel=Vector((cos(th)*random.uniform(.45,1.1),random.uniform(-1.1,-.15),sin(th)*.7));start=random.uniform(3.8,4.65)
 ob.scale=(size,)*3
 for t in sorted(set([0,start, min(4.7,start+.2),4.7,5.15,6.4])):
  elapsed=max(0,min(t,4.7)-start);after=max(0,t-5.15)*.045
  loc=base+vel*(elapsed+after)
  if i>=170:loc.z-=.20*elapsed*elapsed
  key(ob,'location',round(t*30)+1,loc)
  factor=0 if t<start else 1
  if t>5.15 and i>=300:factor=1-ease((t-5.15)/1.2)
  key(ob,'scale',round(t*30)+1,(max(.00001,size*factor),)*3)

# Camera: close rail establishing view -> low three-quarter gate -> readable impact.
d=bpy.data.cameras.new('silence cinema camera');cam=bpy.data.objects.new('CAM '+a.orientation,d);s.collection.objects.link(cam);s.camera=cam;d.clip_end=100;d.lens=40
if a.orientation=='portrait':d.sensor_fit='VERTICAL';d.sensor_height=32;d.lens=40
else:d.sensor_fit='HORIZONTAL';d.sensor_width=36
for f in range(1,193):
 t=(f-1)/30;q=ease((t-.05)/1.85)
 if a.orientation=='landscape':
  loc=Vector((lerp(2.3,1.6,q),lerp(-10.9,-17.7,q),lerp(1.15,5.3,q)));target=Vector((lerp(.35,0,q),-.6,lerp(1.7,4.4,q)))
 else:
  loc=Vector((lerp(1.0,.65,q),lerp(-11.8,-16.7,q),lerp(1.4,4.9,q)));target=Vector((0,-.4,lerp(2.7,4.65,q)))
 push=ease((t-2.05)/2.65);loc.y+=.55*push;loc.x-=.5*push
 impact=max(0,1-abs(t-4.67)/.10);loc+=Vector((.038*sin(t*92),.055*sin(t*83),.035*cos(t*70)))*impact
 key(cam,'location',f,loc);cam.rotation_euler=(target-loc).to_track_quat('-Z','Y').to_euler();cam.keyframe_insert(data_path='rotation_euler',frame=f)

# Gentle optical bloom, preserving dark midtones and silver specular detail.
s.use_nodes=True;tree=s.node_tree;tree.nodes.clear();rl=tree.nodes.new('CompositorNodeRLayers');gl=tree.nodes.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=1.4;gl.mix=-.82;tree.links.new(rl.outputs['Image'],gl.inputs['Image'])
ex=tree.nodes.new('CompositorNodeExposure');tree.links.new(gl.outputs['Image'],ex.inputs['Image']);dest=tree.nodes.new('CompositorNodeComposite');tree.links.new(ex.outputs['Image'],dest.inputs['Image'])
for t,v in [(0,0),(4.5,0),(4.7,-.18),(5.4,-.12),(6.4,-.35)]:scalar(ex.inputs['Exposure'],round(t*30)+1,v)
for name,t in [('GATE STRAIN',.7),('PRESSURE',2.2),('FRACTURE',3.7),('ABSOLUTE SILENCE',4.7),('TITLE',5.5),('RETURN',6.4)]:s.timeline_markers.new(name,frame=round(t*30)+1)
for obj in bpy.data.objects:
 if obj.animation_data and obj.animation_data.action:
  for fc in obj.animation_data.action.fcurves:
   for point in fc.keyframe_points:point.interpolation='CONSTANT' if fc.data_path=='hide_render' else 'LINEAR'
s['version']='silence-v2';s['silenceSeconds']=4.7;s['durationSeconds']=6.4;s['fracture']='same prefractured optical surface pieces, continuous transforms';s.frame_set(1)
bpy.ops.wm.save_as_mainfile(filepath=str(out/f'silence-{a.orientation}.blend'))
(out/f'scene-{a.orientation}.json').write_text(json.dumps({'objects':len(bpy.data.objects),'frames':192,'fps':30,'resolution':[s.render.resolution_x,s.render.resolution_y],'silence':4.7,'scale':a.scale,'samples':a.samples},indent=2))
if a.frames:
 for f in [int(x) for x in a.frames.split(',')]:
  s.frame_set(f+1);s.render.filepath=str(out/f'key-{a.orientation}-{f:03d}.png');bpy.ops.render.render(write_still=True)
