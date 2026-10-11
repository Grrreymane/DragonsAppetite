# 幼火龙 / 少年火龙绑定脚本共用的小工具（在 Blender 里 import：sys.path.insert(0, 本目录)）
#   weld            按位置焊接顶点（Tripo 网格沿每个 UV 岛都是断开的；焊上以后才能减面、补洞、算平滑法线；导出时 glTF 会按 UV 重新拆开）
#   fill_rings      补大开口（边界环 ≥ N 条边），新面的 UV 取相邻面同一顶点的 UV
#   decimate_group  只在某个顶点组里减面（Decimate 塌陷 + 顶点组保护，其余区域加很大的代价）
#   lbs_reshape     按骨骼权重改静止形状（每根骨一个变换，顶点 = 各骨变换结果按权重混合，和蒙皮一样平滑）
#   seg_scale / uni_scale   上面用的两种变换：沿骨头方向缩放（关节角、横向尺寸不变）/ 绕一点等比缩放
#   smooth_weights  某几根骨的权重做拉普拉斯平滑（去膝盖折痕），之后每个顶点重新归一
#   smooth_normals  清掉自定义法线，全部平滑着色（焊接后 = 每个位置一个法线，描边壳不会裂）
#   bake_quantize   导出后调用系统 python 跑 glb_quantize.py
#   rebuild_club / club_texture   v3：尾锤删掉重做成竖菱形晶块 + 在图集空地上画玄武岩 / 熔岩裂纹贴图（见文件末尾；画法在 club_paint.py）
#   glb_tris        导出后 glb 里实际的三角形数（清单用）
import bpy, bmesh, os, subprocess, json, math
import club_paint as CP
from mathutils import Vector
from mathutils.geometry import intersect_point_line

HERE = os.path.dirname(os.path.abspath(__file__))


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def weld(obj, dist=1e-6, min_dot=0.3):
    """按位置焊接，但法线相反的不焊（Tripo 的薄翅膜有上下两层重合的顶点；焊到一起后平滑法线≈0，描边壳乱飞，
    翅根露出大块黑斑）。法线取焊接前每个顶点各角法线的平均（Tripo 自带的自定义法线）"""
    me = obj.data; n0 = len(me.vertices)
    vn = [Vector() for _ in me.vertices]
    for l, c in zip(me.loops, me.corner_normals): vn[l.vertex_index] += Vector(c.vector)
    for v in vn:
        if v.length > 1e-9: v.normalize()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    groups = {}
    for v in bm.verts: groups.setdefault(tuple(round(c / dist) for c in v.co), []).append(v)
    target = {}; kept_apart = 0
    for vs in groups.values():
        reps = []
        for v in vs:
            r = next((r for r in reps if vn[v.index].dot(vn[r.index]) > min_dot), None)
            if r is None: reps.append(v)
            else: target[v] = r
        kept_apart += len(reps) - 1
    bmesh.ops.weld_verts(bm, targetmap=target)
    bm.to_mesh(me); bm.free(); me.update()
    return n0, len(me.vertices), kept_apart


def boundary_loops(bm):
    # 按边序号走（集合的遍历顺序每次运行不同，补洞的起点 / 三角化就会变，导出的 glb 不能逐字节复现）
    bm.edges.index_update()
    order = sorted((e for e in bm.edges if e.is_boundary), key=lambda e: e.index)
    edges = set(order); loops = []
    for e0 in order:
        if e0 not in edges: continue
        edges.discard(e0); comp = [e0]; st = [e0]
        while st:
            e = st.pop()
            for v in e.verts:
                for e2 in sorted(v.link_edges, key=lambda x: x.index):
                    if e2 in edges: edges.discard(e2); comp.append(e2); st.append(e2)
        loops.append(comp)
    return loops


