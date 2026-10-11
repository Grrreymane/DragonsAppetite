// 生物在真游戏里的样子：机器人玩，定时截图，并把画面里最近的几只生物的屏幕坐标打出来（之后用 Python 裁剪放大看清不清楚）。
// 最后把附近几只分别设成 吓呆 / 晕（skillHit）/ 撞晕 / 金色 / 烤熟，再拍一张。
// URL：secs=秒数，every=几秒一张，tier=机器人档位
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 24), EVERY = +(Q.get('every') || 3), TIER = +(Q.get('tier') || 1);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[TIER], 1234), fps = 30;
if (Q.has('plainsky')) {      // 天空模块改到一半出错时：换成原型的渐变天空（只影响截图）
  const sky = D.scene.getObjectByName('sky'), T3 = await import('three');
  if (sky) sky.material = new T3.ShaderMaterial({ side: T3.BackSide, depthWrite: false, fog: false, uniforms: { top: { value: new T3.Color(0x3d78c6) }, mid: { value: new T3.Color(0xc8dcec) }, bot: { value: new T3.Color(0xe9d7c2) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, h)) : mix(mid, bot, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0);
#include <colorspace_fragment>
}` });
}
const cam = D.camera, V = cam.position.constructor;
const W = D.renderer.domElement.clientWidth, H = D.renderer.domElement.clientHeight;
function onScreen(n = 6) {
  const out = [], p = new V();
  for (const c of D.S.creatures) {
    p.set(c.x, c.y, c.z).project(cam);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
    const d = cam.position.distanceTo(new V(c.x, c.y, c.z));
    out.push({ id: c.id, sp: c.sp, sx: Math.round((p.x * .5 + .5) * W), sy: Math.round((-p.y * .5 + .5) * H), d: Math.round(d), px: Math.round(c.size * 1.3 / (d * 2 * Math.tan(cam.fov * Math.PI / 360)) * H) });
  }
  out.sort((a, b) => a.d - b.d);
  return out.slice(0, n);
}
const crInfo = () => { const s = window.__crStats ? window.__crStats() : null; return s; };
let shotN = 0;
const crRoot = D.scene.getObjectByName('creatures');
function crOnly() {           // 只画生物，量绘制次数 / 三角面
  const vis = []; for (const o of D.scene.children) if (o !== crRoot) { vis.push([o, o.visible]); o.visible = false; }
  D.renderer.render(D.scene, D.camera); const i = D.renderer.info.render, r = { calls: i.calls, tris: i.triangles };
  for (const [o, v] of vis) o.visible = v; D.renderer.render(D.scene, D.camera); return r;
}
let crMax = { calls: 0, tris: 0 };
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true;
  D.frame(1 / fps);
  if (i % 10 === 0) { const r = crOnly(); crMax.calls = Math.max(crMax.calls, r.calls); crMax.tris = Math.max(crMax.tris, r.tris); }
  if (i % (fps * EVERY) === fps) {
    const name = 'g' + String(shotN++).padStart(2, '0');
    await __shot(name);
    __log('SHOT ' + name + ' ' + JSON.stringify(onScreen()) + ' calls=' + D.renderer.info.render.calls + ' tris=' + D.renderer.info.render.triangles + ' | creatures ' + JSON.stringify(crOnly()));
  }
}
// 状态：拿 6 只生物，摆到镜头前 14~30 米，分别设成 普通 / 吓呆 / 晕（skillHit）/ 撞晕 / 金色 / 烤熟
const ST = [{}, { feared: true }, { skillHit: true }, { stun: 3, cooked: 1 }, { gold: true }, { roast: 3, cooked: 1 }];
const SPS = (Q.get('sps') || (D.S.kind === 'fire' ? 'sparrow,gull,lavafinch,sparrow,gull,sparrow' : 'sardine,squid,flyfish,sardine,turtle,jelly')).split(',');
const pick = D.S.creatures.slice(0, 6);
const fwd = new V(), up = new V(), right = new V();
const place = () => {
  cam.getWorldDirection(fwd); right.crossVectors(fwd, cam.up).normalize(); up.crossVectors(right, fwd).normalize();
  pick.forEach((c, k) => {
    const d = 14 + (k % 3) * 7, ox = ((k % 3) - 1) * 4.5, oy = (k < 3 ? 1 : -1) * 3.2 + 2;
    const P = cam.position.clone().addScaledVector(fwd, d).addScaledVector(right, ox).addScaledVector(up, oy);
    Object.assign(c, { sp: SPS[k], x: P.x, y: P.y, z: P.z, px: P.x, py: P.y, pz: P.z, size: c.baseSize ? c.size : c.size, yaw: Math.atan2(right.x, right.z) * (k % 2 ? 1 : -1) + .3, pitch: 0, dying: 0 });
    c.size = c.baseSize = ({ sparrow: 1.1, gull: 1.4, lavafinch: 1.4, sardine: .7, squid: 1.6, flyfish: 1, turtle: 1.8, jelly: 1, cloudjelly: 2.6 })[SPS[k]] || 1.2;
    Object.assign(c, { feared: false, skillHit: false, stun: 0, gold: false, roast: 0, cooked: 0 }, ST[k]);
  });
};
for (let k = 0; k < 24; k++) { D.input.jx = 0; D.input.jy = 0; D.input.btn = false; place(); D.frame(1 / fps); }
place(); D.frame(1 / 120);
await __shot('states');
__log('SHOT states ' + JSON.stringify(onScreen(8)));
__log('CREATURES max ' + JSON.stringify(crMax));
__log('done ok');
await __done();
