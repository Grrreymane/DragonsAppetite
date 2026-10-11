# 尾锤（菱形晶块）贴图的画法：纯 numpy，Blender 里（firemodels_lib.club_texture 调用）和系统 python 里都能跑
#   系统 python 单独预览：python D:/Minigame/Dragon/blender/club_paint.py <out.png> [baby|teen] [mirror]
#     → <out.png> 放大的展开图（看不到的地方压暗）+ <out>_back.png「从正后方看」的样子（追尾镜头看到的就是这个）
# v4（2026-10-11，按 v3 复审改；v3 的问题：金铜色、浅色棱边围成一个框、又长又直顺着棱走的裂纹镜像以后像「Z / 4 / A」）：
#   - 颜色：深的暖灰玄武岩，上切面亮、下切面明显暗，四片各差一点（网格是平滑法线，光照分不出切面，切面只能画在贴图里）；不画棱边亮线
#   - 裂纹像「从正后方贴上去的花纹」：在「从正后方看」的平面上（尾尖 = 菱形中心，最宽一圈 = 外轮廓）生成 2~3 条
#     折来折去、带分叉的斜裂纹（左右不对称，不沿外轮廓、不沿棱走），再按每片切面的仿射关系换到贴图像素里量距离 → 线宽在贴图里是匀的
#     （rebuild_club 把展开坐标改成和 3D 切面只差一个缩放：u 按棱上的实际位置，尾尖的 UV 放在切面的垂足上）
#   - 左右不再共用一块贴图（mirror=False）：v3 镜像展开，追尾镜头同时看到左右两半，裂纹拼成左右对称的「字」
#   - 光晕收窄（约 2 像素），核心约 2 像素宽（导出贴图里；WEBP 会把 1 像素的亮线压成一串点）
#   - src：可以给一张「玄武岩 + 熔岩裂纹」参考图（AI，见 docs/art-prompts/firemodels.md）的裂纹点云（从正后方看的平面坐标），
#     代替程序生成的裂纹
import math, random
import numpy as np

PALETTE = {   # sRGB 0..1；绑定脚本各自传 palette=（现在两条龙一样，值和理由见 rig_fire_baby.py 的 CLUB_PALETTE）
    'upper': (0.30, 0.275, 0.285), 'lower': (0.20, 0.18, 0.19),
    'glow': (0.9, 0.28, 0.05), 'core': (1.0, 0.52, 0.14),
}
FACET_K = (1.06, 1.0, 0.9, 0.94)    # 四片后切面（顶→右侧、右侧→底、底→左侧、左侧→顶）各自再乘一点：像一侧来光的晶体


def club_geom(H, W, mid_a, tip_a, a0, r0):
    """菱形晶块的切面尺寸（模型单位）：H / W = 最宽一圈菱形的半高 / 半宽，E = 一条边长，inr = 中心到边的距离，
    Hb = 后切面（对着尾尖）三角形的高，Hf = 前切面（对着尾杆）的斜高，fup = 上切面里尾尖垂足在棱上的位置（从顶角量，0..1）"""
    E = math.hypot(H, W); inr = H * W / E
    return {'H': H, 'W': W, 'E': E, 'inr': inr, 'Hb': math.hypot(tip_a - mid_a, inr), 'Hf': math.hypot(mid_a - a0, max(0.0, inr - r0)),
            'fup': H * H / (H * H + W * W)}


# ---------------- 「从正后方看」的平面（s = 侧向，展开方向为正；z = 向上；单位 = 模型单位） ----------------
def _quads(g):
    H, W, fup = g['H'], g['W'], g['fup']
    T, Sp, Bt, Sm = np.array((0., H)), np.array((W, 0.)), np.array((0., -H)), np.array((-W, 0.))
    # 每片：(起点角 A, 终点角 B, 尾尖垂足 fa, 外法线 n)；顺序 = 展开图里 u 增加的方向（和 rebuild_club 一致）
    out = []
    for A, B, fa, sg in ((T, Sp, fup, (1, 1)), (Sp, Bt, 1 - fup, (1, -1)), (Bt, Sm, fup, (-1, -1)), (Sm, T, 1 - fup, (-1, 1))):
        n = np.array((sg[0] / W, sg[1] / H)); n /= np.linalg.norm(n)
        out.append((A, B, fa, n))
    return out


def to_texel(pts, g, q, P, Hbp):
    """平面上的点 → 第 q 片后切面的贴图像素坐标 (x 沿最宽一圈的棱, y 往尾尖)；在这片的半平面外面的点给 nan"""
    A, B, fa, n = _quads(g)[q]
    d = pts @ n; h = 1 - d / g['inr']
    ok = (d > 1e-9) & (h < 1)
    X = pts / np.where(ok, 1 - h, 1)[:, None]
    b = ((X - A) @ (B - A)) / (g['E'] ** 2)
    a = b * (1 - h) + h * fa
    t = np.stack((a * P, h * Hbp), 1)
    t[~ok] = np.nan
    return t


