# 海龙（无翼、长蛇身、四短腿、背鳍、扇形尾鳍）通用绑定脚本：骨骼 + 权重 + 动作 + 检查图 + 导出 glb + 写清单
# 幼龙 / 少年龙 / 成龙共用，只换 blender/rigs/<name>.json（骨骼坐标、分区阈值、动作参数）
#
#   blender -b --factory-startup -P rig_sea.py -- <rigs/xxx.json> [--no-export] [--no-check]
#
# 输出（<name> 取自 json）：
#   models/<name>_anim.glb   models/<name>.json（游戏清单）   blender/<name>_rig.blend
#   .cache/check/<name>/  rest_bones_*.png  weights_*.png  swim_top_4phase.png  ...
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
LEG_PARENT = {'front': cfg['side'][0][3], 'hind': cfg['side'][4][3]}
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
def pose(spec, root_loc=(0, 0, 0)):
    for pb in pbs: pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0)
    for name, rots in spec.items():
        q = Quaternion()
        for axis, ang in rots: q = q_arm(name, AX[axis] if isinstance(axis, str) else axis, ang) @ q
        pbs[name].rotation_quaternion = q
    pbs[ROOT_BONE].location = M_ROOT.inverted() @ Vector(root_loc)
def key_all(f):
    for pb in pbs: pb.keyframe_insert('rotation_quaternion', frame=f)
    pbs[ROOT_BONE].keyframe_insert('location', frame=f)
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
    spec = {n: [('Z', a)] for n, a in rots.items()}
    spec[ROOT_BONE] = spec.get(ROOT_BONE, []) + [('Z', phi)]
    return spec, (0.0, ty, 0.0)
def legs_spec(kind, ph, paddle, extra=0.0):
    base = cfg['poses'][kind]; sp = {}
    for sfx, sg in (('.L', 1), ('.R', -1)):
        side_ph = ph + (0 if sg > 0 else math.pi)            # 左右反相
        for n, rots in base.items():
            sp[n + sfx] = [(a, v * (sg if a == 'X' else 1)) for a, v in rots]
        sp['farm1' + sfx].append(('Y', extra + paddle * math.sin(side_ph)))
        sp['fpaw' + sfx].append(('Y', 0.6 * paddle * math.sin(side_ph - 0.7)))
        sp['hleg1' + sfx].append(('Y', extra + paddle * math.sin(side_ph + 1.2)))
        sp['hfoot' + sfx].append(('Y', 0.6 * paddle * math.sin(side_ph + 0.5)))
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
        pose(sp, loc); key_all(f)
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
for img in list(bpy.data.images):
    if img.users == 0: bpy.data.images.remove(img)
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
print('IMAGES', [(i.name, tuple(i.size)) for i in bpy.data.images])

sc.frame_set(0)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
ACTS = [(name, frames) for name, act, frames in actions]
if not NO_EXPORT:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                              export_skins=True, export_image_format='WEBP', export_image_quality=85, export_yup=True)

# ---------- 清单 ----------
if not NO_EXPORT:
    tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)
    M = cfg.get('manifest', {})
    xs = [v.co.x for v in mesh.data.vertices]
    man = {
        'file': f'models/{NAME}_anim.glb', 'kind': cfg['kind'], 'stage': cfg['stage'],
        'length': round(max(xs) - min(xs), 4), 'pivot': M['pivot'], 'mouth': M['mouth'], 'headBone': 'head',
        'neckBones': [n for n, *_ in SPINE if n.startswith('neck')],
        'tailBones': [n for n, *_ in SPINE if n.startswith('tail')] + (['fan'] if 'fan' in CORE_SET else []),
        'spineBones': [n for n, *_ in SPINE if n == 'hips' or n.startswith('spine') or n == 'chest'],
        'actions': {name: round(frames / sc.render.fps, 4) for name, act, frames in actions},
        'tris': tris, 'bones': len(BONES), 'bytes': os.path.getsize(OUT_GLB),
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
    solo(None); sc.frame_set(0); REST_B = read_bones(); ACT_B = {}
    for name, frames in ACTS:
        solo(name); goto(0); ACT_B[name] = read_bones()
        print('OVERLAY', name, [(round(h[0], 3), round(h[1], 3), round(t[0], 3), round(t[1], 3)) for h, t, n in ACT_B[name] if n == 'fan'])
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
