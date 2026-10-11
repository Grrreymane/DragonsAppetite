# 海龙（无翼、长蛇身、四短腿、背鳍、扇形尾鳍）通用绑定脚本：骨骼 + 权重 + 动作 + 检查图 + 导出 glb + 写清单
# 幼龙 / 少年龙 / 成龙共用，只换 blender/rigs/<name>.json（骨骼坐标、分区阈值、动作参数）
#
#   blender -b --factory-startup -P rig_sea.py -- <rigs/xxx.json> [--no-export] [--no-check]
#
# 输出（<name> 取自 json）：
#   models/<name>_anim.glb   models/<name>.json（游戏清单）   blender/<name>_rig.blend
#   .cache/check/<name>/  rest_bones_*.png  weights_*.png  swim_top_4phase.png  ...  tex/（调色前后、面标签图）
#   .cache/art/<name>/tex/base_v2.png（调好的底色，每次重新生成）
# 步骤：导入 → 按 Tripo 自带法线摆正面朝向 → 焊接 → 补小洞（尾鳍补大洞）→ 邻居投票统一朝向 → 减面（之后再投票一次，不用 recalc）
#   → 绕序和角法线还相反的面改平面着色 → 骨架 → 权重 → 动作
#   → 面标签（鳍 / 头冠 / 耳鳍 / 腿 / 头 / 身体）+ blender/sea_tex.py 调色（系统 python）→ 导出 glb → blender/glb_pack.py 压缩 → 清单 → 检查图
# 调试：.cache/check/<name>/_face_labels.json = 每个面的标签（按面序号）
# 收腿检查另跑：blender -b blender/<name>_rig.blend -P blender/sea_tuck_check.py
# 坐标（Blender，import_rot_z 之后）：+X 朝前（头），+Y 朝左，+Z 朝上
import bpy, sys, os, math, json, subprocess
from mathutils import Vector, Quaternion, Matrix
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
CFG_PATH = os.path.abspath(argv[0])
NO_EXPORT = '--no-export' in argv
NO_CHECK = '--no-check' in argv
_me = os.path.abspath(sys.argv[sys.argv.index('-P') + 1]) if '-P' in sys.argv else os.path.abspath(__file__)
ROOT = os.path.dirname(os.path.dirname(_me))            # D:/Minigame/Dragon
cfg = json.load(open(CFG_PATH, encoding='utf-8'))
NAME = cfg['name']
SRC = os.path.join(ROOT, cfg['src'])
OUT_GLB = os.path.join(ROOT, 'models', f'{NAME}_anim.glb')
OUT_JSON = os.path.join(ROOT, 'models', f'{NAME}.json')
OUT_BLEND = os.path.join(ROOT, 'blender', f'{NAME}_rig.blend')
CHECK = os.path.join(ROOT, '.cache', 'check', NAME)
os.makedirs(CHECK, exist_ok=True)
TW = 2 * math.pi
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
AX = {'X': X, 'Y': Y, 'Z': Z}

# ---------- 导入：去掉父级空物体，转到头朝 +X，变换应用到顶点 ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = 24
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in sc.objects if o.type == 'MESH'][0]
mw = Matrix.Rotation(math.radians(cfg.get('import_rot_z_deg', 0)), 4, 'Z') @ mesh.matrix_world
mesh.parent = None; mesh.matrix_world = mw
for o in list(sc.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh.name = cfg.get('mesh_name', 'SeaDragon')
# Tripo 的网格在 UV 接缝处顶点是拆开的，靠自定义法线装平滑；变形后接缝处会露出硬边（肚皮上的方块），
# 描边壳沿法线外扩时也会在拆开处裂缝。焊接重合顶点 + 清掉自定义法线 + 全平滑，导出时只在 UV 接缝处再拆开。
import bmesh
def mesh_health(me):
    """洞边（只连 1 个面的边）、多于 2 个面共用的边、面数"""
    bm = bmesh.new(); bm.from_mesh(me)
    r = (sum(1 for e in bm.edges if len(e.link_faces) == 1), sum(1 for e in bm.edges if len(e.link_faces) > 2), len(bm.faces)); bm.free(); return r
def clean_mesh(me):
    """补小洞 + 统一法线朝向。描边壳沿法线往外扩、主角材质双面：洞和朝里的面会露出黑色描边壳（鳍上的黑碎片）"""
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges[:])
    loose = [v for v in bm.verts if not v.link_faces]
    if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
    filled = bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=cfg.get('fill_sides', 8))['faces']
    # 尾鳍上的大洞也补（少年龙尾鳍有个 19 条边的洞，透过去就是黑色描边壳）；嘴（头部的大洞）不补
    fan_edges = [e for e in bm.edges if len(e.link_faces) == 1 and all(v.co.x < cfg['weights']['fan_x'] for v in e.verts)]
    if fan_edges: filled += bmesh.ops.holes_fill(bm, edges=fan_edges, sides=cfg.get('fill_fan_sides', 32))['faces']
    if filled: filled = bmesh.ops.triangulate(bm, faces=filled)['faces']
    # 补出来的面没有像样的 UV（会横跨好几个 UV 岛，拉出一大片乱纹）：整块取旁边原有面在同一顶点处的 UV（单色补丁）
    uvl = bm.loops.layers.uv.active; fs = set(filled)
    for f in filled:
        src = next((l for v in f.verts for l in v.link_loops if l.face not in fs), None)
        if src is None: continue
        u = src[uvl].uv.copy()
        for l in f.loops: l[uvl].uv = u
    flipped, left = vote_orient(bm)
    bm.to_mesh(me); bm.free()
    print('CLEAN filled', len(filled), 'holes; vote-flipped', flipped, 'faces; faces still against their vertex normals', left)
