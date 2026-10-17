"""Azorubine: original offline Blender film, 180 frames / 6 seconds.
Two porcelain relics, a scarlet pigment vortex, and a ruby declaration tablet.
The actual declared number is projected by the app, never baked into the film.
"""
import argparse, json, math, os, random, sys
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

p = argparse.ArgumentParser()
p.add_argument('--out', required=True)
p.add_argument('--portrait', action='store_true')
p.add_argument('--preview', action='store_true')
a = p.parse_args(sys.argv[sys.argv.index('--') + 1:])
a.out = os.path.abspath(a.out)
os.makedirs(a.out, exist_ok=True)
random.seed(2102026)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
s = bpy.context.scene
s.render.engine = 'BLENDER_EEVEE_NEXT'
s.eevee.taa_render_samples = 48
s.eevee.use_raytracing = False
s.render.resolution_x, s.render.resolution_y = (1000, 1600) if a.portrait else (1600, 1000)
s.render.resolution_percentage = 100
s.render.fps = 30
s.frame_start, s.frame_end = 1, 180
s.render.image_settings.file_format = 'PNG'
s.render.image_settings.color_mode = 'RGB'
s.world.use_nodes = True
s.world.node_tree.nodes['Background'].inputs[0].default_value = (.035, .018, .028, 1)
s.world.node_tree.nodes['Background'].inputs[1].default_value = .13
s.view_settings.view_transform = 'AgX'
s.view_settings.look = 'AgX - Medium High Contrast'
s.view_settings.exposure = -.35

def mat(name, color, metal=0, rough=.4, noise=0, emit=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    n, l = m.node_tree.nodes, m.node_tree.links
    bs = n.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Coat Weight'].default_value = .28
    if emit:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emit
    if noise:
        tex = n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value = noise
        tex.inputs['Detail'].default_value = 4
        ramp = n.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].color = (*[v*.22 for v in color], 1)
        ramp.color_ramp.elements[1].color = (*color, 1)
        l.new(tex.outputs['Fac'], ramp.inputs[0]); l.new(ramp.outputs[0], bs.inputs['Base Color'])
        bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .18
        bump.inputs['Distance'].default_value = .022
        l.new(tex.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs[0], bs.inputs['Normal'])
    return m

stone = mat('Wet volcanic basalt', (.038,.025,.034), .33,.26,8)
iron = mat('Oxidized black iron', (.036,.019,.023), .8,.32,30)
gold = mat('Scratched antique gold', (.49,.27,.08), .88,.27,50)
ivory = mat('Old porcelain', (.76,.65,.46), .10,.21,120)
ink = mat('Porcelain incised grooves', (.18,.12,.067), .45,.42)
pigment = mat('Liquid azorubine lacquer', (.19,.002,.012), .18,.28,3)
ruby = mat('Solid translucent-looking carmine jade', (.13,.003,.013), .28,.29,4)
face = mat('Polished ruby inscription face', (.040,.002,.009), .10,.37,13)
hot = mat('Incandescent dye', (.65,.012,.018), .2,.32,emit=1.6)
ember = mat('Golden pigment sparks', (1,.34,.10), .4,.24,emit=5)
for node in ivory.node_tree.nodes:
    if node.type == 'VALTORGB':
        for element, factor in zip(node.color_ramp.elements,[.22,1]):
            for frame, color in [(1,(.76,.65,.46)),(50,(.76,.65,.46)),(89,(.23,.006,.018))]:
                element.color=(*[v*factor for v in color],1);element.keyframe_insert(data_path='color',frame=frame)

def key(o, prop, f, val):
    setattr(o, prop, val); o.keyframe_insert(data_path=prop, frame=f)

def mesh(name, vs, fs, material):
    d = bpy.data.meshes.new(name); d.from_pydata(vs, [], fs); d.update()
    o = bpy.data.objects.new(name, d); s.collection.objects.link(o); d.materials.append(material)
    return o

def cube(name, loc, scale, material, bevel=.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object; o.name=name; o.dimensions=scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.data.materials.append(material)
    if bevel:
        b=o.modifiers.new('Worn bevel','BEVEL');b.width=bevel;b.segments=3
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def curve(name, pts, material, radius=.02):
    d=bpy.data.curves.new(name,'CURVE');d.dimensions='3D';d.bevel_depth=radius;d.bevel_resolution=3
    sp=d.splines.new('POLY');sp.points.add(len(pts)-1)
    for v,pt in zip(sp.points,pts):v.co=(*pt,1)
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);d.materials.append(material)
    return o

def torus(name, radius, tube, loc, material):
    bpy.ops.mesh.primitive_torus_add(major_segments=96,minor_segments=12,location=loc,major_radius=radius,minor_radius=tube)
    o=bpy.context.object;o.name=name;o.data.materials.append(material)
    for f in o.data.polygons:f.use_smooth=True
    return o

