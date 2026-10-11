# 幼火龙（fire_baby）：绑骨骼 + 刷权重 + 做动作 + 导出网页用 glb
# 由 rig.py（成龙）复制改写：骨头坐标、部位阈值按幼龙网格重新量过；38 根骨，命名和成龙一致
# blender -b --factory-startup -P rig_fire_baby.py -- <in.glb> <out.glb> <out.blend> <preview_dir> [manifest.json | prep]
# 实际用法（输入是 Tripo P1 原样输出，face-limit 5000）：
#   blender -b --factory-startup -P D:/Minigame/Dragon/blender/rig_fire_baby.py -- D:/Minigame/Dragon/.cache/art/fire_baby/fire_baby_rig.glb
#     D:/Minigame/Dragon/models/fire_baby_anim.glb D:/Minigame/Dragon/blender/fire_baby_rig.blend D:/Minigame/Dragon/.cache/check/fire_baby/rigprev
#     D:/Minigame/Dragon/models/fire_baby.json
#   第 5 个参数写 prep 时只做改形+修网格，把网格导出到 <out.glb> 后退出（给量尺寸的分析脚本用）；写 .json 时同时写清单
#   导出后自动跑 glb_quantize.py（KHR_mesh_quantization + 去掉不动的平移/缩放通道），681 KB → 约 0.37 MB
# v2（2026-10-10，按 .cache/docs/review_fire_baby.md 改）：头 ×1.2、尾巴杆再缩 0.78（尾锤整块平移不压扁）、尾锤改成竖着的菱形、
#   尾背刺高度 ×0.5、翅膀 ×0.85、飞行尾巴往上翘、前腿收紧、扇翅 4 下 / 3 秒、后膝权重平滑、减面到 ≤4900、焊接顶点 + 平滑法线
#   调试用环境变量（不设 = 定稿值）：FM_ARM / FM_TAIL（飞行前腿 / 尾巴侧视目标角，逗号分隔）、FM_FLAPS、
#   FM_SHELL=flip（v1 做法）、FM_NODEC=1（不减面）、FM_NOWELD=1（不焊接）
#   自查：blender/pose_report.py、blender/glb_check.py、_lab/firemodels.html（游戏同款卡通材质 + 描边 + 追尾镜头）
# v3（2026-10-11，按 .cache/docs/v2_review_firemodels.md + 用户定稿的姿势语言改）：
#   - 前腿回到定稿的「人的胳膊」：肘 70、腕垂 30、松拳爪尖朝后（v2 为了收腿把肘弯到 95）；收腿改成上臂更竖直（-95，成龙 -110），
#     前臂往前探，爪子离胸线 12.8% 体长（v2 11.2%、照搬成龙 14.4%；.cache/check/firemodels/v3/arm_*.png）
#   - 飞行尾巴回到定稿的「往后上方翘 8..20 度」（v2 翘到 32 度）
#   - 背上（尾根到肩）那排大刺 ×0.5（v2 只压了尾巴上的），侧面不再像锯条
#   - 尾锤整块重做：删掉旧面，从尾杆末端接一个干净的竖菱形晶块，贴图是自己画在图集空地上的深色玄武岩 + 发光熔岩裂纹
#     （v2 的尾锤沿用旧箭头的 UV，追尾镜头里背面是一片灰褐色）；见 firemodels_lib.rebuild_club / club_texture
#   - 清单 neckBones 加 'head'（和少年、成龙一样，转弯时大头跟着转）
# 坐标（Blender）：+X 朝前（头），+Y 朝左，+Z 朝上
# 和 rig.py 的区别：
#   - 关键帧从第 0 帧开始（成龙从第 1 帧开始，循环时有 1/24 秒的小卡顿）
#   - 飞行收腿姿势（TUCK）不手填弧度，而是给「侧视朝向角」目标（照成龙定稿实测的角度），由脚本反算每根骨要转多少
#   - 只保留底色贴图（游戏用 MeshToonMaterial，只读 map），去掉金属粗糙度和法线贴图
import bpy, sys, os, math, json
from mathutils import Vector, Quaternion, Matrix
from mathutils.geometry import intersect_point_line
sys.dont_write_bytecode = True   # 不在 blender/ 里留 __pycache__（会被提交、部署）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import firemodels_lib as FL

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT_GLB, OUT_BLEND, PREV = argv[0], argv[1], argv[2], argv[3]
MANIFEST = argv[4] if len(argv) > 4 and argv[4].endswith('.json') else None
os.makedirs(PREV, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
mw = mesh.matrix_world.copy(); mesh.parent = None; mesh.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh.name = 'FireBaby'

# ---------- 改形：尾巴缩短 ----------
# Tripo 把四分之三视角里「朝远处伸」的尾巴估得太长（尾巴占全长 56%、尾锤和身体一样长，像蜥蜴）。
# 设定图里幼龙尾巴约占全长 40%、尾锤是短胖的菱形。这里把 x < TAIL_X0 的部分沿 x 压缩到 TAIL_K 倍，
# 中间留 TAIL_W 的过渡段（压缩率从 1 线性变到 TAIL_K），网格位置连续；顶点法线按逆转置同步修正。
# TAIL_K = 1.0 即关闭。
TAIL_X0, TAIL_W, TAIL_K = 0.04, 0.07, 0.5
def tail_f(x):  # dx'/dx
    if x >= TAIL_X0: return 1.0
    if x <= TAIL_X0 - TAIL_W: return TAIL_K
    return TAIL_K + (1 - TAIL_K) * (x - (TAIL_X0 - TAIL_W)) / TAIL_W
def tail_map(x):
    if x >= TAIL_X0: return x
    a = TAIL_X0 - TAIL_W
    if x >= a:  # 过渡段：f 线性，积分是梯形
        return TAIL_X0 - (TAIL_X0 - x) * (1 + tail_f(x)) / 2
    return TAIL_X0 - TAIL_W * (1 + TAIL_K) / 2 - (a - x) * TAIL_K
if TAIL_K != 1.0:
    me = mesh.data
    old_n = [Vector(c.vector) for c in me.corner_normals]
    fx = [tail_f(v.co.x) for v in me.vertices]
    new_n = []
    for li, l in enumerate(me.loops):
        n = old_n[li]; f = fx[l.vertex_index]
        new_n.append(Vector((n.x / f, n.y, n.z)).normalized() if f != 1.0 else n)
    for v in me.vertices: v.co.x = tail_map(v.co.x)
    me.normals_split_custom_set([tuple(n) for n in new_n])
    me.update()

# ---------- 修网格：翅根后缘有两片内外翻转的小薄壳 ----------
# Tripo 网格在翅膀后缘贴身体的地方（x 0.23~0.27, |y| 0.07~0.19）各有一个 18 面的小闭合壳，
# 只靠非流形边连到主体，绕序是反的（朝里）。卡通描边壳（BackSide + 沿法线外扩）在那里会露成大黑斑，
# 扇翅时更明显。做法：按「只走恰好 2 面的边」切出流形区域，对小的闭合区域算有向体积，负的整块翻面。
import bmesh
# v2：这两个小壳翻面以后，焊接 + 平滑法线时它们的法线混进翅根的翅膜，描边壳在那里翻成大黑斑；
#   它们只靠非流形边挂在主体上、体积 ~1e-5，删掉看不出缺口（.cache/check/firemodels/lab/babyroot*.png 对比）
SHELL_MODE = os.environ.get('FM_SHELL', 'delete')    # 'delete' | 'flip'（v1 的做法）
def fix_inside_out(me, max_faces=200):
    bm = bmesh.new(); bm.from_mesh(me)
    lay = bm.faces.layers.int.new('orig')
    for f in bm.faces: f[lay] = f.index
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    seen = set(); flip = []
    for f in bm.faces:
        if f in seen: continue
        st = [f]; seen.add(f); reg = []
        while st:
            a = st.pop(); reg.append(a)
            for e in a.edges:
                if len(e.link_faces) == 2:
                    for b in e.link_faces:
                        if b not in seen: seen.add(b); st.append(b)
        if len(reg) > max_faces: continue
        vol = 0.0
        for g in reg:
            vs = [v.co for v in g.verts]
            for i in range(1, len(vs) - 1): vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6
        if vol < -1e-9:
            c = sum((g.calc_center_median() for g in reg), Vector()) / len(reg)
            print('FLIP region', len(reg), 'faces, vol', f'{vol:.2e}', 'at', tuple(round(x, 3) for x in c))
            flip += [g[lay] for g in reg]
    bm.free()
    if not flip: return 0
    if SHELL_MODE == 'delete':   # v2：直接删掉（见下面 SHELL_MODE 的说明）
        bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[bm.faces[i] for i in flip], context='FACES')
        bm.to_mesh(me); bm.free(); me.update()
        return -len(flip)
    # 翻绕序，同时把这些面的自定义法线取反（其余面的法线原样保留）
    old = [Vector(c.vector) for c in me.corner_normals]
    pv = {}
    for i in flip:
        for li in me.polygons[i].loop_indices: pv[(i, me.loops[li].vertex_index)] = old[li]
    for i in flip: me.polygons[i].flip()
    new = list(old)
    for i in flip:
        for li in me.polygons[i].loop_indices: new[li] = -pv[(i, me.loops[li].vertex_index)]
    me.normals_split_custom_set([tuple(n) for n in new]); me.update()
    return len(flip)
