# 代码结构与模块接口（给并行开发的 agent 看）

游戏设计见 `docs/GDD.md`（草稿在 `.cache/docs/gdd_final.md`）。本文件是**接口契约**：各模块只按这里写的字段读写，不要去改别人的文件。

## 目录

```
index.html            入口：DOM 外壳、importmap（"three" → ./lib/three.module.min.js）、报错面板、字体块
src/
  main.js             启动、状态机（标题 / 游戏 / 暂停）、主循环（sim 固定步长 1/60 + 渲染插值）   ← 主程序（orchestrator 写）
  config/species.js   12 种生物的数值表（sim 和 view 共用）
  config/dragons.js   两条龙 × 三阶段数值、小目标链
  sim/                纯逻辑：不碰 DOM / WebGL / three，Node 里能直接 import 跑机器人
    rng.js world.js   随机数、海浪 waveH、区域、岛、海底
    sim.js            createSim / step（orchestrator 写）
    creatures.js spawn.js eat.js growth.js goals.js hazards.js flight.js swim.js cross.js
  view/               three.js 渲染
    toon.js           GRAD 色阶图、outlineMat 描边材质、toonMat
    renderer.js camera.js sky.js islands.js clouds.js dragon.js particles.js   ← orchestrator 写
    creature-kit.js creatures.js        ← agent「生物」写
    sea.js                              ← agent「水」写
  ui/                 DOM 界面（hud.js title.js menu.js codex.js result.js icons.js style.css）  ← agent「界面」写
  sys/audio.js        WebAudio 合成   ← agent「声音」写
  sys/save.js sys/platform.js         ← orchestrator 写
_lab/                 试验页（字体工具会跳过下划线目录）。每个 agent 在这里放自己的测试页
tools/rec3d.py        无头 Chrome（GPU）跑页面 + 导演脚本，录视频 / 截图 / 转发报错（用法见文件头）
```

- 浏览器原生 ES module，无构建。view / ui 里 `import * as THREE from 'three'`（importmap 映射）；**sim 里不许 import three**，也不许用 `Math.random`（用 `sim/rng.js` 的 `makeRng`），保证 Node 和浏览器结果一致。
- 坐标：米；y = 0 是海面；龙的「前」是 (sin yaw, sin pitch, cos yaw)，yaw = 0 朝 +Z。世界按 `PERIOD = 2400` 循环（只有岛是循环的；龙和生物的坐标是绝对坐标，可以很大）。
- 体验准则（WORKFLOW §3）：不晃屏、闪烁 ≤ 5 次/秒、大面积闪白要弱、少文字、按钮「图标 + 两个字」、难度低不卡死。
- 卡通描边是硬要求：所有实体（主角、岛、生物）都要 `MeshToonMaterial`（`gradientMap: GRAD`）+ 背面外扩描边（`outlineMat`）。云、烟、粒子不描边。

## 猎场与探索

- `sim/hunts.js` 管理云海追猎 / 浅海鱼潮：可接近的线索 → 分批追猎 → 猎群聚拢；最多 26 秒，提前吃完会加快下一批 / 结束，一次一个，忽略或离开会自然结束。
- `createSim({ discoveries })` 克隆探索记录；`stepHunts` 在生物移动前更新队形，`recordHuntEat` 只在真正吃到时计数。普通猎物、保底刷新与成长目标照常运行。
- `S.hunt` 为 `null` 或 `{ id, kind: 'cloud'|'tide', phase: 'cue'|'chase'|'finale', x, y, z, yaw, elapsed, duration, caught, total, route, first }`；`route` 是世界坐标点列。猎场个体 / 群带 `huntId`。
- `S.discoveries` / `save.discoveries` 只存已发现的种类：`{ cloud: { found: 1, best, completed }, tide: ... }`。旧档默认为空，发现和结束时立即保存；读档重新寻找猎场，已有纪录不丢失。
- `huntDiscover { kind, first }`、`huntPhase { kind, phase }`、`huntCatch { x,y,z, bonus, caught, goal }`、`huntGoal { bonus }`、`huntEnd { kind, caught, total, completed, bonus, record }` 驱动提示和存档。
- 奖励（2026-10 起，用户反馈「不清楚事件有什么奖励」）：猎场里每吃一只当场 +1 成长（`HUNT_PER`），吃满 `goal`（云 5 / 鱼 7）只当场再 +10（`HUNT_GOAL_BONUS`）；忽略、错过、只靠近不吃 = 0。横幅在线索阶段就写明「每只 +1 · 吃满 N 只再 +10」，追猎时显示 已抓/目标，抓到时飘「+1」，达成时飘「达成 · 成长 +10」，结束大字两行：「吃到 / 新纪录 N 只」+「成长 +M」。
- `view/hunts.js` 的 `createHuntView(scene).update(S, dt)` 复用金色云隙 / 水下微光和路线光点；HUD 只读状态，图鉴展示探索印记与最好纪录。
- 验证：`npm test`；`tools/scenarios/hunts_review.js` 配合 `tools/rec3d.py --dom` 实际转向追猎并截图，支持 `kind` / `stage` 参数。

