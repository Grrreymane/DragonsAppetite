# Fire dragon TEEN: rig + weights + Fly/Glide/Idle + web glb export (adapted from rig.py, adult)
# blender -b --factory-startup -P rig_fire_teen.py -- <in.glb> <out.glb> <out.blend> <check_dir> [manifest.json]
#   add "--bones-only" as the last arg to just dump <check_dir>/bones.json (for overlay renders) and quit
# Real run (input = raw Tripo P1 output, face-limit 6500):
#   blender -b --factory-startup -P D:/Minigame/Dragon/blender/rig_fire_teen.py -- D:/Minigame/Dragon/.cache/art/fire_teen/fire_teen_rig.glb
#     D:/Minigame/Dragon/models/fire_teen_anim.glb D:/Minigame/Dragon/blender/fire_teen_rig.blend D:/Minigame/Dragon/.cache/check/fire_teen/rigprev
#     D:/Minigame/Dragon/models/fire_teen.json
# v2 (2026-10-10, applying .cache/docs/review_fire_teen.md):
#   - proportions toward the concept stage: tail1..tail5 shortened x0.5 ALONG the bone chain (joint angles and cross-section kept),
#     club x0.8 along its axis (squatter diamond; also slimmer + taller, see CLUB_YK), tail ridge spikes x0.8 toward the tail line, head x1.12 baked into the rest mesh
#     (verts blended by head weight around the neck2/head joint); club also x0.6 sideways / x1.15 up-down (upright diamond) -> nose-to-tail ~0.78, tail ~0.30, head ~14%, wingspan/length ~1.28
#   - vertices welded (Tripo splits every UV island; glTF re-splits by UV on export) + smooth normals; the two open rings at the
#     elbow armour (~31 edges each) capped with holes_fill (UVs copied from the neighbouring faces)
#   - base-colour texture graded (saturation x0.74, value gamma 0.78) toward the baby/adult palette: Tripo made the teen near-black
#   - (v2 curled the flight tail up to 172 -> 150 to lift the dark club off the rump; v3 reverts to the approved 172 -> 160 and fixes the club itself)
#   - after export: blender/glb_quantize.py (KHR_mesh_quantization + constant translation/scale channels dropped), 825 KB -> ~0.46 MB
#   debug env overrides (unset = final values): FM_TAIL (flight tail side-view targets), FM_TEX (saturation,gamma)
#   self-check: blender/pose_report.py, blender/glb_check.py, _lab/firemodels.html (game toon material + outline + chase camera)
# v3 (2026-10-11, applying .cache/docs/v2_review_firemodels.md + the user's approved pose language):
#   - flight tail back to the approved 8..20 deg back-up (172..160; v2 curled it to 30 deg)
#   - the club (Tripo's shiny near-black egg, its texture split over many tiny near-black atlas islands) is deleted and replaced by a
#     clean upright octahedral crystal grown from the end ring of the tail shaft, textured with its own painted patch (dark basalt,
#     lighter facet edges, glowing orange lava cracks) in the atlas space the old club freed; see firemodels_lib.rebuild_club / club_texture
# Coordinates (Blender, after import): +X forward (head), +Y = dragon's LEFT, +Z up. Model length ~1.0.
# Every coordinate / threshold below was measured on THIS mesh (Tripo P1, face-limit 6500) with
# render_views.py + zoomed ortho grids + analyze.py; the adult's numbers in rig.py do not apply.
import bpy, sys, os, math, json
from mathutils import Vector, Quaternion
from mathutils.geometry import intersect_point_line
sys.dont_write_bytecode = True   # 不在 blender/ 里留 __pycache__（会被提交、部署）
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import firemodels_lib as FL

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
FLEG_Y, HLEG_Y = 0.020, 0.015                 # keep the chest keel (|y|<.02, hangs to z -.14 between front legs) on the chest...
KEEL_Z = -0.148                               # ...but below the keel tip every vertex is foot/toe (inner toes reach |y| .017)
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