print('flipped faces', fix_inside_out(mesh.data))
if len(argv) > 4 and argv[4] == 'prep':   # 只导出改形后的网格（给分析脚本量尺寸用）
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_yup=True)
    print('PREP DONE'); sys.exit(0)

# ======================= 按幼龙网格量出来的数 =======================
# 量法：render_views / 自己的正交网格图（.cache/check/fire_baby/views_prep/*_grid.png）+ 顶点按区域分段求中心
# （.cache/art/fire_baby/analyze2.py）。以下坐标都是「尾巴第一次缩短（TAIL_K）之后」的网格坐标；
# 尾巴骨在 v2 改形（尾杆再缩、尾锤重做）时用同一个映射一起移动，头 / 翅膀骨在按权重改形时一起缩放。
# 幼龙和成龙的主要差别：脖子短、头大（头占 x 0.33~0.50）、腿短粗且竖直、翅根紧贴脖根（x 0.26~0.30），
# 翅膀静止时几乎水平（翼尖仰角约 5°，成龙约 28°）。
SPINE = [
    ('hips', (0.06, 0, -0.04), (0.13, 0, -0.035), None),
    ('spine', (0.13, 0, -0.035), (0.21, 0, -0.03), 'hips'),
    ('chest', (0.21, 0, -0.03), (0.29, 0, -0.005), 'spine'),
    ('neck1', (0.29, 0, -0.005), (0.325, 0, 0.05), 'chest'),
    ('neck2', (0.325, 0, 0.05), (0.36, 0, 0.11), 'neck1'),
    ('head', (0.36, 0, 0.11), (0.49, 0, 0.11), 'neck2'),
    ('tail1', (0.06, 0, -0.04), (0.02, 0, -0.05), 'hips'),
    ('tail2', (0.02, 0, -0.05), (-0.025, 0, -0.065), 'tail1'),
    ('tail3', (-0.025, 0, -0.065), (-0.07, 0, -0.08), 'tail2'),
    ('tail4', (-0.07, 0, -0.08), (-0.115, 0, -0.08), 'tail3'),
    ('tail5', (-0.115, 0, -0.08), (-0.145, 0, -0.075), 'tail4'),   # 到尾杆末端那一圈（x -0.137）
    ('tail6', (-0.145, 0, -0.075), (-0.22, 0, -0.04), 'tail5'),    # 尾锤：从尾杆末端到重做后的尾锤尖
]
SIDE = [
    ('farm1', (0.30, 0.075, -0.03), (0.28, 0.085, -0.115), 'chest'),
    ('farm2', (0.28, 0.085, -0.115), (0.29, 0.082, -0.185), 'farm1'),
    ('fpaw', (0.29, 0.082, -0.185), (0.32, 0.075, -0.208), 'farm2'),
    ('ftoe', (0.32, 0.075, -0.208), (0.356, 0.072, -0.218), 'fpaw'),
    ('hleg1', (0.115, 0.06, -0.035), (0.14, 0.07, -0.11), 'hips'),
    ('hleg2', (0.14, 0.07, -0.11), (0.098, 0.075, -0.18), 'hleg1'),
    ('hfoot', (0.098, 0.075, -0.18), (0.13, 0.078, -0.207), 'hleg2'),
    ('htoe', (0.13, 0.078, -0.207), (0.17, 0.078, -0.216), 'hfoot'),
    ('wing1', (0.265, 0.075, 0.035), (0.295, 0.15, 0.09), 'chest'),
    ('wing2', (0.295, 0.15, 0.09), (0.36, 0.235, 0.19), 'wing1'),
    ('fing1', (0.36, 0.235, 0.19), (0.277, 0.499, 0.071), 'wing2'),
    ('fing2', (0.36, 0.235, 0.19), (0.24, 0.37, 0.02), 'wing2'),
    ('fing3', (0.36, 0.235, 0.19), (0.235, 0.25, 0.0), 'wing2'),
]
# 部位划分（成龙 rig.py 的 0.355 / 0.085 / 0.215 / -0.075 换成下面这些）
HEAD_X, HEAD_Z, HEAD_Y = 0.345, 0.05, 0.125     # 头和角：x>HEAD_X 且 z>HEAD_Z 且 |y|<HEAD_Y → 只用 head、neck2
WING_Y, WING_Z, WING_X = 0.085, -0.015, 0.20     # 翅膀：|y|>WING_Y 且 z>WING_Z 且 x>WING_X（且不是头）→ 同侧翅骨（|y|<0.12 再加 chest）
LEG_Z, LEG_Y, FRONT_X, HIND_X = -0.03, 0.015, 0.205, 0.0   # 腿：z<LEG_Z 且 |y|>LEG_Y；x>FRONT_X 前腿链，HIND_X<x≤FRONT_X 后腿链
W1_Y, W1_Z, W1_X = 0.06, -0.02, 0.31             # 翅根附近的躯干：|y|>W1_Y 且 z>W1_Z 且 x<W1_X 时再加同侧 wing1（不给脖子侧面加）
def candidates(p, s):
    ay = abs(p.y)
    if p.x > HEAD_X and p.z > HEAD_Z and ay < HEAD_Y:
        return ['head', 'neck2']
    if ay > WING_Y and p.z > WING_Z and p.x > WING_X:
        return ['wing1' + s, 'wing2' + s, 'fing1' + s, 'fing2' + s, 'fing3' + s] + (['chest'] if ay < 0.12 else [])
    cand = list(CORE)
    if p.z < LEG_Z and ay > LEG_Y:
        if p.x > FRONT_X: cand += ['farm1' + s, 'farm2' + s, 'fpaw' + s, 'ftoe' + s]
        elif p.x > HIND_X: cand += ['hleg1' + s, 'hleg2' + s, 'hfoot' + s, 'htoe' + s]
    if ay > W1_Y and p.z > W1_Z and WING_X < p.x < W1_X: cand += ['wing1' + s]
    return cand

