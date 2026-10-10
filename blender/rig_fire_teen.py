# Fire dragon TEEN: rig + weights + Fly/Glide/Idle + web glb export (adapted from rig.py, adult)
# blender -b --factory-startup -P rig_fire_teen.py -- <in.glb> <out.glb> <out.blend> <check_dir> [manifest.json]
#   add "--bones-only" as the last arg to just dump <check_dir>/bones.json (for overlay renders) and quit
# Coordinates (Blender, after import): +X forward (head), +Y = dragon's LEFT, +Z up. Model length ~1.0.
# Every coordinate / threshold below was measured on THIS mesh (Tripo P1, face-limit 6500) with
# render_views.py + zoomed ortho grids + analyze.py; the adult's numbers in rig.py do not apply.
import bpy, sys, os, math, json
from mathutils import Vector, Quaternion
from mathutils.geometry import intersect_point_line

argv = sys.argv[sys.argv.index('--') + 1:]
BONES_ONLY = argv[-1] == '--bones-only'
if BONES_ONLY: argv = argv[:-1]
SRC, OUT_GLB, OUT_BLEND, PREV = argv[0], argv[1], argv[2], argv[3]
MANIFEST = argv[4] if len(argv) > 4 else None
os.makedirs(PREV, exist_ok=True)

# ---------- skeleton (left side written once, right side mirrored) ----------
SPINE = [
    ('hips',  (0.03, 0, -0.050), (0.12, 0, -0.044), None),
    ('spine', (0.12, 0, -0.044), (0.21, 0, -0.040), 'hips'),
    ('chest', (0.21, 0, -0.040), (0.30, 0, -0.020), 'spine'),
    ('neck1', (0.30, 0, -0.020), (0.35, 0, 0.022), 'chest'),
    ('neck2', (0.35, 0, 0.022), (0.40, 0, 0.066), 'neck1'),
    ('head',  (0.40, 0, 0.066), (0.497, 0, 0.066), 'neck2'),
    ('tail1', (0.03, 0, -0.050), (-0.055, 0, -0.088), 'hips'),
    ('tail2', (-0.055, 0, -0.088), (-0.14, 0, -0.113), 'tail1'),
    ('tail3', (-0.14, 0, -0.113), (-0.225, 0, -0.125), 'tail2'),
    ('tail4', (-0.225, 0, -0.125), (-0.305, 0, -0.114), 'tail3'),
    ('tail5', (-0.305, 0, -0.114), (-0.375, 0, -0.090), 'tail4'),
    ('tail6', (-0.375, 0, -0.090), (-0.495, 0, -0.028), 'tail5'),
]
SIDE = [
    # front leg: shoulder -> elbow (armour spike) -> wrist (narrowest, z -.178) -> paw -> toe tips
    ('farm1', (0.282, 0.052, -0.062), (0.276, 0.054, -0.128), 'chest'),
    ('farm2', (0.276, 0.054, -0.128), (0.297, 0.042, -0.178), 'farm1'),
    ('fpaw',  (0.297, 0.042, -0.178), (0.322, 0.039, -0.203), 'farm2'),
    ('ftoe',  (0.322, 0.039, -0.203), (0.358, 0.037, -0.213), 'fpaw'),
    # hind leg (digitigrade-ish): hip -> knee -> hock -> ball of foot (hfoot = metatarsus) -> toe tips (htoe = sole+toes)
    ('hleg1', (0.105, 0.045, -0.050), (0.128, 0.047, -0.112), 'hips'),
    ('hleg2', (0.128, 0.047, -0.112), (0.068, 0.043, -0.147), 'hleg1'),
    ('hfoot', (0.068, 0.043, -0.147), (0.088, 0.042, -0.200), 'hleg2'),
    ('htoe',  (0.088, 0.042, -0.200), (0.145, 0.050, -0.214), 'hfoot'),
    # wing: shoulder -> elbow -> wrist (thumb claw at ~(.40,.17,.20)) -> three finger tips (claws)
    ('wing1', (0.240, 0.065, 0.025), (0.280, 0.100, 0.110), 'chest'),
    ('wing2', (0.280, 0.100, 0.110), (0.360, 0.155, 0.190), 'wing1'),
    ('fing1', (0.360, 0.155, 0.190), (0.330, 0.490, 0.175), 'wing2'),
    ('fing2', (0.360, 0.155, 0.190), (0.175, 0.410, 0.115), 'wing2'),
    ('fing3', (0.360, 0.155, 0.190), (0.130, 0.222, 0.055), 'wing2'),
]
BONES = list(SPINE)
for sfx, sg in (('.L', 1), ('.R', -1)):
    for n, h, t, p in SIDE:
        BONES.append((n + sfx, (h[0], h[1] * sg, h[2]), (t[0], t[1] * sg, t[2]), p if p in ('chest', 'hips') else p + sfx))

