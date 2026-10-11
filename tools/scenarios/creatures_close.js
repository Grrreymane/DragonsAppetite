// 生物特写：每种 4 个角度（侧面 / 3/4 前 / 俯视 / 追在后面看），检查造型、眼睛、明暗、描边。URL：sp=sparrow,gull（每张图 2 种），bg=sky|sea
const wait = () => new Promise(r => { const k = () => window.__cr && window.__cr.ready ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const C = window.__cr, Q = new URLSearchParams(location.search);
const list = (Q.get('sp') || 'sparrow,gull,lavafinch,cloudjelly,roc,flyfish,manta,sardine,jelly,squid,turtle,shark').split(',');
const sea = ['manta', 'sardine', 'jelly', 'squid', 'turtle', 'shark', 'flyfish'];
const views = [[Math.PI / 2, 0], [Math.PI / 2 - .9, .15], [Math.PI / 2 - .3, -1.1], [Math.PI, .35]];   // [yaw, pitch]
const extra = Q.get('state') ? JSON.parse(Q.get('state')) : {};
for (let p = 0; p < list.length; p += 2) {
  const sps = list.slice(p, p + 2);
  C.set('gallery', Q.get('bg') || (sea.includes(sps[0]) ? 'sea' : 'sky'), 'all');
  const S = C.S; S.creatures = [];
  let id = 1000 + p * 10;
  sps.forEach((sp, r) => views.forEach(([yaw, pitch], c) => {
    const b = C.cr.species[sp].geo.boundingBox, ext = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    S.creatures.push({ id: id++, sp, x: (c % 2 - .5) * 4.3, y: (1.5 - r * 2 - (c / 2 | 0)) * 3.3, z: 0, yaw, pitch, roll: 0, size: 3.4 / ext / C.cr.species[sp].vis, flap: .6, gold: false, cooked: 0, stun: 0, roast: 0, ...extra });
  }));
  C.camera.position.set(0, 0, 19); C.camera.lookAt(0, 0, 0); C.camera.fov = 40; C.camera.updateProjectionMatrix();
  C.step(3, 1 / 30);
  await __shot('close_' + sps.join('_'));
}
__log('done ok');
await __done();
