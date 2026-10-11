# 重新生成全部岛：Tripo 原模（.cache/art/islands/models/<name>_01.glb）→ models/env/<name>.glb + 高度图 → src/config/island-shapes.js
#   python blender/env_build.py [名字 ...]
# 每个形状的参数（海平面比例、摆平角度、减面）是看 probe / 检查图定的，见 docs/art-prompts/islands.md
import subprocess, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
A = ROOT / '.cache/art/islands'
SHAPES = {
    # 海平面 seaR = 原来量岸线半径的高度；sea 比它高一点：把露出水面的台座 / 墙压进水里（低空看不再是一圈黑墙）
    'volcano_a': ['0.588', 'seaR=0.58', 'kind=volcano', 'tris=4200', 'vgf=20', 'q=78'],
    'volcano_b': ['0.63', 'seaR=0.597', 'kind=volcano', 'tris=4200', 'vgf=1.2', 'q=80'],
    'green_a': ['0.62', 'seaR=0.588', 'kind=green', 'tris=4200', 'rx=3', 'ry=-11', 'vgf=1'],
    'green_b': ['0.336', 'seaR=0.315', 'kind=green', 'tris=4200', 'vgf=1', 'bot=-1.1'],
    'spire_a': ['0.28', 'kind=spire', 'tris=3800', 'cut=-0.15', 'bot=-1.25'],
    'spire_b': ['0.22', 'kind=spire', 'tris=3800', 'vgf=.5', 'cut=-0.15', 'bot=-1.1'],
}
only = sys.argv[1:] or list(SHAPES)
for k in only:
    a = SHAPES[k]
    cmd = [BLENDER, '-b', '--factory-startup', '-P', str(ROOT / 'blender/env_island.py'), '--', 'build',
           str(A / 'models' / f'{k}_01.glb'), str(ROOT / 'models/env' / f'{k}.glb'), str(A / 'build' / f'{k}.json'), *a]
    r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    lines = [l for l in r.stdout.splitlines() if l.startswith(('NORMALIZE', 'CUT', 'SKIRT', 'LOD', 'HMERR', 'CRATER', 'EXPORTED')) or 'Error' in l]
    print('==', k); print('\n'.join(lines))
    if r.returncode: print(r.stderr[-2000:])
subprocess.run([sys.executable, str(ROOT / 'blender/env_shapes.py')])
