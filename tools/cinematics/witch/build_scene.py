"""Original procedural tribunal. Blender 4.5 LTS, no external models/textures.
blender -b --python build_scene.py -- --out DIR [--portrait] [--preview]
The .blend and frame sequences are production sources, kept outside the APK.
"""
import bpy, math, random, argparse, sys, os
from mathutils import Vector
random.seed(9102026)
args = argparse.ArgumentParser()
args.add_argument('--out', required=True)
args.add_argument('--portrait', action='store_true')
args.add_argument('--preview', action='store_true')
args.add_argument('--start', type=int, default=1)
args.add_argument('--end', type=int, default=156)
args = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
args.out = os.path.abspath(args.out)
os.makedirs(args.out, exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples = 64
scene.eevee.use_raytracing = True
scene.render.resolution_x, scene.render.resolution_y = ((1000, 1600) if args.portrait else (1600, 1000))
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.frame_start, scene.frame_end = args.start, args.end
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.film_transparent = False
scene.world.use_nodes = True
scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.055, .045, .08, 1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value = .22
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = -.65
scene.render.use_file_extension = True

def material(name, color, metal=0, rough=.4, noise=0, emission=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n=m.node_tree.nodes; l=m.node_tree.links; p=n.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color,1)
    p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
    if emission:
        p.inputs['Emission Color'].default_value=(*color,1); p.inputs['Emission Strength'].default_value=emission
    if noise:
        tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=noise; tex.inputs['Detail'].default_value=4
        coords=n.new('ShaderNodeTexCoord');l.new(coords.outputs['Object'],tex.inputs['Vector'])
        ramp=n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position=.2; ramp.color_ramp.elements[0].color=(*[v*.17 for v in color],1)
        ramp.color_ramp.elements[1].position=.8; ramp.color_ramp.elements[1].color=(*color,1)
        l.new(tex.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],p.inputs['Base Color'])
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.24; bump.inputs['Distance'].default_value=.05 if rough>.4 else .012
        l.new(tex.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],p.inputs['Normal'])
    return m

stone=material('Basalt | fractured',(.05,.045,.065),.15,.47,7)
obsidian=material('Obsidian | honed',(.016,.021,.033),.72,.26,38)
bronze=material('Weathered sacrificial bronze',(.43,.225,.075),.83,.29,14)
edge=material('Polished worn gold edges',(.72,.46,.21),.88,.22)
iron=material('Black iron',(.075,.081,.10),.9,.32,23)
floor=material('Rain polished dark flagstones',(.032,.029,.044),.65,.24,2)
violet=material('Amethyst fault light',(.43,.075,.92),.3,.2,emission=6)
warm=material('Incandescent gold', (1,.46,.11),.1,.3,emission=9)
white=material('Hot impact core',(.86,.7,1),.1,.2,emission=16)

def mesh(name, verts, faces, mat):
    d=bpy.data.meshes.new(name); d.from_pydata(verts, [], faces); d.update()
    o=bpy.data.objects.new(name,d); scene.collection.objects.link(o); o.data.materials.append(mat); return o
def bevel(o,w=.04):
    m=o.modifiers.new('Worn bevel catches light','BEVEL'); m.width=w; m.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL'); return o
def cube(name,loc,scale,mat,w=.04):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(mat)
    if w: bevel(o,w)
    return o
def cylinder(name,r,depth,loc,mat,vertices=96):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r,depth=depth,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat); bevel(o,.035); return o
def torus(name,major,minor,loc,mat,rotation=None):
    bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=8,major_radius=major,minor_radius=minor,location=loc)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat)
    if rotation: o.rotation_euler=rotation
    for p in o.data.polygons:p.use_smooth=True
    return o
def line(name,points,mat,r=.025):
    c=bpy.data.curves.new(name,'CURVE'); c.dimensions='3D'; c.bevel_depth=r; c.bevel_resolution=2
    s=c.splines.new('POLY'); s.points.add(len(points)-1)
    for p,v in zip(s.points,points):p.co=(*v,1)
    o=bpy.data.objects.new(name,c);scene.collection.objects.link(o);o.data.materials.append(mat);return o
def key(o,prop,frame,val):
    setattr(o,prop,val);o.keyframe_insert(data_path=prop,frame=frame)
