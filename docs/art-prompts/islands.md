# 岛的美术提示词（AI 生图）

流水线：nano-banana pro 概念图（白底、3/4 俯视、带水下岩基）→ Tripo P1 智能网格（`generate_3d.py --model P1-20260311 --face-limit 10000~12000`）→ `blender/env_island.py build`（归一化、切掉水下换程序化岩裙、减面、LOD、贴图 1024 WebP、量高度图）→ `blender/env_shapes.py` 生成 `src/config/island-shapes.js`。

中间文件：`.cache/art/islands/`（概念图 `concepts/` `edits/`，Tripo 原模 `models/`，检查图 `build/check/`）。批量跑：`.cache/art/islands/tools/lai.py <jobs.json>`（一次只能有一个生图任务，429 自动重试）。

## 第一轮（直接生图，结果是「浮空岛 / 底座」，水下部分往里收或是直壁，弃用，只留上半部分）

公共后缀：

> Stylized painterly fantasy game environment asset, hand-painted textures, semi-realistic but chunky stylized shapes with big readable forms and a clean silhouette, warm sunny daylight from the upper left, saturated but not garish colors, high quality concept art for a 3D mobile game (like a Western fantasy dragon game). A SINGLE isolated island object, centered and fully visible with margin around it, shown in 3/4 view from slightly above (about 25 degrees elevation), on a plain pure white background. The island is shown as a standalone cut-out diorama chunk WITHOUT any water: no ocean, no water surface, no waves, no reflections. Above the former waterline is the island; at the waterline there is a thin darker wet band; BELOW the waterline the rocky base continues downward and flares out wider like the roots of a mountain (rough blue-grey wet rock with a few barnacles and small seaweed patches), tapering to a rough jagged bottom, so the full underwater base is visible. Solid opaque object, no floating parts, no text, no labels, no frame, no cast shadow on the ground.

- `volcano_a`：Subject: a classic volcano island: a broad asymmetric cone of dark basalt rock (charcoal brown-black with warm brown highlights), a wide open crater at the summit glowing with bright orange lava, three or four glowing orange-yellow lava rivers flowing down the slopes in winding channels, cracked rock plates, a narrow black-sand shore around the base above the waterline. The volcano is about as tall as it is wide.
- `volcano_b`：Subject: a rugged caldera volcano island with a jagged broken crater rim (one side of the rim collapsed lower), a bubbling lava lake inside the crater glowing bright orange, glowing lava cracks and two lava streams running down the low side, layered dark basalt cliffs, a few sharp rock ridges, small black-sand coves at the base above the waterline. Wider than tall, about 0.8 times as tall as wide.
- `green_a`：Subject: a lush round tropical green island: a gentle grassy hill of bright green grass with soft painterly color variation, a continuous golden sandy beach ring all around the shore, five or six stylized trees with big round puffy canopies plus two leaning palm trees, a few rounded grey boulders, a small rocky cliff face on one side of the hill. Low and wide, the hill height about 0.3 times the island width.
- `green_b`：Subject: a green plateau island: a flat-topped grassy mesa with steep warm-grey layered rock cliffs on one side and a gentle grassy slope down to a golden sandy beach on the other side, a small cluster of stylized round-canopy trees on the plateau, a few bushes and mossy boulders, a sandy beach ring around most of the shore. Low and wide, height about 0.35 times the island width.
- `spire_a`：Subject: a tall weathered sea stack rock spire: a single tall pillar of layered warm-grey and sandstone-beige rock with horizontal strata, deep weathering grooves, a slightly leaning silhouette and a narrower waist, green moss and grass patches on the ledges, a grassy cap on the flat top with one small windswept tree and a few bushes. The spire is about 3.5 times taller than its base width at the waterline.
- `spire_b`：Subject: a tall twin-peaked weathered sea stack: a thick pillar of layered grey and sandstone rock that splits into two jagged peaks of different heights near the top, horizontal rock strata, weathered cracks, ledges with green moss and small grass tufts, a few seabird-white streaks. The rock is about 3 times taller than its base width at the waterline.

## 第二轮（用上的）

### 改图（edit_image，nano-banana pro）：第一轮的 volcano_a / green_a / volcano_b 缩到 62% 放进 2048 白底（上方居中），再换掉水下部分

