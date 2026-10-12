// 岛：AI 概念图 → Tripo 智能网格 → Blender 归一化的精模（models/env/*.glb，见 blender/env_island.py）。
// 每座岛 = 共用的网格（LOD0 / LOD1 / LOD2）× 自己的缩放 / 朝向（来自 sim/world.js 的岛表），卡通着色 + 背面外扩描边。
// 水下：Tripo 原模在海平面下约半米（形状表的 cut）切掉，下面是 env_island.py 生成的岩基（按原模外轮廓往下台阶状张开，
// 带石脊、鼓包，切口用盖子封住）。岩基在顶点着色器里竖直拉长 uK 倍（和 world.js 的碰撞高度图同一个 k）伸到海底；
// 颜色不用贴图：按世界坐标画（近水面是按岛的种类上色的湿岩石，往下变蓝灰）+ 层理暗线 + 竖的裂缝 + 台阶上的沙 / 苔 / 珊瑚色斑 /
// 藤壶点 + 卡通焦散，岩基的面按三角形算法线（块面感，不像一面光滑的鼓）。
// 海面不透明：镜头在水上只画水上的三角形，在水下只画水下的（同一份顶点，两套索引），三角面省一半；水下那套是双面材质（万一有缝，看到的是石头不是黑洞）。
// 岸边一圈白沫 + 湿的深色带（跟着浪走）；火山：非熔岩的像素换成冷灰的玄武岩（和红褐色的火龙拉开），熔岩按底色贴图挑出来加自发光，
// 慢慢明暗（不闪），火山口一圈暖光；绿岛：陡的黄褐色崖面染成暖灰岩石 + 层理（不再像一整块沙岩台子）。
// 岛按 PERIOD 循环：每帧把每座岛摆到离镜头最近的那一份；雾外的不画；远的换 LOD1 / LOD2（切换距离有 ±10% 回差，不来回跳）。
// 精模下载失败（或形状表为空）时退回原来的程序化剖面岛。
// 接口：createIslands(ctx) → { list, ready（出生点附近的模型下载完）, all, update(camera, time, dt, waveT?), smokePoints() }
import * as THREE from 'three';
import { GLTFLoader } from '../../lib/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from '../../lib/jsm/utils/BufferGeometryUtils.js';
import { islands, wrapP, heightAt, waveH, WAVE_GLSL } from '../sim/world.js';
import { SHAPES } from '../config/island-shapes.js';
import { makeRng, hash3, lerp } from '../sim/rng.js';
import { GRAD, outlineMat } from './toon.js';

const BASE = new URL('../../', import.meta.url);   // 游戏根目录（_lab 里的试验页也能找到 models/）
const C = h => new THREE.Color(h);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const FOG_FAR = 920;                                // 雾在 900 米全满：再远的岛不画
const OUTLINE_C = { volcano: 0x1c1a20, green: 0x1e2816, spire: 0x2a2018 };
const TIME = { value: 0 }, UNDER = { value: 0 };
// 岩基近水面的湿岩石颜色（sRGB）：火山 = 冷灰玄武岩，绿岛 = 暖灰，石柱 = 灰褐（往下慢慢混进蓝灰）
const WET = { volcano: [.25, .26, .3], green: [.47, .44, .39], spire: [.5, .46, .41] };
// 熔岩挑选的阈值（贴图像素的 r - max(g·0.62, b)，线性色），默认 [0.1, 0.38]
const LAVA_T = {};
// 熔岩裂缝的亮度（火山形状）：volcano_b 外面几乎没有熔岩河，加一张发光细缝网
const VEINS = { volcano_b: 1 };