def light(name,loc,color,power,size=3,target=(0,0,3)):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size
    if name in ['Tower rim','Low bronze bounce','Impact flash']: d.use_shadow=False
    o=bpy.data.objects.new(name,d);scene.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();return o

# The tribunal's stepped stone dais and radial engraving.
cube('Infinite wet floor',(0,0,-.5),(160,160,.5),floor)
for r,z,h in [(5.2,-.18,.3),(4.5,.04,.32),(3.9,.26,.2),(2.2,.46,.22)]:
    cylinder('Carved basalt dais',r,h,(0,0,z),stone)
    torus('Dais bronze inlay',r-.06,.025,(0,0,z+h/2+.015),bronze)
for radius in [1.25,1.4,1.8,2.5,3.15,3.4]:torus('Engraved circle',radius,.012,(0,0,.38 if radius>2.2 else .59),edge)
for i in range(64):
    a=i*math.tau/64
    r=2.65 if i%4 else 2.5
    line('Radial floor incision',[(r*math.cos(a),r*math.sin(a),.375),(3.0*math.cos(a),3.0*math.sin(a),.375)],bronze,.012)

# Tower silhouettes: layered bevels, pointed caps, real cast shadows.
for x,y,height in [(-5,3,10),(5,3,10),(-8,6,13),(8,6,13),(-11,11,16),(11,11,16)]:
    for z,w,d in [(.35,1.8,.7),(height*.46,.95,height*.88),(height-.5,1.2,.4)]:
        cube('Tribunal buttress',(x,y,z),(w,1.2,d),stone,.08)
    for dx in [-.52,.52]:
        cube('Bronze pillar seam',(x+dx,y-.66,height*.47),(.025,.05,height*.87),bronze,.008)
    bpy.ops.mesh.primitive_cone_add(vertices=4,radius1=.88,radius2=0,depth=2.2,location=(x,y,height+.5))
    bpy.context.object.data.materials.append(obsidian)
    light('Tower rim', (x,y+1,height*.7),(.24,.13,.65),850,2,(x,y,height*.5))

# Huge segmented astrolabe, standing behind the suspended blade.
halo=bpy.data.objects.new('Turning tribunal seal',None);scene.collection.objects.link(halo);halo.location=(0,1.6,4.15)
for rad,width in [(3.18,.055),(3.02,.025),(2.72,.035),(2.46,.015)]:
    o=torus('Bronze halo',rad,width,(0,0,0),edge,(math.pi/2,0,0));o.parent=halo
for i in range(24):
    a=i*math.tau/24; delta=.100
    verts=[]
    for y in [-.17,.17]:
        for r in [2.69,3.04]:
            for t in [a-delta,a+delta]:verts.append((r*math.sin(t),y,r*math.cos(t)))
    o=mesh('Separate weathered seal segment',verts,[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)],stone);bevel(o,.03);o.parent=halo
    # Irregular geometric inscriptions, carved-looking bronze strokes.
    for off in [-.033,.033]:
        r1=2.85;r2=2.95
        o=line('Seal inscription',[(r1*math.sin(a+off),-.205,r1*math.cos(a+off)),(r2*math.sin(a+off),-.205,r2*math.cos(a+off))],edge,.014);o.parent=halo
    if i%3==0:
        o=line('Lit radial fissure',[(2.50*math.sin(a),-.06,2.50*math.cos(a)),(2.66*math.sin(a+.025),-.06,2.66*math.cos(a+.025))],violet,.018);o.parent=halo
key(halo,'rotation_euler',1,(0,-.12,0));key(halo,'rotation_euler',156,(0,.18,0))

# A faceted monolithic blade; bevelled metal margins and ritual grip.
blade=bpy.data.objects.new('Judgement blade | falling assembly',None);scene.collection.objects.link(blade)
shape=[(0,0),(-.63,1.10),(-.48,3.9),(-.8,4.18),(-.64,4.48),(.64,4.48),(.8,4.18),(.48,3.9),(.63,1.10)]
verts=[(x,y,z) for y in [-.17,.17] for x,z in shape];n=len(shape)
faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n)for i in range(n)]
o=mesh('Black obsidian execution blade',verts,faces,obsidian);bevel(o,.045);o.parent=blade
o=mesh('Honed central blade ridge',[(0,-.19,.03),(-.62,-.18,1.1),(0,-.44,1.1),(.62,-.18,1.1),(-.47,-.18,3.9),(0,-.42,3.9),(.47,-.18,3.9)],[(0,2,1),(0,3,2),(1,2,5,4),(2,3,6,5)],obsidian);o.parent=blade
for sign in [-1,1]:
    o=line('Bronze blade cutting bevel',[(0,-.19,.03),(sign*.60,-.19,1.12),(sign*.46,-.19,3.91)],edge,.024);o.parent=blade
    o=line('Broken amethyst vein',[(sign*.035,-.46,.65),(sign*.07,-.46,1.6),(sign*.03,-.46,2),(sign*.09,-.46,3.8)],violet,.010);o.parent=blade
