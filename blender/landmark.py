# 地标精模流水线（Tripo 智能网格 → 游戏用 glb + 碰撞胶囊），参数在 blender/landmark_build.py
#
#   探查（打印尺寸、渲染几张检查图，帮着定朝向 / 海平面）：
#     blender -b --factory-startup -P landmark.py -- probe <tripo.glb> <out_dir>
#   生成：
#     blender -b --factory-startup -P landmark.py -- build <tripo.glb> <cfg.json> <out.glb> <out.json> <check_dir>
#   预览（读最终 glb，卡通感的平光渲染 + 海面 / 海底）：
#     blender -b --factory-startup -P landmark.py -- preview <in.glb> <out.png> <kind>
#
# 坐标：1 单位 = 1 米（游戏里的尺寸），glTF y 朝上。Blender 里是 z 朝上：游戏 (x, y, z) = Blender (x, z, -y)。
#   arch / bones：原点 = 地标中心、海平面（y = 0）；wreck：原点 = 和海底接触处的中心（y = 0 = 海底）；skyisle：原点 = 体积质心。
#   朝向：拱门的洞沿 +Z 穿过；沉船船头、骸骨头骨朝 +Z。
# 网格：底部（海平面 / 海底下面一点）水平切平、封口；减面到 tris；贴图只留底色（tex px，WebP）；法线不存（游戏里按位置焊接后重算）。
# 导出：一个网格节点，顶点坐标 ÷ QS、节点缩放 QS（QS = 最大坐标的绝对值往上取整，量化要坐标在 ±1 内），之后跑 glb_quantize.py。
# 碰撞：胶囊 {a, b, r}（米，游戏坐标）。从手摆的初值出发，在表面采样点上做 k-线段聚类（PCA 定轴、分位数定半径），
#   拱门的胶囊不许伸进洞里（洞 = 沿 Z 方向看穿的最大矩形，从海平面起）。打印覆盖率 / 空填率，渲染胶囊叠加图核对。
import bpy, bmesh, sys, os, math, json, mathutils
from mathutils.bvhtree import BVHTree
import numpy as np

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


def bbox(ob):
    a = np.array([v.co[:] for v in ob.data.vertices]); return a.min(0), a.max(0)


def tri_count(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)


def setup_render(res=1000, bg=(1, 1, 1), light='STUDIO'):
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = light; sh.color_type = 'TEXTURE'
    for k, v in (('show_shadows', True), ('show_shadow', True), ('shadow_intensity', .35), ('show_cavity', True), ('cavity_type', 'WORLD'),
                 ('show_object_outline', True), ('object_outline_color', (.1, .08, .07))):
        try: setattr(sh, k, v)
        except Exception: pass
    sc.display.light_direction = (.45, -.35, .82)
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = 'Standard'
    w = bpy.data.worlds.new('w'); w.color = bg; sc.world = w
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    return sc, cam


def shoot(sc, cam, path, loc, target, lens=50, ortho=None):
    cam.location = loc
    if ortho: cam.data.type = 'ORTHO'; cam.data.ortho_scale = ortho
    else: cam.data.type = 'PERSP'; cam.data.lens = lens
    cam.data.clip_end = 5000
    d = mathutils.Vector(target) - mathutils.Vector(loc)
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.abspath(path); bpy.ops.render.render(write_still=True)


def plane(z, size, color, name='plane'):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z))
    pl = bpy.context.active_object; pl.name = name
    mat = bpy.data.materials.new(name); mat.diffuse_color = color
    pl.data.materials.append(mat); return pl


def view_set(sc, cam, out, prefix, lo, hi, sides=True):
    c = mathutils.Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2))
    S = float(max(hi - lo)); D = S * 2.3
    shoot(sc, cam, os.path.join(out, prefix + '_34.png'), c + mathutils.Vector((D * .6, -D * .72, D * .42)), c)
    if sides:
        shoot(sc, cam, os.path.join(out, prefix + '_front.png'), c + mathutils.Vector((0, -D, 0)), c, ortho=S * 1.15)
        shoot(sc, cam, os.path.join(out, prefix + '_side.png'), c + mathutils.Vector((D, 0, 0)), c, ortho=S * 1.15)
        shoot(sc, cam, os.path.join(out, prefix + '_top.png'), c + mathutils.Vector((0, 0, D)), c, ortho=S * 1.15)
        shoot(sc, cam, os.path.join(out, prefix + '_back34.png'), c + mathutils.Vector((-D * .6, D * .72, D * .42)), c)


# ---------------------------------------------------------------- probe
if MODE == 'probe':
    src, out = argv[1], argv[2]; os.makedirs(out, exist_ok=True)
    ob = load(src); m, bsdf, tn = base_image(ob)
    lo, hi = bbox(ob)
    print('PROBE', os.path.basename(src), 'verts', len(ob.data.vertices), 'tris', tri_count(ob), 'mats', len(ob.data.materials),
          'img', tn.image.size[:] if tn else None)
    print('BBOX', np.round(lo, 3), np.round(hi, 3), 'size', np.round(hi - lo, 3))
    sc, cam = setup_render(800)
    view_set(sc, cam, out, os.path.splitext(os.path.basename(src))[0], lo, hi)
    sys.exit(0)


