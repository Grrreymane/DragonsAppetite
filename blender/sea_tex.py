# 海龙底色贴图调色（系统 python + numpy + Pillow + OpenCV）：三个年纪都拉到设定图的同一组目标色
#   python blender/sea_tex.py <tripo.glb 或 底色图> <输出.png> [--labels 面标签.json] [--size 1024] [--report] [--debug 目录]
#   python blender/sea_tex.py --report-only <导出的 glb 或 png>      只量，不改（验收用：量游戏里真正用的那张图）
# rig_sea.py 会自动调用（--labels 由它按 3D 位置生成：fin = 背鳍 / 尾鳍，leg = 腿，head = 头）。
#
# 规则（v2_review_seamodels.md 第 1、2、3 条）：
#   先缩到 1024 再调（以前在 2048 上调完再缩，斑点被抹掉一大半）。
#   每块区域拉到同一个目标色（Lab 空间：均值对准目标，保留明暗细节），不是乘固定倍数：
#     藏青 (54,70,88)  海青（鳍 + 身上的青色块）(73,121,135) 且亮度 ≤0.56  奶白 (176,187,172)
#     斑点 (72,224,218)：亮度 ≥0.8，饱和 ≥0.6（WebP 的色度降采样会把小斑点洗淡，所以比 review 建议的 90,215,215 再饱和一点、斑点外扩 1 像素）
#       → shader 的发光键（色相 165–200、饱和 >0.5、亮度 >0.68）只点亮斑点
#   没用到的贴图区域（UV 岛之间）用周围颜色平滑填满：省 5–9% 体积，缩小（mipmap）时接缝也不会渗进杂色
#   鳍不认颜色，认 3D 位置（少年龙的鳍在原图里是灰藏青）；腿上的奶白（手臂内侧）改成藏青，游泳时不会从背上看见白块。
#   斑点：青色、比周围亮的小块，闭运算 + 填洞（以前只认「比模糊图亮」，大斑点只亮一圈边、中间是暗的）。
#   铜色（鳍尖、刺尖）三个年纪拉到同一个目标 (160,110,80)；耳鳍（label ear，头骨轮廓外往两边伸的薄片）拉到奶白，铜边不动。
import sys, io, os, json, struct
import numpy as np
from PIL import Image
import cv2

TARGET = {'navy': (54, 70, 88), 'teal': (73, 121, 135), 'cream': (176, 187, 172), 'spot': (72, 224, 218), 'copper': (160, 110, 80)}
LABELS = {'body': 0, 'fin': 1, 'leg': 2, 'head': 3, 'ear': 4}

def base_image(path):
    if not path.lower().endswith('.glb'): return Image.open(path).convert('RGB')
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); BIN = 20 + jl + 8
    ti = j['materials'][0]['pbrMetallicRoughness']['baseColorTexture']['index']; tex = j['textures'][ti]
    src = tex['source'] if 'source' in tex else tex['extensions']['EXT_texture_webp']['source']   # 导出的 glb 走 WebP 扩展
    im = j['images'][src]; v = j['bufferViews'][im['bufferView']]; o = BIN + v.get('byteOffset', 0)
    return Image.open(io.BytesIO(b[o:o + v['byteLength']])).convert('RGB')

def rgb2hsv(a):
    mx = a.max(2); mn = a.min(2); d = mx - mn; s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; dd = np.maximum(d, 1e-6)
    h = np.where(mx == r, ((g - b) / dd) % 6, np.where(mx == g, (b - r) / dd + 2, (r - g) / dd + 4)) * 60
    return np.where(d > 1e-6, h, 0), s, mx
def ss(e0, e1, x): t = np.clip((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t)
def to_lab(a): return cv2.cvtColor(a.astype(np.float32), cv2.COLOR_RGB2Lab)
def to_rgb(l): return np.clip(cv2.cvtColor(l.astype(np.float32), cv2.COLOR_Lab2RGB), 0, 1)
def lab_of(rgb): return to_lab(np.array([[rgb]], np.float32) / 255)[0, 0]

def coverage(labels, N, pad=3):
    """贴图上真正用到的区域（所有 UV 三角形，外扩 pad 像素）"""
    m = np.zeros((N, N), np.uint8)
    for tris in labels.values():
        if not tris: continue
        pts = (np.array(tris, np.float64).reshape(-1, 3, 2) * [N, -N] + [0, N]) * 16
        cv2.fillPoly(m, list(np.round(pts).astype(np.int32)), 1, lineType=cv2.LINE_8, shift=4)
    return cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=pad).astype(np.float32)
def pushpull(img, m):
    """把 m=0 的地方用周围（m=1）颜色平滑填满（加权金字塔：先缩再放）"""
    levels = []; c = img * m[..., None]; w = m.copy()
    while c.shape[0] > 4:
        levels.append((c, w)); c = cv2.pyrDown(c); w = cv2.pyrDown(w)
    fill = c / np.maximum(w[..., None], 1e-6)
    for c, w in reversed(levels):
        up = cv2.resize(fill, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_LINEAR)
        k = np.clip(w * 4, 0, 1)[..., None]
        fill = c / np.maximum(w[..., None], 1e-6) * k + up * (1 - k)
    return img * m[..., None] + fill * (1 - m[..., None])
