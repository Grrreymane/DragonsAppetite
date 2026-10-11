# 海龙主角（seamodels）用过的 AI 提示词

流程：设定图裁出单只龙（`ref/sea_<阶段>.png`，16:9 补边到 1600x900）→ `upload_cos.py` →
`edit_image.py`（nano-banana pro，`--aspect-ratio 16:9 --image-size 2K`）出「绑定姿势」图 →
再上传 → `generate_3d.py --model P1-20260311 --face-limit N`（Tripo 智能网格，只用图、不写文字）。
签名链接只在命令里用变量传，不写进任何文件。

| 阶段 | 裁剪框（设定图 1536x1024） | 绑定姿势图 | Tripo face-limit | 结果 |
|---|---|---|---|---|
| 幼龙 v1（已弃用） | (130,92)-(815,282) | `ref/sea_baby_rigpose_01.png` 2752x1536 | 5000 | 5,033 面；尾巴光秃、肚皮灰青，review 打回 |
| 幼龙 v2（现用） | 同上 | `ref/sea_baby_rigpose_02.png`（在 01 上再编辑，见下） | 5000 | 5,508 面（rig 时塌陷到 4,980），`.cache/art/sea_baby/tripo_c_01.glb` |
| 少年龙 | (140,288)-(1375,553) | `ref/sea_teen_rigpose_01.png` 2752x1536 | 6500 | 6,300 面 |
| 成龙 | 见 `.cache/art/sea_adult/` | `ref/sea_adult_rigpose_01.png` | 8000 | 7,957 面 |

注意：AI 同一账号同时只能跑一个任务（别的模块也在用），忙时返回 429，脚本
`.cache/art/sea_AI_retry.sh` 每 20 秒重试。每张图约 1 分钟，Tripo 约 1.5 分钟。

## 幼龙 · 绑定姿势（edit_image，参考图 = ref/sea_baby.png）

```text
Use the reference image ONLY for the dragon's design: same BABY sea dragon species, keep its baby proportions exactly (big round head, very large cyan eyes, short rounded snout, small swept-back ear fins, plump short body, short chubby legs with small webbed clawed paws, small soft fin crest along the back), long wingless salamander-like body, navy blue back scales with glowing turquoise spots, cream white belly and throat, teal blue fin crest along the back and tail with copper-orange fin edges, long thin tail ending in a fan-shaped teal tail fin. No wings. Do not copy its pose. Do not make it look older.

Draw this same dragon as a clean 3D-modeling reference in a neutral rigging pose (the quadruped equivalent of a T-pose):
- the whole body, neck and tail form one completely straight horizontal line seen from above, no S-curve, no bend, no twist;
- neck low and extended straight forward, continuing the line of the back (not raised like a swan), head level at the height of the shoulders looking straight ahead, mouth closed;
- standing on all four short legs, legs straight and vertical under the body, feet flat on the same level and slightly apart, legs clearly separated from the belly and from each other with visible gaps between them;
- the back fin crest standing upright in a neat row, ear fins spread;
- tail extended straight backward in line with the body, not curled, the fan tail fin standing vertically and fully spread, completely visible.
Camera: clear three-quarter view from the front-left at about 45 degrees, looking down at about 25 degrees so the top of the back and both sides of the body are visible, the whole dragon including the full tail fin visible with empty margin on all sides, centered.
Plain pure white background, soft even lighting, no cast shadow, no ground line, no text, no labels, no other creatures. Same painterly concept-art style and colors as the reference.
```

## 幼龙 v2 · 补尾鳍冠 + 奶白肚皮（edit_image，参考图 = ref/sea_baby_rigpose_01.png）

review（v2_review_seamodels 第 6 条）：幼龙尾巴上没有鳍冠（设定图和提示词都要「背和尾巴上都有鳍冠」），肚皮是灰青不是奶白。
在第一版绑定姿势图上直接改（姿势、镜头都不变），再走 Tripo。原文在 `.cache/art/sea_baby/crest-prompt.txt`，脚本 `.cache/art/sea_baby_crest.sh`。

```text
Edit this image of a baby sea dragon. Add a continuous low fin crest along the whole top of the tail, from the hips all the way back to the tail fan: small teal-blue fin spines joined by thin fin membrane, with copper-orange edges and tips, the same style and colours as the existing crest on its back, getting gradually lower toward the tail fan and joining the top of the tail fan. Make the belly, chest, throat and the underside of the chin cream white (warm ivory), clearly lighter than the navy back, like the reference style of a sea dragon with a navy back and cream belly. Keep everything else identical: same pose, same camera angle, same proportions, same big cyan eyes, same navy blue body with glowing turquoise spots, same teal tail fan with copper edges, same legs and paws, same plain white background, no shadow, no text.
```