# 飞行姿势目标（侧视朝向角，度）——照成龙定稿 pose_report 实测（Glide 第 1 帧，去掉手指呼吸）
# 前腿：同样的「人的胳膊」（肘 70、腕垂 30、松拳、爪尖朝后下）。幼龙腿短粗、相对身体长，照搬成龙角度时爪子垂到胸线下 14% 体长，
#   侧面看像站着的腿；v2 把肘弯到 95 收上去（像钩子，偏离定稿），v3 改成上臂竖直一点（-95）、前臂往前探，肘仍是 70
# v3：回到定稿的肘 70 / 腕 30。爪子垂得低的问题改成「上臂更竖直、前臂往前探」来收（arm_*.png 对比：-95/-25 读起来是折起来的胳膊，
#   肘 95 的 v2 像一个钩子）
ARM_TARGET = [float(a) for a in os.environ.get('FM_ARM', '-95,-25,-55,-130').split(',')]
LEG_TARGET = [-75, -165, -110, -147]    # 大腿 / 小腿 / 脚掌 / 脚趾：膝弯 90、踝 55、趾 37
# 尾巴：根部和成龙一样往后上方翘 8..10°，往梢越翘越高（尾锤约 32°），像设定图里幼龙翘起来的尾巴；
#   追尾镜头里尾锤不再挡在两条后腿之间
# v3：定稿是「往后上方翘 8..20 度」，v2 翘到 32 度超出了；回到 172..160（根部 8 度、尾锤 20 度）
TAIL_TARGET = [float(a) for a in os.environ.get('FM_TAIL', '172,170,168,165,162,160').split(',')]
NECK_TUCK = {'neck1': 0.1, 'neck2': 0.06, 'head': -0.12}   # 和成龙一样：脖子基本保持站立形状

