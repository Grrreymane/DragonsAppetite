# 重新生成地标：Tripo 原模（.cache/art/landmarks/models/<src>_01.glb）→ models/landmarks/<key>.glb + <key>.json
#   python blender/landmark_build.py [key ...]          （不写 = 全部；最后重拼 docs/landmarks/sheet.jpg）
# 参数（朝向、缩放、海平面、减面、碰撞胶囊的初值）是看 probe / 检查图 / 体素截面定的。
# 概念图提示词：.cache/art/landmarks/jobs_concepts*.json（nano-banana pro）；Tripo：jobs_3d*.json（P1 智能网格，12000 面，骸骨 16000）。
# 检查图（模型 + 胶囊叠加）：.cache/art/landmarks/check/；预览：docs/landmarks/<key>.jpg
import subprocess, sys, pathlib, json, shutil
ROOT = pathlib.Path(__file__).resolve().parent.parent
BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
A = ROOT / '.cache/art/landmarks'
OUT = ROOT / 'models/landmarks'; DOC = ROOT / 'docs/landmarks'

# 胶囊：a / b 游戏坐标（米，y 朝上，+Z = 正面），r 初值；lock = 只拟合半径不动轴；rq = 半径取距离的第几分位
LANDMARKS = {
    'arch': dict(src='arch_c', kind='arch', tris=6000, tex=1024, q=80, rz=90, scale=['x', 110], widen=[16, 6], stretch=[40, 18], sea=0.03, below=3.0,
                 joint=False, lam=1.4, caps=[
        # 两条腿各分上下两段、前后两根（腿前后约 32 米厚，轴按体素截面的中心）；拱顶前后两根
        dict(name='legLlo+8', a=[-38, 5, 8], b=[-32, 28, 8], r=8, lock=True),
        dict(name='legLhi+8', a=[-31, 31, 8], b=[-24, 46, 8], r=8, lock=True),
        dict(name='legLlo-8', a=[-38, 5, -8], b=[-32, 28, -8], r=8, lock=True),
        dict(name='legLhi-8', a=[-31, 31, -8], b=[-24, 46, -8], r=8, lock=True),
        dict(name='legRlo+8', a=[35, 5, 8], b=[34.5, 28, 8], r=8, lock=True),
        dict(name='legRhi+8', a=[33, 31, 8], b=[27, 46, 8], r=8, lock=True),
        dict(name='legRlo-8', a=[35, 5, -8], b=[34.5, 28, -8], r=8, lock=True),
        dict(name='legRhi-8', a=[33, 31, -8], b=[27, 46, -8], r=8, lock=True),
        dict(name='top+', a=[-24, 58, 8], b=[24, 58, 8], r=8, lock=True), dict(name='top-', a=[-24, 58, -8], b=[24, 58, -8], r=8, lock=True)]),
    'wreck': dict(src='wreck_a', kind='wreck', tris=6000, tex=1024, q=80, rz=0, scale=['y', 60], bed=1.0, below=1.0, fit_ymin=2.0, minpart=0.0003, killhigh=[0.002, 18], caps=[
        dict(name='hullLow', a=[-1, 7, -20], b=[-1, 7, 22], r=8, search=10), dict(name='hullHigh', a=[-1, 15, -14], b=[-1, 15, 18], r=6, search=8),
        dict(name='stern', a=[-1, 18, -25], b=[-1, 18, -15], r=6, search=6), dict(name='bow', a=[-1, 17, 22], b=[-1, 20, 30], r=4, search=5),
        dict(name='mast', a=[1, 14, -3], b=[1, 31, -3], r=1.5, fix=True),
        dict(name='chest', a=[13, 3, -2], b=[17, 3, -2], r=3, fix=True)]),
    'bones': dict(src='bones_a', kind='bones', tris=7000, tex=1024, q=80, rz=-90, scale=['xy', 170], sz=0.8, sea=0.08, below=2.0,
                  encl=10, vox=900000, fit_ymin=2.5, minpart=0.0003, caps=[
        # 小岛（扁圆盘，顶面约 3 米）：三根埋在水下的粗胶囊，半径固定
        dict(name='isletC', a=[0, -24, -58], b=[0, -24, 58], r=26, fix=True),
        dict(name='isletL', a=[-48, -24, -38], b=[-48, -24, 38], r=26, fix=True), dict(name='isletR', a=[48, -24, -38], b=[48, -24, 38], r=26, fix=True),
        dict(name='skull', search=7, surf=75, a=[0, 7, 70], b=[0, 7, 81], r=6, rmax=9), dict(name='neck', search=7, surf=75, a=[0, 22, 38], b=[0, 11, 64], r=4, rmax=7),
        dict(name='spineF', search=7, surf=75, a=[0, 27, 34], b=[0, 33, 8], r=4, rmax=7), dict(name='spineB', search=7, surf=75, a=[0, 33, 8], b=[-3, 16, -26], r=4, rmax=7),
        dict(name='tail1', search=7, surf=75, a=[-8, 13, -28], b=[-20, 7, -54], r=3, rmax=6), dict(name='tail2', search=7, surf=75, a=[-18, 6, -60], b=[6, 5, -80], r=3, rmax=5),
        dict(name='ribL20', a=[-7, 31, 20], b=[-19, 5, 20], r=2, search=4, rmax=4, surf=75),
        dict(name='ribR20', a=[7, 31, 20], b=[19, 5, 20], r=2, search=4, rmax=4, surf=75),
        dict(name='ribL1.5', a=[-7, 31, 1.5], b=[-19, 5, 1.5], r=2, search=4, rmax=4, surf=75),
        dict(name='ribR1.5', a=[7, 31, 1.5], b=[19, 5, 1.5], r=2, search=4, rmax=4, surf=75),
        dict(name='ribL-15', a=[-7, 31, -15], b=[-19, 5, -15], r=2, search=4, rmax=4, surf=75),
        dict(name='ribR-15', a=[7, 31, -15], b=[19, 5, -15], r=2, search=4, rmax=4, surf=75)]),
    'skyisle': dict(src='skyisle_a', kind='skyisle', tris=5600, mist=6.0, tex=1024, q=80, rz=0, scale=['xy', 84], stretch=[62, -15], minpart=0.0003,
                    lam=1.5, caps=[
        # 岛面（扁圆盘）：4 根沿 Z 的胶囊；下面的倒锥：两根竖的；圆庙一根
        dict(name='slab1', a=[-30, 7, -15], b=[-30, 7, 15], r=8, lock=True, rmax=9), dict(name='slab2', a=[-10, 7, -27], b=[-10, 7, 27], r=8, lock=True, rmax=9),
        dict(name='slab3', a=[10, 7, -27], b=[10, 7, 27], r=8, lock=True, rmax=9), dict(name='slab4', a=[30, 7, -15], b=[30, 7, 15], r=8, lock=True, rmax=9),
        dict(name='cone1', a=[0, -2, 0], b=[0, -6, 0], r=14, lock=True, rmax=20), dict(name='cone2', a=[-2, -16, 0], b=[-2, -20, 0], r=10, lock=True, rmax=14),
        dict(name='cone3', a=[0, -29, 0], b=[0, -34, 0], r=5, lock=True, rmax=7),
        dict(name='temple', a=[5, 21, -15], b=[5, 27, -15], r=7, search=10, rmax=8)]),
}

