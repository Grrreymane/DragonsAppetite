// 海的 CPU 开销：水下 45 米/秒直线冲 4 秒，记录 sea.update 的平均 / 最大耗时（含海底分块重建）
const wait = () => new Promise(r => { const k = () => window.__labReady ? r() : setTimeout(k, 50); k(); });
await wait();
const L = window.__lab;
L.view('翠岛');
let t0 = performance.now(); L.tick(1 / 60); __log('first underwater update (full seabed build) ms=' + (performance.now() - t0).toFixed(1));
const ts = [];
for (let i = 0; i < 240; i++) {
  const z = 60 + i * 45 / 60;
  L.setCam([i * 0.3, -12, z], [i * 0.3, -18, z + 50]);
  const a = performance.now(); L.tick(1 / 60); ts.push(performance.now() - a);
  if (i % 20 === 0) { L.render(); await __frame(); }
}
ts.sort((a, b) => a - b);
__log('sea.update ms avg=' + (ts.reduce((a, b) => a + b) / ts.length).toFixed(2) + ' p95=' + ts[Math.floor(ts.length * .95)].toFixed(2) + ' max=' + ts[ts.length - 1].toFixed(2));
// 高空
L.view('高空'); const t2 = []; for (let i = 0; i < 120; i++) { const a = performance.now(); L.tick(1 / 60); t2.push(performance.now() - a); }
__log('high-air update ms avg=' + (t2.reduce((a, b) => a + b) / t2.length).toFixed(3));
await __done();
