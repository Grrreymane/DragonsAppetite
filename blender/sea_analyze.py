# 海龙：导入 Tripo glb，按 rig json 里的 import_rot_z 转到「头朝 +X」，
# 打印顶点分段统计，渲染带网格的 侧视 / 俯视 / 正视 正交图（用来放骨头）
# blender -b --factory-startup -P sea_analyze.py -- <in.glb> <out_dir> [rot_z_deg=90]
import bpy, sys, os, math, json, subprocess
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
ROT = float(argv[2]) if len(argv) > 2 else 90.0
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
mw = mesh.matrix_world.copy(); mesh.parent = None; mesh.matrix_world = Matrix.Rotation(math.radians(ROT), 4, 'Z') @ mw
for o in list(bpy.context.scene.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
V = [v.co.copy() for v in mesh.data.vertices]
lo = Vector((min(v.x for v in V), min(v.y for v in V), min(v.z for v in V)))
hi = Vector((max(v.x for v in V), max(v.y for v in V), max(v.z for v in V)))
print('verts', len(V), 'tris', sum(len(p.vertices) - 2 for p in mesh.data.polygons))
print('BBOX', tuple(round(x, 4) for x in lo), tuple(round(x, 4) for x in hi))

def band(filt, key, a, b, step, label):
    print('==', label)
    x = a
    while x < b - 1e-9:
        pts = [v for v in V if filt(v) and x <= key(v) < x + step]
        if len(pts) > 3:
            c = sum(pts, Vector()) / len(pts)
            xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = sorted(p.z for p in pts)
            print(f'  {x:+.3f} n={len(pts):4d} c=({c.x:+.3f},{c.y:+.3f},{c.z:+.3f}) x[{min(xs):+.3f},{max(xs):+.3f}] y[{min(ys):+.3f},{max(ys):+.3f}] z[{zs[0]:+.3f},{zs[-1]:+.3f}] z10/90[{zs[len(zs)//10]:+.3f},{zs[9*len(zs)//10]:+.3f}]')
        x += step
band(lambda v: True, lambda v: v.x, lo.x, hi.x, 0.025, 'all verts by x')
band(lambda v: abs(v.y) < 0.02, lambda v: v.x, lo.x, hi.x, 0.025, 'centre strip |y|<.02 by x')

sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.world = bpy.data.worlds.new('w')
cd = bpy.data.cameras.new('cam'); cd.type = 'ORTHO'
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
S = 1.1
views = {  # 名字: 相机位置, 欧拉, 分辨率, 右/上轴
    'side': ((0, -5, 0), (math.pi / 2, 0, 0), (2048, 1024), ('+X', '+Z')),
    'top': ((0, 0, 5), (0, 0, 0), (2048, 1024), ('+X', '+Y')),
    'front': ((5, 0, 0), (math.pi / 2, 0, math.pi / 2), (1024, 1024), ('+Y', '+Z')),
}
meta = {}
for name, (loc, rot, res, axes) in views.items():
    sc.render.resolution_x, sc.render.resolution_y = res
    cd.ortho_scale = S if res[0] >= res[1] else S
    cam.location = loc; cam.rotation_euler = rot
    p = os.path.join(OUT, name + '.png'); sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    meta[name] = [p, res[0], res[1], axes[0], axes[1]]

# 网格：每 0.025 一条线，每 0.05 标数，0 线红（系统 python + Pillow）
code = r'''
import sys, json
from PIL import Image, ImageDraw
meta, S = json.loads(sys.argv[1]), float(sys.argv[2])
for name, (p, W, H, hx, vy) in meta.items():
    im = Image.open(p).convert('RGB'); d = ImageDraw.Draw(im)
    ppu = W / S   # 每单位像素（ortho_scale 对应宽边）
    for k in range(-40, 41):
        v = k * 0.025
        px = W / 2 + v * ppu; py = H / 2 - v * ppu
        col = (255, 0, 0) if k == 0 else (90, 140, 255) if k % 2 == 0 else (150, 160, 180)
        if 0 <= px < W: d.line([(px, 0), (px, H)], fill=col, width=1)
        if 0 <= py < H: d.line([(0, py), (W, py)], fill=col, width=1)
        if k % 2 == 0:
            if 0 <= px < W: d.text((px + 2, 2), f'{v:+.2f}', fill=(255, 255, 0))
            if 0 <= py < H: d.text((2, py + 2), f'{v:+.2f}', fill=(255, 255, 0))
    d.text((W - 200, H - 14), f'right={hx} up={vy}', fill=(255, 255, 0))
    im.save(p.replace('.png', '_grid.png'))
'''
subprocess.run(['python', '-c', code, json.dumps(meta), str(S)], check=True)
print('saved views to', OUT)