def from_texel(a, h, g, q):
    A, B, fa, n = _quads(g)[q]
    return (1 - h)[..., None] * A + (a - h * fa)[..., None] * (B - A)


def _boundary(g, phi, k=0.97):
    """菱形外轮廓上方位角 phi（0 = 正上，往 +s 转）的点，往里缩一点"""
    H, W = g['H'], g['W']; c, s = math.cos(phi), math.sin(phi)
    r = k / (abs(c) / H + abs(s) / W)
    return (r * s, r * c)


def _inside(g, p, k=0.97):
    return abs(p[0]) / g['W'] + abs(p[1]) / g['H'] <= k


def gen_back_cracks(rng, g, flip=1):
    """2~3 条裂纹（折线, (头粗细, 尾粗细)），在「从正后方看」的平面上。flip = ±1：左右翻（幼龙 / 少年龙不一样）"""
    inr = g['inr']; seg = 0.3 * inr
    def walk(p, th, nseg, L, jag, maxdev, k=0.95):
        pts = [p]; th0 = th; sgn = rng.choice((-1, 1))
        for _ in range(nseg):
            Ls = L * rng.uniform(.75, 1.25)
            th2 = th + math.radians(sgn * rng.uniform(.5, 1.0) * jag); sgn = -sgn if rng.random() < .8 else sgn
            th2 = th0 + max(-math.radians(maxdev), min(math.radians(maxdev), th2 - th0))
            q = (pts[-1][0] + Ls * math.sin(th2), pts[-1][1] + Ls * math.cos(th2))   # 方向角和方位角一样：0 = 往上
            if not _inside(g, q, k): break
            pts.append(q); th = th2
        return pts
    def plen(pts): return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))
    def dense(pts, step):
        out = []
        for a, b in zip(pts, pts[1:]):
            n = max(1, int(math.dist(a, b) / step))
            out += [(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n) for i in range(n)]
        return out + [pts[-1]]
    def clear(pts, others, m):
        return all(math.dist(q, o) >= m for q in dense(pts, m / 3)[1:] for op, _ in others for o in dense(op, m / 3))
    def toward(p, phi_t, rt):
        t = (rt * math.sin(phi_t), rt * math.cos(phi_t)); return math.atan2(t[0] - p[0], t[1] - p[1])
    out = []
    # 主裂纹：从左上的外轮廓（靠上）斜着往右下，偏过中心（不穿过尾尖），折 4~5 下，中间岔出一支
    best = None
    for _ in range(30):
        phA = math.radians(rng.uniform(-48, -22))
        p0 = _boundary(g, phA)
        th = toward(p0, phA + math.pi + math.radians(rng.uniform(25, 45)), inr * rng.uniform(.25, .45))
        A = walk(p0, th, 5, seg, 32, 34)
        if best is None or plen(A) > plen(best): best = A
        if plen(A) > 1.1 * inr: break
    A = best; out.append((A, (1.0, .6)))
    for _ in range(15):
        if len(A) < 3: break
        k = rng.randint(1, len(A) - 2); a, b = A[k - 1], A[k]
        thk = math.atan2(b[0] - a[0], b[1] - a[1]) + math.radians(rng.choice((-1, 1)) * rng.uniform(38, 60))
        br = walk(A[k], thk, 2, seg * .75, 25, 25)
        if plen(br) > .35 * inr and clear(br, [(A[:k] + A[k + 1:], 0)], .1 * inr): out.append((br, (.8, .5))); break
    # 第二条：从右下的外轮廓往里，短一些，末端分个小叉
    best = None
    for _ in range(30):
        phB = math.radians(rng.uniform(112, 150))
        p0 = _boundary(g, phB)
        th = toward(p0, phB + math.pi + math.radians(rng.choice((-1, 1)) * rng.uniform(30, 55)), inr * rng.uniform(.25, .45))
        Bc = walk(p0, th, 3, seg * .9, 30, 30)
        if clear(Bc, out, .16 * inr) and (best is None or plen(Bc) > plen(best)): best = Bc
        if best is not None and plen(best) > .6 * inr: break
    if best is not None and len(best) > 1:
        Bc = best; out.append((Bc, (.9, .55)))
        a, b = Bc[-2], Bc[-1]; thb = math.atan2(b[0] - a[0], b[1] - a[1])
        for dd in (-1, 1):
            q = (b[0] + seg * .5 * math.sin(thb + dd * .6), b[1] + seg * .5 * math.cos(thb + dd * .6))
            if _inside(g, q) and rng.random() < .75: out.append(([b, q], (.6, .45)))
    # 第三条（小）：左下
    for _ in range(30):
        phC = math.radians(rng.uniform(205, 238))
        p0 = _boundary(g, phC)
        th = toward(p0, phC + math.pi + math.radians(rng.choice((-1, 1)) * rng.uniform(30, 60)), inr * .5)
        C = walk(p0, th, 2, seg * .8, 28, 25)
        if plen(C) > .4 * inr and clear(C, out, .16 * inr): out.append((C, (.75, .5))); break
    if flip < 0: out = [([(-x, y) for x, y in pts], w) for pts, w in out]
    return out


