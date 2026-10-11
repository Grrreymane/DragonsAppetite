# 生物（creatures）用到的 AI 提示词

生物本身仍是代码搭的低多边形（`src/view/creatures/models.js`），同屏要画上百只，不用贴图和外部模型。
AI 只用来出一张**造型 / 配色参考**，按它调了 12 种生物的比例、配色和表情。参考图不发布，放在 `.cache/art/creatures/sheet_01.png`。

## 生物设定参考图（nano-banana pro，edit_image）

参考图：`ref/fire-concept.webp`（火龙成长设定，用来对齐画风），先 `upload_cos.py` 上传，再：

```
python scripts/edit_image.py "<下面的提示词>" --image <上传后的 COS 链接> --output-dir D:/Minigame/Dragon/.cache/art/creatures --prefix sheet
```

```
Using the same painterly semi-realistic fantasy illustration style, brushwork and warm cream paper background as this reference sheet, paint a NEW creature design sheet (no dragons) for a mobile game: twelve small game creatures arranged in a neat 4x3 grid, each shown in clean side view, flying or swimming pose, with a thin dark outline, cute big shiny eyes on the prey animals, big readable silhouettes, clear dark back and light belly. Row 1 (sky prey): a plump round brown sparrow with cream belly, cream wing bars and a short orange beak; a white seagull with grey wings, black wing tips and yellow beak; a black lava finch with glowing orange belly, a flame crest and flame tail; a floating pink cloud jellyfish with soft ribbons. Row 2: a menacing but cartoon-cute giant roc eagle predator, dark brown with white head, golden hooked beak, red crest and red angry eyes; a blue-silver flying fish with big wing-like fins; a dark manta ray with white belly and white shoulder spots; a teal-backed silver sardine. Row 3 (sea): a glowing cyan jellyfish; a pink squid; a green sea turtle with patterned shell; a grey shark predator with red-tipped dorsal fin, angry red eyes and a toothy grin, threatening but cartoon-cute. Small Chinese label under each. Western fantasy, saturated but not garish colors.
```

从参考图里取用的：小雀的栗色头顶 + 奶油色脸 / 翼斑、橙喙；海鸥的灰翅黑翼尖；熔岩雀黑身橙肚火冠火尾；云水母的圆伞盖和腮红；大鹏的白头红冠金钩喙；鲨鱼的红尖背鳍、红眼、白牙咧嘴；猎物都是大黑眼 + 高光。

## v2 第二轮打磨（没有新的 AI 生成）

照上面这张参考图继续改，代码搭的模型：
- 水母 / 云水母：圆顶伞盖（半椭圆）+ 一片片的花边伞边 + 中间一簇短须 + 5 条波浪触手 / 飘带，脸朝前（大眼睛 + 腮红 + 小嘴）。
- 小雀：背更深、头顶深棕、脸和肚子奶油色；猎物的眼睛都放大 15~25%。
- 小图（图鉴 / 小目标卡）：先画一次量出实际剪影，再框紧画第二次，生物填满画面；鸟的翅膀抬成 V 字。

## v2 第三轮（按审阅意见改，没有新的 AI 生成）

还是照上面的参考图，只改代码：
- 水母 / 云水母：5 条触手都改成扁飘带（宽面朝外），7~8 节，弯成 S 形、梢上自然卷过去；S 弯的方向所有触手一样、相位只差一点，像一把顺着水流飘的飘带；着色器里的摆动改成一道从根往梢走的波。中间的短须缩小、往上收，颜色和伞底一样深，不再像一块浅色的「围兜」。
- 海龟：壳拱高（顶 0.34），带脖子的大圆头 + 大一点的眼睛，前鳍尖往下垂约 15°，侧面不再是一张扁饼。
- 正在被火烤：不再整只往浅橙色换（会洗白、像金色），本色只乘一点暖色，边缘一圈往深红橙换 + 红橙热光（越浅的生物边缘换得越多）。黑色的熔岩雀烤到一半还是黑的、边缘发红；粉色的云水母还是粉的、边缘发橙红。
- 龙吼晕了一片：最近的 4 只每只 3 颗晕星，别的每只 1 颗（同屏最多 40 颗，挤成一团的只给一只）。

三角面（本体，描边另算同样多）：水母 378、云水母 438、海龟 253，别的没变。
