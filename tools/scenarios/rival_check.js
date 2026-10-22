// 天敌抢食：直接开一个猎场（天敌 3 秒后到），机器人朝猎场飞，带界面截图：天敌来了 / 被抢 / 吃掉天敌
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const { createHunt } = await import('/src/sim/hunts.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, S = D.S, bot = makeBot(TIERS[0], 7);
S.leaderNext = 1e9; S.stats.eaten = Math.max(1, S.stats.eaten);
S.discoveries[S.kind === 'fire' ? 'cloud' : 'tide'] = { found: 1, best: 0, completed: 0 };
let hu = null; for (let k = 0; k < 30 && !hu; k++) { hu = createHunt(S); if (!hu) D.frame(1 / 30); }
if (hu) { hu.rival.planned = true; hu.rival.at = 3; }
let shots = { rv: 0, eat: 0, rve: 0 }, n = 0;
for (let i = 0; i < 30 * +(Q.get('secs') || 40); i++) {
  let o = bot(S); const h = S.hero, H = S.hunt;
  if (H) { const rv = H.rival && H.rival.id > 0 && S.stage > 0 ? S.creatures.find(c => c.id === H.rival.id) : null, T = rv || H;
    const want = Math.atan2(T.x - h.x, T.z - h.z), d = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw)); o = { ...o, jx: Math.max(-1, Math.min(1, -d * 2)), jy: Math.max(-1, Math.min(1, (h.y - T.y) * .08)) };
    if (rv && S.kind === 'sea' && i % 40 === 0) D.input.actTap = true; if (rv && S.kind === 'fire') o.act = true; }
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act;
  D.frame(1 / 30); await new Promise(r => setTimeout(r, 20));
  const H2 = S.hunt;
  if (H2 && H2.rival && H2.rival.id > 0 && !shots.rv) { shots.rv = i + 45; }
  if (shots.rv && i === shots.rv) await __shot(String(n++) + '_rival');
  if (H2 && H2.stolen > shots.eat && shots.eat < 1) { shots.eat = H2.stolen; await __shot(String(n++) + '_stolen'); }
  if (H2 && H2.rival && H2.rival.eaten && !shots.rve) { shots.rve = 1; await __shot(String(n++) + '_rivalEaten'); }
}
__log('stolen ' + (S.hunt ? S.hunt.stolen : '-') + ' pts ' + Math.round(S.pts));
await __done();
