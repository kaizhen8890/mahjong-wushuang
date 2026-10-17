"""Astral Judgement 1.0.0. White lily, violet cosmos, layered danmaku, axial beam.
Deterministic offline Blender 4.5 scene; no game state. 10 s, 30 fps, two framings.
"""
import bpy, math, random, argparse, sys, json
from mathutils import Vector
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=48);p.add_argument('--save-only',action='store_true');p.add_argument('--font',default='C:/Windows/Fonts/STZHONGS.TTF');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);rng=random.Random(43003)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1000 if a.portrait else 1600;s.render.resolution_y=1600 if a.portrait else 1000;s.render.resolution_percentage=a.scale;s.render.fps=30;s.frame_start=1;s.frame_end=300
s.eevee.taa_render_samples=a.samples;s.eevee.use_raytracing=True;s.eevee.volumetric_samples=32;s.eevee.volumetric_tile_size='16';s.eevee.shadow_pool_size='1024';s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=15
s.render.use_motion_blur=True
for f,v in [(1,0),(200,0),(209,.22),(228,.32),(240,0),(300,0)]:s.render.motion_blur_shutter=v;s.render.keyframe_insert('motion_blur_shutter',frame=f)
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.35
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.018,.005,.045,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.4
def sat(x):return max(0,min(1,x))
def smooth(x):x=sat(x);return x*x*(3-2*x)
def out4(x):return 1-(1-sat(x))**4
def key(o,prop,f,v):setattr(o,prop,v);o.keyframe_insert(data_path=prop,frame=f)
def empty(name,parent=None):
 o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.parent=parent;return o
def mesh(name,vs,fs,mats):
 d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o)
 for m in mats:d.materials.append(m)
 for poly in d.polygons:poly.material_index=poly.index%len(mats)
 return o
def emission(name,color,strength):
 m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;n.clear();e=n.new('ShaderNodeEmission');e.inputs[0].default_value=(*color,1);e.inputs[1].default_value=strength;o=n.new('ShaderNodeOutputMaterial');m.node_tree.links.new(e.outputs[0],o.inputs['Surface']);return m
def physical(name,col,metal=0,rough=.3):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*col,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;b.inputs['Coat Weight'].default_value=.28;return m
def line(name,pts,mat,r=.012,parent=None):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=2;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for v,pt in zip(sp.points,pts):v.co=(*pt,1)
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(mat);o.parent=parent;return o
def sphere(name,loc,size,mat,parent=None,segments=20):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=12,radius=1,location=loc);o=bpy.context.object;o.name=name;o.scale=size;o.parent=parent;o.data.materials.append(mat)
 for poly in o.data.polygons:poly.use_smooth=True
 return o
