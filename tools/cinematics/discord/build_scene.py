"""Card-inspired purple/blue crystal-space film. Original offline geometry, 8 s.
Blender 4.5 EEVEE; no game data, characters, temple or baked player identity.
"""
import argparse, math, random, sys, json
from pathlib import Path
import bpy
from mathutils import Vector
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--frames',default='');p.add_argument('--scale',type=int,default=100);p.add_argument('--samples',type=int,default=40);p.add_argument('--save-only',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
out=Path(a.out).resolve();out.mkdir(parents=True,exist_ok=True);random.seed(43106)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.render.resolution_x=1000 if a.portrait else 1600;s.render.resolution_y=1600 if a.portrait else 1000;s.render.resolution_percentage=a.scale;s.render.fps=30;s.frame_start=1;s.frame_end=240
s.eevee.taa_render_samples=a.samples;s.eevee.use_raytracing=True;s.eevee.volumetric_tile_size='16';s.eevee.volumetric_samples=48;s.eevee.shadow_pool_size='1024';s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=20
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=.15
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.012,.12,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.45

def key(o,prop,f,value):setattr(o,prop,value);o.keyframe_insert(data_path=prop,frame=f)
def smooth(x):x=max(0,min(1,x));return x*x*(3-2*x)
def mat(name,color,metal=.3,rough=.2,emit=0,trans=0):
 m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*color,1);b.inputs['Metallic'].default_value=metal;b.inputs['Roughness'].default_value=rough;b.inputs['Transmission Weight'].default_value=trans;b.inputs['IOR'].default_value=1.46;b.inputs['Coat Weight'].default_value=.5;b.inputs['Coat Roughness'].default_value=.08;b.inputs['Emission Color'].default_value=(*color,1);b.inputs['Emission Strength'].default_value=emit;return m
def mesh(name,verts,faces,mats):
 d=bpy.data.meshes.new(name);d.from_pydata(verts,[],faces);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o)
 for m in mats:d.materials.append(m)
 for f in d.polygons:f.material_index=f.index%len(mats)
 return o
def line(name,pts,m,r=.012):
 d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=2;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
 for v,pt in zip(sp.points,pts):v.co=(*pt,1)
 o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(m);return o
def empty(name):o=bpy.data.objects.new(name,None);s.collection.objects.link(o);return o
def cube(name,loc,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);b=o.modifiers.new('Fine rounded edges','BEVEL');b.width=.025;b.segments=3;return o
def light(name,loc,col,power,size):
 d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=col;d.shape='DISK';d.size=size;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(-o.location).to_track_quat('-Z','Y').to_euler();return o