def cylinder(name, radius, depth, loc, material, vertices=96):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=loc)
    o=bpy.context.object;o.name=name;o.data.materials.append(material)
    b=o.modifiers.new('Worn edge','BEVEL');b.width=.03;b.segments=3
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return o

def light(name, loc, color, power, size, target, shadow=True):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.color=color;d.shape='DISK';d.size=size;d.use_shadow=shadow
    o=bpy.data.objects.new(name,d);s.collection.objects.link(o);o.location=loc
    o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
    return o

# A physical alchemist's altar, not a screen-space magic-circle sprite.
cube('Dark chamber floor',(0,0,-.56),(70,70,.6),stone)
cylinder('Low obsidian altar',4.8,.45,(0,0,-.10),stone)
cylinder('Ritual basin',3.72,.22,(0,0,.20),iron)
cylinder('Still scarlet pigment pool',3.38,.03,(0,0,.327),pigment)
for r in [3.51,3.66,4.18,4.54]:torus('Brass basin rim',r,.023,(0,0,.325),gold)
for i in range(72):
    theta=i*math.tau/72
    o=cube('Engraved radial index',(4.34*math.cos(theta),4.34*math.sin(theta),.13),(.035,.23 if i%6 else .38,.016),gold,.006)
    o.rotation_euler.z=theta-math.pi/2
for i in range(8):
    theta=i*math.tau/8
    cylinder('Basin rivet',.065,.07,(3.89*math.cos(theta),3.89*math.sin(theta),.30),gold,16)
for x in [-7,7]:
    for y in [4,9,14]:
        cube('Temple basalt pier',(x,y,5),(1.15,1.35,11),stone,.10)
        for z in [.3,1,8.6]:cube('Temple bronze band',(x,y,z),(1.20,1.40,.10),gold,.02)
        for xx in [-.32,0,.32]:cube('Pier carved fluting',(x+xx,y-.70,4),(.025,.025,5.4),iron,.006)
        cylinder('Offering cup stem',.10,1.3,(x*.80,y-1.0,1.1),gold,32)
        cylinder('Offering cup',.40,.28,(x*.80,y-1.0,1.83),iron,32)
        cylinder('Smouldering red pigment',.33,.035,(x*.80,y-1.0,1.98),hot,32)

# Two porcelain blanks are drawn into the same pigment; they have no actual hand identity.
for side in [-1,1]:
    root=bpy.data.objects.new('Porcelain seed assembly',None);s.collection.objects.link(root)
    tile=cube('Ivory relic',(0,0,0),(1.30,.46,2.02),ivory,.10);tile.parent=root
    for z in [-.78,.78]:
        o=cube('Incised porcelain end line',(0,-.239,z),(.96,.012,.025),ink,.007);o.parent=root
    for x in [-.46,.46]:
        o=curve('Paired porcelain engraving',[(x,-.241,-.56),(x*.65,-.241,-.26),(x,-.241,0),(x*.65,-.241,.26),(x,-.241,.56)],ink,.010);o.parent=root
    for f,loc,rot,scale in [
        (1,(side*2.05,.2,1.6),(0,side*.10,side*-.12),1),
        (35,(side*2.30,.05,3.25),(side*.10,side*.17,side*-.22),1),
        (65,(side*1.93,.2,3.48),(.14,side*.10,side*.28),1),
        (82,(side*1.3,.1,3.55),(.02,0,side*.09),1),
        (96,(side*.18,0,3.4),(0,0,0),.8),
        (100,(0,0,3.4),(0,0,0),0),
        (180,(0,0,3.4),(0,0,0),0)]:
        key(root,'location',f,loc);key(root,'rotation_euler',f,rot);key(root,'scale',f,(scale,)*3)

# Curved wet streams coil upward, pulling pigment from the real basin.
for i in range(8):
    phase=i*math.tau/8;pts=[]
    for j in range(100):
        t=j/99;ang=phase+t*math.tau*.83;r=3.16*(1-t)**.68+.12+.13*math.sin(t*18+i)
        pts.append((r*math.cos(ang),r*math.sin(ang),.36+3.08*t+.15*math.sin(t*9+i)))
    o=curve('Rising lacquer strand',pts,pigment if i%4 else hot,.025+(i%3)*.010)
    for j,point in enumerate(o.data.splines[0].points):point.radius=.1+.90*max(0,math.sin(math.pi*j/99))**.55
    for f,v in [(1,0),(13+i,0),(66+i,1),(94,1)]:o.data.bevel_factor_end=v;o.data.keyframe_insert(data_path='bevel_factor_end',frame=f)
    for f,v in [(1,0),(82,0),(102,1)]:o.data.bevel_factor_start=v;o.data.keyframe_insert(data_path='bevel_factor_start',frame=f)

