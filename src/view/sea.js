// 海：近密远疏 3 圈海面（浪 = sim/world.js 的 WAVE_GLSL，和 JS 的 waveH 同一个公式）、
// 从下面看的亮青色海面（斯涅尔窗）、水下雾随深度变、鱼影 / 鸟影 / 龙影、觅食点的白沫。海底见 sea-bed.js
import * as THREE from 'three';
import { WAVE_GLSL, waveH } from '../sim/world.js';
import { SPECIES } from '../config/species.js';
import { createSeabed } from './sea-bed.js';

const N = 48;                    // 每圈 48×48 格
const RING = [3, 12, 48];        // 格距（GDD 写 3/12/50；外圈取 48，圈和圈的格线才能对齐，接缝不漏）
const HALF = RING.map(s => s * N / 2);   // 72 / 288 / 1152
const MAXSH = 16, MAXSPOT = 8;
const UW_SHALLOW = new THREE.Color(0x0e5a6e), UW_DEEP = new THREE.Color(0x06283a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const snap = (v, s) => Math.round(v / s) * s;

// 一圈方格：n×n 格、格距 s，中心在原点；hole = 中间挖掉 hole×hole 格；外边一圈往下垂的裙边（aSk = 1）盖住接缝
function ringGeo(n, s, hole) {
  const half = n * s / 2, pos = [], sk = [], idx = [];
  const vid = new Int32Array((n + 1) * (n + 1)).fill(-1);
  const h0 = (n - hole) / 2, h1 = h0 + hole;
  const V = (i, j) => { const k = j * (n + 1) + i; if (vid[k] < 0) { vid[k] = sk.length; pos.push(i * s - half, 0, j * s - half); sk.push(0); } return vid[k]; };
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (hole && i >= h0 && i < h1 && j >= h0 && j < h1) continue;
    const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1);
    idx.push(a, c, b, c, d, b);              // 对角线 c–b：和着色器 coarseH 的切法一致
  }
  // 裙边：沿外圈走一周，每个边点复制一个往下垂的点
  const ring = [];
  for (let i = 0; i < n; i++) ring.push([i, 0]);
  for (let j = 0; j < n; j++) ring.push([n, j]);
  for (let i = n; i > 0; i--) ring.push([i, n]);
  for (let j = n; j > 0; j--) ring.push([0, j]);
  const top = ring.map(([i, j]) => V(i, j)), bot = ring.map(([i, j]) => { pos.push(i * s - half, 0, j * s - half); sk.push(1); return sk.length - 1; });
  for (let k = 0; k < ring.length; k++) { const k2 = (k + 1) % ring.length; idx.push(top[k], bot[k], top[k2], top[k2], bot[k], bot[k2]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSk', new THREE.Float32BufferAttribute(sk, 1));
  g.setIndex(idx);
  return g;
}

const ZONE_GLSL = `
float wrapP(float v){ return v - 2400.0 * floor(v / 2400.0 + 0.5); }
vec2 zoneW(vec2 p){   // x = 火山海权重, y = 外海权重（和 sim/world.js 的 zoneAt 同一套噪声，边界做软）
  float u = p.x / 2400.0 * 6.2831853, v = p.y / 2400.0 * 6.2831853;
  float f = sin(u + 1.3) * cos(v + 0.4) * 0.9 + sin(u * 2.0 - v + 2.1) * 0.45 + cos(u - v * 2.0 + 0.7) * 0.3;
  float home = 1.0 - smoothstep(300.0, 340.0, length(vec2(wrapP(p.x), wrapP(p.y - 120.0))));
  return vec2(smoothstep(0.3, 0.46, f), smoothstep(-0.34, -0.5, f)) * (1.0 - home);
}`;

const VERT = `uniform float uT; uniform vec3 uCam; uniform vec3 uMorph; attribute float aSk;
varying vec3 vW; varying float vSk; varying vec2 vZone;
#include <fog_pars_vertex>
${WAVE_GLSL}
${ZONE_GLSL}
// 几何上的浪：离镜头 150 以内 = waveH 原样，262 以外压平（外圈格太粗，画浪会有摩尔纹；远处的浪交给逐像素法线）
float Hg(vec2 p){ return waveH(p, uT) * (1.0 - smoothstep(150.0, 262.0, length(p - uCam.xz))); }
// 外一圈网格在 p 处的高度（同样的三角切法线性插值）：本圈靠边的点渐变到它，接缝就严丝合缝
float coarseH(vec2 p, float S){
  vec2 g = p / S, c0 = floor(g), f = g - c0, o = c0 * S;
  float hb = Hg(o + vec2(S, 0.0)), hc = Hg(o + vec2(0.0, S));
  if (f.x + f.y < 1.0) { float ha = Hg(o); return ha + f.x * (hb - ha) + f.y * (hc - ha); }
  float hd = Hg(o + vec2(S)); return hd + (1.0 - f.x) * (hc - hd) + (1.0 - f.y) * (hb - hd);
}
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float h = Hg(w.xz);
  float m = smoothstep(uMorph.x, uMorph.y, max(abs(position.x), abs(position.z)));
  if (m > 0.0) h = mix(h, coarseH(w.xz, uMorph.z), m);
  w.y += h - aSk * 0.5;
  vW = w.xyz; vSk = aSk; vZone = zoneW(w.xz);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `uniform float uT, uUnder;
uniform vec3 uCam, deepC, shallowC, deepV, shallowV, deepO, shallowO, skyC, foamC, sunD, sunC, shC;
uniform vec3 sunW, uwWin, uwTir, uwSun, uwShC;
uniform vec4 uHole;
uniform vec4 uShA[${MAXSH}], uShB[${MAXSH}]; uniform int uShN;
uniform vec4 uSpot[${MAXSPOT}]; uniform int uSpotN;
varying vec3 vW; varying float vSk; varying vec2 vZone;
#include <fog_pars_fragment>
${WAVE_GLSL}
// 影子：uShA = (x, z, 长半径, 宽半径)，uShB = (朝向 sin, cos, 浓度, 种类 0 鱼 / 1 龙 / 2 鸟)
float shadowAt(vec2 p, bool under){
  float s = 0.0;
  for (int i = 0; i < ${MAXSH}; i++) {
    if (i >= uShN) break;
    vec4 A = uShA[i], B = uShB[i];
    if ((B.w > 1.5) != under) continue;
    vec2 d = p - A.xy; float rr = max(A.z, A.w) * 1.3;
    if (dot(d, d) > rr * rr) continue;
    vec2 l = vec2(dot(d, B.xy), dot(d, vec2(B.y, -B.x)));
    float e, soft;
    if (B.w < 0.5) { e = length(l / vec2(A.z, A.w)); soft = 0.5; }                      // 鱼 / 鱼群：顺着身子的椭圆
    else if (B.w < 1.5) { e = length(d) / A.z; soft = 0.6; }                            // 龙：软圆
    else { l.x += abs(l.y) * 0.35; e = min(length(l / vec2(A.z * 0.22, A.w)), length(l / vec2(A.z * 0.55, A.z * 0.17))); soft = 0.25; } // 鸟：翅膀 + 身子
    s = max(s, (1.0 - smoothstep(1.0 - soft, 1.0, e)) * B.z);
  }
  return s;
}
// 觅食点：翻腾的白沫圈 + 圈里的小白块
float spotFoam(vec2 p){
  float f = 0.0;
  for (int i = 0; i < ${MAXSPOT}; i++) {
    if (i >= uSpotN) break;
    vec4 s = uSpot[i]; vec2 d = p - s.xy; float r = length(d);
    if (r > s.z + 3.0) continue;
    float a = atan(d.y, d.x);
    float wob = sin(a * 7.0 + uT * 1.9) * 0.35 + sin(a * 12.0 - uT * 2.7 + r) * 0.25 + sin(r * 2.1 - uT * 3.1) * 0.2;
    float ring = 1.0 - smoothstep(0.55, 0.85, abs(r - s.z * 0.86 + wob * 0.8));
    vec2 q = d * 0.95 + vec2(sin(uT * 0.9), cos(uT * 1.1)) * 1.5;
    float n = sin(q.x * 1.3 + sin(q.y * 1.7 + uT * 2.0)) * sin(q.y * 1.1 - uT * 1.6 + sin(q.x * 0.9));
    float inner = smoothstep(0.3, 0.4, n) * (1.0 - smoothstep(s.z * 0.55, s.z * 0.8, r));
    f = max(f, max(ring, inner * 0.8) * s.w);
  }
  return f;
}
void main(){
  if (uHole.z > 0.0 && max(abs(vW.x - uHole.x), abs(vW.z - uHole.y)) < uHole.z) discard;   // 内圈已经画了
  vec2 p = vW.xz;
  float dist = length(p - uCam.xz);
  float amp = 1.0 - 0.7 * smoothstep(180.0, 800.0, dist);           // 远处浪渐弱
  float e = clamp(dist * 0.012, 0.4, 8.0);                           // 远处差分步长变大 = 滤掉细浪，不闪
  float h0 = waveH(p, uT);
  vec3 N = normalize(vec3((h0 - waveH(p + vec2(e, 0.0), uT)) / e * amp, 1.0, (h0 - waveH(p + vec2(0.0, e), uT)) / e * amp));
  float h = h0 * amp;
  // 只影响光照的小涟漪（不改几何，sim 的浪高不受影响）：近处水面有细纹，掠水时不会一片平
  vec2 rp = p * 0.55;
  vec2 dn = vec2(cos(rp.x + uT * 1.9 + sin(rp.y * 0.7 + uT * 0.5) * 1.4), cos(rp.y * 1.15 - uT * 1.6 + sin(rp.x * 0.8) * 1.4))
          + vec2(cos(dot(rp, vec2(0.9, -1.3)) * 1.6 + uT * 2.3), cos(dot(rp, vec2(1.2, 0.7)) * 1.4 - uT * 2.0)) * 0.6;
  N = normalize(N + vec3(dn.x, 0.0, dn.y) * 0.035 * (1.0 - smoothstep(30.0, 160.0, dist)));
  bool under = vSk > 0.01 ? uUnder > 0.5 : !gl_FrontFacing;
  float foam = spotFoam(p);
  vec3 c;
  if (!under) {
    vec3 V = normalize(cameraPosition - vW);
    vec3 dc = mix(mix(deepC, deepV, vZone.x), deepO, vZone.y), sc = mix(mix(shallowC, shallowV, vZone.x), shallowO, vZone.y);
    float t = clamp(h * 0.25 + 0.4, 0.0, 1.0);
    float tq = (floor(t * 3.0) + smoothstep(0.4, 0.6, fract(t * 3.0))) / 3.0;   // 卡通：深浅分 3 档
    c = mix(dc, sc, mix(t, tq, 0.6));
    float fr = pow(1.0 - max(dot(N, V), 0.0), 4.0);
    float fa = fwidth(fr) * 0.8 + 0.008;                              // 卡通：天光反射分 4 档（顺着浪形），掠水时一道道浪看得清
    float frq = 0.22 * smoothstep(0.2 - fa, 0.2 + fa, fr) + 0.22 * smoothstep(0.42 - fa, 0.42 + fa, fr) + 0.18 * smoothstep(0.64 - fa, 0.64 + fa, fr) + 0.14 * smoothstep(0.84 - fa, 0.84 + fa, fr);
    c = mix(c, skyC, mix(min(fr * 0.9, 0.76), frq, 0.65));
    float sp = pow(max(dot(N, normalize(sunD + V)), 0.0), 280.0);
    c += sunC * (smoothstep(0.3, 0.45, sp) * 1.1 + sp * 0.8);         // 硬边的太阳亮斑
    float lace = sin(p.x * 0.8 + sin(p.y * 0.6 + uT * 0.8) * 1.6) * sin(p.y * 0.7 - uT * 0.6 + sin(p.x * 0.5 - uT * 0.5) * 1.6);
    c = mix(c, foamC, smoothstep(1.8, 1.86, h + lace * 0.3) * 0.7);   // 浪尖白沫：碎成花边，不成大片
    c = mix(c, shC, shadowAt(p, false));
    c = mix(c, foamC, foam);
  } else {
    vec3 R = normalize(vW - cameraPosition);
    float cu = dot(R, N);
    float win = smoothstep(0.645, 0.675, cu);                          // 斯涅尔窗：抬头 48° 以内看得到天（硬边，随浪抖）
    c = mix(uwTir * mix(0.55, 1.0, smoothstep(0.05, 0.5, cu)), uwWin, win);   // 窗外是全反射：越斜越暗
    vec2 q = p * 0.16;                                                 // 水面下侧的光网（和海底焦散同一套）
    float ra = sin(q.x * 1.7 + uT * 0.9 + sin(q.y * 2.3 + uT * 0.7) * 1.3), rb = sin(q.y * 1.9 - uT * 0.8 + sin(q.x * 1.4 - uT * 0.6) * 1.3);
    float rip = smoothstep(0.42, 0.52, pow(max(0.0, 1.0 - abs(ra + rb) * 0.8), 5.0));
    c = mix(c, mix(uwWin, vec3(1.0), win * 0.6), rip * 0.35);
    float sg = max(dot(R, sunW), 0.0);
    c += uwSun * (pow(sg, 8.0) * 0.45 + smoothstep(0.965, 0.98, sg) * 0.5) * (0.35 + 0.65 * win);
    c = mix(c, uwShC, shadowAt(p, true));
    c = mix(c, foamC, foam * 0.55);
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createSea(ctx) {
  const { scene, camera } = ctx;
  const SUN = (ctx.sun || new THREE.Vector3(-.35, .62, -.7)).clone().normalize();
  // 水下看太阳：折射后更陡（入射角 sin 除以 1.33）
  const sh = Math.hypot(SUN.x, SUN.z), sinW = Math.sqrt(1 - SUN.y * SUN.y) / 1.33;
  const sunW = new THREE.Vector3(SUN.x / sh * sinW, Math.sqrt(1 - sinW * sinW), SUN.z / sh * sinW);
  const shA = Array.from({ length: MAXSH }, () => new THREE.Vector4()), shB = Array.from({ length: MAXSH }, () => new THREE.Vector4());
  const spots = Array.from({ length: MAXSPOT }, () => new THREE.Vector4());
  const C = h => new THREE.Color(h);
  const U = {   // 三圈共用的 uniform（同一个对象，改一处三圈都变）
    uT: { value: 0 }, uUnder: { value: 0 }, uCam: { value: new THREE.Vector3() },
    deepC: { value: C(0x0f4f73) }, shallowC: { value: C(0x2b8fae) },     // 翠岛海 = 原型的颜色
    deepV: { value: C(0x0b3550) }, shallowV: { value: C(0x23708a) },     // 火山海：暗
    deepO: { value: C(0x0a3a6c) }, shallowO: { value: C(0x1f72a8) },     // 外海：深蓝
    skyC: { value: C(0xbcd6ea) }, foamC: { value: C(0xf2f8fb) }, sunD: { value: SUN }, sunC: { value: C(0xfff0d0) }, shC: { value: C(0x082a40) },
    sunW: { value: sunW }, uwWin: { value: C(0x8fe6ee) }, uwTir: { value: C(0x2a8a9c) }, uwSun: { value: C(0xfffbe6) }, uwShC: { value: C(0x0b3a48) },
    uShA: { value: shA }, uShB: { value: shB }, uShN: { value: 0 }, uSpot: { value: spots }, uSpotN: { value: 0 },
  };
  const group = new THREE.Group(); group.name = 'sea'; scene.add(group);
  const rings = RING.map((s, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...U,
        uMorph: { value: new THREE.Vector3(i < 2 ? HALF[i] * .7 : 1e9, i < 2 ? HALF[i] - RING[i] : 2e9, RING[Math.min(i + 1, 2)]) },   // 最外一排格子完全贴合外圈
        uHole: { value: new THREE.Vector4(0, 0, i === 1 ? HALF[0] : 0, 0) } },
      vertexShader: VERT, fragmentShader: FRAG, fog: true, side: THREE.DoubleSide, extensions: { derivatives: true },
    });
    const m = new THREE.Mesh(ringGeo(N, s, i === 2 ? N / 4 : 0), mat);   // 外圈中间挖掉 12×12 格 = 中圈
    m.frustumCulled = false; m.name = 'seaRing' + i; group.add(m);
    return m;
  });

  const bed = createSeabed(ctx); group.add(bed.group);

  // ---- 水下雾：水上的雾每帧记下来（别的模块改了也认），水下按深度混到水下色 ----
  const air = { color: new THREE.Color(0xc8dcec), near: 180, far: 900, set: false };
  const last = { color: new THREE.Color(), near: -1, far: -1 };
  let ownFog = null, savedBg = null, skyHidden = false;
  const uwC = new THREE.Color(), bgC = new THREE.Color();
  function skyObj() { const s = ctx.sky; return !s ? null : s.isObject3D ? s : (s.mesh || s.group || s.obj || null); }
  function setSky(vis) {
    if (vis === !skyHidden) return;
    skyHidden = !vis;
    const o = skyObj(); if (o) o.visible = vis; else if (ctx.sky && ctx.sky.setVisible) ctx.sky.setVisible(vis);
    if (!vis) { savedBg = scene.background; scene.background = bgC; } else if (scene.background === bgC) scene.background = savedBg;
  }

  const api = {
    group, bed, underwater: 0, waveT: 0, depth: 0, fogColor: uwC,
    surfaceAt: (x, z, t = api.waveT) => waveH(x, z, t),
    update(S, alpha = 1, dt = 1 / 60, time = 0) {
      const cam = camera.position;
      const wt = S && typeof S.t === 'number' ? S.t - (1 - alpha) / 60 : time;
      api.waveT = wt; U.uT.value = wt; U.uCam.value.copy(cam);
      // 圈的位置：内圈往镜头前方偏 40 米（细格子用在看得见的地方），按 12 对齐；中、外圈按 48 对齐
      camera.getWorldDirection(_d);
      const c0x = snap(cam.x + _d.x * 40, 12), c0z = snap(cam.z + _d.z * 40, 12), c1x = snap(cam.x, 48), c1z = snap(cam.z, 48);
      rings[0].position.set(c0x, 0, c0z); rings[1].position.set(c1x, 0, c1z); rings[2].position.set(c1x, 0, c1z);
      rings[1].material.uniforms.uHole.value.set(c0x, c0z, HALF[0] - 1.5, 0);   // 挖洞比内圈小半格：两圈重叠一条（同一个面、同一个颜色），光栅化的缝就不会漏

      // 镜头在水下的程度：0.25 秒线性渐变（主循环的镜头不停在水线带里，所以只会快速穿过）
      const surf = waveH(cam.x, cam.z, wt), under = cam.y < surf;
      api.underwater = clamp(api.underwater + (under ? 1 : -1) * Math.min(dt, .1) / .25, 0, 1);
      const k = api.underwater, ke = sstep(0, 1, k);
      api.depth = Math.max(0, surf - cam.y);
      U.uUnder.value = under ? 1 : 0;
      const dk = sstep(2, 80, api.depth);
      uwC.copy(UW_SHALLOW).lerp(UW_DEEP, dk);

      let fog = scene.fog;
      if (fog && fog !== ownFog && 'near' in fog) {
        if (!air.set || !fog.color.equals(last.color) || fog.near !== last.near || fog.far !== last.far) {   // 有人改过雾 → 当作水上的雾
          air.color.copy(fog.color); air.near = fog.near; air.far = fog.far; air.set = true;
        }
      }
      if (!fog && k > 0) fog = scene.fog = ownFog = new THREE.Fog(uwC.clone(), 8, 120);
      if (fog && 'near' in fog) {
        // 颜色先变（入水那一下不会亮一下），远近按 0.25 秒慢慢收
        const kc = under ? Math.min(1, k * 2.5) : ke, kr = under ? Math.min(1, k * 1.5) : ke;
        fog.color.copy(air.color).lerp(uwC, kc);
        fog.near = air.near + (8 - dk * 2 - air.near) * kr;
        fog.far = 1 / (1 / air.far + (1 / (120 - dk * 15) - 1 / air.far) * kr);   // 按「能见度」插值，入水头几帧就收拢
        last.color.copy(fog.color); last.near = fog.near; last.far = fog.far;
        if (fog === ownFog && k === 0) { scene.fog = null; ownFog = null; }
        bgC.copy(fog.color);
      }
      setSky(!under);
      rings[2].visible = k < 1;                    // 完全在水下时外圈（264 米以外）全在雾里，不画

      writeShadows(S, alpha, wt);
      bed.update(S, cam, wt, k, under, uwC, dt);
    },
    // 画质：0 低档（海底的石头 / 海藻不画描边），1 以上正常
    setQuality(q) { bed.setQuality(q); },
    dispose() {
      scene.remove(group); bed.dispose();
      for (const r of rings) { r.geometry.dispose(); r.material.dispose(); }
      setSky(true);
    },
  };
  const _d = new THREE.Vector3();

  // ---- 影子：鱼影（海面上，天上看得到）、龙影、鸟影（海面下侧，水下看得到）；最多 16 个 ----
  const cand = [], clusters = [];
  function lerpP(o, a) { return o.px === undefined ? [o.x, o.y, o.z] : [o.px + (o.x - o.px) * a, o.py + (o.y - o.py) * a, o.pz + (o.z - o.pz) * a]; }
  function writeShadows(S, alpha, wt) {
    let n = 0;
    const cam = camera.position, put = (x, z, a, b, sy, cy, k, kind) => { if (n < MAXSH && k > .01) { shA[n].set(x, z, a, b); shB[n].set(sy, cy, k, kind); n++; } };
    if (S && S.hero) {
      const h = S.hero, [x, y, z] = lerpP(h, alpha), len = h.len || 8, surf = waveH(x, z, wt);
      if (y > surf && y < 40) { const r = len * .3 + (y - surf) * .1; put(x, z, r, r, 0, 1, .42 * (1 - sstep(10, 40, y - surf)), 1); }
      else if (y <= surf && y > -8) put(x, z, len * .5, len * .15, Math.sin(h.yaw || 0), Math.cos(h.yaw || 0), .5 * (1 - sstep(1, 8, surf - y)), 0);
    }
    cand.length = 0; clusters.length = 0;
    if (S && S.creatures) for (const c of S.creatures) {
      const sp = SPECIES[c.sp]; if (!sp) continue;
      const air = sp.hab === 'air';
      const [x, y, z] = lerpP(c, alpha);
      if (air ? y >= 25 : y <= -6) continue;
      const d2 = (x - cam.x) ** 2 + (z - cam.z) ** 2;
      if (d2 > 260 * 260) continue;
      cand.push({ c, x, y, z, d2, air, sp });
    }
    cand.sort((a, b) => a.d2 - b.d2);
    // 鱼群合成一团影子：离团心 7 米内的并进去
    for (const o of cand) {
      if (o.air) { if (clusters.length + n < MAXSH) clusters.push({ bird: o }); continue; }
      let cl = null;
      for (const q of clusters) if (q.fish && (q.ax - o.x) ** 2 + (q.az - o.z) ** 2 < 49) { cl = q; break; }
      if (!cl) { if (clusters.length + n >= MAXSH) continue; cl = { fish: [], ax: o.x, az: o.z }; clusters.push(cl); }
      cl.fish.push(o);
    }
    for (const q of clusters) {
      if (q.bird) {
        const { c, x, y, z, sp } = q.bird, len = c.size || sp.len, span = (sp.span ? sp.span * len / sp.len : len * 1.7) * 1.2;
        put(x, z, len * 1.2, span * .5, Math.sin(c.yaw || 0), Math.cos(c.yaw || 0), .6 * (1 - sstep(8, 25, y)), 2);
        continue;
      }
      const f = q.fish; let mx = 0, mz = 0, my = 0, sy = 0, cy = 0, sz = 0;
      for (const o of f) { mx += o.x; mz += o.z; my += o.y; sy += Math.sin(o.c.yaw || 0); cy += Math.cos(o.c.yaw || 0); sz = Math.max(sz, o.c.size || o.sp.len); }
      mx /= f.length; mz /= f.length; my /= f.length;
      const yl = Math.hypot(sy, cy) || 1;
      const k = .6 * (1 - sstep(1, 6, -my)) * (my > 2 ? .5 : 1);   // 越深越淡，跃出水面的也淡
      if (f.length === 1) { const o = f[0], w = o.sp.span ? o.sp.span * .5 * sz / o.sp.len : sz * .22; put(mx, mz, sz * .6, w, sy / yl, cy / yl, k, 0); continue; }
      let r = 0; for (const o of f) r = Math.max(r, Math.hypot(o.x - mx, o.z - mz));
      r += sz * .7;
      put(mx, mz, r * 1.15, r * .85, sy / yl, cy / yl, k * .9, 0);
    }
    U.uShN.value = n;
    // 觅食点白沫：最近的 8 个，直径约 12
    let m = 0;
    if (S && S.spots) {
      const list = S.spots.map(s => [s, (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2]).filter(a => a[1] < 900 * 900).sort((a, b) => a[1] - b[1]);
      for (const [s] of list) { if (m >= MAXSPOT) break; spots[m++].set(s.x, s.z, 7, s.k === undefined ? 1 : s.k); }   // 白沫圈半径约 6
    }
    U.uSpotN.value = m;
  }
  return api;
}
