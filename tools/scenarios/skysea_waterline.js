// 统计镜头离「真实浪面」（sim 时间 S.t 的浪）有多近：镜头贴在水线带里（±0.6 米）时画面会上半水上、下半水下
const Q = new URLSearchParams(location.search), kind = Q.get('kind') || 'fire';
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const { waveH } = await import('/src/sim/world.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[0], 77);
let band = 0, n = 0, shots = 0;
for (let i = 0; i < 30 * 40; i++) {
  const o = bot(D.S);
  if (kind === 'fire' && i % 300 > 200) { o.jy = 1; }          // 隔一阵往下扎水
  if (kind === 'sea' && i % 300 > 220) { o.jy = -1; }          // 隔一阵往上跃出
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act;
  if (i === 100) D.give(45); if (i === 500) D.give(170);     // 进化两次（慢放会让渲染时间和 sim 时间差开）
  D.frame(1 / 30);
  const c = D.camera.position, dy = c.y - waveH(c.x, c.z, D.S.t);
  n++;
  if (Math.abs(dy) < .6) { band++; if (shots < 4 && band % 3 === 1) { await __shot('band' + shots); shots++; } }
}
__log(`${kind}: camera in waterline band ${band}/${n} frames (${(band / n * 100).toFixed(1)}%)`);
await __done();
