// 岛的预算：机器人玩一段，每 2 秒对比「有岛 / 没岛」的绘制调用和三角面，打印岛占了多少。
//   python tools/rec3d.py --page index.html --director tools/scenarios/islands_budget.js --query "kind=fire&stage=2&autostart&secs=40" --out .cache/rec/isl_budget
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 40);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const bot = makeBot(TIERS[1], 99);
// 岛的网格：材质的 customProgramCacheKey 以 isl / outlineisl 开头
const islMeshes = [];
D.scene.traverse(o => { if (o.isMesh && o.material && o.material.customProgramCacheKey && /^(isl|outlineisl)/.test(o.material.customProgramCacheKey())) islMeshes.push(o); });
const groups = [...new Set(islMeshes.filter(m => /^isl/.test(m.material.customProgramCacheKey())).map(m => m.parent))];
__log(`island meshes ${islMeshes.length}, groups ${groups.length}`);
let worst = { tris: 0 }, sum = { tris: 0, calls: 0, n: 0 };
for (let i = 0; i < SECS * 30; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true;
  D.frame(1 / 30);
  if (i % 60 === 30) {
    const a = { ...D.renderer.info.render };
    const vis = groups.map(g => g.visible); groups.forEach(g => g.visible = false);
    D.render(); const b = { ...D.renderer.info.render };
    groups.forEach((g, k) => g.visible = vis[k]); D.render();
    const it = a.triangles - b.triangles, ic = a.calls - b.calls;
    sum.tris += it; sum.calls += ic; sum.n++;
    if (a.triangles > worst.tris) worst = { tris: a.triangles, isl: it, calls: a.calls, iclls: ic, t: i / 30 };
    __log(`t=${(i / 30).toFixed(0)} total calls=${a.calls} tris=${(a.triangles / 1000).toFixed(1)}k  islands calls=${ic} tris=${(it / 1000).toFixed(1)}k  y=${D.S.hero.y.toFixed(0)}`);
    if (i % 300 === 30) await __shot('b' + String(i).padStart(5, '0'));
  }
}
__log(`AVG islands calls=${(sum.calls / sum.n).toFixed(1)} tris=${(sum.tris / sum.n / 1000).toFixed(1)}k  WORST total ${(worst.tris / 1000).toFixed(1)}k (islands ${(worst.isl / 1000).toFixed(1)}k, calls ${worst.calls}/${worst.iclls}) at t=${worst.t}`);
await __done();
