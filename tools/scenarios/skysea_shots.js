// 天空 / 云 / 海 / 水下的定点截图（真游戏页面，主角钉在指定位置，镜头是游戏自己的追尾镜头）。
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/skysea_shots.js --query "autostart&kind=fire&stage=1" --out .cache/rec/skysea_fire
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/skysea_shots.js --query "autostart&kind=sea&stage=1" --out .cache/rec/skysea_sea
// only=名字1,名字2 只拍这几张
const Q = new URLSearchParams(location.search), kind = Q.get('kind') || 'fire';
const only = Q.get('only') ? Q.get('only').split(',') : null;
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const SUNYAW = Math.atan2(-.35, -.7);
async function hold(name, x, y, z, yaw, pitch = 0, frames = 45) {
  if (only && !only.includes(name)) return;
  D.teleport(x, y, z);
  for (let i = 0; i < frames; i++) {
    const h = D.S.hero;
    Object.assign(h, { x, y, z, px: x, py: y, pz: z, yaw, pitch });
    D.input.jx = 0; D.input.jy = 0; D.input.btn = false;
    D.frame(1 / 30);
  }
  const r = D.renderer.info.render, c = D.camera.position;
  __log(`${name}: cam y=${c.y.toFixed(1)} calls=${r.calls} tris=${(r.triangles / 1000).toFixed(1)}k fog=${D.scene.fog ? D.scene.fog.near.toFixed(0) + '..' + D.scene.fog.far.toFixed(0) : '-'}`);
  await __shot(name);
}
if (kind === 'fire') {
  await hold('f1_high', 0, 150, 0, 0, -.15);
  await hold('f2_mid', 0, 70, 90, .2);
  await hold('f3_low', -20, 22, 140, .15);
  await hold('f4_skim', 10, 3, 175, 0);
  await hold('f5_sun', 0, 35, 40, SUNYAW, .05);
  await hold('f6_cloudlvl', 300, 100, 300, 1.2);
  await hold('f7_plunge', 0, -5, 160, 0, -.2);
  await hold('f8_volcano', -300, 60, 300, .5);
  // 觅食点：离出生点最近的一个，从 25 米高、40 米外看过去
  const sp = D.S.spots.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  if (sp) { const yaw = 0.4; await hold('f9_spot', sp.x - Math.sin(yaw) * 45, 18, sp.z - Math.cos(yaw) * 45, yaw, -.1); }
  // 穿云：找最近的一朵云（读云的实例位置），从 60 米外往云心飞，拍 4 张
  const cm = D.scene.getObjectByName('clouds');
  if (cm && (!only || only.some(n => n.startsWith('fc')))) {
    const off = cm.geometry.attributes.iOff.array, sz = cm.geometry.attributes.iSize.array, n = cm.geometry.instanceCount, cam = D.camera.position;
    let best = -1, bd = 1e9;
    for (let i = 0; i < n; i++) { if (sz[i * 4] < 70 || sz[i * 4 + 3] > .5) continue; const d = Math.hypot(off[i * 3] - cam.x, off[i * 3 + 2] - cam.z); if (d < bd) { bd = d; best = i; } }
    if (best >= 0) {
      const cx = off[best * 3], cy = off[best * 3 + 1], cz = off[best * 3 + 2];
      for (const [k, back] of [[1, 90], [2, 45], [3, 15], [4, -5]]) await hold('fc' + k + '_cloud' + back, cx, cy - 6, cz - back, 0, 0, 20);
    }
  }
} else {
  await hold('s1_surface', 0, -1.6, 120, 0);
  await hold('s2_m8', 0, -8, 100, .3);
  await hold('s3_m40', -960, -40, 920, .4);
  await hold('s4_m80', 240, -80, 1200, .2);
  await hold('s5_island', -170, -10, 85, 0);
  await hold('s6_breach', 0, 5, 140, 0, .1);
  await hold('s7_lookup', 0, -12, 140, 0, .5);
}
await __done();
