// 海：近密远疏 3 圈海面（浪 = sim/world.js 的 WAVE_GLSL，和 JS 的 waveH 同一个公式）、
// 从下面看的亮青色海面（斯涅尔窗）、水下雾随深度变、水下光柱、鱼影 / 鸟影 / 龙影、觅食点的翻腾白沫。海底见 sea-bed.js
// 卡通水面：
//   底色 = 浪高的平滑深浅；短浪朝着太阳的一面亮一档（硬边），长浪只给柔和的明暗；远处换成亮一点的青蓝；
//   天光反射：近处按视线角分两档，远处平滑、只反射地平线的颜色；太阳方向一条亮带 + 一闪一闪的小星点；
//   浪尖：顺着短浪浪尖的一截截白线（短浪高度的等高线，宽度按米算），前坡粗、后坡细；碎浪上再加几条小白线；
//   岛边：两档浅水色 + 贴岸约 1.2 米的硬边白线 + 花边白沫 + 往岸上推的浪线（sea-shore.js 的岸线场）；
//   觅食点：浅色的乱水 + 几条弯弯的翻腾白线 + 断开的、往外扩的波纹 + 几颗冒出来又消掉的水花。
// 远处的雾按视线方向染冷暖（three 的雾代码块已被 sky.js 改过，和天空地平线接上）。
import * as THREE from 'three';
import { WAVE_GLSL, waveH } from '../sim/world.js';
import { SPECIES } from '../config/species.js';
import { createSeabed } from './sea-bed.js';
import { createShore } from './sea-shore.js';
import { createShafts } from './sea-shafts.js';
import { seaNoise } from './sea-noise.js';
import { SKY, SUN as SKY_SUN, SKY_TINT_GLSL } from './sky.js';

const N = 48;                    // 每圈 48×48 格
const RING = [3, 12, 48];        // 格距（GDD 写 3/12/50；外圈取 48，圈和圈的格线才能对齐，接缝不漏）
const HALF = RING.map(s => s * N / 2);   // 72 / 288 / 1152
const MAXSH = 16, MAXSPOT = 8;
const UW_SHALLOW = new THREE.Color(0x0f5c6c), UW_DEEP = new THREE.Color(0x082c3e);
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