# 翅膀：成龙静止时翼尖仰角约 28°，Fly 基准 -0.35 → 平均仰角约 8°；Glide 基准 -0.52 → 约 -2°。
# 幼龙静止时翼尖仰角约 5°，所以基准改成让平均仰角相同；振幅一样（0.8 rad）。
FLY_UP0, FLY_AMP = math.radians(8 - 5), 0.8
GLIDE_UP0 = math.radians(-2 - 5)
FLAPS = int(os.environ.get('FM_FLAPS', '4'))   # Fly 一个循环（72 帧 = 3 秒）扇几下：幼龙 4 下（1.33 Hz；成龙 / 少年 3 下）
FOLD = 0.18        # 上扇时手指收拢量（成龙 0.25；幼龙翅膜小，0.25 时折出手风琴褶）

# ---------- v2 改形参数（review_fire_baby.md） ----------
HEAD_S = 1.2                       # 头（按 head 权重）绕 neck2/head 关节放大
WING_S = 0.85                      # 翅膀（按翅骨权重）绕肩关节缩小
SPIKE_BASE, SPIKE_K = 0.012, 0.5   # 尾杆背刺：比尾巴中线高出 SPIKE_BASE 以上的部分 ×SPIKE_K
# 尾锤（Tripo 原样是横着的扁箭头，追尾镜头里像两条后腿之间的一块黑砖）→ 竖着的菱形（设定图：和头差不多高的尖菱形）
#   网格：尾杆末端一圈 6 个点（x -0.137）→ 尾锤最宽一圈 6 个点（x≈-0.18：顶、两个上侧、两个侧、底）→ 尾尖 7 个点的小帽（x -0.246）
#   最宽那圈按方向角摆到一个菱形截面上（半高 CLUB_H、半宽 CLUB_W；顶 / 底 / 侧吸附到正方向），尾尖收到 CLUB_TIP_X、中心高度
# v3：旧面全删，从尾杆末端那一圈（x -0.137，6 个点）往后接新的八面体菱形（firemodels_lib.rebuild_club）
CLUB_O = Vector((-0.137, 0.0, -0.07))   # 尾锤轴的起点（尾杆末端那一圈附近），轴朝 -X
CLUB_X0 = -0.16                    # x < CLUB_X0 的顶点属于尾锤（权重全给 tail6，刚体）
CLUB_CUT = 0.01                    # 删掉有顶点 x < -0.147 的面（旧尾锤）
CLUB_MID, CLUB_TIP = 0.038, 0.088  # 最宽一圈 / 尾尖离尾杆末端多远（设定图：尾锤长约 12% 体长）
CLUB_H, CLUB_W = 0.055, 0.028      # 菱形截面半高 / 半宽 → 约 0.11 高 × 0.056 宽（v2 0.13 × 0.06，追尾镜头里太占地方）
CLUB_VM = 0.32                     # 展开贴图里前半（对着尾巴、很少看到）只占 32%，背面（追尾镜头正对着）占 68%
# 背上那排大刺：中线（|y|<BACK_Y0）上、比背线高出 BACK_BASE 以上的部分 ×SPIKE_K；|y| 到 BACK_Y1 渐变回 1
#   背线 = 不算刺的背脊高度（侧视量的，.cache/check/firemodels/v3/baby_back_rest.png），尾根 x 0.03 到肩 x 0.272
BACK_LINE = [(0.03, -0.019), (0.06, -0.010), (0.08, 0.003), (0.10, 0.009), (0.12, 0.016), (0.15, 0.022), (0.18, 0.028),
             (0.20, 0.034), (0.22, 0.042), (0.25, 0.050), (0.28, 0.058)]