// ---------------------------------------------------------------- 精模材质
// 岸边：岛面和浪面相交的地方画一圈白沫 + 湿的深色带（浪用 world.js 的 WAVE_GLSL，和海面同一个公式、同一个时间）
const WAVE = { value: 0 }, FOAM = { value: 0 };
const CAUS_FN = `float islCausF(vec2 p, float t){ p *= 0.16;
  float a = sin(p.x * 1.7 + t * 0.9 + sin(p.y * 2.3 + t * 0.7) * 1.3);
  float b = sin(p.y * 1.9 - t * 0.8 + sin(p.x * 1.4 - t * 0.6) * 1.3);
  return pow(max(0.0, 1.0 - abs(a + b) * 0.8), 5.0); }
float islHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`;
// 火山：非熔岩的像素 → 冷灰玄武岩（按亮度，提亮一点），熔岩边上留一点暖色
const VOLCANO_COL = `
 vec3 islTex = diffuseColor.rgb;
 float islLv = 0.0;
#ifdef ISL_LAVA
 { vec3 c = islTex; float lr = c.r - max(c.g * .62, c.b);
   islLv = smoothstep(uLava.x, uLava.y, lr);
   float warm = smoothstep(.03, .2, lr);
   float lum = dot(c, vec3(.3, .59, .11));
   vec3 bas = lum * vec3(.86, .95, 1.18) * 2.3 + vec3(.012, .014, .02);
   vec3 lav = mix(vec3(.6, .07, .01), vec3(.95, .3, .03), smoothstep(.3, .9, islLv));
   diffuseColor.rgb = mix(mix(bas, c, warm * .4), lav * .5, islLv); }
#endif
#ifdef ISL_GREEN
 { vec3 c = islTex; float gr = c.g / max(c.r, 1e-3);
   float tanc = smoothstep(.02, .08, c.r - c.b) * smoothstep(.55, .7, gr) * (1.0 - smoothstep(.93, 1.0, gr));
   float steep = 1.0 - smoothstep(.42, .68, vIslN.y);
   float lum = dot(c, vec3(.3, .59, .11));
   float sb = smoothstep(.38, .48, abs(fract(vIslW.y * .3 + sin(vIslW.x * .05 + vIslW.z * .043) * .7) - .5));
   vec3 rock = lum * vec3(1.02, .93, .82) * .92 * (1.0 - .32 * sb) * (.92 + .16 * sin(vIslW.y * 1.7 + vIslW.x * .2));
   diffuseColor.rgb = mix(c, rock, tanc * steep * smoothstep(.3, 1.2, vIslW.y) * .9);
   // Tripo 把树干烤成了大红：压成红褐色的树皮
   float red = smoothstep(.15, .35, c.r - c.g * 2.0);
   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.2, .085, .04) * (.75 + 1.5 * lum), red * .85); }
#endif`;
// 水下的岩石（程序化岩基 + 原模水线下的那一点）：近水面是按种类上色的湿岩石，往下慢慢变蓝灰，越深越暗；
// 层理（横的暗线）+ 竖的裂缝（只在壁上）；朝上的台阶积沙 / 苔，稀疏的珊瑚色斑（粉 / 赭）；浅处一些藤壶点；朝上的面加卡通焦散
const UNDER_ROCK = `
 float islCaus = 0.0;
 float islSk = 1.0 - smoothstep(uCut - 8e-4, uCut + 8e-4, vIslO);
 float islUw = max(islSk, 1.0 - smoothstep(-2.4, -.4, vIslW.y));
 vec3 islDw = fwidth(vIslW);                    // 导数在分支外面算（分支里的不可靠），线宽按它估
 if (islUw > 0.0) {
   vec3 q = vIslW;
   float n1 = sin(q.x * .09 + sin(q.z * .07 + q.y * .05) * 2.2) * sin(q.z * .1 + sin(q.x * .06 + q.y * .04) * 2.0);
   float n2 = sin(q.x * .31 - q.z * .27 + q.y * .23) * sin(q.z * .35 + q.y * .29 - q.x * .11);
   float dp = smoothstep(-1.5, -16.0, q.y);
   vec3 blue = mix(vec3(.26, .37, .44), vec3(.41, .53, .59), clamp(.5 + .38 * n1 + .18 * n2, 0., 1.));
   vec3 rk = mix(uWet * (.88 + .2 * n1 + .08 * n2), blue, .25 + .55 * dp);
   float up = smoothstep(.45, .8, vIslN.y);
   // 层理：条带一明一暗 + 条带之间断断续续的细暗线
   float s = q.y * .16 + n1 * .7 + n2 * .2, sw = islDw.y * .2 + (islDw.x + islDw.z) * .06;
   rk *= .92 + .1 * step(.5, fract(s * .5));
   float lh = smoothstep(.47 - sw, .5 - sw * .4, abs(fract(s) - .5)) * smoothstep(-.1, .4, n2 + .5 * sin(q.x * .05 + q.z * .07));
   // 竖的裂缝：一个 xz 平面上的函数的零线和竖直的壁相交 = 竖线；一段一段的，稀疏
   float cv = sin(q.x * .17 + sin(q.z * .13) * 1.6) * sin(q.z * .15 + sin(q.x * .11) * 1.6), cw = (islDw.x + islDw.z) * .3;
   float lv = (1.0 - smoothstep(.012, .012 + cw * 1.2, abs(cv))) * smoothstep(.45, .7, sin(q.y * .09 + q.x * .05 + q.z * .04));
   rk *= 1.0 - (.28 * lh + .32 * lv) * (1.0 - up);
   // 台阶：积一点沙 / 苔（同一块石头提亮、偏暖或偏绿，不另换颜色），偶尔一小块珊瑚色（粉 / 赭）
   vec3 led = rk * mix(vec3(1.32, 1.24, 1.04), vec3(1.04, 1.22, .97), smoothstep(-.2, .35, n2));
   float cp = smoothstep(.86, .96, sin(q.x * .23 + n1 * 2.0) * sin(q.z * .25 - n2 * 1.5));
   led = mix(led, mix(vec3(.82, .5, .54), vec3(.8, .62, .36), step(0., n1)), cp * .7);
   rk = mix(rk, led, up * .75);
   // 藤壶：浅处的小白点（三维格子里的小球和表面相交 = 小圆点），远了不画（会闪）
   { vec3 g = q * .75; vec3 id = floor(g); float hh = islHash(id); vec3 f = fract(g) - .5 + (vec3(islHash(id + 7.1), islHash(id + 3.7), islHash(id + 5.3)) - .5) * .4;
     float bd = (1.0 - smoothstep(.14, .2, length(f))) * step(.88, hh) * (1.0 - smoothstep(-3.0, -14.0, q.y)) * (1.0 - smoothstep(20.0, 36.0, distance(q, cameraPosition)));
     rk = mix(rk, rk * vec3(1.45, 1.4, 1.25) + .06, bd * .7); }
   rk *= mix(1.0, .74, smoothstep(-10.0, -45.0, q.y));
   diffuseColor.rgb = mix(diffuseColor.rgb, pow(rk, vec3(2.2)), islUw);
   islCaus = up * islUw * (1.0 - smoothstep(6.0, 40.0, -q.y)) * (smoothstep(.36, .46, islCausF(q.xz, uTime)) * .7 + smoothstep(.5, .62, islCausF(q.xz * 1.9 + 7.0, uTime * 1.3)) * .3);
 }`;