def crack_points(cracks, step):
    """折线 → 密的点 (N,2) + 每点粗细 (N,)（从头到尾按 w0 → w1 收细）"""
    P, Wt = [], []
    for pts, (w0, w1) in cracks:
        tot = sum(math.dist(a, b) for a, b in zip(pts, pts[1:])) or 1; acc = 0
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b); n = max(1, int(L / step))
            for i in range(n):
                t = (acc + L * i / n) / tot
                P.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n)); Wt.append(w0 + (w1 - w0) * t)
            acc += L
        P.append(pts[-1]); Wt.append(w1)
    return np.array(P), np.array(Wt)


def paint(cu, cv, sx, sy, geom, vm, mirror=False, seed=7, palette=None, src=None, flip=1):
    """cu, cv：每个贴图像素在展开坐标里的位置（0..1，四周可能略出界）；sx, sy：展开坐标 1 = 导出贴图里多少像素。
    geom = club_geom(...)；src：{'pts': (N,2) 平面坐标的裂纹点, 'w': (N,) 粗细} 代替程序生成的裂纹。
    返回 (h, w, 3) sRGB 颜色和统计。"""
    g = geom
    Pal = dict(PALETTE); Pal.update(palette or {})
    hi, lo = np.array(Pal['upper']), np.array(Pal['lower'])
    glow, core = np.array(Pal['glow']), np.array(Pal['core'])
    NS = 2 if mirror else 4
    P = sx / NS                                   # 一条棱 = 多少导出像素
    Hbp = (1 - vm) * sy                           # 后切面高（像素，展开图里）
    cuc = np.clip(cu, 0, 0.99999); cvc = np.clip(cv, 0, 1)
    s = np.floor(cuc * NS).astype(int); a = cuc * NS - s
    X = a * P; Y = (cvc - vm) * sy                # 像素坐标：x 沿棱，y 从最宽一圈往尾尖（前切面为负）
    back = Y >= 0
    h = np.clip(Y / Hbp, 0, .999)
    # 1) 切面明暗：上两片亮、下两片暗，四片各乘一点；每片往尾尖（菱形中心）略暗；前切面（对着尾杆）再暗
    upper = ((s == 0) | (s == 3)) if NS == 4 else (s == 0)
    col = np.where(upper[..., None], hi, lo).astype(np.float64)
    col *= np.array(FACET_K if NS == 4 else FACET_K[:2])[s][..., None]
    col *= np.where(back, 1 - 0.08 * h, 0.86)[..., None]
    # 2) 石头斑驳（低频，在「从正后方看」的平面上取，跨棱连续）
    rng = random.Random(seed)
    pp = np.zeros(X.shape + (2,))
    for q in range(NS):
        m = s == q
        pp[m] = from_texel(a[m], np.where(back[m], h[m], 0), g, q)
    u1, u2 = pp[..., 0] / g['W'], pp[..., 1] / g['H']
    nz = np.zeros(X.shape)
    for _ in range(5):
        fx, fy, ph = rng.uniform(3, 7), rng.uniform(3, 7), rng.uniform(0, 6.3)
        nz += np.sin(u1 * fx + ph) * np.sin(u2 * fy + ph * 1.3) / 5
    col *= (1 + 0.12 * nz)[..., None]
    # 3) 熔岩裂纹：平面上的点 → 每片的贴图像素坐标（相邻片的点也换过来：跨棱的裂纹是连着的）→ 到最近点的距离 / 粗细
    if src is not None: cp, cw = np.asarray(src['pts'], float), np.asarray(src['w'], float)
    else:
        cracks = gen_back_cracks(random.Random(seed * 101 + 3), g, flip)
        cp, cw = crack_points(cracks, step=0.2 * g['inr'] / max(1.0, Hbp))
    if mirror: cp = np.column_stack((np.abs(cp[:, 0]), cp[:, 1]))   # 镜像：左右共用贴图，都折到 +s 一侧
    dist = np.full(X.shape, 1e9)
    for q in range(NS):
        m = (s == q) & back
        if not m.any(): continue
        t = to_texel(cp, g, q, P, Hbp)
        ok = ~np.isnan(t[:, 0]) & (t[:, 0] > -4) & (t[:, 0] < P + 4) & (t[:, 1] > -4) & (t[:, 1] < Hbp + 4)
        if not ok.any(): continue
        tq, wq = t[ok], cw[ok]
        xm, ym = X[m], Y[m]; best = np.full(xm.shape, 1e9)
        for i0 in range(0, len(tq), 256):
            d = np.hypot(xm[:, None] - tq[None, i0:i0 + 256, 0], ym[:, None] - tq[None, i0:i0 + 256, 1]) / wq[None, i0:i0 + 256]
            best = np.minimum(best, d.min(1))
        dist[m] = best
    gl = np.clip(1 - dist / 1.7, 0, 1) ** 1.6     # 光晕窄、淡：不把整片糊成金色
    cr = np.clip(1.75 - dist / 0.8, 0, 1)
    col = col * (1 - 0.6 * gl[..., None]) + glow * 0.6 * gl[..., None]
    col = col * (1 - cr[..., None]) + core * cr[..., None]
    return np.clip(col, 0, 1), {'facet_px': round(P, 1), 'back_px': round(Hbp, 1), 'front_px': round(vm * sy, 1),
                                'crack_px': int((cr > .5).sum()), 'patch_px': int(back.sum())}


