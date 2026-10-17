"""Discord 1.1.0: long segmented greatsword, ballistic assembly, layered rupture.
Original offline 3D geometry; no runtime rules or player identity. Blender 4.5.
"""
import bpy, math, random, argparse, sys, json
from mathutils import Vector
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=48);p.add_argument('--save-only',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);random.seed(43107)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1000 if a.portrait else 1600;s.render.resolution_y=1600 if a.portrait else 1000;s.render.resolution_percentage=a.scale;s.render.fps=30;s.frame_start=1;s.frame_end=240
s.eevee.taa_render_samples=a.samples;s.eevee.use_raytracing=True;s.eevee.volumetric_tile_size='16';s.eevee.volumetric_samples=32;s.eevee.shadow_pool_size='1024';s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=15
s.render.use_motion_blur=True
for f,v in [(1,0),(117,0),(123,.24),(128,.48),(140,.36),(152,0),(240,0)]:
 s.render.motion_blur_shutter=v;s.render.keyframe_insert('motion_blur_shutter',frame=f)
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.15
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.025,.008,.10,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.35
def key(o,prop,f,value):
 setattr(o,prop,value);o.keyframe_insert(data_path=prop,frame=f)
def sat(x):return max(0,min(1,x))
def smooth(x):x=sat(x);return x*x*(3-2*x)
def easeout(x):return 1-(1-sat(x))**4
def mat(name,color,metal=.3,rough=.2,emit=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;b.inputs['Coat Weight'].default_value=.45;b.inputs['Emission Color'].default_value=(*color,1);b.inputs['Emission Strength'].default_value=emit;return m
def mesh(name,verts,faces,mats):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o)
 for m in mats:d.materials.append(m)
 for f in d.polygons:f.material_index=f.index%len(mats)
 return o
def line(name,pts,m,r=.012):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=1;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for v,pt in zip(sp.points,pts):v.co=(*pt,1)
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(m);return o
def empty(name,parent=None):
 o=bpy.data.objects.new(name,None);s.collection.objects.link(o);o.parent=parent;return o
