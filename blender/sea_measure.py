# 海龙：量脊柱中心线和四条腿的中心线（头朝 +X 之后的坐标）
# blender -b --factory-startup -P sea_measure.py -- <in.glb> [rot_z_deg=90] [hindX0,hindX1,frontX0,frontX1] [legYmin]
import bpy, sys, math
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
SRC = argv[0]; ROT = float(argv[1]) if len(argv) > 1 else 90.0
HX0, HX1, FX0, FX1 = map(float, argv[2].split(',')) if len(argv) > 2 else (-0.03, 0.12, 0.13, 0.30)
LY = float(argv[3]) if len(argv) > 3 else 0.035
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
M = Matrix.Rotation(math.radians(ROT), 4, 'Z') @ mesh.matrix_world
V = [M @ v.co for v in mesh.data.vertices]

print('== centreline: per x slice, widest-part z range (body sides, excludes thin crest/keel)')
x = min(v.x for v in V)
while x < max(v.x for v in V):
    pts = [v for v in V if x <= v.x < x + 0.02 and not (HX0 < v.x < FX1 and v.z < -0.07)]
    if len(pts) > 5:
        wy = max(abs(p.y) for p in pts)
        side = [p for p in pts if abs(p.y) > 0.5 * wy and abs(p.y) < 0.065]
        allz = sorted(p.z for p in pts)
        if side:
            zs = sorted(p.z for p in side)
            print(f'  x={x + .01:+.3f} halfwidth={wy:.3f} side z[{zs[0]:+.3f},{zs[-1]:+.3f}] mid={(zs[0] + zs[-1]) / 2:+.3f}  all z[{allz[0]:+.3f},{allz[-1]:+.3f}]')
    x += 0.02

for side, sg in (('L', 1), ('R', -1)):
    for part, a, b in (('hind', HX0, HX1), ('front', FX0, FX1)):
        print(f'== leg {side} {part}: by z (verts with y*sg>{LY} or z<-0.065)')
        z = 0.04
        while z > -0.16:
            pts = [v for v in V if a < v.x < b and z - 0.015 <= v.z < z and v.y * sg > 0 and (v.y * sg > LY or v.z < -0.065)]
            if len(pts) > 3:
                c = sum(pts, Vector()) / len(pts)
                xs = [p.x for p in pts]; ys = [p.y for p in pts]
                print(f'  z={z - .0075:+.3f} n={len(pts):4d} c=({c.x:+.3f},{c.y:+.3f}) x[{min(xs):+.3f},{max(xs):+.3f}] y[{min(ys):+.3f},{max(ys):+.3f}]')
            z -= 0.015
