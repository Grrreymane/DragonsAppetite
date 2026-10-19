// 远处的生命（纯画面：不能吃、不进 sim、不影响玩法）
//   鲸：跃身击浪（冲出水面、翻身拍下去、大水花，有时连跳两次）/ 换气（背露出水面、喷水柱、举尾下潜）/ 水下慢慢滑过（海龙看得到）
//   海豚群：4~8 只错开节奏跃出水面，横穿视野
//   候鸟：人字队形 / 松散的一群，高高远远地飞过（深色剪影或白海鸥），夜里少、下雨少、傍晚多
//   水下：大魔鬼鱼、老海龟；夜里发光的水母 + 海里的荧光点（水上夜里海面也有零星荧光，水花带一点蓝光）
// 导演：每 12~25 秒在镜头前方 ±35° 安排一件看得见的事（按区域 / 水上水下 / 昼夜挑）；跑远了、落到身后就收掉。
// 和猎物区分：都比可吃的生物远（水上 50 米外、水下 30 米外）、没有大眼睛；水母是半透明的发光体，没有描边。
// 绘制：鲸 / 海豚 / 魔鬼鱼 / 海龟各 1 个 InstancedMesh（近的时候加描边），鸟 1 个，水母 1 个（加色），水花 / 荧光各 1 个点池。最多 12 次。
// 调试：window.__amb.spawn('breach'|'surface'|'glide'|'dolphins'|'birds'|'manta'|'turtle'|'jelly', { d: 距离, a: 偏离视线的角度, force })
import * as THREE from 'three';
import { builder, mixHex, outlineColor, FOG } from './creature-kit.js';
import { OUTLINE } from './toon.js';
import { waveH, zoneAt, groundAt, seabedY } from '../sim/world.js';

