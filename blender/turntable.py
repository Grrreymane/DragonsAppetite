# 渲染转台视频的帧（Cycles + 阴影捕捉，透明背景，之后再铺米色底）
# blender -b fire_adult_rig.blend -P turntable.py -- <动作名> <帧目录> <秒数> <宽> <高> [地面高度] [采样]
import bpy, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index('--') + 1:]
ACT, OUT, SECS, W, H = argv[0], argv[1], float(argv[2]), int(argv[3]), int(argv[4])
GROUND = float(argv[5]) if len(argv) > 5 else -0.235
SAMPLES = int(argv[6]) if len(argv) > 6 else 32
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene; FPS = 24
sc.render.fps = FPS
arm = bpy.data.objects['DragonRig']

# 只留这个动作，让它循环到整段视频
total = int(SECS * FPS)
for tr in arm.animation_data.nla_tracks:
    tr.mute = tr.name != ACT
    if tr.name == ACT:
        st = tr.strips[0]
        cyc = st.action_frame_end - st.action_frame_start
        st.repeat = max(1.0, math.ceil(total / cyc))
sc.frame_start, sc.frame_end = 1, total

# 渲染设置
sc.render.engine = 'CYCLES'
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI'):
        try:
            prefs.compute_device_type = dev; prefs.get_devices()
            if any(d.type == dev for d in prefs.devices):
                for d in prefs.devices: d.use = True
                sc.cycles.device = 'GPU'; print('DEVICE', dev); break
        except Exception: pass
except Exception as e: print('no gpu', e)
sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.film_transparent = True
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.view_settings.view_transform = 'Standard'
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'

# 世界光 + 太阳
world = bpy.data.worlds.new('paper'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.84, 0.80, 0.74, 1); bg.inputs[1].default_value = 0.9
sun_d = bpy.data.lights.new('sun', 'SUN'); sun_d.energy = 3.2; sun_d.angle = math.radians(6); sun_d.color = (1, 0.96, 0.9)
sun = bpy.data.objects.new('sun', sun_d); sc.collection.objects.link(sun); sun.rotation_euler = (math.radians(38), math.radians(8), math.radians(-35))
rim_d = bpy.data.lights.new('rim', 'SUN'); rim_d.energy = 1.4; rim_d.color = (1, 0.7, 0.45)
rim = bpy.data.objects.new('rim', rim_d); sc.collection.objects.link(rim); rim.rotation_euler = (math.radians(60), 0, math.radians(160))
rim_d.use_shadow = False

# 地面：只留阴影
bpy.ops.mesh.primitive_plane_add(size=20, location=(0, 0, GROUND))
ground = bpy.context.active_object; ground.is_shadow_catcher = True

# 镜头绕龙转一圈
piv = bpy.data.objects.new('pivot', None); sc.collection.objects.link(piv)
piv.location = (0, 0, 0.0 if ACT == 'Idle' else 0.03)
cd = bpy.data.cameras.new('cam'); cd.lens = 50
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
cam.parent = piv; dist = 2.35; el = math.radians(14)
cam.location = (dist * math.cos(el), 0, dist * math.sin(el))
tc = cam.constraints.new('TRACK_TO'); tc.target = piv; tc.track_axis = 'TRACK_NEGATIVE_Z'; tc.up_axis = 'UP_Y'
piv.rotation_euler = (0, 0, math.radians(-40)); piv.keyframe_insert('rotation_euler', index=2, frame=1)
piv.rotation_euler = (0, 0, math.radians(-40) + 2 * math.pi); piv.keyframe_insert('rotation_euler', index=2, frame=total + 1)
ad = piv.animation_data
fcs = []
try: fcs = list(ad.action.fcurves)
except Exception:
    for lay in ad.action.layers:
        for strip in lay.strips:
            for cb in strip.channelbags: fcs += list(cb.fcurves)
for fc in fcs:
    for kp in fc.keyframe_points: kp.interpolation = 'LINEAR'

for f in range(1, total + 1):
    sc.frame_set(f); sc.render.filepath = os.path.join(OUT, f'f_{f:04d}.png')
    bpy.ops.render.render(write_still=True)
print('DONE', ACT, total)
