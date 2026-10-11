# 岛的精模流水线（Tripo 智能网格 → 游戏用 glb + 碰撞高度图）
#
#   探查（打印尺寸 / 按高度的颜色表，渲染几张检查图，帮着定海平面）：
#     blender -b --factory-startup -P env_island.py -- probe <tripo.glb> <out_dir>
#   生成：
#     blender -b --factory-startup -P env_island.py -- build <tripo.glb> <out.glb> <out.json> <sea> [key=value ...]
#       sea：海平面在原始模型里的高度，按包围盒高度的比例（0 = 最低点，1 = 最高点）
#       可选：tris=4600（LOD0 三角面上限）lod1=0.3 lod2=0.09（LOD1 / LOD2 相对 LOD0 的比例）tex=1024 n=48（高度图格数）
#             rot=0（绕竖轴先转多少度）kind=volcano|green|spire  rq=0.75（岸线半径取第几分位）
#             rx= ry=（先绕 X / Y 轴转几度，把歪的岛面摆平）vgf=0.25（水下优先减面的力度）q=82（WebP 质量）
#
# 归一化：岸线（海平面那一圈）的半径 = 1，海平面 y = 0（glTF 是 y 朝上）；水下的岩基照样保留在 y < 0。
# 高度图：在 [-ext, ext]² 上 n×n 个点从上往下打射线，记最高的表面（水上是岛面，岸线外是水下岩基的顶面），
#   没打到 = -9999。整数，单位 q（模型单位）。由 blender/env_shapes.py 汇总进 src/config/island-shapes.js。
import bpy, bmesh, sys, os, math, json, mathutils
import mathutils.kdtree
from mathutils.bvhtree import BVHTree

argv = sys.argv[sys.argv.index('--') + 1:]
MODE = argv[0]


def load(src):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    # 去掉父级（Tripo 的 glb 有一个根节点），把变换应用进网格
    mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in list(bpy.context.scene.objects):
        if o != ob: bpy.data.objects.remove(o, do_unlink=True)
    return ob


def base_image(ob):
    for m in ob.data.materials:
        if not m or not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                l = n.inputs['Base Color'].links
                if l and l[0].from_node.type == 'TEX_IMAGE': return m, n, l[0].from_node
    return None, None, None


def tex_sampler(img):
    w, h = img.size; px = list(img.pixels[:]) if img else []
    def at(u, v):
        x = min(w - 1, max(0, int((u % 1) * w))); y = min(h - 1, max(0, int((v % 1) * h))); i = (y * w + x) * 4
        return px[i], px[i + 1], px[i + 2]
    return at


def stats(ob):
    me = ob.data
    zs = [v.co.z for v in me.vertices]
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    return min(zs), max(zs), tris


def color_table(ob, bins=40):
    """每个高度段的平均颜色（从贴图采样）和该段顶点的水平半径，帮着找岸线。"""
    me = ob.data; m, bsdf, tn = base_image(ob)
    at = tex_sampler(tn.image) if tn else None
    uv = me.uv_layers.active.data if me.uv_layers.active else None
    z0, z1, _ = stats(ob); H = z1 - z0
    acc = [[0, 0, 0, 0, []] for _ in range(bins)]
    cx = sum(v.co.x for v in me.vertices) / len(me.vertices); cy = sum(v.co.y for v in me.vertices) / len(me.vertices)
    for p in me.polygons:
        z = p.center.z; b = min(bins - 1, int((z - z0) / H * bins))
        if at and uv:
            u = sum(uv[li].uv.x for li in p.loop_indices) / p.loop_total; v = sum(uv[li].uv.y for li in p.loop_indices) / p.loop_total
            r, g, bb = at(u, v); a = acc[b]; a[0] += r; a[1] += g; a[2] += bb; a[3] += 1
        acc[b][4].append(math.hypot(p.center.x - cx, p.center.y - cy))
    print('HEIGHT TABLE  frac   r     g     b    (b-r)  n    radius(p50/p90)')
    for i in range(bins - 1, -1, -1):
        a = acc[i]; n = max(1, a[3]); rs = sorted(a[4]) or [0]
        print(f'  {i / bins:5.3f}  {a[0] / n:.2f}  {a[1] / n:.2f}  {a[2] / n:.2f}  {(a[2] - a[0]) / n:+.2f}  {a[3]:4d}  {rs[len(rs) // 2]:.3f}/{rs[int(len(rs) * .9)]:.3f}')


