"""Heaven's Cleaver 1.0.0. Original offline 3D scene, two coin-result endings.
No player state, random outcome or game mechanics are evaluated here.
"""
import bpy,math,random,argparse,sys,json,shutil
from pathlib import Path
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--ending',choices=['heads','tails'],default='heads');p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=40);p.add_argument('--save-only',action='store_true');p.add_argument('--reuse-common',default='');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);rng=random.Random(44003)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1000 if a.portrait else 1600;s.render.resolution_y=1600 if a.portrait else 1000;s.render.resolution_percentage=a.scale;s.render.fps=30;s.frame_start=1;s.frame_end=330;s.eevee.taa_render_samples=a.samples;s.eevee.use_raytracing=True;s.eevee.volumetric_samples=16;s.eevee.volumetric_tile_size='16';s.eevee.shadow_pool_size='1024';s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=15;s.render.use_motion_blur=True;s.render.motion_blur_shutter=.18
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.15;s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.045,.052,.07,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
def sat(x):return max(0,min(1,x))
def smooth(x):x=sat(x);return x*x*(3-2*x)
def fast(x):return 1-(1-sat(x))**4
def key(o,k,f,v):setattr(o,k,v);o.keyframe_insert(data_path=k,frame=f)
def empty(name,parent=None):
 o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.parent=parent;return o
def mesh(name,vs,fs,materials,parent=None):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.parent=parent
 for m in materials:d.materials.append(m)
 for f in d.polygons:f.material_index=f.index%len(materials)
 return o
def mat(name,col,metal=0,rough=.4,emit=0):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;b.inputs['Coat Weight'].default_value=.2;b.inputs['Emission Color'].default_value=(*col,1);b.inputs['Emission Strength'].default_value=emit;return m
def cube(name,loc,size,m,parent=None,bevel=.03):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.parent=parent;o.data.materials.append(m)
 if bevel:b=o.modifiers.new('Hard machined bevel','BEVEL');b.width=bevel;b.segments=3
 return o
def line(name,pts,m,width=.015,parent=None):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=width;d.bevel_resolution=1;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for v,pt in zip(sp.points,pts):v.co=(*pt,1)
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(m);o.parent=parent;return o
def pulse(o,events):
 for f,v in events:key(o,'scale',f,(v,)*3)
def light(name,loc,col,power,size,target=(0,0,3)):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o
steel=mat('Forged charcoal steel',(.22,.25,.29),.92,.28);silver=mat('Honed silver cutting bevel',(.65,.72,.81),.94,.17);black=mat('Blackened iron',(.015,.021,.028),.8,.32);wood=mat('Dark red hardwood handle',(.06,.014,.009),.15,.42);brass=mat('Worn brass rivets',(.47,.27,.07),.87,.24)
red=mat('Vermilion cutting energy',(.95,.008,.002),.2,.18,5);cyan=mat('Glacial blue cutting energy',(.018,.38,1),.2,.18,5);white=mat('White hot fracture core',(.85,.90,1),.1,.2,7);ember=mat('Gold steel sparks',(1,.28,.025),.4,.2,4)
rock=mat('Wet charcoal basalt',(.024,.028,.036),.33,.48);rocklit=mat('Basalt fresh broken face',(.08,.085,.10),.34,.37)
for m in [steel,silver,black,wood,rock,rocklit]:
 n=m.node_tree.nodes;l=m.node_tree.links;b=n.get('Principled BSDF');coord=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY';mapping.inputs[1].default_value=(3,60,2) if m in [steel,silver] else (2,3,20);l.new(coord.outputs['Generated'],mapping.inputs[0]);noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=7;noise.inputs['Detail'].default_value=3;l.new(mapping.outputs[0],noise.inputs[0]);bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.20;bump.inputs['Distance'].default_value=.022 if m in [steel,silver] else .06;l.new(noise.outputs['Fac'],bump.inputs['Height']);l.new(bump.outputs[0],b.inputs['Normal'])