def vote_orient(bm):
    """朝向：不用 recalc_face_normals（非流形的鳍根处它会翻错一片）。按邻居投票：面的朝向和它几个顶点的平滑法线（导出时就是这个）
    明显相反的翻过来。朝向反了的面，描边壳会被推到表面前面、正好露出背面 → 黑色碎片。返回（翻了几个面, 还剩几个面和顶点法线相反）"""
    flipped = 0
    for it in range(4):
        bm.normal_update()
        bad = [f for f in bm.faces if f.normal.dot(sum((v.normal for v in f.verts), Vector())) < -0.3 * max(sum((v.normal for v in f.verts), Vector()).length, 1e-9)]
        if not bad: break
        for f in bad: f.normal_flip()
        flipped += len(bad)
    bm.normal_update()
    left = sum(1 for f in bm.faces if f.normal.dot(sum((v.normal for v in f.verts), Vector())) < 0)
    return flipped, left
if cfg.get('weld', 2e-5):
    # 先按 Tripo 自带的顶点法线摆正面的朝向（文件里的法线是对的，个别三角形的绕序是反的）
    cn = mesh.data.corner_normals
    file_flip = [p.index for p in mesh.data.polygons if sum((cn[l].vector for l in p.loop_indices), Vector()).dot(p.normal) < 0]
    bm = bmesh.new(); bm.from_mesh(mesh.data); n0 = len(bm.verts); bm.faces.ensure_lookup_table()
    for i in file_flip: bm.faces[i].normal_flip()
    print('ORIENT by file normals: flipped', len(file_flip), 'faces')
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=cfg.get('weld', 2e-5)); bm.to_mesh(mesh.data); print('WELD', n0, '->', len(bm.verts)); bm.free()
    print('HEALTH before clean (hole edges, >2-face edges, faces)', mesh_health(mesh.data))
    clean_mesh(mesh.data)
    print('HEALTH after clean ', mesh_health(mesh.data))
    with bpy.context.temp_override(object=mesh, active_object=mesh):
        bpy.ops.mesh.customdata_custom_splitnormals_clear()
    for p in mesh.data.polygons: p.use_smooth = True
# 把某段（例如尾鳍）在左右方向压扁：x < x_full 的顶点 y × ky，x_full..x_none 之间渐变回 1（Tripo 有时把竖直尾鳍做成往两边岔开的几根）
for fl in cfg.get('flatten_y', []):
    xa, xb, ky = fl['x_full'], fl['x_none'], fl['ky']
    for v in mesh.data.vertices:
        if v.co.x < xb:
            t = 1.0 if v.co.x <= xa else (xb - v.co.x) / (xb - xa); t = t * t * (3 - 2 * t)
            v.co.y *= 1 - (1 - ky) * t
    print('FLATTEN', fl)
# 面数上限（Tripo 的 face-limit 会多出 1% 左右）：轻微塌陷减面，只动最不显眼的边
if cfg.get('max_tris'):
    t0 = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    if t0 > cfg['max_tris']:
        dm = mesh.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = cfg['max_tris'] / t0 * 0.996
        with bpy.context.temp_override(object=mesh, active_object=mesh):
            bpy.ops.object.modifier_apply(modifier=dm.name)
        print('DECIMATE', t0, '->', sum(len(p.vertices) - 2 for p in mesh.data.polygons))
        # 减面以后不能 recalc_face_normals（它会把鳍根附近整片翻错 → 幼龙尾鳍上的黑色大块，v3 review 第 1 条）；
        # 塌陷减面本身保留朝向，只把塌陷出来的个别反面按邻居投票再翻一遍
        bm = bmesh.new(); bm.from_mesh(mesh.data); fl, left = vote_orient(bm); bm.to_mesh(mesh.data); bm.free()
        print('HEALTH after decimate', mesh_health(mesh.data), 'vote-flipped', fl, 'still against vertex normals', left)

# 最后一道：绕序和自己的（导出用的）角法线还是相反的面（邻居投票也定不下来的：几片鳍挤在一起的地方），改成平面着色。
# 平面着色的面在导出时拆出自己的顶点、法线 = 面法线，描边壳就顺着它的绕序往外推，不会翻到鳍面前面变成黑三角（v3 review 第 3 条：
# 少年龙尾鳍上的黑三角就是这几个面）；它旁边的平滑面也不再被它拉偏。
def flat_bad_faces(me, passes=4):
    tot = 0
    for _ in range(passes):
        cn = me.corner_normals
        bad = [p for p in me.polygons if p.use_smooth and sum((cn[l].vector for l in p.loop_indices), Vector()).dot(p.normal) < 0]
        if not bad: break
        for p in bad: p.use_smooth = False
        tot += len(bad); me.update()
    cn = me.corner_normals
    left = sum(1 for p in me.polygons if sum((cn[l].vector for l in p.loop_indices), Vector()).dot(p.normal) < 0)
    return tot, left
if cfg.get('flat_bad', True):
    fb, fl_left = flat_bad_faces(mesh.data)
    print('FLAT faces against their corner normals:', fb, 'flat-shaded; still against', fl_left)

# ---------- 骨架 ----------
SPINE = [(n, tuple(h), tuple(t), p) for n, h, t, p in cfg['spine']]
BONES = list(SPINE)
SIDE_NAMES = [n for n, *_ in cfg['side']]
for sfx, sg in (('.L', 1), ('.R', -1)):
    for n, h, t, p in cfg['side']:
        BONES.append((n + sfx, (h[0], h[1] * sg, h[2]), (t[0], t[1] * sg, t[2]), p if p not in SIDE_NAMES else p + sfx))
arm_data = bpy.data.armatures.new('SeaRig'); arm = bpy.data.objects.new('SeaRig', arm_data)
sc.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
for n, h, t, p in BONES:
    b = arm_data.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t); b.roll = 0
for n, h, t, p in BONES:
    if p: arm_data.edit_bones[n].parent = arm_data.edit_bones[p]