BACK_X1, BACK_BASE, BACK_Y0, BACK_Y1 = 0.272, 0.003, 0.010, 0.018
SHAFT = [(0.04, 1.0), (0.0, 0.78), (-0.15, 0.78), (-0.15001, 1.0)]   # 尾杆再缩：x → dx'/dx 的折线（尾锤 x<-0.15 整块平移）
TRI_MAX = 4900
# ===================================================================

def shaft_f(x):
    if x >= SHAFT[0][0]: return SHAFT[0][1]
    if x <= SHAFT[-1][0]: return SHAFT[-1][1]
    for (xa, fa), (xb, fb) in zip(SHAFT, SHAFT[1:]):
        if xb <= x <= xa: return fb + (fa - fb) * (x - xb) / (xa - xb)
def shaft_map(x):
    x0 = SHAFT[0][0]
    if x >= x0: return x
    acc, prev = 0.0, x0
    for q in [k[0] for k in SHAFT[1:] if k[0] > x] + [x]:
        acc += (prev - q) * (shaft_f(prev - 1e-9) + shaft_f(q + 1e-9)) / 2; prev = q
    return x0 - acc
def tail_line_z(x):
    for n, h, t, p in SPINE:
        if n.startswith('tail') and min(h[0], t[0]) <= x <= max(h[0], t[0]):
            return h[2] + (t[2] - h[2]) * (x - h[0]) / (t[0] - h[0])
    return None

def back_z(x):
    for (xa, za), (xb, zb) in zip(BACK_LINE, BACK_LINE[1:]):
        if xa <= x <= xb: return za + (zb - za) * (x - xa) / (xb - xa)
    return None
def smooth01(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)

# ---------- v2/v3：焊接 → 尾背刺 / 背刺压低 → 尾锤重做 → 尾杆再缩 → 减面 ----------
if not os.environ.get('FM_NOWELD'): print('WELD', FL.weld(mesh))
me = mesh.data; n_sp = n_back = 0
for v in me.vertices:
    p = v.co
    if CLUB_X0 < p.x < 0.03 and abs(p.y) < 0.012:
        lz = tail_line_z(p.x)
        if lz is not None and p.z - lz > SPIKE_BASE:
            p.z = lz + SPIKE_BASE + (p.z - lz - SPIKE_BASE) * SPIKE_K; n_sp += 1
    elif 0.03 <= p.x <= BACK_X1 and abs(p.y) < BACK_Y1:
        bz = back_z(p.x)
        if p.z - bz > BACK_BASE:
            k = SPIKE_K + (1 - SPIKE_K) * smooth01(BACK_Y0, BACK_Y1, abs(p.y))
            p.z = bz + BACK_BASE + (p.z - bz - BACK_BASE) * k; n_back += 1
me.update()
CLUB = FL.rebuild_club(mesh, CLUB_O, (-1, 0, 0), CLUB_CUT, CLUB_MID, CLUB_TIP, CLUB_H, CLUB_W, vm=CLUB_VM)
print('CLUB', CLUB)
# tail6（尾锤骨）指向新尾尖：飞行尾巴的侧视目标角按骨头方向解，骨头要和尾锤的轴一致
_cx, _cy, _cz = CLUB['center']
SPINE = [(n, h, (_cx - (CLUB_TIP - CLUB_MID), 0.0, _cz) if n == 'tail6' else t, p) for n, h, t, p in SPINE]
for v in me.vertices: v.co.x = shaft_map(v.co.x)
me.update()
print('SPIKES lowered tail', n_sp, 'back', n_back, 'shaft shift', round(shaft_map(-0.2) + 0.2, 4))
SPINE = [(n, (shaft_map(h[0]), h[1], h[2]), (shaft_map(t[0]), t[1], t[2]), p) if n.startswith('tail') else (n, h, t, p) for n, h, t, p in SPINE]
def dec_w(p):   # 1 = 可以减面；脸、翅膀、爪子、尾锤不动
    ay = abs(p.y)
    if p.x < shaft_map(-0.14): return 0.0
    if p.x > 0.40 and p.z > 0.03 and ay < 0.125: return 0.0
    if ay > WING_Y and p.z > WING_Z and p.x > WING_X: return 0.0
    if p.z < -0.17: return 0.0
    return 1.0
if not os.environ.get('FM_NODEC'): print('DECIMATE', FL.decimate_group(mesh, dec_w, TRI_MAX))

BONES = list(SPINE)
for sfx, sg in (('.L', 1), ('.R', -1)):
    for n, h, t, p in SIDE:
        BONES.append((n + sfx, (h[0], h[1] * sg, h[2]), (t[0], t[1] * sg, t[2]), p if p in ('chest', 'hips') else p + sfx))

# ---------- 权重：到骨头线段的距离，按部位限定候选骨 ----------
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
CORE = ['hips', 'spine', 'chest', 'neck1', 'neck2', 'head'] + [f'tail{i}' for i in range(1, 7)]
def dist(p, n):
    a, b = segs[n]; q, f = intersect_point_line(p, a, b); f = max(0, min(1, f))
    return (p - (a + (b - a) * f)).length
