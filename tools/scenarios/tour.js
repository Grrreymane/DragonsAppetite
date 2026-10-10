// 录像剧本「导览」：一段视频把关键瞬间都过一遍（吃、喷火 / 冲刺、跨界、被追、进化两次、成龙）。
// URL：kind=fire|sea，fast=1 只存截图（每 1.5 秒一张）。用法：
//   python tools/rec3d.py --page index.html --director tools/scenarios/tour.js --query "kind=fire" --sheet 1 --out .cache/rec/tour_fire.mp4
const Q = new URLSearchParams(location.search);
const SHOTS = Q.has('fast'), kind = Q.get('kind') || 'fire';
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[0], 77), fps = 30;
let n = 0;
async function play(secs, ctl) {
  for (let i = 0; i < secs * fps; i++) {
    const o = bot(D.S);
    if (ctl) Object.assign(o, ctl(i / fps, o) || {});
    D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true;
    D.frame(1 / fps);
    if (SHOTS) { if (n % 45 === 0) await __shot('f' + String(n).padStart(5, '0')); } else await __frame();
    n++;
  }
  __log(`t=${(n / fps).toFixed(0)} stage=${D.S.stage} pts=${Math.round(D.S.pts)} eaten=${D.S.stats.eaten} cross=${D.S.stats.cross} ${D.S.hero.medium} y=${D.S.hero.y.toFixed(1)} calls=${D.renderer.info.render.calls} tris=${(D.renderer.info.render.triangles / 1000).toFixed(1)}k`);
}
await play(9);                                             // 幼龙：吃
if (kind === 'fire') {
  D.S.hero.y = Math.max(D.S.hero.y, 40);
  await play(4, t => ({ jx: 0, jy: 1, act: false }));      // 扎水
  await play(3);
} else {
  await play(4, t => ({ jx: 0, jy: -1 }));                 // 往上冲：跃出
  await play(3);
}
D.give(45); await play(5);                                 // 进化到少年龙
await play(8);
D.give(170); await play(5);                                // 进化到成龙
await play(6, t => ({ act: kind === 'fire' ? t > 1 && t < 4 : false, actTap: kind === 'sea' && t < .1 }));
await play(4);
await __done();
