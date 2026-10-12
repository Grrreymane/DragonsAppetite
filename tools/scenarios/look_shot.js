// 对比光照风格：同一个种子、同一段机器人操作，在固定时刻截图（带界面）
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[0], 9);
const at = (Q.get('at') || '6').split(',').map(Number);
for (let i = 0, k = 0; k < at.length; i++) {
  const o = bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act;
  D.frame(1 / 30);
  if (i / 30 >= at[k]) { await __shot('s' + k); k++; }
}
await __done();