groups = {n: mesh.vertex_groups.new(name=n) for n, *_ in BONES}
stats = {}
for v in mesh.data.vertices:
    p = v.co; s = '.L' if p.y >= 0 else '.R'
    cand = candidates(p, s)
    if p.x < shaft_map(CLUB_X0): cand = ['tail6']          # 尾锤整块跟 tail6 走（刚体）
    ds = sorted((dist(p, n), n) for n in cand)[:3]
    soft = all(n in CORE for _, n in ds)
    ws = [((1.0 / (d * d + 1e-5)) if soft else (1.0 / (d * d + 1e-5) ** 2), n) for d, n in ds]
    tot = sum(w for w, _ in ws)
    for w, n in ws:
        if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
    top = max(ws)[1]; stats[top] = stats.get(top, 0) + 1
print('DOMINANT', sorted(stats.items()))
# 后膝折痕：hleg1/hleg2 权重平滑 2 次
for sfx in ('.L', '.R'): print('KNEE smooth', sfx, FL.smooth_weights(mesh, ['hleg1' + sfx, 'hleg2' + sfx], 2))

# ---------- v2：按权重改静止形状（头放大、翅膀缩小），骨头一起变 ----------
XF = {'head': FL.uni_scale(segs['head'][0], HEAD_S)}
for sfx in ('.L', '.R'):
    for n in ('wing1', 'wing2', 'fing1', 'fing2', 'fing3'): XF[n + sfx] = FL.uni_scale(segs['wing1' + sfx][0], WING_S)
FL.lbs_reshape(mesh, XF)
BONES = [(n, tuple(XF[n](Vector(h))) if n in XF else h, tuple(XF[n](Vector(t))) if n in XF else t, p) for n, h, t, p in BONES]
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
FL.limit_normalize(mesh, 4)
FL.smooth_normals(mesh)
print('TRIS', FL.tris(mesh), 'VERTS', len(mesh.data.vertices))

arm_data = bpy.data.armatures.new('DragonRig'); arm = bpy.data.objects.new('DragonRig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
for n, h, t, p in BONES:
    b = arm_data.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t); b.roll = 0
for n, h, t, p in BONES:
    if p: arm_data.edit_bones[n].parent = arm_data.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT')
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
mesh.parent = arm

# ---------- 动画 ----------
arm.rotation_mode = 'XYZ'
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
pbs = arm.pose.bones
for pb in pbs: pb.rotation_mode = 'QUATERNION'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def q_arm(name, axis, ang):
    M = pbs[name].bone.matrix_local.to_3x3()
    return Quaternion((M.inverted() @ axis).normalized(), ang)
def pose(spec):
    for pb in pbs: pb.rotation_quaternion = Quaternion()
    for name, rots in spec.items():
        q = Quaternion()
        for axis, ang in rots: q = q_arm(name, axis, ang) @ q
        pbs[name].rotation_quaternion = q
def key_all(f):
    for pb in pbs: pb.keyframe_insert('rotation_quaternion', frame=f)

def wing_spec(sfx, up, sweep, lag1, lag2, fold=0.0):
    sg = 1 if sfx == '.L' else -1
    return {
        'wing1' + sfx: [(X, sg * up), (Z, sg * sweep)],
        'wing2' + sfx: [(X, sg * lag1), (Z, sg * fold * 0.6)],
        'fing1' + sfx: [(X, sg * lag2), (Z, sg * fold)],
        'fing2' + sfx: [(X, sg * lag2), (Z, sg * fold * 1.2)],
        'fing3' + sfx: [(X, sg * lag2 * .8), (Z, sg * fold * 1.4)],
    }

# 飞行收腿：目标是侧视朝向角（度，0=朝前，-90=朝下，±180=朝后），取自成龙定稿（pose_report 实测，未叠扇翅摆动和手指呼吸）
#   前腿 上臂 -110 / 前臂 -40 / 手掌 -70 / 手指 -145  → 肘弯 70、腕垂 30、指蜷 75
#   后腿 大腿 -75 / 小腿 -165 / 脚掌 -110 / 脚趾 -147 → 膝弯 90、踝 55、趾 37
#   尾巴 6 节往后上方翘 8..20 度
def side_ang(n):
    h, t = segs[n]; d = t - h
    return math.degrees(math.atan2(d.z, d.x))
def wrap(a): return (a + 180) % 360 - 180
def solve_chain(chain, targets):
    """给每节的侧视目标角，反算绕 Y 轴的转动量（弧度）。父骨（chest/hips）在 TUCK 里不转"""
    out = {}; prev = 0.0
    for n, tg in zip(chain, targets):
        cum = wrap(side_ang(n) - tg)
        out[n] = math.radians(wrap(cum - prev)); prev = cum
    return out
TUCK = {}
for sfx in ('.L', '.R'):
    for n, r in solve_chain(['farm1' + sfx, 'farm2' + sfx, 'fpaw' + sfx, 'ftoe' + sfx], ARM_TARGET).items(): TUCK[n] = [(Y, r)]
    for n, r in solve_chain(['hleg1' + sfx, 'hleg2' + sfx, 'hfoot' + sfx, 'htoe' + sfx], LEG_TARGET).items(): TUCK[n] = [(Y, r)]
for n, r in solve_chain([f'tail{i}' for i in range(1, 7)], TAIL_TARGET).items(): TUCK[n] = [(Y, r)]
for n, r in NECK_TUCK.items(): TUCK[n] = [(Y, r)]
print('TUCK', {k: round(v[0][1], 3) for k, v in TUCK.items() if not k.endswith('.R')})