# The ruby tablet has a bevelled body, worn gold fittings and a polished front.
hero=bpy.data.objects.new('Ruby declaration tablet',None);s.collection.objects.link(hero)
for name,loc,dim,material,b in [
    ('Carmine jade body',(0,0,0),(2.20,.60,3.15),ruby,.17),
    ('Dark enamel declaration face',(0,-.304,0),(1.69,.025,2.67),face,.09),
    ('Rear black metal casing',(0,.29,0),(2.1,.10,3.03),iron,.13)]:
    o=cube(name,loc,dim,material,b);o.parent=hero
for side in [-1,1]:
    o=cube('Gold vertical tablet inlay',(side*.947,-.30,0),(.035,.032,2.78),gold,.013);o.parent=hero
    for z in [-1.39,1.39]:
        o=curve('Corner gold bracket',[(side*.72,-.36,z),(side*.98,-.32,z),(side*.98,-.27,z-side*.01)],gold,.047);o.parent=hero
        o=cube('Gold arrow corner',(side*.91,-.326,z-side*.03),(.14,.065,.24),gold,.032);o.parent=hero
for z in [-1.40,1.40]:
    o=cube('Gold tablet end rail',(0,-.32,z),(1.8,.038,.025),gold,.009);o.parent=hero
for i in range(13):
    x=(i-6)*.119
    for sign in [-1,1]:
        o=cube('Etched metal end marks',(x,-.344,sign*1.29),(.012,.010,.075 if i%3 else .12),gold,.002);o.parent=hero
# Hairline emissive fractures hug the edges, leaving the live inscription clear.
for side in [-1,1]:
    for k in range(5):
        z=-1.10+k*.53
        o=curve('Glowing mineral vein',[(side*.98,-.33,z),(side*.86,-.335,z+.15),(side*.92,-.34,z+.28)],hot,.005);o.parent=hero
for f,z,scale,rz in [(1,3.4,0,0),(94,3.4,0,-.23),(102,3.4,1,-.18),(118,3.55,1,-.06),(138,3.60,1,.025),(180,3.68,1,.04)]:
    key(hero,'location',f,(0,0,z));key(hero,'scale',f,(scale,)*3);key(hero,'rotation_euler',f,(0,0,rz))

# A sculpted liquid splash crown at the collision (not simulated on the tablet).
vs=[];fs=[];N=160
for j in range(4):
    for i in range(N):
        ang=i*math.tau/N;r=.7+j*.8
        z=.17*math.sin(ang*7+j)+(.35+.5*math.sin(ang*9)**6 if j==3 else 0)
        vs.append((r*math.cos(ang),r*math.sin(ang),z))
for j in range(3):
    for i in range(N):fs.append((j*N+i,j*N+(i+1)%N,(j+1)*N+(i+1)%N,(j+1)*N+i))
crown=mesh('Rupturing scarlet liquid crown',vs,fs,pigment);crown.location=(0,0,3.4)
for poly in crown.data.polygons:poly.use_smooth=True
solid=crown.modifiers.new('Liquid film thickness','SOLIDIFY');solid.thickness=.022
for f,scale in [(1,0),(94,0),(97,.3),(103,1),(114,1.4),(124,0)]:key(crown,'scale',f,(scale,scale,scale*.6))

# Individually animated droplets: a burst with gravity, then settling embers.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1)
drop=bpy.context.object.data.copy();bpy.data.objects.remove(bpy.context.object,do_unlink=True)
for i in range(180):
    d=drop.copy();d.materials.append(pigment if i%4 else ember)
    o=bpy.data.objects.new('Scattered pigment droplet',d);s.collection.objects.link(o)
    ang=random.random()*math.tau;vel=Vector((math.cos(ang)*random.uniform(2,6),math.sin(ang)*random.uniform(2,6),random.uniform(-.2,3.3)))
    sz=random.uniform(.013,.055);key(o,'scale',95,(0,0,0));key(o,'scale',98,(sz,sz,sz*1.8))
    for f in [96,105,117,137,160]:
        t=(f-96)/30;key(o,'location',f,Vector((0,0,3.4))+vel*t+Vector((0,0,-2.6*t*t)))
        key(o,'rotation_euler',f,(ang+t,ang+t*2,t))
    key(o,'scale',135,(sz,)*3);key(o,'scale',164,(0,0,0))
