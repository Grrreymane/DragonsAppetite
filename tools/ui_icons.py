"""界面美术打包（ui 模块）：把 AI 生成的原图（白底）抠底、切格、拼成上线用的 WebP。

    python tools/ui_icons.py            # 读 .cache/art/ui/raw/*.png → img/ui/icons.webp、logo.webp、title_bg.webp、card_fire.webp、card_sea.webp
    python tools/ui_icons.py --preview  # 另存一张深色 / 浅色底的检查图到 .cache/art/ui/preview_*.png
    python tools/ui_icons.py --only icons --q 82   # 只打图集，指定 WebP 质量

原图的提示词见 docs/art-prompts/ui.md。抠底：从图边往里泛洪「接近白色」的像素当背景；贴着背景的一圈按白度给半透明
（画的图标外圈都是深色描边，所以半透明边按深色描边算，不会留白边）。
图集：一格 CELL px，四周留 GUT px 透明边（浏览器缩小时邻格不会渗进来）。打完会自动改写 src/ui/icons.js 里的
SHEET.v（图集内容的哈希，当网址缓存参数）和 SHEET.names（格子顺序），所以别手改那两行。
"""
import argparse, hashlib, json, pathlib, re, sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / '.cache/art/ui/raw'
OUT = ROOT / 'img/ui'
CELL = 192      # 一格（显示最大约 64 CSS px，3 倍屏 ≈ 190 设备像素）
GUT = 8         # 每格四周的透明边
INNER = CELL - 2 * GUT
JS = ROOT / 'src/ui/icons.js'

# 原图 → 网格（列, 行）→ 每格的名字（None = 不要）
SOURCES = [
    ('abil_01.png', 3, 3, ['bite', 'fire', 'plunge', 'roar', None, None, 'vortex', 'gulp', 'lock']),   # 冲刺 / 跃出 换成 seaicons 里照海龙设定画的
    ('menu_01.png', 3, 3, ['menu', 'sound', 'mute', 'book', 'dragon', None, 'share', 'hand', 'back']),   # 「继续」三角一直用白色 SVG，不进图集
    ('heads_01.png', 3, 2, ['head_fire0', 'head_fire1', 'head_fire2', 'head_sea0', 'head_sea1', 'head_sea2']),
    ('seaicons_01.png', 3, 2, [None, 'breach', 'bite_sea', 'gulp_sea', 'clock', 'star']),
    ('dash_01.png', 2, 2, [None, 'dash', None, None]),   # 冲刺：四个方案里挑右上（龙头 + 前身往右冲）。原来的左下也是斜着往上 + 水花，和「跃出」太像
    # 海龙阶段头像重画（docs/art-prompts/ui.md §11，.cache/art/ui/queue_heads.py）。有这张就用它，盖掉 heads_01 下排；没有就用下面 NAVY 的本地改色
    ('seaheads_01.png', 3, 1, ['head_sea0', 'head_sea1', 'head_sea2']),
]
OPTIONAL = {'seaheads_01.png'}
# heads_01 下排的海龙头像是浅天蓝色，和模型 / 龙卡 / 海龙图标（深海军蓝 + 青色鳍 + 奶油色喉咙）对不上：本地改色（见 navy_sea）
NAVY = {'head_sea0', 'head_sea1', 'head_sea2'}
# 画完以后再加工：冲刺加三道粗速度线（见 speed_lines），44px 的按钮上也一眼看出「快」
POST = {'dash': 'speed'}
LAYOUT = ['bite', 'fire', 'plunge', 'roar', 'dash', 'breach',
          'vortex', 'gulp', 'lock', 'menu', 'sound', 'mute',
          'book', 'dragon', 'share', 'hand', 'back', 'clock',
          'head_fire0', 'head_fire1', 'head_fire2', 'head_sea0', 'head_sea1', 'head_sea2',
          'bite_sea', 'gulp_sea', 'star']
COLS = 6
CIRCLE = {'head_fire0'}   # 只留圆框以内
# 生成图里照抄参考图的字 / 色块：相对坐标 x0 y0 x1 y1；'grey' 只刷白灰色像素，'all' 整块刷白
CLEAN = {'heads_01.png': [(0.0, 0.0, 0.24, 0.075, 'grey')],
         'seaicons_01.png': [(0.0, 0.0, 0.25, 0.085, 'all'), (0.84, 0.0, 1.0, 0.085, 'all')]}