def cube(name,loc,size,m,parent=None):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);o.parent=parent;b=o.modifiers.new('Machined bevel','BEVEL');b.width=.03;b.segments=2;return o
def light(name,loc,col,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();return o
def visible(o,start,peak,end,scale=1):
 for f,v in [(1,0),(max(1,start),0),(peak,scale),(end,0)]:key(o,'scale',f,(v,)*3)
purple=mat('Amethyst fractured faces',(.11,.009,.29),.78,.2,.10);blue=mat('Deep sapphire steel',(.025,.075,.32),.8,.16,.12);ice=mat('Iridescent ice facets',(.19,.46,.64),.78,.19,.20);pink=mat('Magenta interference faces',(.35,.02,.23),.75,.24,.14)
silver=mat('Polished moon silver',(.54,.68,.81),.88,.19,.14);dark=mat('Engraved obsidian steel',(.014,.006,.038),.8,.23,.015)
cyan=mat('White cyan plasma',(.18,.75,1),.3,.17,6);violet=mat('Violet electrical filament',(.30,.006,1),.2,.2,5);magenta=mat('Magenta ion trails',(.65,.008,.21),.3,.19,3.5);pale=mat('Cold silver rim',(.50,.77,1),.6,.17,1.3)
light('Broad cyan blade reflection',(-7,-9,9),(.38,.73,1),4300,8);light('Purple rim',(8,5,5),(.48,.04,1),5500,7);light('Silver backlight',(-4,8,-5),(.4,.55,1),4400,6);light('Magenta edge',(8,-3,-5),(.66,.035,.25),2200,5)
# Volumetric space and original procedural nebula.
vol=bpy.data.materials.new('Thin violet volumetric depth');vol.use_nodes=True;n=vol.node_tree.nodes;n.clear();v=n.new('ShaderNodeVolumePrincipled');v.inputs['Color'].default_value=(.17,.06,.34,1);v.inputs['Density'].default_value=.003;v.inputs['Anisotropy'].default_value=.3;mo=n.new('ShaderNodeOutputMaterial');vol.node_tree.links.new(v.outputs[0],mo.inputs['Volume']);cube('Haze',(0,10,0),(85,90,85),vol)
neb=mat('Procedural deep-space clouds',(.05,.01,.15),0,1,1);n=neb.node_tree.nodes;b=n.get('Principled BSDF');b.inputs['Coat Weight'].default_value=0;b.inputs['Specular IOR Level'].default_value=0;tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=3;tex.inputs['Detail'].default_value=5;tex.inputs['Roughness'].default_value=.75;ramp=n.new('ShaderNodeValToRGB');ramp.color_ramp.elements[0].position=.20;ramp.color_ramp.elements[0].color=(.001,.0005,.006,1);ramp.color_ramp.elements[1].position=.82;ramp.color_ramp.elements[1].color=(.045,.006,.12,1);mid=ramp.color_ramp.elements.new(.58);mid.color=(.005,.008,.03,1);neb.node_tree.links.new(tex.outputs['Fac'],ramp.inputs[0]);neb.node_tree.links.new(ramp.outputs[0],b.inputs['Base Color']);neb.node_tree.links.new(ramp.outputs[0],b.inputs['Emission Color']);cube('Nebula distant backcloth',(0,32,0),(80,.1,80),neb)
# Brushed machining and fine roughness variation remain visible in the close hero shot.
for m in [silver,ice,blue,purple]:
 n=m.node_tree.nodes;b=n.get('Principled BSDF');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=95;tex.inputs['Detail'].default_value=2;bum=n.new('ShaderNodeBump');bum.inputs['Strength'].default_value=.13;bum.inputs['Distance'].default_value=.025;m.node_tree.links.new(tex.outputs['Fac'],bum.inputs['Height']);m.node_tree.links.new(bum.outputs['Normal'],b.inputs['Normal'])
verts=[(-.4,0,-1),(.35,0,-.62),(.55,0,.18),(.09,0,1.3),(-.52,0,.38),(-.18,.19,-.06),(.10,-.13,.07)];faces=[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,0,6),(0,5,1),(1,5,2),(2,5,3),(3,5,4),(4,5,0)]
proto=mesh('Shared broken prism geometry',verts,faces,[purple,blue,ice,pink]);shardmesh=proto.data;bpy.data.objects.remove(proto,do_unlink=True)
sparkproto=mesh('Shared glowing plasma shard',verts,faces,[cyan,violet,pale]);sparkmesh=sparkproto.data;bpy.data.objects.remove(sparkproto,do_unlink=True)
def shard(name,data=shardmesh,parent=None):
 o=bpy.data.objects.new(name,data);s.collection.objects.link(o);o.parent=parent;return o
# Chaotic cinematic corridor, with accelerated implosion before a ballistic release.
for i in range(240):
 o=shard(f'Faceted world fragment {i:03}');th=i*2.39996;r=random.uniform(10,21);depth=random.uniform(-2,24);sz=random.uniform(.3,1.65);rot=Vector((random.uniform(-1,1),random.uniform(-1,1),random.uniform(-1,1)));targetth=i*2.39996;rr=4.8+(i%5)*.37;target=Vector((math.cos(targetth)*rr,1+(i%5)*.8,math.sin(targetth)*rr))
 for f in range(1,241,3):
  t=(f-1)/30;theta=th+.14*t+.14*smooth((t-2.7)/1.35);impl=.18*smooth((t-3.5)/.58);blast=easeout((t-4.22)/.55);radius=r*(1-impl)+blast*5;pos=Vector((radius*math.cos(theta),depth-t*.28-blast*2,radius*math.sin(theta)));u=smooth((t-5.45)/1.25);pos=pos.lerp(target,u);size=sz*(1-.60*u)
  key(o,'location',f,pos);key(o,'scale',f,(size,)*3);key(o,'rotation_euler',f,tuple(rot*(1-u)+Vector((t*.08,theta+t*.1+blast,0))*(1-u)+Vector((0,math.pi/2-targetth,0))*u))
 if i%3==0:
  edge=line('Fracture glint',[verts[j] for j in [0,2,3]],pale,.007);edge.parent=o
