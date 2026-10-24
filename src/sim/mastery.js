// 成年精通目标（GDD §19.6）：成龙做完小目标以后，小目标卡轮流出「破纪录」挑战，目标 = 自己的纪录再高一点。纪录存档，图鉴里看。纯逻辑。
//   combo 连吃：一口接一口（两口间隔 < 1.5 秒）连着吃的只数
//   skill 一次技能吃几只：龙吼 / 漩涡影响到的猎物，技能放完 3 秒内接着吃
//   cross 连续跨界吃：跨界抓到的猎物，两次间隔 < 4 秒算连着
export const MASTERY = {
  combo: { base: 8, step: 2 },
  skill: { base: 5, step: 2 },
  cross: { base: 3, step: 1 },
};
const ORDER = ['combo', 'skill', 'cross'];
const num = v => Number.isFinite(v) ? Math.max(0, Math.min(9999, Math.floor(v))) : 0;

export function initMastery(S, best) {
  S.best = { combo: 0, skill: 0, cross: 0 };
  if (best && typeof best === 'object') for (const k in S.best) S.best[k] = num(best[k]);
  S.mIdx = 0; S.masteryN = 0;
  S.xc = { n: 0, t: -99 }; S.sb = { n: 0, until: -99 };
  S.mCur = { combo: 0, skill: 0, cross: 0 };
}

// 每吃一口（sim.js 的 eat 事件）更新当前的连续数和纪录
export function trackEat(S, e) {
  if (!S.best) initMastery(S);
  if (e.cross) { S.xc.n = S.t - S.xc.t < 4 ? S.xc.n + 1 : 1; S.xc.t = S.t; }
  if (e.skill) { S.sb.n = S.t < S.sb.until ? S.sb.n + 1 : 1; S.sb.until = S.t + 3; }
  S.mCur.combo = e.combo | 0;
  S.mCur.cross = S.t - S.xc.t < 4 ? S.xc.n : 0;
  S.mCur.skill = S.t < S.sb.until ? S.sb.n : 0;
  for (const k of ORDER) if (S.mCur[k] > S.best[k]) S.best[k] = S.mCur[k];
}

// 下一个精通目标：三种轮流，目标 = max(起步值, 纪录 + 步长)
export function masteryGoal(S) {
  if (!S.best) initMastery(S);
  const m = ORDER[S.mIdx++ % ORDER.length], M = MASTERY[m];
  const n = Math.max(M.base, S.best[m] + M.step);
  return { type: 'master', m, n, rec: S.best[m], have: 0, done: false, icon: 'master_' + m, t0: S.t };
}

// 一个精通目标 90 秒没做到就换下一种（不罚，纪录太高时不会卡住）
export const MASTER_TTL = 90;
// 进度 = 这次挑战里达到过的最大连续数
export function masteryProgress(S, g) {
  g.have = Math.min(g.n, Math.max(g.have, S.mCur[g.m] || 0));
}