for i in range(95):
    d=drop.copy();d.materials.append(ember if i%3 else hot)
    o=bpy.data.objects.new('Ascending pigment mote',d);s.collection.objects.link(o)
    theta=random.random()*math.tau;r=random.uniform(1.3,3.4);sz=random.uniform(.008,.023)
    o.scale=(sz,sz,sz)
    for f in [1,60,120,180]:
        ang=theta+f*.016;key(o,'location',f,(r*math.cos(ang),r*math.sin(ang),.5+((i*.173+f*.021)%6)))

fog=bpy.data.materials.new('Carmine chamber haze');fog.use_nodes=True;fog.node_tree.nodes.clear()
v=fog.node_tree.nodes.new('ShaderNodeVolumePrincipled');v.inputs['Density'].default_value=.006;v.inputs['Color'].default_value=(.22,.18,.20,1);v.inputs['Anisotropy'].default_value=.35
out=fog.node_tree.nodes.new('ShaderNodeOutputMaterial');fog.node_tree.links.new(v.outputs['Volume'],out.inputs['Volume'])
cube('Chamber volume',(0,4,7),(32,38,18),fog,0)
light('Warm porcelain key',(-4,-5,8),(1,.72,.47),1100,4,(0,0,3))
light('Cold silver rim',(4,4,9),(.48,.57,1),2100,3,(0,0,3))
light('Red chamber bounce',(-4,2,3),(1,.025,.038),420,4,(0,0,3))
light('Long reflected softbox',(1,-5,6),(1,.63,.50),300,2,(0,0,3.8),False)
flash=light('Pigment ignition',(-1,-3,6),(1,.05,.028),0,3,(0,0,3.4),False)
for f,e in [(1,0),(66,20),(91,90),(97,2200),(103,680),(120,0),(180,0)]:
    flash.data.energy=e;flash.data.keyframe_insert(data_path='energy',frame=f)

bpy.ops.object.camera_add();cam=bpy.context.object;cam.name='Azorubine cinema camera';s.camera=cam
cam.data.lens=46 if a.portrait else 48;cam.data.clip_end=140
cam.data.dof.use_dof=True;cam.data.dof.aperture_fstop=6.3
shots=[(1,(5,-8.5,3.7),(0,0,2.0)),(35,(3.4,-12,6.4),(0,0,2.7)),(74,(1.6,-12,6.0),(0,0,3.15)),(93,(.65,-10.4,5.4),(0,0,3.35)),(98,(.72,-10.1,5.47),(0,0,3.35)),(106,(.6,-11.2,5.7),(0,0,3.4)),(125,(.30,-10.5,5.3),(0,0,3.5)),(180,(-.4,-10.15,5.2),(0,0,3.62))]
for f,pos,look in shots:
    if a.portrait:pos=(pos[0]*.45,pos[1]*(1.30 if f<106 else 1.15 if f==106 else .90),pos[2]+.30)
    key(cam,'location',f,pos);key(cam,'rotation_euler',f,(Vector(look)-Vector(pos)).to_track_quat('-Z','Y').to_euler())
    cam.data.dof.focus_distance=(Vector(pos)-Vector(look)).length;cam.data.keyframe_insert(data_path='dof.focus_distance',frame=f)
s.use_nodes=True;n=s.node_tree.nodes;n.clear();l=s.node_tree.links
rl=n.new('CompositorNodeRLayers');g=n.new('CompositorNodeGlare');g.glare_type='FOG_GLOW';g.quality='MEDIUM';g.threshold=1.7;g.mix=-.85
l.new(rl.outputs['Image'],g.inputs[0]);out=n.new('CompositorNodeComposite');l.new(g.outputs[0],out.inputs[0])
# Local tablet rectangle for the live declared number; export the exact camera motion.
corners=[(-.73,-.329,1.16),(.73,-.329,1.16),(.73,-.329,-1.10),(-.73,-.329,-1.10)]
anchors=[]
for f in range(108,181,2):
    s.frame_set(f);pts=[world_to_camera_view(s,cam,hero.matrix_world@Vector(pt)) for pt in corners]
    anchors.append({'time':round((f-1)/30,6),'points':[[round(p.x,7),round(1-p.y,7)] for p in pts]})
with open(os.path.join(a.out,'text-anchors.json'),'w',encoding='utf-8') as f:json.dump(anchors,f,indent=2)
s.frame_set(138);bpy.ops.wm.save_as_mainfile(filepath=os.path.join(a.out,'azorubine.blend'))
if a.preview:
    for f in [40,102,143]:
        s.frame_set(f);s.render.filepath=os.path.join(a.out,f'key-{f:03d}.png');bpy.ops.render.render(write_still=True)
else:
    os.makedirs(os.path.join(a.out,'frames'),exist_ok=True)
    s.render.filepath=os.path.join(a.out,'frames/frame-');bpy.ops.render.render(animation=True)
