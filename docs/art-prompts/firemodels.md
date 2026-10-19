# firemodels（幼 / 少年火龙）美术提示词

## 尾锤贴图参考图（v4，2026-10-11）——没用上
目的：玄武岩 + 熔岩裂纹参考图，取裂纹形状做尾锤贴图。AI 生图服务这次连不上（TLS 握手失败，重试 40 分钟），
所以尾锤贴图仍是代码画的（blender/club_paint.py，程序生成的折线裂纹）。下次网络好了可以用这条重新生成，按 club_paint.paint 的 src 参数接进来。

    generate_image.py --size 2K --aspect-ratio 1:1
    Stylized hand-painted game texture, seen straight on, filling the whole square: a dark warm charcoal-grey basalt rock surface
    (volcanic stone, colour like dark ash grey with a slight brown tint) broken by a SPARSE network of glowing orange-red lava cracks.
    Only a few bold cracks: irregular, jagged, slanted, branching like lightning or fractured stone, thin tapering ends, never straight,
    never parallel, no letters, no runes, no symbols. Bright yellow-orange hot core inside each crack fading to deep orange-red at its
    edges, the glow stays tight around the crack. The stone between the cracks has soft painterly brush strokes and subtle mottling,
    matte, flat even lighting, no cast shadows, no perspective, no frame, no border, no text, no watermark. Fantasy dragon concept art style.