> Keep the island ABOVE its shoreline exactly as it is (same shapes, colors, painterly style, lighting). Completely REPLACE everything below the shoreline: remove the platform / plinth / floating-island underside. Instead paint the natural UNDERWATER foot of the island as if the sea had been drained away: right under the shoreline a thin dark wet band, then rough wet blue-grey rock that slopes OUTWARD and DOWNWARD, getting much WIDER toward the bottom like the broad foot of a mountain (a wide rocky truncated cone, about 1.5 times wider at the bottom than at the shoreline), with ledges, cracks, a few barnacles and small seaweed tufts, ending in a wide flat bottom edge. The bottom must be wider than the top part, NOT tapering to a point, NOT vertical walls, NOT floating. Whole object centered and fully visible with white margin around it, plain pure white background, no water, no text, no shadow.

- `volcano_a2`（经典锥形火山，用上）、`green_a2`（圆绿岛 + 棕榈，用上）、`volcano_b2`（破口火山口，用上）

### 重新生图（generate_image，nano-banana pro，2K）：主体描述 + 公共后缀

公共后缀：

> Stylized painterly fantasy game environment asset, hand-painted textures, semi-realistic but chunky stylized shapes with big readable forms and a clean silhouette, warm sunny daylight from the upper left, saturated but not garish colors, high quality concept art for a 3D Western fantasy dragon game. A SINGLE isolated sea island object, centered and fully visible with white margin around it, 3/4 view from slightly above (about 25 degrees elevation), plain pure white background, no water, no text, no cast shadow. Show the WHOLE island as if the sea had been drained away: the dry island above the shoreline, a thin dark wet band at the waterline, and below it the UNDERWATER foot of the island: rough wet blue-grey rock with ledges, a few barnacles and seaweed tufts, sloping OUTWARD and DOWNWARD and getting WIDER toward the bottom like the broad foot of a mountain (much wider at the bottom than at the waterline), ending in a wide flat bottom edge. NOT a floating island, NOT tapering to a point underneath, NOT a diorama platform with vertical walls. 

- `green_b2`（1:1）：The island: a green plateau island: a flat-topped grassy mesa with steep warm-grey layered rock cliffs on one side and a gentle grassy slope down to a golden sandy beach on the other side, a small cluster of stylized round-canopy trees on the plateau, a few bushes and mossy boulders, a sandy beach ring around most of the shore. Low and wide, height about 0.35 times the island width.
- `spire_a2`（3:4）：The island: a tall weathered sea stack rock spire: a single tall pillar of layered warm-grey and sandstone-beige rock with horizontal strata, deep weathering grooves, a slightly leaning silhouette and a narrower waist, green moss and grass patches on the ledges, a grassy cap on the flat top with one small windswept tree and a few bushes. The spire is about 3.5 times taller than its base width at the waterline.
- `spire_b2`（3:4）：The island: a tall twin-peaked weathered sea stack: a thick pillar of layered grey and sandstone rock that splits into two jagged peaks of different heights near the top, horizontal rock strata, weathered cracks, ledges with green moss and small grass tufts, a few seabird-white streaks. The rock is about 3 times taller than its base width at the waterline.

## Tripo（图生 3D，智能网格 P1）

- `--model P1-20260311 --face-limit 12000`（火山、绿岛）/ `10000`（石柱）。6000 面时水上部分只分到 1500 面，太糊；所以先要多一点面，再在 Blender 里优先减水下的面。


## Blender（`blender/env_island.py build <tripo.glb> <out.glb> <out.json> <海平面比例> kind=… tris=… …`）

参数都写在 `blender/env_build.py` 里，`python blender/env_build.py [名字]` 一键重做（约 50 秒，会顺便量化 glb、重新生成 `src/config/island-shapes.js`）。
接缝检查图：`blender -b --factory-startup -P blender/env_seamcheck.py -- <out_dir> models/env/<名字>.glb:<k>`（背面剔除 + 洋红背景，洞、外伸的台子一眼看得出）。