light('Long silver softbox',(-3,-9,11),(.82,.9,1),4800,8);light('Red forge rim',(-10,3,5),(1,.025,.008),5500,7);light('Blue forge rim',(10,2,7),(.03,.38,1),6500,7);light('Cutting bevel fill',(1,-6,-.5),(.7,.85,1),2100,5)
# Procedural storm sky with broad, torn cloud strata.
sky=mat('Torn ink storm sky',(.02,.024,.035),0,1,1);n=sky.node_tree.nodes;l=sky.node_tree.links;b=n.get('Principled BSDF');tc=n.new('ShaderNodeTexCoord');scale=n.new('ShaderNodeVectorMath');scale.operation='MULTIPLY';scale.inputs[1].default_value=(3,.2,8);l.new(tc.outputs['Generated'],scale.inputs[0]);noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=2.4;noise.inputs['Detail'].default_value=5;l.new(scale.outputs[0],noise.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.3;r.color_ramp.elements[0].color=(.001,.002,.004,1);r.color_ramp.elements[1].position=.77;r.color_ramp.elements[1].color=(.23,.26,.30,1);r.color_ramp.elements.new(.55).color=(.018,.024,.037,1);l.new(noise.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],b.inputs['Base Color']);l.new(r.outputs[0],b.inputs['Emission Color']);back=cube('Distant storm sky',(0,46,17),(170,.1,120),sky,bevel=0)
b.inputs['Specular IOR Level'].default_value=0;b.inputs['Coat Weight'].default_value=0
for f in [1,330]:key(back,'location',f,((f-1)*.018,46,17))
terrain=[]
for side in [-1,1]:
 g=empty('Split rock continent '+str(side));terrain.append(g);vs=[];fs=[]
 for iy in range(31):
  for ix in range(17):
   x=side*(.15+ix*2.6);y=-16+iy*2.6;z=-2.0+rng.uniform(-.16,.16);vs.append((x,y,z))
 for iy in range(30):
  for ix in range(16):q=iy*17+ix;fs.extend([(q,q+1,q+18),(q,q+18,q+17)])
 mesh('Cracked basalt plain',vs,fs,[rock],g)
 for f in range(1,331,3):
  t=(f-1)/30;split=fast((t-6.16)/1.0);key(g,'location',f,(side*split*2.5,0,-split*.55));key(g,'rotation_euler',f,(0,side*split*.04,0))
 for j in range(20):
  x=side*rng.uniform(2,30);y=rng.uniform(5,43);bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=1,location=(x,y,-1));o=bpy.context.object;o.name='Jagged black mountain';o.parent=g;o.scale=(rng.uniform(1,3),rng.uniform(1,4),rng.uniform(1,7));o.data.materials.append(rock)
  for v in o.data.vertices:v.co*=rng.uniform(.82,1.18)
 for j in range(24):
  x=side*rng.uniform(.2,23);y=rng.uniform(-10,32);pts=[(x+math.sin(k*2+j)*.3,y+k*.4,-1.82) for k in range(9)];o=line('Ground fault light',pts,red if side<0 else cyan,.017,g);pulse(o,[(1,0),(85,0),(125,1),(240,1),(285,0)])
# Hero: broad rectangular cleaver, visible thickness, machined hole, hardwood, three rivets.
hero=empty('Hero cleaver choreography');blade=cube('Broad rectangular forged cleaver',(-.1,0,.2),(5.8,.40,3.25),steel,hero,.13)
bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.18,depth=1,location=(2.05,0,1.26),rotation=(math.pi/2,0,0));hole=bpy.context.object
mod=blade.modifiers.new('Real hanging hole','BOOLEAN');mod.operation='DIFFERENCE';mod.object=hole;bpy.context.view_layer.objects.active=blade;bpy.ops.object.modifier_apply(modifier=mod.name);bpy.data.objects.remove(hole,do_unlink=True)
vs=[(-2.96,-.205,-.96),(2.70,-.205,-.96),(2.63,-.028,-1.46),(-2.95,-.028,-1.40),(-2.96,.205,-.96),(2.70,.205,-.96),(2.63,.028,-1.46),(-2.95,.028,-1.40)];mesh('Full width razor ground bevel',vs,[(0,1,2,3),(4,7,6,5),(3,2,6,7)],[silver],hero)
line('Razor edge highlight',[(-2.96,-.035,-1.4),(-1,-.035,-1.42),(1,-.035,-1.44),(2.63,-.035,-1.46)],silver,.018,hero)
cube('Full tang grip',(-4.35,0,.77),(3.15,.43,.58),black,hero,.12);cube('Front hardwood scale',(-4.43,-.27,.78),(2.88,.22,.66),wood,hero,.13);cube('Back hardwood scale',(-4.43,.27,.78),(2.88,.22,.66),wood,hero,.13)
for x in [-5.4,-4.42,-3.45]:
 for side in [-1,1]:
  bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=(x,side*.397,.78));o=bpy.context.object;o.name='Brass handle rivet';o.scale=(.10,.035,.10);o.parent=hero;o.data.materials.append(brass)
