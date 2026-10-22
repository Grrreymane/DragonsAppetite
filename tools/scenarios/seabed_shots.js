// 海底截图：几个机位 × 白天 / 夜里，每张记 renderer.info（绘制调用 / 三角面）
//   python tools/rec3d.py --director tools/scenarios/seabed_shots.js --query "kind=sea&stage=2&tods=0.3,0.75" --out .cache/rec/seabed
//   ?only=green,rift  只拍名字里带这些字的机位
// 机位：主角放在 (x,y,z)、朝 yaw、俯仰 p（游戏镜头跟着）；有 cam 的是自由镜头（先按主角更新一帧，再把镜头挪过去）
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg, E = window.__env;
const SHOTS = [
  { n: 'green_shallow', p: [0, -10, 40], yaw: 0, pitch: -.3 },
  { n: 'green_deep', p: [40, -24, 40], yaw: .8, pitch: -.3 },
  { n: 'green_reef', p: [0, -16, 40], yaw: 0, pitch: -.3, cam: [-6, -12, 30], look: [8, -30, 66] },
  { n: 'volcano_mid', p: [-900, -28, 900], yaw: .5, pitch: -.3 },
  { n: 'volcano_rim', p: [-990, -40, 940], yaw: -1.57, pitch: -.3 },
  { n: 'volcano_rift', p: [-1020, -72, 850], yaw: 0, pitch: -.1 },
  { n: 'volcano_riftcam', p: [-1000, -45, 860], yaw: 0, pitch: -.3, cam: [-995, -38, 850], look: [-1022, -82, 915] },
  { n: 'open_mid', p: [-900, -40, -250], yaw: 1.2, pitch: -.3 },
  { n: 'open_deep', p: [-900, -72, -250], yaw: 1.2, pitch: -.3 },
  { n: 'open_rim', p: [-1000, -62, -250], yaw: -1.57, pitch: -.3 },
  { n: 'open_canyon', p: [-1055, -88, -310], yaw: 0, pitch: -.1 },
  { n: 'open_canyoncam', p: [-1030, -62, -345], yaw: 0, pitch: -.3, cam: [-1030, -60, -320], look: [-1055, -100, -240] },
];
const only = (Q.get('only') || '').split(',').filter(Boolean);
const tods = (Q.get('tods') || '0.3').split(',').map(Number);
const extra = Q.get('shots');   // 追加机位：name:x,y,z,yaw;...
if (extra) for (const s of extra.split(';')) { const [n, v] = s.split(':'); const a = v.split(',').map(Number); SHOTS.push({ n, p: a.slice(0, 3), yaw: a[3] || 0, pitch: a[4] ?? -.3 }); }
E.fixed = true; E.setWeather(Q.get('w') || 'clear', 1e9);
D.S.hunt = null; D.S.huntNext = 1e9;
for (const f of tods) for (const s of SHOTS) {
  if (only.length && !only.some(o => s.n.includes(o))) continue;
  E.f = f;
  for (let i = 0; i < 60; i++) {
    D.teleport(...s.p); D.S.hero.yaw = s.yaw; D.S.hero.pitch = s.pitch; D.S.hero.speed = 0;
    D.input.jx = 0; D.input.jy = 0; D.frame(1 / 30);
  }
  if (s.cam) { D.camera.position.set(...s.cam); D.camera.lookAt(...s.look); D.render(); }
  const r = D.renderer.info.render;
  __log(`${s.n} tod=${f} calls=${r.calls} tris=${r.triangles}`);
  if (Q.has('bd')) {   // 海底各部分的三角面
    const bed = D.scene.getObjectByName('seabed'), parts = [];
    if (bed) for (const o of bed.children) if (o.visible && o.material.visible !== false && (!o.isInstancedMesh || o.count)) { const g = o.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; parts.push(`${o.name || '?'}:${o.isInstancedMesh ? o.count + 'x' : ''}${Math.round(t)}`); }
    __log('   ' + parts.join(' '));
  }
  await __shot(`${s.n}_${f < .5 ? 'day' : 'night'}`);
}
await __done();
