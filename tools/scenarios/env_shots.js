// 昼夜 / 天气：同一个位置，按 ?tods=0.1,0.5 ... 和 ?ws=clear,rain ... 逐个截图（机器人飞 3 秒让画面稳定）
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg, E = window.__env, bot = makeBot(TIERS[0], 9);
const tods = (Q.get('tods') || '0.1').split(',').map(Number), ws = (Q.get('ws') || 'clear').split(',');
const tp = (Q.get('tp') || '').split(',').map(Number);
if (tp.length === 3) D.teleport(tp[0], tp[1], tp[2]);
E.fixed = true;
if (!Q.has('hunt')) { D.S.hunt = null; D.S.huntNext = 1e9; }
let n = 0;
for (const w of ws) for (const f of tods) {
  E.f = f; E.setWeather(w, 1e9);
  if (tp.length === 3) { D.teleport(tp[0], tp[1], tp[2]); D.S.hero.yaw = +(Q.get('yaw') || 0); D.S.hero.pitch = 0; }
  for (let i = 0; i < 90; i++) { if (Q.has('bot')) { const o = bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; } else { D.input.jx = 0; D.input.jy = 0; } D.frame(1 / 30); }
  await __shot(`${String(n++).padStart(2, '0')}_${w}_${f}`);
  if (Q.has('video')) for (let i = 0; i < 30; i++) { D.frame(1 / 30); await __frame(); }
}
await __done();
