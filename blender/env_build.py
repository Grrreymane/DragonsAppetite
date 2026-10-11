# 重新生成全部岛：Tripo 原模（.cache/art/islands/models/<name>_01.glb）→ models/env/<name>.glb + 高度图 → src/config/island-shapes.js
#   python blender/env_build.py [名字 ...]
# 每个形状的参数（海平面比例、摆平角度、切口深度、减面）是看 probe / 检查图定的，见 docs/art-prompts/islands.md。
# 导出后跑 blender/glb_quantize.py（KHR_mesh_quantization：坐标 16 位、UV 16 位，three.js 原生支持，不要解码器）。
# 接缝检查图：blender/env_seamcheck.py（背面剔除 + 洋红背景，洞和外伸的台子一眼看得出）。
import subprocess, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
A = ROOT / '.cache/art/islands'
# cut：Tripo 原模在海平面下多深切掉（模型单位）。按用这个形状的岛里最小的「竖直缩放 × 水下拉伸」换算成约 0.5 米
SHAPES = {
    # 海平面 seaR = 原来量岸线半径的高度；sea 比它高一点：把露出水面的台座 / 墙压进水里（低空看不再是一圈黑墙）
    'volcano_a': ['0.588', 'seaR=0.58', 'kind=volcano', 'tris=3300', 'cut=-0.008', 'n=64', 'pool=0.4', 'q=78'],
    'volcano_b': ['0.63', 'seaR=0.597', 'kind=volcano', 'tris=3300', 'cut=-0.006', 'n=64', 'pool=0.4', 'q=80'],
    'green_a': ['0.62', 'seaR=0.588', 'kind=green', 'tris=3300', 'rx=3', 'ry=-11', 'cut=-0.015'],
    'green_b': ['0.336', 'seaR=0.315', 'kind=green', 'tris=3300', 'cut=-0.013', 'bot=-1.1'],
    'spire_a': ['0.28', 'kind=spire', 'tris=2900', 'cut=-0.025', 'bot=-1.25', 'n=64', 'pool=0.4'],
    'spire_b': ['0.22', 'kind=spire', 'tris=2900', 'cut=-0.022', 'bot=-1.1', 'n=64', 'pool=0.4'],
}
only = sys.argv[1:] or list(SHAPES)
for k in only:
    a = SHAPES[k]
    out = ROOT / 'models/env' / f'{k}.glb'
    cmd = [BLENDER, '-b', '--factory-startup', '-P', str(ROOT / 'blender/env_island.py'), '--', 'build',
           str(A / 'models' / f'{k}_01.glb'), str(out), str(A / 'build' / f'{k}.json'), *a]
    for attempt in range(3):     # 检查图用 GPU 渲染，偶尔会在显卡驱动里崩（EXCEPTION_ACCESS_VIOLATION nvoglv64.dll）：重跑
        r = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
        if r.returncode == 0: break
    lines = [l for l in r.stdout.splitlines() if l.startswith(('NORMALIZE', 'CUT', 'TRIPO', 'ENVELOPE', 'SKIRT', 'LOD', 'HMERR', 'CRATER', 'EXPORTED')) or 'Error' in l]
    print('==', k); print('\n'.join(lines))
    if r.returncode: print(r.stderr[-2000:]); continue
    q = subprocess.run([sys.executable, str(ROOT / 'blender/glb_quantize.py'), str(out)], capture_output=True, text=True)
    print(q.stdout.strip()[:300] or q.stderr[-800:])
subprocess.run([sys.executable, str(ROOT / 'blender/env_shapes.py')])
