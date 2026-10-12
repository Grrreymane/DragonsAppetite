// 两条龙 × 三个阶段的数值（GDD §6.3 / §7.2 + v2：每个阶段解锁新能力、捕猎越来越容易，见 docs/V2_PLAN.md）。
// 成年火龙的飞行数值 = 原型手感，不改。
export const STAGE_NAMES = ['幼龙', '少年龙', '成龙'];
export const STAGE_PTS = [0, 40, 220];          // 进入该阶段时的累计成长点
export const ADULT_GOAL_PTS = 220;

// 能力表（界面用的名字 / 一句话 / 图标名）。图标名对应 ui/icons.js
export const ABILITIES = {
  bite:   { zh: '咬',     desc: '靠近猎物自动咬',       icon: 'bite' },
  flame:  { zh: '喷火',   desc: '按住烤熟大一点的猎物', icon: 'fire' },
  plunge: { zh: '扎水',   desc: '往下冲进海里抓鱼',     icon: 'plunge' },
  roar:   { zh: '龙吼',   desc: '吼晕周围所有猎物',     icon: 'roar' },
  dash:   { zh: '冲刺',   desc: '加速撞晕猎物',         icon: 'dash' },
  breach: { zh: '跃出',   desc: '往上冲出水面抓鸟',     icon: 'breach' },
  vortex: { zh: '漩涡',   desc: '把附近的鱼吸过来',     icon: 'vortex' },
  gulp:   { zh: '大口吞', desc: '一口吞好几只',         icon: 'gulp' },
  roar_up:   { zh: '大龙吼', desc: '范围更大，冷却更短', icon: 'roar' },
  vortex_up: { zh: '大漩涡', desc: '范围更大，冷却更短', icon: 'vortex' },
};

// 每个阶段：
//   unlock：进化到这个阶段时新得到的能力（界面弹「新能力」卡）
//   bites：一口最多吞几只；assist：自动瞄准的范围（米）和锥角（度）；fear：威压半径（米，范围内的猎物吓呆、不会逃）
//   skill：第二个按钮（成龙才有）：cd 冷却秒，r 作用半径，t 持续秒
// model：主角模型清单（models/<name>.json）。没做好之前用 fallback（成龙模型 + 骨骼缩放顶替，画面角上标「临时」）
export const DRAGONS = {
  fire: {
    zh: '火龙', action: '喷火',
    stages: [
      { model: 'fire_baby', fallback: { model: 'fire_adult', bones: { head: 1.4, neck1: 1.05, 'wing1.L': .62, 'wing1.R': .62, tail1: .8 } },
        unlock: ['bite', 'flame'], canCross: false, bites: 1, assist: { range: 30, cone: 32 }, fear: 0,
        flapHz: 1.333, len: 4.3, level: 18, dive: 34, climb: 13, turn: 1.4, pitchK: .70, fireRange: 11, cookTime: .5, waterTime: 2.0, plungeDepth: 8, mouthR: 1.9, eatTier: 1, cookTier: 2 },
      { model: 'fire_teen', fallback: { model: 'fire_adult', bones: { head: 1.15, 'wing1.L': .82, 'wing1.R': .82 } },
        unlock: ['plunge', 'roar'], canCross: true, bites: 2, assist: { range: 38, cone: 38 }, fear: 10,
        skill: { id: 'roar', cd: 12, r: 26, t: 3 },
        len: 5.5, level: 22, dive: 40, climb: 16, turn: 1.2, pitchK: .66, fireRange: 17, cookTime: .35, waterTime: 2.6, plungeDepth: 12, mouthR: 2.6, eatTier: 2, cookTier: 3 },
      { model: 'fire_adult',
        unlock: ['roar_up', 'gulp'], canCross: true, bites: 4, assist: { range: 46, cone: 44 }, fear: 22,
        skill: { id: 'roar', cd: 8, r: 44, t: 4 },
        len: 10.3, level: 27, dive: 48, climb: 19, turn: 1.05, pitchK: .62, fireRange: 24, cookTime: .2, waterTime: 3.2, plungeDepth: 16, mouthR: 3.4, eatTier: 3, cookTier: 3 },
    ],
  },
  sea: {
    zh: '海龙', action: '冲刺',
    stages: [
      { model: 'sea_baby', fallback: { model: 'sea_adult', bones: { head: 1.35 } },
        unlock: ['bite', 'dash'], canCross: false, bites: 1, assist: { range: 22, cone: 34 }, fear: 0,
        len: 5, cruise: 16, dash: 28, dashT: .8, turn: 1.5, pitchK: .8, maxDepth: -25, breachVy: 18, mouthR: 1.9, eatTier: 1, cookTier: 2 },
      { model: 'sea_teen', fallback: { model: 'sea_adult', bones: { head: 1.12 } },
        unlock: ['breach', 'vortex'], canCross: true, bites: 2, assist: { range: 28, cone: 38 }, fear: 8,
        skill: { id: 'vortex', cd: 12, r: 22, t: 2 },
        len: 9, cruise: 20, dash: 38, dashT: 1.2, turn: 1.3, pitchK: .8, maxDepth: -50, breachVy: 24, mouthR: 2.6, eatTier: 2, cookTier: 3 },
      { model: 'sea_adult',
        unlock: ['vortex_up', 'gulp'], canCross: true, bites: 4, assist: { range: 34, cone: 44 }, fear: 16,
        skill: { id: 'vortex', cd: 8, r: 36, t: 2.6 },
        len: 14, cruise: 24, dash: 45, dashT: 1.4, turn: 1.1, pitchK: .8, maxDepth: -90, breachVy: 30, mouthR: 3.4, eatTier: 3, cookTier: 3 },
    ],
  },
};

// 小目标链（GDD §11.2，v2 按新能力重排：每个阶段的目标都用到这个阶段新学会的能力）
// type：eat 吃某种 / cooked 烤熟或撞晕后吃 / cross 跨界吃 / combo 连吃 / skill 用第二技能（龙吼 / 漩涡）影响后吃到
export const GOALS = {
  fire: [
    [{ type: 'eat', sp: 'sparrow', n: 5 }, { type: 'cooked', n: 2 }, { type: 'eat', sp: 'gull', n: 3 }],
    [{ type: 'cross', n: 3 }, { type: 'skill', n: 4 }, { type: 'eat', sp: 'lavafinch', n: 3 }],
    [{ type: 'skill', n: 8 }, { type: 'eat', sp: 'roc', n: 1 }, { type: 'eat', sp: 'manta', n: 1 }],
  ],
  sea: [
    [{ type: 'eat', sp: 'sardine', n: 6 }, { type: 'cooked', n: 1 }, { type: 'eat', sp: 'jelly', n: 3 }],
    [{ type: 'cross', n: 2 }, { type: 'skill', n: 5 }, { type: 'eat', sp: 'squid', n: 2 }],
    [{ type: 'skill', n: 10 }, { type: 'eat', sp: 'shark', n: 1 }, { type: 'eat', sp: 'manta', n: 1 }],
  ],
};
export const GOAL_REWARD = [3, 10, 0];