cube('Steel bolster',(-2.99,0,.77),(.18,.62,.80),silver,hero,.045);cube('Iron grip end cap',(-5.91,0,.78),(.17,.60,.65),black,hero,.05)
for i in range(80):
 x=rng.uniform(-2.7,2.5);z=rng.uniform(-.7,1.5);length=rng.uniform(.04,.3);line('Fine directional steel wear',[(x,-.211,z),(x+length,-.214,z+.018)],silver if i%4==0 else black,.0025,hero)
for f in range(1,331):
 t=(f-1)/30;angle=-.13-.52*smooth((t-2.8)/1.45);z=3+1.0*smooth((t-2.8)/1.45);x=0;y=0
 if 4.44<=t<5.04:
  q=fast((t-4.44)/.18);recover=smooth((t-4.75)/.29);angle=-.65+2.75*q-3.45*recover;z=4-1.8*q+1.6*recover;x=-.5*q
 elif 5.04<=t<5.78:
  q=fast((t-5.18)/.16);recover=smooth((t-5.44)/.34);angle=-1.35+3.1*q-.35*recover;z=3.8-.9*q+.2*recover;x=-.5+q
 elif 5.78<=t<6.63:
  q=fast((t-5.94)/.19);recover=smooth((t-6.29)/.34);angle=1.4-3.95*q+2.25*recover;z=3.1+.9*recover;x=.5-.5*recover;y=-4*q*(1-recover)
 elif t>=6.63:angle=-.30+.035*math.sin(t*2);z=4
 ending=smooth((t-7.75)/.5);late=smooth((t-9.35)/.3);z+=ending*(4.8 if a.portrait else 3.1);sc=1-.38*ending+.12*late
 key(hero,'location',f,(x,y,z));key(hero,'rotation_euler',f,(.08+.10*math.sin(t*1.3),angle+(-.48 if a.portrait else 0),.04*math.sin(t*1.8)));key(hero,'scale',f,(sc,)*3)
# Coherent helical storm currents with short angular electrical branches.
for side,m in [(-1,red),(1,cyan)]:
 for j in range(28):
  pts=[];phase=j*2.3999;radius=3+(j%7)*.6
  for k in range(81):
   u=k/80;th=phase+u*math.tau*1.35;r=(1-u)*radius+1.1;x=side*(27*(1-u)+.18*math.sin(k*1.7+j));y=4+r*math.cos(th);z=3+r*math.sin(th)+.12*math.sin(k*2+j);pts.append((x,y,z))
  o=line('Jagged red blue storm vein',pts,m,.012+(j%5)*.008)
  for f in range(1,331,3):
   t=(f-1)/30;on=fast((t-1.2-j*.022)/.9)*(1-smooth((t-8.7)/.7));q=(.70+.30*math.sin(t*17+j*2)) if t>4.4 else 1;key(o,'scale',f,(on*q,)*3);key(o,'location',f,(0,.14*math.sin(t*6+j),.18*math.cos(t*9+j)))
  o.data.bevel_factor_end=0;o.data.keyframe_insert('bevel_factor_end',frame=32+j);o.data.bevel_factor_end=1;o.data.keyframe_insert('bevel_factor_end',frame=80+j)
  for k in [15,37,58]:
   pt=Vector(pts[k]);fork=[pt,pt+Vector((side*.55,.18,.25)),pt+Vector((side*.75,-.1,.58)),pt+Vector((side*1.4,.35,.70))];branch=line('Short forked lightning',fork,m,.01,o)
 # Broad translucent-looking layered energy sheets create continuous flowing volume.
 for j in range(9):
  vs=[];fs=[];phase=j*math.tau/9
  for k in range(81):
   u=k/80;th=phase+u*math.tau*1.3;r=(1-u)*3.2+1.15;x=side*26*(1-u);width=.10*math.sin(math.pi*u)
   for q in [-1,1]:vs.append((x,4+(r+q*width)*math.cos(th),3+(r+q*width)*math.sin(th)))
  for k in range(80):q=k*2;fs.append((q,q+1,q+3,q+2))
  ob=mesh('Torsioned red blue cutting wake',vs,fs,[m]);pulse(ob,[(1,0),(52+j,0),(100+j,1),(240,1),(285,0)])
