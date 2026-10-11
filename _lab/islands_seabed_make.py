# 重新生成试验页 _lab/islands_seabed.html + _lab/sea-bed-isltest.js（index.html / sea-bed.js 改了以后跑一下）：
#   python _lab/islands_seabed_make.py
# 试验页 = index.html 的副本，import map 把 src/view/sea-bed.js 换成一份副本，副本里海底地形改用 world.js 的 seabedBase（不含岛面），
# 用来在 sea-bed.js 真正改之前看效果（tools/scenarios/islands_shots.js / islands_dbg.js 用 --page _lab/islands_seabed.html）。
import pathlib
R = pathlib.Path(__file__).resolve().parent.parent
s = (R / 'src/view/sea-bed.js').read_text(encoding='utf-8')
s = s.replace("from '../sim/world.js'", "from '../src/sim/world.js'").replace("from './toon.js'", "from '../src/view/toon.js'")
s = s.replace("import { seabedY, zoneAt, groundAt } from '../src/sim/world.js';", "import { seabedY, zoneAt, groundAt, seabedBase } from '../src/sim/world.js';")
old = "H[j * (NC + 1) + i] = Math.min(g > -900 && g >= y - .01 ? y - 3 : y, -2.5);"
assert old in s, 'sea-bed.js 的那一行变了，手动看一下'
s = s.replace(old, "H[j * (NC + 1) + i] = Math.min(seabedBase(x, z), -2.5); void g;")
(R / '_lab/sea-bed-isltest.js').write_text('// 自动生成的试验副本（_lab/islands_seabed_make.py）：海底地形改用 world.js 的 seabedBase（不含岛面）。别手改。\n' + s, encoding='utf-8')
h = (R / 'index.html').read_text(encoding='utf-8')
h = h.replace('<head>', '<head>\n<base href="../">', 1)
im = '<script type="importmap">{ "imports": { "three": "./lib/three.module.min.js" } }</script>'
assert im in h, 'index.html 的 import map 变了，手动看一下'
h = h.replace(im, '<script type="importmap">{ "imports": { "three": "./lib/three.module.min.js", "./src/view/sea-bed.js": "./_lab/sea-bed-isltest.js" } }</script>')
(R / '_lab/islands_seabed.html').write_text(h, encoding='utf-8')
print('ok')