流程（v3）：读 Tripo 原模 → 摆平（rx / ry）→ 归一化（岸线半径 = 1、海平面 y = 0）→ **在 cut（海平面下约 0.5 米）处水平切掉 Tripo 的水下部分**
（连同水线下的薄台子、碎片；石柱的外张台座也一起切掉）→ 减面（只算水上的 Tripo 部分）→ 再切一刀、切口边上的点压回切口平面 →
**量原模外轮廓**（每列 5 根子射线 × [cut, +0.004] 里 5 个高度取最外面的半径：原模的岸边台子不会伸出岩基变成「桌面」）→
**生成岩基**（64 列 × 12 圈：顶圈 = 外轮廓，陡壁和往外的平台交替，每列的台阶高低不同；三层径向起伏 ±18%、5~7 条往下伸的石脊、12 块鼓包；
最后一段缓坡斜插进海底）+ **盖子**（顶圈围住的一整块水平面，把原模切口封死）→ LOD1 / LOD2（整块减面）→
高度图（火山、石柱 64×64，绿岛 48×48；每格取格点和斜向 ±pool 格四个点里最高的表面）→ 导出（坐标 ÷ 4、节点缩放 4）→
`blender/glb_quantize.py`（KHR_mesh_quantization：坐标 / UV 16 位，three.js 原生支持）。

| 形状 | sea（海平面比例） | seaR | cut / bot | 高度图 n / pool | LOD0 / LOD1 / LOD2 三角面 | top / bottom | glb |
|---|---|---|---|---|---|---|---|
| `volcano_a` | 0.588 | 0.58 | -0.008 / -1.3 | 64 / 0.4 | 4687 / 1406 / 536 | 1.047 / -1.3 | 218 KB |
| `volcano_b` | 0.63 | 0.597 | -0.006 / -1.3 | 64 / 0.4 | 5009 / 1501 / 450 | 0.783 / -1.3 | 236 KB |
| `green_a`（rx=3 ry=-11） | 0.62 | 0.588 | -0.015 / -1.3 | 48 / 0.3 | 4811 / 1443 / 432 | 1.129 / -1.3 | 226 KB |
| `green_b` | 0.336 | 0.315 | -0.013 / -1.1 | 48 / 0.3 | 4811 / 1443 / 432 | 0.793 / -1.1 | 232 KB |
| `spire_a` | 0.28 | 0.28 | -0.025 / -1.25 | 64 / 0.4 | 4403 / 1320 / 396 | 3.397 / -1.25 | 223 KB |
| `spire_b` | 0.22 | 0.22 | -0.022 / -1.1 | 64 / 0.4 | 4422 / 1326 / 397 | 3.035 / -1.1 | 236 KB |

（LOD0 里约 1470 个三角形是岩基 + 盖子；镜头在水上时只画水上那组三角形，岩基基本不画。）

- 海平面：看 probe 的检查图 / 正交侧视图定。volcano_b（黑色台座）、green_a（沙滩下的墙）、green_b、volcano_a 的海平面往上挪过一点（sea > seaR），
  低空看不再是一圈 5~10 米高的黑墙 / 灰墙；岸线半径仍按原来的墙量（seaR），岛的大小不变。green_b 没再往上挪（评审建议 0.40）：
  它的沙滩在模型高度的 0.325~0.375，海平面到 0.40 沙滩就淹了；改成在着色器里把陡的黄褐崖面染成暖灰岩石 + 层理。
- cut：按用这个形状的岛里最小的「竖直缩放 × 水下拉伸 k」换算成约 0.5 米（火山 0.006~0.008，绿岛 0.013~0.015，石柱 0.022~0.025）。
  v2 切在 -0.08 / -0.15，原模在水线下留了好几米：有洞（后面是描边壳的黑色）、外伸的台子从下面看像桌面、石柱的台座像 T 字帽。
- 岩基的颜色全在 `islands.js` 里画（贴图坐标只用一个点）：模型 y < cut 就算岩基。
- 高度图自检（`HMERR`，模型单位 × 岸线半径 = 米）：真实表面比碰撞面高的 p99 ≈ 0.005~0.01（火山）/ 0.04~0.1（绿岛，树冠）/ 0.13（石柱陡壁）。
- 贴图：只留底色，1024 WebP（q 78~82）；法线不存，three.js 按位置焊接后重算（描边壳不裂）。

## 着色（`src/view/islands.js`）

- 火山：贴图里非熔岩的像素按亮度换成冷灰玄武岩（提亮），火龙（红褐）在火山前面不再融进去；熔岩（r - max(0.62g, b) > 0.1~0.38）
  换成橙红色 + 自发光，慢慢明暗；火山口里一圈暖光；volcano_b 外面几乎没有熔岩河 → 加一张稀疏的发光细裂缝网（`VEINS`）。
