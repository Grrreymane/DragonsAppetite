# 天空 / 云 / 海（skysea）用到的 AI 提示词

工具：`AI 生图工具`（nano-banana pro，`--size 2K --aspect-ratio 16:9`），
输出在 `.cache/art/skysea/`（不进仓库）。生成 → `tools/skysea_key.py` 绿幕抠图切块 → `tools/skysea_atlas.py` 拼图集
→ `img/clouds.webp`（2048×880，带透明，约 290 KB）+ `src/view/cloud-atlas-rects.js`。
拼图集时 sm0 会先过 `fix_glow`（底下橙色辉光和绿幕混出来的黄绿边拉回橙色、压低透明度）；块之间留 16 像素（mip 不串色），下面没用的行裁掉。

为什么画在**纯绿底**上：白云画在白底上没法抠（边缘看不出来），去背景模型对半透明的云边也不准。
云里几乎没有「绿比红蓝都多」的颜色，所以按「绿色超出量 e = G − max(R,B)」线性反解透明度和原色，软边、羽毛边都干净；
再把透明处的颜色用附近不透明像素的颜色填上（贴图过滤 / mip 时边上不会发黑发绿）。

## 1. 积云（clouds_a_01.png → cu0..cu5）

```
Game art sprite sheet: six separate hand-painted stylized cumulus clouds for a sunny fantasy dragon adventure game, arranged in a neat 3 by 2 grid with wide empty gaps between them so no cloud touches another cloud or the image edge. Painterly semi-realistic style like a high-quality animated fantasy film background painting: big soft rounded puffy cauliflower shapes with clean readable silhouettes, toon-like soft shading in three clear tones: bright warm sunlit cream-white tops lit from the upper left, soft light-blue to lavender-grey shaded undersides with gently flattened bottoms, subtle visible brush texture. Variety: one large tall towering cumulus, two wide medium cumulus, one long flat low cloud bank, two small round puffs. Each cloud is fully opaque in its body with soft feathered edges only at the very rim. Background: perfectly flat solid pure chroma-key green (#00FF00) everywhere, no gradient, no sky, no ground, no shadows, no text, no labels, no border, no frame.
```

## 2. 火山烟 + 高空卷云（smoke_b_01.png → sm0..sm2, wi0..wi2）

```
Game art sprite sheet for a sunny fantasy dragon adventure game, hand-painted painterly style matching soft toon-shaded cumulus clouds (bright warm tops lit from the upper left, cooler shaded undersides, visible soft brush strokes), arranged in a neat 3 by 2 grid with wide empty gaps so nothing touches anything else or the image edge. Top row: three separate billowing volcanic smoke puffs, each a single rounded cluster of soft round smoke balls, warm ash grey with lighter pale grey sunlit tops and darker charcoal-brown shaded undersides, a faint warm orange glow on the very bottom of one puff. Bottom row: three separate thin high-altitude wispy cirrus clouds, long horizontal feathery streaks made of a few sweeping brush strokes, white to very pale cream, tapered thin ends, wide and short. Background: perfectly flat solid pure chroma-key green (#00FF00) everywhere, no gradient, no sky, no ground, no shadows, no text, no labels, no border, no frame.
```

## 3. 准备好、但这一轮没生成成的（2026-10-11：AI 的 key 过期，401，自动刷新要 playwright + 内网登录）

key 换好后可以直接用（`.cache/art/skysea/gen2.sh <前缀> 16:9 "<提示词>"`），出来的图照上面的流程抠图、拼进图集：

- `clouds_c`（远处地平线上的云带 + 更细的高空卷云，代替现在用积云 cu2/cu3/cu1 拼的地平线云带、用 wi0~wi2 压扁的卷云）：
```
Game art sprite sheet for a sunny fantasy dragon adventure game, hand-painted painterly style matching soft toon-shaded cumulus clouds (bright warm cream-white tops lit from the upper left, soft pale lavender-blue shaded undersides, visible soft brush strokes), arranged in three clearly separated rows with wide empty gaps so nothing touches anything else or the image edge. Top row: two very long low distant horizon cloud banks, each a wide band of many small soft rounded cumulus puffs seen from far away, about seven times wider than tall, with a flat soft bottom edge. Middle and bottom rows: six delicate thin high-altitude cirrus wisps, each made of a few very thin long feathery brush streaks with tapered ends, airy, light and semi-transparent, pure white with a hint of pale blue, much thinner and lighter than the cumulus. Background: perfectly flat solid pure chroma-key green (#00FF00) everywhere, no gradient, no sky, no ground, no shadows, no text, no labels, no border, no frame.
```
- `style_sea`（只当配色参考，不进游戏）：
```
Stylized painterly fantasy game environment concept, portrait 9:16 view from about 60 meters above the sea looking forward and down at 35 degrees: a warm sunny sky with a soft gradient from deep blue at the top to pale warm cream at the horizon, a few big soft toon-shaded cumulus clouds, a small tropical green island with a beach, and a large calm teal ocean. The ocean is toon shaded like a high-quality animated fantasy film: clean readable color bands (deep teal-blue in the foreground, lighter turquoise wave faces, pale sky reflection toward the horizon), crisp thin white foam lines in lacy curling patterns on the wave crests, a bright turquoise shallow ring and a crisp white surf line around the island, a soft golden sun glitter lane. Saturated but not garish, clean shapes, no characters, no text.
```

## 用法

- 云（clouds.js）：每朵 = 一张大积云 + 0~2 张小团，实例化公告板一次绘制；离镜头近了淡掉，镜头在云里时镜头前盖一层很淡的云雾（≤ 35%）。
- 烟（clouds.js）：每个火山口 9 团，往上飘、变大、变淡，顺风偏；刚冒出来的偏暖（熔岩映的）。
- 卷云（sky.js）：9 片贴在天空球上（方位角大致均匀，无限远，慢慢转，一半左右翻），偏白、透明度 0.48~0.62。
- 地平线云带（clouds.js）：18 张积云（cu2 扁云带为主，夹 cu3 / cu1）围一圈，离镜头 1300 米跟着镜头走，蒙 38%~60% 的地平线雾色；和云、烟同一次绘制。
- 水面的花纹不用图：`src/view/sea-noise.js` 启动时算一张 256² 的可平铺噪声图（Voronoi + 梯度噪声）。
- 换图：重新生成 → `python tools/skysea_key.py <图> .cache/art/skysea/cut <前缀>` → 改 `tools/skysea_atlas.py` 的 ITEMS → `python tools/skysea_atlas.py`。
