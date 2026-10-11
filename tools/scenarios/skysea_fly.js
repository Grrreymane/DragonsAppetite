// 低空直飞 16 秒（录视频看海面花纹会不会闪、岸边浅水带会不会突然冒出来、云和地平线云带跟着走对不对）：
//   python tools/rec3d.py --page index.html --director tools/scenarios/skysea_fly.js --query "autostart&kind=fire&stage=1" --sheet 1 --out .cache/rec/ss_fly.mp4
const Q = new URLSearchParams(location.search), H = +(Q.get('h') || 22), yaw = +(Q.get('yaw') || -0.5);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
D.teleport(300, H, -200);
for (let i = 0; i < 16 * 30; i++) {
  const h = D.S.hero;
  h.yaw = yaw + Math.sin(i / 90) * .25; h.y = H; h.py = H; h.pitch = 0;
  D.input.jx = 0; D.input.jy = 0; D.input.btn = false;
  D.frame(1 / 30);
  await __frame();
}
const r = D.renderer.info.render;
__log(`calls=${r.calls} tris=${(r.triangles / 1000).toFixed(1)}k`);
await __done();
