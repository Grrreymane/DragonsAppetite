// 量镜头：连续跃出时，镜头朝向每秒转多少度（平均 / 95 分位）、镜头水上水下切换几次
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, S = D.S, cam = D.camera;
S.hunt = null; S.huntNext = 1e9; S.leaderNext = 1e9;
D.teleport(S.hero.x, -3, S.hero.z);
const d0 = cam.getWorldDirection(new cam.position.constructor()).clone(), d1 = d0.clone();
const rates = []; let flips = 0, wasUnder = null, ys = [];
for (let i = 0; i < 600; i++) {
  D.input.jx = 0; D.input.jy = (i % 50) < 22 ? -1 : .6; if (i % 50 === 0) D.input.actTap = true;
  D.frame(1 / 30);
  cam.getWorldDirection(d1); rates.push(d1.angleTo(d0) * 180 / Math.PI * 30); d0.copy(d1);
  const u = cam.position.y < 0; if (wasUnder !== null && u !== wasUnder) flips++; wasUnder = u; ys.push(cam.position.y);
}
rates.sort((a, b) => a - b);
let vy = 0; for (let i = 1; i < ys.length; i++) vy += Math.abs(ys[i] - ys[i - 1]) * 30; vy /= ys.length - 1;
__log(`turn deg/s mean ${(rates.reduce((a, b) => a + b) / rates.length).toFixed(1)} p95 ${rates[Math.floor(rates.length * .95)].toFixed(1)} | water flips ${flips} | cam vertical speed ${vy.toFixed(1)} m/s`);
await __done();