const TAU = Math.PI * 2, D2R = Math.PI / 180, WRAP = Math.PI * 4;
const rnd = Math.random, rr = (a, b) => a + (b - a) * rnd();
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;
const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const hash = (a, b) => { let h = Math.imul((a | 0) * 374761393 + (b | 0) * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
const Rg = (z, rx, ry, y = 0, x = 0) => ({ c: [x, y, z], rx, ry });
const CONE = 35 * D2R;

// ---------- 造型（creature-kit 的搭建器：低多边形、每面一色、按部件平滑法线） ----------
// 前 = +Z，上 = +Y。鲸 / 海豚 / 海龟按体长归一化，鸟 / 魔鬼鱼按翼展归一化（实例缩放 = 体长或翼展，米）

// 座头鲸：大圆头、粗身、细尾柄、宽尾鳍、很长的白色胸鳍（远处一眼认得出）
function whaleModel() {
  const B = builder(301);
  const back = 0x2c4462, belly = 0xe2eaee, dark = 0x22364f, flip = 0xdde6ec;   // 背深一点：从高处看也和海面分得开
  const tw = v => [sstep(.12, -.42, v.z), 0, 0, 0];
  B.loft([Rg(.5, 0, 0, -.015), Rg(.47, .07, .05, -.012), Rg(.4, .115, .09, -.004), Rg(.26, .145, .125), Rg(.06, .14, .125, .006), Rg(-.14, .108, .1, .01), Rg(-.3, .06, .062, .01), Rg(-.4, .03, .034, .006), Rg(-.44, 0, 0, .004)],
    { n: 10, paint: (c, n) => n.y < -.42 ? (c.z > .12 && Math.floor(c.x * 60) % 2 ? mixHex(belly, back, .25) : belly) : back, ap: tw });
  B.fin([[0, .004, -.4], [.07, .004, -.45], [.2, .004, -.5], [.16, .004, -.54], [.05, .004, -.5], [0, .004, -.47], [-.05, .004, -.5], [-.16, .004, -.54], [-.2, .004, -.5], [-.07, .004, -.45]], [0, 1, 0], .014,
    { ap: () => [1, 0, 0, 0], paint: (c, n) => n.y < -.2 ? flip : dark });
  for (const s of [1, -1]) B.fin([[s * .09, -.07, .27], [s * .14, -.08, .29], [s * .27, -.12, .19], [s * .41, -.15, .02], [s * .39, -.15, -.01], [s * .2, -.11, .12], [s * .09, -.08, .19]], [0, 1, 0], .016,
    { ap: () => [0, s, 0, 0], paint: (c, n) => n.y > .3 ? mixHex(back, flip, .3) : flip });
  B.bip([[0, .1, -.11], [0, .085, -.22], [0, .145, -.2]], [1, 0, 0], .014, { color: dark, ap: tw });
  for (const s of [1, -1]) { const e = B.surf([0, -.025, .31], [s, 0, 0]); B.ell(e, [.01, .014, .016], { n: 5, m: 3, color: 0x10141a }); }
  const r = B.finish('z');
  return { ...r, blow: [0, .15 * r.s, .27 * r.s], fluke: [0, 0, -.5 * r.s], uP: [.1 * r.s, -.07 * r.s, .22, 0] };
}

// 海豚：细长身子、短嘴、往后弯的背鳍、背深肚白
function dolphinModel() {
  const B = builder(302);
  const back = 0x4f6f8e, side = 0x8ea8bc, belly = 0xeef3f5, dark = 0x3a5270;
  const tw = v => [sstep(.05, -.42, v.z), 0, 0, 0];
  B.loft([Rg(.5, 0, 0, -.025), Rg(.46, .024, .02, -.025), Rg(.4, .032, .03, -.02), Rg(.35, .07, .075, .005), Rg(.22, .095, .1, .01), Rg(.02, .1, .105, .005), Rg(-.16, .07, .078, .005), Rg(-.32, .035, .04, .004), Rg(-.41, .016, .018, 0), Rg(-.43, 0, 0, 0)],
    { n: 8, paint: (c, n) => n.y < -.35 ? belly : n.y > .45 ? back : side, ap: tw });
  B.bip([[0, .09, .06], [0, .08, -.14], [0, .21, -.16], [0, .16, -.05]], [1, 0, 0], .014, { color: dark, ap: tw });
  B.fin([[0, .004, -.39], [.13, .004, -.48], [.1, .004, -.51], [0, .004, -.46], [-.1, .004, -.51], [-.13, .004, -.48]], [0, 1, 0], .012, { ap: () => [1, 0, 0, 0], color: dark });
  for (const s of [1, -1]) B.fin([[s * .07, -.05, .22], [s * .2, -.1, .11], [s * .18, -.1, .07], [s * .07, -.06, .13]], [0, 1, 0], .01, { ap: () => [0, s, 0, 0], color: back });
  for (const s of [1, -1]) { const e = B.surf([0, .02, .34], [s, 0, 0]); B.ell(e, [.008, .01, .012], { n: 5, m: 3, color: 0x10141a }); }
  const r = B.finish('z');
  return { ...r, uP: [.07 * r.s, -.06 * r.s, .3, 0] };
}

// 远处的鸟：两段翅（外段滞后，扇起来像 M）。白身灰翅黑翼尖；深色的一群用实例颜色压暗
function birdModel() {
  const B = builder(303);
  const body = 0xf2f5f6, wing = 0xaab5bf, tip = 0x2a2f36;
  B.ell([0, 0, 0], [.055, .055, .2], { n: 5, m: 3, color: body });
  B.ell([0, .025, .2], [.045, .045, .06], { n: 5, m: 3, color: body });
  for (const s of [1, -1]) {
    B.fin([[s * .03, .01, .07], [s * .42, .03, .05], [s * .42, .03, -.07], [s * .03, .01, -.06]], [0, 1, 0], .015, { ap: () => [s, 1, 0, 0], color: wing });
    B.fin([[s * .42, .03, .05], [s * .9, 0, -.1], [s * .42, .03, -.07]], [0, 1, 0], .012, { ap: () => [s, 2, 0, 0], paint: c => Math.abs(c.x) > .66 ? tip : wing });
  }
  B.fin([[-.04, 0, -.17], [.04, 0, -.17], [0, 0, -.3]], [0, 1, 0], .01, { color: wing });
  const r = B.finish('z', 1.8);
  return { ...r, uP: [.03 * r.s, .42 * r.s, .9, 0] };
}

// 大魔鬼鱼：菱形的扁身子（背黑肚白）、头前两片头鳍、细长尾巴
function mantaModel() {
  const B = builder(304);
  const back = 0x222d39, belly = 0xe9edf0;
  const ww = v => [Math.min(1, Math.abs(v.x) / .5), 0, 0, 0];
  B.loft([Rg(.36, 0, 0), Rg(.32, .1, .03), Rg(.2, .3, .045), Rg(.04, .5, .05, 0), Rg(-.06, .36, .045), Rg(-.15, .15, .035), Rg(-.2, .05, .02), Rg(-.22, 0, 0)],
    { n: 8, paint: (c, n) => n.y < 0 ? belly : back, ap: ww });
  for (const s of [1, -1]) B.pyr([[s * .07, -.005, .31], [s * .12, -.005, .29], [s * .095, .02, .3]], [s * .1, -.03, .44], { color: back, flat: true });
  B.pyr([[-.012, 0, -.2], [.012, 0, -.2], [0, .014, -.2]], [0, 0, -.62], { color: back, ap: () => [0, 1, 0, 0] });
  const r = B.finish('z', 1.0);
  return r;
}

// 老海龟：大龟壳（格子花纹）、长前鳍
function turtleModel() {
  const B = builder(305);
  const sh1 = 0x4d6a3b, sh2 = 0x3a522e, skin = 0x7c8c68, belly = 0xd8cfa0;
  B.ell([0, .04, 0], [.26, .1, .33], { n: 8, m: 5, paint: (c, n) => n.y < -.2 ? belly : (Math.floor(c.z * 9 + 10) + Math.floor(c.x * 9 + 10)) % 2 ? sh1 : sh2 });
  B.ell([0, .03, .38], [.075, .065, .1], { n: 6, m: 3, color: skin, ap: () => [0, 3, 0, 0] });
  for (const s of [1, -1]) {
    B.fin([[s * .18, .02, .2], [s * .62, -.01, .03], [s * .58, -.01, -.03], [s * .2, .02, .08]], [0, 1, 0], .02, { ap: () => [s, 1, 0, 0], color: skin });
    B.fin([[s * .15, .02, -.24], [s * .3, .01, -.36], [s * .22, .01, -.38], [s * .1, .02, -.3]], [0, 1, 0], .015, { ap: () => [s, 2, 0, 0], color: skin });
  }
  const r = B.finish('z');
  return { ...r, uP: [.19 * r.s, .02 * r.s, .16 * r.s, 0] };
}

// 发光水母：圆顶伞 + 5 根触手（高度归一化）
function jellyModel() {
  const B = builder(306);
  B.loft([{ c: [0, .5, 0], rx: 0, ry: 0 }, { c: [0, .46, 0], rx: .16, ry: .16 }, { c: [0, .36, 0], rx: .27, ry: .27 }, { c: [0, .22, 0], rx: .32, ry: .32 }, { c: [0, .14, 0], rx: .3, ry: .3 }, { c: [0, .2, 0], rx: .15, ry: .15 }, { c: [0, .23, 0], rx: 0, ry: 0 }],
    { axis: 'y', n: 10, color: 0xffffff, ap: v => [sstep(.46, .14, v.y), 0, 0, 0] });
  for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5, ca = Math.cos(a), sa = Math.sin(a);
    B.loft([{ c: [ca * .17, .17, sa * .17], rx: .028, ry: .028 }, { c: [ca * .2, -.15, sa * .2], rx: .016, ry: .016 }, { c: [ca * .15, -.5, sa * .15], rx: 0, ry: 0 }],
      { axis: 'y', n: 3, color: 0x8a8a8a, ap: v => [0, clamp01((.17 - v.y) / .67), k * 1.3, 0] });
  }
  return B.finish('y');
}

// 顶点动画：本体和描边用同一段（描边在变形之后外扩）。iA = (相位, 力度, 弓身 / 备用, 举尾 / 备用)
const DEF = /* glsl */`
attribute vec4 aP;
attribute vec4 iA;
uniform vec4 uP;
vec2 amR(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
void amDeform(inout vec3 p, inout vec3 n){
  float ph = iA.x, A = iA.y;
#if AMK == 0
  // 鲸 / 海豚：尾巴上下拍（鲸豚是上下摆尾），iA.z 整条弓起（负 = 拱背），iA.w 举尾；aP.y 胸鳍左右。uP = (胸鳍根 x, 胸鳍根 y, 胸鳍摆幅, 0)
  float w = aP.x, a = ph - (0.5 - p.z) * 3.0;
  p.y += sin(a) * A * w * w;
  p.y += iA.z * (p.z * p.z - 0.06);
  float tl = max(0.0, -0.08 - p.z); p.y += iA.w * tl * tl * 5.0;
  if (abs(aP.y) > 0.5) { float s = aP.y; vec2 o = vec2(s * uP.x, uP.y); p.xy = o + amR(p.xy - o, s * (sin(ph * 0.5) * uP.z - 0.1)); n.xy = amR(n.xy, s * (sin(ph * 0.5) * uP.z - 0.1)); }
#elif AMK == 1
  // 鸟：aP.x 左右，aP.y 1 内翼 / 2 外翼。uP = (肩 x, 肘 x, 外翼滞后, 0)
  if (aP.y > 0.5) {
    float s = aP.x;
    if (aP.y > 1.5) { vec2 o = vec2(s * uP.y, 0.0); p.xy = o + amR(p.xy - o, s * sin(ph - uP.z) * A * 0.7); }
    vec2 o = vec2(s * uP.x, 0.0); p.xy = o + amR(p.xy - o, s * (sin(ph) * A + 0.06));
  }
  p.y -= cos(ph) * A * 0.025;
#elif AMK == 2
  // 魔鬼鱼：一道波从头往翼尖后缘走（aP.x 翼展权重），尾巴（aP.y）轻摆
  float w = aP.x, a = ph + p.z * 4.0;
  p.y += sin(a) * A * w * sqrt(w);
  p.x += sin(ph * 0.5 + p.z * 6.0) * 0.03 * aP.y;
#else
  // 海龟：aP.x 左右，aP.y 1 前鳍 / 2 后鳍 / 3 头。uP = (前鳍根 x, 鳍根 y, 后鳍根 x, 0)
  float s = aP.x, g = aP.y;
  if (g > 0.5 && g < 1.5) { vec2 o = vec2(s * uP.x, uP.y); p.xy = o + amR(p.xy - o, s * sin(ph) * A); p.z += s * 0.0 + cos(ph) * 0.06 * abs(p.x - s * uP.x) * A; }
  else if (g > 1.5 && g < 2.5) { vec2 o = vec2(s * uP.z, uP.y); p.xy = o + amR(p.xy - o, s * sin(ph + 1.6) * A * 0.5); }
  else if (g > 2.5) p.y += sin(ph * 0.5) * 0.01;
#endif
}
`;

// 点池（水花 / 荧光）：每个池一次绘制。数据一个大数组（每颗 16 个数），不每帧新建对象
const PF = 16;   // x y z vx vy vz life max size grav drag grow alpha r g b
function makePool(root, max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max), F = new Float32Array(max * PF);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('col', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const U = { uScale: { value: 800 }, uFar: { value: 1e5 }, uDim: { value: new THREE.Color(1, 1, 1) } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: U,
    vertexShader: 'attribute float size; attribute vec4 col; varying vec4 vC; uniform float uScale, uFar; uniform vec3 uDim;'
      + ' void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = max(1.5, size * uScale / -mv.z); gl_Position = projectionMatrix * mv;'
      + ' vC = col; vC.rgb *= uDim; vC.a *= 1.0 - smoothstep(uFar * 0.55, uFar, -mv.z); }',
    fragmentShader: additive
      ? 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vC.rgb * vC.a * a, 1.0); }'
      : 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.3, d); if (a * vC.a < 0.02) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2; pts.visible = false; root.add(pts);
  let n = 0;
  return {
    U, pts,
    get n() { return n; },
    emit(x, y, z, vx, vy, vz, life, sz, grav, drag, grow, alpha, r, g, b) {
      if (n >= max) return;
      const o = n * PF; n++;
      F[o] = x; F[o + 1] = y; F[o + 2] = z; F[o + 3] = vx; F[o + 4] = vy; F[o + 5] = vz; F[o + 6] = life; F[o + 7] = life;
      F[o + 8] = sz; F[o + 9] = grav; F[o + 10] = drag; F[o + 11] = grow; F[o + 12] = alpha; F[o + 13] = r; F[o + 14] = g; F[o + 15] = b;
    },
    clear() { n = 0; },
    update(dt) {
      let w = 0;
      for (let i = 0; i < n; i++) {
        const o = i * PF;
        F[o + 6] -= dt; if (F[o + 6] <= 0) continue;
        if (w !== i) F.copyWithin(w * PF, o, o + PF);
        const q = w * PF, k = Math.exp(-F[q + 10] * dt);
        F[q + 3] *= k; F[q + 4] *= k; F[q + 5] *= k; F[q + 4] -= F[q + 9] * dt;
        F[q] += F[q + 3] * dt; F[q + 1] += F[q + 4] * dt; F[q + 2] += F[q + 5] * dt;
        const a = 1 - F[q + 6] / F[q + 7];
        pos[w * 3] = F[q]; pos[w * 3 + 1] = F[q + 1]; pos[w * 3 + 2] = F[q + 2];
        col[w * 4] = F[q + 13]; col[w * 4 + 1] = F[q + 14]; col[w * 4 + 2] = F[q + 15];
        col[w * 4 + 3] = F[q + 12] * (additive ? Math.sin(Math.PI * a) : Math.min(1, (1 - a) * 2.2) * Math.min(1, a * 12 + .3));
        size[w] = F[q + 8] * (.5 + a * F[q + 11]);
        w++;
      }
      n = w;
      geo.setDrawRange(0, n); pts.visible = n > 0;
      if (n) { geo.attributes.position.needsUpdate = true; geo.attributes.col.needsUpdate = true; geo.attributes.size.needsUpdate = true; }
    },
  };
}

