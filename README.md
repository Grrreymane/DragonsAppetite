# 龙游天海

变成一条龙：**火龙**翱翔天空、扎进海里叼鱼；**海龙**遨游大海、跃出水面咬住海鸥。吃东西长大，从幼龙长成成龙。

手机竖屏网页 3D 小游戏（three.js，卡通描边）。在线玩：https://grrreymane.github.io/DragonSkySea/

## 怎么玩

- 按住屏幕拖动：转向 / 俯冲 / 爬升（摇杆按在哪就出在哪）
- 右下角按钮：火龙按住「喷火」（烤熟大一点的猎物才能吃）；海龙点「冲刺」（撞晕猎物）
- 火龙往下用力拖可以扎进海里抓鱼；海龙往上冲出水面可以咬住海鸥
- 跟着右上角的小目标卡走，吃够了就会进化：幼龙 → 少年龙 → 成龙
- 没有死亡：被天敌咬到只会掉几个光点，能捡回来

电脑上：方向键 / WASD 转向，空格是动作键，Esc 暂停。

## 开发

- 设计文档：`docs/GDD.md`；代码结构和模块接口：`docs/ARCH.md`
- 本地运行：`python -m http.server 8817` 然后打开 http://localhost:8817/ （ES module 不能用 file:// 打开）
- 调试参数：`?debug`（帧率 / 绘制调用）、`?autostart&kind=sea&stage=1`、`?seed=3`
- 机器人平衡测试：`node tools/sim.mjs --kind fire --runs 60`
- 录像自查：`python tools/rec3d.py --page index.html --director tools/scenarios/bot_play.js --query "kind=fire&secs=20" --sheet 1`
- 主角模型流程（设定图 → AI 绑定姿势图 → Tripo 智能网格 → Blender 命令行绑骨做动作 → glb）：见 `D:/Minigame/_workflow/HERO_3D_PIPELINE.md` 和 `blender/`

## 致谢

- [three.js](https://threejs.org/)（MIT）
- 字体：站酷庆科黄油体、Fusion Pixel（OFL，见 `fonts/`）
- 主角模型：用 Tripo 智能网格从设定图生成，再在 Blender 里绑骨做动作