for n in [n for n, *_ in SPINE]:      # 脊柱链首尾相接的骨头连起来（显示用，不影响导出）
    eb = arm_data.edit_bones[n]
    if eb.parent and (eb.parent.tail - eb.head).length < 1e-6: eb.use_connect = True
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 权重：到骨头线段的距离 + 按部位限定候选骨 ----------
W = cfg['weights']
CORE = [n for n, *_ in SPINE]; CORE_SET = set(CORE)
FRONT_LEG = ['farm1', 'farm2', 'fpaw', 'ftoe']; HIND_LEG = ['hleg1', 'hleg2', 'hfoot', 'htoe']
_par = {n: p for n, h, t, p in cfg['side']}
LEG_PARENT = {'front': _par['farm1'], 'hind': _par['hleg1']}
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
zsc = W.get('core_z_scale', 1.0)
def dist(p, n):
    a, b = segs[n]
    if n in CORE_SET:   # 躯干链：z 方向压扁，让背鳍、肚皮跟着正上/正下方的骨头走
        p = Vector((p.x, p.y, p.z * zsc)); a = Vector((a.x, a.y, a.z * zsc)); b = Vector((b.x, b.y, b.z * zsc))
    q, f = intersect_point_line(p, a, b); f = max(0.0, min(1.0, f))
    return (p - (a + (b - a) * f)).length
def candidates(p):
    ay = abs(p.y); s = '.L' if p.y >= 0 else '.R'
    if p.x > W['head_x2'] or (p.x > W['head_x'] and ay > W['ear_y']):
        return list(W['head_bones'])                                  # 头、耳鳍
    if p.x < W['fan_x']:
        return list(W['fan_bones'])                                   # 尾鳍
    part = 'hind' if W['hind_x'][0] < p.x < W['hind_x'][1] else 'front' if W['front_x'][0] < p.x < W['front_x'][1] else None
    legs = [l + s for l in (HIND_LEG if part == 'hind' else FRONT_LEG)] if part else []
    if part and p.z < W['leg_only_z']:
        return legs + [LEG_PARENT[part]]                              # 肚皮以下：只有同侧腿
    cand = list(CORE)
    if part and ay > W['leg_y'] and p.z < W['leg_z_max']:
        cand += legs                                                  # 腿根：躯干 + 同侧腿
    return cand
groups = {n: mesh.vertex_groups.new(name=n) for n, *_ in BONES}
dominant = []
for v in mesh.data.vertices:
    p = v.co
    ds = sorted((dist(p, n), n) for n in candidates(p))[:3]
    soft = all(n in CORE_SET for _, n in ds)
    ws = [((1.0 / (d * d + 1e-5)) if soft else (1.0 / (d * d + 1e-5) ** 2), n) for d, n in ds]
    tot = sum(w for w, _ in ws)
    ws = [(w / tot, n) for w, n in ws if w / tot > W.get('min_weight', 0.02)]
    tot = sum(w for w, _ in ws)
    for w, n in ws: groups[n].add([v.index], w / tot, 'REPLACE')
    dominant.append(max(ws)[1])
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
mesh.parent = arm
cnt = {}
for n in dominant: cnt[n] = cnt.get(n, 0) + 1
print('DOMINANT', sorted(cnt.items(), key=lambda kv: -kv[1]))

# ---------- 动作 ----------
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
pbs = arm.pose.bones
for pb in pbs: pb.rotation_mode = 'QUATERNION'
def q_arm(name, axis, ang):
    """绕骨架空间的轴转 ang（弧度），换算成骨头自己的局部旋转"""
    M = pbs[name].bone.matrix_local.to_3x3()
    return Quaternion((M.inverted() @ axis).normalized(), ang)
ROOT_BONE = [n for n, h, t, p in SPINE if p is None][0]
M_ROOT = pbs[ROOT_BONE].bone.matrix_local.to_3x3()
def axis_of(name, axis):
    if axis == 'B':      # 骨头自己的长轴（静止姿势）：绕它转 = 原地拧（让脚掌朝里），不改变骨头指向
        b = pbs[name].bone; return (b.tail_local - b.head_local).normalized()
    return AX[axis] if isinstance(axis, str) else Vector(axis)
FAN = cfg.get('fan_bone', 'fan')
FAN_V = max(range(3), key=lambda i: abs((pbs[FAN].bone.matrix_local.to_3x3() @ Vector([1 if k == i else 0 for k in range(3)])).z)) if FAN in pbs else None
def pose(spec, root_loc=(0, 0, 0), fan_scale=1.0):
    for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    for name, rots in spec.items():
        q = Quaternion()
        for axis, ang in rots: q = q_arm(name, axis_of(name, axis), ang) @ q
        pbs[name].rotation_quaternion = q
    pbs[ROOT_BONE].location = M_ROOT.inverted() @ Vector(root_loc)
    if FAN_V is not None: sv = [1.0, 1.0, 1.0]; sv[FAN_V] = fan_scale; pbs[FAN].scale = sv   # 尾鳍竖直方向撑开（Breach）
def key_all(f):
    for pb in pbs: pb.keyframe_insert('rotation_quaternion', frame=f)
    pbs[ROOT_BONE].keyframe_insert('location', frame=f)
    if FAN_V is not None: pbs[FAN].keyframe_insert('scale', frame=f)
def merge(*specs):
    out = {}
    for sp in specs:
        for k, v in sp.items(): out[k] = out.get(k, []) + list(v)
    return out

# 俯视平面里的正向运动学（只算绕 Z 的偏航），用来求根骨的偏航 + 横移，让脖子和头稳住
SP2 = {n: (Vector((h[0], h[1])), Vector((t[0], t[1])), p) for n, h, t, p in SPINE}
def rot2(v, a): c, s = math.cos(a), math.sin(a); return Vector((v.x * c - v.y * s, v.x * s + v.y * c))
def fk(rots, phi, ty):
    out = {}
    for n, h, t, p in SPINE:      # json 里父骨写在子骨前面
        hh = SP2[n][0]
        if p is None: wh = hh + Vector((0, ty)); wy = phi + rots.get(n, 0.0)
        else:
            ph, pyaw = out[p]; wh = ph + rot2(hh - SP2[p][0], pyaw); wy = pyaw + rots.get(n, 0.0)
        out[n] = (wh, wy)
    return out