- 绿岛：陡的黄褐色崖面（不是草、不是沙滩、不是树）染成暖灰岩石 + 横的暗层理；Tripo 烤成大红的树干压成红褐色。
- 水下（岩基 + 原模水线下那一点）：近水面是按种类上色的湿岩石（火山冷灰、绿岛暖灰、石柱灰褐），往下混进蓝灰、越深越暗；
  横的层理（一明一暗 + 断续的细暗线）、稀疏的竖裂缝；朝上的台阶提亮成沙 / 苔色，偶尔一小块粉 / 赭的珊瑚色；浅处一些藤壶小点（远了不画）；
  朝上的面加卡通焦散；岩基按三角形算法线（块面感）。
- 水下那套三角形用双面材质（万一有缝，看到的是石头）；描边在水下粗 1.35 倍、雾只算七成。
- 岸边白沫只在 |y| < 4 米的像素上算；LOD 切换有 ±10% 回差。

## 碰撞（`src/sim/world.js`）

- `groundAt / pushOutOfIslands / seabedY / islandSurface` 用高度图（双线性，按岛的位置 / yaw / sx / sy、水下再乘 k）；漏打的个别格子加载时用邻格补上。
- 水里的主角（海龙、扎水的火龙）和跃出水面的海龙（`crossMax > 0`）：岛面高过 -3 米就算「岸」，当墙推（退回岸线外再顺着岸滑），
  不再从沙滩底下钻过去，也不会跳上岛卡在树丛里。跃出水面落到沙滩上（`medium = air`）：往岛里走的那部分扣掉，每步最多往外挪 0.3 米，
  高度不低于岛面 + 半个身子——顺着沙滩滑回水里（以前会被每步 0.9 米横着推出去，约 55 米 / 秒）。
- 火山海里至少 4 座火山（`volcanoSea`）：把火山海里最大的非火山岛（不在石柱簇里）换成火山（尺寸用岛自己的种子重抽、按间距规则限半径），
  不够再用另一个 RNG 补；不动主 RNG 的顺序，前 4 座手摆的不动。现在：10 号、33 号绿岛换成火山，补了 38、39 号。
- `seabedBase(x, z)`：岛底下的海底（区域海底 + 岩基够不到时垫的海底坡，不含岛的岩石），给 `sea-bed.js` 画海底地形用——
  用 `seabedY`（含岛面）的话 5 米一格的地形在陡的岩基上连不准，会有大块平面 / 一排沙色尖牙从岩壁里戳出来（`.cache/rec/isl_v3_sea_game_sheet.jpg`）。
  试验页 `_lab/islands_seabed.html`（import map 把 sea-bed.js 换成改了这一行的副本；`python _lab/islands_seabed_make.py` 重新生成）。

## 已知的坑

- nano-banana 画「海岛」默认是浮空岛 / 方形底座：一定要写清「把海水抽干后看到的整座山，水下部分往外、往下越来越宽」，并且用改图把第一轮满意的上半部分保留下来。
- Tripo 给面是按面积分的：水下岩基很大时，水上只分到一小半。先要 10000~12000 面，再在 Blender 里优先减水下的。
- 生图服务同一个 key 同时只能跑一个任务（别的 agent 也在用），`lai.py` 遇到 429 每 20 秒重试。
- Tripo 的水下岩基（就算概念图画得好）减面后在水下近看很糙；水上留 Tripo，水下换程序化岩裙 + 着色器画颜色，又省面又干净。
- 原模要切在海平面下很浅的地方（约半米），岩基顶圈取原模在切口附近「最外面」的半径，再用盖子封口：切深了水线下会留一圈有洞、外伸的原模。
- 量化 glb：坐标要在 ±1 内，导出前顶点 ÷ 4、节点缩放 4；`islands.js` 加载时把节点变换乘回坐标（`bakeNode`）。
- Blender 渲检查图偶尔在显卡驱动里崩（EXCEPTION_ACCESS_VIOLATION nvoglv64.dll），`env_build.py` 会重跑。
- 海底地形（sea-bed.js）和陡的岩裙相交时别用含岛面的 `seabedY`，用 `seabedBase`。
- 量岛的高度图要「取周围最高」（max-pool），否则尖的山脊、树冠、石柱边上龙会蹭进石头；陡壁会往外挪一点，龙的半径能盖住。