function bodyMat(map, kind, U, side) {
  const m = new THREE.MeshToonMaterial({ map, gradientMap: GRAD, side });
  if (kind === 'volcano') m.defines = { ISL_LAVA: '' };
  else if (kind === 'green') m.defines = { ISL_GREEN: '' };
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U, { uTime: TIME, uWaveT: WAVE, uFoam: FOAM });
    sh.vertexShader = 'uniform float uK;\nvarying vec3 vIslW, vIslN;\nvarying float vIslO;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n if (position.y < 0.0) objectNormal.y /= uK;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vIslO = position.y;\n if (transformed.y < 0.0) transformed.y *= uK;\n vIslW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vIslN = inverseTransformDirection(normalMatrix * objectNormal, viewMatrix);');
    sh.fragmentShader = 'uniform float uTime, uWaveT, uFoam, uCut, uVeins;\nuniform vec3 uWet, uCrater;\nuniform vec2 uLava;\nvarying vec3 vIslW, vIslN;\nvarying float vIslO;\n' + WAVE_GLSL + '\n' + CAUS_FN + '\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>${VOLCANO_COL}${UNDER_ROCK}
 float islFoam = 0.0;
 if (uFoam > 0.5 && abs(vIslW.y) < 4.0) {
   float wl = waveH(vIslW.xz, uWaveT) * (1.0 - smoothstep(150.0, 262.0, length(vIslW.xz - cameraPosition.xz)));
   float dy = vIslW.y - wl;
   float nz = sin(vIslW.x * .7 + uWaveT * 1.3) * sin(vIslW.z * .63 - uWaveT * 1.1) * .5 + sin((vIslW.x - vIslW.z) * 1.9 + uWaveT * 2.0) * .25;
   islFoam = smoothstep(-.4, -.1, dy) * (1.0 - smoothstep(.3 + .3 * nz, .7 + .3 * nz, dy));
   float wet = smoothstep(-.4, 0.0, dy) * (1.0 - smoothstep(.5, 2.0, dy));
   diffuseColor.rgb *= 1.0 - .28 * wet;
   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, .96, 1.0), islFoam * .85);
 }`)
      // 岩基：按三角形算法线（块面感）。导数要在分支外面算
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
 { vec3 fn = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition))); normal = normalize(mix(normal, fn, step(.5, islSk) * .85)); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 totalEmissiveRadiance += vec3(.32, .36, .38) * islFoam + vec3(.36, .5, .54) * islCaus * .32;
#ifdef ISL_LAVA
 if (islLv > 0.0) totalEmissiveRadiance += mix(vec3(.6, .07, .01), vec3(.95, .3, .03), smoothstep(.3, .9, islLv)) * islLv * (.7 + .1 * sin(uTime * 1.7 + vIslW.x * .08 + vIslW.y * .11));
 { vec3 dc = vIslW - uCrater; dc.y *= 1.6;                   // 火山口里一圈暖光（扁的椭球）
   float cd = length(dc) / max(uCrater.y * .36, 1.0);
   if (cd < 1.0) totalEmissiveRadiance += vec3(1.0, .3, .05) * (1.0 - cd) * sqrt(1.0 - cd) * (.32 + .05 * sin(uTime * 1.3)) * (1.0 - islUw) * (1.0 - islLv); }
 // 熔岩裂缝（uVeins，volcano_b：外面几乎没有熔岩河，飞行镜头看不出是火山）：山腰到口沿一张稀疏的发光细缝网
 if (uVeins > 0.0) {
   vec3 q = vIslW - uCrater;
   float hgt = vIslW.y / max(uCrater.y, 1.0);
   float f = sin(q.x * .07 + sin(q.z * .06 + q.y * .05) * 1.9) * sin(q.z * .065 + sin(q.x * .05 - q.y * .04) * 1.9) + .3 * sin(q.y * .17 + q.x * .1 - q.z * .06)
           + .07 * sin(q.x * .41 + q.y * .37) * sin(q.z * .39 - q.y * .33);   // 细的抖动：像裂缝，不像等高线
   float seg = smoothstep(-.15, .35, sin(q.x * .045 - q.z * .05 + q.y * .08) + .5 * sin(q.z * .11 + q.y * .06));   // 一段一段的，粗细不一
   float fw = fwidth(f);
   float vein = (1.0 - smoothstep(.006 + .014 * seg, .006 + .014 * seg + fw * 1.3, abs(f))) * seg * smoothstep(.12, .4, hgt) * (1.0 - smoothstep(.95, 1.2, hgt)) * (1.0 - islUw);
   totalEmissiveRadiance += vec3(1.0, .28, .04) * vein * uVeins * (.7 + .1 * sin(uTime * 1.5 + q.y * .1));
 }
#endif`);
  };
  m.customProgramCacheKey = () => 'isl2' + kind;
  return m;
}
// 海面的浪时间：main.js 传进来（update 的第 4 个参数 = sea.waveT）；没传就去场景里找海面材质的 uT
let seaU = null, seaLook = 0;
function findSeaTime(scene) {
  if (seaU || seaLook-- > 0) return seaU;
  seaLook = 60;
  scene.traverse(o => { const u = o.material && o.material.uniforms; if (!seaU && u && u.uT && u.uCam && u.uMorph) seaU = u.uT; });
  return seaU;
}
// 描边壳。水下的雾（120 米就满）会把描边吃掉：水下时描边上的雾只算七成，轮廓在水里也看得清
function hullMat(kind, uK) {
  const m = outlineMat(OUTLINE_C[kind] || 0x2a1e1a, .01, { scene: true,
    extraPars: 'uniform float uK;',
    // 镜头贴着石壁时描边壳会把镜头包进去，整面画成黑的：离镜头 1~5 米内把外扩收回去
    extraVertex: `if (transformed.y < 0.0) { transformed.y *= uK; oN.y /= uK; }
 { float cdist = distance((modelMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);
   transformed -= normalize(oN) * uW * (1.0 - smoothstep(1.0, 5.0, cdist)); }`,
    key: 'isl',
  });
  m.userData.extraUniforms = { uK, uUnder: UNDER };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.fragmentShader = 'uniform float uUnder;\n' + sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * (1.0 - .3 * uUnder);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, ${THREE.ShaderChunk.__skyFog ? 'skyFogTint(fogColor, vFogDir)' : 'fogColor'}, fogFactor);
