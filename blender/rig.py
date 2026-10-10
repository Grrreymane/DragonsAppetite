# 给 Tripo 生成的龙绑骨骼 + 做动画 + 导出网页用 glb
# blender -b --factory-startup -P rig.py -- <in.glb> <out.glb> <out.blend> <preview_dir>
# 坐标（Blender）：+X 朝前（头），+Y 朝左，+Z 朝上
import bpy, sys, os, math
from mathutils import Vector, Quaternion, Matrix
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT_GLB, OUT_BLEND, PREV = argv[0], argv[1], argv[2], argv[3]
os.makedirs(PREV, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
# 去掉父级空物体，把变换应用到顶点上
mw = mesh.matrix_world.copy(); mesh.parent = None; mesh.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh.name = 'FireDragon'

# ---------- 骨架（左侧写一份，右侧镜像） ----------
SPINE = [
    ('hips', (0.03, 0, -0.085), (0.12, 0, -0.068), None),
    ('spine', (0.12, 0, -0.068), (0.21, 0, -0.045), 'hips'),
    ('chest', (0.21, 0, -0.045), (0.29, 0, -0.02), 'spine'),
    ('neck1', (0.29, 0, -0.02), (0.33, 0, 0.02), 'chest'),
    ('neck2', (0.33, 0, 0.02), (0.37, 0, 0.06), 'neck1'),
    ('head', (0.37, 0, 0.06), (0.47, 0, 0.06), 'neck2'),
    ('tail1', (0.03, 0, -0.085), (-0.05, 0, -0.115), 'hips'),
    ('tail2', (-0.05, 0, -0.115), (-0.13, 0, -0.135), 'tail1'),
    ('tail3', (-0.13, 0, -0.135), (-0.21, 0, -0.139), 'tail2'),
    ('tail4', (-0.21, 0, -0.139), (-0.29, 0, -0.133), 'tail3'),
    ('tail5', (-0.29, 0, -0.133), (-0.36, 0, -0.113), 'tail4'),
    ('tail6', (-0.36, 0, -0.113), (-0.47, 0, -0.045), 'tail5'),
]
SIDE = [
    ('farm1', (0.29, 0.055, -0.07), (0.28, 0.055, -0.14), 'chest'),
    ('farm2', (0.28, 0.055, -0.14), (0.30, 0.048, -0.195), 'farm1'),
    ('fpaw', (0.30, 0.048, -0.195), (0.325, 0.046, -0.215), 'farm2'),
    ('ftoe', (0.325, 0.046, -0.215), (0.358, 0.045, -0.228), 'fpaw'),
    ('hleg1', (0.10, 0.04, -0.085), (0.125, 0.045, -0.145), 'hips'),
    ('hleg2', (0.125, 0.045, -0.145), (0.075, 0.035, -0.19), 'hleg1'),
    ('hfoot', (0.075, 0.035, -0.19), (0.105, 0.045, -0.215), 'hleg2'),
    ('htoe', (0.105, 0.045, -0.215), (0.142, 0.05, -0.228), 'hfoot'),
    ('wing1', (0.235, 0.07, 0.0), (0.24, 0.115, 0.10), 'chest'),
    ('wing2', (0.24, 0.115, 0.10), (0.33, 0.15, 0.18), 'wing1'),
    ('fing1', (0.33, 0.15, 0.18), (0.22, 0.48, 0.22), 'wing2'),
    ('fing2', (0.33, 0.15, 0.18), (0.16, 0.40, 0.12), 'wing2'),
    ('fing3', (0.33, 0.15, 0.18), (0.17, 0.29, 0.05), 'wing2'),
]
BONES = list(SPINE)
for sfx, sg in (('.L', 1), ('.R', -1)):
    for n, h, t, p in SIDE:
        BONES.append((n + sfx, (h[0], h[1] * sg, h[2]), (t[0], t[1] * sg, t[2]), p if p in ('chest', 'hips') else p + sfx))

arm_data = bpy.data.armatures.new('DragonRig'); arm = bpy.data.objects.new('DragonRig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
for n, h, t, p in BONES:
    b = arm_data.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t)
    b.roll = 0
for n, h, t, p in BONES:
    if p: arm_data.edit_bones[n].parent = arm_data.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 权重：离骨头越近权重越大，按部位限定能影响它的骨头 ----------
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
CORE = ['hips', 'spine', 'chest', 'neck1', 'neck2', 'head'] + [f'tail{i}' for i in range(1, 7)]
def dist(p, n):
    a, b = segs[n]; q, f = intersect_point_line(p, a, b); f = max(0, min(1, f))
    return (p - (a + (b - a) * f)).length
groups = {n: mesh.vertex_groups.new(name=n) for n, *_ in BONES}
for v in mesh.data.vertices:
    p = v.co; ay = abs(p.y); s = '.L' if p.y >= 0 else '.R'
    if p.x > 0.355 and ay < 0.11 and p.z > -0.06:
        cand = ['head', 'neck2']                                   # 头和角
    elif ay > 0.085 and p.z > -0.055 and not (p.x > 0.37 and ay < 0.11):
        cand = ['wing1' + s, 'wing2' + s, 'fing1' + s, 'fing2' + s, 'fing3' + s] + (['chest'] if ay < 0.11 else [])
    else:
        cand = list(CORE)
        if p.z < -0.075 and ay > 0.012:
            cand += ['farm1' + s, 'farm2' + s, 'fpaw' + s, 'ftoe' + s] if p.x > 0.215 else ['hleg1' + s, 'hleg2' + s, 'hfoot' + s, 'htoe' + s] if p.x > -0.01 else []
        if ay > 0.06 and p.z > -0.06: cand += ['wing1' + s]
    ds = sorted((dist(p, n), n) for n in cand)[:3]
    soft = all(n in CORE for _, n in ds)
    ws = [((1.0 / (d * d + 1e-5)) if soft else (1.0 / (d * d + 1e-5) ** 2), n) for d, n in ds]
    tot = sum(w for w, _ in ws)
    for w, n in ws:
        if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
mesh.parent = arm

# ---------- 动画 ----------
arm.rotation_mode = 'XYZ'
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
pbs = arm.pose.bones
for pb in pbs: pb.rotation_mode = 'QUATERNION'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def q_arm(name, axis, ang):
    """绕骨架空间的轴转 ang（弧度），换算成骨头自己的局部旋转"""
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
TUCK = {  # 飞行时收腿、伸直脖子和尾巴
    # 像人的胳膊：上臂朝下稍往后、肘弯约 70°（前臂比水平往下 43°）、手腕只垂 30°、手指往回握成松拳，爪尖朝后
    # 后腿：大腿朝下、膝盖弯 90° 让小腿往后、脚掌自然下垂、脚趾蜷起
    'farm1.L': [(Y, 0.21)], 'farm2.L': [(Y, -0.73)], 'fpaw.L': [(Y, 1.07)], 'ftoe.L': [(Y, 1.61)],
    'farm1.R': [(Y, 0.21)], 'farm2.R': [(Y, -0.73)], 'fpaw.R': [(Y, 1.07)], 'ftoe.R': [(Y, 1.61)],
    'hleg1.L': [(Y, 0.14)], 'hleg2.L': [(Y, 0.33)], 'hfoot.L': [(Y, 0.75)], 'htoe.L': [(Y, 1.0)],
    'hleg1.R': [(Y, 0.14)], 'hleg2.R': [(Y, 0.33)], 'hfoot.R': [(Y, 0.75)], 'htoe.R': [(Y, 1.0)],
    # 脖子基本保持站立时的形状（参考图里飞行时脖子也是往前上方伸、头放平），只压低一点
    'neck1': [(Y, 0.1)], 'neck2': [(Y, 0.06)], 'head': [(Y, -0.12)],
    # 尾巴：站立时是先往下垂再翘起；飞行时往后上方翘起 8°~20°，从后面追拍时不会垂在肚子下面
    'tail1': [(Y, 0.507)], 'tail2': [(Y, -0.053)], 'tail3': [(Y, -0.143)], 'tail4': [(Y, -0.09)], 'tail5': [(Y, -0.177)], 'tail6': [(Y, -0.242)],
}
def merge(*specs):
    out = {}
    for sp in specs:
        for k, v in sp.items(): out[k] = out.get(k, []) + v
    return out

actions = []
def make_action(name, frames, fn):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f in range(frames + 1):
        pose(fn(f / frames)); key_all(f + 1)
    actions.append((name, act, frames))

TW = 2 * math.pi
def paw_breath(sp, br):
    # 前爪手指慢慢松开、握紧，像在呼吸
    for sfx in ('.L', '.R'):
        sp['fpaw' + sfx].append((Y, 0.05 * math.sin(br)))
        sp['ftoe' + sfx].append((Y, 0.16 * math.sin(br - 0.6)))

def fly(t):
    ph = TW * 3 * t; br = TW * t
    up = -0.35 + 0.8 * math.sin(ph)
    sp = merge(TUCK,
               wing_spec('.L', up, 0.15 * math.cos(ph), 0.35 * math.sin(ph - 0.8), 0.28 * math.sin(ph - 1.5), 0.25 * max(0, math.cos(ph))),
               wing_spec('.R', up, 0.15 * math.cos(ph), 0.35 * math.sin(ph - 0.8), 0.28 * math.sin(ph - 1.5), 0.25 * max(0, math.cos(ph))))
    for i in range(1, 7): sp.setdefault(f'tail{i}', []).append((Z, 0.07 * math.sin(ph - i * 0.6)))
    sp.setdefault('neck2', []).append((Y, -0.05 * math.sin(ph - 0.5)))
    for sfx in ('.L', '.R'):
        sp['farm1' + sfx].append((Y, 0.08 * math.sin(ph - 1.0)))
        sp['hleg1' + sfx].append((Y, 0.07 * math.sin(ph - 1.6)))
    paw_breath(sp, br)
    return sp
def glide(t):
    ph = TW * t
    up = -0.52 + 0.04 * math.sin(ph)
    sp = merge(TUCK, wing_spec('.L', up, -0.05, 0.05, 0.08 + 0.03 * math.sin(ph * 2), 0), wing_spec('.R', up, -0.05, 0.05, 0.08 + 0.03 * math.sin(ph * 2), 0))
    for i in range(1, 7): sp.setdefault(f'tail{i}', []).append((Z, 0.05 * math.sin(ph - i * 0.5)))
    paw_breath(sp, ph)
    return sp
def idle(t):
    ph = TW * t
    sp = merge(wing_spec('.L', 0.04 * math.sin(ph), 0, 0.03 * math.sin(ph - .5), 0.03 * math.sin(ph - 1), 0),
               wing_spec('.R', 0.04 * math.sin(ph), 0, 0.03 * math.sin(ph - .5), 0.03 * math.sin(ph - 1), 0))
    sp['chest'] = [(Y, 0.02 * math.sin(ph))]
    sp['neck1'] = [(Z, 0.06 * math.sin(ph))]; sp['neck2'] = [(Y, 0.03 * math.sin(ph * 2))]
    sp['head'] = [(Z, 0.1 * math.sin(ph - 0.6))]
    for i in range(1, 7): sp[f'tail{i}'] = [(Z, 0.06 * math.sin(ph - i * 0.5))]
    return sp
make_action('Fly', 72, fly)
make_action('Glide', 48, glide)
make_action('Idle', 72, idle)
# 每个动作放进自己的 NLA 轨道，导出时一条轨道 = 一段动画
for name, act, frames in actions:
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    tr.strips.new(name, 1, act)
arm.animation_data.action = None
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- 预览：每个动作渲染几帧 ----------
sc = bpy.context.scene; sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x, sc.render.resolution_y = 640, 480
sc.world = bpy.data.worlds.new('w')
cd = bpy.data.cameras.new('c'); cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
cd.lens = 50; cam.location = (1.15, -1.25, 0.55)
cam.rotation_euler = (math.radians(70), 0, math.radians(42))
for name, act, frames in actions:
    for tr in arm.animation_data.nla_tracks: tr.mute = tr.name != name
    for f in (1, 1 + frames // 4, 1 + frames // 2, 1 + 3 * frames // 4):
        sc.frame_set(f); sc.render.filepath = os.path.join(PREV, f'{name}_{f:02d}.png'); bpy.ops.render.render(write_still=True)
for tr in arm.animation_data.nla_tracks: tr.mute = False

# ---------- 贴图缩到 1024，导出 ----------
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_image_format='WEBP', export_image_quality=85, export_yup=True)
print('DONE bones', len(BONES), 'actions', [a[0] for a in actions])
