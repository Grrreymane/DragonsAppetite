# 海龙收腿检查：前爪会不会插进后大腿、后爪离尾巴多远、脚往外撇多少、脚掌 / 浅色内侧朝不朝上
#   blender -b <blender/sea_xxx_rig.blend> -P sea_tuck_check.py -- [动作1,动作2 ...]（默认 Swim,Dash,Glide,Breach）
# 每个动作抽 4 帧（Dash 抽每一帧），打印每侧：
#   front-hind  前爪（farm2/fpaw/ftoe）顶点到同侧后大腿（hleg1/hleg2）顶点的最短距离（<0.004 ≈ 穿插）
#   hpaw-tail   后爪（hfoot/htoe）顶点到 tail1-3 顶点的最短距离（目标 ≥0.008）
#   toeX        前趾（ftoe 主导）顶点里最靠后的 x；fpawZ  前爪最低点比静止时的肚皮低多少（正 = 低于肚皮）
#   hpawY       后爪顶点最大 |y|，在髋骨自己的坐标里量（目标 ≤ 髋部身体半宽 + 0.015，半宽打印在开头）
#   soleZ       静止时朝下的脚掌顶点（法线 z<-0.6），当前法线 z 的 95 百分位（>0.2 = 从上面能看见浅色脚掌）
# 每个动作再打印 paleUp：从正上方看得见（往上打射线没被挡住）、朝上（法线 z>0.2）、贴图颜色浅（V>0.55 且饱和 <0.25）的腿部面积，
#   占从上方看得见的全部面积的百分比（目标 <0.5%）
import bpy, sys, math
from mathutils import kdtree, Vector
from mathutils.bvhtree import BVHTree
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ACTS = argv[0].split(',') if argv else ['Swim', 'Dash', 'Glide', 'Breach']
sc = bpy.context.scene
arm = next(o for o in sc.objects if o.type == 'ARMATURE'); mesh = next(o for o in sc.objects if o.type == 'MESH')
names = [g.name for g in mesh.vertex_groups]
dom = []
for v in mesh.data.vertices:
    best = max(v.groups, key=lambda g: g.weight) if len(v.groups) else None
    dom.append(names[best.group] if best else None)
rest_n = [v.normal.copy() for v in mesh.data.vertices]
rest_co = [v.co.copy() for v in mesh.data.vertices]
def sel(*bones): s = set(bones); return [i for i, d in enumerate(dom) if d in s]
LEGB = set(b + s for b in ('farm1', 'farm2', 'fpaw', 'ftoe', 'hleg1', 'hleg2', 'hfoot', 'htoe') for s in ('.L', '.R'))
SIDES = {}
for sfx in ('.L', '.R'):
    SIDES[sfx] = {
        'front': sel(*[b + sfx for b in ('farm2', 'fpaw', 'ftoe')]),
        'thigh': sel(*[b + sfx for b in ('hleg1', 'hleg2')]),
        'hpaw': sel(*[b + sfx for b in ('hfoot', 'htoe')]),
        'ftoe': sel('ftoe' + sfx), 'fpaw': sel('fpaw' + sfx, 'ftoe' + sfx),
        'fsole': [i for i in sel(*[b + sfx for b in ('fpaw', 'ftoe')]) if rest_n[i].z < -0.6],
        'hsole': [i for i in sel(*[b + sfx for b in ('hfoot', 'htoe')]) if rest_n[i].z < -0.6],
    }