def fill_rings(obj, min_edges=30, max_gap=0.02):
    """补大开口：边界链 ≥ min_edges 条边，闭合的或两端相距 < max_gap 的（Tripo 有的环在一条三面共用的边上断开），
    按顺序建一个 n 边面（绕向和相邻面一致）再三角化；新面的 UV 取相邻旧面同一顶点的 UV"""
    me = obj.data; bm = bmesh.new(); bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    made = []; sizes = []
    for comp in boundary_loops(bm):
        sizes.append(len(comp))
        if len(comp) < min_edges: continue
        es = set(comp); deg = {}
        for e in comp:
            for v in e.verts: deg[v] = deg.get(v, 0) + 1
        if any(d > 2 for d in deg.values()): continue
        ends = [v for v, d in deg.items() if d == 1]
        if ends and (len(ends) != 2 or (ends[0].co - ends[1].co).length > max_gap): continue
        start = ends[0] if ends else comp[0].verts[0]
        order = [start]; prev_e = None
        while True:
            v = order[-1]
            nxt = [e for e in v.link_edges if e in es and e is not prev_e]
            if not nxt: break
            prev_e = nxt[0]; w = prev_e.other_vert(v)
            if w is start: break
            order.append(w)
        # 绕向：相邻旧面里这条边是 a→b，新面要 b→a
        e0 = bm.edges.get((order[0], order[1])); l0 = e0.link_loops[0]
        if l0.vert is order[0]: order.reverse()
        f = bm.faces.new(order)
        nb = l0.face; f.material_index = nb.material_index
        if uv is not None:
            for l in f.loops:
                src = next((l2 for l2 in l.vert.link_loops if l2.face is not f), None)
                if src is not None: l[uv].uv = src[uv].uv.copy()
        t = bmesh.ops.triangulate(bm, faces=[f], quad_method='BEAUTY', ngon_method='BEAUTY')
        c = sum((v.co for v in order), Vector()) / len(order)
        made.append((len(order), len(t['faces']), tuple(round(x, 3) for x in c)))
    bm.normal_update(); bm.to_mesh(me); bm.free(); me.update()
    return made, sizes


def decimate_group(obj, weight_fn, target_tris, protect=1000.0):
    """weight_fn(co) → 0..1（1 = 可以减）；减到 target_tris 以下"""
    vg = obj.vertex_groups.new(name='_decimate')
    for v in obj.data.vertices:
        w = weight_fn(v.co)
        if w > 0: vg.add([v.index], w, 'REPLACE')
    t0 = tris(obj)
    bpy.context.view_layer.objects.active = obj
    ratio = target_tris / t0
    for it in range(6):
        mod = obj.modifiers.new('dec', 'DECIMATE'); mod.decimate_type = 'COLLAPSE'; mod.ratio = ratio
        mod.vertex_group = vg.name; mod.vertex_group_factor = protect; mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
        if tris(obj) <= target_tris: break
        ratio = target_tris / tris(obj) - 0.002
    g = obj.vertex_groups.get('_decimate')
    if g: obj.vertex_groups.remove(g)
    return t0, tris(obj)


def seg_scale(H, T, Hn, k):
    """沿骨头 H→T 方向缩到 k 倍，起点移到 Hn；骨头前面的点只平移，后面的点平移到新末端"""
    H, T, Hn = Vector(H), Vector(T), Vector(Hn)
    d = T - H; L = d.length; d = d / L
    def f(p):
        r = p - H; a = r.dot(d); perp = r - d * a
        a2 = a if a < 0 else (k * a if a <= L else k * L + (a - L))
        return Hn + d * a2 + perp
    return f


def uni_scale(J, s):
    J = Vector(J)
    return lambda p: J + (p - J) * s


def lbs_reshape(obj, xforms):
    """xforms: {骨名: f(Vector)->Vector}；没列出的骨 = 不动"""
    gi = {g.index: g.name for g in obj.vertex_groups}
    me = obj.data; orig = [v.co.copy() for v in me.vertices]
    for v, p in zip(me.vertices, orig):
        acc = Vector(); tw = 0.0
        for g in v.groups:
            if g.weight <= 0: continue
            T = xforms.get(gi[g.group]); acc += (T(p) if T else p) * g.weight; tw += g.weight
        if tw > 0: v.co = acc / tw
    me.update()


