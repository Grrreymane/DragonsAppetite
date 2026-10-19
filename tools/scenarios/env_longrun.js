// 长跑：机器人玩，一天快进（每帧多走一点），天气轮换；只看报错和帧数据（每 15 秒截一张）
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg, E = window.__env, bot = makeBot(TIERS[1], 5);
const secs = +(Q.get('secs') || 150), speed = +(Q.get('speed') || 4);
for (let i = 0; i < secs * 30; i++) {
  const o = bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; D.input.skillTap = !!o.skill;
  E.f = (E.f + (speed - 1) / 30 / 300) % 1; E.wT -= (speed - 1) / 30;
  D.frame(1 / 30);
  if (i % 450 === 449) { __log(`t=${(i / 30) | 0} f=${E.f.toFixed(2)} w=${E.weather} zone=${E.zone} pts=${Math.round(D.S.pts)} stage=${D.S.stage} stars=${D.S.stats.stars || 0} lm=${Object.keys(D.S.landmarks).join(',')} calls=${D.renderer.info.render.calls} tris=${(D.renderer.info.render.triangles / 1000) | 0}k`); await __shot('L' + String(i).padStart(5, '0')); }
}
await __done();