def label_map(labels, N):
    """面标签 → 贴图上的区域图（0 身体 1 鳍 2 腿 3 头 4 耳鳍），每块往外扩 3 像素盖住接缝"""
    L = np.zeros((N, N), np.uint8); cover = np.zeros((N, N), np.uint8)
    for name in ('body', 'leg', 'head', 'ear', 'fin'):   # 后画的盖前画的：鳍最优先
        tris = labels.get(name, [])
        if not tris: continue
        m = np.zeros((N, N), np.uint8)
        pts = (np.array(tris, np.float64).reshape(-1, 3, 2) * [N, -N] + [0, N]) * 16    # UV（v 朝上）→ 像素（行朝下），4 位小数精度
        cv2.fillPoly(m, list(np.round(pts).astype(np.int32)), 1, lineType=cv2.LINE_8, shift=4)
        m = cv2.dilate(m, np.ones((3, 3), np.uint8), iterations=1)
        L[m > 0] = LABELS[name]; cover |= m
    grow = cv2.dilate(L, np.ones((5, 5), np.uint8))   # 没盖到的缝隙（UV 岛之间）按邻居补
    L = np.where(cover > 0, L, grow)
    return L

def classify(a, L):
    h, s, v = rgb2hsv(a)
    fin, leg, head, ear = (L == 1), (L == 2), (L == 3), (L == 4)
    copper = ss(0.25, 0.4, s) * (ss(0, 8, h) * (1 - ss(42, 55, h)) + ss(340, 352, h)) * ss(0.18, 0.3, v)
    cream = (1 - ss(0.13, 0.24, s)) * ss(0.42, 0.55, v) * (1 - copper)
    cyan = ss(158, 168, h) * (1 - ss(205, 215, h))
    # 斑点：青色 + 比周围亮（大半径模糊，斑点再大也能整块认出来）或者本身就很亮
    blur = cv2.GaussianBlur(v.astype(np.float32), (0, 0), 9)
    cand = (cyan > .5) & (s > 0.3) & (((v - blur) > 0.07) & (v > 0.32) | (v > 0.62)) & ~fin & ~head & ~ear
    m = cand.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    ff = m.copy(); pad = np.zeros((m.shape[0] + 2, m.shape[1] + 2), np.uint8)       # 填洞：从边上灌水，灌不到的就是洞
    inv = (1 - ff).astype(np.uint8); cv2.floodFill(inv, pad, (0, 0), 0); m = m | inv
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    N = a.shape[0]; amax = int(700 * (N / 1024) ** 2)
    keep = np.zeros(n, bool); keep[1:] = (st[1:, cv2.CC_STAT_AREA] >= 3) & (st[1:, cv2.CC_STAT_AREA] <= amax)
    spot = cv2.dilate(keep[lab].astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
    spot = np.clip(cv2.GaussianBlur(spot, (0, 0), 0.7) * 1.4, 0, 1) * (~fin) * (~head) * (~ear)
    # 海青：鳍（按 3D 位置，不看颜色，只排除铜色边和很白的部分）+ 身体上本来就是青色的块
    # 身体上的青色块：色相偏青（≤202）而且比藏青亮（Tripo 的藏青本身色相也在 199 左右，只能靠亮度分开）
    tealhue = ss(165, 172, h) * (1 - ss(198, 206, h))
    teal = np.where(fin, (1 - copper) * (1 - ss(0.62, 0.75, v) * (1 - ss(0.1, 0.2, s))),
                    tealhue * ss(0.33, 0.43, s) * ss(0.36, 0.46, v) * (1 - cream) * (1 - copper)) * (1 - spot)
    teal = teal * (~ear)
    leg_cream = cream * leg * (1 - spot)
    ear_cream = (1 - copper) * ear                     # 耳鳍：整片拉到奶白，铜色边不动（设定图里耳鳍是浅色带铜边）
    cream = cream * (~fin) * (~leg) * (~ear) * (1 - spot)
    navy = np.clip(1 - copper - cream - teal - spot, 0, 1) * (~fin) * (~ear)
    return dict(h=h, s=s, v=v, copper=copper, cream=cream, teal=teal, spot=spot, navy=navy, leg_cream=leg_cream, ear_cream=ear_cream, fin=fin)

def pull(lab, w, target, l_detail=1.0, ab_detail=0.5, k=1.0, src=None, l_dark=None):
    """把权重 w 的区域拉到目标色：均值对准目标，偏离均值的部分（明暗、色差）按 detail 保留
    l_dark：比均值暗的部分另用一个（更小的）保留比例，把很暗的地方往目标提（鳍上藏青色的刺 → 海青，亮的渐变照留）"""
    src = w if src is None else src
    sel = src > 0.5
    if sel.sum() < 20: return lab
    mu = lab[sel].mean(0); t = lab_of(target)
    new = np.empty_like(lab)
    dL = lab[..., 0] - mu[0]
    new[..., 0] = t[0] + dL * (l_detail if l_dark is None else np.where(dL < 0, l_dark, l_detail))
    new[..., 1:] = t[1:] + (lab[..., 1:] - mu[1:]) * ab_detail
    ww = (w * k)[..., None]
    return lab * (1 - ww) + new * ww

def grade(img, labels=None, N=1024):
    img = img.resize((N, N), Image.LANCZOS) if img.size[0] != N else img     # 先缩，再调
    a = np.asarray(img).astype(np.float32) / 255
    L = label_map(labels, N) if labels else np.zeros((N, N), np.uint8)
    C = classify(a, L)
    lab = to_lab(a)
    lab = pull(lab, C['navy'], TARGET['navy'], 1.0, 0.45)
    lab = pull(lab, C['teal'], TARGET['teal'], 0.9, 0.45, l_dark=0.5)       # 鳍里很暗的刺（幼龙头冠、少年龙脖子上的刺）往海青提
    lab = pull(lab, C['cream'], TARGET['cream'], 0.8, 0.35)
    lab = pull(lab, C['leg_cream'], TARGET['navy'], 0.45, 0.2)                 # 手臂内侧的奶白 → 藏青
    lab = pull(lab, C['ear_cream'], TARGET['cream'], 0.6, 0.3)                 # 耳鳍 → 奶白
    lab = pull(lab, C['copper'], TARGET['copper'], 0.8, 0.45)                  # 铜色：三个年纪拉到同一个（幼龙以前偏亮橙，v3 review 第 7 条）
    lab = pull(lab, C['spot'], TARGET['spot'], 0.35, 0.25)
    out = to_rgb(lab)
    # 鳍和青色块：亮度封顶 0.56（饱和度高的才封，鳍根的浅色不管），保证发光键只认斑点
    h, s, v = rgb2hsv(out)
    capm = (C['teal'] > 0.3) & (s > 0.4) & (v > 0.56)
    out[capm] *= (0.56 / v[capm])[:, None]
    # 斑点：亮度 ≥0.82，饱和 ≥0.56
    sp = C['spot'] > 0.5
    h, s, v = rgb2hsv(out)
    fix = sp & ((v < 0.82) | (s < 0.56))
    if fix.any():
        t = np.array(TARGET['spot'], np.float32) / 255
        out[fix] = out[fix] * 0.3 + t * 0.7
    if labels: out = pushpull(out.astype(np.float32), coverage(labels, N))
    stats = {k: round(float((C[k] > .5).mean()) * 100, 2) for k in ('navy', 'teal', 'cream', 'spot', 'copper', 'leg_cream', 'ear_cream')}
    return Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)), stats, L

