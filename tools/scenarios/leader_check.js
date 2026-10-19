// 金色领头：马上叫出一只 → 机器人朝它飞 → 截 线索 / 追 / 累了 / 抓到（特性卡）→ 之后再玩一会儿看特性效果（热浪 / 残留漩涡）
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, S = D.S, bot = makeBot(TIERS[0], 7);
S.hunt = null; S.huntNext = 1e9; S.stats.eaten = Math.max(2, S.stats.eaten); S.leaderNext = S.t + 1; if (Q.has('trait')) { S.traits[Q.get('trait')] = 1; S.leaderNext = 1e9; }
let n = 0, shotAt = { cue: 0, chase: 0, tired: 0, trait: 0, heatwave: 0, hwI: -99, eddy: 0 }, after = -1;
const shot = async k => { await __shot(String(n++).padStart(2, '0') + '_' + k); };
const sea = S.kind === 'sea';
const { makeGroup } = await import('/src/sim/creatures.js');
// 有 ?trait 时：每 5 秒在正前方放一小群，其中一只先烤熟（吃它就能看到热浪）
const feed = () => { const h = S.hero, x = h.x + Math.sin(h.yaw) * 28, z = h.z + Math.cos(h.yaw) * 28; const g = makeGroup(S, sea ? 'sardine' : 'sparrow', x, h.y, z, 7); const c = S.creatures.find(o => o.g === g); if (c && !sea) { c.cooked = 1; } };
for (let i = 0; i < 30 * +(Q.get('secs') || 60); i++) {
  let o = bot(S); const L = S.leader, h = S.hero;
  if (L) { const want = Math.atan2(L.x - h.x, L.z - h.z), d = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw)); o = { ...o, jx: Math.max(-1, Math.min(1, -d * 2)), jy: Math.max(-1, Math.min(1, (h.y - L.y) * .08)) }; }
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act;
  if (sea && i % 75 === 0) D.input.actTap = true;   // 海龙时不时冲刺（有特性后看残留漩涡）
  if (Q.has('trait') && i % 150 === 20) feed();
  D.frame(1 / 30);
  const evs = S.events.map(e => e.type);
  if (S.leader && S.leader.phase === 'cue' && !shotAt.cue && S.leader.t > .5) { shotAt.cue = 1; await shot('cue'); }
  if (S.leader && S.leader.phase === 'chase' && !shotAt.chase && S.leader.t > .8) { shotAt.chase = 1; await shot('chase'); }
  if (S.leader && S.leader.tired && !shotAt.tired) { shotAt.tired = 1; await shot('tired'); }
  if (S.traits && Object.keys(S.traits).length && !shotAt.trait) { shotAt.trait = 1; after = i + 12; }
  if (i === after) await shot('trait');
  if (S.creatures.some(o => o.heat && o.roast > 3.2) && shotAt.heatwave < 2 && i > shotAt.hwI + 60) { shotAt.heatwave++; shotAt.hwI = i; await shot('heatwave'); }
  if (evs.includes('eddy') && shotAt.eddy < 2) { shotAt.eddy++; for (let k = 0; k < 8; k++) D.frame(1 / 30); await shot('eddy'); }
}
__log('traits ' + Object.keys(S.traits).join(',') + ' pts ' + Math.round(S.pts));
await __done();