def stabilize(rots):
    pts = cfg['stabilize_points']
    def res(phi, ty): o = fk(rots, phi, ty); return [o[n][0].y for n in pts]
    phi = ty = 0.0
    for _ in range(3):
        r0 = res(phi, ty); e = 1e-4
        rp = res(phi + e, ty); rt = res(phi, ty + e)
        J = [((a - b) / e, (c - b) / e) for a, c, b in zip(rp, rt, r0)]
        a11 = sum(j[0] * j[0] for j in J); a12 = sum(j[0] * j[1] for j in J); a22 = sum(j[1] * j[1] for j in J)
        b1 = -sum(j[0] * r for j, r in zip(J, r0)); b2 = -sum(j[1] * r for j, r in zip(J, r0))
        det = a11 * a22 - a12 * a12
        phi += (b1 * a22 - b2 * a12) / det; ty += (a11 * b2 - a12 * b1) / det
    return phi, ty
FRONT_SET = set(cfg['front_chain'])
def wave(t, A, k, pw):
    ch = cfg['wave_chain']; N = len(ch) - 1
    rots = {}
    for i, n in enumerate(ch):
        th = A * (i / N) ** pw * math.sin(TW * t - k * i)   # 从前往后传的弯曲波
        rots[n] = -th if n in FRONT_SET else th             # 前段骨链的父骨在后面，方向取反
    phi, ty = stabilize(rots)
    o = fk(rots, phi, ty)
    neck = cfg['front_chain'][-2]
    rots['head'] = rots.get('head', 0.0) - (1 - cfg.get('head_follow', 0.3)) * o[neck][1]   # 头只跟一点点
    rots['head'] -= cfg.get('head_counter', 0.0) * phi      # 头和腰反着微微转（腰往左摆时头稍往右），看着更活
    spec = {n: [('Z', a)] for n, a in rots.items()}
    spec[ROOT_BONE] = spec.get(ROOT_BONE, []) + [('Z', phi)]
    return spec, (0.0, ty, 0.0)
# 腿的姿势可以写成「瞄准角」：aim = 侧视平面里骨头朝向（度，0 朝前、-90 朝下、±180 朝后），
# 脚本按静止姿势的朝向和父骨已经转过的量算出绕 Y 的转角；roll = 绕骨头自己长轴拧（度，正 = 脚掌朝身体里面）；
# out = 绕前后轴往外撇（度，正 = 往外）。也可以直接写转角列表 [["X", 弧度], ["Y", 弧度], ...]（旧写法）
SIDE_REST = {n: (Vector(h), Vector(t)) for n, h, t, p in cfg['side']}
SIDE_PARENT = {n: p for n, h, t, p in cfg['side']}
def rest_ang(n):
    h, t = SIDE_REST[n]; return math.degrees(math.atan2(t.z - h.z, t.x - h.x))
# 第三种写法 dir：骨头最终朝向（骨架空间方向，左腿；x 朝前、y 朝左 = 身体外侧、z 朝上），脚本按父骨已经转过的量求最小转动，
# 再绕骨头自己的长轴拧 roll 度（正 = 脚掌 / 手掌朝身体里面）。腿往哪儿收一眼就能看出来，也能精确控制往外撇多少（y 分量）
def resolve_pose(base):
    out = {}; acc = {}; D = {}
    for n, h, t, p in cfg['side']:                       # 父骨写在子骨前面
        r = base.get(n)
        if r is None: continue
        if isinstance(r, dict) and 'dir' in r:
            Dp = D.get(SIDE_PARENT[n], Quaternion())
            hh, tt = SIDE_REST[n]; d0 = (tt - hh).normalized()
            tw = (Dp.inverted() @ Vector(r['dir']).normalized())
            O = d0.rotation_difference(tw)
            if r.get('roll'): O = Quaternion(tw, -math.radians(r['roll'])) @ O      # .L：负 = 脚掌转向 -Y（身体里面）
            D[n] = Dp @ O
            ax, ang = O.to_axis_angle()
            out[n] = [(tuple(ax), ang)]
            continue
        if isinstance(r, dict):
            par = acc.get(SIDE_PARENT[n], 0.0)
            y = ((rest_ang(n) - r['aim'] + 180) % 360 - 180) - par if 'aim' in r else math.degrees(r.get('y', 0.0))
            acc[n] = par + y
            rots = []
            if r.get('roll'): rots.append(('B', -math.radians(r['roll'])))      # .L：负 = 脚掌转向 -Y（身体里面）
            if r.get('out'): rots.append(('X', math.radians(r['out'])))          # .L：+X = 往外撇
            rots.append(('Y', math.radians(y)))
            out[n] = rots
        else:
            out[n] = [(a, v) for a, v in r]; acc[n] = acc.get(SIDE_PARENT[n], 0.0) + math.degrees(sum(v for a, v in r if a == 'Y'))
        O = Quaternion()                                  # 记下这根骨在骨架空间里转了多少（子骨用 dir 写法时要用）
        for a, v in out[n]:
            ax = (SIDE_REST[n][1] - SIDE_REST[n][0]).normalized() if a == 'B' else AX[a] if isinstance(a, str) else Vector(a)
            O = Quaternion(ax, v) @ O
        D[n] = D.get(SIDE_PARENT[n], Quaternion()) @ O
    return out
RESOLVED = {k: resolve_pose(v) for k, v in cfg['poses'].items()}
def pose_report(kind):
    """静止 → 姿势后：左腿每根骨末端位置、脚掌 / 手掌法线（静止时朝 -Z 的那一面）朝哪"""
    base = RESOLVED[kind]; D = {}; pos = {}
    for n, h, t, p in cfg['side']:
        O = Quaternion()
        for a, v in base.get(n, []):
            ax = (SIDE_REST[n][1] - SIDE_REST[n][0]).normalized() if a == 'B' else AX[a] if isinstance(a, str) else Vector(a)
            O = Quaternion(ax, v) @ O
        D[n] = D.get(SIDE_PARENT[n], Quaternion()) @ O
        hh, tt = SIDE_REST[n]; start = pos.get(SIDE_PARENT[n], hh)
        pos[n] = start + D[n] @ (tt - hh)
    print('POSE', kind, ' '.join(f'{n}:end({pos[n].x:+.3f},{pos[n].y:+.3f},{pos[n].z:+.3f})' for n, *_ in cfg['side']),
          ' sole fpaw', tuple(round(c, 2) for c in D['fpaw'] @ Vector((0, 0, -1))), 'hfoot', tuple(round(c, 2) for c in D['hfoot'] @ Vector((0, 0, -1))))
