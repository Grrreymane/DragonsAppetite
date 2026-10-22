// 技能特效：
// - 漩涡（海龙技能）：龙周围几道绕着转、往里收的水流弧线（朝镜头的细带子），持续整个技能时间；没有鱼也看得出放了技能
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
// 发光球壳（冲击波 / 破水罩）：边缘亮、正对镜头的中间透明
const SHELL_F = `uniform vec3 uCol; uniform float uA; varying vec3 vN; varying vec3 vV;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), vV)), 3.5); gl_FragColor = vec4(uCol * f * uA, 1.0); }`;

function mat(frag, col) {
  const U = { uCol: { value: new THREE.Color(col) }, uA: { value: 0 }, uT: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: U, vertexShader: WHIRL_V, fragmentShader: frag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
  return { m, U };
}

export function createSkillFx({ scene, camera }) {
  const shellGeo = new THREE.SphereGeometry(1, 32, 16);
  // 漩涡（2026-10-22 重做：用户嫌旧的「看得到平面在晃」）：几道绕着中心转、往里收的水流弧线——朝镜头的连续细带子
  // （相邻两段共用顶点、两边柔和淡出），头尾淡、中间亮，整体转；从哪个角度看都不会露出平面
  const ARMS = 7, STEPS = 16, MAXV = 2 * ARMS * (STEPS + 1) * 2;   // 两套漩涡
  const rpos = new Float32Array(MAXV * 3), rcol = new Float32Array(MAXV * 4), rside = new Float32Array(MAXV);
  const ridx = []; for (let s = 0; s < 2 * ARMS; s++) for (let j = 0; j < STEPS; j++) { const v = (s * (STEPS + 1) + j) * 2; ridx.push(v, v + 1, v + 2, v + 2, v + 1, v + 3); }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rpos, 3).setUsage(THREE.DynamicDrawUsage));
  rgeo.setAttribute('color', new THREE.BufferAttribute(rcol, 4).setUsage(THREE.DynamicDrawUsage));
  rgeo.setAttribute('aSide', new THREE.BufferAttribute(rside, 1));
  rgeo.setIndex(ridx);
  for (let v = 0; v < MAXV; v++) rside[v] = v % 2 ? -1 : 1;
  const streaks = new THREE.Mesh(rgeo, new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
    vertexShader: 'attribute vec4 color; attribute float aSide; varying vec4 vC; varying float vS; void main(){ vC = color; vS = aSide; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec4 vC; varying float vS; void main(){ float e = 1.0 - vS * vS; gl_FragColor = vec4(vC.rgb * vC.a * e * e, 1.0); }',
  }));
  streaks.frustumCulled = false; streaks.renderOrder = 5; scene.add(streaks);
  let nArm = 0;
  const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Vector3();
  const P = Array.from({ length: STEPS + 1 }, () => new THREE.Vector3());
  // 一道弧：P[0..STEPS] 是中心线，w(u) 宽度，a(u) 亮度
  function arm(col, wf, af) {
    if (nArm >= 2 * ARMS) return;
    const base = nArm * (STEPS + 1) * 2;
    for (let j = 0; j <= STEPS; j++) {
      const p = P[j], q = P[Math.min(STEPS, j + 1)], o = P[Math.max(0, j - 1)];
      _t.subVectors(q, o); _c.subVectors(p, camera.position);
      _s.crossVectors(_t, _c); const l = _s.length() || 1; _s.multiplyScalar(wf(j / STEPS) / l);
      const v = base + j * 2, a = af(j / STEPS);
      rpos.set([p.x + _s.x, p.y + _s.y, p.z + _s.z, p.x - _s.x, p.y - _s.y, p.z - _s.z], v * 3);
      rcol.set([col.r, col.g, col.b, a, col.r, col.g, col.b, a], v * 4);
    }
    nArm++;
  }
  const mkWhirl = col => ({ col: new THREE.Color(col), k: 0, spin: 0, seed: Math.random() * 10 });
  const whirl = mkWhirl(0x8ff8ff), eddy = mkWhirl(0xb0fcff);
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
    if (W.k < .01) return;
    W.spin += dt * (2.2 + 2.5 * W.k);
    // 画出来的大小不超过镜头距离的 0.6 倍（实际作用范围更大，但镜头在漩涡里面就只看得到几条横线）
    _v.set(x, y, z);
    const R = Math.min(r, camera.position.distanceTo(_v) * .6);
    for (let i = 0; i < ARMS; i++) {
      // 每道弧：起点半径 rr0、往里收到 0.45 倍，扫过 140°，高度从上往下错开一点；一亮一暗错开
      const ph = i / ARMS * Math.PI * 2 + W.spin + Math.sin(i * 7.3 + W.seed) * .4;
      const rr0 = R * (.55 + .45 * ((i * .618 + W.seed) % 1)), h0 = (((i * .37 + W.seed) % 1) - .5) * R * .7;
      const life = (.55 + .45 * Math.sin(T * 1.7 + i * 2.1)) * W.k;
      for (let j = 0; j <= STEPS; j++) {
        const u = j / STEPS, a = ph + u * 2.4, rr = rr0 * (1 - .55 * u);
        P[j].set(x + Math.cos(a) * rr, y + h0 * (1 - u) + Math.sin(a * 2 + T) * R * .04, z + Math.sin(a) * rr);
      }
      arm(W.col, u => R * (.012 + .022 * Math.sin(Math.PI * u)), u => life * Math.sin(Math.PI * u) * .9);
    }
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
      nArm = 0;
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
      rgeo.setDrawRange(0, nArm * STEPS * 6); rgeo.attributes.position.needsUpdate = true; rgeo.attributes.color.needsUpdate = true; streaks.visible = nArm > 0;
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
