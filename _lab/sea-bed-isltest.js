// 自动生成的试验副本（_lab/islands_seabed_make.py）：海底地形改用 world.js 的 seabedBase（不含岛面）。别手改。
// 海底：镜头周围 240×240 米的地形（6×6 块、每块 40 米，环形缓冲：镜头走过一块只重建新进来的那一排；水下的雾 120 米就满了）
// 颜色按区域：翠岛海沙地 + 海藻林、火山海黑石 + 微弱的暖色热泉、外海蓝灰深沟。焦散按 _lab/shade.js 的 patch() 做法。
// 只有镜头在水下（或很低，提前建好）时才更新 / 显示。
import * as THREE from 'three';
import { seabedY, zoneAt, groundAt, seabedBase } from '../src/sim/world.js';
import { GRAD as GRAD0, outlineMat as outline0, toonMat as toon0 } from '../src/view/toon.js';

const CH = 40, CELL = 5, NC = CH / CELL, NK = 6, VPC = (NC + 1) ** 2, NSLOT = NK * NK;
const KELP_MAX = 170, ROCK_MAX = 120, VENT_MAX = 24, CORAL_MAX = 60;
const mod = (a, n) => ((a % n) + n) % n;
const hash = (i, j, s) => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
};
const C = h => new THREE.Color(h);
const PAL = {
  green: [C(0xdccb9c), C(0xcdb98a)], greenGrass: C(0x93a86c),
  volcano: [C(0x52474b), C(0x5f5357)], volcanoWarm: C(0x74442f),
  open: [C(0x60788e), C(0x52687e)], rock: C(0x6c6a64),
};
const ROCK_C = { green: C(0x8a8478), volcano: C(0x473d41), open: C(0x4c5868) };