def merge(*specs):
    out = {}
    for sp in specs:
        for k, v in sp.items(): out[k] = out.get(k, []) + v
    return out

actions = []
def make_action(name, frames, fn):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f in range(frames + 1):
        pose(fn(f / frames)); key_all(f)          # 从第 0 帧开始 key，首尾同姿势，无缝循环
    actions.append((name, act, frames))

TW = 2 * math.pi
def paw_breath(sp, br):
    for sfx in ('.L', '.R'):
        sp['fpaw' + sfx].append((Y, 0.05 * math.sin(br)))
        sp['ftoe' + sfx].append((Y, 0.16 * math.sin(br - 0.6)))

def fly(t):
    ph = TW * FLAPS * t; br = TW * t          # FLAPS 下扇 / 3 秒，手指呼吸 3 秒一次
    up = FLY_UP0 + FLY_AMP * math.sin(ph)
    w = lambda sfx: wing_spec(sfx, up, 0.15 * math.cos(ph), 0.35 * math.sin(ph - 0.8), 0.28 * math.sin(ph - 1.5), FOLD * max(0, math.cos(ph)))
    sp = merge(TUCK, w('.L'), w('.R'))
    for i in range(1, 7): sp.setdefault(f'tail{i}', []).append((Z, 0.07 * math.sin(ph - i * 0.6)))
    sp.setdefault('neck2', []).append((Y, -0.05 * math.sin(ph - 0.5)))
    for sfx in ('.L', '.R'):
        sp['farm1' + sfx].append((Y, 0.08 * math.sin(ph - 1.0)))
        sp['hleg1' + sfx].append((Y, 0.07 * math.sin(ph - 1.6)))
    paw_breath(sp, br)
    return sp
def glide(t):
    ph = TW * t
    up = GLIDE_UP0 + 0.04 * math.sin(ph)
    w = lambda sfx: wing_spec(sfx, up, -0.05, 0.05, 0.08 + 0.03 * math.sin(ph * 2), 0)
    sp = merge(TUCK, w('.L'), w('.R'))
    for i in range(1, 7): sp.setdefault(f'tail{i}', []).append((Z, 0.05 * math.sin(ph - i * 0.5)))
    paw_breath(sp, ph)
    return sp
def idle(t):
    ph = TW * t
    w = lambda sfx: wing_spec(sfx, 0.04 * math.sin(ph), 0, 0.03 * math.sin(ph - .5), 0.03 * math.sin(ph - 1), 0)
    sp = merge(w('.L'), w('.R'))
    sp['chest'] = [(Y, 0.02 * math.sin(ph))]
    sp['neck1'] = [(Z, 0.06 * math.sin(ph))]; sp['neck2'] = [(Y, 0.03 * math.sin(ph * 2))]
    sp['head'] = [(Z, 0.1 * math.sin(ph - 0.6))]
    for i in range(1, 7): sp[f'tail{i}'] = [(Z, 0.06 * math.sin(ph - i * 0.5))]
    return sp
make_action('Fly', 72, fly)
make_action('Glide', 48, glide)
make_action('Idle', 72, idle)
for name, act, frames in actions:
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, 0, act)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')
sc = bpy.context.scene; sc.frame_start = 0; sc.frame_end = 72; sc.render.fps = 24

# ---------- 预览 ----------
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x, sc.render.resolution_y = 640, 480
sc.world = bpy.data.worlds.new('w')
cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.lens = 50; cam.location = (1.15, -1.25, 0.55)
cam.rotation_euler = (math.radians(70), 0, math.radians(42))
for name, act, frames in actions:
    for tr in arm.animation_data.nla_tracks: tr.mute = tr.name != name
    for f in (0, frames // 4, frames // 2, 3 * frames // 4):
        sc.frame_set(f); sc.render.filepath = os.path.join(PREV, f'{name}_{f:02d}.png'); bpy.ops.render.render(write_still=True)
for tr in arm.animation_data.nla_tracks: tr.mute = False
bpy.data.objects.remove(cam)

# ---------- 材质：只留底色贴图 ----------
for mat in bpy.data.materials:
    if not mat.use_nodes: continue
    nt = mat.node_tree
    bsdf = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if not bsdf: continue
    keep = set()
    for l in nt.links:
        if l.to_node == bsdf and l.to_socket.name == 'Base Color': keep.add(l.from_node)
    for inp in ('Metallic', 'Roughness', 'Normal'):
        for l in list(bsdf.inputs[inp].links): nt.links.remove(l)
    for n in list(nt.nodes):
        if n.type in ('TEX_IMAGE', 'NORMAL_MAP', 'SEPARATE_COLOR', 'SEPRGB') and n not in keep: nt.nodes.remove(n)
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.8
for img in list(bpy.data.images):
    if img.users == 0: bpy.data.images.remove(img)

# ---------- v3：尾锤贴图（在图集空地上画深色玄武岩 + 发光熔岩裂纹，尾锤的 UV 放进去） ----------
base_img = next(i for i in bpy.data.images if i.size[0] > 0)
print('CLUBTEX', FL.club_texture(mesh, base_img, aspect=2 * math.hypot(CLUB_H, CLUB_W) / CLUB_TIP, seed=7, vm=CLUB_VM))

# ---------- 贴图缩到 1024，导出 ----------
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
    if img.size[0] > 0 and img.is_dirty: img.pack()   # 改过的像素（缩小、尾锤贴图）打包进 .blend，不然 .blend 里还是导入时的原图
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_image_format='WEBP', export_image_quality=85, export_yup=True)
size = FL.bake_quantize(OUT_GLB)