def smooth_weights(obj, names, iters=2, mix=0.5):
    me = obj.data; gi = {g.name: g.index for g in obj.vertex_groups}
    idx = [gi[n] for n in names if n in gi]
    nb = [[] for _ in me.vertices]
    for e in me.edges:
        a, b = e.vertices; nb[a].append(b); nb[b].append(a)
    def W():
        w = [dict() for _ in me.vertices]
        for v in me.vertices:
            for g in v.groups: w[v.index][g.group] = g.weight
        return w
    for _ in range(iters):
        w = W(); touched = []
        for v in me.vertices:
            if not any(w[v.index].get(i, 0) > 0 for i in idx): continue
            new = {}
            for i in idx:
                avg = sum(w[n].get(i, 0) for n in nb[v.index]) / max(1, len(nb[v.index]))
                new[i] = (1 - mix) * w[v.index].get(i, 0) + mix * avg
            # 被平滑的那几根骨的总量保持不变，其余骨不动
            s0 = sum(w[v.index].get(i, 0) for i in idx); s1 = sum(new.values()) or 1
            for i in idx: new[i] *= s0 / s1
            touched.append((v.index, new))
        for vi, new in touched:
            for i, x in new.items():
                vg = obj.vertex_groups[i]
                if x > 1e-4: vg.add([vi], x, 'REPLACE')
                else:
                    try: vg.remove([vi])
                    except RuntimeError: pass
    return len(touched)


def limit_normalize(obj, maxinf=4, minw=0.01):
    """每个顶点最多 maxinf 根骨、去掉很小的权重，再归一"""
    for v in obj.data.vertices:
        gs = sorted(((g.weight, g.group) for g in v.groups), reverse=True)
        keep = [(w, i) for w, i in gs[:maxinf] if w >= minw] or gs[:1]
        tot = sum(w for w, _ in keep)
        for w, i in gs:
            vg = obj.vertex_groups[i]
            if (w, i) in keep: vg.add([v.index], w / tot, 'REPLACE')
            else: vg.remove([v.index])


def smooth_normals(obj):
    me = obj.data
    bpy.context.view_layer.objects.active = obj
    if me.has_custom_normals:
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for name in ('sharp_edge', 'sharp_face'):
        a = me.attributes.get(name)
        if a: me.attributes.remove(a)
    me.shade_smooth(); me.update()


def bake_quantize(glb):
    r = subprocess.run(['python', os.path.join(HERE, 'glb_quantize.py'), glb], capture_output=True, text=True)
    print(r.stdout.strip(), r.stderr.strip()[-500:])
    if r.returncode: raise RuntimeError('quantize failed')
    return os.path.getsize(glb)


def side_angle_deg(d):
    return math.degrees(math.atan2(d.z, d.x))


# ---------------- v3：尾锤重做成干净的菱形晶块 + 自己画的熔岩裂纹贴图 ----------------
# Tripo 的尾锤要么是横着的扁箭头（幼龙）要么是一颗黑亮的蛋（少年龙），贴图在图集里碎成很多小岛、几乎纯黑，
# 追尾镜头正对着它，读起来像屁股上一块黑斑。做法：
#   rebuild_club：删掉尾锤的旧面，从尾杆末端那一圈（边界环）往后接一个「八面体」菱形：
#     尾杆末端环 → 最宽一圈（竖着的菱形截面，四个角对正上 / 正下 / 左右）→ 尾尖一个点；
#     新顶点的序号记在返回值里（权重全给尾锤骨，刚体），新面打上 '_club' 面属性，归一化的展开坐标存在 '_clubuv' UV 层；
#     v4：展开坐标和 3D 切面只差一个缩放（见函数里），返回值带切面尺寸 'geom'
#   club_texture：在图集里找一块没有别的面用的空地（栅格化所有非尾锤面的 UV），把尾锤的展开坐标放进去，
#     并在这块空地上画（club_paint.paint）：深的暖灰玄武岩（上切面亮、下切面明显暗，像切面）+ 每片 2~3 条折来折去带分叉的橙红熔岩裂纹
#     （v3 是金铜色 + 浅色棱边围成的框 + 又长又直的裂纹，镜像以后像字，复审 .cache/docs/v3 复审意见见 club_paint.py 文件头）

CLUB_ATTR, CLUB_UV = '_club', '_clubuv'


