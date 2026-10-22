// 追尾镜头（原型的算法）：在龙后上方跟着，只跟偏航不跟侧倾，不晃。体型变了距离慢慢跟上。
import * as THREE from 'three';
import { waveH, groundAt } from '../sim/world.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export function createCamera(camera) {
  const C = { pos: V(0, 70, -30), look: V(0, 60, 20), span: 11, first: true, under: 0, pitch: 0, camUnder: null, flipT: 0 };
  const want = V(), lk = V(), back = V(), fwd = V(), _hp = V();
  // h：插值后的主角；S：sim；dt：渲染帧时间
  C.update = (h, S, dt, time) => {
    const fire = S.kind === 'fire';
    const Sz = fire ? h.len / .94 : h.len * .5;                 // 「SCALE」：火龙 = 体长 / 0.94；海龙 = 0.6 × 体长
    const spanWant = 11 * Math.pow(Sz / 11, .6);           // 指数 < 1：镜头比体型变得慢，长大后龙在屏幕上明显变大
    C.span += (spanWant - C.span) * damp(1.6, dt);               // 进化后约 1.5 秒拉到新距离
    const span = C.span;
    const hTan = Math.tan(camera.fov * Math.PI / 360) * Math.min(1, camera.aspect);
    // 速度系数 sf：平飞 0 → 俯冲 / 冲刺 1。快的时候镜头稍微落后一点、视野变宽（速度感）
    const lv = fire ? S.cfg.level : S.cfg.cruise, top = fire ? S.cfg.dive : S.cfg.dash;
    const sf = Math.max(0, Math.min(1, (h.speed - lv) / Math.max(1, top - lv)));
    C.sf = sf;
    const dist = (span * .46 / hTan + 3 * span / 11) * (1 + .14 * sf);
    back.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    // 俯仰：镜头只跟一个平滑过、限过幅的俯仰（海龙连续跃出时龙一会儿抬头一会儿扎下，镜头跟着甩会晕）
    const pMax = fire ? .9 : .3;
    C.pitch += (Math.max(-pMax, Math.min(pMax, h.pitch)) - C.pitch) * damp(fire ? 6 : 2.2, dt);
    const pitch = C.pitch, cp = Math.cos(pitch);
    fwd.set(Math.sin(h.yaw) * cp, Math.sin(pitch), Math.cos(h.yaw) * cp);
    // 镜头在水上还是水下：海龙加迟滞——出水要在空中待 0.35 秒、入水要在水里待 0.6 秒才换（连续跃出时镜头不在水面上下来回切）
    const heroUnder = h.y < waveH(h.x, h.z, time) - .5;
    if (C.camUnder === null || C.first || fire) { C.camUnder = heroUnder; C.flipT = 0; }
    else if (heroUnder !== C.camUnder) { C.flipT += dt; if (C.flipT > (heroUnder ? .6 : .35)) { C.camUnder = heroUnder; C.flipT = 0; } }
    else C.flipT = 0;
    const underHero = C.camUnder;
    let up = dist * .22 - pitch * dist * .3;
    if (underHero) up = dist * .32 - pitch * dist * .2;      // 水下：镜头略高、往下压，看得到背上的斑点
    want.set(h.x, h.y, h.z).addScaledVector(back, -dist); want.y += up;
    // 镜头不停在水线带上：要么在水上，要么在水下，跨过去就直接跨
    const w = waveH(want.x, want.z, time);
    if (!underHero) want.y = Math.max(want.y, w + (fire ? 3 : 1.6));
    else want.y = Math.min(want.y, w - 1.2);
    // 镜头别钻进山 / 水下岩壁：龙到镜头的连线上取 6 个点，碰到地形就把镜头拉近到碰之前那一点，再稍微抬高
    let tHit = 1;
    for (let i = 1; i <= 6; i++) {
      const t = i / 6, x = h.x + (want.x - h.x) * t, y = h.y + (want.y - h.y) * t, z = h.z + (want.z - h.z) * t;
      if (groundAt(x, z) > y - 1.8) { tHit = Math.max(.22, (i - 1) / 6); break; }
    }
    if (tHit < 1) {
      want.set(h.x + (want.x - h.x) * tHit, h.y + (want.y - h.y) * tHit, h.z + (want.z - h.z) * tHit);
      if (!underHero) want.y += span * .25;
    }
    if (C.first) { C.pos.copy(want); C.first = false; }
    // 海龙：竖直方向跟得慢一点（跃出 / 落水时不上下猛甩）
    const ky = fire ? damp(3.2, dt) : damp(1.8, dt), kh = damp(3.2, dt);
    C.pos.x += (want.x - C.pos.x) * kh; C.pos.z += (want.z - C.pos.z) * kh; C.pos.y += (want.y - C.pos.y) * ky;
    const wc = waveH(C.pos.x, C.pos.z, time);
    if (!underHero && C.pos.y < wc + 1) C.pos.y = wc + 1;
    if (underHero && C.pos.y > wc - .9) C.pos.y = wc - .9;
    const gc = groundAt(C.pos.x, C.pos.z);
    if (gc > C.pos.y - 1.5) { if (!underHero) C.pos.y = gc + 1.5; else C.pos.lerp(_hp.set(h.x, h.y, h.z), .35); }
    camera.position.copy(C.pos);
    lk.set(h.x, h.y, h.z).addScaledVector(fwd, dist * .4); lk.y += span * .12 - (underHero ? span * .15 : 0);
    if (C.lookFirst !== false) { C.look.copy(lk); C.lookFirst = false; }
    if (fire) C.look.lerp(lk, damp(6, dt));
    else { const kl = damp(4, dt), kly = damp(2, dt); C.look.x += (lk.x - C.look.x) * kl; C.look.z += (lk.z - C.look.z) * kl; C.look.y += (lk.y - C.look.y) * kly; }   // 海龙：视线的上下跟得更慢
    camera.lookAt(C.look);
    const fov = 60 + sf * 20 - (h.speed < lv ? (lv - h.speed) * .3 : 0);
    camera.fov += (Math.max(52, Math.min(84, fov)) - camera.fov) * damp(sf > .3 ? 3 : 2, dt);
    camera.updateProjectionMatrix();
    C.under = camera.position.y < waveH(camera.position.x, camera.position.z, time) ? 1 : 0;
  };
  C.snap = () => { C.first = true; C.lookFirst = true; };
  return C;
}
