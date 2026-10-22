// 生物表（sim 和 view 共用）。尺寸单位米。GDD §9.2。
// tier 档：1 小 / 2 中 / 3 大。who：哪条龙能吃（还要满足阶段档位，见 config/dragons.js 的 eatTier）
// hab：air 天上 / water 水下 / surface 海面附近（会跃出水面）
// beh：行为模块名（sim/creatures.js）
// alt / depth：活动高度范围（y 值）
// group：一群几只；max：同时存在上限
// colors：view 用的主色（body 背 / belly 肚 / accent 点缀），金色个体统一换成金色
export const SPECIES = {
  sparrow:   { zh: '小雀',   tier: 1, who: ['fire'],        hab: 'air',     beh: 'flock',  len: 1.1, speed: 13, alt: [40, 150],  group: [6, 12], max: 60, pts: 1, colors: { body: 0x8a5a3a, belly: 0xf0e2c8, accent: 0x5a3a24 } },
  gull:      { zh: '海鸥',   tier: 1, who: ['fire', 'sea'], hab: 'air',     beh: 'circle', len: 1.4, speed: 11, alt: [6, 26],    group: [5, 8],  max: 30, pts: 1, colors: { body: 0xf4f4f0, belly: 0xffffff, accent: 0x8a96a4 } },
  lavafinch: { zh: '熔岩雀', tier: 2, who: ['fire'],        hab: 'air',     beh: 'orbit',  len: 1.4, speed: 14, alt: [30, 120],  group: [4, 7],  max: 15, pts: 3, near: 'volcano', colors: { body: 0x2a2224, belly: 0xff7a22, accent: 0xffc040 } },
  cloudjelly:{ zh: '云水母', tier: 2, who: ['fire'],        hab: 'air',     beh: 'drift',  len: 2.6, speed: 2,  alt: [150, 230], group: [3, 5],  max: 12, pts: 3, colors: { body: 0xffc8e0, belly: 0xfff0f6, accent: 0xff9ac8 } },
  roc:       { zh: '大鹏',   tier: 3, who: ['fire'],        hab: 'air',     beh: 'patrol', len: 4.5, span: 9, speed: 24, alt: [80, 180], group: [1, 1], max: 3, pts: 8, predator: 'fire', colors: { body: 0x5a3e2a, belly: 0xf2ece0, accent: 0xd8a030 } },
  flyfish:   { zh: '飞鱼',   tier: 1, who: ['fire', 'sea'], hab: 'surface', beh: 'leap',   len: 1.0, speed: 16, depth: [-3, 8],   group: [4, 7],  max: 20, pts: 1, colors: { body: 0x4a7ab8, belly: 0xdfeaf4, accent: 0x9cc8f0 } },
  manta:     { zh: '蝠鲼',   tier: 3, who: ['fire', 'sea'], hab: 'water',   beh: 'ray',    len: 3.5, span: 7, speed: 9, depth: [-2, -60], group: [1, 2], max: 4, pts: 8, colors: { body: 0x2a3440, belly: 0xf0f2f4, accent: 0x5a6a7a } },
  sardine:   { zh: '沙丁鱼', tier: 1, who: ['fire', 'sea'], hab: 'water',   beh: 'school', len: 0.7, speed: 9,  depth: [-1.5, -20], group: [10, 16], max: 90, pts: 1, colors: { body: 0x3a8aa0, belly: 0xe8f0f4, accent: 0xb8d4e0 } },
  jelly:     { zh: '水母',   tier: 1, who: ['fire', 'sea'], hab: 'water',   beh: 'drift',  len: 1.0, speed: 1.2, depth: [-5, -25], group: [3, 6], max: 20, pts: 1, glow: true, colors: { body: 0x7ae0f0, belly: 0xd8fbff, accent: 0x40c0e0 } },
  squid:     { zh: '鱿鱼',   tier: 2, who: ['fire', 'sea'], hab: 'water',   beh: 'jet',    len: 1.6, speed: 12, depth: [-4, -20], group: [2, 4], max: 8, pts: 3, colors: { body: 0xf0b8b0, belly: 0xfff0ec, accent: 0xd06a70 } },
  turtle:    { zh: '海龟',   tier: 2, who: ['sea'],         hab: 'water',   beh: 'turtle', len: 1.8, speed: 4,  depth: [-22, -50], group: [1, 2], max: 4, pts: 3, colors: { body: 0x5a8a4a, belly: 0xe0d0a0, accent: 0x3a5a30 } },
  shark:     { zh: '鲨鱼',   tier: 3, who: ['sea'],         hab: 'water',   beh: 'patrol', len: 4.5, speed: 13, depth: [-12, -90], group: [1, 1], max: 3, pts: 8, predator: 'sea', colors: { body: 0x6a7a88, belly: 0xeef0f2, accent: 0x40505c } },
  // ---- 2026-10 新增（GDD 1.1 候选 + 和昼夜 / 天气挂钩）：when 'night' 只在夜里出 / 'storm' 只在下雨时出；nightUp 夜里浮到浅处 ----
  bat:       { zh: '蝙蝠',   tier: 1, who: ['fire'],        hab: 'air',     beh: 'flutter', len: 1.0, span: 2.2, speed: 12, alt: [18, 80],  group: [6, 10], max: 30, pts: 1, when: 'night', colors: { body: 0x3e2e44, belly: 0x9a7a8e, accent: 0xf0a8c0 } },
  albatross: { zh: '信天翁', tier: 2, who: ['fire', 'sea'], hab: 'air',     beh: 'glide',  len: 2.2, span: 6, speed: 15, alt: [6, 26],   group: [1, 3],  max: 6,  pts: 3, colors: { body: 0xf6f4ee, belly: 0xffffff, accent: 0x3a3a46 } },
  thunderbird:{ zh: '雷鸟',  tier: 3, who: ['fire'],        hab: 'air',     beh: 'patrol', len: 4.2, span: 9, speed: 20, alt: [60, 170], group: [1, 1],  max: 2,  pts: 8, when: 'storm', glow: true, colors: { body: 0x2a3a72, belly: 0xe0eaff, accent: 0x7fe8ff } },
  lantern:   { zh: '灯笼鱼', tier: 1, who: ['fire', 'sea'], hab: 'water',   beh: 'school', len: 0.6, speed: 7,  depth: [-12, -40], group: [8, 14], max: 50, pts: 1, glow: true, nightUp: true, colors: { body: 0x26365a, belly: 0x9ab2d4, accent: 0x7ff8ff } },
  mackerel:  { zh: '鲭鱼',   tier: 1, who: ['fire', 'sea'], hab: 'water',   beh: 'school', len: 0.9, speed: 13, depth: [-1.5, -12], group: [8, 14], max: 50, pts: 1, colors: { body: 0x2e6a8e, belly: 0xf0f4f8, accent: 0x18344a } },
  puffer:    { zh: '河豚',   tier: 2, who: ['fire', 'sea'], hab: 'water',   beh: 'puff',   len: 1.0, speed: 5,  depth: [-3, -18],  group: [2, 4],  max: 10, pts: 3, colors: { body: 0xe8c060, belly: 0xfff4d8, accent: 0x8a6a30 } },
  eel:       { zh: '海鳗',   tier: 2, who: ['sea'],         hab: 'water',   beh: 'lurk',   len: 2.4, speed: 14, depth: [-15, -60], group: [1, 2],  max: 6,  pts: 3, colors: { body: 0x4e6030, belly: 0xdcd4a0, accent: 0x2a3418 } },
  gsquid:    { zh: '大王乌贼', tier: 3, who: ['sea'],       hab: 'water',   beh: 'jet',    len: 5.0, speed: 10, depth: [-35, -90], group: [1, 1],  max: 2,  pts: 8, colors: { body: 0xc84a3a, belly: 0xf8d0c0, accent: 0x8a2a20 } },
};
export const SPECIES_IDS = Object.keys(SPECIES);
export const GOLD = 0xffcf3a;
