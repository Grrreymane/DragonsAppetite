// 海底调试：传送到 ?tp=x,y,z，列出附近 40 米内的石头 / 热泉 / 装饰实例的位置和该处真实海底高度（查浮空、埋地）
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, W = await import('/src/sim/world.js');
const tp = (Q.get('tp') || '0,-20,0').split(',').map(Number), R = +(Q.get('r') || 40);
for (let i = 0; i < 30; i++) { D.teleport(...tp); D.frame(1 / 30); }
const bed = D.scene.getObjectByName('seabed'), m = new D.camera.matrix.constructor(), p = new D.camera.position.constructor();
for (const o of bed.children) if (o.isInstancedMesh && o.count) {
  const rows = [];
  for (let i = 0; i < o.count; i++) {
    o.getMatrixAt(i, m); p.setFromMatrixPosition(m);
    if (Math.hypot(p.x - tp[0], p.z - tp[2]) > R) continue;
    rows.push(`(${p.x.toFixed(0)},${p.y.toFixed(1)},${p.z.toFixed(0)}) bed=${W.seabedY(p.x, p.z).toFixed(1)}`);
  }
  if (rows.length) __log(o.name + ': ' + rows.slice(0, 12).join('  '));
}
__log('cam ' + D.camera.position.toArray().map(v => v.toFixed(1)).join(','));
await __done();
