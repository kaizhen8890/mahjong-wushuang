"""Four camera-facing textured glyphs; accurate font counters, white face, violet outline."""
from pathlib import Path
import bpy
def replace_title(scene,glyph_dir,portrait):
 title=bpy.data.objects['Judgement title landing']
 for o in list(title.children):bpy.data.objects.remove(o,do_unlink=True)
 for index,char in enumerate('宿星审判'):
  im=bpy.data.images.load(str(Path(glyph_dir)/f'glyph-{index}.png'),check_existing=True);im.pack();m=bpy.data.materials.new('Exact outlined STZhongsong '+char);m.use_nodes=True;n=m.node_tree.nodes;n.clear();l=m.node_tree.links;tex=n.new('ShaderNodeTexImage');tex.image=im;tex.interpolation='Linear';e=n.new('ShaderNodeEmission');e.inputs[1].default_value=3.2;l.new(tex.outputs['Color'],e.inputs[0]);tr=n.new('ShaderNodeBsdfTransparent');mix=n.new('ShaderNodeMixShader');l.new(tex.outputs['Alpha'],mix.inputs[0]);l.new(tr.outputs[0],mix.inputs[1]);l.new(e.outputs[0],mix.inputs[2]);out=n.new('ShaderNodeOutputMaterial');l.new(mix.outputs[0],out.inputs['Surface'])
  size=2.68 if portrait else 2.32;h=size/2;d=bpy.data.meshes.new('Exact glyph plane '+char);d.from_pydata([(-h,-h,0),(h,-h,0),(h,h,0),(-h,h,0)],[],[(0,1,2,3)]);d.update();uv=d.uv_layers.new(name='Glyph UV')
  for j,co in enumerate([(0,0),(1,0),(1,1),(0,1)]):uv.data[j].uv=co
  o=bpy.data.objects.new('宿星审判 '+char,d);scene.collection.objects.link(o);d.materials.append(m);o.parent=title;o.location=((index%2-.5)*2.65,(.5-index//2)*2.7,0) if portrait else ((index-1.5)*2.15,0,0);o['font_family']='STZhongsong';o['glyph']=char;o['title_style']='white face, violet outline'
