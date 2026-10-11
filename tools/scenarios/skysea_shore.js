// 岛边白沫 / 浅水带特写：找离出生点最近的一座绿岛（beach / green 一类），主角停在岸外，不同高度朝岛看。
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/skysea_shore.js --query "autostart&kind=fire&stage=1" --out .cache/rec/ss_shore
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const { islands } = await import('/src/sim/world.js');
const isl = islands.filter(i => i.kind !== 'volcano' && i.kind !== 'rock' && i.kind !== 'spire').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
__log('islands: ' + islands.slice(0, 12).map(i => `${i.kind}@${Math.round(i.x)},${Math.round(i.z)} r${Math.round(i.r)}`).join(' '));
async function hold(name, x, y, z, yaw, pitch = 0, frames = 45) {
  D.teleport(x, y, z);
  for (let i = 0; i < frames; i++) {
    Object.assign(D.S.hero, { x, y, z, px: x, py: y, pz: z, yaw, pitch });
    D.input.jx = 0; D.input.jy = 0; D.input.btn = false;
    D.frame(1 / 30);
  }
  const r = D.renderer.info.render, c = D.camera.position;
  __log(`${name}: cam y=${c.y.toFixed(1)} calls=${r.calls} tris=${(r.triangles / 1000).toFixed(1)}k`);
  await __shot(name);
}
for (const [k, is] of isl.slice(0, 2).entries()) {
  for (const [h, back] of [[1.5, 26], [8, 40], [30, 70]]) {
    const a = 0.7 + k, x = is.x + Math.sin(a) * (is.r + back), z = is.z + Math.cos(a) * (is.r + back);
    await hold(`sh${k}_${is.kind}_h${h}`, x, h, z, a + Math.PI, h > 10 ? -.25 : 0);
  }
}
await __done();
