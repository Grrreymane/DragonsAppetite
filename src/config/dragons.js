// 两条龙 × 三个阶段的数值（GDD §6.3 / §7.2）。成年火龙 = 原型手感，一个数都不改。
export const STAGE_NAMES = ['幼龙', '少年龙', '成龙'];
export const STAGE_PTS = [0, 40, 160];          // 进入该阶段时的累计成长点
export const ADULT_GOAL_PTS = 160;

// model：主角模型的清单（models/<name>.json）。没做好之前用成龙模型 + 骨骼缩放顶替（temp=true，画面角上标「临时」）
export const DRAGONS = {
  fire: {
    zh: '火龙', action: '喷火',
    stages: [
      { model: 'fire_baby', fallback: { model: 'fire_adult', bones: { head: 1.4, neck1: 1.05, 'wing1.L': .62, 'wing1.R': .62, tail1: .8 } },
        len: 4.3, level: 18, dive: 34, climb: 13, turn: 1.4, pitchK: .70, fireRange: 12, waterTime: 2.0, plungeDepth: 8, mouthR: 1.6, eatTier: 1, cookTier: 2 },
      { model: 'fire_teen', fallback: { model: 'fire_adult', bones: { head: 1.15, 'wing1.L': .82, 'wing1.R': .82 } },
        len: 7.1, level: 22, dive: 40, climb: 16, turn: 1.2, pitchK: .66, fireRange: 17, waterTime: 2.5, plungeDepth: 12, mouthR: 2.2, eatTier: 2, cookTier: 3 },
      { model: 'fire_adult',
        len: 10.3, level: 27, dive: 48, climb: 19, turn: 1.05, pitchK: .62, fireRange: 22, waterTime: 3.0, plungeDepth: 16, mouthR: 3.0, eatTier: 3, cookTier: 3 },
    ],
  },
  sea: {
    zh: '海龙', action: '冲刺',
    stages: [
      { model: 'sea_baby', fallback: { model: 'sea_adult', bones: { head: 1.35 } },
        len: 5, cruise: 16, dash: 30, turn: 1.5, pitchK: .8, maxDepth: -25, breachVy: 18, mouthR: 1.7, eatTier: 1, cookTier: 2 },
      { model: 'sea_teen', fallback: { model: 'sea_adult', bones: { head: 1.12 } },
        len: 9, cruise: 20, dash: 38, turn: 1.3, pitchK: .8, maxDepth: -50, breachVy: 24, mouthR: 2.4, eatTier: 2, cookTier: 3 },
      { model: 'sea_adult',
        len: 14, cruise: 24, dash: 45, turn: 1.1, pitchK: .8, maxDepth: -90, breachVy: 30, mouthR: 3.2, eatTier: 3, cookTier: 3 },
    ],
  },
};

// 小目标链（GDD §11.2）。type：eat 吃某种 / cooked 烤熟或撞晕后吃 / cross 跨界吃 / combo 连吃 / depth 潜到某层吃
export const GOALS = {
  fire: [
    [{ type: 'eat', sp: 'sparrow', n: 5 }, { type: 'cooked', n: 2 }, { type: 'cross', n: 1 }],
    [{ type: 'eat', sp: 'lavafinch', n: 3 }, { type: 'eat', sp: 'cloudjelly', n: 3 }, { type: 'eat', sp: 'flyfish', n: 3 }],
    [{ type: 'eat', sp: 'roc', n: 1 }, { type: 'eat', sp: 'manta', n: 1 }, { type: 'combo', n: 10 }],
  ],
  sea: [
    [{ type: 'eat', sp: 'sardine', n: 6 }, { type: 'cooked', n: 1 }, { type: 'cross', n: 1 }],
    [{ type: 'eat', sp: 'turtle', n: 2 }, { type: 'eat', sp: 'squid', n: 2 }, { type: 'cross', n: 3 }],
    [{ type: 'eat', sp: 'shark', n: 1 }, { type: 'eat', sp: 'manta', n: 1 }, { type: 'combo', n: 10 }],
  ],
};
export const GOAL_REWARD = [3, 10, 0];