def _ordered_loop(edges):
    """边界边 → 按顺序的顶点环"""
    adj = {}
    for e in edges:
        a, b = e.verts; adj.setdefault(a, []).append(b); adj.setdefault(b, []).append(a)
    start = min(adj, key=lambda v: v.index)
    order = [start]; prev = None
    while True:
        nxt = [w for w in sorted(adj[order[-1]], key=lambda v: v.index) if w is not prev and (len(order) < 2 or w is not order[-2])]
        if not nxt: break
        w = nxt[0]
        if w is start: break
        prev = order[-1]; order.append(w)
        if len(order) > len(adj): raise RuntimeError('boundary loop is not simple')
    return order


def rebuild_club(obj, origin, axis, cut_a, mid_a, tip_a, half_up, half_side, vm=0.42, up_hint=(0, 0, 1), mirror=True):
    """origin/axis：尾锤轴（axis 指向尾尖）；a = (p - origin)·axis。删掉有顶点 a > cut_a 的面，
    最宽一圈放在 a = mid_a（半高 half_up、半宽 half_side 的菱形），尾尖在 a = tip_a。
    mirror：左右两半用同一块贴图（展开只要半圈，同样大的空地像素密一倍；菱形左右对称，看不出来）
    返回 (新顶点序号列表, 环上顶点数, 截面中心)"""
    me = obj.data
    O = Vector(origin); D = Vector(axis).normalized()
    U = Vector(up_hint); U = (U - D * U.dot(D)).normalized(); Sd = D.cross(U).normalized()
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    dele = [f for f in bm.faces if any((v.co - O).dot(D) > cut_a for v in f.verts)]
    n_del = len(dele)
    bmesh.ops.delete(bm, geom=dele, context='FACES_ONLY')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table()
    # 离切口最近的边界环 = 尾杆末端
    target = O + D * cut_a
    loops = boundary_loops(bm)
    def cen(c): vs = {v for e in c for v in e.verts}; return sum((v.co for v in vs), Vector()) / len(vs)
    ring_edges = min(loops, key=lambda c: (cen(c) - target).length)
    ring = _ordered_loop(ring_edges)
    C0 = sum((v.co for v in ring), Vector()) / len(ring)
    a0 = (C0 - O).dot(D)
    # 环上每个点的方向角（0 = 正上，往 Sd 方向增加），按环的顺序要单调增加
    def ang(p):
        r = p - C0; return math.atan2(r.dot(Sd), r.dot(U)) % (2 * math.pi)
    th = [ang(v.co) for v in ring]
    inc = sum(((th[(i + 1) % len(th)] - th[i] + math.pi) % (2 * math.pi) - math.pi) for i in range(len(th)))
    if inc < 0: ring.reverse()
    k0 = min(range(len(ring)), key=lambda i: min(ang(ring[i].co), 2 * math.pi - ang(ring[i].co)))   # 最靠近正上的点放第一个
    ring = ring[k0:] + ring[:k0]
    n = len(ring)
    # 角度按弧长均分，再把最靠近四个正方向的点吸到正方向上，中间的点在两个角之间均分（保证单调、菱形的角是尖的）
    L = [0.0]
    for i in range(1, n): L.append(L[-1] + (ring[i].co - ring[i - 1].co).length)
    tot = L[-1] + (ring[0].co - ring[-1].co).length
    t = [x / tot * 2 * math.pi for x in L]
    corner = {0: 0}
    for q in (1, 2, 3):
        cand = [i for i in range(1, n) if i > max(corner.values())]
        if not cand: break
        corner[q] = min(cand, key=lambda i: abs(t[i] - q * math.pi / 2))
    keys = sorted(corner.items(), key=lambda kv: kv[1]) + [(4, n)]
    for (qa, ia), (qb, ib) in zip(keys, keys[1:]):
        for i in range(ia, ib): t[i] = (qa + (qb - qa) * (i - ia) / (ib - ia)) * math.pi / 2
    def rhombus(a):
        c, s = math.cos(a), math.sin(a); return 1.0 / (abs(c) / half_up + abs(s) / half_side)
    Cm = C0 + D * (mid_a - a0)
    mid = [bm.verts.new(Cm + (U * math.cos(a) + Sd * math.sin(a)) * rhombus(a)) for a in t]
    tip = bm.verts.new(C0 + D * (tip_a - a0))
    lay = bm.faces.layers.int.get(CLUB_ATTR) or bm.faces.layers.int.new(CLUB_ATTR)
    uvl = bm.loops.layers.uv.get(CLUB_UV) or bm.loops.layers.uv.new(CLUB_UV)
    # v4 展开坐标：u 按菱形棱上的实际位置（每条棱上按长度等分；v3 按极角，棱中间的点会把切面剪切歪），
    # 尾尖在每个三角形里的 UV 放在它那片切面的「垂足」上（v3 放在每个小三角形的正中，左右两边三角形切法不同，贴图对不上）
    # → 每片后切面在展开图里是三角形 (0,vm)-(1,vm)-(垂足,1)，和 3D 里那片三角形只差一个缩放，左右镜像也一致
    def edge_t(a):
        a = a % (2 * math.pi); q = min(3, int(a // (math.pi / 2)))
        r = rhombus(a); sd, up = r * math.sin(a), r * math.cos(a)
        f = (sd / half_side, -up / half_up, -sd / half_side, up / half_up)[q]
        return (q + min(1.0, max(0.0, f))) * math.pi / 2
    te = [edge_t(a) for a in t]
    if mirror: uf = lambda x: x / math.pi if x <= math.pi + 1e-9 else (2 * math.pi - x) / math.pi
    else: uf = lambda x: x / (2 * math.pi)
    u = [uf(x) for x in te] + [0.0 if mirror else 1.0]
    fup = half_up ** 2 / (half_up ** 2 + half_side ** 2)     # 尾尖在上切面上的垂足（从顶角沿棱量）
    def apex_u(i):
        tj = te[i + 1] if i + 1 < n else 2 * math.pi
        q = min(3, int(((te[i] + tj) / 2) // (math.pi / 2)))
        return uf((q + (fup if q in (0, 2) else 1 - fup)) * math.pi / 2)
    # 绕向：尾杆那边的面里这条边是 a→b，新面要 b→a
    e0 = bm.edges.get((ring[0], ring[1])); l0 = e0.link_loops[0]
    flip = l0.vert is ring[0]
    newf = []
    for i in range(n):
        j = (i + 1) % n
        q = [(ring[i], (u[i], 0.0)), (ring[j], (u[i + 1], 0.0)), (mid[j], (u[i + 1], vm)), (mid[i], (u[i], vm))]
        tr = [(mid[i], (u[i], vm)), (mid[j], (u[i + 1], vm)), (tip, (apex_u(i), 1.0))]
        for poly in (q, tr):
            if flip: poly = poly[::-1]
            f = bm.faces.new([p[0] for p in poly]); f[lay] = 1
            for l, (_, uvv) in zip(f.loops, poly): l[uvl].uv = uvv
            newf.append(f)
    # 新面的材质跟尾杆一样
    mi = l0.face.material_index
    for f in newf: f.material_index = mi
    bm.verts.index_update()
    new_idx = [v.index for v in mid] + [tip.index]
    r0 = sum(((v.co - C0) - D * (v.co - C0).dot(D)).length for v in ring) / n    # 尾杆末端那圈的半径
    geom = CP.club_geom(half_up, half_side, mid_a, tip_a, a0, r0)
    bm.normal_update(); bm.to_mesh(me); bm.free(); me.update()
    main = next(i for i, l in enumerate(me.uv_layers) if l.name != CLUB_UV)
    me.uv_layers.active_index = main; me.uv_layers[main].active_render = True
    return {'deleted_faces': n_del, 'ring': n, 'new_verts': new_idx, 'center': tuple(round(c, 4) for c in Cm),
            'geom': {k: round(x, 5) for k, x in geom.items()}}


def _raster(mask, tris):
    """tris: (N,3,2) 像素坐标；在 mask（H,W bool）里涂实心三角形"""
    import numpy as np
    H, W = mask.shape
    for tri in tris:
        x0, y0 = np.floor(tri.min(0)).astype(int); x1, y1 = np.ceil(tri.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W - 1), min(y1, H - 1)
        if x1 < x0 or y1 < y0: continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        (ax, ay), (bx, by), (cx, cy) = tri
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            mask[int(np.clip(ay, 0, H - 1)), int(np.clip(ax, 0, W - 1))] = True; continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        l3 = 1 - l1 - l2
        e = 0.6 / max(1.0, abs(d)) ** .5     # 稍微放宽一点，细长三角形也能涂到
        mask[y0:y1 + 1, x0:x1 + 1] |= (l1 >= -e) & (l2 >= -e) & (l3 >= -e)


def club_texture(obj, img, geom, res=512, margin=3, seed=7, palette=None, vm=0.42, out_res=1024, mirror=True, src=None, parts=None, flip=1):
    """把 '_club' 面的 '_clubuv' 坐标放进图集里的空地，并在空地上画尾锤的贴图（画法见 club_paint.py）。
    geom = rebuild_club 返回的切面尺寸：空地的长宽比按它定（后切面在导出贴图里不拉伸）；
    parts：切面怎么分到几块空地里，例如 [[3, 0], [1, 2]] = 两块：第一块（最大的空地）放左上、右上两片（追尾镜头在上方，上切面最显眼），
      第二块放下面两片；每块里的切面按列表顺序从左到右排。不给 = 一块，按展开顺序。图集里没有一整块够大的空地时，分两块像素能多一倍；
    margin = 空地四周留几格（res 格）不让别的面挨着，留边也涂底色（缩小 / mipmap 不渗色）。
    palette：{'upper','lower','glow','core'}（sRGB 0..1），不给就用 club_paint.PALETTE；flip = ±1 裂纹左右翻"""
    import numpy as np
    me = obj.data
    main = next(l for l in me.uv_layers if l.name != CLUB_UV)
    cuv = me.uv_layers[CLUB_UV]
    flag = me.attributes[CLUB_ATTR].data
    club_polys = [p for p in me.polygons if flag[p.index].value]
    NS = 2 if mirror else 4
    parts = parts or [list(range(NS))]
    def aspect_of(n): return n * geom['E'] * (1 - vm) / geom['Hb']   # 空地宽 / 高：后切面（追尾镜头正对着）在贴图里横竖一样密
    # 1) 非尾锤面的 UV 覆盖（res×res，v 朝上：行 0 = v 0）
    tris = []
    for p in me.polygons:
        if flag[p.index].value: continue
        pts = [main.data[li].uv for li in p.loop_indices]
        for i in range(1, len(pts) - 1): tris.append([pts[0], pts[i], pts[i + 1]])
    tris = np.array(tris, dtype=np.float64) * res
    cov = np.zeros((res, res), bool); _raster(cov, tris)
    pad = cov.copy()
    for dy in range(-margin, margin + 1):
        for dx in range(-margin, margin + 1):
            pad |= np.roll(np.roll(cov, dy, 0), dx, 1)
    free = ~pad
    free[:margin], free[-margin:], free[:, :margin], free[:, -margin:] = False, False, False, False
    def find_rect(aspect):
        I = np.pad(free.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
        best, best_q = None, -1
        for asp in (aspect, aspect * 0.75, aspect * 0.55, aspect * 1.3):   # 几种长宽比都试，取展开后像素最多的
            for h in range(3, res):
                w = max(3, int(round(h * asp)))
                if w >= res: break
                tot = I[h:, w:] - I[:-h, w:] - I[h:, :-w] + I[:-h, :-w]
                ok = np.argwhere(tot == h * w)
                if not len(ok): break
                q = min(w / aspect, h)
                if q > best_q: best_q, best = q, (int(ok[0][1]), int(ok[0][0]), w, h)
        if best is None: raise RuntimeError('no free space in the UV atlas for the club')
        return best
    rects = []
    for part in parts:
        bx, by, bw, bh = find_rect(aspect_of(len(part))); rects.append((bx, by, bw, bh))
        free[max(0, by - 2 * margin):by + bh + 2 * margin, max(0, bx - 2 * margin):bx + bw + 2 * margin] = False   # 两块之间也留边
    inset = 0.03
    where = {q: (k, part.index(q)) for k, part in enumerate(parts) for q in part}   # 切面 → (第几块, 块里第几列)
    for p in club_polys:
        uc = sum(cuv.data[li].uv[0] for li in p.loop_indices) / len(p.loop_indices)
        q = min(NS - 1, int(uc * NS))                           # 每个面整个在一片切面里（四个角都是顶点），按面中心分
        k, col_i = where[q]; n = len(parts[k])
        bx, by, bw, bh = rects[k]; u0, v0, uw, vh = bx / res, by / res, bw / res, bh / res
        for li in p.loop_indices:
            cu, cv = cuv.data[li].uv; lu = (col_i + (cu * NS - q)) / n
            main.data[li].uv = (u0 + uw * (inset + (1 - 2 * inset) * lu), v0 + vh * (inset + (1 - 2 * inset) * cv))
    # 2) 画（贴图分辨率）。先把「空地 + 四周留边」整块涂成暗面的颜色（不画浅色边框），再在空地里画切面和裂纹
    W, H = img.size
    px = np.empty(W * H * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(H, W, 4)
    Pal = dict(CP.PALETTE); Pal.update(palette or {})
    mpx = margin * W // res
    k_out = out_res / W                                  # 2048 → 导出 1024：1 个导出像素 = 1/k 个这里的像素
    info = []
    for (bx, by, bw, bh), part in zip(rects, parts):
        u0, v0, uw, vh = bx / res, by / res, bw / res, bh / res
        X0, Y0 = int(u0 * W), int(v0 * H); X1, Y1 = int((u0 + uw) * W), int((v0 + vh) * H)
        px[max(0, Y0 - mpx):Y1 + mpx, max(0, X0 - mpx):X1 + mpx, :3] = np.array(Pal['lower']) * 0.86
        px[max(0, Y0 - mpx):Y1 + mpx, max(0, X0 - mpx):X1 + mpx, 3] = 1.0
        xs, ys = np.meshgrid(np.arange(X0, X1) + .5, np.arange(Y0, Y1) + .5)
        lu = ((xs / W - u0) / uw - inset) / (1 - 2 * inset); cv = ((ys / H - v0) / vh - inset) / (1 - 2 * inset)
        n = len(part); xcol = np.clip(lu, 0, 0.99999) * n; ci = np.floor(xcol).astype(int)
        cu = (np.array(part)[ci] + (xcol - ci)) / NS            # 块里的列 → 展开坐标
        sx = uw * W * k_out * (1 - 2 * inset) / n * NS; sy = vh * H * k_out * (1 - 2 * inset)   # 展开坐标 1 = 导出贴图里多少像素
        col, st = CP.paint(cu, cv, sx, sy, geom, vm, mirror=mirror, seed=seed, palette=palette, src=src, flip=flip)
        px[Y0:Y1, X0:X1, :3] = col.astype(np.float32)
        info.append({'facets': part, 'rect_px': (X0, Y0, X1 - X0, Y1 - Y0), 'export_px': (round(sx * n / NS), round(sy)), **st})
    img.pixels.foreach_set(px.ravel()); img.update()
    # 临时层不导出
    me.uv_layers.remove(me.uv_layers[CLUB_UV])
    if CLUB_ATTR in me.attributes: me.attributes.remove(me.attributes[CLUB_ATTR])
    return {'parts': info, 'club_faces': len(club_polys)}


def glb_tris(path):
    """导出（量化）后的 glb 里实际的三角形数（清单的 tris 用它：glTF 导出会丢掉退化三角形，比 Blender 里少一两个）"""
    import struct
    with open(path, 'rb') as f:
        f.read(12); n, _ = struct.unpack('<II', f.read(8)); j = json.loads(f.read(n))
    t = 0
    for m in j['meshes']:
        for p in m['primitives']:
            if p.get('mode', 4) == 4: t += j['accessors'][p['indices']]['count'] // 3 if 'indices' in p else j['accessors'][p['attributes']['POSITION']]['count'] // 3
    return t
