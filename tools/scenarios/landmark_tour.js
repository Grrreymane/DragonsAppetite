// 地标：瞬移到每个地标前面，朝它飞几秒，截图；拱门那段直飞穿过去（看 archPass）
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
const { LANDMARKS } = await import('/src/config/landmarks.js');
window.__pause = true;
const D = window.__dg, E = window.__env; D.S.hunt = null; D.S.huntNext = 1e9;
E.fixed = true; E.f = +(Q.get('tod') || .2);
const sea = D.S.kind === 'sea', ids = (Q.get('ids') || (sea ? 'wreck,arch,bones' : 'arch,bones,skyisle')).split(',');
const pass = [];
for (const id of ids) {
  const L = LANDMARKS.find(l => l.id === id);
  const back = id === 'arch' ? 130 : id === 'skyisle' ? 190 : id === 'bones' ? 230 : 90;
  const ang = id === 'arch' ? L.yaw : L.yaw + .9, y = id === 'skyisle' ? 150 : id === 'arch' ? 22 : id === 'wreck' ? -14 : 45;
  const x = L.x - Math.sin(ang) * back, z = L.z - Math.cos(ang) * back;
  D.teleport(x, sea ? Math.min(-4, y) : y, z); D.S.hero.yaw = ang; D.S.hero.pitch = 0; D.S.hero.yawRate = 0;
  for (let i = 0; i < (id === 'arch' ? 300 : 100); i++) {
    D.input.jx = 0; D.input.jy = id === 'arch' && !sea ? (D.S.hero.y > 24 ? .25 : D.S.hero.y < 18 ? -.25 : 0) : 0;
    D.S.hero.lock = 0;
    D.frame(1 / 30);

    if (i === 45 || i === 99 || (id === 'arch' && (i === 160 || i === 230 || i === 290))) await __shot(`${id}_${i}`);
  }
}
__log('landmarks ' + Object.keys(D.S.landmarks).join(',') + ' arch ' + (D.S.archT ? 'pass' : 'no') + ' pts ' + Math.round(D.S.pts));
await __done();
