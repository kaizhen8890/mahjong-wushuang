"""Forbidden codex: original procedural Blender 4.5 scene, 168 frames / 5.6s.
blender -b --python build_scene.py -- --out DIR --textures DIR [--portrait] [--preview]
"""
import bpy, math, random, argparse, sys, os, json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
random.seed(13102026)
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--textures',required=True);p.add_argument('--portrait',action='store_true');p.add_argument('--preview',action='store_true');a=p.parse_args(sys.argv[sys.argv.index('--')+1:])
a.out=os.path.abspath(a.out);a.textures=os.path.abspath(a.textures);os.makedirs(a.out,exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=64;s.eevee.use_raytracing=True
s.render.resolution_x,s.render.resolution_y=(1000,1600) if a.portrait else (1600,1000)
s.render.resolution_percentage=100;s.render.fps=30;s.frame_start=1;s.frame_end=168
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.film_transparent=False
s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.03,.045,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.23
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast';s.view_settings.exposure=-.15
def mat(name,color,metal=0,rough=.5,noise=0,emit=0):
    m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*color,1);bs.inputs['Metallic'].default_value=metal;bs.inputs['Roughness'].default_value=rough
    if emit:bs.inputs['Emission Color'].default_value=(*color,1);bs.inputs['Emission Strength'].default_value=emit
    if noise:
        tc=n.new('ShaderNodeTexCoord');tex=n.new('ShaderNodeTexNoise');tex.inputs['Scale'].default_value=noise;tex.inputs['Detail'].default_value=3;l.new(tc.outputs['Object'],tex.inputs['Vector'])
        r=n.new('ShaderNodeValToRGB');r.color_ramp.elements[0].color=(*[v*.27 for v in color],1);r.color_ramp.elements[1].color=(*color,1);l.new(tex.outputs['Fac'],r.inputs[0]);l.new(r.outputs[0],bs.inputs['Base Color'])
        b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.22;b.inputs['Distance'].default_value=.014;l.new(tex.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],bs.inputs['Normal'])
    return m
def image_mat(name,file,alpha=False):
    m=mat(name,(.7,.6,.4),rough=.72);n=m.node_tree.nodes;l=m.node_tree.links;bs=n.get('Principled BSDF');im=n.new('ShaderNodeTexImage');im.image=bpy.data.images.load(os.path.join(a.textures,file));l.new(im.outputs['Color'],bs.inputs['Base Color'])
    if alpha:l.new(im.outputs['Alpha'],bs.inputs['Alpha']);m.surface_render_method='DITHERED'
    return m
leather=mat('Cracked oxblood leather',(.075,.018,.024),.08,.56,38);gold=mat('Worn brass',(.5,.29,.11),.85,.29,25);iron=mat('Blackened iron',(.032,.034,.042),.78,.33,32)
stone=mat('Obsidian archive desk',(.029,.024,.032),.34,.32,9);paperedge=mat('Old page edges',(.39,.29,.16),.05,.71,100);ink=mat('Fresh lacquer ink',(.008,.002,.006),.18,.19)
verm=mat('Vermilion lacquer',(.28,.013,.021),.28,.26,13);ember=mat('Dying ink embers',(.95,.27,.07),.1,.25,emit=5);glow=mat('Seal pressure light',(.5,.015,.025),.15,.3,emit=4)
left=image_mat('Old forbidden text','left-page.png');right=image_mat('Blank new law','right-page.png');turn=image_mat('Turning calligraphy','turning-page.png');seal=image_mat('Vermilion edict imprint','seal.png',True)
def mesh(name,vs,fs,material,uvs=None):
    d=bpy.data.meshes.new(name);d.from_pydata(vs,[],fs);d.update();o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.data.materials.append(material)
    if uvs:
        uv=d.uv_layers.new()
        for face in d.polygons:
            for li,vi in zip(face.loop_indices,face.vertices):uv.data[li].uv=uvs[vi]
    return o
def bevel(o,w=.04):
    b=o.modifiers.new('Soft worn corners','BEVEL');b.width=w;b.segments=3;o.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return o
