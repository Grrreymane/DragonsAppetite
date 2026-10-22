// 技能特效：
// - 漩涡（海龙技能）：龙周围一个转着的水流漩涡——水平的螺旋盘 + 一圈往上拧的水墙，持续整个技能时间；没有鱼也看得出放了技能
// - 残留漩涡（特性）：同样的东西，小一号，留在冲刺结束的地方
// - 冲击波：一个从中心鼓出去的发光球壳（龙吼、放漩涡、冲刺起步、热浪）
// - 冲刺：龙头前一层破水的光罩（细长的球壳，朝前），冲刺时一直在
// 全是加色混合、不写深度、不吃雾；每种一个网格（冲击波 4 个池）
import * as THREE from 'three';

const WHIRL_V = `varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){ vP = position; vec4 w = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`;
// 螺旋盘：本地坐标 xy 平面（转成水平放）。条纹 = sin(角度 × 3 + log(半径) × 7 − 时间)
const DISC_F = `uniform vec3 uCol; uniform float uA, uT; varying vec3 vP;
void main(){
  float r = length(vP.xy), a = atan(vP.y, vP.x);
  float s = sin(a * 3.0 + log(max(r, 0.05)) * 7.0 + uT * 7.0);
  float k = smoothstep(0.35, 0.9, s) * smoothstep(1.0, 0.75, r) * smoothstep(0.08, 0.3, r);
  float core = (1.0 - smoothstep(0.0, 0.35, r)) * 0.35;
  gl_FragColor = vec4(uCol * (k * 0.9 + core) * uA, 1.0);
}`;
// 水墙：开口圆柱，螺旋条纹往上拧；上下两头淡掉；侧面（掠射）更亮
const WALL_F = `uniform vec3 uCol; uniform float uA, uT; varying vec3 vP; varying vec3 vN; varying vec3 vV;
void main(){
  float a = atan(vP.x, vP.z), h = vP.y + 0.5;
  float s = sin(a * 4.0 + h * 9.0 - uT * 9.0);
  float k = smoothstep(0.45, 0.95, s) * smoothstep(0.0, 0.25, h) * smoothstep(1.0, 0.6, h);
  float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 1.5);
  gl_FragColor = vec4(uCol * k * (0.35 + 0.9 * rim) * uA, 1.0);
}`;
// 发光球壳（冲击波 / 破水罩）：边缘亮、正对镜头的中间透明
const SHELL_F = `uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 3.5); gl_FragColor = vec4(uCol * f * uA, 1.0); }`;