## sim 状态（view / ui / audio 只读）

`const S = createSim({ kind, seed, stage, pts })`，主循环每 1/60 秒调用 `step(S, input)`。

```js
S.t                   // 游戏时间（秒）
S.kind                // 'fire' | 'sea'
S.stage               // 0 幼龙 / 1 少年龙 / 2 成龙
S.pts                 // 累计成长点；阶段门槛见 config/dragons.js STAGE_PTS
S.cfg                 // 当前阶段的数值（DRAGONS[kind].stages[stage]）
S.hero = {
  x, y, z, px, py, pz,          // 当前 / 上一步位置（渲染插值用）
  yaw, pitch, bank, speed, yawRate,
  len,                          // 当前体长（米），阶段内会慢慢变大
  medium,                       // 'air' | 'water'  （火龙扎水时 = 'water'；海龙跃出时 = 'air'）
  crossT, crossMax,             // 跨界计时：已经在对方地盘多久 / 最多多久（不跨界时 crossMax = 0）
  flyW, tuck, flapping,         // 火龙：扇翅权重 0..1、收翅 0..1
  firing,                       // 火龙正在喷火
  dashT, dashCd, dashCdMax,     // 海龙：冲刺剩余秒 / 冷却剩余 / 冷却总长
  invuln, shield,               // 被咬后的无敌秒数 / 护盾秒数
  mouth: { x, y, z },           // 嘴的位置（sim 估算）
}
S.creatures = [ {                // 只包含活着的
  id, sp,                       // sp = config/species.js 的键
  x, y, z, px, py, pz,          // 当前 / 上一步位置
  yaw, pitch, roll,             // 朝向（前 = (sin yaw, sin pitch, cos yaw)）
  size,                         // 实际体长（米）= SPECIES[sp].len × 个体系数
  phase,                        // 动画相位（弧度，sim 按速度推进），扇翅 / 摆尾用 sin(phase)
  flap,                         // 0..1 扇翅 / 摆尾力度（滑翔时小）
  gold,                         // 金色个体
  cooked,                       // 0..1 烤熟 / 撞晕进度（1 = 已烤熟或撞晕，可以多吃一档）
  stun,                         // >0：撞晕剩余秒（翻肚皮）
  roast,                        // >0：已烤熟、正在往下掉的剩余秒（变橙色冒烟）
  alert,                        // 0..1：天敌「!」预警强度（>0 时头顶显示 !）
  chasing,                      // 天敌正在追
  flee,                         // 正在逃
  edible,                       // 现在就能吃（按阶段档位）
  edibleCooked,                 // 烤熟 / 撞晕后能吃
} ]
S.orbs = [ { x, y, z, t } ]     // 被咬掉的光点（能捡回）
S.spots = [ { x, z, r } ]       // 觅食点（海面翻白、鱼群、海鸥盘旋）
S.goal = { type, sp, n, have, done, icon }   // 当前小目标卡；icon 是生物 id 或 'cooked' / 'cross' / 'combo'
S.combo = { n, t }              // 连吃数、剩余秒
S.codex = { [sp]: { n, gold } } // 图鉴
S.stats = { eaten, time }
S.events = [ ... ]              // 本步产生的事件，下一步开始时清空。主循环把每一步的事件攒起来，每帧交给 view / ui / audio
```

### 事件（`S.events` 里的对象，都有 `type`）

| type | 字段 | 含义 |
|---|---|---|
| `eat` | sp, x, y, z, pts, combo, gold, cross, cooked | 吃到一只 |
| `cook` | id, sp | 烤熟（火龙喷火累计够了） |
| `stun` | id, sp | 撞晕（海龙冲刺撞到） |
| `evolve` | stage | 进化（开始演出） |
| `goal` | idx | 完成一个小目标 |
| `codex` | sp | 图鉴新种 |
| `enterWater` / `exitWater` | x, z, speed | 入水 / 出水（火龙扎水、海龙落水 / 跃出） |
| `splash` | x, z, size | 水花（掠水、生物跃出） |
| `alert` | id, sp | 天敌发现你（开始「!」） |
| `bite` | x, y, z, lost | 被咬（掉了 lost 个光点） |
| `orb` | x, y, z | 捡回一个光点 |
| `bump` | x, y, z | 撞到岛 |
| `dash` | | 海龙冲刺开始 |
| `flap` | | 火龙一次下扇（音效同步用） |
| `shield` | | 护盾开始 |
| `crossWarn` | | 跨界时间快到（最后 0.7 秒） |

## view 模块接口

