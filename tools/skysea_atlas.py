"""把抠好的云 / 烟 / 卷云拼成一张图集：img/clouds.webp（带透明）+ src/view/cloud-atlas-rects.js（每块的像素矩形）。
    python tools/skysea_atlas.py
来源：.cache/art/skysea/cut/*.png（tools/skysea_key.py 切出来的），下面 ITEMS 表写每块用哪张、叫什么、缩放多少。"""
import pathlib, json
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
CUT = ROOT / '.cache/art/skysea/cut'
W, H = 2048, 1024
# (名字, 文件, 缩放)
ITEMS = [
    ('cu0', 'cA_0.png', .62),   # 高耸的积云
    ('cu1', 'cA_1.png', .62),   # 宽积云
    ('cu3', 'cA_3.png', .62),   # 宽积云 2
    ('cu2', 'cA_2.png', .62),   # 扁长的云带
    ('cu4', 'cA_4.png', .62),   # 小团
    ('cu5', 'cA_5.png', .62),   # 小团 2
    ('sm0', 'sB_0.png', .55), ('sm1', 'sB_1.png', .55), ('sm2', 'sB_2.png', .55),   # 火山烟
    ('wi0', 'sB_3.png', .5), ('wi1', 'sB_4.png', .5), ('wi2', 'sB_5.png', .5),      # 高空卷云
]
PAD = 16   # 块和块之间留宽一点：mip 3 级以上也不互相渗色

def fix_glow(im):
    """sm0 底下那圈橙色辉光和绿幕混成了黄绿色（抠图时反解不出来）：按「黄的程度」把颜色拉回橙色、透明度压低。"""
    import numpy as np
    A = np.asarray(im).astype(np.float32)
    R, G, B, a = A[..., 0], A[..., 1], A[..., 2], A[..., 3]
    y = (G - B) / np.maximum(R - B, 1)
    t = np.clip((y - .55) / .25, 0, 1); k = t * t * (3 - 2 * t) * (a > 0)
    A[..., 1] = G + (B + .42 * (R - B) - G) * k
    A[..., 3] = a * (1 - .8 * k)
    A[..., 3] = np.where(A[..., 3] < 20, 0, A[..., 3])
    return Image.fromarray(np.clip(A, 0, 255).astype(np.uint8), 'RGBA')
FIX = {'sm0': fix_glow}

def main():
    ims = []
    for name, f, s in ITEMS:
        p = CUT / f
        if not p.exists(): print('缺', f); continue
        im = Image.open(p).convert('RGBA')
        if name in FIX: im = FIX[name](im)
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        ims.append((name, im))
    # 货架装箱：按高度从大到小一排排放
    order = sorted(ims, key=lambda t: -t[1].height)
    atlas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    x = y = PAD // 2; rowh = 0; rects = {}
    for name, im in order:
        if x + im.width + PAD > W: x = PAD // 2; y += rowh + PAD; rowh = 0
        if y + im.height > H: raise SystemExit(f'放不下：{name}，把缩放调小')
        atlas.paste(im, (x, y)); rects[name] = [x, y, im.width, im.height]
        x += im.width + PAD; rowh = max(rowh, im.height)
    used = y + rowh
    print('用到高度', used, '/', H)
    # 透明处的颜色往外扩一点（mip 时边上不发黑）：用模糊后的预乘色填透明像素
    from PIL import ImageFilter
    import numpy as np
    A = np.asarray(atlas).astype(np.float32)
    a = A[..., 3:4] / 255
    for r in (4, 16, 48):
        im2 = Image.fromarray((A[..., :3] * (a > .5)).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
        w2 = Image.fromarray(((a[..., 0] > .5) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))
        c2 = np.asarray(im2).astype(np.float32); ww = np.asarray(w2).astype(np.float32)[..., None] / 255
        fill = (a < .5) & (ww > .02) & (A[..., :3].sum(-1, keepdims=True) == 0)
        A[..., :3] = np.where(fill, c2 / np.maximum(ww, 1e-3), A[..., :3])
    atlas = Image.fromarray(np.clip(A, 0, 255).astype(np.uint8), 'RGBA')
    Hc = min(H, (used + PAD + 15) // 16 * 16)   # 裁掉下面没用的行
    atlas = atlas.crop((0, 0, W, Hc))
    out = ROOT / 'img/clouds.webp'
    atlas.save(out, 'WEBP', quality=86, method=6, alpha_quality=90)
    print(out, out.stat().st_size // 1024, 'KB')
    js = ROOT / 'src/view/cloud-atlas-rects.js'
    js.write_text('// 由 tools/skysea_atlas.py 生成：云图集 img/clouds.webp 里每块的像素矩形 [x, y, w, h]（左上角为原点）\n'
                  f'export const ATLAS_SIZE = [{W}, {Hc}];\nexport const RECTS = {json.dumps(rects)};\n', encoding='utf-8')
    print(js)
    prev = Image.new('RGBA', (W, Hc), (70, 120, 200, 255)); prev.alpha_composite(atlas)
    prev.convert('RGB').resize((W // 2, Hc // 2)).save(ROOT / '.cache/art/skysea/atlas_preview.jpg', quality=88)

main()
