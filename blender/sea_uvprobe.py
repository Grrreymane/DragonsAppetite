# 找贴图上某块身体区域对应的 UV 位置（修接缝用）
#   blender -b <rig.blend> -P sea_uvprobe.py -- x0,x1,y0,y1,z0,z1 <贴图边长px> [out.png]
# 打印落在这个包围盒里的面：UV 包围盒（像素，左上原点）和每个 UV 岛的范围；给 out.png 时渲染一张仰视近景
import bpy, sys, bmesh
argv = sys.argv[sys.argv.index('--') + 1:]
x0, x1, y0, y1, z0, z1 = map(float, argv[0].split(',')); N = int(argv[1]); OUT = argv[2] if len(argv) > 2 else None
sc = bpy.context.scene
mesh = next(o for o in sc.objects if o.type == 'MESH'); me = mesh.data
for tr in (next(o for o in sc.objects if o.type == 'ARMATURE').animation_data.nla_tracks): tr.mute = True
uv = me.uv_layers.active.data
hits = []
for p in me.polygons:
    c = p.center
    if x0 <= c.x <= x1 and y0 <= c.y <= y1 and z0 <= c.z <= z1:
        us = [uv[li].uv for li in p.loop_indices]
        hits.append((p.index, [(u.x * N, (1 - u.y) * N) for u in us]))
print('FACES', len(hits))
# 按 UV 连通性粗分组（像素距离 < 6 视为同一块）
groups = []
for idx, pts in hits:
    bb = [min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts)]
    for g in groups:
        if bb[0] < g[2] + 6 and bb[2] > g[0] - 6 and bb[1] < g[3] + 6 and bb[3] > g[1] - 6:
            g[0] = min(g[0], bb[0]); g[1] = min(g[1], bb[1]); g[2] = max(g[2], bb[2]); g[3] = max(g[3], bb[3]); g[4] += 1; break
    else: groups.append(bb + [1])
for g in sorted(groups, key=lambda g: -g[4]): print('UVBOX px', [round(v) for v in g[:4]], 'faces', g[4])
if OUT:
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'FLAT'; sc.display.shading.color_type = 'TEXTURE'
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = max(x1 - x0, y1 - y0) * 1.6
    cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = ((x0 + x1) / 2, (y0 + y1) / 2, -3); cam.rotation_euler = (3.14159, 0, 0)
    sc.render.resolution_x = sc.render.resolution_y = 800; sc.render.filepath = OUT; bpy.ops.render.render(write_still=True)