def light(name,loc,col,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();return o
def ring(name,r,y,mat,width=.018,parent=None,start=0,length=math.tau):
 return line(name,[(r*math.cos(start+j/160*length),y,r*math.sin(start+j/160*length)) for j in range(161)],mat,width,parent)
def pulse(o,events):
 for f,v in events:key(o,'scale',f,(v,)*3)
white=emission('Pearl-white starlight',(.64,.72,1),4);violet=emission('Royal violet plasma',(.30,.012,1),5);pink=emission('Orchid pink photons',(.68,.025,.37),4);blue=emission('Ice-blue stellar lances',(.13,.38,1),4);soft=emission('Lavender star dust',(.35,.17,.65),1.8)
gold=physical('Antique pale gold',(.38,.25,.11),.78,.25);metal=physical('Violet engraved metal',(.045,.012,.095),.8,.22);silver=physical('Pearlescent silver',(.62,.66,.77),.68,.20)
light('Flower pearl key',(-5,-8,7),(.8,.84,1),1700,7);light('Flower violet edge',(5,2,4),(.45,.08,1),2100,6);light('Flower soft rose fill',(-3,-3,-4),(.72,.20,.45),700,5)
# Layered procedural nebula, avoiding reflective flat backdrops.
neb=emission('Original purple nebula',(.02,.006,.04),1);n=neb.node_tree.nodes;l=neb.node_tree.links;e=next(x for x in n if x.type=='EMISSION');coord=n.new('ShaderNodeTexCoord');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3.5;tex.inputs['Detail'].default_value=6;tex.inputs['Roughness'].default_value=.72;l.new(coord.outputs['Generated'],tex.inputs[0]);r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].position=.24;r.color_ramp.elements[0].color=(.001,.0003,.004,1);r.color_ramp.elements[1].position=.79;r.color_ramp.elements[1].color=(.25,.038,.38,1)
for pos,col in [(.46,(.008,.002,.022,1)),(.58,(.046,.008,.10,1)),(.68,(.11,.025,.20,1))]:r.color_ramp.elements.new(pos).color=col
l.new(tex.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],e.inputs[0]);back=mesh('Nebula volume horizon',[(-110,39,-85),(110,39,-85),(110,39,85),(-110,39,85)],[(0,1,2,3)],[neb])
for f in [1,100,200,300]:key(back,'rotation_euler',f,(0,.018*(f-1)/30,0))
vol=bpy.data.materials.new('Thin cosmic haze');vol.use_nodes=True;n=vol.node_tree.nodes;n.clear();pv=n.new('ShaderNodeVolumePrincipled');pv.inputs['Color'].default_value=(.14,.04,.30,1);pv.inputs['Density'].default_value=.002;pv.inputs['Anisotropy'].default_value=.35;mo=n.new('ShaderNodeOutputMaterial');vol.node_tree.links.new(pv.outputs[0],mo.inputs['Volume']);bpy.ops.mesh.primitive_cube_add(size=1,location=(0,8,0));o=bpy.context.object;o.name='Cosmic depth';o.scale=(80,80,80);o.data.materials.append(vol)
# Batched stars: pointed octahedra offer sharp glints and actual parallax.
octv=[(1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)];octf=[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)]
sv=[];sf=[]
for i in range(1700):
 x=rng.uniform(-38,38);z=rng.uniform(-28,28);y=rng.uniform(6,37);sz=rng.uniform(.010,.035)*(3 if i<35 else 1);base=len(sv);sv.extend([(x+vx*sz,y+vy*sz,z+vz*sz*(2 if i<35 else 1)) for vx,vy,vz in octv]);sf.extend([tuple(base+v for v in f) for f in octf])
stars=mesh('1700 distant stars',sv,sf,[soft,white,soft,blue]);
for f in [1,90,180,240,300]:key(stars,'rotation_euler',f,(0,(f-1)*.00022,0))
# Hero lily: six organic curved petals, pearl translucency, longitudinal veins, stamens.
petal=physical('White lily living petal',(.90,.86,.91),0,.35);n=petal.node_tree.nodes;l=petal.node_tree.links;b=n.get('Principled BSDF');b.inputs['Subsurface Weight'].default_value=.16;b.inputs['Subsurface Radius'].default_value=(.8,.45,.28);b.inputs['Sheen Weight'].default_value=.22;b.inputs['Transmission Weight'].default_value=.08
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=36;noise.inputs['Detail'].default_value=2;bum=n.new('ShaderNodeBump');bum.inputs['Strength'].default_value=.07;bum.inputs['Distance'].default_value=.010;l.new(noise.outputs['Fac'],bum.inputs['Height']);l.new(bum.outputs[0],b.inputs['Normal'])
vein=physical('Fine pale petal veins',(.60,.60,.68),0,.45);pollen=physical('Golden pollen',(.46,.27,.055),.15,.44);stemmat=physical('Pale green lily throat',(.27,.36,.15),0,.38)
flower=empty('Falling white lily');petals=[]
def petal_point(u,v,angle):
 radius=.05+2.95*u;wid=(math.sin(math.pi*u)**1.10)*(.49+.17*u);x=radius;z=v*wid;y=.80-1.8*math.sin(u*math.pi*.78)+1.50*u**7+.28*v*v*math.sin(math.pi*u)+.05*math.sin(u*9+v*2)*u
 return (x*math.cos(angle)-z*math.sin(angle),y,x*math.sin(angle)+z*math.cos(angle))