# Suspended rubble: drifting before the strike, ballistic debris after impact.
shardverts=[(-.5,-.2,-.3),(.45,-.15,-.2),(.2,.23,-.3),(-.2,.26,.1),(.10,-.06,.8)];shardfaces=[(0,1,4),(1,2,4),(2,3,4),(3,0,4),(0,3,2,1)]
proto=mesh('Basalt shard prototype',shardverts,shardfaces,[rock,silver,rocklit,rock]);sharddata=proto.data;bpy.data.objects.remove(proto,do_unlink=True)
for i in range(145):
 o=bpy.data.objects.new('Rising basalt debris '+str(i),sharddata);s.collection.objects.link(o);ang=rng.uniform(0,math.tau);rad=rng.uniform(5,19);base=Vector((math.cos(ang)*rad,rng.uniform(-3,19),rng.uniform(-1.5,9)));size=rng.uniform(.06,.48);vel=Vector((math.cos(ang)*10,rng.uniform(-8,2),math.sin(ang)*8+3))
 for f in range(1,331,4):
  t=(f-1)/30;up=smooth((t-1.4)/2.9);boom=fast((t-6.14)/1.2);pos=base+Vector((0,0,up*2))+vel*boom;key(o,'location',f,pos);key(o,'rotation_euler',f,(t*(.4+size),i*.2+t*.3,t*.15));key(o,'scale',f,(size,)*3)
# Three cuts: expanding beveled crescents, lightning incisions and delayed pressure fans.
hits=[4.63,5.35,6.14]
for cut,(at,angle) in enumerate(zip(hits,[.85,-.8,.13])):
 g=empty('Slash shock assembly '+str(cut));g.location=(0,-1,3);g.rotation_euler[1]=angle
 for layer in range(8):
  vs=[];fs=[];rad=5.8+layer*.20
  for j in range(101):
   u=j/100;theta=-1.1+u*2.65;width=math.sin(math.pi*u)**.6*(.42 if layer<2 else .045)
   for rr in [rad-width,rad+width]:vs.append((rr*math.sin(theta),layer*.055,rr*math.cos(theta)))
  for j in range(100):q=j*2;fs.append((q,q+1,q+3,q+2))
  ob=mesh('Razor shock crescent',vs,fs,[white if layer==0 else red if layer%2 else cyan],g)
 for k in range(18):
  pts=[(-20+j*.8,.5+k*.015,math.sin(j*1.7+k)*.10+(k-9)*.047) for j in range(51)];line('Long jagged world incision',pts,white if k==0 else red if k%2 else cyan,.013,g)
 for f in range(1,331):
  t=(f-1)/30;q=fast((t-at+.055)/.12);off=1-smooth((t-at-.14)/.36);pulsev=q*off;key(g,'scale',f,((1+q*.9)*pulsev,pulsev,pulsev));key(g,'rotation_euler',f,(0,angle+q*.4,0))
 # Slender ballistic shards in a real 3D burst.
 sv=[];sf=[];descs=[]
 for j in range(720):
  theta=rng.uniform(0,math.tau);vel=Vector((math.cos(theta)*rng.uniform(5,26),rng.uniform(-15,12),math.sin(theta)*rng.uniform(5,20)));descs.append((vel,rng.uniform(.01,.036),rng.uniform(0,.14)));idx=len(sv);sv.extend([(0,0,0)]*6);sf.extend([tuple(idx+x for x in face) for face in [(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)]])
 ob=mesh('720 ballistic sparks cut '+str(cut),sv,sf,[ember,white,red,cyan]);ob.shape_key_add(name='Basis');octs=[(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)];ff=sorted(set([1,330]+list(range(int(at*30)-4,min(330,int(at*30)+42),2))))
 for f in ff:
  t=(f-1)/30;co=[]
  for vel,size,delay in descs:
   age=t-at-delay;on=smooth(age/.035)*(1-smooth((age-.65)/.40));pos=Vector((0,-.6,3))+vel*max(0,age)+Vector((0,0,-3*max(0,age)**2));direction=vel.normalized()
   for ox,oy,oz in octs:co.extend(pos+Vector((ox*size,oy*size,oz*size))*on+direction*oz*size*on*6)
  sk=ob.shape_key_add(name='Spark time '+str(f));sk.data.foreach_set('co',co)
  for q,v in [(ff[max(0,ff.index(f)-1)],0),(f,1),(ff[min(len(ff)-1,ff.index(f)+1)],0)]:sk.value=v;sk.keyframe_insert('value',frame=q)
