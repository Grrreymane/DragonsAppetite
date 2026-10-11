"""主角模型现状一览（_workflow/HERO_3D_PIPELINE.md §0.3）：读 models/*.json 清单 + glb 本身 + config/dragons.js + view/dragon.js，
对比 GDD §12.2 的预算和用户认可的姿势。开工前、交付前各跑一次；文档里不写死这些数字，以这里的输出为准。约 1 秒。

    PYTHONIOENCODING=utf-8 python D:/Minigame/Dragon/tools/hero_status.py

表格列：名字 | 清单或 glb 最后修改时间 | 三角面/预算 | glb KiB/预算 | 骨头/上限 | 嘴K | 体长(米) | 翼展(米，火龙) | 满舵头偏(度) | 动作
- 三角面、骨头数、长度都从 glb 里数（不信清单里记的）。大小单位 KiB（÷1024）；GDD 写的是 KB，按同一个数比。
- 「超」= 超预算。「缺 glb」= 清单指向的 glb 不存在（游戏会加载失败）。
- 嘴K = (mouth.x − pivot.x) / length：看得见的嘴尖在转轴前方几倍体长。sim 用它判定吃东西（main.js 把 dragon.mouthK 传给 S.hero.mouthK）。
- 体长来自 src/config/dragons.js 的 len；游戏缩放 = len ÷ 清单 length。三个阶段在屏幕上的大小要递进（幼 < 少年 < 成）。
- 满舵头偏 = 摇杆打满时头相对身体的偏航估算 = turn × (neckBones 节数 × 脖子系数 + spineBones 节数 × 脊柱系数)，
  系数从 src/view/dragon.js 里读（读不到显示 ?）。超过约 25° 时看得见的嘴会跑到侧面、和 sim 的判定嘴对不上（文档 §8.2）。
表格下面是逐项核对：清单的 tris / bytes / length 和 glb 对不上、火龙收腿目标和用户认可值的偏离、neckBones、flapHz。
用户有没有点过头，这里看不出来：以和用户的对话为准，没有记录就当没过。
"""
import glob, json, os, re, struct, sys, time
from array import array

if not sys.stdout.isatty():
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass
sys.dont_write_bytecode = True
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUD = {'baby': (5000, 450), 'teen': (6500, 550), 'adult': (8000, 700)}   # 三角面、glb KB（GDD §12.2）
BONES = {'fire': 39, 'sea': 44}
STAGES = ('baby', 'teen', 'adult')
HEAD_YAW_MAX = 25            # 度：满舵时头相对身体的总偏航建议上限（v2_review_pipedoc 第 2 条）
# 用户认可的火龙飞行收腿（成龙定稿，侧视朝向角：0 朝前、-90 朝下、±180 朝后）
OK_ARM = [-110, -40, -70, -145]          # 上臂 / 前臂 / 爪掌 / 爪趾：肘 70、腕垂 30、松拳 75
OK_LEG = [-75, -165, -110, -147]         # 大腿 / 小腿 / 脚掌 / 脚趾：膝 90、踝 55、趾 37
OK_TAIL_ELEV = (8, 20)                   # 尾巴往后上方翘，尾根 8° → 尾尖 20°
OK_NECK_FIRE = ['neck1', 'neck2', 'head']   # dragon.js 里成龙默认清单的 neckBones