for k in RESOLVED: pose_report(k)
print('POSES', {k: {n: [(a if isinstance(a, str) else tuple(round(c, 2) for c in a), round(math.degrees(v), 1)) for a, v in r] for n, r in v.items()} for k, v in RESOLVED.items()})
def legs_spec(kind, ph, paddle, extra=0.0):
    base = RESOLVED[kind]; sp = {}
    for sfx, sg in (('.L', 1), ('.R', -1)):
        side_ph = ph + (0 if sg > 0 else math.pi)            # 左右反相
        for n, rots in base.items():
            # 镜像到右边：绕 X / 自身长轴的角度取反；任意轴 (x,y,z) 换成 (-x,y,-z)、角度不变
            sp[n + sfx] = [((a[0] * sg, a[1], a[2] * sg), v) if isinstance(a, tuple) else (a, v * (sg if a in ('X', 'B') else 1)) for a, v in rots]
        sp['farm1' + sfx].append(('Y', extra + paddle * math.sin(side_ph)))
        sp['fpaw' + sfx].append(('Y', 0.6 * paddle * math.sin(side_ph - 0.7)))
        sp['hleg1' + sfx].append(('Y', extra + paddle * math.sin(side_ph + 1.2)))
        sp['hfoot' + sfx].append(('Y', 0.6 * paddle * math.sin(side_ph + 0.5)))
    return sp

# 拱背（Breach）：总俯仰 total 弧度按骨长摊到 arch_chain 上（身体成 ∩ 形：头和尾鳍比背中间低）
def arch_spec(total, head_keep, front_frac=0.5):
    # front_frac：总弯度里分给前段（spine1..neck3）的比例，其余按骨长摊给尾巴（尾巴长、尾鳍大，弯多了尾鳍会掉得比头低很多）
    chain = cfg['arch_chain']; segs_ = {n: (Vector(h) - Vector(t)).length for n, h, t, p in SPINE}
    LF = sum(segs_[n] for n in chain if n in FRONT_SET); LT = sum(segs_[n] for n in chain if n not in FRONT_SET)
    sp = {}; front_acc = 0.0
    for n in chain:
        a = total * (front_frac * segs_[n] / LF if n in FRONT_SET else (1 - front_frac) * segs_[n] / LT)
        if n in FRONT_SET: sp[n] = [('Y', a)]; front_acc += a      # 朝前的骨：+Y = 往下
        else: sp[n] = [('Y', -a)]                                   # 朝后的骨（尾巴）：-Y = 往下
    sp['head'] = sp.get('head', []) + [('Y', -head_keep * front_acc)]     # 头抬回来一点，眼睛还看前方
    return sp
actions = []
def make_action(name, P):
    frames = P['frames']
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f in range(frames + 1):                      # 第 0 帧到第 frames 帧，首尾同姿势 → 无缝循环
        t = f / frames; ph = TW * t
        sp, loc = wave(t, P['A'], P['k'], P['pow'])
        sp = merge(sp, legs_spec(P['legs'], ph, P.get('paddle', 0), P.get('tuck_extra', 0)))
        if P.get('look'):
            sp = merge(sp, {'neck1': [('Z', P['look'] * math.sin(ph - 0.4))], 'neck2': [('Y', -0.3 * P['look'] * math.sin(2 * ph))],
                            'head': [('Z', 0.8 * P['look'] * math.sin(ph - 1.0))]})
        if P.get('arch'):
            sp = merge(sp, arch_spec(P['arch'] * (1 + P.get('arch_breath', 0) * math.sin(ph)), P.get('arch_head', 0.5), P.get('arch_front', 0.5)))
        pose(sp, loc, P.get('fan_scale', 1.0)); key_all(f)
    actions.append((name, act, frames))
for name, P in cfg['actions'].items(): make_action(name, P)
for name, act, frames in actions:                    # 每个动作一条 NLA 轨道，从第 0 帧开始
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 0, act)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')
sc.frame_start = 0; sc.frame_end = max(a[2] for a in actions)

# ---------- 贴图：只留底色（游戏用 MeshToonMaterial，只吃 map），缩到 1024 ----------
for m in bpy.data.materials:
    if not m.use_nodes: continue
    nt = m.node_tree; bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    keep = {l.from_node for l in bsdf.inputs['Base Color'].links} if bsdf else set()
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR', 'SEPARATE_RGB') or (n.type == 'TEX_IMAGE' and n not in keep):
            nt.nodes.remove(n)
    if bsdf:
        bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.8
# 底色调色：按 3D 位置给每个面贴标签（鳍 / 腿 / 头 / 身体），写成 UV 三角形，交给 blender/sea_tex.py（系统 python）
# 在 1024 上调色 → 换掉 Tripo 原图。每次重绑都重新生成，不依赖手工步骤
def posed_face_normals(kind='tuck', spec=None):
    """收腿姿势（不带身体波动）下每个面的法线：大臂 / 大腿上哪些面游泳时朝上、朝后、朝外（看得见）。spec：直接给一个姿势"""
    for tr in arm.animation_data.nla_tracks: tr.mute = True
    pose(spec if spec is not None else legs_spec(kind, 0.0, 0.0)); bpy.context.view_layer.update()
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    ns = [(p.normal.copy(), p.center.copy()) for p in me.polygons]; ev.to_mesh_clear()
    for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
    for tr in arm.animation_data.nla_tracks: tr.mute = False
    bpy.context.view_layer.update()
    return ns