`edit_image.py ... --aspect-ratio 16:9 --image-size 2K`（2752x1536）→ `ref/sea_baby_rigpose_02.png` → 上传 →
`generate_3d.py --model P1-20260311 --face-limit 5000`。结果尾巴上有一排小鳍刺、肚皮奶白，身体比 v1 圆胖（更像幼崽）。

## 少年龙 · 绑定姿势（edit_image，参考图 = ref/sea_teen.png）

```text
Use the reference image ONLY for the dragon's design: same TEENAGE sea dragon species, keep its teenage proportions from the reference (slimmer and lighter than an adult, medium head with large cyan eyes, swept-back ear fins, slender body, medium-length legs with webbed clawed paws, medium fin crest), long wingless serpentine salamander-like body, navy blue back scales with glowing turquoise spots, cream white belly and throat, teal blue fin crest along the whole back and tail with copper-orange fin edges, large fan-shaped teal tail fin. No wings. Do not copy its pose.

Draw this same dragon as a clean 3D-modeling reference in a neutral rigging pose (the quadruped equivalent of a T-pose):
- the whole body, neck and tail form one completely straight horizontal line seen from above, no S-curve, no bend, no twist;
- neck low and extended straight forward, continuing the line of the back (not raised like a swan), head level at the height of the shoulders looking straight ahead, mouth closed;
- standing on all four short legs, legs straight and vertical under the body, feet flat on the same level and slightly apart, legs clearly separated from the belly and from each other with visible gaps between them;
- the back fin crest standing upright in a neat row, ear fins spread;
- tail extended straight backward in line with the body, not curled, the big fan tail fin standing vertically and fully spread, completely visible.
Camera: clear three-quarter view from the front-left at about 45 degrees, looking down at about 25 degrees so the top of the back and both sides of the body are visible, the whole dragon including the full tail fin visible with empty margin on all sides, centered.
Plain pure white background, soft even lighting, no cast shadow, no ground line, no text, no labels, no other creatures. Same painterly concept-art style and colors as the reference.
```

## 成龙 · 绑定姿势（之前做的，原文在 .cache/art/sea_adult/rigpose-prompt-used.txt）

```text
Use the reference image ONLY for the dragon's design: same adult sea dragon species, long wingless serpentine salamander-like body, navy blue back scales with glowing turquoise spots, cream white belly and throat, teal blue fin crest along the whole back and tail with copper-orange fin edges, swept-back ear fins, large fan-shaped teal tail fin. No wings. Do not copy its pose.

Draw this same dragon as a clean 3D-modeling reference in a neutral rigging pose (the quadruped equivalent of a T-pose):
- the whole body, neck and tail form one completely straight horizontal line seen from above, no S-curve, no bend, no twist;
- neck low and extended straight forward, continuing the line of the back (not raised like a swan), head level at the height of the shoulders looking straight ahead, mouth closed;
- standing on all four short legs, legs straight and vertical under the body, feet flat on the same level and slightly apart, legs clearly separated from the belly and from each other with visible gaps between them;
- the back fin crest standing upright in a neat row, ear fins spread;
- tail extended straight backward in line with the body, not curled, the big fan tail fin standing vertically and fully spread, completely visible.
Camera: clear three-quarter view from the front-left at about 45 degrees, looking down at about 25 degrees so the top of the back and both sides of the body are visible, the whole dragon including the full tail fin visible with empty margin on all sides, centered.
Plain pure white background, soft even lighting, no cast shadow, no ground line, no text, no labels, no other creatures. Same painterly concept-art style and colors as the reference.
```

三段的第二部分（姿势、镜头、背景）完全一样，只换第一段的设计描述；幼龙强调「保持幼龙比例、不要画老」。

## 贴图调色（不是 AI，代码做的；v3 起 rig_sea.py 自动调用）

`rig_sea.py` 先按 3D 位置给每个面贴标签（尾鳍 = x < fan_x；背鳍 = 脊线上方、贴中线的竖片；腿 = 前臂 / 爪 / 小腿 / 脚，加上收腿时看得见的大臂 / 大腿面；头），
写成 UV 三角形交给 `python blender/sea_tex.py <tripo.glb> .cache/art/<名>/tex/base_v2.png --labels ...`：
先缩到 1024 再调；每块区域在 Lab 空间把均值对准设定图的同一组目标色（三个年纪一样）——藏青 (54,70,88)、海青鳍和青色块 (73,121,135) 亮度 ≤0.56、
奶白 (176,187,172)、发光斑点 (72,224,218) 亮度 ≥0.8 饱和 ≥0.6（整块填实、外扩 1 像素）；腿上的奶白改藏青；UV 岛之间的空白用周围颜色平滑填满（省体积）。
验收量导出后的 glb 里的图：`python blender/sea_tex.py --report-only models/sea_<名>_anim.glb`（发光键 色相 165–200 / 饱和 >0.5 / 亮度 >0.68 的占比 ≥0.25%）。