# ---------------------------------------------------------------- 碰撞胶囊（numpy，游戏坐标）
def seg_dist(P, a, b):
    """P (n,3) 到线段 ab 的距离、参数 t。"""
    d = b - a; L2 = float(d @ d)
    t = np.clip(((P - a) @ d) / L2, 0, 1) if L2 > 1e-9 else np.zeros(len(P))
    Q = a + t[:, None] * d
    return np.linalg.norm(P - Q, axis=1), t


def seg_box_dist(a, b, lo, hi, n=64):
    t = np.linspace(0, 1, n)[:, None]; P = a + t * (b - a)
    q = np.maximum(lo - P, 0) + np.maximum(P - hi, 0)
    return float(np.linalg.norm(q, axis=1).min())


def best_r(Vin, Vout, a, b, lam, rmax):
    """半径：一圈圈往外加，新加的那层里实心体素多于 lam 倍空体素就继续（得分 = 盖住的实心 - lam × 盖住的空气，取最大）。"""
    di = seg_dist(Vin, a, b)[0]; do = seg_dist(Vout, a, b)[0]
    edges = np.arange(0, min(rmax, 40) + .25, .25)
    hi_ = np.cumsum(np.histogram(di, edges)[0]); ho = np.cumsum(np.histogram(do, edges)[0])
    sc = hi_ - lam * ho
    return float(edges[1:][int(np.argmax(sc))])


def fit_capsules(Vin, Vout, caps, keepout=None, iters=6, lam=1.0, P=None, joint=True):
    """Vin / Vout：模型里 / 外的体素中心（游戏坐标）。手摆的轴做初值：体素按到轴的距离分给最近的胶囊，
    不锁的用 PCA 重定轴和两端（分位数 3 / 97，两端往里收约一个半径），半径用 best_r。"""
    caps = [dict(a=np.array(c['a'], float), b=np.array(c['b'], float), r=float(c.get('r', 4)), lock=c.get('lock', False),
                 lam=c.get('lam', lam), rmax=c.get('rmax', 40), name=c.get('name', ''), fix=c.get('fix', False),
                 search=c.get('search', 1e9), surf=c.get('surf', 0)) for c in caps]
    for c in caps: c['a0'] = c['a'].copy(); c['b0'] = c['b'].copy()
    for it in range(iters):
        D = np.stack([seg_dist(Vin, c['a'], c['b'])[0] - (c['r'] if it else 0) * .5 for c in caps], 1)
        own = D.argmin(1)
        # search：细骨头只用初始轴附近的体素重定轴（不会被旁边的骨头 / 地面拉走）
        far = np.stack([seg_dist(Vin, c['a0'], c['b0'])[0] > c['search'] for c in caps], 1)
        own[far[np.arange(len(own)), own]] = -1
        for k, c in enumerate(caps):
            if c['fix']: continue
            Q = Vin[own == k]
            if not c['lock'] and len(Q) >= 30:
                ctr = Q.mean(0); u, s_, vt = np.linalg.svd(Q - ctr, full_matrices=False); d = vt[0]
                if d @ (c['b'] - c['a']) < 0: d = -d
                t = (Q - ctr) @ d; t0, t1 = np.percentile(t, 3), np.percentile(t, 97)
                c['a'] = ctr + d * t0; c['b'] = ctr + d * t1
                r = best_r(Q, Vout, c['a'], c['b'], c['lam'], c['rmax'])
                h = (t1 - t0) / 2; pull = min(r * .8, h * .95)
                c['a'] = ctr + d * (t0 + pull); c['b'] = ctr + d * (t1 - pull)
            c['r'] = best_r(Vin, Vout, c['a'], c['b'], c['lam'], c['rmax'])
    # 半径一起定：每个胶囊只算别的胶囊没盖住的体素（不然中间那根会把整块都吃掉、变得很胖），轮几遍
    di = [seg_dist(Vin, c['a'], c['b'])[0] for c in caps]; do = [seg_dist(Vout, c['a'], c['b'])[0] for c in caps]
    for c in caps: c['r'] = c['r'] if c['fix'] or not joint else min(c['r'], 4.0)
    for rnd in range(5 if joint else 0):
        for k, c in enumerate(caps):
            if c['fix']: continue
            oi = np.zeros(len(Vin), bool); oo = np.zeros(len(Vout), bool)
            for m, e in enumerate(caps):
                if m != k: oi |= di[m] < e['r']; oo |= do[m] < e['r']
            edges = np.arange(0, min(c['rmax'], 40) + .25, .25)
            sc = np.cumsum(np.histogram(di[k][~oi], edges)[0]) - c['lam'] * np.cumsum(np.histogram(do[k][~oo], edges)[0])
            c['r'] = float(edges[1:][int(np.argmax(sc))]) if sc.max() > 0 else .5
    # surf：细骨头（比体素粗不了多少）用表面采样点定轴和半径：初始轴 search 米内的点做 PCA，半径 = 到轴距离的第 surf 分位
    for c in caps:
        if not c['surf'] or P is None: continue
        for it in range(4):
            Q = P[seg_dist(P, c['a0'] if it == 0 else c['a'], c['b0'] if it == 0 else c['b'])[0] < c['search']]
            if len(Q) < 30: break
            ctr = Q.mean(0); u, s_, vt = np.linalg.svd(Q - ctr, full_matrices=False); d = vt[0]
            if d @ (c['b0'] - c['a0']) < 0: d = -d
            t = (Q - ctr) @ d; t0, t1 = np.percentile(t, 2), np.percentile(t, 98)
            perp = np.linalg.norm((Q - ctr) - np.outer(t, d), axis=1)
            r = min(float(np.percentile(perp, c['surf'])), c['rmax'])
            pull = min(r * .8, (t1 - t0) / 2 * .95)
            c['a'] = ctr + d * (t0 + pull); c['b'] = ctr + d * (t1 - pull); c['r'] = r
    if keepout is not None:
        for c in caps:
            free = seg_box_dist(c['a'], c['b'], *keepout)
            if c['r'] > free: print(f'  KEEPOUT clamp {c["name"]} r {c["r"]:.1f} -> {free:.1f}'); c['r'] = max(free, .5)
    return caps


