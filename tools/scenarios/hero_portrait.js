// 主角模型的「定妆照」：游戏里的真模型，镜头摆在正侧、前 3/4、后 3/4、正面，纯净的天空背景（给 AI 画 CG 当长相参考）
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg, S = D.S, cam = D.camera;
S.hunt = null; S.huntNext = 1e9; S.leaderNext = 1e9; S.creatures.length = 0;
window.__env.fixed = true; window.__env.f = .2;
const sea = S.kind === 'sea';
D.teleport(0, sea ? 3 : 60, 0); S.hero.yaw = 0; S.hero.pitch = 0;
for (let i = 0; i < 20; i++) { D.input.jx = 0; D.input.jy = 0; D.frame(1 / 30); }
const h = S.hero, L = h.len;
const views = [['side', Math.PI / 2, 0], ['front34', .7, .12], ['back34', 2.4, .2], ['front', 0, .05]];
for (const [name, az, el] of views) {
  D.frame(1 / 30);
  const d = L * 1.5;
  cam.position.set(h.x + Math.sin(az) * d * Math.cos(el), h.y + d * Math.sin(el) + L * .05, h.z + Math.cos(az) * d * Math.cos(el));
  cam.fov = 40; cam.updateProjectionMatrix(); cam.lookAt(h.x, h.y, h.z);
  D.render();
  await __shot(name);
}
await __done();
