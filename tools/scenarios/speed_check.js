// 速度感检查：平飞 3 秒 → 俯冲 3 秒 → 拉起；截图
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg; D.S.hero.y = 120;
const plan = [[0, 3, 0, 0], [3, 6, 0, 1], [6, 8, 0, -1]];
for (let i = 0; i < 8 * 30; i++) {
  const t = i / 30, p = plan.find(q => t >= q[0] && t < q[1]);
  D.input.jx = p[2]; D.input.jy = p[3]; D.frame(1 / 30);
  if (window.__frame && location.search.includes('vid')) await __frame(); else if (i === 60 || i === 150 || i === 170) await __shot('t' + i);
}
await __done();