def face_labels():
    me = mesh.data; uv = me.uv_layers.active.data
    PN = posed_face_normals()
    # 跃出（Breach）拱背时胸口往下压，肩膀外侧（大臂根）会转到朝上：离中线够远（|y| > breach_leg_y）、Breach 姿势下朝上的大臂 / 大腿根
    # 也压成藏青（v3 review 第 8 条：少年龙 Breach 从上面看得见 0.6% 的浅色腿）
    BP = cfg['actions'].get('Breach')
    PB = posed_face_normals(spec=merge(legs_spec(BP['legs'], 0.0, 0.0, BP.get('tuck_extra', 0)),
                                       arch_spec(BP['arch'], BP.get('arch_head', 0.5), BP.get('arch_front', 0.5)))) if BP and BP.get('arch') else None
    breach_y = W.get('breach_leg_y', 1.6 * W['leg_y'])
    sp = sorted([(h[0], h[2]) for n, h, t, p in SPINE] + [(t[0], t[2]) for n, h, t, p in SPINE])
    def spine_z(x):
        if x <= sp[0][0]: return sp[0][1]
        for (x0, z0), (x1, z1) in zip(sp, sp[1:]):
            if x0 <= x <= x1: return z0 + (z1 - z0) * (x - x0) / max(x1 - x0, 1e-9)
        return sp[-1][1]
    # 腿：下半截（前臂、爪、小腿、脚）全算；大臂 / 大腿只算离中线够远（|y| > 0.8 leg_y）、而且收腿时朝上 / 朝后 / 朝外（看得见）的面。
    # 朝下、朝身体的面（贴着肚皮）不压暗，否则奶白肚皮上会留下锯齿状的藏青缺口
    LEGS = set(b + s for b in ('farm2', 'fpaw', 'ftoe', 'hleg2', 'hfoot', 'htoe') for s in ('.L', '.R'))
    ROOTS = set(b + s for b in ('farm1', 'hleg1') for s in ('.L', '.R'))
    crest_y, crest_dz = W.get('crest_y', 0.016), W.get('crest_dz', 0.02)
    # 头上的鳍（v3 review 第 2 条：少年龙头冠 / 耳鳍以前落进「头」和藏青，渲染成黑褐色）：头骨轮廓（rigs json 的 head_fin，
    # 从侧视 / 俯视网格图量的：skull_top = 头顶高度随 x，skull_half = 头的半宽随 x）以外伸出去的部分。
    #   往两边伸出去（|y| > 半宽 + margin）= 耳鳍 → 奶白（铜色边不动）；往上伸出去（z > 头顶 + margin）= 头冠 → 海青（铜色尖不动）
    #   往两边的还要够薄（往里打射线 < thin，鳍是薄片），免得把脖子侧面算进去；头顶往下 base 以内、比 thin_crest 薄的也算头冠（刺根）
    HF = W.get('head_fin')
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromPolygons([v.co for v in me.vertices], [tuple(q.vertices) for q in me.polygons])
    def poly(pts, x):
        if x <= pts[0][0]: return pts[0][1]
        for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
            if x0 <= x <= x1: return z0 + (z1 - z0) * (x - x0) / max(x1 - x0, 1e-9)
        return pts[-1][1]
    def thick(p):
        """面往身体里打射线，多远碰到对面（鳍、刺是薄片：很近）"""
        for sg in (-1, 1):                                           # 往里打；朝向反了的面往里打不到东西，就换个方向
            h = bvh.ray_cast(p.center + p.normal * (sg * 1e-4), p.normal * sg)
            if h[0] is not None: return h[3]
        return 9.0
    if HF: hf_m, hf_x0, hf_thin = HF.get('margin', 0.004), HF.get('x', W['head_x']), HF.get('thin', 0.025)
    crest_thin = W.get('crest_thin', 0.012)
    def head_fin(p):
        if not HF: return None
        c = p.center
        if c.x < hf_x0: return None
        if abs(c.y) > poly(HF['skull_half'], c.x) + hf_m and thick(p) < hf_thin: return 'ear'
        top = poly(HF['skull_top'], c.x)
        if c.z > top + hf_m: return 'fin'
        if c.z > top - HF.get('base', 0.0) and thick(p) < HF.get('thin_crest', 0.012): return 'fin'   # 头冠的刺根：贴着头顶、但是薄
        return None
    out = {'body': [], 'fin': [], 'leg': [], 'head': [], 'ear': []}; cnt = {}; per_face = []
    for p in me.polygons:
        c, nrm = p.center, p.normal
        doms = [dominant[i] for i in p.vertices]
        hfl = head_fin(p)
        if c.x < W['fan_x']: lab = 'fin'                                                   # 尾鳍
        elif hfl: lab = hfl                                                                # 头冠 / 耳鳍
        elif c.x < W['head_x'] and abs(c.y) < crest_y and c.z > spine_z(c.x) + crest_dz and (abs(nrm.z) < 0.75 or thick(p) < crest_thin): lab = 'fin'
            # 背鳍：脊线上方、贴中线的竖片；往后倒的刺（面朝上，|nz| ≥ 0.75）只要够薄也算（v3 review 第 2 条：幼龙脖子上的刺以前是藏青）
        elif sum(d in LEGS for d in doms) * 2 > len(doms) or (sum(d in LEGS or d in ROOTS for d in doms) * 2 > len(doms) and abs(c.y) > 0.8 * W['leg_y']
                and (PN[p.index][1] - c).length > W.get('root_move', 0.02)                # 真在腿上（收腿时跟着挪了位置），不是腿根旁边的侧腹
                and (PN[p.index][0].z > 0.15 or PN[p.index][0].x < -0.45 or PN[p.index][0].y * (1 if c.y > 0 else -1) > 0.45)): lab = 'leg'
        elif PB and sum(d in ROOTS for d in doms) * 2 > len(doms) and abs(c.y) > breach_y and PB[p.index][0].z > 0.2: lab = 'leg'
        elif c.x > W['head_x2']: lab = 'head'
        else: lab = 'body'
        cnt[lab] = cnt.get(lab, 0) + 1; per_face.append(lab)
        li = list(p.loop_indices)
        for k in range(1, len(li) - 1):
            out[lab].append([c_ for j in (li[0], li[k], li[k + 1]) for c_ in tuple(uv[j].uv)])
    print('FACE LABELS', cnt)
    json.dump(per_face, open(os.path.join(CHECK, '_face_labels.json'), 'w'))      # 调试用：每个面的标签（按面序号），检查图按它上色
    return out