for i in range(380):
 o=shard(f'Parallax luminous dust {i}',sparkmesh if i%4==0 else shardmesh);theta=random.random()*math.tau;r=random.uniform(4,23);y=random.uniform(-8,27);size=random.uniform(.012,.07)
 for f in [1,93,120,133,155,188,240]:
  t=(f-1)/30;burst=easeout((t-4.2)/.65);key(o,'location',f,((r+burst*7)*math.cos(theta+t*.12),y-t*.4,(r+burst*7)*math.sin(theta+t*.12)));key(o,'rotation_euler',f,(t+i,theta+t*.3,0));key(o,'scale',f,(size,size*.4,size*3))
# Two symbolic physical costs fly in, then violently collapse into the forge.
for side in [-1,1]:
 group=empty('Two attack costs');cube('Obsidian attack seal',(0,0,0),(1.1,.12,1.7),dark,group)
 frame=line('Magenta seal border',[(-.47,-.075,-.75),(.47,-.075,-.75),(.47,-.075,.75),(-.47,-.075,.75),(-.47,-.075,-.75)],magenta,.018);frame.parent=group
 for j in [-1,1]:
  l=line('Attack seal sigil',[(j*.23,-.09,-.43),(-j*.23,-.09,.43)],cyan,.025);l.parent=group
 for f in range(1,39):
  t=(f-1)/30;u=smooth(t/.55);collapse=sat((t-.78)/.33)**3;key(group,'location',f,(side*(5-3.8*u)*(1-collapse),-5+collapse*4,-.2+collapse));key(group,'rotation_euler',f,(.12,side*(1.8-.9*u+collapse*4),side*.15));key(group,'scale',f,((1-collapse),)*3)
# Hero greatsword: separate forged pieces, long diamond-section blade and ornate hilt.
hero=empty('Greatsword choreography');parts=[];impacts=[]
def part(name,at,offset):
 g=empty(name,hero);parts.append((g,at,Vector(offset)));impacts.append(at);return g
grip=part('Hilt and pommel arrive first',1.38,(0,-3,-10))
cube('Full length wrapped black grip',(0,0,-4.3),(.30,.38,2.25),dark,grip)
for j in range(13):
 z=-5.35+j*.165;ob=line('Silver spiral grip bindings',[(-.16,-.21,z-.08),(.16,-.21,z+.08),(.16,.19,z+.16),(-.16,.19,z)],silver,.024);ob.parent=grip
for z in [-5.48,-3.2]:cube('Machined grip collar',(0,0,z),(.55,.51,.17),silver,grip)
pom=mesh('Long faceted sapphire pommel',[(-.34,0,-5.55),(.34,0,-5.55),(0,-.24,-5.65),(0,.24,-5.65),(0,0,-6.30)],[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(0,3,1,2)],[silver,blue,purple,ice]);pom.parent=grip
for side in [-1,1]:
 guard=part('Swept multi-layer guard',1.70+(side+1)*.03,(side*12,2,-3))
 for layer in range(3):
  z=-2.7-layer*.17;y=-.05+layer*.16;pts=[(0,y,z+.25),(side*.65,y,z+.45),(side*1.4,y,z+1.0),(side*2.25,y,z+1.7),(side*1.9,y,z+.35),(side*1.4,y,z-.12),(side*.5,y,z-.5),(0,y,z-.40)];mid=(side*.85,y-.24,z+.03);ob=mesh('Swept sapphire feather guard',pts+[mid],[(k,(k+1)%8,8) for k in range(8)],[silver,blue,ice,purple]);ob.parent=guard
  edge=line('Guard polished rim',pts[:5],cyan if layer==0 else pale,.012);edge.parent=guard
 gem=shard('Guard iridescent inset',sparkmesh,guard);gem.location=(side*.75,-.31,-2.57);gem.scale=(.20,.7,.37)
