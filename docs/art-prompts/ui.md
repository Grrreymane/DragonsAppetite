# 界面美术提示词（ui 模块）

全部用 AI（nano-banana pro）生成，白底原图放在 `.cache/art/ui/raw/`（不上线），用 `python tools/ui_icons.py`（`--preview` 另出深 / 浅底检查图）抠底、切格、拼成上线文件：

| 上线文件 | 内容 | 尺寸 | 大小 |
|---|---|---|---|
| `img/ui/icons.webp` | 图标图集 6×5 格，一格 192px（四周 8px 透明边）：能力 8 + 锁 + 菜单类 8 + 沙漏 + 阶段头像 6 + 海龙版咬 / 大口吞 2 + 星星（顺序见 `src/ui/icons.js` 的 `SHEET.names`，由 `tools/ui_icons.py` 的 `LAYOUT` 自动写入） | 1152×960 | 206 KB |
| `img/ui/logo.webp` | 标题字「小龙大胃王」+ 小火龙（透明底） | 720×317 | 53 KB |
| `img/ui/title_bg.webp` | 标题 / 加载页背景 | 720×1280 | 32 KB |
| `img/ui/card_fire.webp` / `card_sea.webp` | 标题页两张龙卡插画（照概念设定的少年龙，透明底） | 390×533 | 36 / 52 KB |

图集里每格出自哪张原图：能力 3×3（§1，冲刺 / 跃出两格弃用）、菜单 3×3（§2，「继续」三角弃用，一直用白色 SVG）、阶段头像（§3）、
海龙图标 3×2（§7：跃出、海龙咬、海龙大口吞、沙漏、星星）、冲刺 2×2（§8，现在挑右上 + 本地加的速度线，见 §10）。§6 是第一版海龙咬 / 大口吞（已被 §7 取代）。
海龙的三个阶段头像现在是 §3 下排**本地改色**成深海军蓝的版本（§11）；§11 的 AI 重画出图后会自动替换。

抠底说明：原图是白底，工具从图边往里泛洪「接近白色」的像素当背景（图标外圈都是深色描边，半透明边按深色描边反推，不会留白边）。
标题字也试过 AI `remove_background.py --model hr`，但它把小龙眼睛的高光一起抠透了，所以用本地抠底。
阶段头像那张图里模型照抄了参考图左上角的「海龙 · 成长设定」灰字，工具里把那块的灰色像素刷白、并把幼火龙头像裁成圆形。

## 1. 能力图标 3×3（`generate_image.py`，1:1，2K）→ `raw/abil_01.png`

```
A 3x3 grid sprite sheet of nine game ability icons for a cute fantasy dragon mobile game. All nine icons in ONE identical consistent style: painted stylized fantasy mobile-game UI icons, sticker-like: each icon is a single bold simple centered object with NO background badge, NO circle, NO frame; thick dark navy-brown outline around the whole silhouette and inner lines; soft painterly cel shading with warm light from the top-left and a small glossy highlight; saturated but not garish colors; very readable silhouette even at 40 pixels. Each icon fits inside its own square cell with generous empty white space around it and big gaps between icons. Plain flat pure white background. No text, no letters, no numbers, no grid lines.
Row 1, left to right: (1) BITE: a cute cartoon dragon jaw seen from the side snapping shut, red-orange scales, big white fangs. (2) FIRE BREATH: a fat swirling jet of orange-yellow fire. (3) PLUNGE: a small red winged dragon diving head-first straight down into a blue water splash.
Row 2: (4) ROAR: a red dragon head facing right roaring with mouth wide open, with three golden curved sound-wave arcs in front. (5) DASH: a teal-blue sea dragon head rushing forward to the right with white speed streaks behind it. (6) BREACH: a blue sea dragon leaping upward out of a water splash, arcing up.
Row 3: (7) VORTEX: a teal and white swirling whirlpool spiral with two tiny fish being pulled in. (8) GULP: a big wide-open cartoon dragon mouth about to swallow three tiny fish at once. (9) a chunky golden padlock.
```

## 2. 菜单图标 3×3（`generate_image.py`，1:1，2K）→ `raw/menu_01.png`