purple=mat('Deep amethyst cut faces',(.10,.012,.30),.45,.13,.055,.4);blue=mat('Sapphire prism faces',(.028,.14,.47),.4,.11,.07,.4);ice=mat('Opaline cyan faces',(.20,.66,.81),.45,.12,.12,.35);pink=mat('Iridescent violet facets',(.34,.065,.44),.73,.22,.06,.08)
cyan=mat('White cyan cutting light',(.23,.77,1),.15,.2,5);violet=mat('Violet filaments',(.40,.025,1),.2,.24,3);pale=mat('Silver-white prism edge',(.60,.85,1),.55,.2,1.0);red=mat('Discord magenta attack',(.6,.015,.12),.4,.25,2.5);dark=mat('Black violet obsidian',(.025,.007,.055),.75,.2,.02)
# Broad colored light reflects on facets rather than relying only on glowing wireframes.
light('Cyan softbox',(-8,-6,8),(.14,.66,1),3200,9);light('Violet rim',(8,5,4),(.50,.06,1),4400,8);light('Pearl rim',(-3,8,-5),(.42,.50,1),4000,7);light('Rose reflection',(7,-8,-3),(.63,.14,.53),1100,8)
# Structured nebula: low density gives volumetric depth without obscuring the facets.
vol=bpy.data.materials.new('Violet depth haze');vol.use_nodes=True;ns=vol.node_tree.nodes;ns.clear();output=ns.new('ShaderNodeOutputMaterial');pv=ns.new('ShaderNodeVolumePrincipled');pv.inputs['Color'].default_value=(.20,.08,.36,1);pv.inputs['Density'].default_value=.006;pv.inputs['Anisotropy'].default_value=.28;vol.node_tree.links.new(pv.outputs[0],output.inputs['Volume']);cube('Haze volume',(0,5,0),(75,85,75),vol)
# Triangular beveled crystal prisms, broad faces plus fine emissive edge veins.
verts=[(-.40,0,-1.0),(.35,0,-.62),(.55,0,.18),(.09,0,1.3),(-.52,0,.38),(-.18,.19,-.06),(.10,-.13,.07)]
faces=[(0,1,6),(1,2,6),(2,3,6),(3,4,6),(4,0,6),(0,5,1),(1,5,2),(2,5,3),(3,5,4),(4,5,0)]
proto=mesh('Shared faceted shard',verts,faces,[purple,blue,ice,pink]);shardmesh=proto.data;bpy.data.objects.remove(proto,do_unlink=True)
# Multiple layers spiral through a camera corridor, then rupture and form a protective dome.
for i in range(140):
 o=bpy.data.objects.new(f'Crystal space panel {i:03}',shardmesh);s.collection.objects.link(o)
 th=i*2.399963;radius=random.uniform(6.0,13.0);base=Vector((math.cos(th)*radius,random.uniform(-7,20),math.sin(th)*radius));size=random.uniform(.6,2.3)*(1.4 if i<22 else 1)
 if i<22:size*=1.25
 targetth=(i%30)*math.tau/30;layer=i//30;shield=Vector((math.cos(targetth)*(4.0+layer*.48),2.0+layer*.8,math.sin(targetth)*(4.0+layer*.48)))
 rot=Vector((random.uniform(-.4,.4),random.uniform(-1,1),random.uniform(-.7,.7)))
 for f in range(1,241,3):
  t=(f-1)/30;spin=.10*min(t,3.8);c=math.cos(spin);q=math.sin(spin);pos=Vector((base.x*c-base.z*q,base.y-.45*min(t,3.8),base.z*c+base.x*q))
  growth=smooth((t-.2-(i%9)*.065)/1.1)
  explode=smooth((t-4.16)/.6);pos+=Vector((math.copysign(2.8,base.x),-1.5,math.copysign(1.8,base.z)))*explode
  u=smooth((t-5.15)/1.3);pos=pos.lerp(shield,u);zrot=rot.z+spin+(i%2*2-1)*explode*.40
  key(o,'location',f,pos);key(o,'rotation_euler',f,(rot.x*(1-u),rot.y*(1-u)+(math.pi/2-targetth)*u,zrot*(1-u)));key(o,'scale',f,(size*growth*(1-.72*u),size*growth*(1-.65*u),size*growth*(1-.65*u)))
 # Fine diagonal fracture cut, follows local panel transform.
 if i%2==0:
  edge=line('Panel polished fracture',[verts[j] for j in [0,2,1]],pale if i%4 else violet,.006);edge.parent=o
# Floating fine debris, different depth planes reveal camera parallax.
for i in range(450):
 o=bpy.data.objects.new(f'Specular crystal dust {i:03}',shardmesh);s.collection.objects.link(o);r=random.uniform(2.5,19);th=random.random()*math.tau;y=random.uniform(-9,22);size=random.uniform(.018,.085)
 for f in [1,115,133,164,207,240]:
  t=(f-1)/30;burst=smooth((t-4.18)/.6);rnow=r*(1+.35*burst);key(o,'location',f,(rnow*math.cos(th+t*.07),y-t*.22,rnow*math.sin(th+t*.07)));key(o,'rotation_euler',f,(t*.4+i,t*.18,th));key(o,'scale',f,(size,size*.4,size*2.4))
# A prismatic lens at the vanishing point, with asymmetric spires and shattered halo.
for i in range(32):
 th=i*math.tau/32;pts=[]
 for j in range(18):
  angle=th+j/17*.11;r=10.8+.5*math.sin(angle*5);pts.append((r*math.cos(angle),18,r*math.sin(angle)))
 o=line('Distant fractured horizon',pts,violet,.025 if i%3 else .065)
