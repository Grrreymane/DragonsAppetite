// 镜头穿过水面的几帧（入水 / 出水有没有发白、发青的闪烁）：火龙扎水再拉起；海龙从水下冲出水面再落回去。镜头离水面 5 米以内的帧都存（最多 24 张）。
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/skysea_cross.js --query "autostart&kind=fire&stage=1" --out .cache/rec/ss_cross_fire
const Q = new URLSearchParams(location.search), kind = Q.get('kind') || 'fire';
const { waveH } = await import('/src/sim/world.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
let n = 0, shots = 0;
async function run(frames, jy) {
  for (let i = 0; i < frames; i++) {
    D.input.jx = 0; D.input.jy = jy; D.input.btn = false;
    D.frame(1 / 30);
    const c = D.camera.position, dy = c.y - waveH(c.x, c.z, D.S.t);
    if (Math.abs(dy) < 5 && shots < 24) { shots++; await __shot('x' + String(n).padStart(4, '0') + (dy < 0 ? '_u' : '_a')); }   // 镜头离水面 5 米以内的帧都存
    n++;
  }
}
if (kind === 'fire') { D.teleport(0, 25, 150); await run(20, 0); await run(90, 1); await run(120, -1); }
else { D.teleport(0, -10, 150); await run(20, 0); await run(90, -1); await run(120, 0); }
__log(`${kind}: ${n} frames`);
await __done();