def read(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()

cfg = read('src/config/dragons.js')
STAGE_CFG = {}
_st = [m for m in re.finditer(r"\{\s*model:\s*'(\w+)'", cfg) if not cfg[max(0, m.start() - 16):m.start()].rstrip().endswith('fallback:')]
for i, m in enumerate(_st):            # 每个阶段一段（跳过 fallback: { model: ... } 里的 model）
    chunk = cfg[m.start():_st[i + 1].start() if i + 1 < len(_st) else len(cfg)]
    num = lambda k: (lambda r: float(r.group(1)) if r else None)(re.search(r"\b%s:\s*([\d.]+)" % k, chunk))
    STAGE_CFG[m.group(1)] = {'len': num('len'), 'turn': num('turn'), 'flapHz': num('flapHz')}
try:
    dj = read('src/view/dragon.js')
    m1 = re.search(r"nk\s*=\s*D\.kind\s*===\s*'fire'\s*\?\s*([\d.]+)\s*:\s*([\d.]+)", dj)
    m2 = re.search(r"man\.spineBones\)\s*for\s*\(const n of man\.spineBones\)\s*rotWorld\(n,\s*U,\s*turn\s*\*\s*([\d.]+)\)", dj)
    NK = {'fire': float(m1.group(1)), 'sea': float(m1.group(2))} if m1 else None
    SK = float(m2.group(1)) if m2 else 0.0
except OSError:
    NK, SK = None, 0.0

CT = {5126: ('f', 1), 5122: ('h', 32767), 5120: ('b', 127), 5123: ('H', 65535), 5121: ('B', 255)}
def glb_counts(path):
    """从 glb 本身数三角面、骨头数、POSITION 的 x 范围（= Blender 的 x = 全长；量化的 SHORT 除以 32767）"""
    b = open(path, 'rb').read(); jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl]); BIN = 20 + jl + 8
    tris = sum(j['accessors'][p['indices']]['count'] // 3 for me in j.get('meshes', []) for p in me['primitives'] if 'indices' in p)
    bones = max((len(s['joints']) for s in j.get('skins', [])), default=0)
    x0, x1 = 1e9, -1e9
    for nd in j.get('nodes', []):
        if 'mesh' not in nd: continue
        sx = (nd.get('scale') or [1, 1, 1])[0]
        for p in j['meshes'][nd['mesh']]['primitives']:
            a = j['accessors'][p['attributes']['POSITION']]; v = j['bufferViews'][a['bufferView']]
            code, div = CT[a['componentType']]; div = div if a.get('normalized') else 1
            sz = array(code).itemsize; stride = v.get('byteStride') or 3 * sz
            o = BIN + v.get('byteOffset', 0) + a.get('byteOffset', 0)
            raw = array(code, b[o:o + stride * (a['count'] - 1) + 3 * sz + (stride - 3 * sz)][:stride * a['count']])
            xs = raw[::stride // sz][:a['count']]
            x0 = min(x0, min(xs) / div * sx); x1 = max(x1, max(xs) / div * sx)
    return tris, bones, (x1 - x0 if x1 > x0 else None)

def fire_targets(n):
    """从 rig_fire_<名字>.py 读收腿目标的默认值（环境变量不设时用的值）；读不到返回 None"""
    p = os.path.join(ROOT, f'blender/rig_{n}.py')
    if not os.path.exists(p): return None
    s = open(p, encoding='utf-8').read()
    env = lambda var: (lambda r: [float(x) for x in r.group(1).split(',')] if r else None)(
        re.search(r"os\.environ\.get\('%s',\s*'([-\d.,\s]+)'\)" % var, s))
    tup = dict((k, float(v)) for k, v in re.findall(r"\('(farm1|farm2|fpaw|ftoe|hleg1|hleg2|hfoot|htoe)',\s*(-?[\d.]+)\)", s))
    leg = re.search(r"LEG_TARGET\s*=\s*\[([-\d.,\s]+)\]", s)
    arm = env('FM_ARM') or ([tup[k] for k in ('farm1', 'farm2', 'fpaw', 'ftoe')] if all(k in tup for k in ('farm1', 'farm2', 'fpaw', 'ftoe')) else None)
    legv = [float(x) for x in leg.group(1).split(',')] if leg else ([tup[k] for k in ('hleg1', 'hleg2', 'hfoot', 'htoe')] if 'hleg1' in tup else None)
    return {'arm': arm, 'leg': legv, 'tail': env('FM_TAIL')}

bends = lambda a: [round(abs(a[i] - a[i + 1])) for i in range(len(a) - 1)]
elev = lambda th: 180 - th if th > 0 else -(180 + th)       # 尾巴朝向角 → 仰角
fmt = lambda a: '/'.join(f'{x:g}' for x in a)

print(f"{'名字':<10} {'修改时间':<11} {'三角面':>12}   {'glb KiB':>9}   {'骨':>5}  {'嘴K':>5}  {'体长':>5}  {'翼展':>5}  {'满舵头偏':>6}  动作")
rows = sorted(glob.glob(os.path.join(ROOT, 'models/*.json')))
for k in ('fire', 'sea'):                     # 没清单但有 glb 的（fire_adult 老导出）也列出来
    for s_ in STAGES:
        if not os.path.exists(os.path.join(ROOT, f'models/{k}_{s_}.json')) and os.path.exists(os.path.join(ROOT, f'models/{k}_{s_}_anim.glb')):
            rows.append(f'NOMAN:{k}_{s_}')
notes, mans = [], {}
for f in rows:
    if f.startswith('NOMAN:'):
        n = f[6:]
        m = {'kind': n.split('_')[0], 'stage': n.split('_')[1], 'file': f'models/{n}_anim.glb'}
        if n == 'fire_adult': m.update(length=.94, neckBones=OK_NECK_FIRE)   # dragon.js 里写死的默认清单
        f = os.path.join(ROOT, m['file'])
    else:
        m = json.load(open(f, encoding='utf-8')); n = os.path.basename(f)[:-5]
    mans[n] = m
    st = m.get('stage') or n.split('_')[-1]; tb, kb = BUD.get(st, (0, 0)); kind = m.get('kind') or n.split('_')[0]
    g = os.path.join(ROOT, m.get('file', f'models/{n}_anim.glb'))
    has = os.path.exists(g)
    size = os.path.getsize(g) if has else 0
    t = time.strftime('%m-%d %H:%M', time.localtime(max(os.path.getmtime(f), os.path.getmtime(g) if has else 0)))
    tris, nb, glen = glb_counts(g) if has else (0, 0, None)
    bad = []
    if not has: bad.append(f"缺 glb：{m.get('file')} 不存在（游戏会加载失败）")
    else:
        if m.get('tris') and abs(m['tris'] - tris) > 2: bad.append(f"清单 tris {m['tris']} ≠ glb {tris}")
        if m.get('bytes') and m['bytes'] != size: bad.append(f"清单 bytes {m['bytes']} ≠ 文件 {size}")
        if m.get('length') and glen and abs(m['length'] - glen) > .005: bad.append(f"清单 length {m['length']} ≠ glb 网格 x 范围 {glen:.3f}（改形后清单没重写？游戏缩放会错）")
    if bad: notes.append(f"{n}: " + '；'.join(bad))
    mk = (m['mouth'][0] - m['pivot'][0]) / m['length'] if m.get('mouth') and m.get('pivot') and m.get('length') else None
    sc = STAGE_CFG.get(n, {}); L = sc.get('len')
    ws = (m.get('extents') or {}).get('wingspan')
    span = f"{L * ws / m['length']:5.1f}" if (L and ws and m.get('length')) else '    -'
    hy = None
    if NK and sc.get('turn'):
        hy = sc['turn'] * (len(m.get('neckBones') or OK_NECK_FIRE) * NK.get(kind, 0) + len(m.get('spineBones') or []) * SK) * 57.2958
    flag = lambda v, lim: '超' if lim and v > lim else '  '
    tag = n + ('*' if bad else '')
    print(f"{tag:<10} {t:<11} {tris:>5}/{tb:<5}{flag(tris, tb)} " + (f"{size / 1024:>4.0f}/{kb:<4}{flag(size / 1024, kb)}" if has else f"{'缺 glb':>6}/{kb:<4}  ") +
          f" {nb:>2}/{BONES.get(kind, 0):<2}  {(f'{mk:.3f}' if mk is not None else '  -  ')}  {(f'{L:5.1f}' if L else '    -')}  {span}  "
          f"{(f'{hy:5.0f}°' + flag(hy, HEAD_YAW_MAX)) if hy is not None else '    ?   '}  {','.join(m.get('actions', {}))}")
missing = [f'{k}_{s}' for k in ('fire', 'sea') for s in STAGES if not os.path.exists(os.path.join(ROOT, f'models/{k}_{s}.json'))]
print('没有清单的：', ', '.join(missing) or '无', '（fire_adult 用 dragon.js 里写死的默认清单，不算临时）' if 'fire_adult' in missing else '')
print('名字后面带 * = 清单和 glb 对不上，见下面「清单核对」')

print('\n清单核对（tris / bytes / length 和 glb 比）：')
for x in notes or ['全部对得上']: print('  ' + x)

print(f'\n火龙收腿目标（rig 脚本里不设环境变量时的默认值；对比成龙用户认可值 前 {fmt(OK_ARM)}、后 {fmt(OK_LEG)}、尾巴仰角 {OK_TAIL_ELEV[0]}→{OK_TAIL_ELEV[1]}°）：')
print('  fire_adult: 就是认可值（blender/rig.py 手填弧度，用户 10-09 点头）')
for n in ('fire_teen', 'fire_baby'):
    T = fire_targets(n)
    if not T: print(f'  {n}: 没有 blender/rig_{n}.py'); continue
    out = []
    for lab, v, ok in (('前腿', T['arm'], OK_ARM), ('后腿', T['leg'], OK_LEG)):
        if not v: out.append(f'{lab} 读不到（脚本写法变了，手动 grep）'); continue
        d = [round(a - b) for a, b in zip(v, ok)]
        if max(abs(x) for x in d) <= 3: out.append(f'{lab} 同认可')
        elif max(d) - min(d) <= 3:
            out.append(f"{lab} {fmt(v)}：整条腿统一转了 {d[0]:+d}°（{'上臂' if lab == '前腿' else '大腿'} {v[0]:g}，认可 {ok[0]:g}），"
                       f"关节弯曲 {fmt(bends(v))} 和认可一样 → 偏离认可，要问用户")
        else:
            dif = '、'.join(f"{['上臂', '前臂', '爪掌', '爪趾'][i] if lab == '前腿' else ['大腿', '小腿', '脚掌', '脚趾'][i]} {v[i]:g}（认可 {ok[i]:g}）" for i in range(4) if abs(d[i]) > 3)
            out.append(f"{lab} {fmt(v)}，关节弯 {fmt(bends(v))}（认可 {fmt(bends(ok))}）；偏离：{dif} → 要问用户")
    if T['tail']:
        e = [elev(x) for x in T['tail']]
        okt = e[0] >= OK_TAIL_ELEV[0] - 2 and e[-1] <= OK_TAIL_ELEV[1] + 2 and all(e[i] <= e[i + 1] + .5 for i in range(len(e) - 1))
        out.append(f"尾巴仰角 {e[0]:g}→{e[-1]:g}°" + (' 在认可范围' if okt else ' → 超出认可的 8→20°，要问用户'))
    else: out.append('尾巴读不到')
    print(f'  {n}: ' + '；'.join(out))

print('\nneckBones（转弯扭头的骨）/ flapHz：')
for n, m in mans.items():
    nbk = m.get('neckBones'); kind = m.get('kind') or n.split('_')[0]
    s = f"  {n}: neckBones {','.join(nbk) if nbk else '没写（用默认 neck1,neck2,head）'}"
    if kind == 'fire':
        if nbk and nbk != OK_NECK_FIRE: s += f'（和成龙默认 {",".join(OK_NECK_FIRE)} 不一样，转弯时头转得不一样多）'
        fm, fc = m.get('flapHz'), STAGE_CFG.get(n, {}).get('flapHz') or 1.0
        if fm is not None: s += f"；flapHz 清单 {fm:g} / dragons.js {fc:g}" + ('' if abs(fm - fc) < .01 else ' → 不一致：扇翅音效对不上，请主程序改 dragons.js')
    print(s)
if NK is None: print('  （没从 src/view/dragon.js 读到转弯系数，「满舵头偏」显示 ?：dragon.js 的写法变了，看 D.update 里的 rotWorld）')