# Two physical-cost symbols. No original copyrighted face is copied into the film.
for side in [-1,1]:
 group=empty('Spent attack card');card=cube('Obsidian cost card',(0,0,0),(1.05,.10,1.55),dark);card.parent=group
 for k in [-1,1]:
  ln=line('Red cost engraving',[(k*.39,-.064,-.56),(k*.39,-.064,.56),(-k*.39,-.064,.56)],red,.014);ln.parent=group
 glyph=line('Crossed attack slash',[(-.22,-.073,-.38),(.24,-.073,.38)],red,.035);glyph.parent=group
 for f,scale,pos,ry in [(1,1,(side*1.0,-7,-.2),side*.14),(16,1,(side*1.2,-6,.1),side*.35),(31,1,(side*1.5,-5,.6),side*.6),(40,0,(side*2.5,-4,1.2),side*1.2)]:
  key(group,'location',f,pos);key(group,'rotation_euler',f,(.08,ry,side*.16));key(group,'scale',f,(scale,scale,scale))
# White and cyan folded ribbons: curved surfaces have width and changing normals.
for k in range(6):
 vs=[];fs=[];phase=k*math.tau/6
 for j in range(151):
  u=j/150;theta=phase+u*math.tau*.6;r=10*(1-u)+1.5;center=Vector((r*math.cos(theta),12-18*u,r*math.sin(theta)));width=(.018+.15*math.sin(math.pi*u)**2)*(1.6 if k%4==0 else .6);side=Vector((math.cos(theta),.25,math.sin(theta)))
  vs.extend([center-side*width,center+side*width]);
  if j:fs.append((j*2-2,j*2-1,j*2+1,j*2))
 o=mesh('Twisting opalescent ribbon',vs,fs,[ice]);edge=line('Ribbon inner luminous thread',[vs[j] for j in range(0,len(vs),2)],cyan if k%3==0 else violet,.009)
 for obj in [o,edge]:
  for f,v in [(1,0),(28+k,0),(75+k,1),(114,1),(127,.4),(136,0)]:key(obj,'scale',f,(v,)*3)
# Faceted moon-light sword, diagonally hovering before a physical screen-spanning cut.
root=empty('Prismatic greatblade');root.location=(0,-.5,0)
blade=mesh('Diamond section blade',[(-.48,0,-1.8),(.48,0,-1.8),(.34,0,4.6),(0,0,6),(-.34,0,4.6),(0,-.20,-1.8),(0,-.13,4.6),(0,.20,-1.8),(0,.13,4.6)],[(0,5,6,4),(5,1,2,6),(4,6,3),(6,2,3),(0,4,8,7),(7,8,2,1),(4,3,8),(8,3,2),(0,7,1,5)],[pale,ice,blue,ice]);blade.parent=root
vein=line('Blade incandescent ridge',[(0,-.205,-1.5),(0,-.15,4.55),(0,0,5.9)],cyan,.017);vein.parent=root
for side in [-1,1]:
 o=mesh('Winged crystal guard',[(0,0,-1.75),(side*1.45,.02,-1.2),(side*.85,-.12,-1.95),(0,-.13,-2.08)],[(0,1,2),(0,2,3)],[ice,purple]);o.parent=root
for side in [-1,1]:
 for j in range(6):
  z=-.8+j*.75
  rune=line('Etched silver blade chevron',[(side*.06,-.211,z-.12),(side*.24,-.16,z+.1),(side*.07,-.211,z+.36)],cyan,.006);rune.parent=root
hilt=cube('Prismatic sword grip',(0,0,-2.5),(.18,.23,.9),dark);hilt.parent=root
for f,v,pos,angle in [(1,0,(0,0,-1),-.62),(50,0,(0,0,-1),-.62),(85,.9,(0,0,0),-.62),(111,1.05,(0,-.4,.15),-.65),(125,1.07,(.2,-.8,.25),-.72),(131,1.12,(1.1,-2,0),-2.1),(138,0,(6,-5,-3),-2.4)]:
 key(root,'scale',f,(v,)*3);key(root,'location',f,pos);key(root,'rotation_euler',f,(.07,angle,0))
# Attacks: jagged violet/magenta lances terminate at the future boundary.
for k in range(10):
 th=k*math.tau/10+.2;pts=[]
 for j in range(75):
  u=j/74;r=17-13*u;pts.append((math.cos(th)*r+.18*math.sin(j*1.8),3-u*5,math.sin(th)*r+.14*math.sin(j*1.2)))
 o=line('Incoming hostile lance',pts,red if k%3==0 else violet,.034)
 for f,v in [(1,0),(85+k,0),(120,1)]:key(o.data,'bevel_factor_end',f,v)
 for f,v in [(1,0),(126,0),(143,1)]:key(o.data,'bevel_factor_start',f,v)