TAIL = sel('tail1', 'tail2', 'tail3')
# 静止姿势：髋部身体半宽（hips / spine1 / tail1 主导的顶点里最大 |y|），胸下肚皮的 z（chest / spine3 主导顶点的 5 百分位）
core_hip = [rest_co[i] for i in sel('hips', 'spine1', 'tail1')]
HALF = max(abs(p.y) for p in core_hip) if core_hip else 0.06
bz = sorted(rest_co[i].z for i in sel('chest', 'spine3', 'spine2'))
BELLY = bz[len(bz) // 20] if bz else 0
print(f'REST hip half-width {HALF:.3f} (hind paw |y| target <= {HALF + 0.015:.3f})  belly z under chest {BELLY:+.3f}')
# 贴图（底色）：按面 UV 中心取色
img = None
for m in bpy.data.materials:
    if m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image: img = n.image
PX = list(img.pixels) if img else None; IW, IH = (img.size[0], img.size[1]) if img else (0, 0)
me0 = mesh.data; uvd = me0.uv_layers.active.data
pale_face = []; leg_face = []
for p in me0.polygons:
    u = sum((uvd[l].uv for l in p.loop_indices), Vector((0, 0))) / p.loop_total
    x = min(IW - 1, max(0, int(u.x * IW))); y = min(IH - 1, max(0, int(u.y * IH))); k = (y * IW + x) * 4
    r, g, b = PX[k:k + 3] if PX else (0, 0, 0)
    mx, mn = max(r, g, b), min(r, g, b); s = (mx - mn) / mx if mx > 1e-4 else 0
    pale_face.append(mx > 0.55 and s < 0.25)
    leg_face.append(sum(dom[i] in LEGB for i in p.vertices) * 2 > len(p.vertices))
def solo(name):
    for tr in arm.animation_data.nla_tracks: tr.mute = tr.name != name
def mindist(A, B, co):
    if not A or not B: return 9
    kd = kdtree.KDTree(len(B))
    for k, i in enumerate(B): kd.insert(co[i], k)
    kd.balance()
    return min(kd.find(co[i])[2] for i in A)
for name in ACTS:
    tr = next((t for t in arm.animation_data.nla_tracks if t.name == name), None)
    if not tr: print('NO ACTION', name); continue
    st = tr.strips[0]; n = int(round(st.action_frame_end - st.action_frame_start))
    frames = list(range(n)) if name == 'Dash' else [round(q * n / 4) for q in range(4)]
    solo(name)
    worst = {'fh': 9, 'ht': 9, 'toeX': 9, 'hpY': 0, 'fpZ': -9, 'soleZ': -9, 'fz': -9, 'hz': -9, 'pale': 0}
    for f in frames:
        sc.frame_set(f + 1); sc.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg); me = ev.to_mesh()
        M = mesh.matrix_world; co = [M @ v.co for v in me.vertices]; nz = [(M.to_3x3() @ v.normal).normalized().z for v in me.vertices]
        # 后爪外撇按身体自己的坐标量：把顶点换回「髋骨没动时」的坐标（游泳时髋骨跟着波左右摆，直接看世界 y 会把身体本身的摆动算进去）
        hb = arm.pose.bones['hips']; Hinv = hb.bone.matrix_local @ hb.matrix.inverted()
        out = []
        for sfx, S in SIDES.items():
            fh = mindist(S['front'], S['thigh'], co); ht = mindist(S['hpaw'], TAIL, co)
            toeX = min((co[i].x for i in S['ftoe']), default=9); hpY = max((abs((Hinv @ co[i]).y) for i in S['hpaw']), default=0); hpW = max((abs(co[i].y) for i in S['hpaw']), default=0)
            fpZ = BELLY - min((co[i].z for i in S['fpaw']), default=BELLY)
            def p95(ix): sz = sorted(nz[i] for i in ix); return sz[int(len(sz) * 0.95)] if sz else -9   # 95 百分位（去掉爪尖几个点的噪声）
            fz, hz = p95(S['fsole']), p95(S['hsole']); worst['fz'] = max(worst['fz'], fz); worst['hz'] = max(worst['hz'], hz)
            worst['fh'] = min(worst['fh'], fh); worst['ht'] = min(worst['ht'], ht); worst['toeX'] = min(worst['toeX'], toeX)
            worst['hpY'] = max(worst['hpY'], hpY); worst['hpW'] = max(worst.get('hpW', 0), hpW); worst['fpZ'] = max(worst['fpZ'], fpZ)
            out.append(f'{sfx} front-hind {fh:.4f} hpaw-tail {ht:.4f} toeX {toeX:.3f} hpawY {hpY:.3f} fpawZ {fpZ:+.3f} soleZ f{fz:+.2f} h{hz:+.2f}')
        # 从上往下看：朝上的面，往上打射线没挡住才算看得见
        polys = [[co[i] for i in p.vertices] for p in me.polygons]
        bvh = BVHTree.FromPolygons(co, [tuple(p.vertices) for p in me.polygons])
        vis = 0.0; pale = 0.0; pall = 0.0
        for fi, p in enumerate(me.polygons):
            vs = polys[fi]; c = sum(vs, Vector()) / len(vs)
            nrm = (vs[1] - vs[0]).cross(vs[2] - vs[0]); a2 = nrm.length
            if a2 < 1e-12: continue
            nrm /= a2
            if nrm.z < 0.2: continue
            hit = bvh.ray_cast(c + Vector((0, 0, 1e-4)), Vector((0, 0, 1)))
            if hit[0] is not None: continue
            A = a2 / 2 * nrm.z; vis += A
            if leg_face[fi] and pale_face[fi]: pale += A
            if pale_face[fi]: pall += A
        pp = pale / max(vis, 1e-9) * 100; worst['pale'] = max(worst['pale'], pp)
        ev.to_mesh_clear()
        print(f'{name} f{f:02d} paleUp {pp:.2f}% (all pale seen from above {pall / max(vis, 1e-9) * 100:.1f}%) | ' + ' | '.join(out))
    print(f'WORST {name}: front-hind {worst["fh"]:.4f}  hpaw-tail {worst["ht"]:.4f}  toeX {worst["toeX"]:.3f}  hpawY {worst["hpY"]:.3f} (<= {HALF + 0.015:.3f}; world-frame {worst["hpW"]:.3f})  '
          f'fpawZ {worst["fpZ"]:+.3f}  soleZ front {worst["fz"]:+.2f} hind {worst["hz"]:+.2f}  paleUp {worst["pale"]:.2f}%')