for k in range(6):
 angle=k*math.tau/6+(0.08 if k%2 else 0);vs=[];fs=[]
 for j in range(41):
  for q in range(17):vs.append(petal_point(j/40,(q-8)/8,angle))
 for j in range(40):
  for q in range(16):idx=j*17+q;fs.append((idx,idx+1,idx+18,idx+17))
 ob=mesh(f'White lily petal {k+1}',vs,fs,[petal]);ob.parent=flower;sol=ob.modifiers.new('Living petal thickness','SOLIDIFY');sol.thickness=.015;petals.append(ob)
 for poly in ob.data.polygons:poly.use_smooth=True
 for vi in [-.45,0,.45]:
  pts=[petal_point(j/40,vi,angle) for j in range(3,39)];pts=[(x,y-.012,z) for x,y,z in pts];ln=line('Delicate longitudinal petal vein',pts,vein,.0035,ob)
 # Bloom opens, later detaches and dissolves into the stellar core.
 for f in range(1,301,3):
  t=(f-1)/30;op=smooth((t-1.65)/1.0);diss=smooth((t-6.0)/.58);key(ob,'rotation_euler',f,(.06*(1-op)*math.sin(angle),0,.13*(1-op)*math.cos(angle)));key(ob,'location',f,(math.cos(angle)*diss*.75,diss*.8+(k%2)*.14,math.sin(angle)*diss*.75));sc=(1-diss)*(1.05 if k%2 else .95);key(ob,'scale',f,(sc,)*3)
sphere('Lily throat',(0,.72,0),(.19,.30,.19),stemmat,flower)
for k in range(6):
 angle=k*math.tau/6;rad=.45;tip=Vector((rad*math.cos(angle),-1.45-rng.uniform(0,.2),rad*math.sin(angle)));pts=[(.10*math.cos(angle),.05,.10*math.sin(angle)),(.24*math.cos(angle),-.85,.24*math.sin(angle)),tip];line('Graceful lily stamen',pts,silver,.023,flower);o=sphere('Lily pollen anther',tip,(.16,.05,.075),pollen,flower);o.rotation_euler[1]=-angle
line('Central lily style',[(0,.1,0),(.04,-1.4,.05),(.08,-1.8,.10)],stemmat,.032,flower);sphere('Trilobed stigma',(.08,-1.8,.10),(.10,.06,.10),petal,flower)
for f in range(1,301):
 t=(f-1)/30;fall=smooth(t/1.85);retreat=smooth((t-1.8)/1.2);diss=smooth((t-6.35)/.25);key(flower,'location',f,(.20*math.sin(t*1.4)*(1-retreat),-4*(1-retreat),2.2*(1-fall)));key(flower,'rotation_euler',f,(.29+.12*math.sin(t*1.2),-.12+t*.10,.20*math.cos(t*.8)));sc=(1.10-.56*retreat)*(1-diss);key(flower,'scale',f,(sc,)*3)
# Orbital armillary instruments inspired by the card's violet disks and gold trim.
for k in range(7):
 g=empty(f'Celestial engraved annulus {k}');rad=3.5+k*.85
 for offset,m,w in [(0,metal,.12),(-.12,gold,.016),(.12,gold,.016),(0,violet,.009)]:ring('Inset violet gold orbital ring',rad+offset,3+k*.2,m,w,g)
 for j in range(32+k*5):
  th=j*math.tau/(32+k*5);pts=[((rad-.08)*math.cos(th),2.85+k*.2,(rad-.08)*math.sin(th)),((rad+.08)*math.cos(th),2.85+k*.2,(rad+.08)*math.sin(th))];line('Engraved radial hash',pts,gold,.012,g)
 for f in range(1,301,3):
  t=(f-1)/30;grow=out4((t-1.85-k*.12)/.70);vanish=1-smooth((t-7.5)/.4);scale=grow*vanish;key(g,'scale',f,(scale,)*3);turn=(.11*t+.11*smooth((t-3)/2.7))*(-1 if k%2 else 1);key(g,'rotation_euler',f,(.20*math.sin(k),turn,.26*math.cos(k)))