# Three-dimensional slash sheet: an inclined tapered crescent with layered wake.
for k in range(5):
 vs=[];fs=[]
 for j in range(181):
  u=j/180;x=(u-.5)*42;z=x*.40+math.sin(u*math.pi)*.75;y=-3.2+k*.28
  w=(math.sin(u*math.pi)**.6)*(.10 if k else .35)
  vs.extend([(x,y,z-w),(x,y,z+w)])
  if j:fs.append((j*2-2,j*2-1,j*2+1,j*2))
 o=mesh('White-cyan severance wave',vs,fs,[cyan if k<2 else violet]);
 for f,v in [(1,0),(124+k,0),(128+k,1),(136+k,1),(146+k,0)]:key(o,'scale',f,(v,v,v))
# Fracture network blooms out from slash, not a flat decorative ring.
for k in range(55):
 x=random.uniform(-14,14);z=x*.4+random.uniform(-.2,.2);pts=[(x,-3,z)]
 for j in range(random.randint(3,7)):
  x+=random.uniform(-.8,.8);z+=(1 if k%2 else -1)*random.uniform(.3,1.0);pts.append((x,-3+random.uniform(-.2,.2),z))
 o=line('Space fracture veins',pts,cyan if k%3 else violet,.009)
 for f,v in [(1,0),(128,0),(135+k%5,1),(153,1),(171,0)]:key(o,'scale',f,(v,)*3)
# Interlocking large crystalline arcs: irregular non-rectangular facets with central aperture.
for k in range(9):
 th=k*math.tau/9;pts=[]
 for rr,ang,dep in [(3.4,th-.24,-1.2),(3.7,th+.25,-1.1),(5.2,th+.38,.6),(6.3,th+.07,2.0),(5.5,th-.34,.9)]:pts.append((rr*math.cos(ang),dep,rr*math.sin(ang)))
 mid=Vector((0,0,0))
 for pt in pts:mid+=Vector(pt)/5
 mid.y-=.45;vs=pts+[tuple(mid)]
 o=mesh('Interlocking protective crystal',vs,[(j,(j+1)%5,5) for j in range(5)],[ice,blue,purple,blue,pink]);edge=line('Living crystalline seam',pts+[pts[0]],pale,.018)
 for ob in [o,edge]:
  for f,v in [(1,0),(158+k%4,0),(190+k%5,1),(219,1),(240,1.45)]:key(ob,'scale',f,(v,)*3)
# Thin-film central membrane, curved and almost transparent, catches travelling impacts.
mem=mat('Blue violet thin-film protection',(.10,.22,.65),.15,.10,.10,.65)
mn=mem.node_tree.nodes;mn.clear();ml=mem.node_tree.links;mo=mn.new('ShaderNodeOutputMaterial');mt=mn.new('ShaderNodeBsdfTransparent');me=mn.new('ShaderNodeEmission');me.inputs[0].default_value=(.10,.25,1,1);me.inputs[1].default_value=1.7;lw=mn.new('ShaderNodeLayerWeight');lw.inputs['Blend'].default_value=.3;mx=mn.new('ShaderNodeMixShader');ml.new(lw.outputs['Fresnel'],mx.inputs[0]);ml.new(mt.outputs[0],mx.inputs[1]);ml.new(me.outputs[0],mx.inputs[2]);ml.new(mx.outputs[0],mo.inputs['Surface'])
bpy.ops.mesh.primitive_uv_sphere_add(segments=72,ring_count=40,radius=4.0,location=(0,.9,0));bubble=bpy.context.object;bubble.name='Transparent protective membrane';bubble.data.materials.append(mem)
for poly in bubble.data.polygons:poly.use_smooth=True
for f,v in [(1,0),(165,0),(195,1),(220,1),(240,1.6)]:key(bubble,'scale',f,(v,v*.55,v))
# Impact against formed barrier, sparks travel outwards along refracted angles.
for i in range(145):
 o=bpy.data.objects.new('Refracted impact ember',shardmesh);s.collection.objects.link(o);th=random.choice([.6,2.8,4.9]);at=6.20+(i%3)*.10;origin=Vector((4.8*math.cos(th),-1,4.8*math.sin(th)));dest=origin+Vector((random.uniform(-3,3),random.uniform(-3,1),random.uniform(-3,3)))
 for f,loc,sz in [(1,origin,0),(int(at*30),origin,0),(int(at*30)+2,origin,.075),(int(at*30)+13,dest,.05),(int(at*30)+24,dest,0)]:key(o,'location',f,loc);key(o,'scale',f,(sz,sz*.5,sz*2))
