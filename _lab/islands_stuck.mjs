// 海龙「卡住」统计：精模岛 vs 旧剖面岛（node _lab/islands_stuck.mjs [old]）
import { islands, islandProfile } from '../src/sim/world.js';
import { createSim, step } from '../src/sim/sim.js';
import { makeBot, TIERS } from '../src/sim/bot.js';
if (process.argv[2] === 'old') for (const is of islands) { is.sh = null; is.reach = is.prof[0][0]; is.bedReach = is.r * 2.2; is.moundTop = -999; }
for (const kind of ['sea', 'fire']) {
  let stuck = 0, where = [];
  for (let seed = 1; seed <= 6; seed++) for (const tier of TIERS) {
    const S = createSim({ kind, seed }), bot = makeBot(tier, seed);
    let last = 0;
    for (let i = 0; i < 60 * 60 * 3; i++) {
      step(S, bot(S));
      if ((S.stats.stuck || 0) > last) { last = S.stats.stuck; const h = S.hero; where.push(`${h.x.toFixed(0)},${h.y.toFixed(0)},${h.z.toFixed(0)}`); }
    }
    stuck += S.stats.stuck || 0;
  }
  console.log(kind, 'stuck', stuck, where.slice(0, 8).join(' | '));
}