```
A 3x3 grid sprite sheet of nine game menu button icons for a cute fantasy dragon mobile game. All nine icons in ONE identical consistent style: painted stylized fantasy mobile-game UI icons, sticker-like: each icon is a single bold simple centered object with NO background badge, NO circle, NO frame; thick dark navy-brown outline around the whole silhouette and inner lines; soft painterly cel shading with warm light from the top-left and a small glossy highlight; warm cream, gold, orange and teal colors; very readable silhouette even at 24 pixels, very simple shapes, few details. Each icon fits inside its own square cell with generous empty white space around it and big gaps between icons. Plain flat pure white background. No text, no letters, no numbers, no grid lines.
Row 1, left to right: (1) PAUSE MENU: two thick rounded cream-white vertical bars side by side. (2) SOUND ON: a golden brass horn loudspeaker with two cream sound-wave arcs. (3) SOUND OFF: the same golden loudspeaker, slightly greyed, with a red rounded X next to it.
Row 2: (4) CODEX: a thick closed fantasy monster book, brown leather cover with a golden dragon emblem and gold corners. (5) SWITCH DRAGON: two chunky curved arrows chasing each other in a circle, one orange-red and one teal. (6) CONTINUE: a chunky rounded play triangle pointing right, warm golden-orange.
Row 3: (7) SHARE: a chunky upward arrow rising out of an open rounded tray, teal and cream. (8) LEFT HAND: a cartoon open left hand, palm facing the viewer, thumb on the right side, cream skin. (9) BACK: a chunky curved U-turn arrow pointing left, cream-white.
```

## 3. 阶段头像 3×2（`edit_image.py`，参考图 = `ref/fire-concept.webp` + `output/concepts/sea-dragon-v2/sea-dragon-growth-v2.png`，先 `upload_cos.py` 上传；3:2，2K）→ `raw/heads_01.png`

```
Using the two dragon concept sheets as character reference (image 1: the red fire dragon at three ages; image 2: the blue sea dragon at three ages), paint a 3x2 grid of six small round game badge portraits for a mobile game UI. Top row, left to right: the red FIRE dragon as baby, as teen, as adult. Bottom row, left to right: the blue SEA dragon as baby, as teen, as adult. Each badge is a head-and-neck portrait in three-quarter view facing left, the head filling most of the badge, inside a round golden-rimmed medallion with a soft colored backdrop (warm orange glow for the fire dragon, teal glow for the sea dragon). Keep each dragon's design faithful to the reference (horns, spikes, fins, colors, eye color) but simplified for tiny icons: bold readable shapes, thick dark outline around the silhouette, painterly cel shading, warm light from the top-left. The babies are very cute with big round eyes and stubby horns; the teens are leaner; the adults are majestic with bigger horns and spikes. All six badges same size, same style, evenly spaced with big gaps. Plain flat pure white background around the badges. No text, no letters.
```

## 4. 标题字（`generate_image.py`，16:9，2K）→ `raw/logo_a_01.png`

```
Game title logo for a cute fantasy dragon mobile game. The five Chinese characters "小龙大胃王" written in ONE horizontal line, exactly these characters and nothing else. Chunky, rounded, bubbly hand-lettered display characters with a playful slight bounce (each character a little tilted, slightly different size, "大胃王" a bit bigger than "小龙"). Fill: warm glossy gradient from golden yellow at the top to rich orange at the bottom, soft white gloss highlight on the upper edge of each stroke, subtle painterly texture. Thick dark warm-brown outline around every character, plus a second outer cream rim and a soft dark drop shadow underneath, slight 3D bevel thickness. A small cute baby red dragon (big eyes, tiny wings, round belly, Western dragon) peeking over the top of the last character "王" licking its lips, and a tiny flame curl accent. Stylized painterly fantasy game UI art, clean crisp edges, centered composition with empty margin. Isolated on a plain flat pure white background. No other text, no English, no watermark, no frame.
```

## 5. 标题页背景（`generate_image.py`，9:16，2K）→ `raw/bg_01.png`