所有 view 模块：`export function createXxx(ctx)`，`ctx = { THREE, scene, camera, renderer, GRAD, outlineMat, toonMat }`；返回对象至少有 `update(S, alpha, dt, time)`，其中 alpha 是插值系数（0..1：位置 = p + (cur - p) × alpha），time 是渲染时间（秒）。

- **creatures.js**（agent 生物）：`createCreatures(ctx)` → `{ update(S, alpha, dt, time), setUnderwater(k), portrait(sp, size) }`
  - 每种生物 1 个 InstancedMesh 本体 + 1 个描边（顶点着色器里按实例相位扇翅 / 摆尾，本体和描边用同一段变形）。按 `S.creatures` 每帧写实例矩阵和实例颜色（金色、烤熟变橙、撞晕翻肚皮）。
  - `portrait(sp, size)`：返回该生物的一张正侧面小图（dataURL，透明背景），图鉴 / 小目标卡用。
  - 同屏三角面（含描边）≤ 13k；离镜头 150 以外不画描边。
- **sea.js**（agent 水）：`createSea(ctx)` → `{ update(S, alpha, dt, time), underwater }`
  - 海面（近密远疏 3 圈网格，浪用 `sim/world.js` 的 `WAVE_GLSL`，和 JS 的 `waveH` 同一个公式）、从水下看的海面（背面亮青色）、海底（`seabedY`）、海藻（翠岛海）、水下雾和颜色随深度变、焦散、鱼影 / 鸟影、觅食点的白沫、龙在低空时海面上的圆形影子。
  - `underwater`：0..1，镜头在水下的程度（主循环据此切音乐、生物描边颜色）。镜头高度不要停在水线带（主循环的镜头会避开，见 GDD §5.5）。

## ui 接口（agent 界面）

DOM 界面，放在 `#ui` 层里（index.html 已有 `<div id="wrap"><canvas/>…<div id="ui"></div></div>`）。`ui/style.css` 由 index.html 引入。

- `createUI(root, api)`，`api = { project(x,y,z) → {x,y,visible} 屏幕坐标（CSS 像素，相对 #wrap）, portrait(sp) → dataURL, onPick(kind), onAction(on:boolean), onPause(), onResume(), onSwitch(), onToggleMute(), onToggleLeft(), onCodex(), getSave() }`
- 返回 `{ showTitle(save), hideTitle(), showHUD(kind), hideHUD(), update(S, dt, events), showPause(), hidePause(), showCodex(save), showResult(info, onContinue), toast(text), hint(name|null), setLoading(p, text), setTemp(on), setMute(b), setLeft(b), dragging(b) }`
  - `hint(name)`：首次提示，name ∈ 'drag'（跳动的小手 + 「按住拖动」）/ 'plunge'（向下箭头 + 「扎水」）/ 'breach'（向上 + 「跃出」）/ 'fire'（「喷火」）/ 'dash'（「冲刺」）；null 隐藏。
  - `dragging(true)`：玩家正在拖摇杆，菜单和声音按钮降到 40% 透明度。
  - 动作键按下时要 `stopPropagation`（否则主程序会在按钮下面出摇杆）；所有按钮按下都调 `api` 对应回调。
  - `showResult(info)`：info = { kind, timeSec, eaten, codexN, codexMax, stageName }。
- 游戏中：成长条（幼 → 少 → 成，带门槛）、下一阶段能吃什么的剪影、连吃 ×N、小目标卡（生物小图 + have/n）、最多 2 个屏幕边缘箭头（小目标猎物 / 最近能吃的）、天敌「!」（在画面外时贴屏幕边）、跨界计时圈（围着龙）、动作键（右下 88px，火龙「喷火」按住，海龙「冲刺」点一下，外圈显示冷却）、左上「菜单」、右上「声音」。按钮都是 SVG 图标 + 两个字，不用 emoji。
- 摇杆（按哪出在哪）由主程序的 input 处理，ui 不管。顶部 64px 和按钮上按下不出摇杆。

## audio 接口（agent 声音）

`createAudio()` → `{ unlock(), setMute(b), muted, update(S, dt, events, under) }`：全部 WebAudio 合成（无音频文件），三条总线（总 / 音效 / 音乐），切后台 suspend。under = 镜头在水下程度 0..1（所有声音过低通 + 换海洋曲）。

## v2 新增（docs/V2_PLAN.md）