# Five separate long blade sections hammer into place from alternating sides.
segments=[(-2.45,-.1),(-.1,2.15),(2.15,4.4),(4.4,6.65),(6.65,9.15)]
for j,(lo,hi) in enumerate(segments):
 g=part(f'Blade forged section {j+1}',1.88+j*.20,((-1 if j%2 else 1)*(9+j*1.2),1.2,-3+j*1.5));w0=.84-(lo+2.45)*.040;w1=.84-(hi+2.45)*.040
 vs=[(-w0,0,lo),(0,-.27,lo),(w0,0,lo),(0,.20,lo),(-w1,0,hi),(0,-.24,hi),(w1,0,hi),(0,.17,hi)]
 ob=mesh('Diamond blade silver bevels',vs,[(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(0,3,2,1),(4,5,6,7)],[silver,ice,blue,purple,dark]);ob.parent=g
 for side in [-1,1]:
  edge=line('Double cutting edge',[(side*w0,-.015,lo),(side*w1,-.015,hi)],pale,.022);edge.parent=g
  # Dark central fuller gives the luminous inlay a readable border.
  lineob=line('Etched obsidian fuller',[(side*.055,-.282,lo+.04),(side*.045,-.252,hi-.04)],dark,.022);lineob.parent=g
  lineob=line('Cyan vein inside fuller',[(side*.055,-.302,lo+.06),(side*.045,-.272,hi-.06)],cyan,.010);lineob.parent=g
  for k in range(3):
   z=lo+.32+k*(hi-lo-.5)/3;ob=line('Engraved angular runic inlay',[(side*.17,-.255,z-.12),(side*.33,-.20,z+.04),(side*.24,-.23,z+.17),(side*.31,-.2,z+.30)],pale,.008);ob.parent=g
  ob=line('Segment joining chevrons',[(side*w0,-.01,lo+.06),(side*.2,-.24,lo+.22),(0,-.28,lo+.09)],violet,.016);ob.parent=g
tip=part('Needle point locks into the blade',2.88,(0,3,14));ob=mesh('Long penetrating crystal point',[(-.38,0,9.15),(0,-.24,9.15),(.38,0,9.15),(0,.17,9.15),(0,0,10.8)],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)],[silver,ice,blue,purple]);ob.parent=tip
core=part('Guard core detonates',3.03,(0,-8,-2));gem=shard('Guard central faceted heart',sparkmesh,core);gem.location=(0,-.5,-2.5);gem.scale=(.7,1.5,.65)
for k in range(2):
 pts=[(.58*math.cos(j*math.tau/8),-.35-k*.06,-2.5+.58*math.sin(j*math.tau/8)) for j in range(9)];ob=line('Octagonal core housing',pts,silver if k else cyan,.04);ob.parent=core
for g,at,offset in parts:
 # Cubic acceleration, snap into the socket, then damped mechanical recoil.
 for f in range(1,241):
  t=(f-1)/30;u=sat((t-(at-.38))/.38);loc=offset*(1-u**3)
  if t>=at:loc=offset.normalized()*(.17*math.exp(-(t-at)*16)*math.sin((t-at)*55))
  key(g,'location',f,loc);key(g,'scale',f,(smooth(u*5),)*3);key(g,'rotation_euler',f,(0,0,(1-u)*(.36 if offset.x>=0 else -.36)))
for f in range(1,241):
 t=(f-1)/30;angle=-.85 if not a.portrait else -.25;wind=smooth((t-3.75)/.36);cut=sat((t-4.19)/.23);cut=1-(1-cut)**3;after=sat((t-4.42)/.23);floatz=.04*math.sin(t*2)
 key(hero,'rotation_euler',f,(.06,angle-.24*wind+2.72*cut,.025*math.sin(t)));key(hero,'location',f,(-.2+cut*2.0,-.3-wind*.9-cut*2.0,floatz-1.30-cut*.5));key(hero,'scale',f,((1-after),)*3)