# 方方正正的「门框」版拱门（arch_b：概念图改过、Blender 里加宽洞 + 拉高腿），换成了更自然的圆拱 arch_c；留着备查
ARCH_BOXY = "dict(src='arch_b', kind='arch', tris=6000, tex=1024, q=80, rz=90, scale=['x', 110], widen=[16.5, 10], stretch=[36, 14],\n                 sea=0.06, below=2.0, caps=[\n        dict(name='legL+', a=[-44, 6, 10], b=[-42, 52, 10], r=10, lock=True), dict(name='legL-', a=[-44, 6, -10], b=[-42, 52, -10], r=10, lock=True),\n        dict(name='legR+', a=[44, 6, 10], b=[42, 52, 10], r=10, lock=True), dict(name='legR-', a=[44, 6, -10], b=[42, 52, -10], r=10, lock=True),\n        dict(name='footL', a=[-44, 4, 16], b=[-44, 4, -16], r=8, lock=True), dict(name='footR', a=[44, 4, 16], b=[44, 4, -16], r=8, lock=True),\n        dict(name='top+', a=[-43, 60, 10], b=[43, 60, 10], r=8, lock=True), dict(name='top-', a=[-43, 60, -10], b=[43, 60, -10], r=8, lock=True)])"


def blender(*args):
    for attempt in range(3):          # Workbench 渲染偶尔在显卡驱动里崩：重跑
        r = subprocess.run([BLENDER, '-b', '--factory-startup', '-P', str(ROOT / 'blender/landmark.py'), '--', *map(str, args)],
                           capture_output=True, text=True, encoding='utf-8', errors='replace')
        if r.returncode == 0: return r
    return r


def build(key):
    cfg = LANDMARKS[key]
    (A / 'build').mkdir(parents=True, exist_ok=True); OUT.mkdir(parents=True, exist_ok=True); DOC.mkdir(parents=True, exist_ok=True)
    cp = A / 'build' / f'{key}.cfg.json'; cp.write_text(json.dumps(cfg), encoding='utf-8')
    glb = OUT / f'{key}.glb'
    r = blender('build', A / 'models' / f'{cfg["src"]}_01.glb', cp, glb, OUT / f'{key}.json', A / 'check')
    keep = ('WATERFALL', 'MIST', '  KEEPOUT', 'BOTTOM', 'CAP open', 'WELD', 'VOXELS', 'CUT', 'PARTS', 'TRIS', 'VOLUME', 'BOX', 'OPENING', 'KEEPOUT', 'CAPS', '  CAP', 'EXPORTED')
    print('==', key); print('\n'.join(l for l in r.stdout.splitlines() if l.startswith(keep) or 'Error' in l))
    if r.returncode: print(r.stderr[-2000:]); return
    shutil.copy(glb, A / 'build' / f'{key}_prequant.glb')
    q = subprocess.run([sys.executable, str(ROOT / 'blender/glb_quantize.py'), str(glb)], capture_output=True, text=True)
    print(q.stdout.strip()[:300] or q.stderr[-800:])
    png = A / 'build' / f'{key}_preview.png'
    r = blender('preview', glb, png, cfg['kind'])
    if r.returncode: print('preview failed', r.stderr[-800:]); return
    from PIL import Image
    Image.open(png).convert('RGB').save(DOC / f'{key}.jpg', quality=86)
    print('SIZE', key, glb.stat().st_size // 1024, 'KB')


def sheet():
    from PIL import Image, ImageDraw
    ims = [(k, Image.open(DOC / f'{k}.jpg')) for k in LANDMARKS if (DOC / f'{k}.jpg').exists()]
    if not ims: return
    s = 640; W = Image.new('RGB', (s * 2, s * ((len(ims) + 1) // 2)), (255, 255, 255))
    for i, (k, im) in enumerate(ims):
        W.paste(im.resize((s, s)), ((i % 2) * s, (i // 2) * s))
        ImageDraw.Draw(W).text(((i % 2) * s + 12, (i // 2) * s + 10), k, fill=(20, 20, 20))
    W.save(DOC / 'sheet.jpg', quality=86)


for k in sys.argv[1:] or list(LANDMARKS): build(k)
sheet()