function mat(frag, col) {
  const U = { uCol: { value: new THREE.Color(col) }, uA: { value: 0 }, uT: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: WHIRL_V, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
  return { m, U };
}

export function createSkillFx({ scene, camera }) {
  const discGeo = new THREE.RingGeometry(.02, 1, 64, 6).rotateX(-Math.PI / 2);
  const wallGeo = new THREE.CylinderGeometry(1, .3, 1, 48, 6, true);   // 漏斗：上宽下窄
  const ringGeo = new THREE.RingGeometry(.86, 1, 96, 1).rotateX(-Math.PI / 2);
  const shellGeo = new THREE.SphereGeometry(1, 32, 16);
  // 漩涡：盘 + 墙。两套（技能 / 残留漩涡）
  const mkWhirl = col => {
    const D = mat(DISC_F, col), W = mat(WALL_F, col);
    const g = new THREE.Group(), disc = new THREE.Mesh(discGeo, D.m), wall = new THREE.Mesh(wallGeo, W.m);
    disc.renderOrder = wall.renderOrder = 5; disc.frustumCulled = wall.frustumCulled = false;
    g.add(disc, wall); g.visible = false; scene.add(g);
    return { g, disc, wall, D, W, k: 0, spin: 0 };
  };
  const whirl = mkWhirl(0x7ff8ff), eddy = mkWhirl(0x9ffcff);
  // 冲击波池
  const shocks = Array.from({ length: 4 }, () => {
    const S = mat(SHELL_F, 0xffffff), m = new THREE.Mesh(shellGeo, S.m);
    m.visible = false; m.renderOrder = 5; m.frustumCulled = false; scene.add(m);
    return { m, S, t: 1, dur: 1, r: 1, delay: 0 };
  });
  let si = 0;
  // 水平的冲击环：贴着一个高度往外扩（龙吼、放漩涡）。可以比镜头距离大：是平的，不会糊住画面
  const rings = Array.from({ length: 3 }, () => {
    const S = mat(DISC_F.replace('float k = smoothstep(0.35, 0.9, s) * smoothstep(1.0, 0.75, r) * smoothstep(0.08, 0.3, r);', 'float k = smoothstep(0.86, 0.93, r) * smoothstep(1.0, 0.95, r);').replace('float core = (1.0 - smoothstep(0.0, 0.35, r)) * 0.35;', 'float core = 0.0;'), 0xffffff);
    const m = new THREE.Mesh(new THREE.RingGeometry(.02, 1, 96, 1).rotateX(-Math.PI / 2), S.m);
    m.visible = false; m.renderOrder = 5; m.frustumCulled = false; scene.add(m);
    return { m, S, t: 1, dur: 1, r: 1, delay: 0 };
  });
  let ri = 0;
  // 冲刺的破水罩
  const B = mat(SHELL_F, 0x8ff6ff), bow = new THREE.Mesh(shellGeo, B.m);
  bow.visible = false; bow.renderOrder = 5; bow.frustumCulled = false; scene.add(bow);
  let bowK = 0;
  const _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _z = new THREE.Vector3(0, 0, 1);

  function drawWhirl(W, on, x, y, z, r, dt, T) {
    W.k += ((on ? 1 : 0) - W.k) * Math.min(1, dt * (on ? 6 : 3));
    W.g.visible = W.k > .01;
    if (!W.g.visible) return;
    W.spin += dt * (1.5 + 2 * W.k);
    W.g.position.set(x, y, z);
    // 画出来的大小不超过镜头距离的 0.7 倍（实际作用范围更大，但镜头在漩涡里面就只看得到几条横线）
    const R = Math.min(r, camera.position.distanceTo(W.g.position) * .45), rr = R * (.75 + .25 * W.k);
    W.disc.scale.set(rr * 1.3, 1, rr * 1.3); W.disc.rotation.y = W.spin;
    W.wall.scale.set(rr, R * 1.6, rr); W.wall.rotation.y = -W.spin * .6;
    W.D.U.uA.value = .35 * W.k; W.D.U.uT.value = T;
    W.W.U.uA.value = .55 * W.k; W.W.U.uT.value = T;
  }

  return {
    // 冲击波：(x,y,z) 中心，r 最大半径，col 颜色，dur 秒，delay 晚几秒开始
    shock(x, y, z, r, col = 0xffffff, dur = .6, delay = 0) {
      const s = shocks[si++ % shocks.length];
      s.m.position.set(x, y, z); s.r = r; s.dur = dur; s.t = 0; s.delay = delay; s.S.U.uCol.value.setHex(col);
    },
    ring(x, y, z, r, col = 0xffffff, dur = .7, delay = 0) {
      const s = rings[ri++ % rings.length];
      s.m.position.set(x, y, z); s.r = r; s.dur = dur; s.t = 0; s.delay = delay; s.S.U.uCol.value.setHex(col);
    },
    // H：插值后的主角；fwd：主角朝前的单位向量
    update(S, H, fwd, dt, T) {
      const h = S && S.hero;
      // 漩涡技能：跟着龙
      const sk = h && h.skill, vort = !!(sk && sk.id === 'vortex' && sk.t > 0);
      drawWhirl(whirl, vort, H ? H.x : 0, H ? H.y : 0, H ? H.z : 0, vort ? sk.r : (whirl.lastR || 20), dt, T);
      if (vort) whirl.lastR = sk.r;
      // 残留漩涡：留在原地
      const E = S && S.eddy;
      if (E) { eddy.x = E.x; eddy.y = E.y; eddy.z = E.z; eddy.r = E.r; }
      drawWhirl(eddy, !!E, eddy.x || 0, eddy.y || 0, eddy.z || 0, eddy.r || 9, dt, T);
      // 冲击波：半径按 ease-out 鼓出去，越鼓越淡
      for (const s of shocks) {
        if (s.t >= s.dur) { s.m.visible = false; continue; }
        if (s.delay > 0) { s.delay -= dt; s.m.visible = false; continue; }
        s.t += dt; const u = Math.min(1, s.t / s.dur), e = 1 - (1 - u) * (1 - u);
        const R = Math.max(.1, s.r * e), cd = camera.position.distanceTo(s.m.position);
        s.m.visible = true; s.m.scale.setScalar(R);
        // 球壳鼓到镜头那么大时淡掉（镜头在壳里面会糊满整个画面）
        s.S.U.uA.value = (1 - u) * (1 - u) * .9 * Math.max(0, Math.min(1, (cd * .95 - R) / (cd * .3 + 1)));
      }
      for (const s of rings) {
        if (s.t >= s.dur) { s.m.visible = false; continue; }
        if (s.delay > 0) { s.delay -= dt; s.m.visible = false; continue; }
        s.t += dt; const u = Math.min(1, s.t / s.dur), e = 1 - (1 - u) ** 3;
        s.m.visible = true; s.m.scale.setScalar(Math.max(.1, s.r * e));
        s.S.U.uA.value = (1 - u) * 1.4;
      }
      // 冲刺：龙头前面的破水罩（细长，朝前）
      const dashing = !!(h && h.dashT > 0 && h.medium === 'water');
      bowK += ((dashing ? 1 : 0) - bowK) * Math.min(1, dt * (dashing ? 10 : 5));
      bow.visible = bowK > .02 && !!H;
      if (bow.visible) {
        const L = H.len || 8;
        bow.position.set(H.x + fwd.x * L * .3, H.y + fwd.y * L * .3, H.z + fwd.z * L * .3);
        _f.set(fwd.x, fwd.y, fwd.z).normalize(); _q.setFromUnitVectors(_z, _f); bow.quaternion.copy(_q);
        const pulse = 1 + .06 * Math.sin(T * 30);
        bow.scale.set(L * .32 * pulse, L * .32 * pulse, L * .75);
        B.U.uA.value = .9 * bowK;
      }
    },
  };
}