if BONES_ONLY:
    json.dump([[n, h, t] for n, h, t, p in BONES], open(os.path.join(PREV, 'bones.json'), 'w'))
    print('BONES_ONLY', len(BONES)); sys.exit(0)

# ---------- region thresholds (teen mesh) ----------
HEAD_X, HEAD_Z, HEAD_Y = 0.39, 0.0, 0.08      # head + horn crown: x>.39, z>0, |y|<.08 -> head/neck2 only
WING_Y, WING_Z = 0.075, -0.03                 # wing membrane/arm: |y|>.075 and z>-.03 (body is |y|<=.069)
WING_ROOT_Y = 0.10                            # wing verts with |y|<.10 may also take chest/spine (wing root blend)
SHOULDER_Y, SHOULDER_Z = 0.058, -0.03         # body verts with |y|>.058 and z>-.03 may take wing1 (shoulder skin)
LEG_Z = -0.07                                 # legs only below the belly line (belly ~-.085, chest bottom ~-.096)
FLEG_Y, HLEG_Y = 0.020, 0.015                 # keep the chest keel (|y|<.02, hangs to z -.14 between front legs) on the chest
FRONT_X, HIND_X = 0.20, -0.01                 # x>.20 front leg, -.01<x<=.20 hind leg

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
mesh = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
mw = mesh.matrix_world.copy(); mesh.parent = None; mesh.matrix_world = mw
for o in list(bpy.context.scene.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
bpy.context.view_layer.objects.active = mesh; mesh.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
mesh.name = 'FireTeen'

# ---------- material: keep only the base colour (game uses MeshToonMaterial with map only) ----------
for mat in mesh.data.materials:
    nt = mat.node_tree; bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    for n in list(nt.nodes):
        if n.type in ('NORMAL_MAP', 'SEPARATE_COLOR') or (n.type == 'TEX_IMAGE' and not any(l.to_socket == bsdf.inputs['Base Color'] for l in n.outputs[0].links)):
            img = getattr(n, 'image', None); nt.nodes.remove(n)
            if img: bpy.data.images.remove(img)
    bsdf.inputs['Metallic'].default_value = 0.0; bsdf.inputs['Roughness'].default_value = 0.8

arm_data = bpy.data.armatures.new('DragonRig'); arm = bpy.data.objects.new('DragonRig', arm_data)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='EDIT')
for n, h, t, p in BONES:
    b = arm_data.edit_bones.new(n); b.head = Vector(h); b.tail = Vector(t); b.roll = 0
for n, h, t, p in BONES:
    if p: arm_data.edit_bones[n].parent = arm_data.edit_bones[p]
bpy.ops.object.mode_set(mode='OBJECT')

# ---------- weights: distance to bone segment, gated by region ----------
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
CORE = ['hips', 'spine', 'chest', 'neck1', 'neck2', 'head'] + [f'tail{i}' for i in range(1, 7)]
def dist(p, n):
    a, b = segs[n]; q, f = intersect_point_line(p, a, b); f = max(0, min(1, f))
    return (p - (a + (b - a) * f)).length
groups = {n: mesh.vertex_groups.new(name=n) for n, *_ in BONES}
region_count = {}
for v in mesh.data.vertices:
    p = v.co; ay = abs(p.y); s = '.L' if p.y >= 0 else '.R'
    if p.x > HEAD_X and ay < HEAD_Y and p.z > HEAD_Z:
        cand = ['head', 'neck2']; reg = 'head'
    elif ay > WING_Y and p.z > WING_Z:
        cand = ['wing1' + s, 'wing2' + s, 'fing1' + s, 'fing2' + s, 'fing3' + s] + (['chest', 'spine'] if ay < WING_ROOT_Y else []); reg = 'wing'
    else:
        cand = list(CORE); reg = 'core'
        if p.z < LEG_Z:
            if p.x > FRONT_X and ay > FLEG_Y:
                cand += ['farm1' + s, 'farm2' + s, 'fpaw' + s, 'ftoe' + s]; reg = 'fleg'
            elif HIND_X < p.x <= FRONT_X and ay > HLEG_Y:
                cand += ['hleg1' + s, 'hleg2' + s, 'hfoot' + s, 'htoe' + s]; reg = 'hleg'
        if ay > SHOULDER_Y and p.z > SHOULDER_Z: cand += ['wing1' + s]; reg = 'shoulder'
    region_count[reg] = region_count.get(reg, 0) + 1
    ds = sorted((dist(p, n), n) for n in cand)[:3]
    soft = all(n in CORE for _, n in ds)
    ws = [((1.0 / (d * d + 1e-5)) if soft else (1.0 / (d * d + 1e-5) ** 2), n) for d, n in ds]
    tot = sum(w for w, _ in ws)
    for w, n in ws:
        if w / tot > 0.02: groups[n].add([v.index], w / tot, 'REPLACE')
