"""把一个目录里的截图拼成联系表：python tools/skysea_sheet.py <目录> [每张宽 270] [每行 4]"""
import sys, pathlib
from PIL import Image, ImageDraw
d = pathlib.Path(sys.argv[1]); tw = int(sys.argv[2]) if len(sys.argv) > 2 else 270; cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
fs = sorted(d.glob('*.png'))
ims = [Image.open(f).convert('RGB') for f in fs]
th = round(ims[0].height * tw / ims[0].width)
sh = Image.new('RGB', (cols * tw, ((len(ims) + cols - 1) // cols) * (th + 16)), (20, 20, 20))
g = ImageDraw.Draw(sh)
for i, (f, im) in enumerate(zip(fs, ims)):
    x, y = (i % cols) * tw, (i // cols) * (th + 16)
    sh.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 16)); g.text((x + 4, y + 2), f.stem, fill=(255, 255, 255))
out = d.parent / (d.name + '_sheet.jpg'); sh.save(out, quality=90); print(out)