# Continental rift opens behind the blade and reaches beyond all frame edges.
rift=empty('Heaven and earth split');rift.location=(0,6,4);rift.rotation_euler[1]=-.32
cube('Dark interior of world cut',(0,.12,0),(.9,.1,75),black,rift,0)
for side,m in [(-1,red),(1,cyan)]:
 for layer in range(6):
  pts=[(side*(.48+layer*.13)+rng.uniform(-.09,.09),-.08-layer*.02,-38+j*1.5) for j in range(52)];line('Rift burning sheared edge',pts,white if layer==0 else m,.023 if layer==0 else .045,rift)
for f in range(1,331):
 t=(f-1)/30;on=fast((t-6.14)/.7)*(1-smooth((t-9.1)/.55));key(rift,'scale',f,(on,on,on))
# Camera: macro knife edge, readable full weapon, impact kicks, finally continental scale.
bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Cinematic camera';s.camera=cam;cam.data.lens=52 if a.portrait else 43;cam.data.sensor_fit='HORIZONTAL';cam.data.clip_end=300
for f in range(1,331):
 t=(f-1)/30;pull=smooth((t-.65)/2.0);wide=smooth((t-6.35)/.85);end=smooth((t-7.9)/.45);dist=6+pull*(17 if a.portrait else 16)+wide*5-end*5;target=Vector((.4*(1-pull),0,1.9+pull*1.6));eye=target+Vector((2+pull, -dist,1.5+pull*2.1));shake=sum(math.exp(-max(0,t-h)*18)*(.15 if j<2 else .30)*(1 if t>=h else 0) for j,h in enumerate(hits));eye+=Vector((math.sin(t*103)*shake,0,math.cos(t*87)*shake));key(cam,'location',f,eye);key(cam,'rotation_euler',f,(target-eye).to_track_quat('-Z','Y').to_euler())
# Ending objects are original generic card backs or a symbolic wild tile, not actual dealt cards.
def plane_texture(name,path,size,parent,loc,emission=1.7):
 im=bpy.data.images.load(str(path),check_existing=True);im.pack();m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;tex=n.new('ShaderNodeTexImage');tex.image=im;e=n.new('ShaderNodeEmission');e.inputs[1].default_value=emission;l.new(tex.outputs['Color'],e.inputs[0]);tr=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(tex.outputs['Alpha'],mix.inputs[0]);l.new(tr.outputs[0],mix.inputs[1]);l.new(e.outputs[0],mix.inputs[2]);mo=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],mo.inputs[0]);h=size/2;o=mesh(name,[(-h,-h,0),(h,-h,0),(h,h,0),(-h,h,0)],[(0,1,2,3)],[m],parent);uv=o.data.uv_layers.new();
 for j,co in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[j].uv=co
 o.location=loc;return o