print('REGIONS', region_count)
mod = mesh.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
mesh.parent = arm

# ---------- animation ----------
sc = bpy.context.scene; sc.render.fps = 24
arm.rotation_mode = 'XYZ'
bpy.context.view_layer.objects.active = arm; bpy.ops.object.mode_set(mode='POSE')
pbs = arm.pose.bones
for pb in pbs: pb.rotation_mode = 'QUATERNION'
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
def q_arm(name, axis, ang):
    """rotate ang (rad) about an ARMATURE-space axis, expressed as the bone's local rotation"""
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
def merge(*specs):
    out = {}
    for sp in specs:
        for k, v in sp.items(): out[k] = out.get(k, []) + v
    return out
def side_angle(n):
    d = pbs[n].tail - pbs[n].head
    return math.degrees(math.atan2(d.z, d.x))
def wrap(a): return (a + 180) % 360 - 180

# TUCK: solve the Y-rotations so each bone's side-view direction matches the APPROVED adult flight pose
# (measured on fire_adult_rig.blend with pose_report.py, mean over the Fly cycle):
#   front leg like a human arm: upper arm -110, forearm -40 (elbow 70), paw -70 (wrist droop 30), fingers -145 (curl ~75)
#   hind leg: thigh -75, shin -165 (knee 90), foot -110 (55), toes -147 (37)
#   tail raised backward-up 8..20 deg: 172 168 165 163 162 160
TARGET = [('farm1', -110), ('farm2', -40), ('fpaw', -70), ('ftoe', -145),
          ('hleg1', -75), ('hleg2', -165), ('hfoot', -110), ('htoe', -147),
          ('tail1', 172), ('tail2', 168), ('tail3', 165), ('tail4', 163), ('tail5', 162), ('tail6', 160)]
# neck: keep the rest shape (adult values; the teen's rest neck angles are within 5 deg of the adult's)
NECK = {'neck1': [(Y, 0.1)], 'neck2': [(Y, 0.06)], 'head': [(Y, -0.12)]}
def tuck_spec(vals):
    sp = {}
    for n, v in vals.items():
        if n.startswith('tail'): sp[n] = [(Y, v)]
        else: sp[n + '.L'] = [(Y, v)]; sp[n + '.R'] = [(Y, v)]
    return merge(sp, NECK)
vals = {n: 0.0 for n, _ in TARGET}
for it in range(6):
    for n, tgt in TARGET:
        pose(tuck_spec(vals)); bpy.context.view_layer.update()
        bn = n if n.startswith('tail') else n + '.L'
        vals[n] += math.radians(wrap(side_angle(bn) - tgt))
pose(tuck_spec(vals)); bpy.context.view_layer.update()
print('TUCK solved (rad):', {n: round(v, 3) for n, v in vals.items()})
print('TUCK check (deg):', {n: round(side_angle(n if n.startswith('tail') else n + '.L')) for n, _ in TARGET})
TUCK = tuck_spec(vals)

# wing rest elevation (shoulder -> leading finger tip, front view). Adult = 28.2 deg; shift the flap so the
# absolute wing angles match the adult's approved flap (-38..+54 deg) and glide (~-2 deg).
h = Vector(segs['wing1.L'][0]); t = Vector(segs['fing1.L'][1])
WING_ELEV = math.degrees(math.atan2(t.z - h.z, t.y - h.y))
UP0 = math.radians(28.2 - WING_ELEV)
print('WING rest elevation', round(WING_ELEV, 1), 'deg -> up offset', round(UP0, 3), 'rad')

def wing_spec(sfx, up, sweep, lag1, lag2, fold=0.0):
    sg = 1 if sfx == '.L' else -1
    return {
        'wing1' + sfx: [(X, sg * up), (Z, sg * sweep)],
        'wing2' + sfx: [(X, sg * lag1), (Z, sg * fold * 0.6)],
        'fing1' + sfx: [(X, sg * lag2), (Z, sg * fold)],
        'fing2' + sfx: [(X, sg * lag2), (Z, sg * fold * 1.2)],
        'fing3' + sfx: [(X, sg * lag2 * .8), (Z, sg * fold * 1.4)],
    }

