// 生物预算：机器人玩，每 6 帧量一次只画生物时的三角面，记下最多那帧每种生物画了几只（本体 / 描边）
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 30);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 99), fps = 30;
const root = D.scene.getObjectByName('creatures'), api = root.userData.api;
let best = { tris: 0 };
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
  D.frame(1 / fps);
  if (i % 6 === 0) { const st = api.stats(); if (st.tris > best.tris) { best = { ...st, t: D.S.t.toFixed(1), per: Object.fromEntries(Object.entries(api.species).filter(([k, b]) => b.n).map(([k, b]) => [k, b.n + '/' + b.nNear + '=' + b.m.tris * (b.n + b.nNear)])) }; } }
}
__log('BEST ' + JSON.stringify(best));
await __done();
