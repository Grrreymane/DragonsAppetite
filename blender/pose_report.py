# 量姿势：打印某个动作某一帧里各条骨链的朝向角度和关节弯曲角度（侧视平面 x-z，单位度）
# blender -b <xxx_rig.blend> -P pose_report.py -- <动作名> <帧> [骨链 ...]
#   骨链写法：farm1.L,farm2.L,fpaw.L,ftoe.L   （逗号分隔，从根到梢）
# 不写骨链时用龙的默认四条：左前腿、左后腿、脖子+头、尾巴
# 输出例子：farm1.L:-113 -> farm2.L:-43 -> ... | 关节弯曲: [70, 30, 75]
#   朝向角 = 骨头在侧视里的方向，0° 朝前（+X），-90° 朝下，±180° 朝后
import bpy, sys, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ACT = argv[0] if argv else 'Fly'
FRAME = int(argv[1]) if len(argv) > 1 else 1
CHAINS = [a.split(',') for a in argv[2:]] or [
    ['farm1.L', 'farm2.L', 'fpaw.L', 'ftoe.L'],
    ['hleg1.L', 'hleg2.L', 'hfoot.L', 'htoe.L'],
    ['chest', 'neck1', 'neck2', 'head'],
    ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'],
]
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
for tr in arm.animation_data.nla_tracks: tr.mute = tr.name != ACT
bpy.context.scene.frame_set(FRAME)

def ang(n):
    pb = arm.pose.bones[n]; d = pb.tail - pb.head
    return math.degrees(math.atan2(d.z, d.x))

print(f'== {ACT} 第 {FRAME} 帧 ==')
for ch in CHAINS:
    a = [ang(n) for n in ch if n in arm.pose.bones]
    bends = [round(abs(((a[i + 1] - a[i] + 180) % 360) - 180)) for i in range(len(a) - 1)]
    print(' -> '.join(f'{n}:{x:.0f}' for n, x in zip(ch, a)), '| 关节弯曲:', bends)
    side = [round(math.degrees(math.atan2((arm.pose.bones[n].tail - arm.pose.bones[n].head).y, (arm.pose.bones[n].tail - arm.pose.bones[n].head).x))) for n in ch if n in arm.pose.bones]
    print('   俯视偏航角（0=正前，正=往左）:', side)