endroot=empty('Coin result ending');endroot.parent=cam;endroot.location=(0,0,-13)
gold=mat('Warm gold card engraving',(.6,.37,.045),.75,.25,.6);cardmat=mat('Dark red blue card lacquer',(.022,.018,.035),.55,.26);ivory=mat('Ivory wild tile',(.87,.84,.72),.1,.25)
if a.ending=='heads':
 for j in range(5):
  g=empty('Five drawn skill cards '+str(j+1),endroot);cube('Generic skill card back',(0,0,0),(1.3,2.0,.12),cardmat,g,.07)
  line('Gold card border',[(-.57,-.89,.075),(.57,-.89,.075),(.57,.89,.075),(-.57,.89,.075),(-.57,-.89,.075)],gold,.023,g)
  for k in range(3):
   q=.25+k*.14;line('Angular card back seal',[(0,q,.085),(q,0,.085),(0,-q,.085),(-q,0,.085),(0,q,.085)],red if j%2 else cyan,.012,g)
  for f in range(1,331):
   t=(f-1)/30;u=fast((t-8.03-j*.105)/.23);absorb=fast((t-9.04)/.42);sc=u*(1-absorb);x=(j-2)*(1.02 if a.portrait else 1.34)*(1-absorb);key(g,'location',f,(x,-abs(j-2)*.14+absorb*2,-j*.05+absorb*3));key(g,'rotation_euler',f,(.12*(1-u),.5*(1-u),(2-j)*.09));key(g,'scale',f,(sc,)*3)
else:
 g=empty('Single revealed wild tile',endroot);cube('Thick ivory flying tile',(0,0,0),(2.2,3.0,.38),ivory,g,.15);cube('Blue green tile back',(0,0,-.23),(2.1,2.9,.15),black,g,.12);plane_texture('Wild tile character 飞',out.parent/'glyphs/glyph-4.png',2.05,g,(0,0,.206),1.15)
 for side,m in [(-1,red),(1,cyan)]:
  line('Wild tile energy seam',[(side*1.09,-1.35,.22),(side*1.14,0,.22),(side*1.09,1.35,.22)],m,.025,g)
 for f in range(1,331):
  t=(f-1)/30;u=fast((t-8.00)/.35);absorb=fast((t-9.14)/.34);sc=u*(1-absorb);key(g,'scale',f,(sc,)*3);key(g,'rotation_euler',f,(.1*(1-u),1.8*(1-u)+.10*math.sin(t*5)*(1-absorb),.05*math.sin(t*3)));key(g,'location',f,(0,absorb*1.6,absorb*3))
 # Four angular emblems denote the four tile families without pretending to choose a real tile.
 for j in range(12):
  g2=empty('Changing tile identity sigil '+str(j),endroot);q=.25
  if j%4==0:pts=[(-q,-q,0),(q,q,0),(-q,q,0),(q,-q,0)]
  elif j%4==1:pts=[(q*math.cos(k*math.tau/12),q*math.sin(k*math.tau/12),0) for k in range(13)]
  elif j%4==2:pts=[(-q,-q,0),(-q,q,0),(0,0,0),(q,q,0),(q,-q,0)]
  else:pts=[(-q,0,0),(q,0,0),(0,0,0),(0,q,0),(0,-q,0)]
  line('Four family changing mark',pts,red if j%2 else cyan,.035,g2)
  for f in range(1,331,2):
   t=(f-1)/30;u=fast((t-8.08)/.25);end=fast((t-8.80)/.33);theta=j*math.tau/12+(t-8)*3;r=(2.5-.3*math.sin(j))*(1-end);key(g2,'location',f,(r*math.cos(theta),r*math.sin(theta),-.3));key(g2,'scale',f,(u*(1-end),)*3);key(g2,'rotation_euler',f,(0,0,-theta))
