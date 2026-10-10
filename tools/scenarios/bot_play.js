// 录像剧本：机器人玩一段（中快档），逐帧录。URL 参数：kind=fire|sea，secs=录几秒，tier=0..3，stage=0..2，shots=1 只存几张截图
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 20), TIER = +(Q.get('tier') || 1), SHOTS = Q.has('shots');
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[TIER], 1234);
const fps = 30;
let lastStage = D.S.stage;
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true;
  D.frame(1 / fps);
  if (SHOTS) { if (i % (fps * 2) === 0) await __shot('t' + String(i / fps).padStart(3, '0')); }
  else await __frame();
  if (i % fps === 0) __log(`t=${(i / fps).toFixed(0)} pts=${Math.round(D.S.pts)} stage=${D.S.stage} eaten=${D.S.stats.eaten} y=${D.S.hero.y.toFixed(1)} ${D.S.hero.medium} n=${D.S.creatures.length} calls=${D.renderer.info.render.calls} tris=${(D.renderer.info.render.triangles / 1000).toFixed(1)}k`);
}
await __done();
