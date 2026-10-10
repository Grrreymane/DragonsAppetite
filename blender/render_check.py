# 多角度检查图：同一帧从 侧面 / 斜前 / 正前 / 斜上 四个角度渲染，几个动作排成一张大图
# 可选：把侧视图和一张参考图（同样是正侧面）上下拼在一起对照
# blender -b <xxx_rig.blend> -P render_check.py -- <输出png> <帧> <动作1,动作2,...> [参考图] [中心x] [中心z] [视野]
#   中心 / 视野是模型单位（Tripo 模型大约 1 长）；默认看整条龙
import bpy, sys, os, math, subprocess

argv = sys.argv[sys.argv.index('--') + 1:]
OUT, FRAME, ACTS = argv[0], int(argv[1]), argv[2].split(',')
REF = argv[3] if len(argv) > 3 and argv[3] not in ('', '-') else None
CX = float(argv[4]) if len(argv) > 4 else 0.0
CZ = float(argv[5]) if len(argv) > 5 else 0.0
SPAN = float(argv[6]) if len(argv) > 6 else 1.15
tmp = os.path.splitext(OUT)[0] + '_parts'; os.makedirs(tmp, exist_ok=True)

sc = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'; sc.display.shading.color_type = 'TEXTURE'
sc.render.resolution_x, sc.render.resolution_y = 640, 520
cd = bpy.data.cameras.new('chk'); cam = bpy.data.objects.new('chk', cd); sc.collection.objects.link(cam); sc.camera = cam
d = SPAN * 2.2
VIEWS = [  # 名字, 相机方向（从中心指向相机）, 正交?
    ('side', (0, -1, 0), True),
    ('front34', (0.75, -0.6, 0.28), False),
    ('front', (1, 0, 0.05), False),
    ('top34', (0.55, -0.45, 0.7), False),
]
paths = []
for act in ACTS:
    for tr in arm.animation_data.nla_tracks: tr.mute = tr.name != act
    sc.frame_set(FRAME)
    for name, (x, y, z), ortho in VIEWS:
        cd.type = 'ORTHO' if ortho else 'PERSP'; cd.ortho_scale = SPAN; cd.lens = 50
        cam.location = (CX + x * d, y * d, CZ + z * d)
        dirv = (CX - cam.location[0], -cam.location[1], CZ - cam.location[2])
        cam.rotation_mode = 'QUATERNION'
        from mathutils import Vector
        cam.rotation_quaternion = Vector(dirv).to_track_quat('-Z', 'Y')
        p = os.path.join(tmp, f'{act}_{name}.png'); sc.render.filepath = p
        bpy.ops.render.render(write_still=True); paths.append((act, name, p))

# 用系统 python + Pillow 拼图（Blender 自带的 python 没有 Pillow）
code = r'''
import sys, json
from PIL import Image, ImageDraw
items, out, ref = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
acts = list(dict.fromkeys(a for a, _, _ in items)); views = list(dict.fromkeys(v for _, v, _ in items))
W, H = Image.open(items[0][2]).size
sheet = Image.new('RGB', (W * len(views), H * len(acts)), (40, 40, 40)); dr = ImageDraw.Draw(sheet)
for a, v, p in items:
    x, y = views.index(v) * W, acts.index(a) * H
    sheet.paste(Image.open(p).convert('RGB'), (x, y)); dr.text((x + 6, y + 6), f'{a} / {v}', fill=(255, 255, 0))
if ref != '-':
    r = Image.open(ref).convert('RGB'); r = r.resize((W, int(r.height * W / r.width)))
    col = Image.new('RGB', (W, r.height + H * len(acts)), (255, 255, 255)); col.paste(r, (0, 0))
    for a in acts: col.paste(Image.open([p for aa, v, p in items if aa == a and v == 'side'][0]).convert('RGB'), (0, r.height + acts.index(a) * H))
    col.save(out.replace('.png', '_vs_ref.png'))
sheet.save(out)
'''
import json
subprocess.run(['python', '-c', code, json.dumps(paths), OUT, REF or '-'], check=True)
print('saved', OUT)