```
Portrait 9:16 painterly fantasy game title-screen background, no characters. A warm sunny sky world above a teal sea: bright soft blue sky with a warm golden sun glow at upper right, big fluffy stylized cumulus clouds with warm peach-lit edges, a distant volcano island with a thin smoke plume on the right, small green tropical islands and tall rock sea-stacks on the horizon at about 55 percent height, the lower 40 percent is a calm stylized teal-turquoise sea with sparkles and soft painted wave strokes getting deeper blue toward the bottom. Stylized painterly fantasy illustration with toon shading and soft dark outlines on the islands, saturated but not garish, clean big readable shapes, calm composition with large empty areas at the top (for a title logo) and in the middle (for two character cards). No text, no UI, no frame, no people, no dragons, no birds.
```

## 6. 海龙版「咬 / 大口吞」（`edit_image.py`，输入 = 能力图集里的 咬 + 大口吞 两格拼成一张）→ `raw/seabite_01.png`

```
Recolor these two game icons into SEA DRAGON versions, keeping the exact same composition, pose, size, outline thickness, painted cel-shading style and white background. Left icon: the snapping dragon jaw. Right icon: the wide-open dragon mouth swallowing three small fish. Change the red-orange dragon scales into deep teal-blue and navy sea-dragon scales with a pale cream-white belly and jaw, turn the side horn into a translucent teal fin with a slightly orange tip edge, keep the white fangs and pink-red mouth inside, keep the small fish as they are. Same thick dark navy-brown outline. Two icons side by side with lots of empty white space, plain flat pure white background, no text.
```


## 7. 海龙图标 3×2（`edit_image.py`，参考图 1 = 海龙概念设定，参考图 2 = §1 的能力图集当画风参考；3:2，2K）→ `raw/seaicons_01.png`

第一版的「跃出」画成了带蝙蝠翅膀的浅蓝龙、「冲刺」只是个龙头，和海龙设定（无翅膀、深海军蓝 + 青色鳍 + 奶油色肚皮）对不上，所以照设定重画。

```
Image 1 is the character reference for the SEA DRAGON: a long, sleek, WINGLESS Western sea dragon with deep navy-blue scales speckled with small turquoise dots, teal-turquoise fins, spiky fin crests with orange-tipped edges along the head, back and tail, a big fan-shaped teal tail fin, a pale cream belly and throat, teal eyes. It has NO wings and NO bat wings; the only head spikes are swept-back teal fin spikes. Image 2 is the ICON STYLE reference (a sheet of painted game ability icons). Paint a NEW 3x2 grid sprite sheet of six game icons in EXACTLY the style of image 2: painted stylized fantasy mobile-game UI icons, sticker-like, each icon a single bold simple centered object with NO background badge, NO circle, NO frame; thick dark navy-brown outline around the whole silhouette and inner lines; soft painterly cel shading with warm light from the top-left and a small glossy highlight; saturated but not garish colors; very readable silhouette even at 40 pixels. Every dragon in this sheet is the sea dragon of image 1 (deep navy body, teal fins, cream belly, wingless), drawn cute with a slightly big head and a big eye.
Row 1, left to right: (1) DASH: the WHOLE sea dragon body seen from the side, streaking fast to the right in a long straight horizontal line, body stretched out, tail fin trailing behind, with three bold white-and-teal speed lines and a few bubbles streaming behind it. (2) BREACH: the WHOLE sea dragon leaping up out of a white-and-teal water splash in a big arc, head pointing up and to the right, tail fin still in the splash, water droplets flying. (3) BITE: the sea dragon's head in side view facing right, jaw snapping shut, big white fangs, pink mouth, teal fin crest behind the head.
Row 2, left to right: (4) GULP: the sea dragon's head in side view facing right with its mouth opened very wide, about to swallow three tiny fish at once. (5) TIME: a chunky golden hourglass with a warm wooden-brown frame and glowing orange-gold sand. (6) a chunky golden five-pointed star with a soft glossy highlight.
Each icon fits inside its own square cell with generous empty white space around it and big gaps between icons. Plain flat pure white background. No text, no letters, no numbers, no grid lines.
```