#endif`);
  };
  return m;
}

// glb 里不存法线（省体积）：按位置焊接后算平滑法线——贴图接缝处法线也连续，描边壳不会裂
function weldedNormals(g) {
  const p = g.attributes.position, n = p.count, idx = g.index;
  const map = new Map(), id = new Int32Array(n); let u = 0;
  for (let i = 0; i < n; i++) {
    const k = Math.round(p.getX(i) * 2e4) + ',' + Math.round(p.getY(i) * 2e4) + ',' + Math.round(p.getZ(i) * 2e4);
    let v = map.get(k); if (v === undefined) { v = u++; map.set(k, v); } id[i] = v;
  }
  const acc = new Float32Array(u * 3), a = V(), b = V(), c = V(), e1 = V(), e2 = V();
  const m = idx ? idx.count : n;
  for (let f = 0; f < m; f += 3) {
    const i0 = idx ? idx.getX(f) : f, i1 = idx ? idx.getX(f + 1) : f + 1, i2 = idx ? idx.getX(f + 2) : f + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    e1.subVectors(b, a).cross(e2.subVectors(c, a));             // 面积加权
    for (const i of [i0, i1, i2]) { const o = id[i] * 3; acc[o] += e1.x; acc[o + 1] += e1.y; acc[o + 2] += e1.z; }
  }
  const nor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const o = id[i] * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
    nor[i * 3] = acc[o] / l; nor[i * 3 + 1] = acc[o + 1] / l; nor[i * 3 + 2] = acc[o + 2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
}
// glb 是量化过的（KHR_mesh_quantization：坐标是 16 位整数、节点缩放 4）：把节点变换乘进坐标，换回浮点（后面的代码都按模型单位算）
function bakeNode(o) {
  const g = o.geometry, p = g.attributes.position;
  o.updateWorldMatrix(true, false);
  if (!p.normalized && p.array instanceof Float32Array && o.matrixWorld.equals(new THREE.Matrix4())) return g;
  const a = new Float32Array(p.count * 3), v = V();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); a[i * 3] = v.x; a[i * 3 + 1] = v.y; a[i * 3 + 2] = v.z; }
  g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.boundingBox = g.boundingSphere = null;
  return g;
}