# Assembly impact halos and hundreds of physical splinters, each timed to its collision.
for index,at in enumerate([.86,1.1,1.38,1.73,1.88,2.08,2.28,2.48,2.68,2.88,3.03,4.23]):
 origin=Vector((0,-.5,-2.5+(index-3)*1.35)) if index>=3 and index<11 else Vector((0,-.5,0))
 parent=hero if 2<=index<11 else None
 if index==10:origin=Vector((0,-.5,-2.5))
 for ring in range(2):
  pts=[(math.cos(j*math.tau/96),.14*math.sin(j*.4),math.sin(j*math.tau/96)) for j in range(97)];ob=line('Pressure ring at forge collision',pts,cyan if ring==0 else violet,.015 if ring==0 else .035);ob.parent=parent;ob.location=origin
  for f in range(max(1,int((at-.05)*30)),min(241,int((at+.55)*30))):
   dt=(f-1)/30-at;v=easeout(dt/.45)*(2.1 if index<11 else 18)*(1+ring*.2);key(ob,'scale',f,(v,)*3);key(ob.data,'bevel_depth',f,max(.0001,(.025 if ring==0 else .06)*(1-sat(dt/.50))))
  key(ob,'scale',1,(0,)*3);key(ob,'scale',min(240,int((at+.57)*30)),(0,)*3)
 for j in range(26 if index<11 else 130):
  ob=shard('Forge ballistic ion splinter',sparkmesh,parent);th=random.random()*math.tau;speed=random.uniform(3,10) if index<11 else random.uniform(10,27);velocity=Vector((math.cos(th)*speed,random.uniform(-4,4),math.sin(th)*speed));life=random.uniform(.20,.60);sz=random.uniform(.02,.08)
  for k in range(9):
   dt=life*k/8;f=round((at+dt)*30)+1;pos=origin+velocity*dt;key(ob,'location',f,pos);key(ob,'rotation_euler',f,(0,math.pi/2-th,dt*3));key(ob,'scale',f,(sz*(1-k/8),sz*.5*(1-k/8),sz*(3+speed*.35)*(1-k/8)))
  key(ob,'scale',1,(0,)*3);key(ob,'scale',max(2,round(at*30)),(0,)*3)
# Orbiting helixes are continuously travelling trails, with independent phases and depth.
for k in range(30):
 phase=random.random()*math.tau;pts=[];radius=random.uniform(4.0,9.0)
 for j in range(110):
  u=j/109;th=phase+u*math.tau*1.7;r=(1.0+radius*.40*math.sin(u*math.pi)) if k<22 else radius*(1-.3*u)
  if k<22:
   x=r*math.cos(th);z=-7+u*17;angle=-.25 if a.portrait else -.85;pts.append((x*math.cos(angle)+z*math.sin(angle),3+r*.65*math.sin(th),z*math.cos(angle)-x*math.sin(angle)-1.1))
  else:pts.append((r*math.cos(th),3+4*math.sin(th*.7)+u*2,r*math.sin(th)))
 ob=line('Chaotic orbital energy ribbon',pts,cyan if k%6==0 else magenta if k%4==0 else violet,random.uniform(.009,.024))
 for f in range(1,241,2):
  t=(f-1)/30;scale=smooth((t-.75-k*.018)/.45)*(1-smooth((t-4.20)/.27));key(ob,'scale',f,(scale,)*3);key(ob,'rotation_euler',f,(.08*math.sin(t+k),.12*math.sin(t*2+k) if k<22 else t*(.8 if k%2 else -1.1),.10*math.cos(t+k)));key(ob.data,'bevel_factor_start',f,.15+.15*math.sin(t*4+k));key(ob.data,'bevel_factor_end',f,.6+.3*math.sin(t*3+k)**2)
# Jagged electric forks jump to the blade as it charges; noisy but leave its silhouette clear.
for k in range(38):
 th=random.random()*math.tau;r=random.uniform(8,16);end=Vector((random.uniform(-1.5,1.5),1,random.uniform(-2,4)));pts=[]
 for j in range(18):
  u=j/17;pt=Vector((r*math.cos(th),3,r*math.sin(th))).lerp(end,u)+Vector((random.uniform(-.3,.3),0,random.uniform(-.35,.35)))*math.sin(u*math.pi);pts.append(pt)
 ob=line('Arcing hostile space fracture',pts,violet if k%3 else magenta,.012 if k%2 else .025);at=2.80+k*.032;visible(ob,int(at*30),int((at+.07)*30),128,1)