def cap_metrics(P, Vin, Vout, caps):
    def covered(X): return np.stack([seg_dist(X, c['a'], c['b'])[0] - c['r'] for c in caps], 1).min(1)
    D = covered(P); ci = covered(Vin) < 0; co = covered(Vout) < 0
    return float((D < 1.0).mean()), float((D < 3.0).mean()), float(ci.mean()), float(co.sum() / max(1, co.sum() + ci.sum()))


# ---------------------------------------------------------------- build
def kvf(o, k, d): return o[k] if k in o else d


if MODE == 'build':
    src, cfg_path, out_glb, out_json, chk = argv[1:6]
    os.makedirs(chk, exist_ok=True)
    cfg = json.load(open(cfg_path, encoding='utf-8'))
    KIND = cfg['kind']; name = os.path.splitext(os.path.basename(out_glb))[0]
    ob = load(src); ob.name = name; ob.data.name = name
    # glTF 导入时 UV 接缝处的顶点是分开的：先按位置焊上（UV 在 loop 上，不受影响），连通块 / 减面才对
    bm = bmesh.new(); bm.from_mesh(ob.data)
    lo_, hi_ = bbox(ob); nv = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=float(max(hi_ - lo_)) * 1e-5)
    print('WELD', nv, '->', len(bm.verts)); bm.to_mesh(ob.data); bm.free(); ob.data.update()
    R = (mathutils.Matrix.Rotation(math.radians(kvf(cfg, 'rz', 0)), 4, 'Z') @ mathutils.Matrix.Rotation(math.radians(kvf(cfg, 'ry', 0)), 4, 'Y')
         @ mathutils.Matrix.Rotation(math.radians(kvf(cfg, 'rx', 0)), 4, 'X'))
    ob.data.transform(R); ob.data.update()
    lo, hi = bbox(ob)
    # 缩放：scale = [轴, 米]，轴 x / y（Blender，y = 游戏 -z）/ z / xy（水平最大边）
    ax, metres = cfg['scale']
    ext = {'x': hi[0] - lo[0], 'y': hi[1] - lo[1], 'z': hi[2] - lo[2], 'xy': max(hi[0] - lo[0], hi[1] - lo[1])}[ax]
    s = metres / ext
    ob.data.transform(mathutils.Matrix.Scale(s, 4)); ob.data.update(); lo, hi = bbox(ob)
    # 拱门加宽洞：widen = [内半宽（米，按缩放后的尺寸，相对 x 中心）, 往外挪几米]：|x| > 内半宽的点（两条腿）整体往外挪，
    #   中间的点（拱桥）线性拉宽。腿不变胖；挪完再按 scale 重新缩放到目标宽度
    if 'widen' in cfg:
        xin, dx = cfg['widen']; xc = (lo[0] + hi[0]) / 2
        for v in ob.data.vertices:
            x = v.co.x - xc
            v.co.x = xc + (x + math.copysign(dx, x) if abs(x) > xin else x * (xin + dx) / xin)
        ob.data.update(); lo, hi = bbox(ob)
        ext = {'x': hi[0] - lo[0], 'y': hi[1] - lo[1], 'z': hi[2] - lo[2], 'xy': max(hi[0] - lo[0], hi[1] - lo[1])}[ax]
        ob.data.transform(mathutils.Matrix.Scale(metres / ext, 4)); ob.data.update(); lo, hi = bbox(ob)
    # 竖直缩放（骸骨压矮一点）
    if 'sz' in cfg:
        ob.data.transform(mathutils.Matrix.Diagonal((1, 1, cfg['sz'], 1))); ob.data.update(); lo, hi = bbox(ob)
    # 拉高腿：stretch = [分界高度（米，从最低点算）, 加高几米]：分界以下线性拉高，以上整体抬高（拱桥不变厚）
    if 'stretch' in cfg:
        zs, dz = cfg['stretch']
        for v in ob.data.vertices:
            z = v.co.z - lo[2]
            v.co.z = lo[2] + (z * (zs + dz) / zs if z < zs else z + dz)
        ob.data.update(); lo, hi = bbox(ob)
    H = hi[2] - lo[2]
    # 竖直：sea（海平面在原模高度的比例）→ z = 0；切在 -below 米。wreck：最低点 + bed 米 → z = 0（海底）
    if KIND in ('arch', 'bones'):
        z0 = lo[2] + H * cfg['sea']; cutz = -kvf(cfg, 'below', 2.0)
    elif KIND == 'wreck':
        z0 = lo[2] + kvf(cfg, 'bed', 1.0); cutz = -kvf(cfg, 'below', 1.0)
    else:
        z0 = None; cutz = None
    if z0 is not None:
        ob.data.transform(mathutils.Matrix.Translation((0, 0, -z0))); ob.data.update()
    # Tripo 的底面常是开口的：最低点往上 fillz 米内、整圈都在这段高度里的开口边界补面（草片 / 根须的开口边不动）
    if KIND != 'skyisle':
        bm = bmesh.new(); bm.from_mesh(ob.data)
        zmin = min(v.co.z for v in bm.verts); fz = zmin + kvf(cfg, 'fillz', 4.0)
        bnd = [e for e in bm.edges if e.is_boundary and all(v.co.z < fz for v in e.verts)]
        if bnd:
            uvl = bm.loops.layers.uv.active
            # 补面的 UV：每个顶点沿用它在原来相邻面上的 UV（颜色接着边上的，不会冒出别处的颜色）
            vuv = {v: next(iter(l[uvl].uv.copy() for l in v.link_loops), None) for e in bnd for v in e.verts}
            fr = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
            nf = list(fr['faces'])
            if nf: nf = bmesh.ops.triangulate(bm, faces=nf)['faces']
            for f in nf:
                for l in f.loops:
                    if vuv.get(l.vert) is not None: l[uvl].uv = vuv[l.vert]
        left = sum(1 for e in bm.edges if e.is_boundary and all(v.co.z < fz for v in e.verts))
        print('BOTTOM fill: open edges', len(bnd), '->', left)
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
    # 底部切平封口
    if cutz is not None:
        bm = bmesh.new(); bm.from_mesh(ob.data)
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        r = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, cutz), plane_no=(0, 0, 1), clear_inner=True)
        cut_edges = [e for e in r['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
        bnd = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z - cutz) < 1e-4 for v in e.verts)]
        nf0 = len(bm.faces)
        if bnd:
            fr = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
            newf = [f for f in fr['faces']]
            tr = bmesh.ops.triangulate(bm, faces=newf)
            fr = {'geom': tr['faces']}
            uvl = bm.loops.layers.uv.active
            # 盖子的 UV：取切口边上的平均（看不见的底面，颜色随便）
            us = [l[uvl].uv.copy() for e in bnd for l in e.link_loops]
            if us:
                mu = mathutils.Vector((sum(u.x for u in us) / len(us), sum(u.y for u in us) / len(us)))
                for f in fr['geom']:
                    if isinstance(f, bmesh.types.BMFace):
                        for l in f.loops: l[uvl].uv = mu
        left = sum(1 for e in bm.edges if e.is_boundary and all(abs(v.co.z - cutz) < 1e-4 for v in e.verts))
        print('CAP open edges left', left)
        bm.to_mesh(ob.data); bm.free(); ob.data.update()
        print('CUT at', round(cutz, 2), 'boundary edges', len(bnd))
    # 去掉碎片（面积 < minpart × 总面积的连通块）
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    seen = set(); parts = []
    for f in bm.faces:
        if f.index in seen: continue
        stack = [f]; comp = []; seen.add(f.index)
        while stack:
            g = stack.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); stack.append(h)
        parts.append(comp)
    tot = sum(f.calc_area() for f in bm.faces)
    kill = []
    for comp in parts:
        a = sum(f.calc_area() for f in comp)
        if a < tot * kvf(cfg, 'minpart', .002): kill += comp
        elif 'killhigh' in cfg and a < tot * cfg['killhigh'][0] and min(v.co.z for f in comp for v in f.verts) > cfg['killhigh'][1]: kill += comp   # 半空中的小碎块
    if kill: bmesh.ops.delete(bm, geom=kill, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(ob.data); bm.free(); ob.data.update()
    print('PARTS', len(parts), 'killed faces', len(kill))
    # 减面
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    t0 = tri_count(ob)
    if t0 > cfg['tris']:
        md = ob.modifiers.new('dec', 'DECIMATE'); md.decimate_type = 'COLLAPSE'; md.ratio = cfg['tris'] / t0; md.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=md.name)
    md = ob.modifiers.new('tri', 'TRIANGULATE'); bpy.ops.object.modifier_apply(modifier=md.name)
    print('TRIS', t0, '->', tri_count(ob))
    # 水平居中 / 质心
    lo, hi = bbox(ob)
    V = np.array([v.co[:] for v in ob.data.vertices])
    if KIND == 'skyisle':
        F = np.array([p.vertices[:] for p in ob.data.polygons])
        A, B, C = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
        vol = np.einsum('ij,ij->i', A, np.cross(B, C)) / 6
        cm = ((A + B + C) / 4 * vol[:, None]).sum(0) / vol.sum()
        print('VOLUME', round(float(vol.sum()), 1), 'centroid', np.round(cm, 2))
        off = cm
    elif KIND == 'wreck':
        low = V[V[:, 2] < lo[2] + 2.5]
        off = np.array([(low[:, 0].min() + low[:, 0].max()) / 2, (low[:, 1].min() + low[:, 1].max()) / 2, 0])
    else:
        off = np.array([(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0])
    off = off + np.array(kvf(cfg, 'shift', [0, 0, 0]))
    ob.data.transform(mathutils.Matrix.Translation(tuple(-off))); ob.data.update()
    lo, hi = bbox(ob)
    print('BOX blender', np.round(lo, 2), np.round(hi, 2), 'size', np.round(hi - lo, 2))
    # 贴图：只留底色
    mat, bsdf, tn = base_image(ob)
    if tn:
        img = tn.image; tex = kvf(cfg, 'tex', 1024)
        if img.size[0] > tex: img.scale(tex, tex)
        for inp in bsdf.inputs:
            if inp.name != 'Base Color':
                for l in list(inp.links): mat.node_tree.links.remove(l)
        for n in list(mat.node_tree.nodes):
            if n.type == 'TEX_IMAGE' and n != tn: mat.node_tree.nodes.remove(n)
        bsdf.inputs['Metallic'].default_value = 0; bsdf.inputs['Roughness'].default_value = 1
        img.name = name
    mat.name = name
    while len(ob.data.materials) > 1: ob.data.materials.pop(index=1)
    for p in ob.data.polygons: p.material_index = 0

    # ---- 碰撞
    dg = bpy.context.evaluated_depsgraph_get(); bvh = BVHTree.FromObject(ob, dg)
    def inside(pg):          # 游戏坐标的点在不在模型里（最近面的法线朝向）
        p = mathutils.Vector((pg[0], -pg[2], pg[1]))
        loc, nrm, i, d = bvh.find_nearest(p)
        return loc is not None and (p - loc).dot(nrm) < 0
    Vb = np.array([v.co[:] for v in ob.data.vertices]); F = np.array([p.vertices[:] for p in ob.data.polygons])
    G = np.stack([Vb[:, 0], Vb[:, 2], -Vb[:, 1]], 1)       # 游戏坐标
    A, B, C = G[F[:, 0]], G[F[:, 1]], G[F[:, 2]]
    area = np.linalg.norm(np.cross(B - A, C - A), axis=1) / 2
    rng = np.random.default_rng(1)
    idx = rng.choice(len(F), 30000, p=area / area.sum())
    u = rng.random((30000, 2)); m_ = u.sum(1) > 1; u[m_] = 1 - u[m_]
    P = A[idx] + u[:, :1] * (B[idx] - A[idx]) + u[:, 1:] * (C[idx] - A[idx])
    if cutz is not None: P = P[P[:, 1] > cutz + .3]           # 底面的盖子不算
    info = {'key': name, 'tris': tri_count(ob)}
    glo = np.array([lo[0], lo[2], -hi[1]]); ghi = np.array([hi[0], hi[2], -lo[1]])
    info['size'] = {'min': [round(float(x), 2) for x in glo], 'max': [round(float(x), 2) for x in ghi]}
    keep = None
    if KIND == 'arch':
        # 洞：沿 Z 看穿的格子（Blender 沿 y 打射线），从海平面起每列往上空着的高度，取包含中心的最大矩形
        st = .5; xs = np.arange(lo[0], hi[0], st); zs = np.arange(.25, hi[2], st)
        free = np.zeros((len(xs), len(zs)), bool)
        for i, x in enumerate(xs):
            for j, z in enumerate(zs):
                h = bvh.ray_cast(mathutils.Vector((x, lo[1] - 5, z)), mathutils.Vector((0, 1, 0)))
                free[i, j] = h[0] is None
        hcol = np.array([np.argmin(free[i]) if not free[i].all() else 0 for i in range(len(xs))]) * st
        ic = int(np.argmin(np.abs(xs - kvf(cfg, 'hole_x', 0))))
        best = (0, ic, ic, 0)
        for i0 in range(ic, -1, -1):
            if hcol[i0] <= 0: break
            for i1 in range(ic, len(xs)):
                if hcol[i1] <= 0: break
                hh = hcol[i0:i1 + 1].min(); a = (i1 - i0 + 1) * st * hh
                if a > best[0]: best = (a, i0, i1, hh)
        _, i0, i1, hh = best
        x0, x1 = xs[i0] - st / 2, xs[i1] + st / 2
        # 洞的深度：中线上有石头的 y 范围
        # 洞的深度（沿 Z）：洞顶上面那层石头（拱桥底面）前后两面的 y
        ys = []
        for x in np.linspace(x0 + 1, x1 - 1, 9):
            for z in (hh + 1.5, hh + 4):
                h0 = bvh.ray_cast(mathutils.Vector((x, lo[1] - 5, z)), mathutils.Vector((0, 1, 0)))
                h1 = bvh.ray_cast(mathutils.Vector((x, hi[1] + 5, z)), mathutils.Vector((0, -1, 0)))
                if h0[0] is not None: ys.append(h0[0].y)
                if h1[0] is not None: ys.append(h1[0].y)
        yd0, yd1 = (min(ys), max(ys)) if ys else (lo[1], hi[1])
        info['opening'] = {'c': [round(float((x0 + x1) / 2), 2), round(float(hh / 2), 2), round(float(-(yd0 + yd1) / 2), 2)],
                           'hw': round(float((x1 - x0) / 2), 2), 'hh': round(float(hh / 2), 2), 'hd': round(float((yd1 - yd0) / 2), 2),
                           'peak': round(float(hcol[ic]), 2)}
        print('OPENING', info['opening'], 'centre column clearance', hcol[ic])
        keep = (np.array([x0 + .5, -1e3, -1e3]), np.array([x1 - .5, hh - .5, 1e3]))
    # 体素：包围盒外扩 12 米（胶囊伸出去也要算空气），步长让总数约 30 万
    g0 = glo - 12; g1 = ghi + 12; st = max(.6, float(np.prod(g1 - g0) / kvf(cfg, 'vox', 300000)) ** (1 / 3))
    axes_ = [np.arange(g0[i] + st / 2, g1[i], st) for i in range(3)]
    VX = np.stack(np.meshgrid(*axes_, indexing='ij'), -1).reshape(-1, 3)
    # 里 / 外：沿三个轴整列打射线，记下所有交点；一个体素在三个轴的正反六个方向上 encl 米内都有表面 = 在里面
    #   （Tripo 的网格常有重叠的壳、不封闭，奇偶数不可靠；这样算凹进去的小缝也算实心，对碰撞无所谓；
    #   拱门洞里往下没有表面 = 空；骸骨的胸腔里 encl 取小一点，肋骨之间的空当才不会被算成实心）
    shp = tuple(len(x) for x in axes_); votes = np.zeros(shp, np.int8); EN = kvf(cfg, 'encl', 1e9)
    def col_hits(o, d, L):
        hs = []; o = mathutils.Vector(o); d = mathutils.Vector(d); t = 0.0
        while True:
            h = bvh.ray_cast(o + d * t, d, L - t)
            if h[0] is None: break
            t += h[3] + 1e-3; hs.append(t)
        return np.array(hs)
    def gb(x, y, z): return (x, -z, y)          # 游戏 → Blender
    for ax_ in range(3):
        o1, o2 = [i for i in range(3) if i != ax_]
        for i in range(shp[o1]):
            for j in range(shp[o2]):
                start = np.zeros(3); start[o1] = axes_[o1][i]; start[o2] = axes_[o2][j]; start[ax_] = g0[ax_] - 1
                dg_ = np.zeros(3); dg_[ax_] = 1
                hs = np.sort(col_hits(gb(*start), gb(*dg_), float(g1[ax_] - g0[ax_] + 2)) + start[ax_])
                if len(hs) < 2: continue
                v = axes_[ax_]; k = np.searchsorted(hs, v)
                up = np.where(k < len(hs), hs[np.minimum(k, len(hs) - 1)] - v, 1e9)
                dn = np.where(k > 0, v - hs[np.maximum(k - 1, 0)], 1e9)
                sl = [0, 0, 0]; sl[o1] = i; sl[o2] = j; sl[ax_] = slice(None)
                votes[tuple(sl)] += ((up <= EN) & (dn <= EN)).astype(np.int8)
    ins = (votes >= 3).reshape(-1)
    Vin, Vout = VX[ins], VX[~ins]
    if cutz is not None: Vin = Vin[Vin[:, 1] > cutz]; Vout = Vout[Vout[:, 1] > cutz]     # 切口下面（海里 / 海底下）不算
    if 'fit_ymin' in cfg: Vin = Vin[Vin[:, 1] > cfg['fit_ymin']]; Vout = Vout[Vout[:, 1] > cfg['fit_ymin']]
    if KIND == 'arch':      # 洞的深度（沿 Z）：洞两侧 12 米内的实心体素的 z 范围（1 / 99 分位）
        o_ = info['opening']; m = np.abs(Vin[:, 0] - o_['c'][0]) < o_['hw'] + 12
        z0_, z1_ = np.percentile(Vin[m, 2], 1), np.percentile(Vin[m, 2], 99)
        o_['hd'] = round(float((z1_ - z0_) / 2), 2); o_['c'][2] = round(float((z0_ + z1_) / 2), 2)
        print('OPENING depth', o_)
    np.save(os.path.join(chk, name + '_vin.npy'), Vin.astype(np.float32))
    print('VOXELS step', round(st, 3), 'inside', len(Vin), 'outside', len(Vout))
    caps = fit_capsules(Vin, Vout, cfg['caps'], keepout=keep, iters=kvf(cfg, 'iters', 6), lam=kvf(cfg, 'lam', 1.0), P=P, joint=kvf(cfg, 'joint', True))
    cov1, cov3, cin, empty = cap_metrics(P, Vin, Vout, caps)
    print(f'CAPS {len(caps)}  surface within 1 m {cov1:.1%}, within 3 m {cov3:.1%}, solid covered {cin:.1%}, capsule volume that is air {empty:.1%}')
    for c in caps: print('  CAP', c['name'], np.round(c['a'], 1), np.round(c['b'], 1), round(c['r'], 1))
    info['capsules'] = [{'name': c['name'], 'a': [round(float(x), 2) for x in c['a']], 'b': [round(float(x), 2) for x in c['b']], 'r': round(c['r'], 2)} for c in caps]
    info['capsuleFit'] = {'surfaceWithin1m': round(cov1, 3), 'surfaceWithin3m': round(cov3, 3), 'solidCovered': round(cin, 3), 'capsuleAir': round(empty, 3)}

    # ---- 浮空岛：瀑布提亮成蓝白（Tripo 烤成了灰），瀑布下端加一团卡通水雾（几个低面数的球，贴图取瀑布最亮的一点；不参与碰撞）
    if kvf(cfg, 'mist', 0) and tn:
        img = tn.image; W_, H_ = img.size
        px = np.empty(W_ * H_ * 4, np.float32); img.pixels.foreach_get(px); px = px.reshape(H_, W_, 4)
        c = px[..., :3]; lum = c @ np.array([.3, .59, .11], np.float32); sat = c.max(-1) - c.min(-1)
        wmask = (lum > .42) & (c[..., 2] - c[..., 0] > .015) & (sat < .3)
        tgt = lum[..., None] * np.array([.8, .93, 1.1], np.float32) + np.array([.1, .12, .14], np.float32)
        c[wmask] = np.clip(c[wmask] * .3 + tgt[wmask] * .7, 0, 1); px[..., :3] = c
        img.pixels.foreach_set(px.reshape(-1)); img.update()
        # 瀑布的顶点：UV 落在 wmask 里的 loop
        uvd = ob.data.uv_layers.active.data; wv = []
        for poly in ob.data.polygons:
            for li in poly.loop_indices:
                u, v = uvd[li].uv
                if wmask[min(H_ - 1, int(v % 1 * H_)), min(W_ - 1, int(u % 1 * W_))]: wv.append(ob.data.vertices[ob.data.loops[li].vertex_index].co.copy())
        print('WATERFALL texels', int(wmask.sum()), 'verts', len(wv))
        if len(wv) > 20:
            wv.sort(key=lambda q: q.z); low = wv[:max(8, len(wv) // 12)]
            pc = sum(low, mathutils.Vector()) / len(low)
            iy, ix = np.unravel_index(np.argmax(np.where(wmask, lum, -1)), lum.shape); muv = ((ix + .5) / W_, (iy + .5) / H_)
            bmm = bmesh.new()
            R = kvf(cfg, 'mist', 6.0)
            for (dx, dy, dz, rr) in ((0, 0, 0, 1), (.9, .3, -.25, .75), (-.85, -.2, -.2, .7), (.15, -.8, .3, .65), (-.2, .7, -.45, .6)):
                g = bmesh.ops.create_icosphere(bmm, subdivisions=2, radius=R * rr)
                for v in g['verts']: v.co += mathutils.Vector((pc.x + dx * R, pc.y + dy * R, pc.z - R * .35 + dz * R))
            uvl = bmm.loops.layers.uv.new('UVMap')
            for f in bmm.faces:
                f.smooth = True
                for l in f.loops: l[uvl].uv = muv
            mm = bpy.data.meshes.new('mist'); bmm.to_mesh(mm); bmm.free()
            mo = bpy.data.objects.new('mist', mm); bpy.context.scene.collection.objects.link(mo); mm.materials.append(mat)
            bpy.ops.object.select_all(action='DESELECT'); mo.select_set(True); ob.select_set(True); bpy.context.view_layer.objects.active = ob
            bpy.ops.object.join(); ob = bpy.context.view_layer.objects.active
            print('MIST at', np.round(pc[:], 1), 'tris now', tri_count(ob))
            info['tris'] = tri_count(ob)
            lo, hi = bbox(ob)
            glo = np.array([lo[0], lo[2], -hi[1]]); ghi = np.array([hi[0], hi[2], -lo[1]])
            info['size'] = {'min': [round(float(x), 2) for x in glo], 'max': [round(float(x), 2) for x in ghi]}
    # ---- 检查图：模型、模型 + 胶囊
    sc, cam = setup_render(900)
    if KIND in ('arch', 'bones'): plane(0, 600, (.2, .5, .65, 1), 'sea')
    elif KIND == 'wreck': plane(0, 400, (.85, .78, .55, 1), 'bed')
    view_set(sc, cam, chk, name, lo, hi)
    cobs = []
    cm_ = bpy.data.materials.new('cap'); cm_.diffuse_color = (1, .1, .3, 1)
    for c in caps:
        a = mathutils.Vector((c['a'][0], -c['a'][2], c['a'][1])); b = mathutils.Vector((c['b'][0], -c['b'][2], c['b'][1]))
        bmc = bmesh.new()
        bmesh.ops.create_uvsphere(bmc, u_segments=20, v_segments=12, radius=c['r'])
        L = (b - a).length
        for v in bmc.verts:
            if v.co.z > 0: v.co.z += L / 2
            else: v.co.z -= L / 2
        me = bpy.data.meshes.new('cap'); bmc.to_mesh(me); bmc.free()
        co = bpy.data.objects.new('cap', me); sc.collection.objects.link(co); me.materials.append(cm_)
        co.location = (a + b) / 2
        co.rotation_euler = ((b - a) if L > 1e-6 else mathutils.Vector((0, 0, 1))).to_track_quat('Z', 'Y').to_euler()
        cobs.append(co)
    if KIND == 'arch':
        o_ = info['opening']; bpy.ops.mesh.primitive_cube_add(size=1)
        bx = bpy.context.active_object; bx.scale = (o_['hw'] * 2, o_['hd'] * 2 + 20, o_['hh'] * 2); bx.location = (o_['c'][0], -o_['c'][2], o_['c'][1])
        bm2 = bpy.data.materials.new('hole'); bm2.diffuse_color = (.1, 1, .3, 1); bx.data.materials.append(bm2); cobs.append(bx)
    view_set(sc, cam, chk, name + '_caps', lo, hi)
    for co in cobs: bpy.data.objects.remove(co, do_unlink=True)

    # ---- 导出
    for o in list(bpy.context.scene.objects):
        if o != ob: bpy.data.objects.remove(o, do_unlink=True)
    lo, hi = bbox(ob)
    QS = float(math.ceil(max(abs(lo).max(), abs(hi).max()) * 1.01))
    ob.data.transform(mathutils.Matrix.Scale(1 / QS, 4)); ob.data.update(); ob.scale = (QS, QS, QS)
    info['nodeScale'] = QS
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=out_glb, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_image_format='WEBP', export_image_quality=int(kvf(cfg, 'q', 80)), export_texcoords=True, export_normals=False,
                              export_tangents=False, export_materials='EXPORT', export_animations=False, export_skins=False)
    with open(out_json, 'w', encoding='utf-8') as f: json.dump(info, f, indent=1)
    print('EXPORTED', out_glb, os.path.getsize(out_glb), 'bytes', 'QS', QS)
    sys.exit(0)


# ---------------------------------------------------------------- preview
def toon_material(mat, steps=(.0, .42, .72), shades=(.62, .84, 1.0)):
    """底色贴图 × 三阶卡通光（Diffuse → Shader to RGB → 阶梯色带），走 Emission：近似游戏里的 toon 着色。"""
    nt = mat.node_tree; N = nt.nodes; L = nt.links
    tex = next((n for n in N if n.type == 'TEX_IMAGE'), None)
    out = next(n for n in N if n.type == 'OUTPUT_MATERIAL')
    dif = N.new('ShaderNodeBsdfDiffuse'); s2r = N.new('ShaderNodeShaderToRGB'); ramp = N.new('ShaderNodeValToRGB')
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1
    em = N.new('ShaderNodeEmission')
    L.new(dif.outputs[0], s2r.inputs[0]); L.new(s2r.outputs['Color'], ramp.inputs[0])
    cr = ramp.color_ramp; cr.interpolation = 'CONSTANT'
    while len(cr.elements) < len(steps): cr.elements.new(.5)
    for e, p_, v in zip(cr.elements, steps, shades): e.position = p_; e.color = (v, v * .98, v * .97, 1)
    if tex: L.new(tex.outputs['Color'], mul.inputs[6])
    else: mul.inputs[6].default_value = (.8, .8, .8, 1)
    L.new(ramp.outputs['Color'], mul.inputs[7]); L.new(mul.outputs[2], em.inputs[0]); em.inputs['Strength'].default_value = 1.0
    L.new(em.outputs[0], out.inputs['Surface'])


if MODE == 'preview':
    src, out, kind = argv[1], argv[2], argv[3]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    sc = bpy.context.scene
    for o in meshes:
        # 游戏里按位置焊接后重算法线（平滑）：这里也焊上、平滑着色
        bpy.context.view_layer.objects.active = o; o.select_set(True)
        bm = bmesh.new(); bm.from_mesh(o.data); bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5); bm.to_mesh(o.data); bm.free()
        for p in o.data.polygons: p.use_smooth = True
        for m in o.data.materials: toon_material(m)
        # 描边：反向外扩的壳（和游戏一样是背面外扩）
        ol = bpy.data.materials.new('outline'); ol.use_nodes = True
        on = ol.node_tree.nodes; bs = next(n for n in on if n.type == 'BSDF_PRINCIPLED'); on.remove(bs)
        e = on.new('ShaderNodeEmission'); e.inputs[0].default_value = (.06, .045, .04, 1)
        ol.node_tree.links.new(e.outputs[0], next(n for n in on if n.type == 'OUTPUT_MATERIAL').inputs['Surface'])
        ol.use_backface_culling = True
        o.data.materials.append(ol)
        sd = o.modifiers.new('ol', 'SOLIDIFY'); sd.use_flip_normals = True; sd.offset = 1
        sd.material_offset = len(o.data.materials) - 1; sd.use_rim = False
    pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = np.array([min(p[i] for p in pts) for i in range(3)]); hi = np.array([max(p[i] for p in pts) for i in range(3)])
    S = float(max(hi - lo))
    for o in meshes: o.modifiers['ol'].thickness = S * .0035 / o.scale[0]
    for eng in ('BLENDER_EEVEE', 'BLENDER_EEVEE_NEXT'):
        try: sc.render.engine = eng; break
        except Exception: pass
    sc.render.resolution_x = sc.render.resolution_y = 1000
    sc.view_settings.view_transform = 'Standard'
    bg = {'wreck': (.16, .46, .58), 'skyisle': (.55, .78, .96)}.get(kind, (.6, .82, .97))
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (*bg, 1); sc.world = w
    sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.5; so = bpy.data.objects.new('sun', sun); sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(40), 0, math.radians(35))
    def flat_plane(z, size, col, name):
        bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, z)); pl = bpy.context.active_object
        m = bpy.data.materials.new(name); m.use_nodes = True; nn = m.node_tree.nodes; nn.remove(next(n for n in nn if n.type == 'BSDF_PRINCIPLED'))
        e = nn.new('ShaderNodeEmission'); e.inputs[0].default_value = (*col, 1)
        m.node_tree.links.new(e.outputs[0], next(n for n in nn if n.type == 'OUTPUT_MATERIAL').inputs['Surface']); pl.data.materials.append(m)
    if kind in ('arch', 'bones'): flat_plane(0, S * 30, (.1, .42, .6), 'sea')
    elif kind == 'wreck': flat_plane(-.3, S * 30, (.55, .55, .45), 'bed')
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cz = (lo[2] + hi[2]) / 2 if kind in ('skyisle', 'wreck') else max(0.0, (lo[2] + hi[2]) / 2) * .8
    c = mathutils.Vector(((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, cz))
    # 镜头：正面（+Z = Blender -Y）偏右；拱门更正一点（看得穿洞），骸骨低一点（显得高大）
    ang = {'arch': (.42, -.9, .22), 'bones': (.6, -.78, .36), 'skyisle': (.62, -.74, .3), 'wreck': (.7, -.66, .36)}[kind]
    D = S * {'bones': 1.55, 'wreck': 1.7}.get(kind, 1.9)
    shoot(sc, cam, out, c + mathutils.Vector(ang) * D, c, lens=50)
    sys.exit(0)
