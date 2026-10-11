// 岛的自检截图：把主角摆到几座岛前面（飞行镜头 / 低空 / 水下），每个位置存一张图并打印绘制调用 / 三角面。
//   python tools/rec3d.py --page index.html --director tools/scenarios/islands_shots.js --query "kind=fire&stage=1" --out .cache/rec/islands_fire
//   URL：ids=0,1,2,3（岛的 id，默认每种挑几座）；views=flight,low,under,underfar,top
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'fire';
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const { islands, islandPos } = await import('/src/sim/world.js');
const pick = Q.get('ids') ? Q.get('ids').split(',').map(Number) : (() => {
  const a = [0, 1, 2, 3], seen = {};
  for (const is of islands) { const k = is.kind + (is.shape || ''); if (!seen[k] && !a.includes(is.id)) { seen[k] = 1; a.push(is.id); } }
  return a.slice(0, 9);
})();
const views = (Q.get('views') || (kind === 'sea' ? 'flight,under' : 'flight,low')).split(',');
const fps = 30;
async function run(n) { for (let i = 0; i < n; i++) { D.input.jx = 0; D.input.jy = 0; D.input.btn = false; D.frame(1 / fps); } }
if (Q.has('start')) {                                     // 开局的画面（出生点往前看）
  await run(20); await __shot('start_a');
  await run(60); const i = D.renderer.info.render; __log(`start calls=${i.calls} tris=${(i.triangles / 1000).toFixed(1)}k`); await __shot('start_b');
}
for (const id of pick) {
  const is = islands[id]; if (!is) continue;
  for (const v of views) {
    const h0 = D.S.hero, p = islandPos(is, h0.x, h0.z);
    const ang = (id * 2.399 + views.indexOf(v) * .9) % 6.283;
    const dist = v === 'underfar' ? is.r * 2.6 + 45 : v === 'under' ? is.r * 1.5 + 30 : v === 'low' ? is.r * 1.7 + 55 : v === 'top' ? is.r * .9 + 20 : is.r * 2.2 + 80;
    const y = v === 'underfar' ? -9 : v === 'under' ? -14 : v === 'low' ? 7 : v === 'top' ? is.h + 45 : Math.max(25, is.h * .75 + 15);
    const x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
    D.teleport(x, y, z);
    const h = D.S.hero; h.yaw = Math.atan2(p.x - x, p.z - z); h.pitch = 0; h.bank = 0;
    await run(/under/.test(v) ? 30 : 24);
    const i = D.renderer.info.render;
    __log(`island ${id} ${is.kind}${is.shape ? '/' + is.shape : ''} r=${is.r.toFixed(0)} h=${is.h.toFixed(0)} view=${v} hero=(${h.x.toFixed(0)},${h.y.toFixed(1)},${h.z.toFixed(0)}) calls=${i.calls} tris=${(i.triangles / 1000).toFixed(1)}k`);
    await __shot(`isl${String(id).padStart(2, '0')}_${is.kind}_${v}`);
  }
}
await __done();
