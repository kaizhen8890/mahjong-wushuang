import bpy,sys
from pathlib import Path
s=bpy.context.scene
mem=bpy.data.materials['Blue violet thin-film protection']
mn=mem.node_tree.nodes;mn.clear();ml=mem.node_tree.links;mo=mn.new('ShaderNodeOutputMaterial');mt=mn.new('ShaderNodeBsdfTransparent');me=mn.new('ShaderNodeEmission');me.inputs[0].default_value=(.10,.25,1,1);me.inputs[1].default_value=1.7;lw=mn.new('ShaderNodeLayerWeight');lw.inputs['Blend'].default_value=.3;mx=mn.new('ShaderNodeMixShader');ml.new(lw.outputs['Fresnel'],mx.inputs[0]);ml.new(mt.outputs[0],mx.inputs[1]);ml.new(me.outputs[0],mx.inputs[2]);ml.new(mx.outputs[0],mo.inputs['Surface'])
s.frame_start=165;s.frame_end=240
s.render.filepath=str(Path(bpy.data.filepath).parent/'frames/frame-')
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
bpy.ops.render.render(animation=True)