// 按海平面把三角形分两组（模型单位）：水上组 = 最高点 > -lo（浪谷最低 -2.3 米）；水下组 = 最低点 < hi（浪峰最高 +2.3 米）。
// lo / hi 按用这个形状的岛里最小的竖直缩放换算成 3 米（大岛的阈值小，水上组少画好几圈水下的面）
function splitByWater(g, lo, hi) {
  const p = g.attributes.position, idx = g.index.array, A = [], W = [];
  for (let f = 0; f < idx.length; f += 3) {
    const y0 = p.getY(idx[f]), y1 = p.getY(idx[f + 1]), y2 = p.getY(idx[f + 2]);
    if (Math.max(y0, y1, y2) > -lo) A.push(idx[f], idx[f + 1], idx[f + 2]);
    if (Math.min(y0, y1, y2) < hi) W.push(idx[f], idx[f + 1], idx[f + 2]);
  }
  const mk = list => { const n = new THREE.BufferGeometry(); for (const k in g.attributes) n.setAttribute(k, g.attributes[k]); n.setIndex(list); return n; };
  return { air: mk(A), water: mk(W) };
}

// 贴图「补边」：Tripo 贴图里每块 UV 外面是空白底色，双线性过滤 / mipmap 会把白色混进 UV 边缘，模型上就出现一道道白缝（看起来像碎了）。
// 加载时按 UV 三角形画出「有用的像素」，再从边缘往外一圈圈把颜色抹到空白里（最多 24 像素），白缝就没了。只在加载时做一次。
function dilateMap(map, geo) {
  const img = map.image; if (!img || !img.width) return map;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, w, h), D = px.data;
  const mc = document.createElement('canvas'); mc.width = w; mc.height = h;
  const mg = mc.getContext('2d'); mg.fillStyle = '#fff'; mg.strokeStyle = '#fff'; mg.lineWidth = 1.5; mg.lineJoin = 'round';
  const uv = geo.getAttribute('uv'), idx = geo.index, n = idx ? idx.count : uv.count;
  const fy = map.flipY;
  mg.beginPath();
  for (let i = 0; i < n; i += 3) {
    for (let k = 0; k < 3; k++) {
      const j = idx ? idx.getX(i + k) : i + k, x = uv.getX(j) * w, y = (fy ? 1 - uv.getY(j) : uv.getY(j)) * h;
      k ? mg.lineTo(x, y) : mg.moveTo(x, y);
    }
    mg.closePath();
  }
  mg.fill(); mg.stroke();
  const M = mg.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h), dist = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = M[i * 4] > 127 ? 1 : 0;
  // 广度优先：从有用像素的边缘往外扩
  let q = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (mask[i]) continue;
    if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (y > 0 && mask[i - w]) || (y < h - 1 && mask[i + w])) { q.push(i); dist[i] = 1; }
  }
  for (let d = 1; d <= 24 && q.length; d++) {
    const next = [];
    for (const i of q) {
      const x = i % w, y = (i / w) | 0; let r = 0, gg = 0, b = 0, c = 0;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X; if (!mask[j]) continue;
        r += D[j * 4]; gg += D[j * 4 + 1]; b += D[j * 4 + 2]; c++;
      }
      if (c) { D[i * 4] = r / c; D[i * 4 + 1] = gg / c; D[i * 4 + 2] = b / c; D[i * 4 + 3] = 255; }
    }
    for (const i of q) mask[i] = 1;
    for (const i of q) {
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !mask[j] && !dist[j]) { dist[j] = d + 1; next.push(j); }
    }
    q = next;
  }
  g.putImageData(px, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.flipY = map.flipY; t.wrapS = map.wrapS; t.wrapT = map.wrapT; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 一个形状的 glb → { lod0..2, lod0a / lod0w …（水上 / 水下的三角形）, map }
const loader = new GLTFLoader();
function loadShape(key) {
  const d = SHAPES[key];
  return new Promise((res, rej) => loader.load(new URL(d.file, BASE).href, g => {
    const out = { key, d, map: null };
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const nm = o.name + ' ' + (o.parent && o.parent.name || ''), name = /lod2/i.test(nm) ? 'lod2' : /lod1/i.test(nm) ? 'lod1' : 'lod0';
      if (out[name]) return;
      out[name] = bakeNode(o);
      if (!out.map && o.material && o.material.map) out.map = o.material.map;
    });
    if (!out.lod0) return rej(new Error('glb 里没有网格 ' + key));
    if (!out.lod1) out.lod1 = out.lod0;
    if (!out.lod2) out.lod2 = out.lod1;
    for (const geo of new Set([out.lod0, out.lod1, out.lod2])) if (!geo.attributes.normal) weldedNormals(geo);
    if (out.map) { out.map.anisotropy = 4; out.map.colorSpace = THREE.SRGBColorSpace; try { out.map = dilateMap(out.map, out.lod0); } catch (e) { console.warn('贴图补边失败', e && e.message); } }
    // 海面不透明：镜头在水上时只画碰得到水面以上的三角形（a），在水下时只画水面以下的（w）——共用顶点，只换索引
    const sy = Math.min(...islands.filter(is => is.shape === key).map(is => is.sy), 1e9), th = Math.min(.25, 3 / Math.max(1, sy));
    for (const L of ['lod0', 'lod1', 'lod2']) { const s = splitByWater(out[L], th, th); out[L + 'a'] = s.air; out[L + 'w'] = s.water; }
    // 包围球要算上水下拉长（最多 2.2 倍），否则从水下看会被视锥剔除
    const yLo = d.bottom * 2.3, yHi = d.top, bs = new THREE.Sphere(V(0, (yLo + yHi) / 2, 0), Math.hypot(d.foot * 1.05, (yHi - yLo) / 2));
    for (const L of ['lod0a', 'lod0w', 'lod1a', 'lod1w', 'lod2a', 'lod2w']) out[L].boundingSphere = bs;
    res(out);
  }, undefined, rej));
}

