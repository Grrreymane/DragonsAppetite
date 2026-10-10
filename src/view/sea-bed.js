// 海底：镜头周围 320×320 米的地形（8×8 块、每块 40 米，环形缓冲：镜头走过一块只重建新进来的那一排）
// 颜色按区域：翠岛海沙地 + 海藻林、火山海黑石 + 微弱的暖色热泉、外海蓝灰深沟。焦散按 _lab/shade.js 的 patch() 做法。
// 只有镜头在水下（或很低，提前建好）时才更新 / 显示。
import * as THREE from 'three';
import { seabedY, zoneAt, groundAt } from '../sim/world.js';
import { GRAD as GRAD0, outlineMat as outline0, toonMat as toon0 } from './toon.js';

const CH = 40, CELL = 5, NC = CH / CELL, NK = 8, VPC = (NC + 1) ** 2, NSLOT = NK * NK;
const KELP_MAX = 240, ROCK_MAX = 160, VENT_MAX = 24;
const mod = (a, n) => ((a % n) + n) % n;
const hash = (i, j, s) => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
};
const C = h => new THREE.Color(h);
const PAL = {
  green: [C(0xd8c28c), C(0xc4ae7a)], greenGrass: C(0x8a9a58),
  volcano: [C(0x3c3438), C(0x4a3f44)], volcanoWarm: C(0x6a3a26),
  open: [C(0x60788e), C(0x52687e)], rock: C(0x6c6a64),
};
const ROCK_C = { green: C(0x8a8478), volcano: C(0x2e282c), open: C(0x5a6676) };

// 远处（105–150 米）强制融进雾色：入水那 0.25 秒雾还没收拢时，也看不到这块海底的边
const FAR_FADE = `#include <fog_fragment>
#ifdef USE_FOG
 gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(105.0, 150.0, vFogDepth));
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
  const inst = (g, mat, hullG, hullMat, max) => {
    const m = new THREE.InstancedMesh(g, mat, max), h = new THREE.InstancedMesh(hullG, hullMat, max);
    h.instanceMatrix = m.instanceMatrix; m.count = h.count = 0;
    m.frustumCulled = h.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const w = new THREE.Color(1, 1, 1); for (let i = 0; i < max; i++) m.setColorAt(i, w);
    group.add(m, h); return [m, h];
  };
  const kg = kelpGeo();
  const [kelp, kelpH] = inst(kg, kelpMat, kg, kelpHull, KELP_MAX);
  const rg = new THREE.IcosahedronGeometry(1, 0);
  const [rock, rockH] = inst(rg, farFade(toonMat({ flatShading: true, color: 0xffffff }), 'rock'), hullNormals(rg), outlineMat(0x101c24, .07, { key: 'rock' }), ROCK_MAX);
    const cg = new THREE.CylinderGeometry(.45, 1.5, 1, 7, 1, true).translate(0, .5, 0);
  const [vent, ventH] = inst(cg, farFade(toonMat({ flatShading: true, color: 0x2a2226 }), 'vent'), hullNormals(cg, .5, .3), outlineMat(0x120a0a, .08, { key: 'vent' }), VENT_MAX);
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
      H[j * (NC + 1) + i] = Math.min(g > -900 && g >= y - .01 ? y - 3 : y, -2.5);
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
    const vt = ventOf(ci, cj);
    slots[slot] = { ci, cj, rocks, kelps, vent: vt };
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
    for (const s of slots) if (s) for (const k of s.kelps) { const d = near(k, 125); if (d >= 0) list.push([d, k]); }
    list.sort((a, b) => a[0] - b[0]);
    let n = 0;
    for (const [, k] of list) {
      if (n >= KELP_MAX) break;
      _m.compose(_p.set(k.x, k.y, k.z), _q.identity(), _s.set(k.s, k.h, k.s)); kelp.setMatrixAt(n, _m);
      kelp.setColorAt(n, _kc.copy(KC0).lerp(KC1, k.t)); n++;
    }
    kelp.count = n; kelpH.count = Math.min(n, 90);
    n = 0;
    for (const s of slots) if (s) for (const r of s.rocks) {
      if (n >= ROCK_MAX || near(r, 150) < 0) continue;
      _q.setFromEuler(_e.set(r.a, r.b, r.a * .5));
      _m.compose(_p.set(r.x, r.y, r.z), _q, _s.set(r.s, r.sy, r.s * .85)); rock.setMatrixAt(n, _m); rock.setColorAt(n, r.c); n++;
    }
    rock.count = rockH.count = n;
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
    setQuality(q) { kelpH.visible = rockH.visible = ventH.visible = q >= 1; },
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
