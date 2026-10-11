// 岛的调试截图：同一个位置拍三张——全部 / 藏起岛 / 藏起海底地形（看画面里的东西是谁画的）。
//   python tools/rec3d.py --page index.html --director tools/scenarios/islands_dbg.js --query "kind=sea&stage=1&autostart&id=2&view=under" --out .cache/rec/isl_dbg
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const { islands, islandPos } = await import('/src/sim/world.js');
const id = +(Q.get('id') || 2), v = Q.get('view') || 'under';
const is = islands[id];
async function run(n) { for (let i = 0; i < n; i++) { D.input.jx = 0; D.input.jy = 0; D.input.btn = false; D.frame(1 / 30); } }
const h0 = D.S.hero, p = islandPos(is, h0.x, h0.z);
const ang = +(Q.get('ang') || ((id * 2.399) % 6.283));
const dist = +(Q.get('dist') || (is.r * 1.5 + 30)), y = +(Q.get('y') || -14);
const x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
D.teleport(x, y, z);
const h = D.S.hero; h.yaw = Math.atan2(p.x - x, p.z - z); h.pitch = 0; h.bank = 0;
await run(30);
window.__pause = true;
await __shot('a_all');
const isl = [], bed = [];
D.scene.traverse(o => {
  if (!o.isMesh || !o.material || !o.material.customProgramCacheKey) return;
  const k = o.material.customProgramCacheKey();
  if (/^(isl|outlineisl)/.test(k)) isl.push(o);
  else if (/^far:/.test(k)) bed.push(o);
});
__log(`island meshes ${isl.length}, seabed meshes ${bed.length}`);
isl.forEach(o => o.visible = false); D.render(); await __shot('b_noisl'); isl.forEach(o => o.visible = true);
bed.forEach(o => o.visible = false); D.render(); await __shot('c_nobed'); bed.forEach(o => o.visible = true);
await __done();
