// 生物挡镜头检查：机器人玩 secs 秒，每帧量「真的画出来的」生物（读实例矩阵，已经算上显示放大 / 近处缩小）
// 比主角离镜头还近（< 0.8 倍主角距离）又在屏幕上很大（> 12% 屏高）的算一次挡镜头；顺便统计晕星个数的最大值、锁定目标的像素大小。
// URL：kind / stage / secs / tier / shots（存几张最挡的截图）
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 60), TIER = +(Q.get('tier') || 1), SHOTS = +(Q.get('shots') || 4);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[TIER], 4321), fps = 30;
const cam = D.camera, V = cam.position.constructor, p = new V(), cp = new V(), sc = new V();
const H = D.renderer.domElement.clientHeight;
const crApi = D.scene.getObjectByName('creatures').userData.api;
let big = 0, frames = 0, shots = 0, maxStars = 0, starFrames = 0, drawnSum = 0, smallSum = 0;
const M = new (cam.matrixWorld.constructor)();
function scan() {
  cam.getWorldPosition(cp);
  const h = D.S.hero, dh = Math.hypot(h.x - cp.x, h.y - cp.y, h.z - cp.z);
  const pxM = 2 * Math.tan(cam.fov * Math.PI / 360) / H;
  let worst = null;
  for (const sp in crApi.species) {
    const b = crApi.species[sp], arr = b.body.instanceMatrix.array;
    for (let i = 0; i < b.n; i++) {
      M.fromArray(arr, i * 16); p.setFromMatrixPosition(M); sc.setFromMatrixScale(M);
      const d = p.distanceTo(cp), px = sc.x * b.rad / (d * pxM);
      drawnSum++; if (px < 8) smallSum++;
      if (d < dh * .8 && px > H * .12 && (!worst || px > worst.px)) worst = { sp, d: +d.toFixed(1), dh: +dh.toFixed(1), px: Math.round(px) };
    }
  }
  const st = crApi.fx.stars.visible ? crApi.fx.stars.count : 0;
  maxStars = Math.max(maxStars, st); if (st) starFrames++;
  return worst;
}
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
  D.frame(1 / fps); frames++;
  const w = scan();
  if (w) { big++; if (shots < SHOTS) { await __shot('near' + shots++); __log('NEAR ' + JSON.stringify(w)); } }
  if (i % (fps * 10) === 0) await __shot('t' + String(i / fps).padStart(3, '0'));
}
__log(`RESULT frames ${frames} bigNearCam ${big} (${(100 * big / frames).toFixed(2)}%) | stars max ${maxStars} frames ${starFrames} | drawn <8px ${(100 * smallSum / Math.max(1, drawnSum)).toFixed(0)}%`);
await __done();
