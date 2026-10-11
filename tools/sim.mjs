// 不开浏览器跑游戏逻辑 + 自动试玩机器人（4 档玩家），看成长节奏、没吃到的最长间隔、被咬次数、卡住 / NaN。
//   node tools/sim.mjs --kind fire --runs 60 --minutes 8            # 4 档 × 60 局
//   node tools/sim.mjs --kind sea --runs 5 --tier 1 --verbose       # 只跑中速档，打印过程
import { createSim, step, goalTarget, nearestEdible, DT } from '../src/sim/sim.js';
import { SPECIES } from '../src/config/species.js';
import { STAGE_PTS } from '../src/config/dragons.js';
import { makeBot, TIERS } from '../src/sim/bot.js';
import { waveH } from '../src/sim/world.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const KIND = arg('kind', 'fire'), RUNS = +arg('runs', 20), MIN = +arg('minutes', 8), ONLY = arg('tier', null), VERB = !!arg('verbose', false);
export function runOne(kind, tier, seed, minutes, verbose) {
  const S = createSim({ kind, seed });
  const bot = makeBot(tier, seed);
  const stageAt = [0, null, null];
  let maxGap = 0, gap = 0, eats = 0, cross = 0, crossEnter = 0, crossExit = 0, evts = {};
  const N = Math.round(minutes * 60 / DT);
  for (let i = 0; i < N; i++) {
    step(S, bot(S));
    gap += DT;
    for (const e of S.events) {
      evts[e.type] = (evts[e.type] || 0) + 1;
      if (e.type === 'eat') { eats++; maxGap = Math.max(maxGap, gap); gap = 0; if (e.cross) cross++; }
      if (e.type === 'evolve') { stageAt[e.stage] = S.t; if (verbose) console.log(`  t=${S.t.toFixed(1)} 进化到 ${e.stage}`); }
      if (e.type === 'enterWater') crossEnter++;
      if (e.type === 'exitWater') crossExit++;
      if (verbose && (e.type === 'goal' || e.type === 'bite' || e.type === 'alert')) console.log(`  t=${S.t.toFixed(1)} ${e.type} ${JSON.stringify(S.goal)}`);
    }
    if (stageAt[2] != null && S.t > stageAt[2] + 20) break;
  }
  return { missRate: S.stats.misses / Math.max(1, S.stats.passes), skills: S.stats.skills, stageAt, eats, eatPerMin: eats / (S.t / 60), maxGap, bites: S.stats.bites, bitesPerMinBaby: S.stats.bites / ((stageAt[1] ?? S.t) / 60), cross, crossEnter, crossExit, nan: S.stats.nan || 0, stuck: S.stats.stuck || 0, goalIdx: S.goalIdx, stage: S.stage, pts: S.pts, t: S.t, evts, creatures: S.creatures.length };
}

const med = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const p90 = a => { const b = a.filter(x => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length * .9)] : null; };

if (process.argv[1] && /[\\/]tools[\\/]sim\.mjs$/.test(process.argv[1])) {
  const t0 = Date.now();
  const report = {};
  for (let ti = 0; ti < TIERS.length; ti++) {
    if (ONLY != null && +ONLY !== ti) continue;
    const res = [];
    for (let k = 0; k < RUNS; k++) {
      const r = runOne(KIND, TIERS[ti], 1000 + k * 17 + ti, MIN, VERB);
      res.push(r);
      if (VERB) console.log(TIERS[ti].name, k, JSON.stringify({ ...r, evts: undefined }));
    }
    const notReach = res.filter(r => r.stageAt[2] == null).length;
    report[TIERS[ti].name] = {
      runs: RUNS,
      toTeen_med: med(res.map(r => r.stageAt[1])), toTeen_p90: p90(res.map(r => r.stageAt[1])),
      toAdult_med: med(res.map(r => r.stageAt[2])), toAdult_p90: p90(res.map(r => r.stageAt[2])),
      teenToAdult_med: med(res.map(r => r.stageAt[2] != null && r.stageAt[1] != null ? r.stageAt[2] - r.stageAt[1] : null)),
      notAdultIn: `${notReach}/${RUNS} (${MIN} min)`,
      eatPerMin_med: med(res.map(r => r.eatPerMin))?.toFixed(1),
      missRate_med: med(res.map(r => r.missRate))?.toFixed(2), skills_med: med(res.map(r => r.skills)),
      maxGap_p95: p90(res.map(r => r.maxGap))?.toFixed(1),
      bitesPerMinBaby_med: med(res.map(r => r.bitesPerMinBaby))?.toFixed(2),
      cross_med: med(res.map(r => r.cross)), crossEnterExit: res.reduce((a, r) => a + r.crossEnter, 0) + '/' + res.reduce((a, r) => a + r.crossExit, 0),
      nan: res.reduce((a, r) => a + r.nan, 0), stuck: res.reduce((a, r) => a + r.stuck, 0),
    };
  }
  console.log(JSON.stringify(report, null, 1));
  console.log('took', ((Date.now() - t0) / 1000).toFixed(1), 's');
}