TEX_OUT = os.path.join(ROOT, '.cache', 'art', NAME, 'tex', 'base_v2.png')
if cfg.get('grade', True):
    lbl_path = os.path.join(CHECK, '_labels.json'); json.dump(face_labels(), open(lbl_path, 'w'))
    subprocess.run(['python', os.path.join(ROOT, 'blender', 'sea_tex.py'), SRC, TEX_OUT, '--labels', lbl_path, '--size', str(cfg.get('tex_size', 1024)),
                    '--report', '--debug', os.path.join(CHECK, 'tex')], check=True)
    for m in bpy.data.materials:
        if not m.use_nodes: continue
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                old = n.image; n.image = bpy.data.images.load(TEX_OUT); n.image.name = old.name + '_v2'
for img in list(bpy.data.images):
    if img.users == 0: bpy.data.images.remove(img)
TEX = cfg.get('tex_size', 1024)
for img in bpy.data.images:
    if img.size[0] > TEX: img.scale(TEX, TEX)
print('IMAGES', [(i.name, tuple(i.size)) for i in bpy.data.images])

sc.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
ACTS = [(name, frames) for name, act, frames in actions]
if not NO_EXPORT:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_skins=True, export_image_format='WEBP', export_image_quality=cfg.get('tex_quality', 85), export_yup=True)
    # 压缩：去掉不变的动画通道 + 网格量化（KHR_mesh_quantization），见 glb_pack.py
    subprocess.run(['python', os.path.join(ROOT, 'blender', 'glb_pack.py'), OUT_GLB], check=True)

# ---------- 清单 ----------
if not NO_EXPORT:
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    M = cfg.get('manifest', {})
    xs = [v.co.x for v in mesh.data.vertices]
    man = {
        'file': f'models/{NAME}_anim.glb', 'kind': cfg['kind'], 'stage': cfg['stage'],
        'length': round(max(xs) - min(xs), 4), 'pivot': M['pivot'], 'mouth': M['mouth'], 'headBone': 'head',
        # 嘴尖在身体中心（pivot）前面多远，按体长算：sim 的 heroMouth 用 len × mouthK（dragon.js 也按 mouth / pivot 算出同一个数）
        'mouthK': round((M['mouth'][0] - M['pivot'][0]) / (max(xs) - min(xs)), 4),
        'neckBones': [n for n, *_ in SPINE if n.startswith('neck')],
        'tailBones': [n for n, *_ in SPINE if n.startswith('tail')],
        'fanBone': 'fan' if 'fan' in CORE_SET else None,
        'legBones': {'front': {sd: [b + '.' + sd for b in FRONT_LEG] for sd in 'LR'}, 'hind': {sd: [b + '.' + sd for b in HIND_LEG] for sd in 'LR'}},
        'spineBones': [n for n, *_ in SPINE if n == 'hips' or n.startswith('spine') or n == 'chest'],
        'actions': {name: round(frames / sc.render.fps, 4) for name, act, frames in actions},
        'tris': tris, 'bones': len(BONES), 'bytes': os.path.getsize(OUT_GLB),
        'rotZImportDeg': cfg.get('import_rot_z_deg', 0),
        'notes': M.get('notes', ''),
    }
    json.dump(man, open(OUT_JSON, 'w', encoding='utf-8'), indent=2, ensure_ascii=False)

# ---------- 检查图 ----------
def solo(name):
    for tr in arm.animation_data.nla_tracks: tr.mute = (name is not None and tr.name != name) or (name is None)
    if name is None:    # 全部静音时姿势不会自己复位，手动清零 → 绑定姿势
        for pb in arm.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0)
        bpy.context.view_layer.update()
def goto(f):   # 先跳到别的帧再回来，保证动画真的重新求值（同一帧 frame_set 不会刷新姿势）
    sc.frame_set(f + 1); sc.frame_set(f)
def setup_render():
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    if not sc.world: sc.world = bpy.data.worlds.new('w')
    cd = bpy.data.cameras.new('chk'); cam = bpy.data.objects.new('chk', cd); sc.collection.objects.link(cam); sc.camera = cam
    cd.type = 'ORTHO'
    return cam, cd
VIEWS = {  # 名字: 相机位置, 欧拉角, (图像右, 图像上) 对应的轴下标
    'side': ((0, -5, 0), (math.pi / 2, 0, 0), (0, 2)),
    'top': ((0, 0, 5), (0, 0, 0), (0, 1)),
    'front': ((5, 0, 0), (math.pi / 2, 0, math.pi / 2), (1, 2)),
    'bottom': ((0, 0, -5), (math.pi, 0, 0), (0, 1)),   # 从下往上看：右=+X，上=-Y
}
def read_bones():
    """当前姿势下每根骨头的首尾（骨架空间）。要在任何渲染之前读：渲染过以后视图层的姿势会慢一拍"""
    ev = arm.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [(tuple(arm.matrix_world @ pb.head), tuple(arm.matrix_world @ pb.tail), pb.name) for pb in ev.pose.bones]
def project(bones3, view, centre=(0, 0, 0)):
    loc, rot, (iu, iv) = VIEWS[view]; flip = -1 if view == 'bottom' else 1
    return [[(h[iu] - centre[iu], flip * (h[iv] - centre[iv])), (t[iu] - centre[iu], flip * (t[iv] - centre[iv])), n] for h, t, n in bones3]
def ortho(cam, cd, view, path, res=(1600, 640), span=1.1, centre=(0, 0, 0), bones=None):
    loc, rot, (iu, iv) = VIEWS[view]
    segs2 = project(bones, view, centre) if bones else []
    sc.render.resolution_x, sc.render.resolution_y = res
    cd.ortho_scale = span
    cam.location = Vector(centre) + Vector(loc); cam.rotation_euler = rot
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)
    return {'path': path, 'w': res[0], 'h': res[1], 'span': span, 'segs': segs2}