HOLES = {'dragon': 400, 'back': 400, 'lock': 300}   # 这些图标中间的白洞也挖掉
# 抠底阈值（默认 232 / 26）：「返回」箭头上沿的高光很白，默认阈值会连着描边一起挖掉
THR = {'back': (242, 14)}
# 这些原图里的图标越过了均分的格子线（冲刺的鼻子伸进跃出那格）：整张抠底后按「连在一起的块」分组，块的中心落在哪格就归哪格
BLOBS = {'seaicons_01.png', 'dash_01.png'}


def cut_white(im, thr=232, sat=26, holes=0, band_mode='ink'):
    """白底 → 透明。返回 RGBA。holes > 0：被包住的白色块（面积 > holes 像素，如循环箭头中间的洞）也挖掉。
    band_mode='ink'：外圈是深色描边；'soft'：外圈是浅色（标题字的奶油色外框），只按白度给半透明、不改颜色。"""
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    mn, mx = a.min(2), a.max(2)
    whiteish = (mn >= thr) & (mx - mn <= sat)
    H, W = whiteish.shape
    bg = np.zeros((H, W), bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if whiteish[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if whiteish[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not bg[ny, nx] and whiteish[ny, nx]:
                bg[ny, nx] = True; q.append((ny, nx))
    if holes:
        seen = bg.copy()
        for y0, x0 in zip(*np.nonzero(whiteish & ~bg)):
            if seen[y0, x0]: continue
            comp = [(y0, x0)]; seen[y0, x0] = True; i = 0
            while i < len(comp):
                y, x = comp[i]; i += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W and not seen[ny, nx] and whiteish[ny, nx]:
                        seen[ny, nx] = True; comp.append((ny, nx))
            if len(comp) > holes:
                ys, xs = zip(*comp); bg[list(ys), list(xs)] = True
    alpha = np.where(bg, 0, 255).astype(np.float32)
    rgb = a.astype(np.float32)
    if band_mode == 'soft':
        near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
        band = near & ~bg
        k = np.clip((255 - a.min(2)) / 40, 0, 1)
        alpha = np.where(band, np.minimum(alpha, k * 255), alpha)
        return Image.fromarray(np.dstack([rgb, alpha]).clip(0, 255).astype(np.uint8), 'RGBA')
    # 贴着背景的一圈（3px）：按白度给半透明，颜色按「深色描边 + 白底」反推
    near = np.asarray(Image.fromarray((bg * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    band = near & ~bg
    lum = rgb.mean(2)
    ink = np.array([38, 26, 30], np.float32)
    k = np.clip((250 - lum) / (250 - 60), 0, 1)
    alpha = np.where(band, np.minimum(alpha, k * 255), alpha)
    kk = np.maximum(k, 1e-3)[..., None]
    un = (rgb - (1 - kk) * 255) / kk                     # 反推前景色
    un = np.clip(un, 0, 255)
    mix = np.where((band & (k < .98))[..., None], un * .5 + ink * .5, rgb)
    out = np.dstack([mix, alpha]).clip(0, 255).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')


def split_blobs(cut, cols, rows, k=8, grow=2):
    """整张抠好底的图 → 每格一张（只含中心落在这格里的块；水滴、速度线离主体近，膨胀 grow 格后并进来）。"""
    W, H = cut.size
    a = np.asarray(cut.getchannel('A'))
    small = Image.fromarray(((a > 40) * 255).astype(np.uint8)).resize((W // k, H // k), Image.BOX)
    m = np.asarray(small.point(lambda v: 255 if v > 20 else 0).filter(ImageFilter.MaxFilter(2 * grow + 1))) > 0
    h, w = m.shape
    lab = np.zeros((h, w), np.int32); n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; q = deque([(y0, x0)])
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
    cells = {}
    for i in range(1, n + 1):
        ys, xs = np.nonzero(lab == i)
        if len(xs) < 6: continue                      # 很小的碎点不要
        c = min(cols - 1, int(xs.mean() * k * cols / W)) + cols * min(rows - 1, int(ys.mean() * k * rows / H))
        cells.setdefault(c, []).append(i)
    big = np.kron(lab, np.ones((k, k), np.int32))
    big = np.pad(big, ((0, max(0, H - big.shape[0])), (0, max(0, W - big.shape[1]))), mode='edge')[:H, :W]
    rgba = np.asarray(cut)
    out = {}
    for c, ids in cells.items():
        keep = np.isin(big, ids)
        t = rgba.copy(); t[~keep, 3] = 0
        out[c] = Image.fromarray(t, 'RGBA')
    return out


def speed_lines(tile):
    """冲刺：龙放右边，左边（被画框切掉的后半截身子上）压三道圆头速度线：深色描边 + 白芯 + 下沿淡青，和图标的卡通描边一致。"""
    from PIL import ImageDraw
    bb = tile.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    d = tile.crop(bb)
    k = d.height / 768                                    # 按原图（龙高约 768px）调的数，换图也按比例
    W, H, ox, oy = round(1000 * k), round(900 * k), round(170 * k), round(70 * k)
    cv = Image.new('RGBA', (W, H)); cv.alpha_composite(d, (ox, oy))
    ink = (38, 24, 32, 255)
    for x0, x1, y, t in ((40, 400, 385, 80), (130, 420, 525, 66), (70, 290, 255, 56)):
        x0, x1, y, t, o = x0 * k, x1 * k, (y + 70) * k, t * k, 20 * k
        L = Image.new('RGBA', (W, H)); g = ImageDraw.Draw(L)
        g.rounded_rectangle((x0 - o, y - t / 2 - o, x1 + o, y + t / 2 + o), radius=t / 2 + o, fill=ink)
        g.rounded_rectangle((x0, y - t / 2, x1, y + t / 2), radius=t / 2, fill=(255, 255, 255, 255))
        g.rounded_rectangle((x0 + t * .5, y + t * .08, x1 - t * .3, y + t / 2 - 6 * k), radius=t / 4, fill=(170, 232, 238, 255))
        cv.alpha_composite(L)
    return cv


def _ss(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)


def _hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; mx = a.max(-1); mn = a.min(-1); d = mx - mn + 1e-6
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    return h, np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0), mx


def _rgb(h, s, v):
    h = (h % 360) / 60; i = np.floor(h); f = h - i; p = v * (1 - s); q = v * (1 - s * f); t = v * (1 - s * (1 - f)); i = i.astype(int) % 6
    return np.stack([np.choose(i, [v, q, p, p, t, v]), np.choose(i, [t, v, v, q, p, p]), np.choose(i, [p, p, t, v, v, q])], -1)


def navy_sea(tile):
    """海龙头像改色（tile = fit_ring 之后的一格，金圈占 88%）：只动金圈以内。
    蓝色鳞片（色相 190–235°）→ 深海军蓝（明暗关系保留，整体压暗）；很亮很饱和的蓝（眼睛）→ 青色；
    发白的淡蓝（喉咙、肚皮）→ 奶油色；幼龙的肉粉色耳鳍 → 青色。青绿色底光（170–185°）和描边不动。"""
    a = np.asarray(tile).astype(np.float32) / 255
    rgb = a[..., :3]; h, s, v = _hsv(rgb)
    n = a.shape[0]; yy, xx = np.mgrid[0:n, 0:n]
    rr = np.hypot(xx - n / 2 + .5, yy - n / 2 + .5) / (n / 2)
    inside = 1 - _ss(.74, .79, rr)
    wb = _ss(188, 198, h) * (1 - _ss(228, 238, h)) * _ss(.14, .26, s) * _ss(.1, .2, v) * inside
    we = wb * _ss(.8, .92, v) * _ss(.55, .7, s)
    wp = (1 - _ss(.16, .28, s)) * _ss(.5, .62, v) * _ss(150, 175, h) * (1 - _ss(245, 260, h)) * inside
    wf = (1 - _ss(26, 34, h)) * _ss(.2, .32, s) * _ss(.3, .45, v) * inside * (1 - _ss(.62, .7, rr))
    body = _rgb(np.full_like(h, 212), np.clip(s * .6 + .45, 0, .8), .10 + .46 * v ** 1.35)
    eye = _rgb(np.full_like(h, 176), np.clip(s, 0, .75), np.clip(v * 1.02, 0, 1))
    cream = _rgb(np.full_like(h, 40), np.clip(.15 + s * .5, 0, .3), np.clip(v * .98, 0, 1))
    fin = _rgb(np.full_like(h, 178), np.clip(s + .15, 0, .7), v * .9)
    out = rgb.copy()
    for w, c in ((wb, body), (we, eye), (wp, cream), (wf, fin)): out = out * (1 - w[..., None]) + c * w[..., None]
    return Image.fromarray((np.dstack([out, a[..., 3]]) * 255).clip(0, 255).astype(np.uint8), 'RGBA')


def fit(tile, size=INNER, pad=0):
    """裁到不透明部分的外框，等比缩放放进 size×size 的正中（留 pad）。"""
    bb = tile.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    if not bb: return Image.new('RGBA', (size, size))
    t = tile.crop(bb)
    s = (size - 2 * pad) / max(t.size)
    t = t.resize((max(1, round(t.width * s)), max(1, round(t.height * s))), Image.LANCZOS)
    c = Image.new('RGBA', (size, size))
    c.alpha_composite(t, ((size - t.width) // 2, (size - t.height) // 2))
    return c


def fit_ring(tile, size=INNER, circle=False):
    """阶段头像：按金色圆框对齐（不同年龄的角伸出去多少不一样，按外框裁会大小不一），圆框占格子的 88%，伸出去的角裁掉。"""
    a = np.asarray(tile).astype(np.int16)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    gold = (al > 200) & (r > 170) & (g > 120) & (b < 130) & (r - b > 70) & (g - b > 40)
    ys, xs = np.nonzero(gold)
    if len(xs) < 50: return fit(tile, size)
    x0, x1, y0, y1 = np.percentile(xs, 0.5), np.percentile(xs, 99.5), np.percentile(ys, 0.5), np.percentile(ys, 99.5)
    cx, cy, rad = (x0 + x1) / 2, (y0 + y1) / 2, max(x1 - x0, y1 - y0) / 2
    half = rad / .88
    t = tile.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))
    t = t.resize((size, size), Image.LANCZOS)
    if circle:   # 圆框外的东西全去掉（残留的字）
        yy, xx = np.mgrid[0:size, 0:size]
        out = np.hypot(xx - size / 2 + .5, yy - size / 2 + .5) > size / 2 * .88 * 1.03
        a = np.asarray(t).copy(); a[out, 3] = 0; t = Image.fromarray(a, 'RGBA')
    return t


def build_icons(preview, q=80):
    tiles = {}; navy_done = set()
    for fn, cols, rows, names in SOURCES:
        p = RAW / fn
        if not p.exists():
            if fn not in OPTIONAL: print('缺原图', p)
            continue
        src = Image.open(p).convert('RGB')
        W, H = src.size
        if fn in CLEAN:
            a = np.asarray(src).astype(np.int16)
            for x0, y0, x1, y1, mode in CLEAN[fn]:
                x0, x1, y0, y1 = round(x0 * W), round(x1 * W), round(y0 * H), round(y1 * H)
                box = a[y0:y1, x0:x1]
                if mode == 'all': box[:] = 255
                else: box[(box.max(2) - box.min(2)) < 22] = 255
            src = Image.fromarray(a.clip(0, 255).astype(np.uint8))
        if fn in BLOBS:
            parts = split_blobs(cut_white(src), cols, rows)
            for i, n in enumerate(names):
                if n and i in parts: tiles[n] = fit(speed_lines(parts[i]) if POST.get(n) == 'speed' else parts[i])
            continue
        for i, n in enumerate(names):
            if not n: continue
            c, r = i % cols, i // cols
            t = src.crop((c * W // cols, r * H // rows, (c + 1) * W // cols, (r + 1) * H // rows))
            tiles[n] = fit_ring(cut_white(t), circle=n in CIRCLE) if n.startswith('head_') else fit(cut_white(t, *THR.get(n, (232, 26)), holes=HOLES.get(n, 0)))
            if n in NAVY:
                if fn == 'heads_01.png': tiles[n] = navy_sea(tiles[n]); navy_done.add(n)
                else: navy_done.discard(n)    # 重画的新头像本来就是深蓝，不改色
    if navy_done: print('海龙头像本地改色：', sorted(navy_done))
    missing = [n for n in LAYOUT if n not in tiles]
    if missing: print('图集缺：', missing)
    rows = (len(LAYOUT) + COLS - 1) // COLS
    sheet = Image.new('RGBA', (COLS * CELL, rows * CELL))
    for i, n in enumerate(LAYOUT):
        if n in tiles: sheet.alpha_composite(tiles[n], ((i % COLS) * CELL + GUT, (i // COLS) * CELL + GUT))
    OUT.mkdir(parents=True, exist_ok=True)
    f = OUT / 'icons.webp'
    sheet.save(f, 'WEBP', quality=q, method=6, alpha_quality=88)
    ver = hashlib.sha1(f.read_bytes()).hexdigest()[:8]
    print(f.relative_to(ROOT), sheet.size, f.stat().st_size // 1024, 'KB  v=' + ver)
    # 改写 icons.js 的 SHEET.v / cell / cols / rows / names
    js = JS.read_text(encoding='utf-8')
    js = re.sub(r"v: '[0-9a-f]*',", f"v: '{ver}',", js, count=1)
    js = re.sub(r"cell: \d+, cols: \d+, rows: \d+,", f"cell: {CELL}, cols: {COLS}, rows: {rows},", js, count=1)
    js = re.sub(r"names: \[[^\]]*\],", 'names: ' + json.dumps(LAYOUT).replace('"', "'").replace("','", "', '") + ',', js, count=1)
    JS.write_text(js, encoding='utf-8')
    if preview:
        for name, col in (('dark', (40, 30, 50)), ('light', (250, 236, 205))):
            bg = Image.new('RGBA', sheet.size, col + (255,)); bg.alpha_composite(sheet)
            bg.convert('RGB').save(ROOT / f'.cache/art/ui/preview_icons_{name}.png')


def build_logo(preview):
    for cand in ('logo_pick.png', 'logo_a_01.png', 'logo_b_01.png'):   # AI 去背景版把眼睛高光也抠透了，用本地抠底
        p = RAW / cand
        if p.exists(): break
    else: print('缺标题字原图'); return
    im = Image.open(p)
    im = im.convert('RGBA') if 'nobg' in p.name else cut_white(im, band_mode='soft')
    bb = im.getchannel('A').point(lambda v: 255 if v > 10 else 0).getbbox()
    im = im.crop(bb)
    w = 720
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    f = OUT / 'logo.webp'
    im.save(f, 'WEBP', quality=90, method=6, alpha_quality=92)
    print(f.relative_to(ROOT), im.size, f.stat().st_size // 1024, 'KB  (from', p.name + ')')
    if preview:
        bg = Image.new('RGBA', im.size, (90, 160, 220, 255)); bg.alpha_composite(im); bg.convert('RGB').save(ROOT / '.cache/art/ui/preview_logo.png')


def build_bg():
    for cand in ('bg_pick.png', 'bg_01.png'):
        p = RAW / cand
        if p.exists(): break
    else: print('缺标题背景原图'); return
    im = Image.open(p).convert('RGB')
    # 9:16 裁正，720×1280
    W, H = im.size; tw = min(W, round(H * 9 / 16)); th = round(tw * 16 / 9)
    im = im.crop(((W - tw) // 2, (H - th) // 2, (W - tw) // 2 + tw, (H - th) // 2 + th)).resize((720, 1280), Image.LANCZOS)
    f = OUT / 'title_bg.webp'
    im.save(f, 'WEBP', quality=78, method=6)
    print(f.relative_to(ROOT), im.size, f.stat().st_size // 1024, 'KB  (from', p.name + ')')


def build_cards(preview, q=74):
    """标题页两张龙卡的插画（AI 照概念设定画的少年龙，白底）→ 抠底 → 整张铺满卡片（3:4.1，翅膀出血到卡边）。"""
    for kind in ('fire', 'sea'):
        p = RAW / f'card_{kind}_01.png'
        if not p.exists(): print('缺龙卡原图', p); continue
        im = Image.open(p).convert('RGB')
        im = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)          # 先缩一半再抠（快，边也更干净）
        cut = cut_white(im, holes=1500)                                       # 尾巴圈住的白底也挖掉（眼睛高光很小，不会被挖）
        w, h = 390, 533                                                       # 和卡片一样 3:4.1（卡片最宽约 200 CSS px）
        s = max(w / cut.width, h / cut.height)
        cut = cut.resize((round(cut.width * s), round(cut.height * s)), Image.LANCZOS)
        x0, y0 = (cut.width - w) // 2, (cut.height - h) // 2
        cut = cut.crop((x0, y0, x0 + w, y0 + h))
        f = OUT / f'card_{kind}.webp'
        cut.save(f, 'WEBP', quality=q, method=6, alpha_quality=85)
        print(f.relative_to(ROOT), cut.size, f.stat().st_size // 1024, 'KB')
        if preview:
            bg = Image.new('RGBA', cut.size, (240, 140, 60, 255) if kind == 'fire' else (40, 140, 160, 255)); bg.alpha_composite(cut)
            bg.convert('RGB').save(ROOT / f'.cache/art/ui/preview_card_{kind}.png')


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--preview', action='store_true')
    ap.add_argument('--only', default='icons,logo,bg,cards')
    ap.add_argument('--q', type=int, default=80, help='图集的 WebP 质量')
    a = ap.parse_args()
    only = a.only.split(',')
    if 'icons' in only: build_icons(a.preview, a.q)
    if 'cards' in only: build_cards(a.preview)
    if 'logo' in only: build_logo(a.preview)
    if 'bg' in only: build_bg()
