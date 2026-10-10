# 导入 glb，打印包围盒，渲染 侧视 / 顶视 / 正视 三张正交图（用来定关节位置）
# blender -b --factory-startup -P render_views.py -- <in.glb> <out_dir>
import bpy, sys, os, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
src, out = argv[0], argv[1]
os.makedirs(out, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = mathutils.Vector((1e9,) * 3); hi = -lo
for o in meshes:
    for v in o.bound_box:
        w = o.matrix_world @ mathutils.Vector(v)
        lo = mathutils.Vector(map(min, lo, w)); hi = mathutils.Vector(map(max, hi, w))
print('BBOX', tuple(round(x, 4) for x in lo), tuple(round(x, 4) for x in hi))
c = (lo + hi) / 2; size = hi - lo

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x = sc.render.resolution_y = 1024
sc.render.film_transparent = False
w = bpy.data.worlds.new('w'); sc.world = w
cam_data = bpy.data.cameras.new('cam'); cam_data.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cam_data); sc.collection.objects.link(cam); sc.camera = cam
S = max(size) * 1.1; cam_data.ortho_scale = S
views = {
    # 名字: (相机位置偏移方向, 旋转欧拉)
    'side_px': ((1, 0, 0), (1.5708, 0, 1.5708)),    # 从 +X 看向 -X
    'top':     ((0, 0, 1), (0, 0, 0)),              # 从上往下
    'front_ny': ((0, -1, 0), (1.5708, 0, 0)),       # 从 -Y 看向 +Y
}
for name, (d, rot) in views.items():
    cam.location = c + mathutils.Vector(d) * 5
    cam.rotation_euler = rot
    sc.render.filepath = os.path.join(out, name + '.png')
    bpy.ops.render.render(write_still=True)
    print('VIEW', name, 'center', tuple(round(x, 4) for x in c), 'ortho', round(S, 4))