// ---------------------------------------------------------------- 旧的程序化岛（退路）
const islandToon = Object.assign(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }), { flatShading: true });
const islandHull = outlineMat(0x2a1e1a, .45, { scene: true });
const treeHull = outlineMat(0x1e2a18, .28, { scene: true });
const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6a1f, fog: true });

function colorize(g, colorFn) {
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const p = ng.attributes.position, col = new Float32Array(p.count * 3), a = V(), b = V(), c = V(), n = V();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const cc = colorFn((a.y + b.y + c.y) / 3, n.y).multiplyScalar(1 + hash3(a.x, a.y, a.z) * .06);
    for (let k = 0; k < 3; k++) col.set([cc.r, cc.g, cc.b], (i + k) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}
function islandGeo(prof, seg, jit, colorFn) {
  const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = jit * (y < 0 ? .3 : 1);
    pos.setXYZ(i, x + hash3(x, y, z) * k, y + hash3(z, x, y) * k * .6, z + hash3(y, z, x) * k);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return { body: colorize(g, colorFn), hull: g };
}
function buildProcedural(is, grp) {
  const rnd = makeRng(is.seed), { r, h, prof } = is;
  const add = (geo, hull, hullMat = islandHull) => { const m = new THREE.Mesh(geo, islandToon); grp.add(m); m.add(new THREE.Mesh(hull, hullMat)); };
  let smoke = null;
  if (is.kind === 'volcano') {
    const ig = islandGeo(prof, 18, r * .05, (y, ny) => y < -6 ? C(0x2a3a40) : y < 1.5 ? C(0x3a302c) : y > h * .78 ? C(0x2c2422) : ny < .45 ? C(0x5a4a42) : C(0x4a3c36).lerp(C(0x6a3a2a), Math.max(0, y / h - .4)));
    add(ig.body, ig.hull);
    const parts = [new THREE.CircleGeometry(r * .2, 14).rotateX(-Math.PI / 2).translate(0, h * .83, 0)];
    for (let k = 0; k < 3; k++) {
      const a0 = rnd.range(0, 6.28), pts = [];
      for (let t = 0; t <= 1.001; t += .1) { const d = lerp(r * .2, r * .75, t), a = a0 + Math.sin(t * 5 + k) * .15; pts.push(V(Math.cos(a) * d, heightAt(prof, d) + .6, Math.sin(a) * d)); }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, r * .018, 5));
    }
    grp.add(new THREE.Mesh(mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p.toNonIndexed(); })), lavaMat));
    smoke = V(0, h * .9, 0);
  } else if (is.kind === 'green') {
    const ig = islandGeo(prof, 16, r * .06, (y, ny) => y < -6 ? C(0x3a5a5a) : y < 2 ? C(0xd9c48e) : ny < .5 ? C(0x7d7266) : C(0x5f9a4a).lerp(C(0x86b55a), y / h));
    add(ig.body, ig.hull);
    const trees = [], hulls = [];
    for (let k = 0; k < 14; k++) {
      const a = rnd.range(0, 6.28), d = rnd.range(r * .2, r * .75), y = heightAt(prof, d), s = rnd.range(1.3, 2.4);
      const cone = new THREE.ConeGeometry(1.6 * s, 4.2 * s, 7).translate(Math.cos(a) * d, y + 2.6 * s, Math.sin(a) * d);
      cone.deleteAttribute('uv'); hulls.push(cone.clone());
      const base = C(0x3f6e34).multiplyScalar(rnd.range(.85, 1.15));
      trees.push(colorize(cone, (yy, ny) => base.clone().multiplyScalar(ny > .3 ? 1.12 : .92)));
    }
    add(mergeGeometries(trees), mergeGeometries(hulls), treeHull);
  } else {
    const ig = islandGeo(prof, 9, r * .09, (y, ny) => y < -6 ? C(0x34444c) : ny > .7 ? C(0x6f8a52) : C(0x6e625a).lerp(C(0x8a7a6c), Math.max(0, y) / h));
    add(ig.body, ig.hull);
  }
  return smoke;
}