# ---------- v2: colour-grade the base colour toward the baby / adult (Tripo made the teen much darker and more saturated:
# HSV mean S 210 / V 89 vs adult 152 / 100 and baby 129 / 124; in the game it read as a near-black silhouette).
# Hue kept: rgb = v * (1 - s * (1 - c)) with c = (rgb - min) / (max - min); v -> v ** TEX_GAMMA, s -> s * TEX_SAT ----------
TEX_SAT, TEX_GAMMA = [float(a) for a in os.environ.get('FM_TEX', '0.74,0.78').split(',')]
import numpy as np
for mat in mesh.data.materials:
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    for l in bsdf.inputs['Base Color'].links:
        img = getattr(l.from_node, 'image', None)
        if img is None: continue
        px = np.empty(len(img.pixels), dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(-1, 4)
        rgb = px[:, :3]; mx = rgb.max(1); mn = rgb.min(1)
        sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0); c = np.where((mx - mn)[:, None] > 1e-6, (rgb - mn[:, None]) / np.maximum(mx - mn, 1e-6)[:, None], 1)
        v2 = np.power(mx, TEX_GAMMA); s2 = sat * TEX_SAT
        px[:, :3] = v2[:, None] * (1 - s2[:, None] * (1 - c))
        img.pixels.foreach_set(px.ravel()); img.update()
        print('TEX graded', img.name, 'V mean', round(float(mx.mean()), 3), '->', round(float(v2.mean()), 3), 'S mean', round(float(sat.mean()), 3), '->', round(float(s2.mean()), 3))

# ---------- v2 reshape parameters (review_fire_teen.md) ----------
TAIL_K = 0.5           # tail1..tail5 lengths x0.5 along the chain (Tripo made the tail 53% of nose-to-tail; concept stage ~40%)
CLUB_K = 0.8           # club (tail6) x0.8 along its axis
CLUB_YK, CLUB_NK = 0.6, 1.15   # ...and x0.6 sideways, x1.15 up/down: Tripo's club is a fat egg (0.08 wide) that the chase camera
                               # (behind, close to the tail) shows as a big dark blob on the rump; slimmer + taller = an upright
                               # diamond like the baby's and the concept
SPIKE_BASE, SPIKE_K = 0.012, 0.8   # tail ridge spikes: the part more than SPIKE_BASE above the tail line x SPIKE_K
HEAD_S = 1.12          # head (by head weight) around the neck2/head joint
RING_MIN = 30          # cap open boundary loops with >= this many edges (the two elbow-armour rings); eye / nostril pin-holes stay
# v3 club rebuild (after the reshape, in final rest coords, along the tail6 bone): faces with a vertex more than CLUB_CUT past the tail6
# head are deleted (the old club starts at ~+0.01), the shaft end ring (~-0.005) is bridged to a diamond ring at CLUB_MID and a tip at
# CLUB_TIP. Concept teen club ~0.13 x length tall, ~0.1 x length long -> ~0.096 tall x 0.052 wide x 0.09 long
CLUB_CUT, CLUB_MID, CLUB_TIP = 0.004, 0.036, 0.092
CLUB_H, CLUB_W, CLUB_VM = 0.048, 0.026, 0.32

print('WELD', FL.weld(mesh))
print('FILL', FL.fill_rings(mesh, RING_MIN))
def tail_line_z(x):
    for n, h, t, p in SPINE:
        if n.startswith('tail') and min(h[0], t[0]) <= x <= max(h[0], t[0]):
            return h[2] + (t[2] - h[2]) * (x - h[0]) / (t[0] - h[0])
    return None
n_sp = 0
for v in mesh.data.vertices:
    p = v.co
    if -0.37 < p.x < 0.0 and abs(p.y) < 0.012:
        lz = tail_line_z(p.x)
        if lz is not None and p.z - lz > SPIKE_BASE:
            p.z = lz + SPIKE_BASE + (p.z - lz - SPIKE_BASE) * SPIKE_K; n_sp += 1
mesh.data.update(); print('SPIKES lowered', n_sp)

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
            if p.x > FRONT_X and (ay > FLEG_Y or p.z < KEEL_Z):
                cand += ['farm1' + s, 'farm2' + s, 'fpaw' + s, 'ftoe' + s]; reg = 'fleg'
            elif HIND_X < p.x <= FRONT_X and (ay > HLEG_Y or p.z < KEEL_Z):
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