# ---------- 清单（静止姿势，Blender 坐标） ----------
gi = {g.index: g.name for g in mesh.vertex_groups}
V = [v.co.copy() for v in mesh.data.vertices]
HW = [sum(g.weight for g in v.groups if gi[g.group] == 'head') for v in mesh.data.vertices]
xs = [p.x for p in V]
head_pts = [p for p, w in zip(V, HW) if w > 0.5 and abs(p.y) < 0.03]
xmax = max(p.x for p in head_pts)
front = [p for p in head_pts if p.x > xmax - 0.012]
mouth = (round(xmax - 0.004, 3), 0.0, round(sum(p.z for p in front) / len(front), 3))
hx = (segs['hips'][0].x + segs['chest'][1].x) / 2
def spine_z(x):
    for n in ('hips', 'spine', 'chest'):
        a, b = segs[n]
        if min(a.x, b.x) <= x <= max(a.x, b.x): return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x)
pivot = (round(hx, 3), 0.0, round(spine_z(hx), 3))
L = max(xs) - min(xs); span = max(p.y for p in V) - min(p.y for p in V)
head_len = xmax - segs['head'][0].x
if MANIFEST:
    man = {
        'file': 'models/' + os.path.basename(OUT_GLB), 'kind': 'fire', 'stage': 'baby',
        'length': round(L, 3), 'pivot': list(pivot), 'mouth': list(mouth), 'headBone': 'head',
        'neckBones': ['neck1', 'neck2', 'head'], 'tailBones': [f'tail{i}' for i in range(1, 7)],
        'wingBones': {'L': ['wing1.L', 'wing2.L', 'fing1.L'], 'R': ['wing1.R', 'wing2.R', 'fing1.R']},
        'actions': {name: round(frames / 24, 3) for name, act, frames in actions},
        'flapHz': round(FLAPS / 3, 3),
        'tris': FL.tris(mesh), 'bones': len(BONES), 'bytes': size,
        'extents': {'x': [round(min(xs), 3), round(max(xs), 3)], 'y': [round(min(p.y for p in V), 3), round(max(p.y for p in V), 3)],
                    'z': [round(min(p.z for p in V), 3), round(max(p.z for p in V), 3)], 'wingspan': round(span, 3)},
        'notes': (
            "Blender rest coords (head +X, up +Z, +Y = dragon's left). v2 (2026-10-10, review_fire_baby.md): head x1.2, wings x0.85, "
            f"tail shaft shortened again (club moved rigidly). v3 (2026-10-11): club replaced by a clean upright octahedral crystal (~{2 * CLUB_H:.2f} tall x {2 * CLUB_W:.2f} wide, "
            f"its own painted basalt + glowing lava-crack patch in a free spot of the atlas), ridge spikes from the tail to the shoulders x{SPIKE_K}, "
            f"decimated to {FL.tris(mesh)} tris (neck/back/body only; face, wings, claws untouched), vertices welded + smooth normals, "
            "KHR_mesh_quantization (POSITION short, NORMAL byte, UV ushort, WEIGHTS ubyte, rotation keys short; constant translation/scale channels removed; "
            "three.js GLTFLoader reads it natively). "
            f"Nose-to-tail {L:.3f}, head {head_len:.3f} ({head_len / L * 100:.0f}%), wingspan {span:.3f} ({span / L:.2f} x length; adult 1.07). "
            f"Fly = {FLAPS} flaps per 3 s loop ({FLAPS / 3:.2f} Hz; adult/teen 1 Hz) - sim flap sound events should use flapHz; finger breathing once per 3 s. "
            "Glide 2 s, Idle 3 s; keys start at frame 0, first key == last key. Pose (pose_report): front leg = human arm like the approved adult "
            f"(elbow 70, wrist 30, loose fist, 3 s finger breathing; upper arm more vertical ({ARM_TARGET[0]:.0f} vs adult -110) so the short thick baby legs read as tucked), "
            f"knee 90, neck at rest, flight tail raised {180 - TAIL_TARGET[0]:.0f}..{180 - TAIL_TARGET[-1]:.0f} deg back-up like the adult. "
            "Same 38 bones as fire_adult (GLTFLoader strips the dot: wing1.L -> wing1L). No jaw bone. Only the base-colour texture (1024 WEBP q85)."),
    }
    json.dump(man, open(MANIFEST, 'w'), indent=2)
print('MANIFEST_NUMBERS', json.dumps({'mouth': mouth, 'pivot': pivot, 'tris': FL.tris(mesh), 'len': round(L, 3), 'head': round(head_len, 3),
      'span': round(span, 3), 'bytes': size}))
print('DONE bones', len(BONES), 'actions', [a[0] for a in actions], 'images', [i.name for i in bpy.data.images])
