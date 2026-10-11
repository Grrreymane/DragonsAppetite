"""绿幕抠图 + 切出每朵云（AI 画在纯绿底上的云 / 烟 / 卷云）。
    python tools/skysea_key.py <图.png> <输出目录> <名字前缀>
输出：<前缀>_<n>.png（RGBA，颜色已去绿边、透明处颜色往外扩，贴图过滤不会出黑边 / 绿边）+ 终端打印每块的尺寸。
做法：背景 K ≈ 纯绿；像素 P = a·C + (1-a)·K，绿色超出量 e = G - max(R,B) 对 a 线性 → 反解 a 和 C。"""
import sys, pathlib
import numpy as np
from PIL import Image
import cv2

src, outd, pre = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]), sys.argv[3]
outd.mkdir(parents=True, exist_ok=True)
P = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
e = P[..., 1] - np.maximum(P[..., 0], P[..., 2])
bg = e > 180
K = np.median(P[bg], axis=0); ek = K[1] - max(K[0], K[2])
fg = e < 10
ec = np.median(e[fg]) if fg.any() else -10
a = np.clip((ek - 14 - e) / (ek - 14 - ec), 0, 1)   # 背景噪声留 14 的死区
a[a < .02] = 0
C = (P - (1 - a)[..., None] * K[None, None, :]) / np.maximum(a, 1e-3)[..., None]
C = np.clip(C, 0, 255)
C[..., 1] = np.minimum(C[..., 1], np.maximum(C[..., 0], C[..., 2]) + 6)       # 去绿溢色
# 透明处的颜色：用最近的不透明像素的颜色（贴图放大 / mip 时边上不会混进黑或绿）
w = (a > .5).astype(np.float32)
C2 = np.zeros_like(C); have = np.zeros_like(w)
for sg in (3, 9, 27, 81):
    num = cv2.GaussianBlur(C * w[..., None], (0, 0), sg); den = cv2.GaussianBlur(w, (0, 0), sg)
    ok = (den > 1e-3) & (have == 0)
    C2[ok] = num[ok] / den[ok][..., None]; have[ok] = 1
C = np.where((a > .5)[..., None], C, C2)
# 连通块 → 每朵一张
mask = cv2.dilate((a > .06).astype(np.uint8), np.ones((13, 13), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
items = []
for i in range(1, n):
    x, y, w_, h = stats[i, :4]
    if w_ * h < 4000: continue
    items.append((y, x, i, (slice(y, y + h), slice(x, x + w_))))
items.sort(key=lambda t: (round(t[0] / 300), t[1]))
for k, (_, _, li, sl) in enumerate(items):
    pad = 8
    y0, y1 = max(0, sl[0].start - pad), min(P.shape[0], sl[0].stop + pad)
    x0, x1 = max(0, sl[1].start - pad), min(P.shape[1], sl[1].stop + pad)
    m = (lab[y0:y1, x0:x1] == li)
    al = a[y0:y1, x0:x1] * m
    rgba = np.dstack([C[y0:y1, x0:x1], al * 255]).astype(np.uint8)
    f = outd / f'{pre}_{k}.png'
    Image.fromarray(rgba, 'RGBA').save(f)
    print(f.name, x1 - x0, y1 - y0)
print('bg', K, 'ek', ek, 'ec', ec)