## 8. 冲刺 2×2 备选（`edit_image.py`，参考图 = 海龙设定 + §7 的海龙图标；1:1，2K）→ `raw/dash_01.png`

§7 的冲刺是一长条横着的龙，44px 的按钮上太细。要四个「接近正方形」的方案，挑了左下（整条龙斜着往上冲 + 水流尾迹）。

```
Image 1 is the character reference: the WINGLESS navy-blue sea dragon with teal fins, orange-tipped fin spikes, turquoise speckles and a cream belly. Image 2 is the exact ICON STYLE reference (painted sticker-like game icons with a thick dark navy-brown outline, soft cel shading, light from the top-left). Paint a 2x2 grid with FOUR alternative versions of one game ability icon called DASH (a sudden burst of speed), each in its own square cell, all in exactly the style of image 2 and with the same sea dragon as image 1 (navy body, teal fins, cream belly, NO wings). Every version must have a COMPACT, ROUGHLY SQUARE silhouette that fills its square cell well (not a long thin horizontal strip), so it stays readable at 44 pixels:
(1) top-left: the whole sea dragon curled in a tight dynamic C-shape, rushing diagonally toward the upper right, head and front claws leading, tail fin whipping behind, with three bold curved white-and-teal speed streaks trailing behind it.
(2) top-right: the sea dragon's head and front body bursting forward toward the viewer's right in a three-quarter view, determined grin, body foreshortened behind it, with a burst of white-and-teal speed lines and bubbles behind it.
(3) bottom-left: the whole sea dragon shooting diagonally up-right like a torpedo, body tucked into a short arrow shape, tail fin folded, a bold white-and-teal water jet trail behind it in a curve.
(4) bottom-right: the sea dragon swimming fast to the right in a short S-curve, with a big bold white chevron double-arrow speed mark ">>" behind it.
Generous empty white space around each icon and big gaps between the four cells. Plain flat pure white background. No text, no letters, no numbers, no grid lines, no title.
```

## 9. 标题页龙卡（`edit_image.py`，参考图 = 各自的概念设定；3:4，2K）→ `raw/card_fire_01.png` / `raw/card_sea_01.png`

原来的卡片用 3D 模型渲的小图，又小又暗。改成照概念设定画的少年龙插画，抠底后铺满卡片（翅膀出血到卡边），名牌压在下沿。

火龙：
```
Using image 1 as the character reference (the red fire dragon concept sheet; use the TEEN dragon in the middle: rust-red scales, dark charcoal back plates and spikes with thin glowing orange lava cracks, cream belly and throat, big red membrane wings with dark wing bones, a dark crystal club at the tail tip, amber eyes, dark swept-back horns), paint ONE character card illustration of this fire dragon for a mobile game title screen, portrait 3:4 composition. The dragon is flying toward the viewer in a dynamic, friendly heroic pose: three-quarter front view, body turned slightly to the left, both wings spread wide up and out, head tilted with a confident cute grin and a tiny curl of flame at the corner of the mouth, front claws tucked, tail curling around the bottom of the picture. Slightly cute proportions (a bit bigger head and eyes) but clearly the same Western dragon with the reference's horns, spikes, colors and wing shapes. The dragon fills the frame: it spans almost the full width and height. Stylized painterly fantasy game art with toon cel shading, crisp thick dark outline around the whole silhouette and on inner lines, warm light from the top-left, saturated but not garish colors, clean big readable shapes. Isolated on a plain flat pure white background: no ground, no cast shadow, no scenery, no text, no frame.
```