actions = []
def make_action(name, frames, fn):
    act = bpy.data.actions.new(name); arm.animation_data_create(); arm.animation_data.action = act
    for f in range(frames + 1):          # keys at frames 0..frames, last == first -> seamless loop, clip starts at t=0
        pose(fn(f / frames)); key_all(f)
    actions.append((name, act, frames))

TW = 2 * math.pi
def paw_breath(sp, br):
    for sfx in ('.L', '.R'):
        sp['fpaw' + sfx].append((Y, 0.05 * math.sin(br)))
        sp['ftoe' + sfx].append((Y, 0.16 * math.sin(br - 0.6)))
def fly(t):
    ph = TW * 3 * t; br = TW * t           # 3 flaps per 3 s loop, finger breathing once per loop
    up = UP0 - 0.35 + 0.8 * math.sin(ph)
    args = (up, 0.15 * math.cos(ph), 0.35 * math.sin(ph - 0.8), 0.28 * math.sin(ph - 1.5), 0.25 * max(0, math.cos(ph)))
    sp = merge(TUCK, wing_spec('.L', *args), wing_spec('.R', *args))
    for i in range(1, 7): sp.setdefault(f'tail{i}', []).append((Z, 0.07 * math.sin(ph - i * 0.6)))
    sp.setdefault('neck2', []).append((Y, -0.05 * math.sin(ph - 0.5)))
    for sfx in ('.L', '.R'):
        sp['farm1' + sfx].append((Y, 0.08 * math.sin(ph - 1.0)))
        sp['hleg1' + sfx].append((Y, 0.07 * math.sin(ph - 1.6)))
    paw_breath(sp, br)
    return sp
def glide(t):
    ph = TW * t
    up = UP0 - 0.52 + 0.04 * math.sin(ph)
    args = (up, -0.05, 0.05, 0.08 + 0.03 * math.sin(ph * 2), 0)
    sp = merge(TUCK, wing_spec('.L', *args), wing_spec('.R', *args))
    for i in range(1, 7): sp.setdefault(f'tail{i}', []).append((Z, 0.05 * math.sin(ph - i * 0.5)))
    paw_breath(sp, ph)
    return sp
def idle(t):
    ph = TW * t
    a = (0.04 * math.sin(ph), 0, 0.03 * math.sin(ph - .5), 0.03 * math.sin(ph - 1), 0)
    sp = merge(wing_spec('.L', *a), wing_spec('.R', *a))
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
    tr.strips.new(name, 0, act)
arm.animation_data.action = None
for pb in pbs: pb.rotation_quaternion = Quaternion()
bpy.ops.object.mode_set(mode='OBJECT')
sc.frame_start, sc.frame_end = 0, 72

# ---------- quick preview: a few frames per action ----------
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
sc.frame_set(0)

# ---------- manifest numbers (rest pose, Blender coordinates) ----------
V = [v.co for v in mesh.data.vertices]
xs = [p.x for p in V]
head_pts = [p for p in V if abs(p.y) < 0.03 and 0.02 < p.z < 0.10 and p.x > 0.40]
xmax = max(p.x for p in head_pts)
front = [p for p in head_pts if p.x > xmax - 0.012]
mouth = (round(xmax - 0.004, 3), 0.0, round(sum(p.z for p in front) / len(front), 3))
hx = (segs['hips'][0].x + segs['chest'][1].x) / 2
def spine_z(x):
    for n in ('hips', 'spine', 'chest'):
        a, b = segs[n]
        if min(a.x, b.x) <= x <= max(a.x, b.x): return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x)
pivot = (round(hx, 3), 0.0, round(spine_z(hx), 3))
tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)

# ---------- textures to 1024, export ----------
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_image_format='WEBP', export_image_quality=85, export_yup=True)
if MANIFEST:
    man = {
        'file': 'models/' + os.path.basename(OUT_GLB), 'kind': 'fire', 'stage': 'teen',
        'length': round(max(xs) - min(xs), 3), 'pivot': list(pivot), 'mouth': list(mouth), 'headBone': 'head',
        'neckBones': ['neck1', 'neck2'], 'tailBones': [f'tail{i}' for i in range(1, 7)],
        'wingBones': {'L': ['wing1.L', 'wing2.L', 'fing1.L'], 'R': ['wing1.R', 'wing2.R', 'fing1.R']},
        'actions': {name: round(frames / 24, 3) for name, act, frames in actions},
        'tris': tris, 'bones': len(BONES), 'bytes': os.path.getsize(OUT_GLB),
    }
    json.dump(man, open(MANIFEST, 'w'), indent=2)
print('MANIFEST_NUMBERS', json.dumps({'mouth': mouth, 'pivot': pivot, 'tris': tris, 'len': round(max(xs) - min(xs), 3)}))
print('DONE bones', len(BONES), 'actions', [a[0] for a in actions])