// 远处（82–100 米）强制融进雾色：海底只建到镜头前 100 米左右；入水那 0.25 秒雾还没收拢时，也看不到这块海底的边
const FAR_FADE = `#include <fog_fragment>
#ifdef USE_FOG
 gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(82.0, 100.0, vFogDepth));
#endif`;
function farFade(mat, key) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => { if (prev) prev.call(mat, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', FAR_FADE); };
  mat.customProgramCacheKey = () => 'far:' + key;
  return mat;
}
const BED_PARS = `uniform float uT; uniform vec3 uTint; varying float vGlow; varying vec3 vWP;
float causF(vec2 p, float t){
  p *= 0.16;
  float a = sin(p.x * 1.7 + t * 0.9 + sin(p.y * 2.3 + t * 0.7) * 1.3);
  float b = sin(p.y * 1.9 - t * 0.8 + sin(p.x * 1.4 - t * 0.6) * 1.3);
  return pow(max(0.0, 1.0 - abs(a + b) * 0.8), 5.0);
}
`;
const BED_MAIN = `
  { float dd = clamp(-vWP.y / 70.0, 0.0, 1.0);
    float cs = smoothstep(0.36, 0.46, causF(vWP.xz, uT)) * 0.7 + smoothstep(0.5, 0.62, causF(vWP.xz * 1.9 + 7.0, uT * 1.3)) * 0.3;   // 卡通焦散：硬边光纹
    vec3 nW = normalize(cross(dFdx(vWP), dFdy(vWP)));
    cs *= smoothstep(0.45, 0.85, abs(nW.y));                        // 光从上面来：陡坡上没有焦散
    gl_FragColor.rgb += vec3(0.6, 0.85, 0.9) * cs * (1.0 - smoothstep(8.0, 75.0, -vWP.y)) * 0.26;   // 越深焦散越淡，深沟里没有
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uTint, 0.15 + dd * 0.35);
    gl_FragColor.rgb += vec3(1.0, 0.42, 0.12) * vGlow * (0.42 + 0.14 * sin(uT * 1.5 + vWP.x * 0.2)); }
`;
// 海藻摆动（本体和描边共用）：每棵按位置定朝向和相位，越往上摆得越大
const KELP_V = `
#ifdef USE_INSTANCING
  vec3 kp = instanceMatrix[3].xyz; float kh = instanceMatrix[1].y;
#else
  vec3 kp = vec3(0.0); float kh = 10.0;
#endif
  float kph = fract(sin(dot(kp.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
  mat2 kr = mat2(cos(kph), -sin(kph), sin(kph), cos(kph));
  transformed.xz = kr * transformed.xz; oN.xz = kr * oN.xz;
  float ky = transformed.y, kw = ky * ky * kh * 0.13;
  transformed.x += (sin(uKT * 0.7 + kph + ky * 2.6) * 0.8 + sin(uKT * 1.3 + kph * 2.0 + ky * 5.0) * 0.25) * kw;
  transformed.z += sin(uKT * 0.55 + kph * 1.3 + ky * 2.0) * 0.55 * kw;
`;

// 海藻：菱形截面的细长叶片，6 节，往上变窄、带一点弯；底色深橄榄 → 叶尖黄绿
function kelpGeo() {
  const SEG = 5, pos = [], col = [], idx = [], ring = [[.5, 0], [0, .13], [-.5, 0], [0, -.13]];
  const c0 = C(0x3a6a2a), c1 = C(0xa6c24c);
  for (let s = 0; s <= SEG; s++) {
    const t = s / SEG, w = (1 - t * .7) * (.8 + .2 * Math.sin(t * 9)), bend = Math.sin(t * 5.5) * .22 * t, c = c0.clone().lerp(c1, t);
    for (const [x, z] of ring) { pos.push(x * w + bend, t, z * w); col.push(c.r, c.g, c.b); }
  }
  pos.push(Math.sin(5.5) * .22, 1.05, 0); col.push(c1.r, c1.g, c1.b);
  const T = (SEG + 1) * 4;
  for (let s = 0; s < SEG; s++) for (let k = 0; k < 4; k++) {
    const a = s * 4 + k, b = s * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  for (let k = 0; k < 4; k++) idx.push(SEG * 4 + k, T, SEG * 4 + (k + 1) % 4);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
// 描边壳要连续：把法线换成「从中心往外」的方向（多面体 / 圆柱的面法线会让壳裂开）
function hullNormals(g, cy = 0, ky = 1) {
  const p = g.attributes.position, n = new Float32Array(p.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), (p.getY(i) - cy) * ky, p.getZ(i)).normalize(); n.set([v.x, v.y, v.z], i * 3); }
  const h = g.clone(); h.setAttribute('normal', new THREE.BufferAttribute(n, 3)); return h;
}

// ---- 石头：一块大石 + 两块小卵石（一次实例画三块，石头的样子多一点，不多绘制）----
function rockCluster() {
  const parts = [[1, 0, 0, 0, 1, .8, 1], [.38, 1.05, -.3, .45, 1, .8, 1.1], [.27, -.95, -.38, -.55, 1.1, .7, .9]];
  const body = [], hull = [];
  parts.forEach(([r, x, y, z, sx, sy, sz], k) => {
    const g = new THREE.IcosahedronGeometry(r, 0), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {   // 按坐标抖一下（同一个点抖得一样，面不裂）
      const j = hash(Math.round(p.getX(i) * 100), Math.round(p.getY(i) * 100), Math.round(p.getZ(i) * 100) + k * 7) - .5;
      p.setXYZ(i, p.getX(i) * sx * (1 + j * .3), p.getY(i) * sy * (1 + j * .25), p.getZ(i) * sz * (1 - j * .2));
    }
    const h = hullNormals(g); g.translate(x, y, z); h.translate(x, y, z);
    body.push(g.index ? g.toNonIndexed() : g); if (k === 0) hull.push(h.index ? h.toNonIndexed() : h);   // 小卵石不描边（省三角面）
  });
  const merge = list => { const pos = [], nor = []; for (const g of list) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); } const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); return o; };
  return [merge(body), merge(hull)];
}
// ---- 珊瑚：两种小丛（鹿角珊瑚 + 脑珊瑚 / 扇子珊瑚 + 管状海绵），顶点色根部暗、梢头亮，实例颜色定色相 ----
function prism(r0, r1, h, sides = 4) {   // 去掉盖子的细棱柱，底在原点、朝 +y
  return new THREE.CylinderGeometry(r1, r0, h, sides, 1, true).translate(0, h / 2, 0);
}
// 按位置合并重合的顶点（描边壳要连续的平滑法线）
function mergeVerts(g) {
  const src = g.index ? g.toNonIndexed() : g, p = src.attributes.position, map = new Map(), pos = [], idx = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
    let v = map.get(k); if (v === undefined) { v = pos.length / 3; map.set(k, v); pos.push(p.getX(i), p.getY(i), p.getZ(i)); } idx.push(v);
  }
  const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setIndex(idx); return o;
}
// 扇子珊瑚：薄薄的一片（正反两面各一圈三角形，中间微微鼓起），边缘有起伏；底在原点，朝 +y，半径 r
function fanGeo(r, seed) {
  const pos = [0, r * .55, r * .05, 0, r * .55, -r * .05], idx = [], M = 11;
  for (let i = 0; i <= M; i++) {
    const a = -.25 + i / M * (Math.PI + .5), rr = r * (.86 + .14 * hash(i, seed, 5));
    pos.push(Math.cos(a) * rr, r * .55 + Math.sin(a) * rr * .9, 0);
  }
  pos.push(0, 0, 0);                    // 底下的柄
  for (let i = 0; i < M + 2; i++) { const a = 2 + i, b = i === M + 1 ? 2 : 3 + i; idx.push(0, a, b, 1, b, a); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  return g;
}
function coralGeo(kind) {
  const rnd = i => hash(i, kind * 31 + 5, 77);
  const parts = [];
  // 歪一点再挪过去；顶点色按高度从 c0 到 c1（radial：按离中心的距离，扇子边上亮）；noHull：不描边（管口的暗圈）
  const put = (g, ax, az, x, y, z, c0, c1, { radial = 0, noHull = false } = {}) => {
    if (g.attributes.uv) g.deleteAttribute('uv');
    const pre = g.index ? g.toNonIndexed() : g, p = pre.attributes.position, col = [];
    pre.computeBoundingBox(); const y0 = pre.boundingBox.min.y, y1 = pre.boundingBox.max.y;
    for (let i = 0; i < p.count; i++) {
      const t = radial ? Math.min(1, Math.hypot(p.getX(i), p.getY(i) - radial) / radial) : (p.getY(i) - y0) / Math.max(1e-3, y1 - y0);
      const v = c0 + (c1 - c0) * t; col.push(v, v, v);
    }
    pre.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    pre.rotateX(ax); pre.rotateZ(az); pre.translate(x, y, z);
    pre.userData.noHull = noHull; parts.push(pre);
  };
  if (kind === 0) {
    for (let i = 0; i < 5; i++) {      // 鹿角：5 根主枝往外歪，隔一根分个叉
      const a = i / 5 * 6.28 + rnd(i) * .8, tilt = .35 + rnd(i + 9) * .4, h = .9 + rnd(i + 20) * .7;
      put(prism(.13, .05, h, 4), Math.sin(a) * tilt, -Math.cos(a) * tilt, Math.cos(a) * .15, 0, Math.sin(a) * .15, .55, 1);
      if (i % 2 === 0) put(prism(.07, .03, h * .5, 4), Math.sin(a + 1) * (tilt + .5), -Math.cos(a + 1) * (tilt + .5), Math.cos(a) * h * .3, h * .5, Math.sin(a) * h * .3, .8, 1);
    }
    put(new THREE.IcosahedronGeometry(.42, 0).scale(1, .6, 1), 0, 0, .55, .12, -.45, .7, 1);   // 旁边一块脑珊瑚
  } else {
    for (let i = 0; i < 2; i++)        // 两片扇子：薄薄的圆片，根部暗、边上亮
      put(fanGeo(.7, i + 1), (rnd(i) - .5) * .4, (rnd(i + 3) - .5) * .5 + (i ? .5 : -.4), i ? .3 : -.25, 0, i ? -.2 : .15, .5, 1.05, { radial: .7 * .55 });
    for (let i = 0; i < 3; i++) {      // 三根管子：开口朝上，管口里面是暗的
      const a = i * 2.1 + .5, h = .5 + rnd(i + 7) * .6, ax = (rnd(i + 11) - .5) * .3, az = (rnd(i + 13) - .5) * .3, x = Math.cos(a) * .55, z = Math.sin(a) * .55;
      put(new THREE.CylinderGeometry(.15, .17, h, 6, 1, true).translate(0, h / 2, 0), ax, az, x, 0, z, .62, .98);
      put(new THREE.CylinderGeometry(.12, .12, .02, 6, 1, false).translate(0, h - .05, 0), ax, az, x, 0, z, .18, .18, { noHull: true });
    }
  }
  const pos = [], col = [], hp = [], hn = [];
  for (const g of parts) {
    pos.push(...g.attributes.position.array); col.push(...g.attributes.color.array);
    if (g.userData.noHull) continue;
    const m = mergeVerts(g); m.computeVertexNormals(); const n = m.toNonIndexed();
    hp.push(...n.attributes.position.array); hn.push(...n.attributes.normal.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeVertexNormals();
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3)); hull.setAttribute('normal', new THREE.Float32BufferAttribute(hn, 3));
  return [out, hull];
}
const CORAL_C = { green: [C(0xff7a66), C(0xffa040), C(0xb47cf0), C(0xffd050), C(0xff6aa0)], volcano: [C(0xe0452e), C(0xf07a22), C(0x9a4ad8)] };

export function createSeabed(ctx) {
  const GRAD = ctx.GRAD || GRAD0, outlineMat = ctx.outlineMat || outline0;
  const toonMat0 = ctx.toonMat || toon0;
  const toonMat = ({ flatShading, ...o }) => { const m = toonMat0(o); if (flatShading) m.flatShading = true; m.gradientMap = GRAD; return m; };
  const group = new THREE.Group(); group.name = 'seabed'; group.visible = false;
  const uT = { value: 0 }, uTint = { value: new THREE.Color(0x0e5a6e) };

  // ---- 地形：一个大几何体，64 个块槽，每槽 9×9 个点 ----
  const NV = NSLOT * VPC;
  const posA = new THREE.BufferAttribute(new Float32Array(NV * 3), 3), colA = new THREE.BufferAttribute(new Float32Array(NV * 3), 3), glowA = new THREE.BufferAttribute(new Float32Array(NV), 1);
  for (const a of [posA, colA, glowA]) a.setUsage(THREE.DynamicDrawUsage);
  const idx = new Uint16Array(NSLOT * NC * NC * 6);
  let q = 0;
  for (let s = 0; s < NSLOT; s++) for (let j = 0; j < NC; j++) for (let i = 0; i < NC; i++) {
    const a = s * VPC + j * (NC + 1) + i, b = a + 1, c = a + NC + 1, d = c + 1;
    idx.set([a, c, b, c, d, b], q); q += 6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', posA); geo.setAttribute('color', colA); geo.setAttribute('aGlow', glowA); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const bedMat = toonMat({ vertexColors: true, flatShading: true });
  bedMat.onBeforeCompile = sh => {
    sh.uniforms.uT = uT; sh.uniforms.uTint = uTint;
    sh.vertexShader = 'attribute float aGlow; varying float vGlow; varying vec3 vWP;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vGlow = aGlow;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = BED_PARS + sh.fragmentShader.replace('#include <tonemapping_fragment>', BED_MAIN + '\n#include <tonemapping_fragment>');
  };
  farFade(bedMat, 'seabed');
  const bed = new THREE.Mesh(geo, bedMat); bed.frustumCulled = false; bed.name = 'seabedTerrain'; group.add(bed);

  // ---- 海藻 / 石头 / 热泉烟囱：实例化，本体 + 描边各一次绘制 ----
  const uKT = { value: 0 };
  const kelpMat = toonMat({ vertexColors: true, flatShading: true });
  kelpMat.onBeforeCompile = sh => {
    sh.uniforms.uKT = uKT;
    sh.vertexShader = 'uniform float uKT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vec3 oN = vec3(0.0);\n' + KELP_V);
  };
  farFade(kelpMat, 'kelp');
  const kelpHull = outlineMat(0x0b2a2c, .07, { extraPars: 'uniform float uKT;', extraVertex: KELP_V, key: 'kelp' });
  kelpHull.userData.extraUniforms = { uKT };
  const inst = (g, mat, hullG, hullMat, max, name = '') => {
    const m = new THREE.InstancedMesh(g, mat, max), h = new THREE.InstancedMesh(hullG, hullMat, max);
    m.name = name; h.name = name + 'Hull';
    h.instanceMatrix = m.instanceMatrix; m.count = h.count = 0;
    m.frustumCulled = h.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const w = new THREE.Color(1, 1, 1); for (let i = 0; i < max; i++) m.setColorAt(i, w);
    group.add(m, h); return [m, h];
  };
  const kg = kelpGeo();
  const [kelp, kelpH] = inst(kg, kelpMat, kg, kelpHull, KELP_MAX, 'kelp');
  const [rg, rgH] = rockCluster();
  const [rock, rockH] = inst(rg, farFade(toonMat({ flatShading: true, color: 0xffffff }), 'rock'), rgH, outlineMat(0x101c24, .07, { key: 'rock' }), ROCK_MAX, 'rock');
  const corals = [0, 1].map(k => { const [g, h] = coralGeo(k); return inst(g, farFade(toonMat({ vertexColors: true, flatShading: true }), 'coral' + k), h, outlineMat(0x2a1420, .045, { key: 'coral' + k }), CORAL_MAX, 'coral' + k); });
    const cg = new THREE.CylinderGeometry(.45, 1.5, 1, 7, 1, true).translate(0, .5, 0);
  const [vent, ventH] = inst(cg, farFade(toonMat({ flatShading: true, color: 0x2a2226 }), 'vent'), hullNormals(cg, .5, .3), outlineMat(0x120a0a, .08, { key: 'vent' }), VENT_MAX, 'vent');
    const capMat = new THREE.MeshBasicMaterial({ color: 0xff7a30, fog: true });
  const cap = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 5), capMat, VENT_MAX); cap.count = 0; cap.frustumCulled = false; group.add(cap);

  // ---- 块的生成（确定性：同一块每次建出来都一样）----
  const slots = new Array(NSLOT).fill(null);
  const H = new Float32Array(VPC);
  const ventCache = new Map();
  function ventOf(ci, cj) {   // 每块最多一个热泉（只在火山海）
    const key = ci + ',' + cj;
    if (ventCache.has(key)) return ventCache.get(key);
    if (ventCache.size > 4000) ventCache.clear();
    let v = null;
    if (hash(ci, cj, 7) < .3) {
      const x = ci * CH + 8 + hash(ci, cj, 8) * 24, z = cj * CH + 8 + hash(ci, cj, 9) * 24;
      if (zoneAt(x, z) === 'volcano') { const y = seabedY(x, z); if (y < -22) v = { x, y, z, h: 2.5 + hash(ci, cj, 10) * 3 }; }
    }
    ventCache.set(key, v); return v;
  }
  const _c = new THREE.Color();
  function buildChunk(slot, ci, cj) {
    const x0 = ci * CH, z0 = cj * CH, base = slot * VPC;
    // 岛的水下坡由 islands.js 自己画：这里在岛坡上把海底往下让 3 米，两层不打架（台阶藏在岛坡下面）
    for (let j = 0; j <= NC; j++) for (let i = 0; i <= NC; i++) {
      const x = x0 + i * CELL, z = z0 + j * CELL, y = seabedY(x, z), g = groundAt(x, z);
      H[j * (NC + 1) + i] = Math.min(seabedBase(x, z), -2.5); void g;
    }
    const vents = [];
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const v = ventOf(ci + a, cj + b); if (v) vents.push(v); }
    const P = posA.array, Cc = colA.array, G = glowA.array;
    for (let j = 0; j <= NC; j++) for (let i = 0; i <= NC; i++) {
      const v = j * (NC + 1) + i, x = x0 + i * CELL, z = z0 + j * CELL, y = H[v], o = (base + v) * 3;
      const hx = H[j * (NC + 1) + Math.min(i + 1, NC)] - H[j * (NC + 1) + Math.max(i - 1, 0)];
      const hz = H[Math.min(j + 1, NC) * (NC + 1) + i] - H[Math.max(j - 1, 0) * (NC + 1) + i];
      const slope = Math.hypot(hx, hz) / (CELL * 2);
      const zn = zoneAt(x, z), pal = PAL[zn], r = hash(Math.round(x), Math.round(z), 3);
      _c.copy(pal[0]).lerp(pal[1], r);
      if (zn === 'green' && Math.sin(x * .05 + Math.sin(z * .04) * 2) * Math.sin(z * .06 + 1) > .45) _c.lerp(PAL.greenGrass, .55);
      let glow = 0;
      for (const vt of vents) { const d = Math.hypot(vt.x - x, vt.z - z); if (d < 16) glow = Math.max(glow, (1 - d / 16) ** 2); }
      if (glow > 0) _c.lerp(PAL.volcanoWarm, glow * .8);
      if (slope > .55) _c.lerp(zn === 'green' ? PAL.rock : pal[1].clone().multiplyScalar(.8), Math.min(1, (slope - .55) * 2));
      P[o] = x; P[o + 1] = y; P[o + 2] = z; Cc[o] = _c.r; Cc[o + 1] = _c.g; Cc[o + 2] = _c.b; G[base + v] = glow * .6;
    }
    for (const a of [posA, colA]) a.addUpdateRange(base * 3, VPC * 3);
    glowA.addUpdateRange(base, VPC);
    // 石头
    const zc = zoneAt(x0 + CH / 2, z0 + CH / 2), rocks = [], kelps = [];
    const nr = zc === 'green' ? Math.floor(hash(ci, cj, 11) * 2.4) : 2 + Math.floor(hash(ci, cj, 11) * 3);
    for (let k = 0; k < nr; k++) {
      const x = x0 + 3 + hash(ci, cj, 20 + k) * (CH - 6), z = z0 + 3 + hash(ci, cj, 40 + k) * (CH - 6), y = seabedY(x, z);
      if (y > -4) continue;
      const s = (.8 + hash(ci, cj, 60 + k) ** 2 * 3.2) * (zc === 'open' ? 1.6 : 1);
      rocks.push({ x, y: y - s * .25, z, s, sy: s * (.5 + hash(ci, cj, 70 + k) * .5), a: hash(ci, cj, 80 + k) * 6.28, b: hash(ci, cj, 90 + k) * 6.28, c: ROCK_C[zoneAt(x, z)] });
    }
    // 海藻：翠岛海、水深 14 以上的地方，成片长（低频噪声定疏密）
    const dens = .5 + .5 * Math.sin(x0 * .0123 + 1.1) * Math.sin(z0 * .0097 + .4);
    const ncl = Math.floor(dens * 2.6 + hash(ci, cj, 12) * 1.2);
    for (let k = 0; k < ncl; k++) {
      const cx = x0 + 4 + hash(ci, cj, 100 + k) * (CH - 8), cz = z0 + 4 + hash(ci, cj, 120 + k) * (CH - 8);
      if (zoneAt(cx, cz) !== 'green') continue;
      const nb = 3 + Math.floor(hash(ci, cj, 140 + k) * 5);
      for (let m = 0; m < nb; m++) {
        const a = hash(ci, cj, 200 + k * 16 + m) * 6.28, d = hash(ci, cj, 300 + k * 16 + m) * 4.5;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, y = seabedY(x, z);
        if (y > -14) continue;
        const h = Math.min(7 + hash(ci, cj, 400 + k * 16 + m) * 14, -4 - y);
        if (h < 4) continue;
        kelps.push({ x, y: y - .3, z, h, s: .8 + hash(ci, cj, 500 + k * 16 + m) * .7, t: hash(ci, cj, 600 + k * 16 + m) });
      }
    }
    // 珊瑚：翠岛海和火山海、水深 6~42 米的地方，一块里 0~2 丛
    const cors = [];
    const nc = zc === 'open' ? 0 : Math.floor(hash(ci, cj, 13) * (zc === 'green' ? 3.2 : 1.8));
    for (let k = 0; k < nc; k++) {
      const x = x0 + 3 + hash(ci, cj, 700 + k) * (CH - 6), z = z0 + 3 + hash(ci, cj, 720 + k) * (CH - 6), y = seabedY(x, z), zn = zoneAt(x, z);
      if (y > -6 || y < -42 || zn === 'open') continue;
      const pal = CORAL_C[zn], sc = 1.5 + hash(ci, cj, 740 + k) * 1.6;
      cors.push({ x, y: y - .15, z, s: sc, a: hash(ci, cj, 760 + k) * 6.28, v: hash(ci, cj, 780 + k) < .55 ? 0 : 1, c: pal[Math.floor(hash(ci, cj, 800 + k) * pal.length)] });
    }
    const vt = ventOf(ci, cj);
    slots[slot] = { ci, cj, rocks, kelps, corals: cors, vent: vt };
  }

  // ---- 实例：按离镜头的距离挑（海藻描边只画最近的一批，省三角面）----
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const KC0 = C(0xffffff), KC1 = C(0xd8e8a0), _kc = new THREE.Color();
  const list = [];
  let instAt = null;
  function rebuildInst(cam) {
    instAt = { x: cam.x, z: cam.z };
    const near = (o, r) => { const d = (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2; return d < r * r ? d : -1; };
    list.length = 0;
    for (const s of slots) if (s) for (const k of s.kelps) { const d = near(k, 92); if (d >= 0) list.push([d, k]); }
    list.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, k] of list) {
      if (n >= KELP_MAX) break;
      _m.compose(_p.set(k.x, k.y, k.z), _q.identity(), _s.set(k.s, k.h, k.s)); kelp.setMatrixAt(n, _m);
      kelp.setColorAt(n, _kc.copy(KC0).lerp(KC1, k.t)); n++;
    }
    kelp.count = n; kelpH.count = Math.min(n, 40);   // 描边只给最近的 40 棵
    n = 0;
    for (const s of slots) if (s) for (const r of s.rocks) {
      if (n >= ROCK_MAX || near(r, 110) < 0) continue;
      _q.setFromEuler(_e.set(r.a, r.b, r.a * .5));
      _m.compose(_p.set(r.x, r.y, r.z), _q, _s.set(r.s, r.sy, r.s * .85)); rock.setMatrixAt(n, _m); rock.setColorAt(n, r.c); n++;
    }
    rock.count = rockH.count = n;
    for (let v = 0; v < 2; v++) {   // 珊瑚按远近排好，描边只给 45 米以内的
      const [cm, ch] = corals[v]; n = 0; list.length = 0;
      for (const s of slots) if (s) for (const c of s.corals) { const d = c.v === v ? near(c, 100) : -1; if (d >= 0) list.push([d, c]); }
      list.sort((a, b) => a[0] - b[0]);
      let nh = 0;
      for (const [d, c] of list) {
        if (n >= CORAL_MAX) break;
        _q.setFromEuler(_e.set(0, c.a, 0));
        _m.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.s, c.s, c.s)); cm.setMatrixAt(n, _m); cm.setColorAt(n, c.c); n++;
        if (d < 45 * 45) nh = n;
      }
      cm.count = n; ch.count = nh; cm.instanceMatrix.needsUpdate = true; if (cm.instanceColor) cm.instanceColor.needsUpdate = true;
    }
    n = 0;
    for (const s of slots) if (s && s.vent && n < VENT_MAX) {
      const v = s.vent;
      _m.compose(_p.set(v.x, v.y - .4, v.z), _q.identity(), _s.set(1.2, v.h, 1.2)); vent.setMatrixAt(n, _m);
      _m.compose(_p.set(v.x, v.y - .4 + v.h, v.z), _q.identity(), _s.set(.55, .3, .55)); cap.setMatrixAt(n, _m); n++;
    }
    vent.count = ventH.count = cap.count = n;
    for (const m of [kelp, rock, vent, cap]) m.instanceMatrix.needsUpdate = true;
    for (const m of [kelp, rock]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  let built = 0;
  const todo = [];
  return {
    group,
    get ready() { return built >= NSLOT; },
    setQuality(q) { kelpH.visible = rockH.visible = ventH.visible = corals[0][1].visible = corals[1][1].visible = q >= 1; },
    update(S, cam, wt, k, under, uwC, dt) {
      uT.value = wt; uKT.value = wt; uTint.value.copy(uwC);
      capMat.color.setRGB(1, .45 + .08 * Math.sin(wt * 1.5), .18);
      const vis = under || k > 0;
      group.visible = vis;
      if (!vis && cam.y > 30) return;               // 高空不管海底；低空先建好，扎水时不卡
      const i0 = Math.round(cam.x / CH) - NK / 2, j0 = Math.round(cam.z / CH) - NK / 2;
      todo.length = 0;
      for (let a = 0; a < NK; a++) for (let b = 0; b < NK; b++) {
        const ci = i0 + a, cj = j0 + b, slot = mod(ci, NK) + mod(cj, NK) * NK, s = slots[slot];
        if (!s || s.ci !== ci || s.cj !== cj) todo.push([(a - NK / 2 + .5) ** 2 + (b - NK / 2 + .5) ** 2, slot, ci, cj]);
      }
      if (todo.length) {
        todo.sort((a, b) => a[0] - b[0]);
        const n = vis && (todo.length > 16 || built < NSLOT) ? todo.length : vis ? 4 : 8;   // 平时每帧最多建 4 块（约 0.5 毫秒）；低空预建每帧 8 块
        for (let i = 0; i < Math.min(n, todo.length); i++) { const [, slot, ci, cj] = todo[i]; if (!slots[slot]) built++; buildChunk(slot, ci, cj); }
        posA.needsUpdate = colA.needsUpdate = glowA.needsUpdate = true;
        rebuildInst(cam);
      } else if (!instAt || Math.hypot(cam.x - instAt.x, cam.z - instAt.z) > 15) rebuildInst(cam);
    },
    dispose() {
      for (const o of group.children) { o.geometry.dispose(); o.material.dispose(); }
      group.removeFromParent();
    },
  };
}
