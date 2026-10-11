// 生物：真游戏里喷火烤一只（默认云水母）：烤到 at（默认 0.55）拍一张（热光），烤熟后拍一张。URL：sp=cloudjelly，len=2.6，gold（金色的也要看得出在烤），at=0.7
const Q = new URLSearchParams(location.search);
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, S = D.S;
for (let i = 0; i < 30; i++) D.frame(1 / 30);
const sp = Q.get('sp') || 'cloudjelly', len = +(Q.get('len') || 2.6), AT = +(Q.get('at') || .55);
const pick = S.creatures.slice(0, 3), h = S.hero;
const place = () => {
  const f = [Math.sin(h.yaw) * Math.cos(h.pitch), Math.sin(h.pitch), Math.cos(h.yaw) * Math.cos(h.pitch)];
  pick.forEach((c, k) => {
    const d = 5 + k * 2.2, side = (k - 1) * 1.6, x = h.mouth.x + f[0] * d + Math.cos(h.yaw) * side, y = h.mouth.y + f[1] * d, z = h.mouth.z + f[2] * d - Math.sin(h.yaw) * side;
    Object.assign(c, { sp, x, y, z, px: x, py: y, pz: z, size: len, baseSize: len, age: 5, dying: 0, vx: 0, vy: 0, vz: 0, gold: Q.has('gold') && k !== 2 });
  });
};
let shot1 = false;
for (let i = 0; i < 40; i++) {
  D.input.jx = 0; D.input.jy = 0; D.input.btn = true;
  if (!pick[0].roast) place();
  D.frame(1 / 60);
  const ck = pick.map(c => (c.cookT || 0).toFixed(2) + (c.roast > 0 ? 'R' : '')).join(' ');
  if (i % 4 === 0) __log('i=' + i + ' cookT ' + ck);
  if (!shot1 && pick.some(c => c.cookT > (S.cfg.cookTime || .4) * AT && !(c.roast > 0))) { shot1 = true; await __shot('heat_' + sp + '_' + Math.round(AT * 100)); __log('SHOT heat ' + ck); }
}
D.input.btn = false;
for (let i = 0; i < 20; i++) D.frame(1 / 60);
await __shot('roast_' + sp);
__log('done ok');
await __done();
