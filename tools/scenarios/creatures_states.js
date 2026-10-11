// 生物：真游戏里按 sim 实际写的字段摆 6 只（普通 / 龙吼 = skillHit + daze + cooked=1 / 烤熟 / 吓呆 / 金色 / 撞晕），dist 米远拍一张
const Q = new URLSearchParams(location.search);
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, cam = D.camera, V = cam.position.constructor;
const root = D.scene.getObjectByName('creatures'), api = root.userData.api;
for (let i = 0; i < 20; i++) D.frame(1 / 30);
const sp = Q.get('sp') || 'sparrow', len = +(Q.get('len') || 1.1);
const ST = [
  { name: 'normal' },
  { name: 'roar(sim)', skillHit: 1, daze: 4, cooked: 1 },
  { name: 'roast', roast: 3, cooked: 1 },
  { name: 'feared', feared: true },
  { name: 'gold', gold: true },
  { name: 'stun', stun: 3, cooked: 1 },
];
const pick = D.S.creatures.slice(0, 6);
const fwd = new V(), up = new V(), right = new V();
const DIST = +(Q.get('dist') || 16);
function place() {
  cam.getWorldDirection(fwd); right.crossVectors(fwd, cam.up).normalize(); up.crossVectors(right, fwd).normalize();
  pick.forEach((c, k) => {
    const ox = ((k % 3) - 1) * DIST * .3, oy = (k < 3 ? 1 : -1) * DIST * .22 + DIST * .1;
    const P = cam.position.clone().addScaledVector(fwd, DIST).addScaledVector(right, ox).addScaledVector(up, oy);
    Object.assign(c, { sp, x: P.x, y: P.y, z: P.z, px: P.x, py: P.y, pz: P.z, size: len, baseSize: len, yaw: Math.atan2(right.x, right.z) + .5, pitch: 0, roll: 0, dying: 0,
      feared: false, skillHit: 0, daze: 0, stun: 0, gold: false, roast: 0, cooked: 0, cookT: 0 }, ST[k]);
    delete c.name;
  });
}
let t = 10;
for (let k = 0; k < 40; k++) { place(); t += 1 / 30; api.update(D.S, 1, 1 / 30, t); }
place(); api.update(D.S, 1, 1 / 30, t); D.render();
await __shot('states_' + sp + '_' + DIST);
const p = new V(); __log('POS ' + JSON.stringify(pick.map((c, k) => { p.set(c.x, c.y, c.z).project(cam); return [ST[k].name, Math.round((p.x * .5 + .5) * D.renderer.domElement.clientWidth), Math.round((-p.y * .5 + .5) * D.renderer.domElement.clientHeight)]; })));
__log('done ok');
await __done();