def cube(name,loc,scale,material,w=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=bpy.context.object;o.name=name;o.dimensions=scale;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(material)
    if w:bevel(o,w)
    return o
def key(o,prop,f,val):setattr(o,prop,val);o.keyframe_insert(data_path=prop,frame=f)
def curve(name,pts,material,r=.02):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=r;d.bevel_resolution=2;sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
    for v,pt in zip(sp.points,pts):v.co=(*pt,1)
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.data.materials.append(material);return o
def plane(name,x0,x1,y0,y1,z,material):return mesh(name,[(x0,y0,z),(x1,y0,z),(x1,y1,z),(x0,y1,z)],[(0,1,2,3)],material,[(0,0),(1,0),(1,1),(0,1)])
def light(name,loc,color,power,size,target,shadow=True):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;d.use_shadow=shadow;o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

# Massive reading table, with a scratched bronze inset and riveted corners.
cube('Ancient reading plinth',(0,0,-.15),(11.4,8.0,.55),stone,.12)
for y in [-3.83,3.83]:cube('Desk bronze lip',(0,y,.11),(11.2,.045,.06),gold,.01)
for x in [-5.48,5.48]:cube('Desk bronze lip',(x,0,.11),(.045,7.7,.06),gold,.01)
cube('Archive floor',(0,0,-.68),(90,90,.4),stone,.02)
for x in [-9,9]:
    for yy in [5,9,13]:
        cube('Archive pier',(x,yy,4),(1,1,9),stone,.08)
        for z in [1.3,3.4,5.5,7.6]:
            cube('Bronze archive shelf',(x,yy,z),(3.2,.7,.09),iron)
            for j in range(6):
                o=cube('Distant forbidden volume',(x-1.3+j*.5,yy,z+.63),(.35,.62,1.2),leather,.025);o.rotation_euler[1]=random.uniform(-.12,.12)

# Thick open book. Individually offset layers make the fore-edge read as paper.
for sign in [-1,1]:
    cube('Leather folio cover',(sign*2.08,0,.38),(4.18,5.95,.22),leather,.10)
    for layer in range(18):
        cube('Exposed paper foliation',(sign*2.06,0,.52+layer*.021),(3.96-random.random()*.025,5.68-random.random()*.025,.021),paperedge,.008)
    for xx in [sign*.14,sign*4.02]:
        for yy in [-2.84,2.84]:
            o=cube('Protective brass corner',(xx,yy,.54),(.3,.32,.06),gold,.04)
    for yy in [-2.91,2.91]:cube('Leather embossed rule',(sign*2.08,yy,.505),(3.67,.017,.015),gold,.005)
cube('Book sewn spine',(0,0,.52),(.24,5.84,.4),leather,.08)
for yy in [-2.35,-1.18,0,1.18,2.35]:cube('Raised spine cord',(0,yy,.6),(.32,.12,.45),gold,.03)
# Gently bowed final page surfaces.
def page(name,sign,material,z=.927,bow=.10):
    vs=[];uv=[];fs=[];nx=28;ny=22
    for j in range(ny+1):
        v=j/ny
        for i in range(nx+1):
            u=i/nx;xx=.13+u*3.89;zz=z+bow*math.sin(u*math.pi)+.015*math.sin(v*math.tau)
            vs.append((sign*xx,-2.81+v*5.62,zz));uv.append((u if sign>0 else 1-u,v))
    for j in range(ny):
        for i in range(nx):
            k=j*(nx+1)+i;fs.append((k,k+1,k+nx+2,k+nx+1) if sign>0 else (k+nx+1,k+nx+2,k+1,k))
    o=mesh(name,vs,fs,material,uv)
    for f in o.data.polygons:f.use_smooth=True
    return o
page('Left annotated folio',-1,left);page('Right blank folio',1,right,bow=.035)
# Pages flip about the sewn gutter, bowing under the imagined gust.
for k in range(9):
    root=bpy.data.objects.new('Turning leaf hinge',None);s.collection.objects.link(root);root.location=(0,0,.956+k*.009)
    o=page('Flexible turning page',1,turn,z=0,bow=.10+k*.015);o.parent=root
    start=10+k*5;end=start+25
    key(root,'rotation_euler',1,(0,0,0));key(root,'rotation_euler',start,(0,0,0));key(root,'rotation_euler',start+12,(.08,-1.58,.035));key(root,'rotation_euler',end,(0,-math.pi,0));key(root,'rotation_euler',168,(0,-math.pi,0))

# Embossed ornament beside the spine and a long satin bookmark.
curve('Blood red satin bookmark',[(.06,-2.3,1.0),(.07,-2.85,.8),(.28,-3.0,.47),(.65,-3.4,.23),(1.25,-3.5,.20)],verm,.055)
for sign in [-1,1]:
    for k in range(6):
        y=-2.5+k
        curve('Corner filigree',[(sign*3.75,y,.97),(sign*3.50,y+.15,.98),(sign*3.73,y+.32,.97)],gold,.012)

# The edict stamp descends, compresses the paper, then withdraws to reveal ink.
stamp=bpy.data.objects.new('Heavy edict seal assembly',None);s.collection.objects.link(stamp)
for name,loc,dim,material in [('Bronze impression block',(0,0,0),(1.65,1.5,.34),gold),('Lacquer seal shoulder',(0,0,.28),(1.44,1.3,.24),verm),('Black iron handle',(0,0,.8),(.42,.42,.85),iron),('Brass cap',(0,0,1.25),(.66,.66,.16),gold)]:
    o=cube(name,loc,dim,material,.07);o.parent=stamp
for z in [.49,.65,.81,.97,1.13]:
    o=cube('Seal handle binding',(0,0,z),(.46,.46,.045),gold,.015);o.parent=stamp
for dx in [-.67,.67]:
    for yy in [-.59,.59]:
        o=cube('Seal corner nail',(dx,yy,.20),(.085,.085,.07),gold,.02);o.parent=stamp
for f,loc,rot in [(1,(2,1.15,7.5),(.1,.15,-.2)),(68,(2,1.15,5.2),(.06,.1,-.08)),(83,(2,1.15,5.65),(0,0,0)),(96,(2,1.15,1.13),(0,0,0)),(100,(2,1.15,1.13),(0,0,0)),(118,(4.5,2.8,7),(0,.3,.2)),(168,(5,3,10),(0,.3,.2))]:key(stamp,'location',f,loc);key(stamp,'rotation_euler',f,rot)
mark=plane('Fresh ink edict',1.12,2.88,.37,1.93,.982,seal)
key(mark,'scale',1,(0,0,0));key(mark,'scale',96,(0,0,0));key(mark,'scale',99,(1,1,1))
# Black ink crawls along the gutter in branching capillaries.
for k in range(21):
    x=random.uniform(.2,3.7);y=random.uniform(-2.4,2.2)
    pts=[(.13,random.uniform(-2,2),.982)]
    for j in range(1,8):
        t=j/7;pts.append((.13+(x-.13)*t,pts[0][1]+(y-pts[0][1])*t+math.sin(t*math.pi*3)*.09,.984))
    o=curve('Ink capillary',pts,ink,.007+random.random()*.01)
    o.data.bevel_factor_end=0;o.data.keyframe_insert(data_path='bevel_factor_end',frame=50+k%8);o.data.bevel_factor_end=1;o.data.keyframe_insert(data_path='bevel_factor_end',frame=83+k%8)
    # Fold the capillaries back into the seal, clearing the actual declared text.
    key(o,'scale',99,(1,1,1));key(o,'scale',113,(0,0,0))

# Flying scraps carry the old text away. Their trajectories have depth and gravity.
for k in range(85):
    x=random.uniform(-3.5,3.5);y=random.uniform(-2.5,2.5);z=1.15
    o=plane('Ash of overwritten letters',-.06,.06,-.13,.13,0,turn if k%3 else ink)
    origin=Vector((x,y,z));vel=Vector((random.uniform(-2,2),random.uniform(-1.2,1.5),random.uniform(1.3,3.8)))
    start=42+k%24
    key(o,'scale',start-1,(0,0,0));key(o,'scale',start,(1,1,1))
    for f in [start,start+18,start+38,start+65]:
        t=(f-start)/30;key(o,'location',f,origin+vel*t+Vector((0,0,-.35*t*t)));key(o,'rotation_euler',f,(k*.2+t*2,k*.3+t*4,t*2))
    key(o,'scale',start+40,(1,1,1));key(o,'scale',start+65,(0,0,0))

# Seal impact: glossy ink droplets, paper dust, and a short volumetric light pulse.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1);drop=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);drop.materials.append(verm)
for i in range(85):
    ang=random.random()*math.tau;o=bpy.data.objects.new('Seal ink droplet',drop);s.collection.objects.link(o);sz=random.uniform(.008,.04);vel=Vector((math.cos(ang)*random.uniform(1,4),math.sin(ang)*random.uniform(1,3),random.uniform(1,3)))
    key(o,'scale',95,(0,0,0));key(o,'scale',97,(sz,sz,sz*1.5))
    for f in [96,104,114,128,145]:
        t=(f-96)/30;key(o,'location',f,Vector((2,1.15,1.17))+vel*t+Vector((0,0,-3*t*t)))
    key(o,'scale',130,(sz,sz,sz));key(o,'scale',147,(0,0,0))
for i in range(60):
    o=bpy.data.objects.new('Archive floating ember',drop.copy());s.collection.objects.link(o);o.data.materials.clear();o.data.materials.append(ember)
    loc=Vector((random.uniform(-7,7),random.uniform(-4,8),random.uniform(.5,8)));sz=random.uniform(.005,.017);o.scale=(sz,sz,sz);key(o,'location',1,loc);key(o,'location',168,loc+Vector((.35,.12,1)))

fog=bpy.data.materials.new('Archive dust haze');fog.use_nodes=True;fog.node_tree.nodes.clear();v=fog.node_tree.nodes.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=.008;v.inputs['Color'].default_value=(.23,.20,.18,1);v.inputs['Anisotropy'].default_value=.4;out=fog.node_tree.nodes.new('ShaderNodeOutputMaterial');fog.node_tree.links.new(v.outputs['Volume'],out.inputs['Volume']);cube('Volumetric archive air',(0,3,5),(36,32,17),fog,0)
light('Warm reading light',(-4,-3,8),(1,.67,.35),1150,4,(0,0,1));light('Cold archive shaft',(4,5,10),(.48,.60,1),1300,3,(0,0,1));light('Bronze edge bounce',(2,-6,2),(1,.3,.10),220,3,(0,0,1),False)
flash=light('Edict impact light',(2,1.15,2.5),(1,.06,.025),0,2,(2,1.15,1),False)
for f,e in [(1,0),(94,0),(97,480),(103,180),(114,0)]:flash.data.energy=e;flash.data.keyframe_insert(data_path='energy',frame=f)

bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Codex cinematic camera';s.camera=cam;cam.data.lens=43 if not a.portrait else 42;cam.data.clip_end=160;cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=7.1
shots=[(1,(4.8,-5.6,3.9),(.5,-.5,.9)),(34,(7,-9,9),(0,0,1.2)),(74,(6,-8.5,9.5),(.5,.3,1.5)),(90,(5,-7.5,10),(.65,.2,1.1)),(97,(5.14,-7.3,10.1),(.65,.2,1.1)),(104,(5,-7.5,10),(.65,.2,1.1)),(116,(3.2,-7.6,11.5),(.7,-.1,1)),(168,(3.2,-7.6,11.5),(.7,-.1,1))]
for f,pos,look in shots:
    if a.portrait:pos=(pos[0]*.42,pos[1]*1.03,pos[2]*1.04);look=(.65,look[1],look[2])
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(Vector(look)-Vector(pos)).to_track_quat('-Z','Y').to_euler());cam.data.dof.focus_distance=(Vector(pos)-Vector(look)).length;cam.data.keyframe_insert(data_path='dof.focus_distance',frame=f)
s.use_nodes=True;nodes=s.node_tree.nodes;nodes.clear();l=s.node_tree.links;rl=nodes.new('CompositorNodeRLayers');g=nodes.new('CompositorNodeGlare');g.glare_type='FOG_GLOW';g.quality='MEDIUM';g.threshold=2;g.mix=-.90;l.new(rl.outputs['Image'],g.inputs[0]);out=nodes.new('CompositorNodeComposite');l.new(g.outputs[0],out.inputs[0])
# Screen-space quadrilaterals for real yaku text, in TL/TR/BR/BL order.
corners=[(.58,.12,1.005),(3.54,.12,1.005),(3.54,-2.07,1.005),(.58,-2.07,1.005)]
anchors=[]
for frame in range(108,169,2):
    s.frame_set(frame);pts=[world_to_camera_view(s,cam,Vector(p)) for p in corners]
    anchors.append({'time':round((frame-1)/30,6),'points':[[round(p.x,7),round(1-p.y,7)] for p in pts]})
with open(os.path.join(a.out,'text-anchors.json'),'w',encoding='utf-8') as f:json.dump(anchors,f,indent=2)
s.frame_set(116);bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out,'forbidden-codex.blend'))
if a.preview:
    for frame in [34,97,130]:s.frame_set(frame);s.render.filepath=os.path.join(a.out,f'key-{frame:03d}.png');bpy.ops.render.render(write_still=True)
else:
    os.makedirs(os.path.join(a.out,'frames'),exist_ok=True);s.render.filepath=os.path.join(a.out,'frames/frame-');bpy.ops.render.render(animation=True)