o=cube('Heavy crossguard',(0,0,4.18),(2.3,.6,.3),bronze,.07);o.parent=blade
o=cube('Ritual handle',(0,0,4.75),(.30,.32,1.0),iron,.03);o.parent=blade
for z in [4.4+i*.11 for i in range(8)]:
    o=torus('Grip wire',.19,.018,(0,0,z),edge);o.parent=blade
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2,radius=.32,location=(0,0,5.32));o=bpy.context.object;o.data.materials.append(bronze);o.parent=blade
for z in [1.45,1.93,2.41,2.89,3.37]:
    o=line('Blade ritual glyph',[(-.12,-.46,z+.12),(.12,-.46,z),(-.10,-.46,z-.12)],bronze,.012);o.parent=blade
for f,z in [(1,1.8),(55,2.0),(77,2.18),(85,2.6),(94,.58),(97,.58),(156,.58)]:key(blade,'location',f,(0,0,z))

# Authentic interlinked elliptical chains, pulling away and breaking on impact.
bpy.ops.mesh.primitive_torus_add(major_segments=16,minor_segments=6,major_radius=.115,minor_radius=.027)
link_mesh=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);link_mesh.materials.append(iron)
for sign in [-1,1]:
    for i in range(28):
        t=i/27;loc=Vector((sign*(.95+3.2*t),.05+1.4*t,6.35+1.6*t-.35*math.sin(t*math.pi)))
        o=bpy.data.objects.new('Tensioned iron chain',link_mesh);scene.collection.objects.link(o);o.location=loc
        o.scale=(.8,1.6,1);o.rotation_euler=(math.pi/2,.7*sign,i%2*math.pi/2)
        if i<18:
            key(o,'location',88,loc);key(o,'rotation_euler',88,o.rotation_euler.copy())
            key(o,'location',113,loc+Vector((sign*(1+random.random()),-random.random()*2,-random.uniform(.4,3))))
            key(o,'rotation_euler',113,(random.random()*6,random.random()*6,random.random()*6))
            key(o,'scale',127,(.8,1.6,1));key(o,'scale',150,(0,0,0))

# Broken floor channels light up at impact.
for i in range(16):
    a=random.random()*math.tau; pts=[]
    for j in range(6):
        r=.1+j*random.uniform(.32,.55);aa=a+random.uniform(-.12,.12)
        pts.append((r*math.cos(aa),r*math.sin(aa),.6 if r<2.2 else .38))
    o=line('Impact crack',pts,violet,.013)
    key(o,'scale',90,(0,0,0));key(o,'scale',97,(1,1,1));key(o,'scale',136,(1,1,1));key(o,'scale',156,(.02,.02,.02))

# Fragments are real 3D, with individually keyed ballistic motion.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
rock_mesh=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True);rock_mesh.materials.append(stone)
spark_mesh=rock_mesh.copy();spark_mesh.materials.clear();spark_mesh.materials.append(warm)
for i in range(190):
    spark=i>100;a=random.random()*math.tau;r=random.uniform(.15,1.6)
    o=bpy.data.objects.new('Hot metallic splinter' if spark else 'Basalt impact fragment',spark_mesh if spark else rock_mesh);scene.collection.objects.link(o)
    origin=Vector((math.cos(a)*r,math.sin(a)*r,.67));sz=random.uniform(.016,.06) if spark else random.uniform(.045,.19)
    size=(sz,sz*.65,sz*(4 if spark else 1.6)); vel=Vector((math.cos(a)*random.uniform(2.8,7),math.sin(a)*random.uniform(2.8,7),random.uniform(2,6)))
    key(o,'scale',92,(0,0,0));key(o,'location',92,origin);key(o,'scale',95,size)
    for f in [95,103,116,132,150]:
        t=(f-94)/30;pos=origin+vel*t+Vector((0,0,-3*t*t))
        key(o,'location',f,pos);key(o,'rotation_euler',f,(i+t*3,i*.4+t*6,t*4))
    key(o,'scale',130,size);key(o,'scale',153,(0,0,0))

