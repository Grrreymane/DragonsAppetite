// 海龙模型在游戏里的自查（seamodels）：机器人玩 secs 秒（每帧 1/30 秒），每帧读 renderer.info，按阶段记峰值绘制调用 / 三角面；
// 每 every 秒存一张整页截图（rec3d --dom 时带界面）。URL 参数：kind=sea&stage=0..2&secs=40&every=2.5&tier=1&seed=1234
//   python tools/rec3d.py --director tools/scenarios/seamodels_bot.js --dom --size 540x960 --out .cache/rec/seamodels_v4/bot_s1 --query "autostart&kind=sea&stage=1&secs=40"
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 40), EVERY = +(Q.get('every') || 2.5), TIER = +(Q.get('tier') || 1), SEED = +(Q.get('seed') || 1234);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[TIER], SEED), fps = 30;
const peak = {}, sum = {};
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true;
  D.frame(1 / fps);
  const inf = D.renderer.info.render, st = D.S.stage;
  const p = peak[st] || (peak[st] = { calls: 0, tris: 0, t: 0 }), s = sum[st] || (sum[st] = { n: 0, tris: 0, calls: 0 });
  if (inf.triangles > p.tris) { p.tris = inf.triangles; p.t = i / fps; }
  p.calls = Math.max(p.calls, inf.calls); s.n++; s.tris += inf.triangles; s.calls += inf.calls;
  if (i % Math.round(EVERY * fps) === 0) await __shot('t' + (i / fps).toFixed(1).padStart(5, '0') + '_s' + st + '_' + D.S.hero.medium);
  if (i % fps === 0) __log(`t=${(i / fps).toFixed(0)} stage=${st} eaten=${D.S.stats.eaten} ${D.S.hero.medium} calls=${inf.calls} tris=${(inf.triangles / 1000).toFixed(1)}k`);
  if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
}
for (const st in peak) __log(`PEAK stage=${st} calls=${peak[st].calls} tris=${(peak[st].tris / 1000).toFixed(1)}k (at t=${peak[st].t.toFixed(1)}s)  mean calls=${(sum[st].calls / sum[st].n).toFixed(1)} tris=${(sum[st].tris / sum[st].n / 1000).toFixed(1)}k  frames=${sum[st].n}`);
await __done();
