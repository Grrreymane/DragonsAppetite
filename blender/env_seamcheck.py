# 岛的水线接缝 / 水下岩基检查图：读做好的 models/env/<name>.glb 的 lod0，背面剔除打开、背景洋红——
# 网格上的洞会露出洋红色，外伸的「桌面」也一眼看得出来。水下部分按游戏里的 k 竖直拉长。
#   blender -b --factory-startup -P env_seamcheck.py -- <out_dir> <name.glb>[:k] ...
# 每个模型出 6 张：h0~h3 = 水面下一点水平看（四个方向），u0 / u1 = 从水下往上斜着看。拼成 <out_dir>/<name>_seam.png
import bpy, sys, os, math, mathutils

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = argv[0]; os.makedirs(OUT, exist_ok=True)


def setup():
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sh = sc.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'TEXTURE'; sh.show_backface_culling = True
    sc.render.resolution_x = 480; sc.render.resolution_y = 640
    w = bpy.data.worlds.new('w'); w.color = (1, 0, 1); sc.world = w
    cd = bpy.data.cameras.new('cam'); cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam
    cd.lens = 24; cd.clip_start = .005
    return sc, cam


for spec in argv[1:]:
    path, k = (spec.rsplit(':', 1) + ['1'])[:2] if ':' in os.path.basename(spec) else (spec, '1')
    k = float(k)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('lod0'))
    for o in list(bpy.context.scene.objects):
        if o.type == 'MESH' and o != ob: bpy.data.objects.remove(o, do_unlink=True)
    me = ob.data
    mw = ob.matrix_world
    for v in me.vertices:
        p = mw @ v.co
        if p.z < 0: p.z *= k
        v.co = mw.inverted() @ p
    me.update()
    sc, cam = setup()
    name = os.path.splitext(os.path.basename(path))[0]
    files = []
    for i, (a, d, y, ty) in enumerate([(0, 2.1, -.035, -.12), (1.57, 2.1, -.035, -.12), (3.14, 2.1, -.035, -.12), (4.71, 2.1, -.035, -.12),
                                        (.8, 2.6, -.9 * k, -.05), (3.9, 2.6, -.9 * k, -.05)]):
        cam.location = (math.cos(a) * d, math.sin(a) * d, y)
        dvec = mathutils.Vector((0, 0, ty)) - cam.location
        cam.rotation_euler = dvec.to_track_quat('-Z', 'Y').to_euler()
        f = os.path.join(OUT, f'{name}_{"h" if i < 4 else "u"}{i}.png'); sc.render.filepath = f
        bpy.ops.render.render(write_still=True); files.append(f)
    # 拼图
    imgs = [bpy.data.images.load(f) for f in files]
    W, H = imgs[0].size
    sheet = bpy.data.images.new('sheet', W * 3, H * 2)
    px = [0.0] * (W * 3 * H * 2 * 4)
    for n, im in enumerate(imgs):
        src = list(im.pixels[:]); ox = (n % 3) * W; oy = (1 - n // 3) * H
        for row in range(H):
            o = ((oy + row) * W * 3 + ox) * 4
            px[o:o + W * 4] = src[row * W * 4:(row + 1) * W * 4]
    sheet.pixels[:] = px
    sheet.filepath_raw = os.path.join(OUT, name + '_seam.png'); sheet.file_format = 'PNG'; sheet.save()
    for f in files: os.remove(f)
    print('SEAM', name, 'k', k, '->', sheet.filepath_raw)