# Overlapping bent slash surfaces: main cyan edge, violet body, magenta secondary wakes.
for k in range(12):
 vs=[];fs=[]
 for j in range(151):
  u=j/150;x=(u-.5)*44;z=-x*.42+math.sin(u*math.pi)*(.4+k*.30)-k*.14;y=-3.0+k*.16;width=(math.sin(u*math.pi)**.65)*(.26 if k==0 else .045+(.15 if k==1 else 0));vs.extend([(x,y,z-width),(x,y,z+width)])
  if j:fs.append((j*2-2,j*2-1,j*2+1,j*2))
 ob=mesh('Layered superluminal severance',vs,fs,[cyan if k<2 else violet if k%2 else magenta]);visible(ob,125+k//3,129+k//3,145+k,1)
for k in range(90):
 x=random.uniform(-15,15);z=-x*.42;pts=[(x,-3,z)]
 for j in range(random.randint(3,8)):
  x+=random.uniform(-.9,.9);z+=(1 if k%2 else -1)*random.uniform(.15,.75);pts.append((x,-3+random.uniform(-.3,.3),z))
 ob=line('Shattered reality branching vein',pts,cyan if k%4==0 else violet,.008+random.random()*.009);visible(ob,128+k%3,134+k%5,166+k%11)
# Stretching radial streaks sell the speed of the blast, with multiple depth planes.
for k in range(110):
 ob=shard('Ballistic reality splinter',sparkmesh if k%5==0 else shardmesh);th=random.random()*math.tau;r=random.uniform(1,5);origin=Vector((math.cos(th)*r,random.uniform(-1,6),math.sin(th)*r));velocity=Vector((math.cos(th)*random.uniform(8,20),random.uniform(-13,-5),math.sin(th)*random.uniform(7,16)));sz=random.uniform(.045,.22);at=4.23+random.uniform(0,.11)
 key(ob,'scale',1,(0,)*3);key(ob,'scale',round(at*30),(0,)*3)
 for kf in range(16):
  dt=kf/15*.85;f=round((at+dt)*30)+1;pos=origin+velocity*dt+Vector((0,0,-dt*dt*1.8));key(ob,'location',f,pos);key(ob,'rotation_euler',f,(dt*5,th+dt*2,dt*3));key(ob,'scale',f,(sz*(1-dt/.85),sz*.7*(1-dt/.85),sz*3*(1-dt/.85)))
for k in range(85):
 th=random.random()*math.tau;r=random.uniform(3,12);y=random.uniform(-6,9);pts=[(math.cos(th)*rr,y,math.sin(th)*rr) for rr in [r,r+random.uniform(1,4)]];ob=line('Rupture speed streak',pts,cyan if k%5==0 else violet,.010 if k%3 else .022);visible(ob,128+k%4,132+k%5,149+k%13)
# The ruptured space becomes an irregular protective crystal crown, without an opaque bubble.
for k in range(13):
 th=k*math.tau/13;rr=4.5+random.uniform(-.25,.25);pts=[]
 for r,ang,dep in [(rr-.9,th-.14,-.8),(rr-.7,th+.15,-.7),(rr+1.7,th+.20,1.4),(rr+2.7,th+.025,2.1),(rr+1.25,th-.19,.3)]:pts.append((r*math.cos(ang),dep,r*math.sin(ang)))
 mid=sum((Vector(p) for p in pts),Vector())/5;mid.y-=.45;ob=mesh('Protective interlocking crystal feather',pts+[tuple(mid)],[(j,(j+1)%5,5) for j in range(5)],[ice,blue,purple,silver,blue]);edge=line('Crystal crown cold rim',pts+[pts[0]],pale,.018)
 for item in [ob,edge]:
  for f in range(1,241,2):
   t=(f-1)/30;u=easeout((t-5.5-k*.015)/1.05);scale=u*(1+.25*smooth((t-7.0)/1));key(item,'scale',f,(scale,)*3);key(item,'rotation_euler',f,(0,(1-u)*1.0,0))
for k in range(16):
 th=k*math.tau/16;pts=[]
 for j in range(30):
  t=th+j/29*.22;r=4.12+.09*math.sin(j*.4);pts.append((r*math.cos(t),-.65,r*math.sin(t)))
 ob=line('Protective electrical perimeter',pts,cyan if k%4==0 else violet,.025);visible(ob,169+k%4,191+k%4,240,1)
# Three hostile lances refract away from the crown rather than dealing damage.
for index,th in enumerate([.5,2.7,4.65]):
 at=6.2+index*.1;origin=Vector((4.6*math.cos(th),-.7,4.6*math.sin(th)));pts=[tuple(origin+Vector((math.cos(th)*r,1+r*.10,math.sin(th)*r))) for r in [10,6,3,0]];ob=line('Hostile lance stopped by protection',pts,magenta,.036)
 visible(ob,int((at-.21)*30),int(at*30),int((at+.10)*30))
 for j in range(38):
  ob=shard('Refracted protective spray',sparkmesh);theta=th+random.uniform(-1.2,1.2);vel=Vector((math.cos(theta)*random.uniform(3,10),random.uniform(-3,3),math.sin(theta)*random.uniform(3,10)));sz=random.uniform(.025,.075);life=random.uniform(.25,.48)
  key(ob,'scale',1,(0,)*3);key(ob,'scale',round(at*30),(0,)*3)
  for kf in range(9):
   dt=life*kf/8;f=round((at+dt)*30)+1;key(ob,'location',f,origin+vel*dt);key(ob,'rotation_euler',f,(0,math.pi/2-theta,dt));key(ob,'scale',f,(sz*(1-kf/8),sz*.5*(1-kf/8),sz*3*(1-kf/8)))
# Camera: snap back with every forging hit; 4.03 s hold -> ballistic cut -> damped shock.
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.sensor_fit='HORIZONTAL';cam.data.lens=61 if a.portrait else 37;cam.data.clip_end=180
shots=[(0,(0,-23,1),(0,0,0),-.04),(.7,(.6,-21,.6),(0,0,0),.02),(1.1,(-.4,-24,.4),(0,0,.5),-.05),(2.9,(-.4,-24,.9),(0,0,.7),.025),(3.8,(-.25,-23.2,.8),(0,0,.7),.02),(4.10,(-.2,-23.8,.7),(0,0,.7),-.04),(4.26,(.3,-24.5,.5),(0,0,.3),.075),(4.60,(.1,-26,.4),(0,0,0),-.015),(5.7,(0,-23,.3),(0,0,0),0),(6.8,(0,-22,0),(0,0,0),0),(8,(0,-15,0),(0,2,0),0)]
for f in range(1,241):
 t=(f-1)/30
 for j in range(len(shots)-1):
  ta,pa,qa,ra=shots[j];tb,pb,qb,rb=shots[j+1]
  if ta<=t<=tb:
   u=smooth((t-ta)/(tb-ta));pos=Vector(pa).lerp(Vector(pb),u);target=Vector(qa).lerp(Vector(qb),u);roll=ra+(rb-ra)*u;break
 recoil=sum(.11*math.exp(-(t-at)*19)*math.sin((t-at)*47) for at in impacts if 0<t-at<.4);shake=.19*math.exp(-(t-4.23)*9) if t>4.23 else 0;pos+=Vector((recoil+math.sin(t*106)*shake,recoil*3,math.cos(t*83)*shake));rot=(target-pos).to_track_quat('-Z','Y').to_euler();rot.rotate_axis('Z',roll+recoil*.07);key(cam,'location',f,pos);key(cam,'rotation_euler',f,rot)
# Short, keyed reality-collapse filter: RGB dispersion and displaced horizontal fragments.
s.use_nodes=True;n=s.node_tree.nodes;n.clear();links=s.node_tree.links;rl=n.new('CompositorNodeRLayers');dn=n.new('CompositorNodeDenoise');links.new(rl.outputs['Image'],dn.inputs['Image']);gl=n.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=1.8;gl.size=8;gl.mix=-.58;links.new(dn.outputs[0],gl.inputs['Image']);lens=n.new('CompositorNodeLensdist');lens.use_fit=True;links.new(gl.outputs[0],lens.inputs['Image']);current=lens.outputs[0]
events=[(1.73,.38),(2.08,.30),(2.48,.36),(2.88,.5),(3.03,.55),(4.23,1),(4.40,.55),(4.73,.35)]
def glitch(t):return max([amp*math.exp(-(t-at)*24) if 0<=t-at<.18 else 0 for at,amp in events])
for f in range(1,241):
 g=glitch((f-1)/30);lens.inputs['Dispersion'].default_value=.003+g*.032;lens.inputs['Dispersion'].keyframe_insert('default_value',frame=f);lens.inputs['Distortion'].default_value=g*.019;lens.inputs['Distortion'].keyframe_insert('default_value',frame=f)
for i in range(5):
 trans=n.new('CompositorNodeTranslate');links.new(current,trans.inputs['Image']);mask=n.new('CompositorNodeBoxMask');mask.x=.5;mask.y=.14+i*.18;mask.width=1;mask.height=.015+i*.009;mul=n.new('CompositorNodeMath');mul.operation='MULTIPLY';links.new(mask.outputs[0],mul.inputs[0]);mix=n.new('CompositorNodeMixRGB');links.new(mul.outputs[0],mix.inputs[0]);links.new(current,mix.inputs[1]);links.new(trans.outputs[0],mix.inputs[2]);current=mix.outputs[0]
 for f in range(1,241):
  g=glitch((f-1)/30);trans.inputs['X'].default_value=g*(50+i*9)*(-1 if i%2 else 1);trans.inputs['X'].keyframe_insert('default_value',frame=f);mul.inputs[1].default_value=min(1,g*1.5);mul.inputs[1].keyframe_insert('default_value',frame=f)
fade=n.new('CompositorNodeMixRGB');fade.inputs[2].default_value=(.003,.001,.010,1);links.new(current,fade.inputs[1]);comp=n.new('CompositorNodeComposite');links.new(fade.outputs[0],comp.inputs[0])
for f,v in [(1,.80),(13,0),(209,0),(228,.20),(240,1)]:fade.inputs[0].default_value=v;fade.inputs[0].keyframe_insert('default_value',frame=f)
for datablocks in [bpy.data.objects,bpy.data.curves]:
 for obj in datablocks:
  if obj.animation_data and obj.animation_data.action:
   for fc in obj.animation_data.action.fcurves:
    for kp in fc.keyframe_points:kp.interpolation='LINEAR'
s['cinematic']='discord-v2';s['asset_version']='1.1.0';s['duration_seconds']=8;s['handoff_seconds']=6.8;s['presentation_only']=True;s.frame_set(106);(out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.wm.save_as_mainfile(filepath=str(out/'discord.blend'))
(out/'scene-metadata.json').write_text(json.dumps({'version':'1.1.0','duration':8,'frames':240,'fps':30,'portrait':a.portrait,'bladeLength':13.25,'swordLength':17.1,'swordComponents':len(parts),'objects':len(bpy.data.objects),'handoff':6.8,'theme':'chaotic purple blue card-inspired greatsword and crystal rupture','postprocess':'Denoise, bloom, keyed RGB split and horizontal displacement','noGameState':True},indent=2),encoding='utf-8')
if a.save_only:raise SystemExit()
if a.frames:
 for f in map(int,a.frames.split(',')):
  s.frame_set(f);s.render.filepath=str(out/f'key-{f:03}.png');bpy.ops.render.render(write_still=True)
else:bpy.ops.render.render(animation=True)