// ---------------------------------------------------------------- 模块
export function createIslands({ scene }) {
  const list = islands.map(is => {
    const grp = new THREE.Group(); grp.visible = false; scene.add(grp);
    return { is, grp, body: null, hull: null, smoke: null, lod: '', lv: -1, uK: { value: is.k || 1 }, hm: null, shape: null, U: null, matA: null, matW: null };
  });
  const procedural = o => { o.smoke = buildProcedural(o.is, o.grp); o.fine = false; };
  const lin = a => new THREE.Vector3(...a.map(c => Math.pow(c, 2.2)));

  // 一个形状下载好 → 用它的岛都挂上网格；下载失败 → 这些岛用程序化的
  const attach = (key, s) => {
    for (const o of list) {
      const is = o.is; if (is.shape !== key) continue;
      if (!s) { procedural(o); continue; }
      o.shape = s; o.fine = true;
      o.U = { uK: o.uK, uCut: { value: s.d.cut ?? -.08 }, uWet: { value: V(...(WET[is.kind] || WET.spire)) }, uCrater: { value: V(0, -1e4, 0) }, uLava: { value: new THREE.Vector2(...(LAVA_T[key] || [.1, .38])) }, uVeins: { value: VEINS[key] || 0 } };
      o.matA = bodyMat(s.map, is.kind, o.U, THREE.DoubleSide);   // 双面：Tripo 网格有细缝，去掉描边壳后会透出天空；背面补上缝
      o.matW = bodyMat(s.map, is.kind, o.U, THREE.DoubleSide);
      o.body = new THREE.Mesh(s.lod0a, o.matA);
      o.hull = new THREE.Mesh(s.lod0a, o.hm = hullMat(is.kind, o.uK));
      o.body.add(o.hull); o.grp.add(o.body);
      o.grp.rotation.y = is.yaw; o.grp.scale.set(is.sx, is.sy, is.sx);
      if (is.smoke) o.smoke = V(is.smoke.x, is.smoke.y, is.smoke.z);
    }
  };
  for (const o of list) if (!o.is.shape || !SHAPES[o.is.shape]) procedural(o);
  const keys = [...new Set(list.map(o => o.is.shape).filter(k => k && SHAPES[k]))];
  const loads = {};
  for (const k of keys) loads[k] = loadShape(k).then(s => attach(k, s), e => { console.warn('岛模型加载失败，用程序化的岛', k, e && e.message); attach(k, null); });
  // ready 只等出生点（原点）附近 600 米内用到的形状；只在远处用的在后台接着下载（all = 全部下载完）
  const near = keys.filter(k => list.some(o => o.is.shape === k && Math.hypot(o.is.x, o.is.z) < 600 + o.is.r));
  const ready = Promise.all(near.map(k => loads[k]));
  const all = Promise.all(keys.map(k => loads[k]));

  return {
    list, ready, all,
    // 火山烟柱的位置（世界坐标，只给看得见的火山），clouds.js 用
    smokePoints() {
      const a = [];
      for (const o of list) if (o.smoke && o.grp.visible) a.push({ x: o.grp.position.x + o.smoke.x, y: o.smoke.y, z: o.grp.position.z + o.smoke.z, id: o.is.id });
      return a;
    },
    // waveT：海面的浪时间（sea.waveT）。不传也行：自己去找海面材质
    update(camera, time, dt, waveT) {
      TIME.value = time;
      if (typeof waveT === 'number') { WAVE.value = waveT; FOAM.value = 1; }
      else { const u = findSeaTime(scene); FOAM.value = u ? 1 : 0; if (u) WAVE.value = u.value; }
      const cx = camera.position.x, cz = camera.position.z;
      const under = camera.position.y < (FOAM.value ? waveH(cx, cz, WAVE.value) : 0);
      UNDER.value = under ? 1 : 0;
      for (const o of list) {
        const x = cx + wrapP(o.is.x - cx), z = cz + wrapP(o.is.z - cz), d = Math.hypot(x - cx, z - cz);
        o.grp.position.set(x, 0, z);
        // 水上看只看得到岸线以内（岩裙在水下，最远到 1.95 倍岸线半径）：按岸线半径算距离；水下按整个岩裙
        const R = under ? (o.is.reach || o.is.r * 2) : o.is.r * 1.25;
        o.grp.visible = d - R < (under ? 170 : FOG_FAR);           // 水下的雾 120 米就满了
        if (!o.fine || !o.grp.visible) continue;
        // LOD：离岸线的距离过阈值 10% 才换（来回飞过阈值时不会一帧一换）
        // 简化模型离得近时看得出破洞（用户反馈「远一点的山都破碎了」）：LOD1 推到 320 米外，LOD2 到 650 米外（快进雾里了）
        const far = d - o.is.r * 1.25, t1 = 1e9, t2 = 1e9, lv = o.lv;   // 不用 LOD（简化模型远看像碎的，用户要求先关掉看看）
        const want = far > t2 * (lv >= 2 ? .9 : 1.1) ? 2 : far > t1 * (lv >= 1 ? .9 : 1.1) ? 1 : 0;
        o.lv = lv < 0 ? (far > t2 ? 2 : far > t1 ? 1 : 0) : want;
        const lod = 'lod' + o.lv + (under ? 'w' : 'a');
        if (lod !== o.lod) { o.lod = lod; o.body.geometry = o.hull.geometry = o.shape[lod]; o.body.material = under ? o.matW : o.matA; }
        // 描边宽度（米）随距离变粗一点，远处的岛也有轮廓；水下再粗一点（雾大）
        o.hm.userData.uW.value = Math.min(1.7, Math.max(.32, (d - o.is.r * .5) * .0022)) * (under ? 1.35 : 1) / o.is.sx;
        if (o.smoke) o.U.uCrater.value.set(x + o.smoke.x, o.smoke.y, z + o.smoke.z);
      }
      lavaMat.color.setHSL(.055, 1, .52 + .05 * Math.sin(time * 2.2));
    },
  };
}