# ---------- v2: reshape the rest mesh through the weights (like skinning), bones move with it ----------
XF = {'head': FL.uni_scale(segs['head'][0], HEAD_S)}
Hn = segs['tail1'][0].copy()
for i in range(1, 7):
    H, T = segs[f'tail{i}']; k = TAIL_K if i < 6 else CLUB_K
    XF[f'tail{i}'] = FL.seg_scale(H, T, Hn, k)
    if i == 6:
        def club_xf(p, H=H.copy(), T=T.copy(), Hn=Hn.copy(), k=k):
            d = (T - H).normalized(); nrm = Vector((-d.z, 0, d.x)); r = p - H
            a = r.dot(d); L = (T - H).length; a2 = a if a < 0 else (k * a if a <= L else k * L + (a - L))
            return Hn + d * a2 + Vector((0, r.y * CLUB_YK, 0)) + nrm * (r.dot(nrm) * CLUB_NK)
        XF['tail6'] = club_xf
    Hn = Hn + (T - H) * k
FL.lbs_reshape(mesh, XF)
BONES = [(n, tuple(XF[n](Vector(h))) if n in XF else h, tuple(XF[n](Vector(t))) if n in XF else t, p) for n, h, t, p in BONES]
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
# ---------- v3: club rebuilt as a clean upright diamond along tail6; its vertices follow tail6 rigidly ----------
H6, T6 = segs['tail6']; D6 = (T6 - H6).normalized()
CLUB = FL.rebuild_club(mesh, H6, D6, CLUB_CUT, CLUB_MID, CLUB_TIP, CLUB_H, CLUB_W, vm=CLUB_VM)
mesh.vertex_groups['tail6'].add(CLUB['new_verts'], 1.0, 'REPLACE')
print('CLUB', CLUB)
BONES = [(n, h, tuple(H6 + D6 * CLUB_TIP) if n == 'tail6' else t, p) for n, h, t, p in BONES]   # tail6 ends at the new tip
SPINE = [b for b in BONES if b[0] in [s[0] for s in SPINE]]
segs = {n: (Vector(h), Vector(t)) for n, h, t, p in BONES}
FL.limit_normalize(mesh, 4)
FL.smooth_normals(mesh)
base_img = next(l.from_node.image for l in next(n for n in mesh.data.materials[0].node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].links)
print('CLUBTEX', FL.club_texture(mesh, base_img, aspect=2 * math.hypot(CLUB_H, CLUB_W) / CLUB_TIP, seed=11, vm=CLUB_VM))
print('TRIS', FL.tris(mesh), 'VERTS', len(mesh.data.vertices), 'TAIL', round(segs['tail1'][0].x - min(v.co.x for v in mesh.data.vertices), 3))

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
#   tail raised backward-up: the root 8 deg like the adult, rising toward the club (v2: the shortened tail put the dark club right
#   on the rump in the chase camera, the same problem the baby had; curling it up puts the club over the back like the baby's)
# v3: the approved pose is 8..20 deg back-up (172..160); v2's 172..150 overshot it
TAIL_TARGET = [float(a) for a in os.environ.get('FM_TAIL', '172,170,168,165,162,160').split(',')]
TARGET = [('farm1', -110), ('farm2', -40), ('fpaw', -70), ('ftoe', -145),
          ('hleg1', -75), ('hleg2', -165), ('hfoot', -110), ('htoe', -147)] + [(f'tail{i + 1}', a) for i, a in enumerate(TAIL_TARGET)]
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
gi = {g.index: g.name for g in mesh.vertex_groups}
HW = [sum(g.weight for g in v.groups if gi[g.group] == 'head') for v in mesh.data.vertices]
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
tris = sum(len(p.vertices) - 2 for p in mesh.data.polygons)

# ---------- textures to 1024, export ----------
for img in bpy.data.images:
    if img.size[0] > 1024: img.scale(1024, 1024)
    if img.size[0] > 0 and img.is_dirty: img.pack()   # 改过的像素（缩小、尾锤贴图）打包进 .blend，不然 .blend 里还是导入时的原图
bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_animations=True, export_animation_mode='NLA_TRACKS',
                          export_skins=True, export_image_format='WEBP', export_image_quality=85, export_yup=True)