海龙：
```
Using image 1 as the character reference (the sea dragon concept sheet; use the TEEN dragon in the middle: a long sleek WINGLESS Western sea dragon with deep navy-blue scales speckled with small turquoise dots, teal fin crests with orange-tipped spikes along the head, back and tail, a big fan-shaped teal tail fin, a pale cream belly and throat, teal eyes, four short clawed legs), paint ONE character card illustration of this sea dragon for a mobile game title screen, portrait 3:4 composition. The dragon is swimming up toward the viewer in a dynamic, friendly heroic pose: three-quarter front view, the long body curving in a graceful S shape, head raised with a confident cute smile, front claws reaching forward, the big teal tail fin sweeping around the bottom of the picture, a few water droplets and small bubbles around it. It has NO wings. Slightly cute proportions (a bit bigger head and eyes) but clearly the same dragon with the reference's fins, spikes and colors. The dragon fills the frame: it spans almost the full width and height. Stylized painterly fantasy game art with toon cel shading, crisp thick dark outline around the whole silhouette and on inner lines, warm light from the top-left, saturated but not garish colors, clean big readable shapes. Isolated on a plain flat pure white background: no ground, no cast shadow, no water surface, no scenery, no text, no frame.
```

## 10. 冲刺图标重做（第三轮评审：冲刺和跃出太像）

原来挑的 §8 左下是「整条龙斜着往上冲 + 水流尾迹」，和「跃出」（往上跃出水花）在 35–44px 下几乎一样，海龙幼龙同时看得到两个（动作键 + 下一阶段那一行）。
改成 §8 的**右上**（龙头 + 前身横着往右冲），再由 `tools/ui_icons.py` 的 `speed_lines()` 在后半截身子上压三道圆头速度线
（深色描边 + 白芯 + 下沿淡青，和图标的卡通描边一致），44px 的按钮上也一眼看出「快」，没有水花、不往上。

本来想用 AI 重画一张 2×2（冲刺两个方案 + 火龙 / 海龙「大口吞」鼓腮帮子版，让它和「龙吼」分得更开），提示词在
`.cache/art/ui/p3_dashgulp.txt`、脚本 `.cache/art/ui/queue3.py`；但 生图服务的 key 过期了（401，自动刷新退回手动），这次没生成。
key 换好后跑 `python .cache/art/ui/queue3.py`，出图 `raw/dashgulp_01.png`，在 `SOURCES` 里接上即可。提示词：

```
Image 1 is the character reference for the SEA DRAGON (wingless, navy + turquoise speckles, teal fins with orange tips, cream belly). Image 2 and image 3 are the exact ICON STYLE references (painted sticker-like icons, thick dark navy-brown outline, soft cel shading, light from the top-left). Image 2 also shows the red FIRE dragon head used in these icons. Paint a NEW 2x2 grid of four game ability icons in EXACTLY that style, each COMPACT and roughly square, readable at 40 pixels:
(1) DASH: the WHOLE sea dragon from the side, body straight and level, shooting horizontally to the RIGHT like a torpedo, legs tucked, tail trailing straight behind; FOUR bold long horizontal white speed lines with thin dark outlines and a short trail of round white bubbles behind it. NO splash, NO arc, nothing pointing upward.
(2) DASH alternative: head and front body in three-quarter view bursting to the right, a big fan of bold white horizontal speed lines and a few bubbles behind. NO splash.
(3) GULP, fire dragon: the red fire dragon head in side view facing right, cheeks puffed out hugely round like a stuffed hamster, mouth closed in a happy smug grin with two little fish tails sticking out between its lips, eyes happily squeezed shut. NO sound waves, NO open jaw.
(4) GULP, sea dragon: the same puffed-cheeks pose with the sea dragon head.
Generous white space, big gaps, plain flat pure white background, no text, no grid lines.
```
（完整版见 `.cache/art/ui/p3_dashgulp.txt`。）

## 11. 海龙阶段头像改成深海军蓝（第四轮评审）

§3 下排的海龙头像是浅天蓝色，和海龙模型、标题龙卡、§7 的海龙图标（深海军蓝鳞片 + 青色鳍 + 奶油色喉咙）对不上。

**这次生图服务连不上**（服务端 TLS 握手失败，关沙盒也一样，可能是内网 / VPN 没开），所以先在本地改色上线：
`tools/ui_icons.py` 的 `navy_sea()` 只改金圈以内——蓝色鳞片（色相 190–235°）压暗成深海军蓝（保留明暗）、很亮的蓝（眼睛）换成青色、
发白的淡蓝（喉咙 / 肚皮）换成奶油色、幼龙肉粉色的耳鳍换成青色；青绿色底光、金圈、描边不动。检查图：`.cache/art/ui/preview_icons_dark.png`。