# 2520 luminous bullets are baked into mesh shape keys, keeping the saved scene standalone.
# Three independent patterns: floral fans, counter-rotating helices, foreground lances.
bullet_data=[]
for i in range(2520):
 family=i%3;arm=(i//3)%14;row=i//42;phase=arm*math.tau/14;birth=2.8+row*.036+(family*.14);speed=3.0+(i%7)*.23;size=.035+(i%5)*.007;bullet_data.append((family,phase,birth,speed,size,i))
def bullet_pose(desc,t):
 family,phase,birth,speed,size,i=desc;age=t-birth;on=smooth(age/.10)*(1-smooth((t-6.55)/.28));age=max(0,age);collapse=smooth((t-5.70)/.95);flight=0
 if family==0:
  theta=phase+.24*age;rad=1.6+age*speed*(1+.24*math.cos(phase*5+age));pos=Vector((rad*math.cos(theta),2+math.sin(phase*3)*1.5,rad*math.sin(theta)));elong=2.3
 elif family==1:
  theta=phase-age*.85+birth*.40;rad=2.0+age*speed*.86;pos=Vector((rad*math.cos(theta),4-age*1.7,rad*math.sin(theta)));elong=1.3
 else:
  theta=phase+birth*.25;rad=4.0+age*1.85;pos=Vector((rad*math.cos(theta),11-age*9,rad*math.sin(theta)));elong=7.0
 pos*=1-collapse*.965;pos.y-=flight*(16+(i%11));sc=size*on*(1+.35*flight);return pos,sc,elong,theta
for family,m in enumerate([white,violet,pink]):
 descriptors=[d for d in bullet_data if d[0]==family];basevs=[(0,0,0)]*(len(descriptors)*6);fs=[]
 for i in range(len(descriptors)):fs.extend([tuple(i*6+x for x in face) for face in octf])
 ob=mesh(['Floral white bullet fans','Violet counter-rotating star spirals','Pink depth lance storm'][family],basevs,fs,[m]);ob.shape_key_add(name='Basis')
 frames=list(range(1,301,3))+[300]
 for idx,f in enumerate(frames):
  t=(f-1)/30;arr=[]
  for desc in descriptors:
   pos,sz,elong,th=bullet_pose(desc,t)
   for vx,vy,vz in octv:
    dx=vx*sz;dz=vz*sz*elong;arr.extend((pos.x+dx*math.cos(th)-dz*math.sin(th),pos.y+vy*sz,pos.z+dx*math.sin(th)+dz*math.cos(th)))
  sk=ob.shape_key_add(name=f'Frame {f:03}');sk.data.foreach_set('co',arr)
  for fr,val in [(frames[max(0,idx-1)],0),(f,1),(frames[min(len(frames)-1,idx+1)],0)]:
   if fr==f and val==0:continue
   sk.value=val;sk.keyframe_insert('value',frame=fr)
  sk.value=0
# Long satin-like energy trails spiral through the projectile field.
for k in range(24):
 pts=[];phase=k*math.tau/24
 for j in range(130):
  u=j/129;th=phase+u*math.tau*1.15;rad=2.3+u*8;pts.append((rad*math.cos(th),4-u*7+math.sin(th)*.7,rad*math.sin(th)))
 ob=line('Braided stellar wake',pts,white if k%7==0 else blue if k%4==0 else violet,.012 if k%3 else .027)
 for f in range(1,301,3):
  t=(f-1)/30;sc=smooth((t-3.0-k*.025)/.7)*(1-.94*smooth((t-5.7)/.95))*(1-smooth((t-6.7)/.15));key(ob,'scale',f,(sc,)*3);key(ob,'rotation_euler',f,(.1*math.sin(k),t*(.25 if k%2 else -.20),0));key(ob.data,'bevel_factor_start',f,.03+.08*math.sin(t*3+k)**2);key(ob.data,'bevel_factor_end',f,.58+.38*math.sin(t*2+k)**2)
# Petal-like meteors detach from the flower and drift toward the camera.
for i in range(95):
 theta=rng.random()*math.tau;start=2.5+rng.random()*3;rad=rng.uniform(1,3);proto=petals[i%6];ob=bpy.data.objects.new('Luminous detached petal',proto.data);s.collection.objects.link(ob);sz=rng.uniform(.07,.20)
 for f in range(1,301,4):
  t=(f-1)/30;age=max(0,t-start);v=smooth((t-start)/.3)*(1-smooth((t-7.5)/.3));r=rad+age*1.25;key(ob,'location',f,(r*math.cos(theta+age*.13),2-age*4,r*math.sin(theta+age*.13)));key(ob,'rotation_euler',f,(age*.7+i,theta+age*.4,age*.3));key(ob,'scale',f,(sz*v,)*3)
# Central stellar core compresses before the beam fires along the camera axis.
core=sphere('White judgement star',(0,-.15,0),(0,0,0),white,segments=48)
for f in range(1,301):
 t=(f-1)/30;scale=.12+.65*smooth((t-5.7)/.7);scale*=1-.60*smooth((t-6.4)/.22);scale+=3*out4((t-6.8)/.7);scale*=smooth((t-5.6)/.3)*(1-smooth((t-7.8)/.2));key(core,'scale',f,(scale,)*3)
for k in range(12):
 ob=ring('Converging stellar pressure ring',1,0,white if k%4==0 else violet,.016);at=5.70+k*.065
 for f in range(1,301,2):
  t=(f-1)/30;u=sat((t-at)/.65);sc=(8*(1-u)**2+.15)*smooth((t-at)/.07)*(1-smooth((t-at-.6)/.10));key(ob,'scale',f,(sc,)*3);key(ob,'location',f,(0,1.5-u*2,0))
# Beam surfaces have nested cores, asymmetric flame ribbons and travelling shock rings.
def beam_surface(name,radius,mat):
 vs=[];fs=[]
 for j in range(65):
  u=j/64;y=-u*30;r=radius*(.35+.85*u)
  for k in range(64):
   th=k*math.tau/64;vs.append((r*math.cos(th),y,r*math.sin(th)))
 for j in range(64):
  for k in range(64):q=j*64+k;qn=j*64+(k+1)%64;fs.append((q,qn,qn+64,q+64))
 ob=mesh(name,vs,fs,[mat]);return ob
beam=beam_surface('Giant white axial judgement beam',1.5,white)
for f in range(1,301):
 t=(f-1)/30;u=smooth((t-6.80)/1.08);wide=(.025+u*u*1.9)*(1-smooth((t-8.02)/.12));key(beam,'scale',f,(wide,smooth((t-6.80)/.98),wide))
for k in range(18):
 vs=[];fs=[];phase=k*math.tau/18
 for j in range(110):
  u=j/109;theta=phase+u*math.tau*(1.3 if k%2 else -.8);rad=1.5+u*2.2+.20*math.sin(u*35+k);y=-u*30;w=.045+.14*math.sin(math.pi*u)**2
  for d in [-1,1]:vs.append(((rad+d*w)*math.cos(theta),y,(rad+d*w)*math.sin(theta)))
  if j:fs.append((j*2-2,j*2-1,j*2+1,j*2))
 ob=mesh('Helical plasma on the judgement beam',vs,fs,[violet if k%3 else pink if k%2 else blue])
 for f in range(1,301,2):
  t=(f-1)/30;u=smooth((t-6.82)/1.0);sc=smooth((t-6.80)/.08)*(1-smooth((t-8)/.15));key(ob,'scale',f,((.18+u*1.3)*sc,smooth((t-6.80)/.98),(.18+u*1.3)*sc));key(ob,'rotation_euler',f,(0,(t-6.8)*(2 if k%2 else -2),0))
for k in range(14):
 ob=ring('Travelling axial pressure wave',1,0,white if k%3==0 else violet,.035);at=6.84+k*.055
 for f in range(1,301,2):
  t=(f-1)/30;u=sat((t-at)/.65);v=smooth((t-at)/.07)*(1-smooth((t-at-.55)/.15));sc=(1.2+u*5)*v;key(ob,'scale',f,(sc,)*3);key(ob,'location',f,(0,-u*31,0))
# Camera tracks the lily, retreats through the danmaku, and is overrun by the beam.
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.lens=39 if not a.portrait else 46;cam.data.sensor_fit='HORIZONTAL';cam.data.clip_end=180
shots=[(0,(.1,-18,2.7),(0,-3,1.8),-.03),(1.8,(.2,-18,.4),(0,-3,0),.015),(3.0,(1,-22,1.4),(0,0,0),-.03),(5.5,(-1.1,-27,1.1),(0,0,0),.05),(6.4,(2,-26,1.4),(0,0,0),-.02),(6.8,(2,-25,1.4),(0,0,0),-.02),(7.6,(.1,-25,.1),(0,0,0),0),(8,(0,-25,0),(0,0,0),0),(10,(0,-25,0),(0,0,0),0)]
for f in range(1,301):
 t=(f-1)/30
 for j in range(len(shots)-1):
  ta,pa,qa,ra=shots[j];tb,pb,qb,rb=shots[j+1]
  if ta<=t<=tb:
   u=smooth((t-ta)/(tb-ta));pos=Vector(pa).lerp(Vector(pb),u);target=Vector(qa).lerp(Vector(qb),u);roll=ra+(rb-ra)*u;break
 shake=(.07*math.exp(-(t-6.8)*2)+.07*smooth((t-7.3)/.5))*(1-smooth((t-7.95)/.1)) if t>=6.8 else 0;pos+=Vector((shake*math.sin(t*96),0,shake*math.sin(t*75)));rot=(target-pos).to_track_quat('-Z','Y').to_euler();rot.rotate_axis('Z',roll);key(cam,'location',f,pos);key(cam,'rotation_euler',f,rot)
# Exact user-requested STZhongsong lettering: white face, geometric purple outline.
# Read the installed font locally; do not copy or redistribute its font file.
fontpath=Path(a.font).resolve();assert fontpath.exists(),fontpath;font=bpy.data.fonts.load(str(fontpath));titlemat=emission('Pure pearl-white title face',(.93,.93,1),1.6);outline=emission('Violet title outline',(.27,.012,.60),1.6)
title=empty('Judgement title landing',cam);title.location=(0,0,-12);texts=[]
for idx,char in enumerate('宿星审判'):
 d=bpy.data.curves.new('Title glyph '+char,'FONT');d.body=char;d.font=font;d.align_x='CENTER';d.align_y='CENTER';d.size=2.3 if a.portrait else 1.92;d.extrude=.012;d.bevel_depth=.003;d.bevel_resolution=3;o=bpy.data.objects.new('宿星审判 '+char,d);s.collection.objects.link(o);d.materials.append(titlemat);o.parent=title
 if a.portrait:o.location=((idx%2-.5)*2.65,(.5-idx//2)*2.70,0)
 else:o.location=((idx-1.5)*2.15,0,0)
 edge=d.copy();edge.name='Purple outline '+char;edge.offset=.026;edge.extrude=.010;edge.materials.clear();edge.materials.append(outline);eo=bpy.data.objects.new('Purple outlined '+char,edge);s.collection.objects.link(eo);eo.parent=title;eo.location=o.location;eo.location.z=-.033;texts.append(o)
for f in range(1,301):
 t=(f-1)/30;u=t-8.22;scale=0 if u<0 else 1+.22*math.exp(-u*13)*math.cos(u*22);key(title,'scale',f,(scale,)*3);key(title,'location',f,(0,0 if u<0 else -.1*math.exp(-u*12)*math.sin(u*25),-12))
# The rasterized font faces avoid self-intersecting serif offsets in 3D extrusion.
sys.path.insert(0,str(Path(__file__).resolve().parent))
from title_geometry import replace_title
replace_title(s,out.parent/'title-glyphs',a.portrait)
# Quiet ornamental halo behind the final title, with star dust still alive.
for k in range(2):
 ob=ring('Title celestial aureole',3.3+k*.23,0,soft,.010);ob.parent=cam;ob.location=(0,0,-13);ob.rotation_euler[0]=math.pi/2
 pulse(ob,[(1,0),(247,0),(261,1),(300,1)])
s.use_nodes=True;n=s.node_tree.nodes;n.clear();l=s.node_tree.links;rl=n.new('CompositorNodeRLayers');dn=n.new('CompositorNodeDenoise');l.new(rl.outputs['Image'],dn.inputs['Image']);gl=n.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=1.7;gl.size=8;gl.mix=-.52;l.new(dn.outputs[0],gl.inputs['Image']);lens=n.new('CompositorNodeLensdist');lens.use_fit=True;l.new(gl.outputs[0],lens.inputs['Image'])
for f,v in [(1,.001),(201,.001),(209,.014),(223,.025),(238,.030),(244,0),(300,0)]:lens.inputs['Dispersion'].default_value=v;lens.inputs['Dispersion'].keyframe_insert('default_value',frame=f)
flash=n.new('CompositorNodeMixRGB');flash.inputs[2].default_value=(4,4,4,1);l.new(lens.outputs[0],flash.inputs[1])
for f,v in [(1,0),(228,0),(238,1),(243,1),(250,0),(300,0)]:flash.inputs[0].default_value=v;flash.inputs[0].keyframe_insert('default_value',frame=f)
fade=n.new('CompositorNodeMixRGB');fade.inputs[2].default_value=(.002,.0005,.008,1);l.new(flash.outputs[0],fade.inputs[1]);comp=n.new('CompositorNodeComposite');l.new(fade.outputs[0],comp.inputs[0])
for f,v in [(1,.8),(16,0),(292,0),(300,1)]:fade.inputs[0].default_value=v;fade.inputs[0].keyframe_insert('default_value',frame=f)
for blocks in [bpy.data.objects,bpy.data.curves,bpy.data.shape_keys]:
 for o in blocks:
  if o.animation_data and o.animation_data.action:
   for fc in o.animation_data.action.fcurves:
    for k in fc.keyframe_points:k.interpolation='LINEAR'
s['cinematic']='astral-judgement';s['asset_version']='1.0.0';s['duration_seconds']=10;s['presentation_only']=True;s['title']='宿星审判';s.frame_set(145);(out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'astral-judgement.blend'))
(out/'scene-metadata.json').write_text(json.dumps({'name':'宿星审判','version':'1.0.0','frames':300,'fps':30,'duration':10,'portrait':a.portrait,'petals':6,'stars':1700,'bullets':2520,'objects':len(bpy.data.objects),'titleFont':str(fontpath),'theme':'White lily, violet cosmos, floral danmaku, giant axial beam','noGameState':True},ensure_ascii=False,indent=2),encoding='utf-8')
if a.save_only:raise SystemExit()
if a.frames:
 for f in map(int,a.frames.split(',')):
  s.frame_set(f);s.render.filepath=str(out/f'key-{f:03}.png');bpy.ops.render.render(write_still=True)
else:bpy.ops.render.render(animation=True)
