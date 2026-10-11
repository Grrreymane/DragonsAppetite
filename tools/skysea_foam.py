"""海面白沫占比：python tools/skysea_foam.py <帧目录或图> [每几张取一张]
数画面下三分之一里「偏白」的像素（R > 165、R/B > 0.8：海水的 R 很低，白沫和白线 R 高）。"""
import sys, glob, pathlib
from PIL import Image
p = pathlib.Path(sys.argv[1]); step = int(sys.argv[2]) if len(sys.argv) > 2 else 10
fs = sorted(glob.glob(str(p / '*.jpg')) + glob.glob(str(p / '*.png'))) if p.is_dir() else [str(p)]
vals = []
for f in fs[::step]:
    im = Image.open(f).convert('RGB'); w, h = im.size
    c = im.crop((0, h * 2 // 3, w, h)).resize((w // 2, (h - h * 2 // 3) // 2))
    px = c.get_flattened_data() if hasattr(c, 'get_flattened_data') else c.getdata()
    n = sum(1 for r, g, b in px if r > 165 and r > b * .8)
    vals.append(n / (c.width * c.height) * 100)
print(' '.join('%.1f' % v for v in vals))
print('min %.1f  max %.1f  mean %.1f  (%d 张)' % (min(vals), max(vals), sum(vals) / len(vals), len(vals)))