def setup_render(res=900):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x = sc.render.resolution_y = res
    w = bpy.data.worlds.new('w'); w.color = (1, 1, 1); sc.world = w
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    return sc, cam


def shoot(sc, cam, path, loc, target, lens=50):
    cam.location = loc; cam.data.lens = lens
    d = mathutils.Vector(target) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)


def water_plane(z, size, color=(.15, .45, .6, 1)):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    pl = bpy.context.active_object; mat = bpy.data.materials.new('water'); mat.diffuse_color = color
    pl.data.materials.append(mat); return pl


def views(ob, out, prefix, sea_z=None, center=(0, 0), R=None):
    sc, cam = setup_render()
    z0, z1, _ = stats(ob)
    xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]
    S = max(max(xs) - min(xs), max(ys) - min(ys), z1 - z0)
    c = mathutils.Vector((center[0], center[1], (z0 + z1) / 2))
    D = S * 2.2
    shoot(sc, cam, os.path.join(out, prefix + '_34.png'), c + mathutils.Vector((D * .55, -D * .7, D * .45)), c)
    shoot(sc, cam, os.path.join(out, prefix + '_side.png'), c + mathutils.Vector((0, -D, 0)), c)
    pl = None
    if sea_z is not None:
        pl = water_plane(sea_z, S * 3)
        shoot(sc, cam, os.path.join(out, prefix + '_sea34.png'), c + mathutils.Vector((-D * .6, -D * .6, D * .5)), (c.x, c.y, sea_z + (z1 - sea_z) * .3))
        shoot(sc, cam, os.path.join(out, prefix + '_seaside.png'), mathutils.Vector((c.x, c.y - D, sea_z + (z1 - sea_z) * .25)), (c.x, c.y, sea_z + (z1 - sea_z) * .3))
        bpy.data.objects.remove(pl, do_unlink=True)
        shoot(sc, cam, os.path.join(out, prefix + '_under.png'), mathutils.Vector((c.x + D * .4, c.y - D * .8, sea_z - (sea_z - z0) * .4)), (c.x, c.y, (sea_z + z0) / 2))


def kv(rest):
    o = {}
    for a in rest:
        if '=' in a: k, v = a.split('=', 1); o[k] = v
    return o