# Camera-facing title preserves the card's gold yellow lettering and hard red outline.
title=empty('听天问剑 title impact',cam);title.location=(0,0,-12)
for j,ch in enumerate('听天问剑'):
 loc=((j%2-.5)*2.4,(.5-j//2)*2.5,0) if a.portrait else ((j-1.5)*2.04,0,0);o=plane_texture('Title glyph '+ch,out.parent/f'glyphs/glyph-{j}.png',2.42 if a.portrait else 2.30,title,loc,1.65);o['glyph']=ch;o['style']='gold-yellow face red outline'
for f in range(1,331):
 t=(f-1)/30;u=sat((t-9.52)/.16);settle=1+.15*math.exp(-max(0,t-9.68)*9)*math.cos(max(0,t-9.68)*27);sc=fast(u)*settle;key(title,'scale',f,(sc,)*3);key(title,'location',f,(0,-.15+max(0,1-u)*.3,-12))
# Optical pressure: short impact flashes and dispersion, never a constant glitch overlay.
s.use_nodes=True;n=s.node_tree.nodes;n.clear();l=s.node_tree.links;rl=n.new('CompositorNodeRLayers');gl=n.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=2.0;gl.size=8;gl.mix=-.65;l.new(rl.outputs['Image'],gl.inputs['Image']);lens=n.new('CompositorNodeLensdist');lens.use_fit=True;l.new(gl.outputs[0],lens.inputs[0]);flash=n.new('CompositorNodeMixRGB');flash.inputs[2].default_value=(3.5,3.5,3.5,1);l.new(lens.outputs[0],flash.inputs[1]);fade=n.new('CompositorNodeMixRGB');fade.inputs[2].default_value=(.001,.002,.004,1);l.new(flash.outputs[0],fade.inputs[1]);comp=n.new('CompositorNodeComposite');l.new(fade.outputs[0],comp.inputs[0])
for f in range(1,331):
 t=(f-1)/30;v=sum(.42*max(0,1-abs(t-h)/.05) for h in hits)+.14*max(0,1-abs(t-9.53)/.055);flash.inputs[0].default_value=min(.75,v);flash.inputs[0].keyframe_insert('default_value',frame=f);lens.inputs['Dispersion'].default_value=.001+v*.025;lens.inputs['Dispersion'].keyframe_insert('default_value',frame=f)
for f,v in [(1,.65),(18,0),(319,0),(330,1)]:fade.inputs[0].default_value=v;fade.inputs[0].keyframe_insert('default_value',frame=f)
for blocks in [bpy.data.objects,bpy.data.curves,bpy.data.shape_keys,s.node_tree]:
 if not hasattr(blocks,'__iter__'):blocks=[blocks]
 for o in blocks:
  if o.animation_data and o.animation_data.action:
   for fc in o.animation_data.action.fcurves:
    for k in fc.keyframe_points:k.interpolation='LINEAR'
s['cinematic']='heavens-sword';s['asset_version']='1.0.0';s['ending']=a.ending;s['presentation_only']=True;s.frame_set(90);(out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'heavens-sword.blend'));(out/'scene-metadata.json').write_text(json.dumps({'version':'1.0.0','frames':330,'fps':30,'duration':11,'portrait':a.portrait,'ending':a.ending,'cuts':hits,'sparkCount':2160,'stormVeins':56,'title':'听天问剑','titleFace':'gold-yellow','titleOutline':'red','objects':len(bpy.data.objects),'noGameState':True},ensure_ascii=False,indent=2),encoding='utf-8')
if a.save_only:raise SystemExit()
if a.frames:
 for f in map(int,a.frames.split(',')):s.frame_set(f);s.render.filepath=str(out/f'key-{f:03}.png');bpy.ops.render.render(write_still=True)
else:
 for f in range(1,331):
  dst=out/'frames'/f'frame-{f:04}.png'
  if a.reuse_common and (f<=240 or f>=286):
   src=Path(a.reuse_common).resolve()/'frames'/dst.name;assert src.exists(),src;shutil.copy2(src,dst);print('REUSED common frame',f,flush=True)
  else:s.frame_set(f);s.render.filepath=str(dst);bpy.ops.render.render(write_still=True)