网络好了以后跑 `python .cache/art/ui/queue_heads.py`（上传参考图、排队、遇到网络错误自动重试；网址只存在 `.cache/art/ui/up4_*.json`），
出图 `raw/seaheads_01.png`（一排三个），再跑 `python tools/ui_icons.py --only icons --preview`：`SOURCES` 里已经接好了，有这张图就用它、不再改色。
`edit_image.py`，参考图 1 = `output/concepts/sea-dragon-v2/sea-dragon-growth-v2.png`，参考图 2 = `raw/heads_01.png`（上排火龙头像当圆章画风参考），参考图 3 = `raw/seaicons_01.png`（海龙头的画法）；16:9，2K。提示词（`.cache/art/ui/p4_seaheads.txt`）：

```
Image 1 is the character reference for the SEA DRAGON at three ages (top: baby, middle: teen, bottom: adult): a sleek WINGLESS Western sea dragon with DEEP NAVY-BLUE scales speckled with small turquoise dots, swept-back teal-turquoise fin spikes with copper-orange tips along the head and neck, pale tan swept-back horn fins behind the head on the older ages, a PALE CREAM throat and belly with soft scale lines, small teal eyes. Image 2 is a sheet of six round game badge portraits: its TOP ROW (the three red fire dragon badges) is the EXACT STYLE reference for the badge itself. Image 3 is a sheet of painted game icons whose dragon heads show the correct painted look of this sea dragon (deep navy head, teal fins, cream jaw and throat).
Paint a NEW image with exactly THREE round badge portraits of the SEA DRAGON side by side in ONE horizontal row, evenly spaced with big gaps: left = BABY, middle = TEEN, right = ADULT. Each badge must match the fire dragon badges in the top row of image 2 exactly: same round medallion size, same thick golden rim with a dark outline, same head-and-neck portrait framing (the head fills most of the badge, three-quarter view facing left, neck going down to the bottom edge of the circle), same thick dark outline around the silhouette, same painterly cel shading with warm light from the top-left. Backdrop inside each medallion: a soft deep TEAL to sea-green radial glow, slightly lighter in the centre (NOT pale sky blue).
The dragon in every badge has DEEP NAVY-BLUE head and neck scales with small turquoise speckles, teal fin spikes with copper-orange tips, a PALE CREAM jaw, throat and belly plates, and teal eyes, faithful to image 1. It has NO wings. BABY: very cute, big round shiny teal eyes, round snout, tiny stubby fin spikes, small smile. TEEN: leaner and longer snout, confident look, medium fin crest. ADULT: majestic, longer jaw with small fangs, big swept-back fin crest and pale horn fins, calm strong look. The three must read clearly as the same dragon growing up, and clearly darker navy than the old pale-blue version.
Plain flat pure white background around the badges. No text, no letters, no numbers, no title, no colour swatches, no grid lines.
```

## 小贴士

- 生图服务同一个 key 同时只能跑一个任务（别的 agent 在跑时返回 429「当前有AI任务在生成」），`.cache/art/ui/queue.py` 会排队、遇到 429 等 20 秒重试。
- 一张图里画一整套（3×3 网格、写明每格内容 + 统一画风描述）比一张张画风格更统一；「NO background badge」能得到贴纸式图标，按钮底座用 CSS 画。
- 宝石色按钮上不要放同色的画图标（橙色火焰放在橙色按钮上看不清）：动作键后面垫了一块奶油色圆，「开始 / 继续」用白色 SVG 三角。
- 结算插画（win_fire / win_sea）：用 ref/fire-adult.png、ref/sea-adult.png 做参考，nano-banana 编辑，4:3；提示词要点：胜利、朝镜头飞 / 跃出海面、开心、肚子吃得圆滚滚、海岛背景、卡通描边画风、不要文字。
- 结算 CG（第二版，用户说第一版「像怀孕了」）：fire_cg / sea_cg，提示词强调 epic key art、lean athletic body (NOT fat, no round belly)、低机位仰拍、喷火 / 冲出海浪、体积光。
