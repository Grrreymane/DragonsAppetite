# 把 env_island.py 量出来的高度图（.cache/art/islands/build/*.json）汇总成 src/config/island-shapes.js（纯 JS 数组）。
#   python blender/env_shapes.py [只要这些名字 ...]
# 只收 models/env/<name>.glb 存在的形状。
import json, math, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BUILD = ROOT / '.cache/art/islands/build'
OUT = ROOT / 'src/config/island-shapes.js'
only = set(sys.argv[1:])
shapes = []
for f in sorted(BUILD.glob('*.json')):
    d = json.loads(f.read_text(encoding='utf-8'))
    if only and d['name'] not in only: continue
    if not (ROOT / 'models/env' / (d['name'] + '.glb')).exists(): continue
    n, ext, h = d['n'], d['ext'], d['h']
    foot = 0
    for j in range(n):
        for i in range(n):
            if h[j * n + i] > -9999:
                foot = max(foot, math.hypot(-ext + 2 * ext * i / (n - 1), -ext + 2 * ext * j / (n - 1)))
    d['foot'] = round(foot, 3)
    shapes.append(d)

L = ['// 岛的形状表：blender/env_island.py 从精模量出来、blender/env_shapes.py 汇总（别手改，重新生成）。',
     '// 模型单位：岸线半径 1、海平面 y = 0（y 朝上）。h = n×n 高度图（行 = z 从 -ext 到 ext，列 = x），整数 × q；-9999 = 没有表面。',
     '// top / bottom：最高 / 最低点；foot：岩基最远半径；crater：火山口烟柱的位置 [x, y, z]；tris：LOD0 / LOD1 三角面。',
     'export const SHAPES = {']
for d in shapes:
    L.append(f"  {d['name']}: {{")
    L.append(f"    kind: '{d['kind']}', file: 'models/env/{d['name']}.glb', n: {d['n']}, ext: {d['ext']}, q: {d['q']}, top: {d['top']}, bottom: {d['bottom']}, foot: {d['foot']},")
    L.append(f"    crater: {json.dumps(d['crater'])}, tris: {json.dumps(d['tris'])},")
    L.append('    h: [')
    n = d['n']
    for j in range(n):
        L.append('      ' + ','.join(str(v) for v in d['h'][j * n:(j + 1) * n]) + ',')
    L.append('    ],')
    L.append('  },')
L.append('};')
kinds = {'volcano': [], 'green': [], 'spire': []}
for d in shapes: kinds.setdefault(d['kind'], []).append(d['name'])
L.append('export const SHAPE_KINDS = ' + json.dumps(kinds).replace('"', "'").replace(',', ', ').replace(':', ': ') + ';')
OUT.write_text('\n'.join(L) + '\n', encoding='utf-8')
print('wrote', OUT, OUT.stat().st_size, 'bytes:', {k: v for k, v in kinds.items()})