const ENV0 = { night: 0, dusk: 0, rain: 0, zone: 'green', under: 0 };

export function createAmbient(ctx) {
  const { scene, renderer, GRAD, outlineMat } = ctx;
  const root = new THREE.Group(); root.name = 'ambient'; scene.add(root);

  // ---------- 网格：每种 1 个本体 + 1 个描边（共用几何、实例矩阵、实例属性） ----------
  function kindMesh(kind, model, cap, { hull = true, ow = .015, oc = 0x334455 } = {}) {
    const geo = model.geo;
    const iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', iA);
    const U = { uP: { value: new THREE.Vector4(...(model.uP || [0, 0, 0, 0])) } };
    const mat = new THREE.MeshToonMaterial({ gradientMap: GRAD, vertexColors: true });
    mat.defines = { ...(mat.defines || {}), AMK: kind };
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = DEF + 'attribute vec3 sN;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = sN; vec3 amP = position; amDeform(amP, objectNormal);')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = amP;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', FOG);   // 和生物一样：远处 / 水下不完全糊进雾
    };
    mat.customProgramCacheKey = () => 'amb' + kind;
    const body = new THREE.InstancedMesh(geo, mat, cap);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    body.frustumCulled = false; body.count = 0; body.visible = false; body.name = 'amb' + kind; root.add(body);
    let line = null;
    if (hull) {
      const hm = outlineMat(outlineColor(oc), ow, { extraPars: DEF, extraVertex: 'amDeform(transformed, oN);', key: 'amb' + kind });
      hm.defines = { ...(hm.defines || {}), AMK: kind };
      hm.userData.extraUniforms = U;
      line = new THREE.InstancedMesh(geo, hm, cap);
      line.instanceMatrix = body.instanceMatrix;
      line.frustumCulled = false; line.count = 0; line.visible = false; line.name = 'amb' + kind + '_line'; root.add(line);
    }
    return { body, line, iA, ic: body.instanceColor, n: 0, near: 1e9, cap, model };
  }
  const MW = kindMesh(0, whaleModel(), 3, { ow: .012, oc: 0x3e5c7c });
  const MD = kindMesh(0, dolphinModel(), 16, { ow: .02, oc: 0x4f6f8e });
  const MB = kindMesh(1, birdModel(), 100, { hull: false });
  const MM = kindMesh(2, mantaModel(), 4, { ow: .014, oc: 0x222d39 });
  const MT = kindMesh(3, turtleModel(), 3, { ow: .022, oc: 0x4d6a3b });
  const MESHES = [MW, MD, MB, MM, MT];

  // 水母：加色、半透明（边缘亮、中间淡），没有描边、没有眼睛（和能吃的水母分开）
  const JCAP = 24;
  const jgeo = jellyModel().geo;
  const jA = new THREE.InstancedBufferAttribute(new Float32Array(JCAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const jC = new THREE.InstancedBufferAttribute(new Float32Array(JCAP * 4), 4).setUsage(THREE.DynamicDrawUsage);
  jgeo.setAttribute('iA', jA); jgeo.setAttribute('iC', jC);
  const jU = { uFar: { value: 100 } };
  const jmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true, uniforms: jU,
    vertexShader: `attribute vec4 aP; attribute vec4 iA; attribute vec4 iC; uniform float uFar; varying vec3 vCol; varying float vA;
      void main(){
        vec3 p = position; float ph = iA.x, c = 0.5 + 0.5 * sin(ph);
        p.xz *= 1.0 - 0.16 * c * max(aP.x, aP.y > 0.0 ? 0.6 : 0.0);
        p.y -= 0.05 * c * aP.x;
        float r = aP.y;
        p.x += sin(ph * 0.5 + aP.z - r * 4.0) * 0.07 * r;
        p.z += cos(ph * 0.5 + aP.z * 1.3 - r * 3.5) * 0.07 * r;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
        float rim = 1.0 - abs(dot(n, normalize(-mv.xyz)));
        vCol = iC.rgb * color * (0.22 + 1.1 * rim * rim) * (1.0 + 0.35 * c);
        vA = iA.y * (1.0 - smoothstep(uFar * 0.5, uFar, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: 'varying vec3 vCol; varying float vA; void main(){ gl_FragColor = vec4(vCol * vA, 1.0); }',
  });
  const jmesh = new THREE.InstancedMesh(jgeo, jmat, JCAP);
  jmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); jmesh.frustumCulled = false; jmesh.count = 0; jmesh.visible = false; jmesh.renderOrder = 3; jmesh.name = 'ambJelly'; root.add(jmesh);

  const WP = makePool(root, 900, false);    // 水花、水雾、泡沫
  const GP = makePool(root, 500, true);     // 荧光、水母的光晕

  // ---------- 实体池（预先建好，不每帧新建） ----------
  const whales = Array.from({ length: 3 }, () => ({ on: false }));
  const pods = Array.from({ length: 2 }, () => ({ on: false, mem: Array.from({ length: 8 }, () => ({})) }));
  const flocks = Array.from({ length: 2 }, () => ({ on: false, mem: Array.from({ length: 50 }, () => ({})) }));
  const schools = Array.from({ length: 3 }, () => ({ on: false, mem: Array.from({ length: 3 }, () => ({})) }));   // 魔鬼鱼 / 海龟
  const jellies = Array.from({ length: JCAP }, () => ({ on: false }));
  const free = arr => { for (const o of arr) if (!o.on) return o; return null; };

  // ---------- 镜头 / 环境（每帧） ----------
  const view = { cone: CONE, x: 0, y: 0, z: 0, yaw: 0, fx: 0, fz: 1, under: false, depth: 0, wt: 0, speed: 0, kind: '', high: false };
  let env = ENV0, T0 = 0;
  const _f = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector2();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const P = { x: 0, z: 0, d: 0, a: 0 };

  // 在镜头前方的锥里挑一个点（o.d / o.a 可以指定距离 / 角度）；lead：主角往前跑，远一点放
  // low：目标在海面附近。镜头高的时候，海面上只有「龙的下面 ~ 画面下沿」这一段看得清：
  //   太近在画面下沿以外，太远就躲在龙的身子后面 → 关键时刻放在 2.1~2.9 倍镜头高度、正前方偏一点；lead = 关键时刻前主角往前飞的距离
  function aim(o, dmin, dmax, cone, lead = 0, low = false) {
    const hi = low && !view.under && view.y > 12;
    // 正中间是龙（挡着），偏到两边：0.35~1 倍锥角。高处看海面：放在正前方偏一点（在龙的下方，往前飞时只往下走、不往两边甩出画面）
    const a = view.yaw + (o && o.a != null ? o.a : (rnd() < .5 ? -1 : 1) * (hi ? rr(0, .4) : rr(.35, 1)) * cone);
    let d = o && o.d != null ? o.d : rr(dmin, dmax);
    if (hi) d = Math.min(Math.max(d, view.y * 2.1), view.y * 2.9);
    d += lead;
    P.x = view.x + Math.sin(a) * d; P.z = view.z + Math.cos(a) * d; P.d = d; P.a = a;
  }
  // 镜头到这个点之间没有岛 / 海底挡着
  function sight(x, y, z) {
    for (let i = 1; i < 8; i++) {
      const t = i / 8, px = view.x + (x - view.x) * t, py = view.y + (y - view.y) * t, pz = view.z + (z - view.z) * t;
      if ((view.under ? seabedY(px, pz) : groundAt(px, pz)) > py - 1.5) return false;
    }
    return true;
  }
  // 一条路线（加左右的余量）上都满足 ok(x, z)
  function path(x0, z0, x1, z1, side, ok) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1, rx = dz / L * side, rz = -dx / L * side;
    for (let i = 0; i <= 6; i++) {
      const t = i / 6, x = x0 + dx * t, z = z0 + dz * t;
      if (!ok(x, z) || !ok(x + rx, z + rz) || !ok(x - rx, z - rz)) return false;
    }
    return true;
  }
  const deep = need => (x, z) => seabedY(x, z) < need;
  // 横穿视野的方向（侧面最好看）
  // 水下「并排游」：在前方 f 米、侧边 l 米（龙在正中间，侧边才看得到），方向和镜头差不多，比龙慢一点 → 龙慢慢超过它
  function beside(o, f0, f1, l0, l1) {
    const side = o && o.a != null ? (o.a >= 0 ? 1 : -1) : rnd() < .5 ? -1 : 1, f = o && o.d != null ? o.d : rr(f0, f1), l = rr(l0, l1) * side;
    P.x = view.x + view.fx * f + view.fz * l; P.z = view.z + view.fz * f - view.fx * l; P.d = Math.hypot(f, l); P.a = view.yaw;
    return view.yaw + side * rr(0, 10) * D2R;   // 稍微往外偏，不会游到龙前面挡住
  }
  // 水下的鲸：从画面一侧的边外开始，横着从龙前方、下面一点慢慢游过去（竖屏视野窄，侧面才看得到整条鲸）
  function crossing(o, L) {
    // 龙一直往前游：算好起点，让鲸游到画面中间时离镜头约 60 米（再近就盖住龙了）。横向 11 米/秒，从画面边上进来
    const side = o && o.a != null ? (o.a >= 0 ? 1 : -1) : rnd() < .5 ? -1 : 1, k = Math.tan(view.cone / .8) * .85;
    const f = o && o.d != null ? o.d : Math.min(170, 70 / Math.max(.4, 1 - view.speed * k / 11));
    const l = side * (k * f + L * .3);
    P.x = view.x + view.fx * f + view.fz * l; P.z = view.z + view.fz * f - view.fx * l; P.d = Math.hypot(f, l); P.a = view.yaw;
    return view.yaw - side * rr(85, 95) * D2R;
  }
  // 往画面中间游（从画面一侧出发，横穿龙的下方）
  function inwardYaw() {
    const lat = (P.x - view.x) * view.fz - (P.z - view.z) * view.fx, s = lat >= 0 ? -1 : 1;
    return Math.atan2(view.fz * s, -view.fx * s) + rr(-.3, .3);
  }
  // 往画面外侧慢慢游（慢的魔鬼鱼 / 海龟：从锥里的点出发，不从龙背后穿过去）
  const awayYaw = () => P.a + (P.a >= view.yaw ? 1 : -1) * rr(30, 65) * D2R;
  const crossYaw = () => view.yaw + (rnd() < .5 ? 1 : -1) * rr(60, 120) * D2R;

  // ---------- 水花 ----------
  const night = () => env.night || 0;
  function splash(x, y, z, n, spread, spd, up, sz, life, grav, alpha = .9) {
    const glow = night();
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU, r = Math.sqrt(rnd()) * spread, ca = Math.cos(a), sa = Math.sin(a), s = spd * rr(.3, 1);
      const w = rr(.88, 1);
      WP.emit(x + ca * r, y, z + sa * r, ca * s, up * rr(.45, 1), sa * s, life * rr(.7, 1.2), sz * rr(.7, 1.3), grav, .7, 1.4, alpha, w, w * .99 + .01, 1);
      if (glow > .2 && i % 2 === 0) GP.emit(x + ca * r, y, z + sa * r, ca * s * .6, up * rr(.2, .6), sa * s * .6, life * rr(.8, 1.4), sz * .7, grav * .6, .7, .6, .9 * glow, .25, .85, 1);
    }
  }
  function foam(x, z, R, n, sz, life) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd() * .4, r = R * rr(.6, 1.1), ca = Math.cos(a), sa = Math.sin(a);
      WP.emit(x + ca * r, waveH(x + ca * r, z + sa * r, view.wt) + .4, z + sa * r, ca * rr(1, 3), 0, sa * rr(1, 3), life * rr(.8, 1.2), sz * rr(.8, 1.2), 0, 1.5, 1.2, .75, .93, .97, 1);
    }
  }

  // ---------- 鲸 ----------
  // breach：弹道（y0 -11 米、竖直 19 米/秒、重力 12）冲出水面，边飞边转成侧身，拍回水里；有时隔几秒再跳一次
  // surface：背露在水面慢慢游，喷两次水，最后拱背、举尾下潜
  // glide：水下慢慢滑过（只在镜头在水下时安排）
  const BR = { y0: -11, vy: 19, g: 12, vh: 6 }, BR_T = 2 * BR.vy / BR.g;
  function spawnWhale(mode, o = {}) {
    const w = free(whales); if (!w) return false;
    for (let k = 0; k < 10; k++) {
      let gy = null; const L0 = mode === 'glide' ? rr(22, 27) : rr(19, 24);
      if (mode === 'glide') gy = crossing(o, L0);   // 水下能见度只有 ~100 米：在侧前方并排游，龙慢慢超过它
      else if (mode === 'breach') aim(o, 140, 290, view.cone, view.speed * 2.2, true);
      else aim(o, 110, 220, view.cone, view.speed * 3.5, true);
      const L = L0, hy = o.yaw != null ? o.yaw : gy != null ? gy : mode === 'surface' ? inwardYaw() : crossYaw(), sx = Math.sin(hy), sz = Math.cos(hy);
      const travel = mode === 'breach' ? 26 : mode === 'surface' ? 56 : 160, back = mode === 'breach' ? .1 : mode === 'surface' ? .45 : 0;
      const x0 = P.x - sx * travel * back, z0 = P.z - sz * travel * back, x1 = x0 + sx * travel, z1 = z0 + sz * travel;
      let y = 0;
      if (mode === 'glide') y = Math.max(-48, Math.min(-14, view.y - rr(10, 15)));   // 比龙低：从龙前下方游过
      if (!o.force) {
        if (!path(x0, z0, x1, z1, L * .6, deep(mode === 'glide' ? y - 10 : -24))) continue;
        if (!sight(P.x, mode === 'glide' ? y : 3, P.z)) continue;
      }
      Object.assign(w, { on: true, mode, t: 0, x0, z0, x: x0, y: mode === 'glide' ? y : BR.y0, z: z0, by: y, yaw: hy, sx, sz, L, ph: rnd() * TAU, pitch: 0, roll: 0, bend: 0, lift: 0, amp: .04,
        v: 11, side: rnd() < .5 ? 1 : -1, again: mode === 'breach' && rnd() < .45 ? 1 : 0, exited: false, crashed: false, spout: 0, dur: mode === 'breach' ? BR_T + .8 : mode === 'surface' ? 12 : 40 });
      return true;
    }
    return false;
  }
  function updWhale(w, dt) {
    w.t += dt;
    const sw = waveH(w.x, w.z, view.wt);
    if (w.mode === 'breach') {
      const t = w.t;
      if (t < BR_T + .8) {
        const u = clamp01(t / BR_T);
        w.x = w.x0 + w.sx * BR.vh * t; w.z = w.z0 + w.sz * BR.vh * t;
        const yb = BR.y0 + BR.vy * t - BR.g * t * t / 2, vy = BR.vy - BR.g * t;
        w.y = yb + sw * .5;
        w.pitch = 1.3 - 1.75 * u; w.roll = sstep(.22, .85, u) * 1.55 * w.side; w.bend = -.22 * Math.sin(Math.PI * u);
        w.ph += dt * TAU * (u < .3 ? 1.2 : .35); w.amp = u < .3 ? .06 : .025;
        // 冲出水面：头破水的水花；在空中时身上往下淌水
        if (!w.exited && yb > -w.L * .32 && vy > 0) {
          w.exited = true;
          const hx = w.x + w.sx * w.L * .2, hz = w.z + w.sz * w.L * .2;
          splash(hx, sw, hz, 55, w.L * .14, 5, 11, 1.9, 1.6, 13);
          foam(hx, hz, w.L * .2, 14, 3.2, 3.5);
        }
        if (w.exited && !w.crashed && rnd() < .9) for (let i = 0; i < 3; i++) {
          const k = rr(-.4, .4), cp = Math.cos(w.pitch);
          const px = w.x + w.sx * cp * k * w.L, pz = w.z + w.sz * cp * k * w.L, py = yb + Math.sin(w.pitch) * k * w.L;
          if (py > sw + .5) WP.emit(px + rr(-1, 1), py, pz + rr(-1, 1), w.sx * BR.vh * .5, vy * .3 - 1, w.sz * BR.vh * .5, rr(.7, 1.1), rr(.9, 1.6), 11, .3, 1, .85, .95, .97, 1);
        }
        // 拍回水里：大水柱 + 往外溅 + 水雾 + 一圈白沫
        if (!w.crashed && vy < 0 && yb < 1.2) {
          w.crashed = true;
          const cx = w.x + w.sx * w.L * .05, cz = w.z + w.sz * w.L * .05, L = w.L;
          splash(cx, sw, cz, 110, L * .3, 4, 19, 2.8, 2.3, 12.5);
          splash(cx, sw, cz, 60, L * .25, 11, 8, 1.7, 1.6, 10);
          for (let i = 0; i < 16; i++) WP.emit(cx + rr(-1, 1) * L * .3, sw + rr(1, 6), cz + rr(-1, 1) * L * .3, rr(-2, 2), rr(1, 4), rr(-2, 2), rr(2.6, 3.8), rr(6, 9), .4, 1, 1.4, .35, .96, .98, 1);
          foam(cx, cz, L * .42, 28, 4, 5);
        }
        return t < BR_T + .8;
      }
      // 水下游几秒，再跳一次
      if (w.again > 0) {
        if (t > BR_T + rr(3.5, 4.5)) {
          w.again--; w.t = 0; w.exited = w.crashed = false;
          w.x0 = w.x + w.sx * 20; w.z0 = w.z + w.sz * 20; w.side = -w.side;
          if (seabedY(w.x0, w.z0) > -24) return false;
        }
        w.y = -20; return true;
      }
      return false;
    }
    if (w.mode === 'surface') {
      const t = w.t, L = w.L;
      w.x = w.x0 + w.sx * 3.5 * t; w.z = w.z0 + w.sz * 3.5 * t;
      const k = sstep(6.5, 10.5, t);
      w.y = -L * .035 + .3 * Math.sin(t * .9) - k * k * L * .42 + sw * .8 - (1 - sstep(0, 1.2, t)) * 4;
      w.pitch = .03 * Math.sin(t * .9 + 1) - .62 * k + .12 * sstep(5, 6.5, t) * (1 - k);
      w.bend = -.1 * Math.sin(Math.PI * clamp01((t - 5) / 3));      // 下潜前拱背
      w.lift = .22 * Math.sin(Math.PI * clamp01((t - 7) / 4.5));     // 举尾
      w.roll = 0; w.ph += dt * TAU * .22; w.amp = .03 * (1 - k * .5);
      // 喷水：t 0.8 秒、4.2 秒各一次，每次 0.9 秒
      w.spout = (t > .8 && t < 1.7) || (t > 4.2 && t < 5.1) ? 1 : 0;
      w.wake = 1 - k;
      return t < w.dur;
    }
    // glide
    const t = w.t;
    if (view.under) { const q = shy(w.x, w.y, w.z, 30, dt, view); w.x += q.x; w.z += q.z; w.by = Math.max(w.by + q.y, seabedY(w.x, w.z) + 8); }
    w.x += w.sx * w.v * dt; w.z += w.sz * w.v * dt;
    if (seabedY(w.x + w.sx * w.L, w.z + w.sz * w.L) > w.by - 6) w.by += 3 * dt;   // 前面海底抬高：往上一点
    // 龙已经超过它 30 米：收掉
    if ((w.x - view.x) * view.fx + (w.z - view.z) * view.fz < -30 - w.L) return false;
    w.y = w.by + Math.sin(t * .3) * 1.5; w.pitch = .05 * Math.cos(t * .3); w.roll = .08 * Math.sin(t * .2);
    w.ph += dt * TAU * .4; w.amp = .045; w.bend = 0; w.lift = 0;
    return t < w.dur;
  }
  function drawWhale(w, dt) {
    // 远处画大一点：150 米内不变，300 米外大 40%（喷水也跟着大）
    const dd = Math.hypot(w.x - view.x, w.y - view.y, w.z - view.z), big = view.under ? 1 : 1 + .4 * sstep(150, 300, dd);
    w.big = big;
    put(MW, w.x, w.y * (w.y > 0 ? big : 1), w.z, w.yaw, w.pitch, w.roll, w.L * big, w.ph, w.amp, w.bend, w.lift);
    if (w.mode === 'surface') {
      if (w.spout) {   // 喷水柱：气孔往上喷，顶上散成水雾
        const b = MW.model.blow; _v.set(b[0], b[1], b[2]).applyMatrix4(_m);
        const n = Math.ceil(dt * 75);
        const ks = Math.max(1, w.big * dd / 140);   // 远处的水柱粗一点、高一点（不然只剩一个白点）
        for (let i = 0; i < n; i++) WP.emit(_v.x + rr(-.3, .3), _v.y, _v.z + rr(-.3, .3), rr(-.7, .7), rr(11, 15.5) * Math.sqrt(ks), rr(-.7, .7), rr(1.2, 1.8), rr(.7, 1.2) * ks, 7, .9, 1.8, .95, .97, .99, 1);
        if (night() > .2) for (let i = 0; i < n; i += 2) GP.emit(_v.x, _v.y, _v.z, rr(-.7, .7), rr(10, 14), rr(-.7, .7), rr(1.2, 1.8), rr(.8, 1.3), 7, .9, 1.6, .8 * night(), .45, .9, 1);
      }
      if (w.wake > .3) {   // 背两边一圈白水（深色的背在海上也看得出轮廓）
        const sw = waveH(w.x, w.z, view.wt), rx = w.sz, rz = -w.sx;
        for (let i = 0; i < 2; i++) {
          const k = rr(-.42, .38) * w.L, s = (rnd() < .5 ? 1 : -1) * w.L * .13 * (1 - Math.abs(k / w.L) * 1.4);
          WP.emit(w.x + w.sx * k + rx * s, sw + .3, w.z + w.sz * k + rz * s, rx * s * .15, 0, rz * s * .15, rr(1, 1.6), rr(1.1, 1.8), 0, 2, 1, .8 * w.wake, .95, .98, 1);
          if (night() > .2) GP.emit(w.x + w.sx * k + rx * s, sw + .3, w.z + w.sz * k + rz * s, 0, 0, 0, rr(1.2, 2), rr(1.6, 2.6), 0, 2, 1, night() * w.wake, .25, .85, 1);   // 夜里：一圈荧光（深色的鲸在夜海上也看得到）
        }
      }
      if (w.lift > .08 && rnd() < .8) {   // 举起的尾巴往下滴水
        const f = MW.model.fluke; _v.set(f[0] + rr(-.15, .15), f[1], f[2]).applyMatrix4(_m);
        if (_v.y > 0) WP.emit(_v.x, _v.y, _v.z, rr(-.5, .5), -1, rr(-.5, .5), rr(.6, 1), rr(.7, 1.2), 10, .3, 1, .85, .95, .97, 1);
      }
    }
  }

  // ---------- 海豚群 ----------
  function spawnDolphins(o = {}) {
    const p = free(pods); if (!p) return false;
    for (let k = 0; k < 10; k++) {
      let gy = null;
      if (view.under) gy = beside(o, 42, 55, 2, 6); else aim(o, 55, 140, view.cone, view.speed * 2.5, true);
      const hy = o.yaw != null ? o.yaw : gy != null ? gy : inwardYaw(), sx = Math.sin(hy), sz = Math.cos(hy);
      const v = view.under ? Math.max(9, view.speed * .8) : rr(10, 13), travel = view.under ? v * 14 : 200;
      const bk = view.under ? 0 : .05, x0 = P.x - sx * travel * bk, z0 = P.z - sz * travel * bk;
      if (!o.force && (!path(x0, z0, x0 + sx * travel, z0 + sz * travel, 12, deep(-10)) || !sight(P.x, view.under ? -2 : 1, P.z))) continue;
      const n = 4 + (rnd() * 5 | 0);
      // 水下：在镜头附近的深度游（不跃出水面），不然在画面上沿以外
      Object.assign(p, { on: true, t: 0, x0, z0, sx, sz, yaw: hy, v, n, dur: travel / v, seed: rnd() * 1e6 | 0, dep: view.under ? Math.max(-16, Math.min(0, view.y + 3)) : 0 });
      for (let i = 0; i < n; i++) {
        const m = p.mem[i];
        m.lat = (i ? gauss() * 5 : 0); m.lon = (i ? -rnd() * 10 : 0) + gauss() * 2; m.P = rr(1.5, 1.9); m.off = i * rr(.18, .3) + rnd() * .2;
        m.L = rr(3.3, 4); m.f = 0; m.ph = rnd() * TAU; m.x = m.y = m.z = 0;
      }
      return true;
    }
    return false;
  }
  function updPod(p, dt) {
    p.t += dt;
    const cx = p.x0 + p.sx * p.v * p.t, cz = p.z0 + p.sz * p.v * p.t, rx = p.sz, rz = -p.sx, A = .48;
    for (let i = 0; i < p.n; i++) {
      const m = p.mem[i], c = (p.t + m.off) / m.P, ci = Math.floor(c), f = c - ci;
      const x = cx + rx * m.lat + p.sx * m.lon, z = cz + rz * m.lat + p.sz * m.lon, sw = waveH(x, z, view.wt) * .7;
      const hop = p.dep > -1.5 && hash(p.seed + i, ci) > .22, H = 1.3 + 2 * hash(ci, p.seed + i * 7);
      let y, pitch;
      if (f < A && hop) {
        const u = f / A; y = -.9 + (H + .9) * Math.sin(Math.PI * u); pitch = Math.atan2((H + .9) * Math.PI / (A * m.P) * Math.cos(Math.PI * u), p.v);
        // 出水 / 入水的小水花
        const ex = .07, en = .93;
        if (!view.under && ((m.f < ex * A && f >= ex * A) || (m.f < en * A && f >= en * A))) splash(x, sw, z, 12, .6, 2.2, 4.5, .75, .8, 12, .85);
        m.ph += dt * TAU * .6; m.amp = .02;
      } else {
        const u = f < A ? 0 : (f - A) / (1 - A), dd = hop ? 1.6 : .5;
        y = -.9 - (hop ? 0 : .6) - dd * Math.sin(Math.PI * u); pitch = Math.atan2(-dd * Math.PI / ((1 - A) * m.P) * Math.cos(Math.PI * u), p.v) * (hop ? 1 : .3);
        m.ph += dt * TAU * 2.2; m.amp = .06;
      }
      m.f = f; m.x = x; m.y = y + sw + p.dep; m.z = z; m.pitch = pitch;
      // 夜里：水下游过留一道荧光
      if (night() > .2 && y < 0 && rnd() < .5) GP.emit(x, sw - .3, z, 0, 0, 0, rr(1.2, 2), rr(1.4, 2.2) * (1 + Math.hypot(x - view.x, z - view.z) / 120), 0, 1, 1, night(), .3, .9, 1);
    }
    return p.t < p.dur;
  }

  // ---------- 鸟群 ----------
  function spawnFlock(o = {}) {
    const fl = free(flocks); if (!fl || view.under) return false;
    for (let k = 0; k < 10; k++) {
      aim(o, 100, 210, view.cone, view.speed * 1.2);
      const y = o.y != null ? o.y : view.high ? view.y + rr(6, 38) : Math.max(view.y, 0) + rr(22, 55);
      const hy = o.yaw != null ? o.yaw : view.yaw + (rnd() < .5 ? 1 : -1) * rr(55, 125) * D2R, sx = Math.sin(hy), sz = Math.cos(hy);
      const v = rr(11, 15), half = P.d * .36 + 24, x0 = P.x - sx * half, z0 = P.z - sz * half;
      const x1 = x0 + sx * half * 3, z1 = z0 + sz * half * 3;
      if (!o.force && (!path(x0, z0, x1, z1, 20, (x, z) => groundAt(x, z) < y - 25) || !sight(P.x, y, P.z))) continue;
      const style = o.style || (rnd() < .55 ? 'v' : 'loose'), dark = o.dark != null ? o.dark : rnd() < .6;
      const n = Math.min(50, o.n || (style === 'v' ? 15 + (rnd() * 20 | 0) : 20 + (rnd() * 30 | 0)));
      Object.assign(fl, { on: true, t: 0, x0, y0: y, z0, sx, sz, yaw: hy, v, n, dur: half * 3 / v, style, dark, seed: rnd() * 1e6 | 0, span: dark ? rr(2.3, 2.8) : rr(1.9, 2.3) });
      const twoV = style === 'v' && n > 22;
      for (let i = 0; i < n; i++) {
        const m = fl.mem[i];
        if (style === 'v') {
          const g = twoV ? i % 2 : 0, j = twoV ? i >> 1 : i, kk = Math.ceil(j / 2), s = j % 2 ? 1 : -1;
          m.ox = s * kk * 2.3 + gauss() * .25 + (g ? 16 : 0); m.oy = gauss() * .35 - kk * .08; m.oz = -kk * 2 + gauss() * .3 - (g ? 9 : 0);
        } else { m.ox = gauss() * 13; m.oy = gauss() * 4; m.oz = gauss() * 13; }
        m.ph = rnd() * TAU; m.hz = dark ? rr(2.4, 3) : rr(2, 2.6); m.k = rnd() * TAU;
      }
      return true;
    }
    return false;
  }

  // ---------- 魔鬼鱼 / 海龟 ----------
  function spawnSchool(kind, o = {}) {
    const sc = free(schools); if (!sc || (!view.under && !o.force)) return false;
    for (let k = 0; k < 10; k++) {
      // 魔鬼鱼：在侧前方和龙并排滑翔（比龙慢一点，龙慢慢超过它）；海龟慢，放远一点
      let gy = null;
      if (kind === 'manta') gy = beside(o, 50, 62, 4, 8); else aim(o, 34, 50, view.cone * .6, view.speed * 2);
      const bed = seabedY(P.x, P.z);
      const y = o.y != null ? o.y : Math.max(bed + (kind === 'manta' ? 7 : 5), Math.min(-8, view.y + rr(-14, 4)));
      const hy = o.yaw != null ? o.yaw : gy != null ? gy : awayYaw(), sx = Math.sin(hy), sz = Math.cos(hy), v = kind === 'manta' ? Math.max(rr(2.6, 3.4), view.speed * .85) : rr(1.4, 2), dur = 32;
      const x0 = P.x - sx * 4, z0 = P.z - sz * 4;
      if (!o.force && (!path(x0, z0, x0 + sx * v * dur, z0 + sz * v * dur, 8, deep(y - 5)) || !sight(P.x, y, P.z))) continue;
      const n = kind === 'manta' ? 1 + (rnd() * 3 | 0) : 1 + (rnd() < .35 ? 1 : 0);
      Object.assign(sc, { on: true, kind, t: 0, x0, y0: y, z0, sx, sz, yaw: hy, v, n, dur });
      for (let i = 0; i < n; i++) {
        const m = sc.mem[i];
        m.ox = i ? gauss() * 7 : 0; m.oy = i ? gauss() * 2.5 : 0; m.oz = i ? -rr(4, 10) * i : 0;
        m.ph = rnd() * TAU; m.L = kind === 'manta' ? rr(7.5, 10) : rr(3, 3.6); m.k = rnd() * TAU;
      }
      return true;
    }
    return false;
  }

  // ---------- 水母（夜里、水下） ----------
  const JCOL = [[.35, .9, 1], [1, .5, .85], [.65, .55, 1], [.45, 1, .75]];
  function spawnJelly(o = {}) {
    const j = free(jellies); if (!j) return false;
    for (let k = 0; k < 6; k++) {
      aim(o, 18, 55, view.cone * 1.2, view.speed * 1.2);
      const bed = seabedY(P.x, P.z), y = o.y != null ? o.y : Math.min(-3, Math.max(bed + 4, view.y + rr(-12, 8)));
      if (!o.force && (bed > y - 3 || !sight(P.x, y, P.z))) continue;
      const c = JCOL[rnd() * JCOL.length | 0];
      Object.assign(j, { on: true, t: 0, life: rr(30, 55), x: P.x, y, z: P.z, vx: rr(-.3, .3), vy: rr(.05, .3), vz: rr(-.3, .3), ph: rnd() * TAU, hz: rr(.35, .6), H: rr(2, 3.2), r: c[0], g: c[1], b: c[2] });
      return true;
    }
    return false;
  }

  // 怕龙：镜头靠近到 R 米内就往画面外侧、往下躲开（远景生物不会糊到镜头上、不挡龙）。返回这一帧要挪的量（写进 SHY）
  const SHY = { x: 0, y: 0, z: 0 };
  function shy(x, y, z, R, dt, c) {
    SHY.x = SHY.y = SHY.z = 0;
    const dx = x - c.x, dy = y - c.y, dz = z - c.z, d = Math.hypot(dx, dy, dz);
    if (d >= R) return SHY;
    const k = (1 - d / R), rx = view.fz, rz = -view.fx, lat = dx * rx + dz * rz, sg = lat >= 0 ? 1 : -1;
    SHY.x = rx * sg * 16 * k * dt; SHY.z = rz * sg * 16 * k * dt; SHY.y = -4 * k * dt;
    return SHY;
  }

  // ---------- 写实例 ----------
  function put(M, x, y, z, yaw, pitch, roll, L, ph, A, b = 0, c = 0, cr = 1, cg = 1, cb = 1) {
    if (M.n >= M.cap) return;
    _e.set(-pitch, yaw, roll); _q.setFromEuler(_e); _p.set(x, y, z); _s.setScalar(L);
    _m.compose(_p, _q, _s); _m.toArray(M.body.instanceMatrix.array, M.n * 16);
    const j = M.n * 4, I = M.iA.array; let p = ph % WRAP; if (p < 0) p += WRAP;
    I[j] = p; I[j + 1] = A; I[j + 2] = b; I[j + 3] = c;
    const C = M.ic.array, k = M.n * 3; C[k] = cr; C[k + 1] = cg; C[k + 2] = cb;
    const d = Math.hypot(x - view.x, y - view.y, z - view.z) - L * .5; if (d < M.near) M.near = d;
    M.n++;
  }
  function flush(M) {
    const n = M.n;
    M.body.count = n; M.body.visible = n > 0;
    if (n) { M.body.instanceMatrix.needsUpdate = true; M.iA.needsUpdate = true; M.ic.needsUpdate = true; }
    if (M.line) { M.line.count = n; M.line.visible = n > 0 && OUTLINE.mode !== 'off' && (OUTLINE.mode !== 'fade' || M.near < OUTLINE.uOF.value.y); }
    M.n = 0; M.near = 1e9;
  }

  // ---------- 导演 ----------
  let evT = 2.5, birdT = rr(10, 18), lastEv = '', lastUnder = false, jellyT = 0, auto = true, off = false;
  const evLog = [];
  const SPAWN = {
    breach: o => spawnWhale('breach', o), surface: o => spawnWhale('surface', o), glide: o => spawnWhale('glide', o),
    dolphins: o => spawnDolphins(o), birds: o => spawnFlock(o), manta: o => spawnSchool('manta', o), turtle: o => spawnSchool('turtle', o), jelly: o => spawnJelly(o),
  };
  const cand = [['', 0], ['', 0], ['', 0], ['', 0]];
  function director(dt) {
    evT -= dt; birdT -= dt;
    const nt = night(), rain = env.rain || 0, dusk = env.dusk || 0;
    const birdK = (1 - .75 * nt) * (1 - .65 * rain) * (1 + .6 * dusk);
    if (view.under !== lastUnder) { lastUnder = view.under; evT = Math.min(evT, 2.5); }
    // 背景鸟群：和导演的事件分开，偶尔从远处飞过（夜里、下雨很少）
    if (birdT <= 0) { birdT = rr(18, 34); if (!view.under && rnd() < birdK) spawnFlock(); }
    if (evT > 0) return;
    const ax = view.x + view.fx * 150, az = view.z + view.fz * 150, zn = zoneAt(ax, az);
    const wz = zn === 'open' ? 1 : zn === 'green' ? .3 : .08;
    let n = 0;
    const add = (name, w) => { if (w > 0) { cand[n][0] = name; cand[n][1] = w * (name === lastEv ? .3 : 1); n++; } };
    if (view.under) { add('glide', .9 * wz + .1); add('manta', .9); add('turtle', .55); add('dolphins', view.depth < 22 ? .45 : 0); }
    else { add('breach', 1.1 * wz); add('surface', .8 * wz); add('dolphins', (zn === 'volcano' ? .45 : 1) * (view.high ? .6 : 1)); add('birds', .8 * birdK * (view.high ? 1.3 : 1)); }
    // 按权重挑；挑中的放不下（岛挡着 / 水太浅）就按权重顺序试别的
    for (let tries = 0; tries < n; tries++) {
      let sum = 0; for (let i = 0; i < n; i++) sum += cand[i][1];
      if (sum <= 0) break;
      let r = rnd() * sum, pick = 0; for (let i = 0; i < n; i++) { r -= cand[i][1]; if (r <= 0) { pick = i; break; } }
      const name = cand[pick][0];
      if (SPAWN[name]()) { lastEv = name; evLog.push([+(T0).toFixed(1), name]); if (evLog.length > 30) evLog.shift(); evT = rr(12, 25); return; }
      cand[pick][1] = 0;
    }
    evT = 1.5;
  }

  // ---------- 每帧 ----------
  const api = {
    update(S, camera, dt, T, envIn) {
      env = envIn || ENV0; T0 = T; dt = Math.min(dt, .1);
      const c = camera.position;
      camera.getWorldDirection(_f);
      const hl = Math.hypot(_f.x, _f.z) || 1;
      view.x = c.x; view.y = c.y; view.z = c.z; view.fx = _f.x / hl; view.fz = _f.z / hl; view.yaw = Math.atan2(_f.x, _f.z);
      view.wt = S && typeof S.t === 'number' ? S.t : T;
      const surf = waveH(c.x, c.z, view.wt);
      view.under = (env.under || 0) > .5 || c.y < surf; view.depth = Math.max(0, surf - c.y);
      view.speed = S && S.hero ? Math.min(30, S.hero.speed || 0) : 0;
      view.kind = S ? S.kind : '';
      view.high = c.y > 30;
      // 竖屏的横向视野只有 ±19° 左右：锥取 ±35° 和 0.8 倍横向半视角里小的那个（不然一半放在画面外）
      view.cone = Math.min(CONE, Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * .8);
      api.env = env;
      if (off) { for (const M of MESHES) flush(M); jmesh.visible = false; WP.pts.visible = GP.pts.visible = false; return; }
      if (auto) director(dt);

      // 粒子尺寸（和 particles.js 同一个算法）、雾的远处
      renderer.getDrawingBufferSize(_v2);
      const sc = _v2.y * .5 / Math.tan(camera.fov * Math.PI / 360);
      WP.U.uScale.value = GP.U.uScale.value = sc;
      const fog = scene.fog, far = view.under && fog && fog.far ? fog.far : 1e5;
      GP.U.uFar.value = view.under ? Math.max(60, far) : 1e5;
      { const n = night(); WP.U.uDim.value.setRGB(1 - .62 * n, 1 - .5 * n, 1 - .28 * n); }   // 夜里水花是月光下的蓝灰色（不是一团白）
      jU.uFar.value = fog && fog.far ? Math.max(60, Math.min(fog.far, 160)) : 120;

      // 鲸
      for (const w of whales) {
        if (!w.on) continue;
        const dx = w.x - c.x, dz = w.z - c.z, far2 = dx * dx + dz * dz;
        if (!updWhale(w, dt) || far2 > 650 * 650 || (w.mode === 'glide' && !view.under && far2 > 200 * 200)) { w.on = false; continue; }
        if (w.y > -w.L * .7 || view.under) drawWhale(w, dt);
      }
      // 海豚
      for (const p of pods) {
        if (!p.on) continue;
        if (view.under) { const q = shy(p.x0 + p.sx * p.v * p.t, p.dep - 2, p.z0 + p.sz * p.v * p.t, 26, dt, c); p.x0 += q.x; p.z0 += q.z; }
        if (!updPod(p, dt)) { p.on = false; continue; }
        const dx = p.x0 + p.sx * p.v * p.t - c.x, dz = p.z0 + p.sz * p.v * p.t - c.z;
        if (dx * dx + dz * dz > 450 * 450 || (p.dep < -1.5 && !view.under)) { p.on = false; continue; }
        // 远处画大一点（和猎物一样的办法）：70 米内不变，240 米外大 70%，高处往下看也认得出
        const big = 1 + .7 * sstep(70, 240, Math.hypot(dx, dz, c.y));
        for (let i = 0; i < p.n; i++) { const m = p.mem[i]; if (m.y > -6 + p.dep) put(MD, m.x, m.y * big, m.z, p.yaw, m.pitch, 0, m.L * big, m.ph, m.amp); }
      }
      // 鸟群
      for (const fl of flocks) {
        if (!fl.on) continue;
        fl.t += dt;
        const cx = fl.x0 + fl.sx * fl.v * fl.t, cz = fl.z0 + fl.sz * fl.v * fl.t, rx = fl.sz, rz = -fl.sx;
        const dx = cx - c.x, dz = cz - c.z;
        if (fl.t > fl.dur || dx * dx + dz * dz > 700 * 700) { fl.on = false; continue; }
        const fade = Math.min(1, fl.t / 1.5, (fl.dur - fl.t) / 1.5);   // 进出都是慢慢变大变小（远处，看不出）
        const tint = fl.dark ? .3 : 1, tb = fl.dark ? .36 : 1;
        for (let i = 0; i < fl.n; i++) {
          const m = fl.mem[i], wob = fl.style === 'v' ? .5 : 2.2;
          const ox = m.ox + Math.sin(fl.t * .7 + m.k) * wob, oy = m.oy + Math.sin(fl.t * .9 + m.k * 2) * wob * .4, oz = m.oz + Math.cos(fl.t * .6 + m.k) * wob;
          // 海鸥：扇几下、滑一会儿；深色的雁一直扇
          const glide = fl.dark ? 1 : (Math.sin(fl.t * .55 + m.k) > -.25 ? 1 : .1);
          m.ph += dt * TAU * m.hz * (glide > .5 ? 1 : .3);
          put(MB, cx + rx * ox + fl.sx * oz, fl.y0 + oy, cz + rz * ox + fl.sz * oz, fl.yaw + Math.sin(fl.t * .5 + m.k) * .06, .02, Math.sin(fl.t * .8 + m.k) * .08, fl.span * fade, m.ph, .62 * glide, 0, 0, tint, tint, tb);
        }
      }
      // 魔鬼鱼 / 海龟
      for (const s of schools) {
        if (!s.on) continue;
        s.t += dt;
        const cx = s.x0 + s.sx * s.v * s.t, cz = s.z0 + s.sz * s.v * s.t, rx = s.sz, rz = -s.sx;
        const dx = cx - c.x, dz = cz - c.z;
        if (s.t > s.dur || dx * dx + dz * dz > 160 * 160) { s.on = false; continue; }
        if (!view.under && dx * dx + dz * dz > 90 * 90) continue;
        if (view.under) { const q = shy(cx, s.y0, cz, s.kind === 'manta' ? 34 : 26, dt, c); s.x0 += q.x; s.z0 += q.z; s.y0 = Math.max(s.y0 + q.y, seabedY(cx, cz) + 3); }
        const M = s.kind === 'manta' ? MM : MT, hz = s.kind === 'manta' ? .32 : .4;
        for (let i = 0; i < s.n; i++) {
          const m = s.mem[i]; m.ph += dt * TAU * hz;
          const bob = Math.sin(s.t * .4 + m.k);
          put(M, cx + rx * m.ox + s.sx * m.oz, s.y0 + m.oy + bob * 1.2, cz + rz * m.ox + s.sz * m.oz, s.yaw + Math.sin(s.t * .15 + m.k) * .12, Math.cos(s.t * .4 + m.k) * .08, Math.sin(s.t * .3 + m.k) * .1, m.L, m.ph, s.kind === 'manta' ? .16 : .55, 0, 0, .9, .9, .92);
        }
      }
      // 水母：夜里、镜头在水下时保持一群（最多 18 只，按夜色多少）；别的时候慢慢淡掉
      const nt = night();
      const want = view.under ? Math.round(18 * sstep(.15, .7, nt)) : 0;
      let jn = 0;
      for (const j of jellies) if (j.on) jn++;
      jellyT -= dt;
      if (jn < want && jellyT <= 0) { spawnJelly(); jellyT = .15; }
      let ji = 0;
      for (const j of jellies) {
        if (!j.on) continue;
        j.t += dt;
        j.x += j.vx * dt; j.y += j.vy * dt * (.6 + .4 * Math.sin(j.ph)); j.z += j.vz * dt; j.ph += dt * TAU * j.hz;
        const dx = j.x - c.x, dy = j.y - c.y, dz = j.z - c.z, d2 = dx * dx + dy * dy + dz * dz;
        if (j.t > j.life || d2 > 95 * 95 || j.y > -1.5 || dx * view.fx + dz * view.fz < -8 || (jn > want && j.t > 6 && rnd() < dt * .3)) { j.on = false; jn--; continue; }
        if (!view.under) continue;
        const a = Math.min(1, j.t / 2.5, (j.life - j.t) / 2.5) * (.35 + .65 * nt);
        _e.set(Math.sin(j.ph * .3) * .15, j.ph * .05, Math.cos(j.ph * .25) * .15); _q.setFromEuler(_e); _p.set(j.x, j.y, j.z); _s.setScalar(j.H);
        _m.compose(_p, _q, _s); _m.toArray(jmesh.instanceMatrix.array, ji * 16);
        let p = j.ph % WRAP; jA.array[ji * 4] = p; jA.array[ji * 4 + 1] = a;
        jC.array[ji * 4] = j.r; jC.array[ji * 4 + 1] = j.g; jC.array[ji * 4 + 2] = j.b; jC.array[ji * 4 + 3] = 1;
        // 光晕：伞的中间一团柔光
        GP.emit(j.x, j.y + j.H * .3, j.z, 0, 0, 0, .05, j.H * 2.4, 0, 0, 0, .55 * a, j.r * .6, j.g * .6, j.b * .6);
        ji++;
      }
      jmesh.count = ji; jmesh.visible = ji > 0;
      if (ji) { jmesh.instanceMatrix.needsUpdate = true; jA.needsUpdate = true; jC.needsUpdate = true; }

      // 荧光：夜里水下镜头周围的小光点；水上夜里镜头前方的海面上零星几点
      if (nt > .15) {
        if (view.under) {
          const n = Math.floor(dt * 45 * nt + rnd());
          for (let i = 0; i < n; i++) {
            const d = rr(4, 30), a = view.yaw + rr(-1, 1), y = c.y + rr(-8, 8);
            if (y > surf - .5) continue;
            GP.emit(c.x + Math.sin(a) * d, y, c.z + Math.cos(a) * d, rr(-.2, .2), rr(-.1, .2), rr(-.2, .2), rr(1.2, 2.6), rr(.18, .36), 0, .2, .3, nt, .35, .95, 1);
          }
        } else {
          const n = Math.floor(dt * 30 * nt + rnd());
          for (let i = 0; i < n; i++) {
            const d = rr(15, 110), a = view.yaw + rr(-.6, .6), x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
            if (groundAt(x, z) > -2) continue;
            GP.emit(x, waveH(x, z, view.wt) + .15, z, 0, 0, 0, rr(.8, 1.8), rr(.35, .8) * (1 + d / 80), 0, 0, .4, .8 * nt, .3, .9, 1);
          }
        }
      }

      for (const M of MESHES) flush(M);
      WP.update(dt); GP.update(dt);
      if (view.under) WP.pts.visible = false;   // 水花都在海面上：水下看不到（不然会透过远处的海面漏出来）
    },
    // ---- 调试 ----
    spawn(type, o = {}) { const f = SPAWN[type]; return f ? f(o) : false; },
    clear() { for (const a of [whales, pods, flocks, schools, jellies]) for (const o of a) o.on = false; WP.clear(); GP.clear(); },
    set auto(v) { auto = !!v; }, get auto() { return auto; },
    set off(v) { off = !!v; }, get off() { return off; },
    set next(v) { evT = v; },
    // 调试：正在演的鲸 / 海豚群的位置（世界坐标）
    where() { return { whales: whales.filter(w => w.on).map(w => [w.x, w.y, w.z]), pods: pods.filter(p => p.on).map(p => [p.x0 + p.sx * p.v * p.t, 0, p.z0 + p.sz * p.v * p.t]) }; },
    stats() {
      const cnt = a => a.filter(o => o.on).length;
      return { whales: whales.filter(w => w.on).map(w => w.mode), pods: cnt(pods), flocks: cnt(flocks), schools: schools.filter(s => s.on).map(s => s.kind), jellies: cnt(jellies), splash: WP.n, glow: GP.n, next: +evT.toFixed(1), log: evLog.slice(-8), under: view.under };
    },
    env: ENV0,
  };
  if (typeof window !== 'undefined') window.__amb = api;
  return api;
}