# Camera moves through the shards; portrait has its own wider physical view of the action.
bpy.ops.object.camera_add();cam=bpy.context.object;s.camera=cam;cam.data.lens=35 if a.portrait else 39;cam.data.sensor_width=36;cam.data.clip_end=160
shots=[(0,(0,-22,1.5),(0,0,0),.03),(1.25,(1,-20,.8),(0,2,0),-.07),(2.6,(-1,-23,1.7),(0,2,1),.04),(3.95,(-.5,-22,.8),(0,0,1),.025),(4.5,(.7,-25,.7),(0,0,0),-.03),(5.8,(0,-23,.4),(0,1,0),.0),(6.85,(0,-20,0),(0,2,0),0),(8,(0,-12,0),(0,4,0),0)]
for f in range(1,241):
 t=(f-1)/30
 for j in range(len(shots)-1):
  ta,pa,qa,ra=shots[j];tb,pb,qb,rb=shots[j+1]
  if ta<=t<=tb:
   u=smooth((t-ta)/(tb-ta));pos=Vector(pa).lerp(Vector(pb),u);target=Vector(qa).lerp(Vector(qb),u);roll=ra+(rb-ra)*u;break
 if a.portrait:pos.y*=1.12
 shake=.08*math.exp(-(t-4.22)*9) if t>4.22 else 0;pos+=Vector((math.sin(t*110)*shake,0,math.cos(t*80)*shake))
 rot=(target-pos).to_track_quat('-Z','Y').to_euler();rot.rotate_axis('Z',roll);key(cam,'location',f,pos);key(cam,'rotation_euler',f,rot)
# Composited bloom and a brief physically legible impact exposure, clean fade for live UI handoff.
s.use_nodes=True;n=s.node_tree.nodes;n.clear();l=s.node_tree.links;rl=n.new('CompositorNodeRLayers');gl=n.new('CompositorNodeGlare');gl.glare_type='FOG_GLOW';gl.quality='HIGH';gl.threshold=1.4;gl.size=8;gl.mix=-.55;l.new(rl.outputs['Image'],gl.inputs['Image']);fade=n.new('CompositorNodeMixRGB');fade.inputs[2].default_value=(.007,.002,.020,1);l.new(gl.outputs['Image'],fade.inputs[1]);comp=n.new('CompositorNodeComposite');l.new(fade.outputs[0],comp.inputs[0])
for f,v in [(1,.75),(16,0),(207,0),(225,.25),(240,1)]:fade.inputs[0].default_value=v;fade.inputs[0].keyframe_insert('default_value',frame=f)
for obj in bpy.data.objects:
 if obj.animation_data and obj.animation_data.action:
  for fc in obj.animation_data.action.fcurves:
   for kp in fc.keyframe_points:kp.interpolation='LINEAR'
s['cinematic']='discord-v1';s['duration_seconds']=8;s['handoff_seconds']=6.8;s['presentation_only']=True;s.frame_set(105);s.render.filepath=str(out/'frames/frame-')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'discord.blend'))
(out/'scene-metadata.json').write_text(json.dumps({'duration':8,'frames':240,'fps':30,'portrait':a.portrait,'panels':140,'dust':450,'handoff':6.8,'theme':'card-inspired violet blue fractured crystal space','noGameState':True},indent=2),encoding='utf-8')
if a.save_only:raise SystemExit()
if a.frames:
 for f in map(int,a.frames.split(',')):
  s.frame_set(f);s.render.filepath=str(out/f'key-{f:03}.png');bpy.ops.render.render(write_still=True)
else:
 (out/'frames').mkdir(exist_ok=True);s.render.filepath=str(out/'frames/frame-');bpy.ops.render.render(animation=True)