def back_view(g, col_fn, size=200):
    """预览：把画好的展开图按「从正后方看」贴回菱形（每个像素反查是哪片、贴图哪个点）"""
    H, W = g['H'], g['W']; sc = size / (2 * H)
    ys, xs = np.mgrid[0:size, 0:int(2 * W * sc)]
    p = np.stack(((xs + .5) / sc - W, H - (ys + .5) / sc), -1).reshape(-1, 2)
    out = np.full((len(p), 3), .16)
    inside = np.abs(p[:, 0]) / W + np.abs(p[:, 1]) / H <= 1
    for q, (A, B, fa, n) in enumerate(_quads(g)):
        sg = np.sign(n)
        m = inside & (np.sign(p[:, 0]) == sg[0]) & (np.sign(p[:, 1]) == sg[1])
        if m.any(): out[m] = col_fn(q, p[m])
    return out.reshape(ys.shape + (3,))


if __name__ == '__main__':   # 预览
    import sys
    from PIL import Image
    which = sys.argv[2] if len(sys.argv) > 2 else 'baby'; mir = len(sys.argv) > 3 and sys.argv[3] == 'mirror'
    if which == 'baby': g = club_geom(.055, .028, .038, .088, 0.0, .012); (sx, sy), vm, seed, flip = ((62, 41) if mir else (85, 28)), .32, 7, 1
    else: g = club_geom(.048, .026, .036, .092, -.005, .012); (sx, sy), vm, seed, flip = ((41, 26) if mir else (47, 19)), .32, 11, -1
    S = 2   # Blender 里的贴图是导出的 2 倍
    w, h = int(sx * S), int(sy * S)
    xs, ys = np.meshgrid((np.arange(w) + .5) / w, (np.arange(h) + .5) / h)
    col, st = paint(xs, ys, sx, sy, g, vm, seed=seed, mirror=mir, flip=flip)
    print(st, {k: round(v, 4) for k, v in g.items()})
    NS = 2 if mir else 4; P = sx / NS; sct = np.floor(np.clip(xs, 0, .99999) * NS); a = xs * NS - sct
    fa = np.where(sct % 2 == 0, g['fup'], 1 - g['fup']); hh = (ys - vm) / (1 - vm)
    outside = (hh > 0) & ((a < fa * hh) | (a > 1 - (1 - fa) * hh))
    Image.fromarray((col * np.where(outside, .35, 1)[:, :, None] * 255).astype(np.uint8)[::-1]).resize((w // S, h // S), Image.BOX) \
        .resize((w // S * 12, h // S * 12), Image.NEAREST).save(sys.argv[1])
    def col_fn(q, p):   # 从正后方看：反查贴图（导出分辨率，最近点）
        qq = q if not mir else (0 if q in (0, 3) else 1)
        pq = p if not mir else np.column_stack((np.abs(p[:, 0]), p[:, 1]))
        t = to_texel(pq, g, qq, P, (1 - vm) * sy)
        u = (qq + t[:, 0] / P) / NS; v = vm + t[:, 1] / sy
        xi = np.clip(np.nan_to_num(u * w).astype(int), 0, w - 1); yi = np.clip(np.nan_to_num(v * h).astype(int), 0, h - 1)
        return col[yi, xi]
    bv = back_view(g, col_fn, 240)
    Image.fromarray((bv * 255).astype(np.uint8)).save(sys.argv[1].replace('.png', '_back.png'))
