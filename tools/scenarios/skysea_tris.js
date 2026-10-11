// 统计每个模块的三角面 / 绘制次数（粗算：可见网格 × 实例数，不算视锥剔除）
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const P = (Q.get('pos') || '0,-8,100').split(',').map(Number);
D.teleport(P[0], P[1], P[2]);
for (let i = 0; i < 30; i++) { Object.assign(D.S.hero, { x: P[0], y: P[1], z: P[2], px: P[0], py: P[1], pz: P[2], yaw: .3, pitch: 0 }); D.frame(1 / 30); }
const by = {};
D.scene.traverseVisible(o => {
  if (!o.isMesh && !o.isPoints) return;
  let top = o; while (top.parent && top.parent !== D.scene) top = top.parent;
  const key = (top.name || top.type) + (o.name ? '/' + o.name : '');
  const g = o.geometry, n = g.index ? g.index.count : g.attributes.position.count;
  const inst = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
  if (!inst) return;
  const t = (o.isPoints ? 0 : n / 3) * inst;
  by[key] = by[key] || [0, 0]; by[key][0] += t; by[key][1]++;
});
const r = D.renderer.info.render;
__log(`total calls=${r.calls} tris=${(r.triangles / 1000).toFixed(1)}k`);
for (const [k, v] of Object.entries(by).sort((a, b) => b[1][0] - a[1][0]).slice(0, 25)) __log(`  ${k}: ${(v[0] / 1000).toFixed(1)}k tris, ${v[1]} meshes`);
await __done();
