"""Spatial denoise of offline EEVEE transparency; keeps the original render frames."""
import bpy,sys,argparse
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--frames',default='');a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);root=Path(a.source).resolve();out=root/'clean';out.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);bpy.ops.object.camera_add();s=bpy.context.scene;s.camera=bpy.context.object;s.render.engine='BLENDER_EEVEE_NEXT';s.eevee.taa_render_samples=1;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGB';s.render.image_settings.compression=20;s.view_settings.view_transform='Standard';s.view_settings.look='None';s.view_settings.exposure=0;s.view_settings.gamma=1;s.use_nodes=True;n=s.node_tree.nodes;n.clear();inp=n.new('CompositorNodeImage');dn=n.new('CompositorNodeDenoise');outnode=n.new('CompositorNodeComposite');s.node_tree.links.new(inp.outputs['Image'],dn.inputs['Image']);s.node_tree.links.new(dn.outputs['Image'],outnode.inputs['Image'])
frames=[int(x) for x in a.frames.split(',')] if a.frames else list(range(1,241))
for f in frames:
 file=root/'frames'/f'frame-{f:04d}.png';assert file.exists(),file
 im=bpy.data.images.load(str(file));inp.image=im;s.render.resolution_x=im.size[0];s.render.resolution_y=im.size[1];s.render.filepath=str(out/file.name);bpy.ops.render.render(write_still=True);bpy.data.images.remove(im)
