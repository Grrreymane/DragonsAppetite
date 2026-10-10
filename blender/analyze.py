# 读顶点，按区域分段求中心线，帮助放骨头（坐标：+X 朝前，+Y 朝左，+Z 朝上）
# blender -b --factory-startup -P analyze.py -- <in.glb> [rot_z_deg=0]
#   rot_z_deg：先绕 Z 转多少度让头朝 +X（火龙 0；海龙 90）。下面的分段阈值是按火龙成龙定的，别的体型要改（海龙用 sea_analyze.py / sea_measure.py）
import bpy, sys, math, mathutils, statistics as st
argv = sys.argv[sys.argv.index('--') + 1:]
ROT = float(argv[1]) if len(argv) > 1 else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=argv[0])
o = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
R = mathutils.Matrix.Rotation(math.radians(ROT), 4, 'Z')
V = [R @ o.matrix_world @ v.co for v in o.data.vertices]
print('verts', len(V))
def band(filt, key, lo, hi, step, label):
    print('==', label)
    x = lo
    while x < hi - 1e-9:
        pts = [v for v in V if filt(v) and x <= key(v) < x + step]
        if len(pts) > 3:
            c = sum(pts, mathutils.Vector()) / len(pts)
            zs = [p.z for p in pts]; ys = [p.y for p in pts]; xs = [p.x for p in pts]
            print(f'  {x:+.3f}  n={len(pts):4d}  c=({c.x:+.3f},{c.y:+.3f},{c.z:+.3f})  x[{min(xs):+.3f},{max(xs):+.3f}] y[{min(ys):+.3f},{max(ys):+.3f}] z[{min(zs):+.3f},{max(zs):+.3f}]')
        x += step
# 躯干 + 脖子 + 头 + 尾巴：|y| 小的点，按 x 分段
band(lambda v: abs(v.y) < .07 and v.z > -.16, lambda v: v.x, -.5, .5, .04, 'spine (|y|<.07, z>-.16) by x')
# 腿：z < -.12，按左右、前后分
for side, sgn in (('L', 1), ('R', -1)):
    for part, cond in (('front', lambda v: v.x > .2), ('hind', lambda v: 0 < v.x <= .2)):
        band(lambda v, sgn=sgn, cond=cond: v.y * sgn > 0 and cond(v) and v.z < -.08 and abs(v.y) < .12, lambda v: -v.z, .08, .25, .02, f'leg {side} {part} by -z')
# 翅膀：|y| > .08 且 z > -.05，按 |y| 分段
for side, sgn in (('L', 1), ('R', -1)):
    band(lambda v, sgn=sgn: v.y * sgn > .07 and v.z > -.06, lambda v: abs(v.y), .06, .52, .04, f'wing {side} by |y|')