def report(img, tag):
    a = np.asarray(img).astype(np.float32) / 255; h, s, v = rgb2hsv(a)
    def mean(m): return tuple(int(x) for x in (a[m].mean(0) * 255)) if m.any() else None
    navy = (h > 195) & (h < 235) & (s > 0.25) & (v < 0.45)
    teal = (h > 178) & (h < 205) & (s > 0.35) & (v > 0.3) & (v < 0.62)
    belly = (s < 0.15) & (v > 0.5)
    key = (h > 165) & (h < 200) & (s > 0.5) & (v > 0.68)
    nav_s = float(s[navy].mean()) if navy.any() else 0
    print(f'{tag}: glowkey {float(key.mean()) * 100:.2f}%  navy {mean(navy)} sat {nav_s:.2f}  teal {mean(teal)} {float(teal.mean()) * 100:.1f}% '
          f'(V>0.56 {float((teal & (v > .56)).sum() / max(teal.sum(), 1)):.3f})  cream {mean(belly)}  spots {mean(key)}')
    return dict(glowkey=float(key.mean()) * 100, navy=mean(navy), teal=mean(teal), cream=mean(belly))

if __name__ == '__main__':
    if sys.argv[1] == '--report-only':
        report(base_image(sys.argv[2]), os.path.basename(sys.argv[2])); sys.exit(0)
    src, dst = sys.argv[1], sys.argv[2]
    arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
    labels = json.load(open(arg('--labels'), encoding='utf-8')) if arg('--labels') else None
    N = int(arg('--size', 1024))
    img = base_image(src); out, st, L = grade(img, labels, N)
    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    out.save(dst); print('SAVED', dst, out.size, st)
    if arg('--debug'):
        d = arg('--debug'); os.makedirs(d, exist_ok=True)
        pal = np.array([[60, 60, 60], [40, 200, 200], [230, 120, 40], [200, 60, 200], [240, 235, 200]], np.uint8)
        Image.fromarray(pal[L]).save(os.path.join(d, 'labels.png'))
        img.resize((N, N), Image.LANCZOS).save(os.path.join(d, 'before.png'))
    if '--report' in sys.argv: report(img.resize((N, N), Image.LANCZOS), 'before'); report(out, 'after ')