sim 新字段：
```js
S.hero.lock                     // 自动瞄准锁定的生物 id（0 = 没锁）
S.hero.skill = { id, cd, cdMax, t }   // 成龙的第二技能：id 'roar' | 'vortex'；cd 冷却剩余；t 正在生效的剩余秒；不是成龙时 S.hero.skill = null
S.abilities                     // 已解锁的能力 id 列表（config/dragons.js ABILITIES 的键），例如 ['bite','flame','plunge']
S.nextAbilities                 // 下一阶段会解锁的能力 id 列表（成龙时为 []）
c.feared                        // 生物被威压吓呆（不会逃）
c.skillHit                      // 生物被龙吼 / 漩涡影响（吃到时算 skill 目标）
```
新事件：`unlock {abilities:[...]}`（进化时，界面弹「新能力」卡）、`skill {id}`（放出龙吼 / 漩涡）、`lunge {id}`（扑咬，头往前探）、`locked {id}`（锁定了一只新猎物）、`blocked {ability}`（想扎水 / 跃出但还没学会，界面提示「长大后学会」）。
新输入：`input.skillTap`（第二技能按钮）。

ui 新接口：`api.onSkill()`（第二技能按钮按下）；`ui.showAbility(list)`（list = [{id, zh, desc, icon}]，进化后弹出约 2.5 秒，不挡操作）；`ui.update` 里读 `S.hero.lock`（锁定圈）、`S.hero.skill`（技能按钮 + 冷却）、`S.nextAbilities`（成长条旁的下一阶段能力图标）。

## 昼夜 / 天气 / 区域 / 大场面（2026-10，用户反馈「场景看久了无聊」）

- `view/env.js`：`createEnv(ctx, { sky, sea })` → `{ E, update(dt, S|null, playing) }`，主循环在 `sea.update` 之前调。
  - 一天 `CYCLE = 300` 秒（只在玩的时候走，开局 f = 0.05 上午）：关键帧表 `KEYS`（上午 / 正午 / 金色傍晚 0.48 / 日落 0.55 / 暮色 0.6 / 夜 0.66–0.86 / 黎明 0.92）插值天空颜色、太阳 / 月亮高度、光、雾、海、云的乘数、星星、曝光。
  - 直接改 `sky.js` 的 `SKY` 颜色对象（天空球和海面反射都引用它们）；雾的冷暖染色改成共享 uniform（`sky.js` 的 `FOG_U` / `setFogTint`，Float32Array 按引用共享给所有带雾的材质）。
  - 天气 `E.weather`：clear / rain（阴天压灰、雨丝、雷电，`E.onLightning`）/ mist；雨停后 45 秒彩虹。区域按 `zoneValue` 平滑混合：熔岩海雾偏暖偏浊 + 火山灰 / 火星粒子；外海看得更远。进入新区域 2.5 秒后 `E.onRegion(zone, {zh, en})` → `ui.region(zh, en)` 弹区域名。每天夜里一次 `E.onMeteor` → 流星雨。
  - 写给别的模块读：`ctx.env = { night, dusk, rain, over, mist, bow, zone, under, tod, v, o, flash, sunEl }`。
  - 主角 / 猎物夜里自发光（用户要求「主角要保持一定的亮度」）：`dragon.nrim`（淡蓝轮廓 + 自身颜色）、`creatures.setNight(k)`。
  - 海：`sea.U.uEnv / uEnvU`（水上 / 水下乘数）、`uNight`（夜里浪尖和小星点发青色荧光）、`sea.setSun(dir)`、`sea.shaftK`。云：`clouds.js` 的 `CLOUD_TINT`。
- `sim/sim.js`：`zap(S, x, y, z, r)`（雷劈：火龙那边烤熟、海龙那边电晕）、`spawnStars(S, n, over)`（流星雨：星星按主角当时的位置落在前方 35–80 米，飘着等吃，一颗 +`STAR_PTS` = 3，16 米内自动飘进嘴）。主程序在 sim 外调它们，用 `simNow()` 把新事件当帧处理。新事件：`zap {x,y,z,r,n}`、`stars {n}`、`starLand {x,y,z,water}`、`star {x,y,z,pts}`。
- `view/spectacle.js`：闪电（朝镜头的折线带子，宽度随距离）、天上的流星、落下来的星星（发光贴片 + 拖尾）。
- `view/ambient.js`：远处的生命（鲸、海豚、候鸟、魔鬼鱼、海龟、夜里水下发光水母），纯画面，读 `ctx.env`。
- 调试：`?tod=0.75`（定住时间）、`?weather=rain|mist|bow`；`window.__env`（`fixed`、`f`、`setWeather(w, 秒)`、`onLightning()`、`onMeteor()`）。截图：`tools/scenarios/env_shots.js`（`tods=…&ws=…&tp=x,y,z&yaw=`）、`spectacle_check.js`、`region_check.js`。

## 调试钩子

`window.__dg = { S, step(n), input, setStage(stage), give(pts), teleport(x,y,z), render(), ready }`，`?debug` 显示 fps / 绘制调用 / 三角面，`?rec` 打开 preserveDrawingBuffer，`?seed=`、`?kind=fire|sea`、`?stage=0|1|2`、`?autostart`（跳过标题直接开局）。