const VERT = `uniform float uT, uUnder; uniform vec3 uCam; uniform vec3 uMorph; attribute float aSk;
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
  w.y += h - aSk * 0.5 * (1.0 - uUnder);         // 裙边只给水上用（盖住圈和圈的接缝）；镜头在水下时收起来，免得从下面看到一条竖着的边
  vW = w.xyz; vSk = aSk; vZone = zoneW(w.xz);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

// 浪的分量（和 sim/world.js 的 waveH 同一个公式）：[kx, kz, w, 振幅]。前两项 = 长浪（105~140 米），后两项 = 短浪（23~44 米）
const WV = [[.045, 0, 1.1, 1], [0, .06, -.85, .8], [.1, .1, 1.7, .35], [.21, -.17, 2.3, .15]];
const WV_OK = [[3.1, -7.2, 1.3], [-120, 45, 17.9], [801.5, 333, 63.2]].every(([x, z, t]) => Math.abs(WV.reduce((s, [a, b, w, k]) => s + Math.sin(x * a + z * b + t * w) * k, 0) - waveH(x, z, t)) < 1e-6);
if (!WV_OK) console.warn('sea.js：waveH 改过了，WV 表要跟着改（先用差分顶上）');
const fl = v => (+v).toFixed(5);
// 浪的坡度（直接用公式求导，比 3 次 waveH 省）：gL = 长浪、gS = 短浪、hS = 短浪的高度。px = 一个像素多少米：比像素细的浪渐弱（远处不闪）
const WGRAD_GLSL = `
void waveGrad(vec2 p, float t, float px, out vec2 gL, out vec2 gS, out float hS){
  gL = vec2(0.0); gS = vec2(0.0); hS = 0.0; float a, c;
${WV_OK ? WV.map(([kx, kz, w, amp], i) => {
    const lam = 2 * Math.PI / Math.hypot(kx, kz);
    return `  a = p.x * ${fl(kx)} + p.y * ${fl(kz)} + t * ${fl(w)}; c = cos(a) * ${fl(amp)} * (1.0 - smoothstep(${fl(lam * .12)}, ${fl(lam * .4)}, px));
  ${i < 2 ? 'gL' : 'gS'} += c * vec2(${fl(kx)}, ${fl(kz)});${i < 2 ? '' : ` hS += sin(a) * ${fl(amp)};`}`;
  }).join('\n') : `  float e = max(px, 0.4), h0 = waveH(p, t);
  gL = vec2(waveH(p + vec2(e, 0.0), t) - h0, waveH(p + vec2(0.0, e), t) - h0) / e * 0.5; gS = gL; hS = h0 * 0.2;`}
}`;
const KC = .02;   // 觅食点翻腾白线的噪声（一圈约 3 米）

const FRAG = `uniform float uT, uUnder, uDepth;
uniform vec3 uCam, deepC, shallowC, deepV, shallowV, deepO, shallowO, farC, aquaC, aquaC2, foamC, sunD, sunC, shC;
uniform vec3 skyUp, skyWarm, skyCool;
uniform vec3 sunW, uwWin, uwTir, uwSun, uwShC;
uniform vec4 uHole;
uniform sampler2D uShore, uNoise; uniform vec4 uShoreR;
uniform vec4 uShA[${MAXSH}], uShB[${MAXSH}]; uniform int uShN;
uniform vec4 uSpot[${MAXSPOT}]; uniform int uSpotN;
varying vec3 vW; varying float vSk; varying vec2 vZone;
#include <fog_pars_fragment>
${WAVE_GLSL}
${WGRAD_GLSL}
${SKY_TINT_GLSL}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
// 抗锯齿的台阶（按屏幕像素算边宽：远近都是干净的硬边）
float aastep(float th, float x){ float w = fwidth(x) * 0.7 + 1e-5; return smoothstep(th - w, th + w, x); }
// 分支 / 循环里用的版本：边宽 w 由外面算好传进来（循环里求导不可靠）
float stepW(float th, float x, float w){ return smoothstep(th - w, th + w, x); }
// 细线：d = 到线中心的距离（米），w = 半宽（米），aa = 一个像素（米）。线细过一个像素就不再变细、改成变淡（远处不闪）
float lineM(float d, float w, float aa){ float we = max(w, aa * 0.8); return (1.0 - smoothstep(we - aa * 0.5, we + aa * 0.5, d)) * (w / we); }
// 影子：uShA = (x, z, 长半径, 宽半径)，uShB = (朝向 sin, cos, 浓度, 种类 0 鱼 / 1 龙 / 2 鸟)。dap = 一点噪声（鱼群的影子打散成几团）
float shadowAt(vec2 p, bool under, float dap){
  float s = 0.0;
  for (int i = 0; i < ${MAXSH}; i++) {
    if (i >= uShN) break;
    vec4 A = uShA[i], B = uShB[i];
    if ((B.w > 1.5) != under) continue;
    vec2 d = p - A.xy; float rr = max(A.z, A.w) * 1.3;
    if (dot(d, d) > rr * rr) continue;
    vec2 l = vec2(dot(d, B.xy), dot(d, vec2(B.y, -B.x)));
    float e, soft, k = B.z;
    if (B.w < 0.5) {                                                    // 鱼 / 鱼群：顺着身子的椭圆；大的（鱼群）打散成几团、淡一点
      e = length(l / vec2(A.z, A.w)); soft = 0.45; k *= 0.64;
      float big = smoothstep(2.5, 5.0, A.z);
      e *= mix(1.0, 0.7 + dap * 0.75, big); k *= mix(1.0, smoothstep(0.32, 0.5, dap), big * 0.7);
    }
    else if (B.w < 1.5) { e = length(d) / A.z; soft = 0.22; }           // 龙：边比较清楚的圆
    else { l.x += abs(l.y) * 0.35; e = min(length(l / vec2(A.z * 0.22, A.w)), length(l / vec2(A.z * 0.55, A.z * 0.17))); soft = 0.25; } // 鸟：翅膀 + 身子
    s = max(s, (1.0 - smoothstep(1.0 - soft, 1.0, e)) * k);
  }
  return s;
}
// 觅食点：x = 白沫（几条翻腾的白线 + 断开的波纹 + 几颗水花），y = 乱水（浅色）。wv = 中块噪声（让白线弯起来），dpx / dpy = 一个像素的世界位移
vec2 spotFx(vec2 p, float dist, float gpx, vec2 wv, vec2 dpx, vec2 dpy){
  vec2 f = vec2(0.0);
  for (int i = 0; i < ${MAXSPOT}; i++) {
    if (i >= uSpotN) break;
    vec4 s = uSpot[i]; vec2 d = p - s.xy; float r = length(d), R = s.z;
    if (r > R * 2.4 + 3.0) continue;
    float sd = fract(s.x * 0.0131 + s.y * 0.0173) * 7.0;                    // 每个点的花纹错开
    float core = 1.0 - smoothstep(R * 0.35, R * 1.0, r);
    // 翻腾：转着的噪声的等高线（多查两次图求坡度，宽度按米算），再用一张大块噪声挖掉一半 = 几条弯弯的白线
    float ang = uT * 0.5 + r * 0.12 + sd;
    vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d * ${fl(KC)} + wv * 0.15 + sd;
    float b0 = textureGrad(uNoise, q, dpx * ${fl(KC)}, dpy * ${fl(KC)}).b;
    float gb = length(vec2(textureGrad(uNoise, q + vec2(0.008, 0.0), dpx * ${fl(KC)}, dpy * ${fl(KC)}).b - b0, textureGrad(uNoise, q + vec2(0.0, 0.008), dpx * ${fl(KC)}, dpy * ${fl(KC)}).b - b0)) * ${fl(KC / .008)};
    float brk = smoothstep(0.44, 0.58, textureGrad(uNoise, d * 0.045 + vec2(sd * 0.37, uT * 0.04), dpx * 0.045, dpy * 0.045).g);
    float churn = lineM(abs(b0 - 0.5) / max(gb, 0.01), (0.05 + 0.13 * core) * brk, gpx) * smoothstep(0.03, 0.07, gb) * core;
    // 水花：4 颗，各自错开冒出来再缩回去（每颗约 1.2 秒，不闪）
    float blob = 0.0;
    for (int j = 0; j < 4; j++) {
      float ph = uT * 0.8 + float(j) * 0.25 + sd, cyc = floor(ph), u = fract(ph);
      vec2 o = (vec2(hash12(vec2(cyc, sd + float(j))), hash12(vec2(sd * 1.7 + float(j), cyc + 3.1))) - 0.5) * R * 1.2;
      float rad = (0.3 + 0.25 * hash12(vec2(cyc + 0.5, float(j) + 9.0))) * sin(u * 3.14159);
      blob = max(blob, 1.0 - smoothstep(rad - gpx * 0.6, rad + gpx * 0.6, length(d - o)));
    }
    // 波纹：往外扩的三圈，半径按角度抖 ±1 米（3~4 个起伏），再按角度断开成几段
    vec2 dir = d / max(r, 1e-3);
    float jit = (textureGrad(uNoise, dir * 0.04 + vec2(sd, uT * 0.02), vec2(0.0), vec2(0.0)).b - 0.5) * 3.2;
    float rings = 0.0;
    for (int k = 0; k < 3; k++) {
      float rp = fract(uT * 0.3 + float(k) / 3.0 + sd * 0.1);
      float rr = mix(R * 0.8, R * 2.2, rp);
      float dash = smoothstep(0.4, 0.46, textureGrad(uNoise, dir * 0.45 + vec2(float(k) * 0.37 + sd, rp * 0.25), vec2(0.0), vec2(0.0)).g);
      float hw = 0.08 + 0.14 * (1.0 - rp);
      rings = max(rings, lineM(abs(r + jit * (0.5 + 0.5 * rp) - rr), hw, gpx) * dash * smoothstep(0.0, 0.12, rp) * (1.0 - rp));
    }
    float far = (1.0 - smoothstep(0.0, R * 1.2, r)) * smoothstep(70.0, 220.0, dist) * 0.5;
    f = max(f, vec2(max(max(max(churn, blob * core), rings * 0.85), far), 1.0 - smoothstep(R * 0.9, R * 1.6, r)) * s.w);
  }
  return f;
}
void main(){
  if (uHole.z > 0.0 && max(abs(vW.x - uHole.x), abs(vW.z - uHole.y)) < uHole.z) discard;   // 内圈已经画了
  vec2 p = vW.xz;
  float dist = length(p - uCam.xz);
  float gpx = length(fwidth(p)) + 1e-4;                                // 一个像素多少米
  float amp = 1.0 - 0.7 * smoothstep(180.0, 800.0, dist);           // 远处浪渐弱
  // ---- 查噪声图（都在分支外面：求导 / mip 才可靠）----
  vec4 nL = texture2D(uNoise, p * 0.0035 + vec2(uT * 0.0012, 0.0));    // 大块（约 290 米一周期）
  vec4 nM = texture2D(uNoise, p * 0.021 - vec2(0.0, uT * 0.006));      // 中块（约 48 米）
  // 明暗和浪尖白线用的坡度在挪过的位置上算（±5 米）：亮暗带和白线弯弯的，不是一条条直直的斜纹（几何上的浪不挪，看不出来）
  vec2 gL, gS; float hS;
  vec2 pw = p + (nM.gb - 0.5) * vec2(7.0, 3.0) + (nL.gb - 0.5) * 16.0;
  waveGrad(pw, uT, gpx, gL, gS, hS);
  // 只用来分亮暗的两道碎浪（13 / 8.5 米，不进几何、不进物理）：近处的亮暗块小一点、密一点，不是一两大块
  //   hC = 碎浪的高度（-1..1），浪尖上也画小白线
  const vec2 K1 = vec2(-0.145, -0.461), K2 = vec2(-0.591, -0.443);
  float c1 = dot(pw, K1) - uT * 2.18, c2 = dot(pw, K2) - uT * 2.69;
  vec2 gC = cos(c1) * 0.062 * K1 * (1.0 - smoothstep(1.6, 5.2, gpx)) + cos(c2) * 0.04 * K2 * (1.0 - smoothstep(1.0, 3.4, gpx));
  float hC = sin(c1) * 0.6 + sin(c2) * 0.4;
  gL *= amp; gS *= amp;
  vec2 gr = gL + gS;                                                   // 浪的坡度
  vec3 N = normalize(vec3(-gr.x, 1.0, -gr.y));
  float h0 = waveH(p, uT), h = h0 * amp;
  vec2 dpx = dFdx(p), dpy = dFdy(p);
  // 白线断开的地方：两张跟着短浪一起走的噪声（G 通道，一截约 3~7 米），取中间一段 = 一截截两头尖的白线
  vec2 pa = p * 0.035 + fract(uT * 0.3);                                // 0.3 = 8.5 米/秒 × 0.035（短浪往 -x -z 走）
  float dashA = smoothstep(0.4, 0.6, texture2D(uNoise, pa + vec2(0.31, 0.77)).g);
  float dashB = smoothstep(0.46, 0.64, texture2D(uNoise, pa * 1.3 + vec2(0.62, 0.15)).g);
  // 岸线场：R = 窄（岸边白沫），G = 宽（浅水色带）
  vec2 sf = vec2(0.0);
  vec2 suv = vec2(0.5 + (p.x - uShoreR.x) / uShoreR.z, 0.5 - (p.y - uShoreR.y) / uShoreR.z);
  if (uShoreR.w > 0.5) {
    sf = texture2D(uShore, clamp(suv, 0.0, 1.0)).rg;
    sf *= 1.0 - smoothstep(0.42, 0.495, max(abs(suv.x - 0.5), abs(suv.y - 0.5)));
  }
  float wob = (nM.b - 0.5) * 0.05 + (nL.g - 0.5) * 0.04;
  float fs = sf.r + wob * 0.6;
  float fsW = fwidth(fs), sgW = fwidth(sf.g + wob);
  bool under = vSk > 0.01 ? uUnder > 0.5 : !gl_FrontFacing;
  vec2 sp = spotFx(p, dist, gpx, nM.gb - 0.5, dpx, dpy);
  vec3 c;
  if (!under) {
    vec3 V = normalize(cameraPosition - vW);
    float nearK = 1.0 - smoothstep(240.0, 480.0, dist);                 // 近处的卡通明暗，远处收掉（远了一格比像素还小，会闪）
    // 1) 底色：浪谷深、浪尖浅（平滑），区域定色；远处换成亮一点的青蓝（和地平线的暖雾混起来不发灰）
    vec3 dc = mix(mix(deepC, deepV, vZone.x), deepO, vZone.y), sc = mix(mix(shallowC, shallowV, vZone.x), shallowO, vZone.y);
    c = mix(dc, sc, clamp(h * 0.16 * (1.0 - 0.75 * smoothstep(120.0, 420.0, dist)) + 0.42 + (nL.g - 0.5) * 0.05, 0.0, 1.0));   // 远处浪高的深浅收掉（不然挤成一条条横纹）
    c = mix(c, farC, smoothstep(120.0, 600.0, dist) * 0.85);
    // 2) 卡通明暗：短浪（23~44 米）朝着太阳的一面亮一档、背阳的暗一点（硬边，一条条 10~25 米宽）；长浪只给柔和的明暗
    vec2 sxz = normalize(sunD.xz);
    float nearS = 1.0 - smoothstep(130.0, 320.0, dist);                // 硬边只画到 130~320 米（再远一条条挤成横纹）
    float litS = -dot(gS + gC * amp, sxz) + (nM.g - 0.5) * 0.03, litL = -dot(gL, sxz);
    nearS *= 1.0 - smoothstep(0.003, 0.008, fwidth(litS));            // 斜着看、亮暗带挤得比十几个像素还窄时也收掉（横纹）
    c = mix(c, mix(c, sc * 1.1, 0.38), mix(smoothstep(-0.03, 0.04, litS) * 0.5, aastep(0.006, litS), nearS) * nearK);
    c *= 1.0 - 0.07 * aastep(0.014, -litS) * nearS;
    c *= 1.0 + clamp(litL * 1.3, -0.07, 0.07) * nearS;
    // 3) 岛边：两档浅水色（宽距离场 G）
    c = mix(c, aquaC, stepW(0.05, sf.g + wob, sgW * 0.7 + 1e-4) * 0.6);
    c = mix(c, aquaC2, stepW(0.17, sf.g + wob, sgW * 0.7 + 1e-4) * 0.62);
    // 4) 天光反射：近处按视线角分两档（边随浪起伏），远处换成平滑的（两档在远处会变成一条条横纹）；
    //    远处只反射地平线的颜色（加上天顶的蓝会和青、暖雾混成发灰的颜色）
    //    两档的边只跟着短浪抖（跟着长浪会变成一两大块滑来滑去的硬边）
    vec3 Nf = normalize(vec3(-gr * mix(0.7, 0.2, smoothstep(120.0, 450.0, dist)), 1.0).xzy), Nq = normalize(vec3(-(gS + gL * 0.25) * 0.8, 1.0).xzy);
    vec3 R = reflect(-V, Nf);
    vec3 skyR = mix(skyHorizon(R, sunD, skyWarm, skyCool), skyUp, smoothstep(0.03, 0.45, R.y) * mix(0.3, 1.0, nearK));
    float fr = pow(1.0 - max(dot(Nf, V), 0.0), 4.0), fq = pow(1.0 - max(dot(Nq, V), 0.0), 4.0);
    float frq = 0.45 * aastep(0.2, fq) + 0.3 * aastep(0.45, fq);
    float rk = mix(min(fr * 0.7, 0.5), frq, 0.65 * (1.0 - smoothstep(90.0, 220.0, dist)) * (1.0 - smoothstep(0.02, 0.06, fwidth(fq)))) * 0.8;
    rk *= mix(0.6, 1.0, smoothstep(8.0, 70.0, dist)) * (1.0 - 0.65 * smoothstep(120.0, 420.0, dist));   // 镜头贴水时脚下别反射成一片白；远处少反射一点（青和暖雾混成灰）
    c = mix(c, skyR, rk);
    // 5) 近处的小涟漪（只影响光照，不改几何）：掠水时水面不是一片平
    vec3 Nr = normalize(vec3(-gr * mix(1.0, 0.3, smoothstep(120.0, 450.0, dist)), 1.0).xzy);   // 远处的浪坡压平：太阳亮带不碎成一条条横纹
    if (dist < 160.0) {
      vec2 rp = p * 0.55;
      vec2 dn = vec2(cos(rp.x + uT * 1.9 + sin(rp.y * 0.7 + uT * 0.5) * 1.4), cos(rp.y * 1.15 - uT * 1.6 + sin(rp.x * 0.8) * 1.4));
      Nr = normalize(N + vec3(dn.x, 0.0, dn.y) * 0.04 * (1.0 - smoothstep(30.0, 160.0, dist)));
    }
    // 6) 太阳：反射方向上一条柔和的亮带 + 带里的小星点（每颗约 5 秒亮一次，慢慢亮慢慢暗）
    vec3 Hs = normalize(sunD + V);
    float lane = pow(max(dot(Nr, Hs), 0.0), 70.0);
    c += sunC * (pow(max(dot(Nr, Hs), 0.0), 700.0) * 0.55 + lane * 0.12);
    #ifndef LOW
    if (dist < 160.0) {
      vec2 gq = p / 2.4, gi = floor(gq);
      vec2 gp = (gi + 0.2 + 0.6 * vec2(hash12(gi), hash12(gi + 17.0))) * 2.4;
      float tw = sin(uT * 1.2 + hash12(gi + 5.0) * 6.2832) * step(0.5, hash12(gi + 9.0));
      vec2 q = abs(p - gp) / max(0.22, gpx * 1.4);
      float star = 1.0 - smoothstep(0.6, 1.0, min(q.x * 3.0 + q.y, q.x + q.y * 3.0));   // 四角小星
      float laneB = pow(max(dot(normalize(N + vec3(0.0, 1.5, 0.0)), Hs), 0.0), 200.0);
      c += vec3(1.0, 0.97, 0.88) * star * smoothstep(0.75, 0.95, tw) * smoothstep(0.15, 0.55, laneB) * 1.3 * (1.0 - smoothstep(70.0, 160.0, dist));
    }
    #endif
    // 7) 浪尖白沫：一截截顺着浪尖的白线 = 短浪高度的等高线（宽度按米算，粗细均匀），断成一截截、两头尖，跟着浪走；
    //    浪的前坡（往前走的一面）粗、后坡细；长浪的浪尖上稍多一点（只是多一点，不会一阵有一阵没有）
    //    线宽 = 到等高线的距离（米）= |F - 0.55| / 坡度（坡度用公式：边干净；挪位置、噪声没算进去，线宽有 ±三成的变化，像手画的）
    float F = hS * 2.0 * amp + (nM.g - 0.5) * 0.5 + h * 0.05;
    vec2 gF = gS * 2.0; float gFl = max(length(gF), 0.015), flatK = smoothstep(0.025, 0.055, gFl);   // 平的地方（坡度太小）不画线：不会变成一团、一圈
    float front = smoothstep(-0.1, 0.4, dot(gF / gFl, vec2(0.7071)));
    float laceK = 1.0 - smoothstep(0.3, 0.8, gpx);                     // 一个像素超过 0.3~0.8 米就淡掉
    float d3 = length(vW - cameraPosition), wN = mix(0.4, 1.0, smoothstep(5.0, 35.0, d3));   // 镜头近处线细一点（贴水飞时不成一大块白）
    float crest = lineM(abs(F - 0.55) / gFl, mix(0.05, 0.65, front) * dashA * wN, gpx) * mix(0.35, 1.0, front) * flatK * laceK;
    vec2 gHC = cos(c1) * 0.6 * K1 + cos(c2) * 0.4 * K2;
    float gCl = max(length(gHC), 0.015), frontC = smoothstep(-0.1, 0.4, -dot(gHC / gCl, vec2(-0.6314, -0.7755)));   // 碎浪也只画往前走的一面（不画成小圈）
    crest = max(crest, lineM(abs(hC - 0.78) / gCl, 0.28 * dashB * frontC * wN, gpx) * smoothstep(0.03, 0.07, gCl) * mix(0.5, 1.0, smoothstep(-0.3, 0.4, F)) * laceK);   // 碎浪上的小白线（大浪尖附近多）
    #ifndef LOW
    float streak = lineM(abs(F + 0.35) / gFl, 0.1 * dashB, gpx) * flatK * laceK * 0.6;   // 浪谷那边一条更细更淡的
    crest = max(crest, streak);
    #endif
    crest *= 0.75 * smoothstep(3.0, 12.0, d3);   // 镜头贴着水面时，脚下的花纹会变得很大：近处淡掉
    // 8) 岛边白沫：贴岸一条硬边白线（约 1.2 米宽）+ 再往岸上是薄薄一层浅色的水 + 近岸一条断断续续的白线 + 两条往岸上推的浪线
    float bw = clamp(fsW / gpx * 1.2, 0.015, 0.12);                     // 1.2 米换成岸线场的数值
    float swash = stepW(0.37 + bw, fs, fsW * 0.7 + 1e-4);
    float shore = stepW(0.37, fs, fsW * 0.7 + 1e-4) * (1.0 - swash);
    float fsG = max(fsW / gpx, 1e-3);                                   // 岸线场每米变多少
    shore = max(shore, lineM(abs(fs - 0.25) / fsG, 0.22 * dashA, gpx) * laceK);   // 近岸一条断断续续的白线
    for (int k = 0; k < 2; k++) {
      float ph = fract(uT * 0.14 + float(k) * 0.5);
      float lv = mix(0.04, 0.33, ph), hw = fsW / gpx * (0.12 + 0.2 * (1.0 - ph));
      shore = max(shore, (1.0 - smoothstep(hw, hw + fsW * 0.9 + 1e-5, abs(fs - lv))) * smoothstep(0.0, 0.2, ph) * (1.0 - smoothstep(0.75, 1.0, ph)) * mix(0.55, 1.0, nM.g));
    }
    c = mix(c, mix(aquaC2, foamC, 0.4), swash * 0.8);
    // 9) 合起来：觅食点的乱水 → 影子 → 白沫
    c = mix(c, mix(c, aquaC2, 0.6), sp.y * 0.6);
    c = mix(c, shC, shadowAt(p, false, nM.b) * 0.55 * smoothstep(0.15, 0.4, V.y));   // 贴着水面斜着看时不画影子（会像一个黑洞）
    float foam = max(max(crest, shore), sp.x);
    c = mix(c, foamC, foam);
  } else {
    vec3 R = normalize(vW - cameraPosition);
    float cu = dot(R, N);
    // 镜头离水面很近时，窗口的边会变成横在屏幕上的一大条浅色带：近处的窗口和光网淡掉
    float wk = mix(smoothstep(2.0, 9.0, length(vW - cameraPosition)), 1.0, smoothstep(2.0, 5.0, uDepth));
    float win = (smoothstep(0.64, 0.68, cu) * 0.75 + smoothstep(0.74, 0.8, cu) * 0.25) * wk;   // 斯涅尔窗：抬头 48° 以内看得到天（两档，边随浪抖）
    c = mix(uwTir * mix(0.55, 1.0, smoothstep(0.05, 0.5, cu)), uwWin, win);   // 窗外是全反射：越斜越暗
    vec2 q = p * 0.42;                                                 // 水面下侧的光网
    float ra = sin(q.x * 1.7 + uT * 0.9 + sin(q.y * 2.3 + uT * 0.7) * 1.3), rb = sin(q.y * 1.9 - uT * 0.8 + sin(q.x * 1.4 - uT * 0.6) * 1.3);
    float rip = smoothstep(0.42, 0.52, pow(max(0.0, 1.0 - abs(ra + rb) * 0.8), 5.0)) * smoothstep(0.15, 0.4, R.y) * (1.0 - smoothstep(12.0, 40.0, dist)) * wk;
    c = mix(c, mix(uwWin, vec3(1.0), win * 0.6), rip * 0.35);
    float sg = max(dot(R, sunW), 0.0);
    c += uwSun * (pow(sg, 8.0) * 0.45 + smoothstep(0.965, 0.98, sg) * 0.5) * (0.35 + 0.65 * win);
    c = mix(c, uwShC, shadowAt(p, true, nM.b));
    c = mix(c, foamC, sp.x * 0.55 * smoothstep(0.05, 0.25, R.y));       // 远处斜着看的白沫也压成线，淡掉
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createSea(ctx) {
  const { scene, camera, renderer } = ctx;
  const SUN = (ctx.sun || SKY_SUN).clone().normalize();
  // 水下看太阳：折射后更陡（入射角 sin 除以 1.33）
  const sh = Math.hypot(SUN.x, SUN.z), sinW = Math.sqrt(1 - SUN.y * SUN.y) / 1.33;
  const sunW = new THREE.Vector3(SUN.x / sh * sinW, Math.sqrt(1 - sinW * sinW), SUN.z / sh * sinW);
  const shA = Array.from({ length: MAXSH }, () => new THREE.Vector4()), shB = Array.from({ length: MAXSH }, () => new THREE.Vector4());
  const spots = Array.from({ length: MAXSPOT }, () => new THREE.Vector4());
  const C = h => new THREE.Color(h);
  const shore = renderer && !(typeof location !== 'undefined' && location.search.includes('noshore')) ? createShore(renderer, scene) : null;   // ?noshore 调试用
  const U = {   // 三圈共用的 uniform（同一个对象，改一处三圈都变）
    uT: { value: 0 }, uUnder: { value: 0 }, uDepth: { value: 0 }, uCam: { value: new THREE.Vector3() },
    deepC: { value: C(0x0d5a7c) }, shallowC: { value: C(0x2a9db4) },     // 翠岛海：青蓝
    deepV: { value: C(0x0c3a52) }, shallowV: { value: C(0x23748a) },     // 火山海：暗
    deepO: { value: C(0x0a3b6a) }, shallowO: { value: C(0x1f72a8) },     // 外海：深蓝
    farC: { value: C(0x5bbfd6) },                                         // 远处的海
    aquaC: { value: C(0x2fb4bc) }, aquaC2: { value: C(0x6ad8cc) },      // 岛边浅水：两档
    foamC: { value: C(0xf6fcfc) }, sunD: { value: SUN }, sunC: { value: C(0xfff0d0) }, shC: { value: C(0x0a3348) },
    skyUp: { value: SKY.upper }, skyWarm: { value: SKY.warm }, skyCool: { value: SKY.cool },
    sunW: { value: sunW }, uwWin: { value: C(0x86dde8) }, uwTir: { value: C(0x2a8a9c) }, uwSun: { value: C(0xfffbe6) }, uwShC: { value: C(0x0b3a48) },
    uShore: { value: shore ? shore.tex : null }, uShoreR: { value: shore ? shore.region : new THREE.Vector4() }, uNoise: { value: seaNoise() },
    uShA: { value: shA }, uShB: { value: shB }, uShN: { value: 0 }, uSpot: { value: spots }, uSpotN: { value: 0 },
  };
  const group = new THREE.Group(); group.name = 'sea'; scene.add(group);
  const rings = RING.map((s, i) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...U,
        uMorph: { value: new THREE.Vector3(i < 2 ? HALF[i] * .7 : 1e9, i < 2 ? HALF[i] - RING[i] : 2e9, RING[Math.min(i + 1, 2)]) },   // 最外一排格子完全贴合外圈
        uHole: { value: new THREE.Vector4(0, 0, i === 1 ? HALF[0] : 0, 0) } },
      vertexShader: VERT, fragmentShader: FRAG, fog: true, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(ringGeo(N, s, i === 2 ? N / 4 : 0), mat);   // 外圈中间挖掉 12×12 格 = 中圈
    m.frustumCulled = false; m.name = 'seaRing' + i; group.add(m);
    m.renderOrder = 1;   // 不透明的里面最后画：岛、龙挡住的海面先被深度测试挡掉（海的像素着色最费）
    return m;
  });

  const bed = createSeabed(ctx); group.add(bed.group);
  const shafts = createShafts(sunW); group.add(shafts.mesh);

  // ---- 水下雾：水上的雾每帧记下来（别的模块改了也认），水下按深度混到水下色 ----
  const air = { color: new THREE.Color(0xc8dcec), near: 180, far: 900, set: false };
  const last = { color: new THREE.Color(), near: -1, far: -1 };
  let ownFog = null, savedBg = null, skyHidden = false, camInit = false;
  const uwC = new THREE.Color(), bgC = new THREE.Color();
  function skyObj() { const s = ctx.sky; return !s ? null : s.isObject3D ? s : (s.mesh || s.group || s.obj || null); }
  function setSky(vis) {
    if (vis === !skyHidden) return;
    skyHidden = !vis;
    const o = skyObj(); if (o) o.visible = vis; else if (ctx.sky && ctx.sky.setVisible) ctx.sky.setVisible(vis);
    if (!vis) { savedBg = scene.background; scene.background = bgC; } else if (scene.background === bgC) scene.background = savedBg;
  }

  const _d = new THREE.Vector3(), lastCam = new THREE.Vector3();
  const api = {
    group, bed, shore, underwater: 0, waveT: 0, depth: 0, fogColor: uwC,
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
      // 镜头瞬移（开局、传送）时直接到位，不然开局在水下的头几帧是水上的雾（一片灰白）
      const jump = !camInit || lastCam.distanceTo(cam) > 25;
      lastCam.copy(cam); camInit = true;
      api.underwater = jump ? (under ? 1 : 0) : clamp(api.underwater + (under ? 1 : -1) * Math.min(dt, .1) / .25, 0, 1);
      const k = api.underwater;
      api.depth = Math.max(0, surf - cam.y);
      U.uUnder.value = under ? 1 : 0; U.uDepth.value = api.depth;
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
        // 天空在镜头穿过水面的那一帧就切换了，雾也跟着一下子切（入水不会有几帧发白，出水远处的岛和云不会有几帧变成青色剪影）
        const kc = under ? 1 : 0, kr = kc;
        fog.color.copy(air.color).lerp(uwC, kc);
        fog.near = air.near + (8 - dk * 2 - air.near) * kr;
        fog.far = 1 / (1 / air.far + (1 / (120 - dk * 15) - 1 / air.far) * kr);   // 按「能见度」插值，入水头几帧就收拢
        last.color.copy(fog.color); last.near = fog.near; last.far = fog.far;
        if (fog === ownFog && !under) { scene.fog = null; ownFog = null; }
        bgC.copy(fog.color);
      }
      setSky(!under);
      rings[2].visible = k < 1;                    // 完全在水下时外圈（264 米以外）全在雾里，不画
      rings[1].visible = !(under && api.depth > 22);   // 深水里抬头看，内圈以外的海面也全在雾里

      if (shore && !under) { camera.getWorldDirection(_d); shore.update(cam, time, _d); }
      writeShadows(S, alpha, wt);
      bed.update(S, cam, wt, k, under, uwC, dt);
      shafts.update(cam, wt, under ? k : 0, api.depth);
    },
    // 画质：0 低档（海面不画小星点和浪尖细线、海底的石头 / 海藻不画描边），1 以上正常
    setQuality(q) {
      bed.setQuality(q);
      const low = q < 1;
      for (const r of rings) { const m = r.material, has = 'LOW' in m.defines; if (has !== low) { if (low) m.defines.LOW = ''; else delete m.defines.LOW; m.needsUpdate = true; } }
    },
    dispose() {
      scene.remove(group); bed.dispose(); shore && shore.dispose();
      for (const r of rings) { r.geometry.dispose(); r.material.dispose(); }
      setSky(true);
    },
  };

  // ---- 影子：鱼影（海面上，天上看得到）、龙影、鸟影（海面下侧，水下看得到）；最多 16 个。对象都复用，不每帧新建 ----
  const P3 = { x: 0, y: 0, z: 0 };
  const lerpP = (o, a) => { if (o.px === undefined) { P3.x = o.x; P3.y = o.y; P3.z = o.z; } else { P3.x = o.px + (o.x - o.px) * a; P3.y = o.py + (o.y - o.py) * a; P3.z = o.pz + (o.z - o.pz) * a; } return P3; };
  const candPool = [], clPool = [], cand = [], clusters = [], spotPool = [], spotList = [];
  const byD = (a, b) => a.d2 - b.d2;
  function writeShadows(S, alpha, wt) {
    let n = 0;
    const cam = camera.position, put = (x, z, a, b, sy, cy, k, kind) => { if (n < MAXSH && k > .01) { shA[n].set(x, z, a, b); shB[n].set(sy, cy, k, kind); n++; } };
    if (S && S.hero) {
      const h = S.hero, { x, y, z } = lerpP(h, alpha), len = h.len || 8, surf = waveH(x, z, wt);
      if (y > surf && y < 40) { const r = len * .22 + (y - surf) * .06; put(x, z, r, r, 0, 1, .4 * (1 - sstep(8, 40, y - surf)) * sstep(2.5, 7, camera.position.y - surf), 1); }   // 镜头贴着水面时不画（斜着看像个黑洞）
      else if (y <= surf && y > -8) put(x, z, len * .5, len * .15, Math.sin(h.yaw || 0), Math.cos(h.yaw || 0), .5 * (1 - sstep(1, 8, surf - y)), 0);
    }
    cand.length = 0; clusters.length = 0;
    if (S && S.creatures) for (const c of S.creatures) {
      const sp = SPECIES[c.sp]; if (!sp) continue;
      const isAir = sp.hab === 'air';
      const { x, y, z } = lerpP(c, alpha);
      if (isAir ? y >= 25 : y <= -6) continue;
      const d2 = (x - cam.x) ** 2 + (z - cam.z) ** 2;
      if (d2 > 260 * 260) continue;
      const o = candPool[cand.length] || (candPool[cand.length] = {});
      o.c = c; o.x = x; o.y = y; o.z = z; o.d2 = d2; o.air = isAir; o.sp = sp; cand.push(o);
    }
    cand.sort(byD);
    // 鱼群合成一团影子：离团心 7 米内的并进去
    for (const o of cand) {
      if (o.air) { if (clusters.length + n < MAXSH) { const q = clPool[clusters.length] || (clPool[clusters.length] = { fish: [] }); q.bird = o; q.fish.length = 0; clusters.push(q); } continue; }
      let cl = null;
      for (const q of clusters) if (!q.bird && (q.ax - o.x) ** 2 + (q.az - o.z) ** 2 < 49) { cl = q; break; }
      if (!cl) { if (clusters.length + n >= MAXSH) continue; cl = clPool[clusters.length] || (clPool[clusters.length] = { fish: [] }); cl.bird = null; cl.fish.length = 0; cl.ax = o.x; cl.az = o.z; clusters.push(cl); }
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
    // 觅食点：最近的 8 个；没鱼了（empty 在涨）就慢慢淡掉
    let m = 0;
    if (S && S.spots) {
      spotList.length = 0;
      for (const s of S.spots) { const d2 = (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2; if (d2 < 900 * 900) { const o = spotPool[spotList.length] || (spotPool[spotList.length] = {}); o.s = s; o.d2 = d2; spotList.push(o); } }
      spotList.sort(byD);
      for (const { s } of spotList) {
        if (m >= MAXSPOT) break;
        const k = s.k !== undefined ? s.k : 1 - sstep(4, 18, s.empty || 0);
        spots[m++].set(s.x, s.z, (s.r || 6) * 1.1, k);
      }
    }
    U.uSpotN.value = m;
  }
  return api;
}
