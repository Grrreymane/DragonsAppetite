# 量姿势：打印某个动作某一帧里各条骨链的朝向角度和关节弯曲角度（侧视平面 x-z，单位度），下一行是俯视偏航角
# blender -b <xxx_rig.blend> -P pose_report.py -- <动作名> <帧> [骨链 ...]
#   骨链写法：farm1.L,farm2.L,fpaw.L,ftoe.L   （逗号分隔，从根到梢）
# 不写骨链时按骨架里实际有的骨头自动组：左前腿、左后腿、躯干（有 spine1.. 时）、chest+全部 neck*+head、全部 tail*（+fan）
# 骨链里写了骨架里没有的骨名：直接报错退出（以前会悄悄跳过，弯曲角变成跨骨计算）
# 输出例子：farm1.L:-113 -> farm2.L:-43 -> ... | 关节弯曲: [70, 30, 75]
#   朝向角 = 骨头在侧视里的方向，0° 朝前（+X），-90° 朝下，±180° 朝后
#   俯视偏航角：0 = 正前，正 = 往左；竖直的骨头偏航角没意义
import bpy, sys, math, re

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ACT = argv[0] if argv else 'Fly'
FRAME = int(argv[1]) if len(argv) > 1 else 1
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
NAMES = [pb.name for pb in arm.pose.bones]

def seq(prefix):   # neck1, neck2, ... 按数字排序
    return sorted([n for n in NAMES if re.fullmatch(prefix + r'\d+', n)], key=lambda n: int(n[len(prefix):]))
def default_chains():
    ch = []
    for c in (['farm1.L', 'farm2.L', 'fpaw.L', 'ftoe.L'], ['hleg1.L', 'hleg2.L', 'hfoot.L', 'htoe.L']):
        if all(n in NAMES for n in c): ch.append(c)
    if seq('spine') and 'hips' in NAMES and 'chest' in NAMES: ch.append(['hips'] + seq('spine') + ['chest'])
    ch.append([n for n in ['chest'] + seq('neck') + ['head'] if n in NAMES])
    ch.append(seq('tail') + (['fan'] if 'fan' in NAMES else []))
    return [c for c in ch if len(c) > 1]

CHAINS = [a.split(',') for a in argv[2:]] or default_chains()
missing = [n for ch in CHAINS for n in ch if n not in NAMES]
if missing:
    print('ERROR 骨架里没有这些骨头:', missing)
    print('       现有骨头:', ' '.join(NAMES))
    sys.exit(1)
tracks = [tr.name for tr in arm.animation_data.nla_tracks]
if ACT not in tracks:
    print('ERROR 没有这个动作:', ACT, '现有:', tracks); sys.exit(1)
for tr in arm.animation_data.nla_tracks: tr.mute = tr.name != ACT
bpy.context.scene.frame_set(FRAME)

def vec(n):
    pb = arm.pose.bones[n]; return pb.tail - pb.head
def ang(n):
    d = vec(n); return math.degrees(math.atan2(d.z, d.x))

print(f'== {ACT} 第 {FRAME} 帧 ==')
for ch in CHAINS:
    a = [ang(n) for n in ch]
    bends = [round(abs(((a[i + 1] - a[i] + 180) % 360) - 180)) for i in range(len(a) - 1)]
    print(' -> '.join(f'{n}:{x:.0f}' for n, x in zip(ch, a)), '| 关节弯曲:', bends)
    side = [round(math.degrees(math.atan2(vec(n).y, vec(n).x))) for n in ch]
    print('   俯视偏航角（0=正前，正=往左）:', side)