size = FL.bake_quantize(OUT_GLB)
L = max(xs) - min(xs); span = max(p.y for p in V) - min(p.y for p in V); head_len = xmax - segs['head'][0].x
tail_len = segs['tail1'][0].x - min(xs)
if MANIFEST:
    man = {
        'file': 'models/' + os.path.basename(OUT_GLB), 'kind': 'fire', 'stage': 'teen',
        'length': round(max(xs) - min(xs), 3), 'pivot': list(pivot), 'mouth': list(mouth), 'headBone': 'head',
        # head included = same list as the adult's built-in default in src/view/dragon.js (turn overlay 3 x 0.16)
        'neckBones': ['neck1', 'neck2', 'head'], 'tailBones': [f'tail{i}' for i in range(1, 7)],
        'wingBones': {'L': ['wing1.L', 'wing2.L', 'fing1.L'], 'R': ['wing1.R', 'wing2.R', 'fing1.R']},
        'actions': {name: round(frames / 24, 3) for name, act, frames in actions},
        'flapHz': 1.0,
        'tris': tris, 'bones': len(BONES), 'bytes': size,
        'extents': {'x': [round(min(xs), 3), round(max(xs), 3)], 'y': [round(min(p.y for p in V), 3), round(max(p.y for p in V), 3)],
                    'z': [round(min(p.z for p in V), 3), round(max(p.z for p in V), 3)],
                    'wingspan': round(max(p.y for p in V) - min(p.y for p in V), 3)},
        'notes': (
            "Blender rest coords (head +X, up +Z, +Y = dragon's left). Rest pose = standing on 4 straight legs, wings spread "
            f"(leading-finger tip elevation {WING_ELEV:.1f} deg; adult 28.2). v2 (2026-10-10, review_fire_teen.md): tail1..5 x{TAIL_K} along the chain, "
            f"base-colour graded toward the baby/adult palette, ridge spikes x{SPIKE_K}, head x{HEAD_S} baked into the rest mesh, vertices welded + smooth normals, the two elbow-armour "
            "rings capped, KHR_mesh_quantization (POSITION short, NORMAL byte, UV ushort, WEIGHTS ubyte, rotation keys short; constant "
            "translation/scale channels removed; three.js GLTFLoader reads it natively, no decoder). "
            f"v3 (2026-10-11): club replaced by a clean upright octahedral crystal (~{2 * CLUB_H:.3f} tall x {2 * CLUB_W:.3f} wide x {CLUB_TIP:.3f} long) with its own "
            "painted basalt + glowing lava-crack patch (in the atlas space the old club freed); "
            f"flight tail raised {180 - TAIL_TARGET[0]:.0f}..{180 - TAIL_TARGET[-1]:.0f} deg back-up like the approved adult. "
            f"Nose-to-tail {L:.3f}, tail (tail1 head to tip) {tail_len:.3f} ({tail_len / L * 100:.0f}%), head {head_len:.3f} ({head_len / L * 100:.0f}%), "
            f"wingspan {span:.3f} ({span / L:.2f} x length; baby ~1.2, adult 1.07). "
            "Keys start at frame 0: clips are exactly Fly 3.0 s (72 f, 3 flaps + one 3 s finger-breath), Glide 2.0 s (48 f), "
            "Idle 3.0 s (72 f); first key == last key; every clip keys all 38 bones (rotation only). Same 38-bone names/topology "
            "as fire_adult_anim (GLTFLoader strips the dot: wing1.L -> wing1L). No jaw bone. Mouth = snout tip in rest pose. "
            "Fly/Glide limb angles SOLVED to the approved adult pose (pose_report): elbow 70, wrist ~30, fingers 67-83 (3 s breathing), "
            "knee 90, ankle 55, toes 37, tail raised 8..20 deg back-up (root..club) like the adult. Neck kept in its rest shape with the adult's small offsets. "
            f"Wing flap baseline shifted by +{UP0:.3f} rad (Fly up = {UP0 - 0.35:+.3f} + 0.8 sin, Glide {UP0 - 0.52:+.3f}) so absolute "
            "wing-tip elevations match the adult; flap amplitude 0.8 rad, so the runtime dive-tuck overlay works unchanged. "
            "neckBones includes 'head' like the adult's built-in default (dragon.js). Hind leg is digitigrade: hfoot = metatarsus, "
            "htoe = sole+toes. Only the base-colour texture is kept (1024 WEBP q85, EXT_texture_webp)."),
    }
    json.dump(man, open(MANIFEST, 'w'), indent=2)
print('MANIFEST_NUMBERS', json.dumps({'mouth': mouth, 'pivot': pivot, 'tris': tris, 'len': round(L, 3), 'tail': round(tail_len, 3), 'head': round(head_len, 3), 'span': round(span, 3), 'bytes': size}))
print('DONE bones', len(BONES), 'actions', [a[0] for a in actions])
