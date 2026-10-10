// 追尾镜头（原型的算法）：在龙后上方跟着，只跟偏航不跟侧倾，不晃。体型变了距离慢慢跟上。
import * as THREE from 'three';
import { waveH } from '../sim/world.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export function createCamera(camera) {
  const C = { pos: V(0, 70, -30), look: V(0, 60, 20), span: 11, first: true, under: 0 };
  const want = V(), lk = V(), back = V(), fwd = V();
  // h：插值后的主角；S：sim；dt：渲染帧时间
  C.update = (h, S, dt, time) => {
    const fire = S.kind === 'fire';
    const Sz = fire ? h.len / .94 : h.len * .6;                 // 「SCALE」：火龙 = 体长 / 0.94；海龙 = 0.6 × 体长
    const spanWant = 11 * Math.pow(Sz / 11, .8);
    C.span += (spanWant - C.span) * damp(1.6, dt);               // 进化后约 1.5 秒拉到新距离
    const span = C.span;
    const hTan = Math.tan(camera.fov * Math.PI / 360) * Math.min(1, camera.aspect);
    const dist = span * .46 / hTan + 3 * span / 11;
    back.set(Math.sin(h.yaw), 0, Math.cos(h.yaw));
    const cp = Math.cos(h.pitch);
    fwd.set(Math.sin(h.yaw) * cp, Math.sin(h.pitch), Math.cos(h.yaw) * cp);
    const underHero = h.y < waveH(h.x, h.z, time) - .5;
    let up = dist * .22 - h.pitch * dist * .3;
    if (underHero) up = dist * .32 - h.pitch * dist * .2;      // 水下：镜头略高、往下压，看得到背上的斑点
    want.set(h.x, h.y, h.z).addScaledVector(back, -dist); want.y += up;
    // 镜头不停在水线带上：要么在水上，要么在水下，跨过去就直接跨
    const w = waveH(want.x, want.z, time);
    if (!underHero) want.y = Math.max(want.y, w + (fire ? 3 : 1.6));
    else want.y = Math.min(want.y, w - 1.2);
    if (C.first) { C.pos.copy(want); C.first = false; }
    C.pos.lerp(want, damp(3.2, dt));
    const wc = waveH(C.pos.x, C.pos.z, time);
    if (!underHero && C.pos.y < wc + 1) C.pos.y = wc + 1;
    if (underHero && C.pos.y > wc - .9) C.pos.y = wc - .9;
    camera.position.copy(C.pos);
    lk.set(h.x, h.y, h.z).addScaledVector(fwd, dist * .4); lk.y += span * .12 - (underHero ? span * .15 : 0);
    if (C.lookFirst !== false) { C.look.copy(lk); C.lookFirst = false; }
    C.look.lerp(lk, damp(6, dt));
    camera.lookAt(C.look);
    const level = fire ? S.cfg.level : S.cfg.cruise;
    const fov = 62 + (h.speed - level) * .3 * (fire ? 1 : .6);
    camera.fov += (Math.max(50, Math.min(80, fov)) - camera.fov) * damp(2, dt);
    camera.updateProjectionMatrix();
    C.under = camera.position.y < waveH(camera.position.x, camera.position.z, time) ? 1 : 0;
  };
  C.snap = () => { C.first = true; C.lookFirst = true; };
  return C;
}