if MODE == 'probe':
    src, out = argv[1], argv[2]; os.makedirs(out, exist_ok=True)
    ob = load(src)
    z0, z1, tris = stats(ob)
    m, bsdf, tn = base_image(ob)
    print('PROBE', os.path.basename(src), 'verts', len(ob.data.vertices), 'polys', len(ob.data.polygons), 'tris', tris)
    print('BBOX', tuple(round(x, 3) for x in ob.bound_box[0]), tuple(round(x, 3) for x in ob.bound_box[6]))
    print('MATS', [mm.name for mm in ob.data.materials], 'IMG', tn.image.name if tn else None, tn.image.size[:] if tn else None)
    for mm in ob.data.materials:
        if mm and mm.use_nodes:
            for n in mm.node_tree.nodes:
                if n.type == 'TEX_IMAGE': print('  texnode', n.image.name if n.image else None, [l.to_socket.name for l in n.outputs[0].links])
    color_table(ob)
    # 沙滩（黄色像素）的顶点拟合一个平面：岛面歪了的话给 build 用 tilt
    m, bsdf, tn = base_image(ob); at = tex_sampler(tn.image); uv = ob.data.uv_layers.active.data
    pts = []
    for poly in ob.data.polygons:
        for li in poly.loop_indices:
            r, g, b = at(uv[li].uv.x, uv[li].uv.y)
            if r > .5 and r >= g > b and g > .38 and b < g * .8 and r - g < .3: pts.append(ob.data.vertices[ob.data.loops[li].vertex_index].co.copy())
    if len(pts) > 30:
        import numpy as np
        A = np.array([[q.x, q.y, 1] for q in pts]); z = np.array([q.z for q in pts])
        (a, b, c), *_ = np.linalg.lstsq(A, z, rcond=None)
        print('SAND', len(pts), 'plane dz/dx %.3f dz/dy %.3f z0 %.3f  -> rx=%.1f ry=%.1f' % (a, b, c, math.degrees(math.atan(b)), -math.degrees(math.atan(a))))
        zs = sorted(q.z for q in pts); print('SAND z p10/p50/p90', round(zs[len(zs)//10], 3), round(zs[len(zs)//2], 3), round(zs[len(zs)*9//10], 3))
    views(ob, out, 'raw')
    sys.exit(0)

# ---------------------------------------------------------------- build
src, out_glb, out_json, sea_frac = argv[1], argv[2], argv[3], float(argv[4])
O = kv(argv[5:])
TRIS = int(O.get('tris', 4600)); LOD1 = float(O.get('lod1', .3)); LOD2 = float(O.get('lod2', .09)); TEX = int(O.get('tex', 1024)); N = int(O.get('n', 48))
VGF = float(O.get('vgf', .25)); ROT = float(O.get('rot', 0)); KIND = O.get('kind', 'green'); RQ = float(O.get('rq', .75))
# 程序化岩基（skirt=1，默认开）：Tripo 的水下部分在 cut（归一化后的高度）以下切掉，换成一圈按岸线轮廓往下、往外台阶状张开的岩基，
#   一直到 bot；flare = 张开的力度（1 = 底部约 1.6 倍岸线半径）。Tripo 给水下的面少、减面后是一片片破碎的大三角 + 海草片，水下看很糙。
SKIRT = O.get('skirt', '1') != '0'; CUT = float(O.get('cut', -.08)); BOT = float(O.get('bot', -1.3)); FLARE = float(O.get('flare', 1))
SKM = int(O.get('skm', 48))
# seaR：量岸线半径用的高度（比例，默认 = sea）。海平面往上挪（把露出水面的台座 / 墙压进水里）时，岸线半径仍按原来的墙量，岛的大小不变
SEA_R = float(O.get('seaR', sea_frac))
chk = os.path.join(os.path.dirname(out_json), 'check'); os.makedirs(chk, exist_ok=True)
name = os.path.splitext(os.path.basename(out_glb))[0]
ob = load(src)
if O.get('rx') or O.get('ry'):     # 先把歪的岛面摆平（probe 的 SAND 行给出角度）
    ob.data.transform(mathutils.Matrix.Rotation(math.radians(float(O.get('rx', 0))), 4, 'X') @ mathutils.Matrix.Rotation(math.radians(float(O.get('ry', 0))), 4, 'Y'))
    ob.data.update()
z0, z1, tris0 = stats(ob)
H = z1 - z0; sea = z0 + H * sea_frac; seaR = z0 + H * SEA_R
# 岸线：海平面上下 2% 高度内的顶点
band = [v.co for v in ob.data.vertices if abs(v.co.z - seaR) < H * .02]
if len(band) < 20: band = sorted(ob.data.vertices, key=lambda v: abs(v.co.z - seaR))[:200]; band = [v.co for v in band]
cx = (min(p.x for p in band) + max(p.x for p in band)) / 2; cy = (min(p.y for p in band) + max(p.y for p in band)) / 2
ds = sorted(math.hypot(p.x - cx, p.y - cy) for p in band); R0 = ds[int(len(ds) * RQ)]
print('NORMALIZE sea', round(sea, 4), 'center', round(cx, 4), round(cy, 4), 'R0', round(R0, 4), 'band', len(band))
M = mathutils.Matrix.Scale(1 / R0, 4) @ mathutils.Matrix.Rotation(math.radians(ROT), 4, 'Z') @ mathutils.Matrix.Translation((-cx, -cy, -sea))
ob.data.transform(M); ob.data.update()
z0, z1, _ = stats(ob)
print('NORMALIZED z', round(z0, 3), round(z1, 3), 'tris', tris0)

# 贴图：只留底色，缩到 TEX
mat, bsdf, tn = base_image(ob)
if tn:
    img = tn.image
    if img.size[0] > TEX: img.scale(TEX, TEX)
    for inp in bsdf.inputs:
        if inp.name != 'Base Color':
            for l in list(inp.links): mat.node_tree.links.remove(l)
    for n in list(mat.node_tree.nodes):
        if n.type == 'TEX_IMAGE' and n != tn: mat.node_tree.nodes.remove(n)
    bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 1
    img.name = name
mat.name = name
while len(ob.data.materials) > 1: ob.data.materials.pop(index=1)

# 减面：水下（y < -0.08）优先减，水上细节留着
def decimate(o, target, weighted=True):
    me = o.data
    vg = o.vertex_groups.get('under') or o.vertex_groups.new(name='under')
    vg.add([v.index for v in me.vertices if v.co.z < -.08], 1.0, 'REPLACE')
    vg.add([v.index for v in me.vertices if v.co.z >= -.08], .1, 'REPLACE')   # 0 = 完全不减（Blender 的规则），所以给一点点
    cur = sum(len(p.vertices) - 2 for p in me.polygons)
    if cur <= target: return cur
    md = o.modifiers.new('dec', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = target / cur
    if weighted: md.vertex_group = 'under'; md.vertex_group_factor = VGF
    md.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=md.name)
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

def counts(o):
    a = b = 0
    for p in o.data.polygons:
        if p.center.z < 0: b += len(p.vertices) - 2
        else: a += len(p.vertices) - 2
    return a, b

import random

def cut_below(o, zc):
    """在 zc 处水平切开，扔掉下面的部分；再扔掉切完后整块都在水下的小碎片（海草片、碎石）。"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zc), plane_no=(0, 0, 1), clear_inner=True)
    seen = set(); kill = []
    for f in bm.faces:
        if f in seen: continue
        comp = []; stack = [f]; seen.add(f)
        while stack:
            g = stack.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in seen: seen.add(h); stack.append(h)
        if len(comp) < 400 and max(v.co.z for g in comp for v in g.verts) < 0: kill += comp
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(o.data); bm.free(); o.data.update()
    print('CUT at', zc, 'removed fragments', len(kill))


def build_skirt(o, M):
    """岸线轮廓（切口上方一点，水平往里打射线量半径）→ 一圈圈往下、往外台阶状张开的岩基网格，并进 o。"""
    me = o.data
    dg = bpy.context.evaluated_depsgraph_get(); bvh = BVHTree.FromObject(o, dg)
    Rf = max(math.hypot(v.co.x, v.co.y) for v in me.vertices) * 1.3 + 1
    rt = []
    for i in range(M):
        a = 2 * math.pi * i / M; d = mathutils.Vector((-math.cos(a), -math.sin(a), 0))
        hs = []
        for zc in (CUT + .012, CUT + .03, CUT + .055):
            hit = bvh.ray_cast(mathutils.Vector((math.cos(a) * Rf, math.sin(a) * Rf, zc)), d, Rf)
            if hit[0] is not None: hs.append(Rf - hit[3])
        rt.append(sorted(hs)[len(hs) // 2] if hs else None)
    ok = [r for r in rt if r is not None]
    if not ok: rt = [1.0] * M
    else:
        for i in range(M):                  # 没打到的方向：用两边最近的补上
            if rt[i] is None:
                for k in range(1, M):
                    a, b = rt[(i - k) % M], rt[(i + k) % M]
                    if a is not None or b is not None: rt[i] = a if b is None else b if a is None else (a + b) / 2; break
    # 去掉尖刺（伸出去的海草、碎石）：环形中值滤波，再平滑两遍
    rt = [sorted(rt[(i + k) % M] for k in range(-2, 3))[2] for i in range(M)]
    for _ in range(2): rt = [(rt[(i - 1) % M] + 2 * rt[i] + rt[(i + 1) % M]) / 4 for i in range(M)]
    # 台阶：陡壁和往外的平台交替（t = 从切口往下到底的比例，f = 半径倍数）；第一圈在切口上方、缩在墙里面，把接缝藏住
    # 最后一段是缓坡（裙边）：岩基和海底斜着相交，海底网格（5 米一格）在交界处不会戳出一排尖牙
    RINGS = [(-1, .9), (0, 1.0), (.06, 1.03), (.15, 1.1), (.22, 1.13), (.38, 1.21), (.45, 1.25), (.62, 1.35), (.7, 1.39), (.86, 1.5), (1, 1.85)]
    rnd = random.Random(name)
    p = [rnd.uniform(0, 6.283) for _ in range(6)]
    lob = lambda a: .08 * math.sin(3 * a + p[0]) + .05 * math.sin(5 * a + p[1]) + .03 * math.sin(9 * a + p[2])
    # 贴图坐标：整圈岩基用同一个点——切口附近原模表面颜色的「中位数」那个像素（贴图是 Tripo 的图集，
    #   相邻两列各取各的 UV 会在面上插值穿过整张图集，出来一道道彩条）。水下的颜色由着色器画，这里只要接缝处颜色接得上
    uvl = me.uv_layers.active
    mt, bs, tn_ = base_image(o); at = tex_sampler(tn_.image) if tn_ else None
    cand = []
    if at:
        for poly in me.polygons:
            if CUT - .01 <= poly.center.z <= CUT + .12:
                for li in poly.loop_indices:
                    u, v = uvl.data[li].uv; c = at(u, v); cand.append((sum(c) / 3, (u, v)))
    cand.sort()
    one_uv = cand[len(cand) // 2][1] if cand else (.5, .5)
    print('SKIRT uv', [round(x, 3) for x in one_uv], 'lum', round(cand[len(cand) // 2][0], 3) if cand else None)
    bm = bmesh.new(); uvb = bm.loops.layers.uv.new(uvl.name)
    grid = []; col_uv = [one_uv] * M
    for j, (t, f) in enumerate(RINGS):
        row = []
        for i in range(M):
            a = 2 * math.pi * i / M
            tt = max(0, t)
            y = CUT + .05 if t < 0 else CUT + (BOT - CUT) * t
            ff = 1 + (f - 1) * FLARE
            r = rt[i] * ff * (1 + tt * lob(a) * FLARE) + (.03 * tt * math.sin(a * 13 + j * 2.1) if 0 < t < 1 else 0)
            row.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, y)))
        grid.append(row)
    for j in range(len(RINGS) - 1):
        for i in range(M):
            k = (i + 1) % M
            fc = bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][k], grid[j][k]))
            for lp, ii in zip(fc.loops, (i, i, k, k)): lp[uvb].uv = col_uv[ii]
            fc.smooth = True
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    sm = bpy.data.meshes.new(name + '_skirt'); bm.to_mesh(sm); bm.free()
    sm.materials.append(me.materials[0])
    so = bpy.data.objects.new('skirt', sm); bpy.context.scene.collection.objects.link(so)
    bpy.ops.object.select_all(action='DESELECT'); so.select_set(True); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.join()
    print('SKIRT rings', len(RINGS), 'cols', M, 'r_top min/med/max %.3f/%.3f/%.3f' % (min(rt), sorted(rt)[M // 2], max(rt)))
    return (len(RINGS) - 1) * M * 2


bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); bpy.context.view_layer.objects.active = ob
if SKIRT: cut_below(ob, CUT)
# 三角化（Tripo 是四边面）
bm = bmesh.new(); bm.from_mesh(ob.data); bmesh.ops.triangulate(bm, faces=bm.faces[:]); bm.to_mesh(ob.data); bm.free()
skt = (11 - 1) * SKM * 2 if SKIRT else 0
t = decimate(ob, TRIS - skt)
if SKIRT:
    build_skirt(ob, SKM); ob = bpy.context.view_layer.objects.active
    for p in ob.data.polygons: p.use_smooth = True
    t = sum(len(p.vertices) - 2 for p in ob.data.polygons)
z0, z1, _ = stats(ob)
print('LOD0 tris', t, 'above/below', counts(ob), 'z', round(z0, 3), round(z1, 3))
# 平滑法线（描边壳沿法线外扩，不能有断开的法线）。glb 里不存法线：three.js 端按位置焊接后重算（省 1/3 体积）
for p in ob.data.polygons: p.use_smooth = True
ob.name = 'lod0'; ob.data.name = name + '_lod0'
# LOD1
l1 = ob.copy(); l1.data = ob.data.copy(); bpy.context.scene.collection.objects.link(l1)
l1.name = 'lod1'; l1.data.name = name + '_lod1'
decimate(l1, int(t * LOD1)); t1 = decimate(l1, int(t * LOD1), weighted=False)
print('LOD1 tris', t1, 'above/below', counts(l1))
# LOD2（很远：450 米外）
l2 = ob.copy(); l2.data = l1.data.copy(); bpy.context.scene.collection.objects.link(l2)
l2.name = 'lod2'; l2.data.name = name + '_lod2'
t2 = decimate(l2, int(t * LOD2), weighted=False)
print('LOD2 tris', t2, 'above/below', counts(l2))
for o in (ob, l1, l2):
    for g in list(o.vertex_groups): o.vertex_groups.remove(g)
    for a in list(o.data.attributes):
        if a.name.startswith('Col') or a.name == 'color': o.data.attributes.remove(a)
    while len(o.data.uv_layers) > 1: o.data.uv_layers.remove(o.data.uv_layers[1])

# 高度图（LOD0，归一化后的坐标；glTF 里 x = x，y = z，z = -y）
dg = bpy.context.evaluated_depsgraph_get()
bvh = BVHTree.FromObject(ob, dg)
xs = [v.co.x for v in ob.data.vertices]; ys = [v.co.y for v in ob.data.vertices]
ext = math.ceil(max(max(abs(x) for x in xs), max(abs(y) for y in ys)) * 1.02 * 20) / 20
Q = .004
hm = []
top = z1 + 1
# 每个格点取它和周围 4 个点（±pool 格，斜向）里最高的表面：双线性插值后不会比尖的山脊、树冠低太多（龙不会蹭进石头），
# 代价是陡壁往外挪 pool 格（默认 0.3 格：石柱 r=14 时约 0.4 米，大火山约 1.5 米）
POOL = float(O.get('pool', .3)); cell = 2 * ext / (N - 1)
offs = [(0, 0)] + ([(POOL * cell * a, POOL * cell * b) for a in (-1, 1) for b in (-1, 1)] if POOL > 0 else [])
for j in range(N):           # j → glTF z（= -blender y）
    for i in range(N):       # i → glTF x
        u = -ext + 2 * ext * i / (N - 1); v = -ext + 2 * ext * j / (N - 1)
        best = None
        for k, (du, dv) in enumerate(offs):
            hit = bvh.ray_cast(mathutils.Vector((u + du, -(v + dv), top)), mathutils.Vector((0, 0, -1)), top - z0 + 2)
            if hit[0] is None:
                if k == 0: break              # 格点本身没打到：没有表面（不让旁边的点把岛往外扩一圈）
                continue
            if best is None or hit[0].z > best: best = hit[0].z
        hm.append(round(best / Q) if best is not None else -9999)
# 自检：随机点上「真实表面 - 高度图双线性插值」（正 = 石头比碰撞面高，龙可能蹭进去一点），只看水上
def hm_at(u, v):
    f = (u + ext) / (2 * ext) * (N - 1); g = (v + ext) / (2 * ext) * (N - 1); i = int(f); j = int(g)
    if i < 0 or j < 0 or i >= N - 1 or j >= N - 1: return None
    a = f - i; b = g - j; c = [hm[(j + y) * N + i + x] for y in (0, 1) for x in (0, 1)]
    if min(c) <= -9999: return None
    return ((c[0] * (1 - a) + c[1] * a) * (1 - b) + (c[2] * (1 - a) + c[3] * a) * b) * Q
rr = random.Random(1); errs = []
for _ in range(6000):
    u = rr.uniform(-ext, ext); v = rr.uniform(-ext, ext)
    hit = bvh.ray_cast(mathutils.Vector((u, -v, top)), mathutils.Vector((0, 0, -1)), top - z0 + 2)
    if hit[0] is None or hit[0].z < 0: continue
    h = hm_at(u, v)
    if h is not None: errs.append(hit[0].z - h)
errs.sort()
if errs: print('HMERR n', len(errs), 'p1 %.3f p10 %.3f p50 %.3f p90 %.3f p99 %.3f max %.3f (model units, x r = meters)' % (errs[len(errs) // 100], errs[len(errs) // 10], errs[len(errs) // 2], errs[int(len(errs) * .9)], errs[int(len(errs) * .99)], errs[-1]))
# 火山口：最高 20% 那一圈的中心
crater = None
if KIND == 'volcano':
    zs = [h * Q for h in hm if h > -9999]; zt = max(zs)
    pts = [(i, j) for j in range(N) for i in range(N) if hm[j * N + i] > -9999 and hm[j * N + i] * Q > zt * .8]
    ci = sum(p[0] for p in pts) / len(pts); cj = sum(p[1] for p in pts) / len(pts)
    u = -ext + 2 * ext * ci / (N - 1); v = -ext + 2 * ext * cj / (N - 1)
    hit = bvh.ray_cast(mathutils.Vector((u, -v, top)), mathutils.Vector((0, 0, -1)), top - z0 + 2)
    cy_ = hit[0].z if hit[0] is not None else zt * .9
    crater = [round(u, 3), round(max(cy_, zt * .82), 3), round(v, 3)]
    print('CRATER', crater, 'rim top', round(zt, 3))

info = {'name': name, 'kind': KIND, 'n': N, 'ext': ext, 'q': Q, 'top': round(z1, 3), 'bottom': round(z0, 3),
        'tris': [t, t1, t2], 'crater': crater, 'h': hm}
with open(out_json, 'w', encoding='utf-8') as f: json.dump(info, f)

# 检查图（导出前，带海平面）
views(ob, chk, name, sea_z=0, R=1)
l1.hide_render = True; l2.hide_render = True

# 导出：三个网格节点 lod0 / lod1 / lod2，共用一个材质（底色贴图 WebP）
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' or o.name not in ('lod0', 'lod1', 'lod2'): bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); l1.select_set(True); l2.select_set(True)
bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='WEBP', export_image_quality=int(O.get('q', 82)), export_texcoords=True, export_normals=False,
                          export_tangents=False, export_materials='EXPORT', export_animations=False, export_skins=False)
print('EXPORTED', out_glb, os.path.getsize(out_glb), 'bytes')