PIL_CODE = r'''
import sys, json
from PIL import Image, ImageDraw
jobs = json.load(open(sys.argv[1], encoding='utf-8'))
for job in jobs:
    ims = []
    for it in job['items']:
        im = Image.open(it['path']).convert('RGB'); d = ImageDraw.Draw(im)
        W, H, ppu = it['w'], it['h'], it['w'] / it['span']
        P = lambda u, v: (W / 2 + u * ppu, H / 2 - v * ppu)
        if job.get('grid'):
            for k in range(-60, 61):
                g = k * 0.025; x, y = P(g, g)
                c = (255, 60, 60) if k == 0 else (110, 140, 220) if k % 2 == 0 else (85, 90, 110)
                d.line([(x, 0), (x, H)], fill=c); d.line([(0, y), (W, y)], fill=c)
                if k % 4 == 0: d.text((x + 2, 2), f'{g:+.1f}', fill=(255, 255, 0)); d.text((2, y + 2), f'{g:+.1f}', fill=(255, 255, 0))
        for a, b, n in it['segs']:
            col = (255, 80, 200) if n.endswith('.L') else (80, 220, 255) if n.endswith('.R') else (255, 230, 0)
            d.line([P(*a), P(*b)], fill=col, width=3); d.ellipse([P(*a)[0] - 4, P(*a)[1] - 4, P(*a)[0] + 4, P(*a)[1] + 4], outline=col, width=2)
        if it.get('label'): d.text((8, H - 18), it['label'], fill=(255, 255, 0))
        ims.append(im)
    if job.get('crop'):
        ims = [im.crop(tuple(job['crop'])) for im in ims]
    Wd = max(i.width for i in ims); Ht = sum(i.height for i in ims)
    out = Image.new('RGB', (Wd, Ht), (30, 30, 30)); y = 0
    for i in ims: out.paste(i, (0, y)); y += i.height
    out.save(job['out'])
'''
def compose(jobs):
    jp = os.path.join(CHECK, '_jobs.json'); json.dump(jobs, open(jp, 'w', encoding='utf-8'))
    subprocess.run(['python', '-c', PIL_CODE, jp], check=True)

if not NO_CHECK:
    # 重新打开存好的 .blend 再出检查图：同一会话里新建的 NLA 轨道，视图层的依赖图不会跟着换帧刷新
    bpy.ops.wm.open_mainfile(filepath=OUT_BLEND)
    sc = bpy.context.scene
    arm = next(o for o in sc.objects if o.type == 'ARMATURE'); mesh = next(o for o in sc.objects if o.type == 'MESH')
    cam, cd = setup_render()
    parts = os.path.join(CHECK, 'parts'); os.makedirs(parts, exist_ok=True)
    jobs = []
    # 先把要画的骨头位置全部读出来（渲染之前）
    # （先读动作再读静止姿势：手动清零姿势以后，换帧求值会对不上）
    ACT_B = {}
    for name, frames in ACTS:
        solo(name); goto(0); ACT_B[name] = read_bones()
        print('OVERLAY', name, [(round(h[0], 3), round(h[1], 3), round(t[0], 3), round(t[1], 3)) for h, t, n in ACT_B[name] if n == 'fan'])
    solo(None); sc.frame_set(0); REST_B = read_bones()
    # 1) 静止姿势 + 骨骼（侧/俯/正）
    solo(None); goto(0)
    for v in ('side', 'top'):
        it = ortho(cam, cd, v, os.path.join(parts, f'rest_{v}.png'), bones=REST_B)
        jobs.append({'out': os.path.join(CHECK, f'rest_bones_{v}.png'), 'grid': True, 'items': [it]})
    it = ortho(cam, cd, 'front', os.path.join(parts, 'rest_front.png'), res=(800, 800), span=0.4, bones=REST_B)
    jobs.append({'out': os.path.join(CHECK, 'rest_bones_front.png'), 'grid': True, 'items': [it]})
    # 2) 权重：每个顶点按主导骨上色
    import colorsys
    names = [n for n, *_ in BONES]
    attr = mesh.data.color_attributes.new('dom', 'BYTE_COLOR', 'POINT')
    for i, n in enumerate(dominant):
        k = names.index(n); hcol = colorsys.hsv_to_rgb((k * 0.381966) % 1.0, 0.75 if k % 2 else 1.0, 1.0 if k % 3 else 0.7)
        attr.data[i].color = (*hcol, 1.0)
    mesh.data.color_attributes.active_color = attr
    sc.display.shading.color_type = 'VERTEX'
    its = [ortho(cam, cd, v, os.path.join(parts, f'w_{v}.png'), bones=REST_B) for v in ('side', 'top', 'bottom')]
    jobs.append({'out': os.path.join(CHECK, 'weights_dominant.png'), 'items': its})
    sc.display.shading.color_type = 'TEXTURE'
    mesh.data.color_attributes.remove(mesh.data.color_attributes['dom'])
    # 3) 主动作俯视 4 个相位（关键检查：S 形要顺、腿和尾鳍不能撕裂）
    for name, frames in ACTS:
        solo(name); its = []
        for q in range(4):
            f = round(q * frames / 4); goto(f)
            it = ortho(cam, cd, 'top', os.path.join(parts, f'{name}_top_{f:02d}.png'), res=(1600, 420), span=1.1, bones=ACT_B[name] if q == 0 else None)
            it['label'] = f'{name} top  frame {f}/{frames}'; its.append(it)
        jobs.append({'out': os.path.join(CHECK, f'{name.lower()}_top_4phase.png'), 'items': its})
        goto(round(frames / 4))
        its = [ortho(cam, cd, 'side', os.path.join(parts, f'{name}_side.png'), res=(1600, 500), span=1.1),
               ortho(cam, cd, 'bottom', os.path.join(parts, f'{name}_bottom.png'), res=(1600, 500), span=1.1)]
        its[0]['label'] = f'{name} side f{round(frames / 4)}'; its[1]['label'] = f'{name} bottom f{round(frames / 4)}'
        jobs.append({'out': os.path.join(CHECK, f'{name.lower()}_side_bottom.png'), 'items': its})
    compose(jobs)
    bpy.data.objects.remove(cam)


print('DONE bones', len(BONES), 'actions', [a[0] for a in ACTS], 'export', not NO_EXPORT)