# Floating embers with near/far parallax.
for i in range(85):
    o=bpy.data.objects.new('Atmospheric ember',spark_mesh);scene.collection.objects.link(o)
    loc=Vector((random.uniform(-8,8),random.uniform(-6,6),random.uniform(.5,10)))
    s=random.uniform(.007,.023);o.scale=(s,s,s)
    key(o,'location',1,loc);key(o,'location',156,loc+Vector((.35,0,random.uniform(.5,1.6))))

# Subtle real volumetric haze, lit by area lights (not a painted overlay).
fog=bpy.data.materials.new('Cold volumetric dust');fog.use_nodes=True;fog.node_tree.nodes.clear()
out=fog.node_tree.nodes.new('ShaderNodeOutputMaterial');vol=fog.node_tree.nodes.new('ShaderNodeVolumePrincipled')
vol.inputs['Density'].default_value=.009;vol.inputs['Color'].default_value=(.19,.18,.23,1);vol.inputs['Anisotropy'].default_value=.4
fog.node_tree.links.new(vol.outputs['Volume'],out.inputs['Volume']);cube('Dust volume',(0,2,5),(36,35,18),fog,0)
light('Warm grazing key',(-4,-6,9),(1,.64,.31),1600,3)
light('Silver blade edge',(3,-2,11),(.67,.72,1),1100,2)
light('Amethyst backlight',(0,5,5),(.32,.08,.7),1700,2,(0,0,3))
light('Low bronze bounce',(-1,-5,1),(1,.28,.08),180,3,(0,0,3))
impact=light('Impact flash',(0,-1,2),(.8,.48,1),0,4,(0,0,0))
for f,e in [(1,0),(92,0),(95,10000),(98,3500),(109,400),(125,0)]:impact.data.energy=e;impact.data.keyframe_insert(data_path='energy',frame=f)

# Camera has a deliberate anticipation -> reveal -> punch, not a constant orbit.
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.name='Cinematic dolly'
cam.data.lens=37 if not args.portrait else 41
cam.data.sensor_width=36;cam.data.clip_end=220
cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=5.6
shots=[(1,(2.3,-5.2,6.7),(0,0,5.8)),(38,(5.7,-15,7.3),(0,0,3.8)),(76,(3.3,-14.2,6.4),(0,0,3.7)),(91,(2.8,-12.3,4.9),(0,0,2.8)),(95,(2.94,-12.08,5.13),(0,0,2.72)),(99,(2.7,-12.5,4.98),(0,0,2.9)),(123,(2.15,-13.4,5.2),(0,0,2.7)),(156,(1.7,-14.2,5.5),(0,0,2.7))]
for f,pos,look in shots:
    if args.portrait:
        pos=(pos[0]*.8,pos[1],pos[2]);look=(look[0],look[1],look[2])
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(Vector(look)-Vector(pos)).to_track_quat('-Z','Y').to_euler())
    cam.data.dof.focus_distance=(Vector(pos)-Vector(look)).length;cam.data.keyframe_insert(data_path='dof.focus_distance',frame=f)

scene.use_nodes=True;nodes=scene.node_tree.nodes;nodes.clear();links=scene.node_tree.links
rl=nodes.new('CompositorNodeRLayers');glow=nodes.new('CompositorNodeGlare');glow.glare_type='FOG_GLOW';glow.quality='MEDIUM';glow.threshold=2;glow.mix=-.82
links.new(rl.outputs['Image'],glow.inputs['Image']);comp=nodes.new('CompositorNodeComposite');links.new(glow.outputs['Image'],comp.inputs[0])

scene.frame_set(60)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(args.out,'tribunal.blend'))
if args.preview:
    for frame in [12,65,100]:
        scene.frame_set(frame);scene.render.filepath=os.path.join(args.out,f'key-{frame:03d}.png');bpy.ops.render.render(write_still=True)
else:
    scene.render.filepath=os.path.join(args.out,'frames','frame-');os.makedirs(os.path.dirname(scene.render.filepath),exist_ok=True)
    bpy.ops.render.render(animation=True)
