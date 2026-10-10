# 导出后的 glb 自检：重新导入，打印骨头数、三角面、动作（帧范围/时长）、贴图，
# 并量某个动作某一帧里指定骨头的末端位置（和 .blend 里对比，确认导出的动画是对的）
# blender -b --factory-startup -P glb_check.py -- <in.glb> [动作 帧 骨头] [俯视4相位输出png]
import bpy, sys, os, json, math
argv = sys.argv[sys.argv.index('--') + 1:]
SRC = argv[0]
ACT = argv[1] if len(argv) > 1 else None; FR = int(argv[2]) if len(argv) > 2 else 0; BONE = argv[3] if len(argv) > 3 else 'head'
OUT = argv[4] if len(argv) > 4 else None
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
arms = [o for o in sc.objects if o.type == 'ARMATURE']
meshes = [o for o in sc.objects if o.type == 'MESH' and o.vertex_groups]   # 导入器给骨头显示用的 Icosphere 不算
arm = arms[0]
tris = 0
for m in meshes:
    m.data.calc_loop_triangles(); tris += len(m.data.loop_triangles)
print('GLB', os.path.basename(SRC), 'bytes', os.path.getsize(SRC))
print('BONES', len(arm.data.bones), sorted(b.name for b in arm.data.bones))
print('MESHES', [(m.name, len(m.data.vertices)) for m in meshes], 'TRIS', tris, 'VERTS', sum(len(m.data.vertices) for m in meshes))
print('IMAGES', [(i.name, tuple(i.size)) for i in bpy.data.images])
fps = sc.render.fps
acts = {}
for a in bpy.data.actions:
    r = a.frame_range; acts[a.name] = (r[0], r[1]); print('ACTION', a.name, 'frames', tuple(round(x, 2) for x in r), 'seconds', round((r[1] - r[0]) / fps, 4))
def use(name):
    ad = arm.animation_data or arm.animation_data_create()
    for tr in ad.nla_tracks: tr.mute = True
    a = bpy.data.actions[name]; ad.action = a
    if hasattr(ad, 'action_slot') and a.slots and ad.action_slot is None: ad.action_slot = a.slots[0]
def bone_tail(name):   # glTF 没有骨头末端，导入器会猜骨头长度，所以量骨头「起点」
    dg = bpy.context.evaluated_depsgraph_get(); ev = arm.evaluated_get(dg)
    return arm.matrix_world @ ev.pose.bones[name].head
if ACT:
    key = next(k for k in acts if k == ACT or k.startswith(ACT))
    use(key); f0 = acts[key][0]
    sc.frame_set(int(f0 + FR) + 1); sc.frame_set(int(f0 + FR))
    print('POSE', key, 'frame', FR, BONE, 'head', tuple(round(c, 3) for c in bone_tail(BONE)))
    big = max(meshes, key=lambda m: len(m.data.vertices)); dg = bpy.context.evaluated_depsgraph_get(); em = big.evaluated_get(dg).to_mesh()
    ix = min(range(len(big.data.vertices)), key=lambda i: (big.matrix_world @ big.data.vertices[i].co).x)
    print('TIPVERT', tuple(round(c, 3) for c in big.matrix_world @ em.vertices[ix].co))
    # 首尾帧一致（无缝循环）
    sc.frame_set(int(acts[key][0])); a0 = bone_tail(BONE).copy(); sc.frame_set(int(acts[key][1])); a1 = bone_tail(BONE).copy()
    print('LOOP', key, 'first vs last frame', BONE, 'diff', round((a0 - a1).length, 5))
if OUT and ACT:
    sc.render.engine = 'BLENDER_WORKBENCH'; sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
    sc.world = bpy.data.worlds.new('w'); sc.render.resolution_x, sc.render.resolution_y = 1600, 420
    cd = bpy.data.cameras.new('c'); cd.type = 'ORTHO'; cd.ortho_scale = 1.1
    cam = bpy.data.objects.new('c', cd); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0, 0, 5); cam.rotation_euler = (0, 0, 0)
    f0, f1 = acts[key]; paths = []
    for q in range(4):
        f = int(round(f0 + q * (f1 - f0) / 4)); sc.frame_set(f + 1); sc.frame_set(f)
        p = os.path.splitext(OUT)[0] + f'_{q}.png'; sc.render.filepath = p; bpy.ops.render.render(write_still=True); paths.append(p)
    code = 'import sys\nfrom PIL import Image\nps=sys.argv[2:]\nims=[Image.open(p) for p in ps]\nout=Image.new("RGB",(ims[0].width,sum(i.height for i in ims)))\ny=0\nfor i in ims: out.paste(i,(0,y)); y+=i.height\nout.save(sys.argv[1])\n'
    import subprocess; subprocess.run(['python', '-c', code, OUT] + paths, check=True)
    for p in paths: os.remove(p)
    print('SAVED', OUT)
