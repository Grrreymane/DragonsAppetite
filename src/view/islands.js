// 岛：AI 概念图 → Tripo 智能网格 → Blender 归一化的精模（models/env/*.glb，见 blender/env_island.py）。
// 每座岛 = 共用的网格（LOD0 / LOD1 / LOD2）× 自己的缩放 / 朝向（来自 sim/world.js 的岛表），卡通着色 + 背面外扩描边。
// 水下的岩基是 env_island.py 按岸线轮廓生成的台阶状岩裙（Tripo 原模的水下部分太碎），在顶点着色器里竖直拉长 uK 倍
// （和 world.js 的碰撞高度图同一个 k）伸到海底；颜色不用贴图，按世界坐标画蓝灰岩石 + 层理 + 朝上台阶的沙 / 苔 + 卡通焦散。
// 海面不透明：镜头在水上只画水上的三角形，在水下只画水下的（同一份顶点，两套索引），三角面省一半。
// 岸边一圈白沫 + 湿的深色带（跟着浪走）；火山的熔岩：从底色贴图里挑出橙红色的像素加自发光，慢慢明暗（不闪）。
// 岛按 PERIOD 循环：每帧把每座岛摆到离镜头最近的那一份；雾外的不画；远的换 LOD1 / LOD2。
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
const OUTLINE_C = { volcano: 0x24170f, green: 0x1e2816, spire: 0x2a2018 };
const TIME = { value: 0 };

// ---------------------------------------------------------------- 精模材质
// 岸边：岛面和浪面相交的地方画一圈白沫 + 湿的深色带（浪用 world.js 的 WAVE_GLSL，和海面同一个公式、同一个时间）
const WAVE = { value: 0 }, FOAM = { value: 0 };
// 水下的岩基（blender/env_island.py 换上的程序化岩基 + 原模水线下的一小段）：不用贴图，按世界坐标画蓝灰岩石的斑驳和层理，
// 朝上的台阶积一点沙 / 苔，越深越暗；朝上的面再加和海底（sea-bed.js）同一种画法的卡通焦散
const UNDER_ROCK = `
 { float uwk = 1.0 - smoothstep(-5.0, -1.6, vIslW.y);
   if (uwk > 0.0) {
     vec3 q = vIslW;
     float n1 = sin(q.x * .09 + sin(q.z * .07 + q.y * .05) * 2.2) * sin(q.z * .1 + sin(q.x * .06 + q.y * .04) * 2.0);
     float n2 = sin(q.x * .31 - q.z * .27 + q.y * .23) * sin(q.z * .35 + q.y * .29 - q.x * .11);
     float st = sin(q.y * .45 + n1 * 1.8 + n2 * .7);
     vec3 rk = mix(vec3(.29, .41, .49), vec3(.43, .55, .6), clamp(.5 + .38 * n1 + .18 * n2, 0., 1.));
     rk *= .88 + .12 * smoothstep(-.25, .25, st);
     float up = smoothstep(.4, .78, vIslN.y);
     rk = mix(rk, mix(vec3(.66, .63, .5), vec3(.4, .55, .4), smoothstep(-.2, .35, n2)), up * .62);
     rk *= mix(1.0, .78, smoothstep(-10.0, -45.0, q.y));
     diffuseColor.rgb = mix(diffuseColor.rgb, pow(rk, vec3(2.2)), uwk);
     islCaus = up * uwk * (1.0 - smoothstep(6.0, 40.0, -q.y)) * (smoothstep(.36, .46, islCausF(q.xz, uTime)) * .7 + smoothstep(.5, .62, islCausF(q.xz * 1.9 + 7.0, uTime * 1.3)) * .3);
   } }`;
const CAUS_FN = `float islCausF(vec2 p, float t){ p *= 0.16;
  float a = sin(p.x * 1.7 + t * 0.9 + sin(p.y * 2.3 + t * 0.7) * 1.3);
  float b = sin(p.y * 1.9 - t * 0.8 + sin(p.x * 1.4 - t * 0.6) * 1.3);
  return pow(max(0.0, 1.0 - abs(a + b) * 0.8), 5.0); }`;
function bodyMat(map, kind, uK) {
  const lava = kind === 'volcano';
  const m = new THREE.MeshToonMaterial({ map, gradientMap: GRAD });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uK, uTime: TIME, uWaveT: WAVE, uFoam: FOAM });
    sh.vertexShader = 'uniform float uK;\nvarying vec3 vIslW, vIslN;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n if (position.y < 0.0) objectNormal.y /= uK;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n if (transformed.y < 0.0) transformed.y *= uK;\n vIslW = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vIslN = inverseTransformDirection(normalMatrix * objectNormal, viewMatrix);');
    sh.fragmentShader = 'uniform float uTime, uWaveT, uFoam;\nvarying vec3 vIslW, vIslN;\n' + WAVE_GLSL + '\n' + CAUS_FN + '\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
 float islCaus = 0.0;${UNDER_ROCK}
 float islFoam = 0.0;
 if (uFoam > 0.5) {
   float wl = waveH(vIslW.xz, uWaveT) * (1.0 - smoothstep(150.0, 262.0, length(vIslW.xz - cameraPosition.xz)));
   float dy = vIslW.y - wl;
   float nz = sin(vIslW.x * .7 + uWaveT * 1.3) * sin(vIslW.z * .63 - uWaveT * 1.1) * .5 + sin((vIslW.x - vIslW.z) * 1.9 + uWaveT * 2.0) * .25;
   islFoam = smoothstep(-.4, -.1, dy) * (1.0 - smoothstep(.3 + .3 * nz, .7 + .3 * nz, dy));
   float wet = smoothstep(-.4, 0.0, dy) * (1.0 - smoothstep(.5, 2.0, dy));
   diffuseColor.rgb *= 1.0 - .28 * wet;
   diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.9, .96, 1.0), islFoam * .85);
 }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
 totalEmissiveRadiance += vec3(.32, .36, .38) * islFoam + vec3(.36, .5, .54) * islCaus * .32;` + (lava ? `
 { vec3 c = diffuseColor.rgb;
   float lv = smoothstep(.1, .38, c.r - max(c.g * .62, c.b));
   totalEmissiveRadiance += c * lv * (1.25 + .22 * sin(uTime * 1.7 + vIslW.x * .08 + vIslW.y * .11)); }` : ''));
  };
  m.customProgramCacheKey = () => 'isl' + (lava ? 'L' : '');
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
function hullMat(kind, uK) {
  const m = outlineMat(OUTLINE_C[kind] || 0x2a1e1a, .01, {
    extraPars: 'uniform float uK;',
    // 镜头贴着石壁时描边壳会把镜头包进去，整面画成黑的：离镜头 1~5 米内把外扩收回去
    extraVertex: `if (transformed.y < 0.0) { transformed.y *= uK; oN.y /= uK; }
 { float cdist = distance((modelMatrix * vec4(transformed, 1.0)).xyz, cameraPosition);
   transformed -= normalize(oN) * uW * (1.0 - smoothstep(1.0, 5.0, cdist)); }`,
    key: 'isl',
  });
  m.userData.extraUniforms = { uK };
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

// 一个形状的 glb → { lod0..2, lod0a / lod0w …（水上 / 水下的三角形）, map }
const loader = new GLTFLoader();
function loadShape(key) {
  const d = SHAPES[key];
  return new Promise((res, rej) => loader.load(new URL(d.file, BASE).href, g => {
    const out = { key, d, map: null };
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const nm = o.name + ' ' + (o.parent && o.parent.name || ''), name = /lod2/i.test(nm) ? 'lod2' : /lod1/i.test(nm) ? 'lod1' : 'lod0';
      if (out[name]) return;
      out[name] = o.geometry;
      if (!out.map && o.material && o.material.map) out.map = o.material.map;
    });
    if (!out.lod0) return rej(new Error('glb 里没有网格 ' + key));
    if (!out.lod1) out.lod1 = out.lod0;
    if (!out.lod2) out.lod2 = out.lod1;
    for (const geo of new Set([out.lod0, out.lod1, out.lod2])) if (!geo.attributes.normal) weldedNormals(geo);
    if (out.map) { out.map.anisotropy = 4; out.map.colorSpace = THREE.SRGBColorSpace; }
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
const islandHull = outlineMat(0x2a1e1a, .45);
const treeHull = outlineMat(0x1e2a18, .28);
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
    return { is, grp, body: null, hull: null, smoke: null, lod: -1, uK: { value: is.k || 1 }, hm: null, shape: null };
  });
  const procedural = o => { o.smoke = buildProcedural(o.is, o.grp); o.fine = false; };

  // 一个形状下载好 → 用它的岛都挂上网格；下载失败 → 这些岛用程序化的
  const attach = (key, s) => {
    for (const o of list) {
      const is = o.is; if (is.shape !== key) continue;
      if (!s) { procedural(o); continue; }
      o.shape = s; o.fine = true;
      o.body = new THREE.Mesh(s.lod0a, bodyMat(s.map, is.kind, o.uK));
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
      for (const o of list) {
        const x = cx + wrapP(o.is.x - cx), z = cz + wrapP(o.is.z - cz), d = Math.hypot(x - cx, z - cz);
        o.grp.position.set(x, 0, z);
        // 水上看只看得到岸线以内（岩裙在水下，最远到 1.85 倍岸线半径）：按岸线半径算距离；水下按整个岩裙
        const R = under ? (o.is.reach || o.is.r * 2) : o.is.r * 1.25;
        o.grp.visible = d - R < (under ? 170 : FOG_FAR);           // 水下的雾 120 米就满了
        if (!o.fine || !o.grp.visible) continue;
        const far = d - o.is.r * 1.25, lod = (far > 430 ? 'lod2' : far > 90 + o.is.r * .8 ? 'lod1' : 'lod0') + (under ? 'w' : 'a');
        if (lod !== o.lod) { o.lod = lod; o.body.geometry = o.hull.geometry = o.shape[lod]; }
        // 描边宽度（米）随距离变粗一点，远处的岛也有轮廓
        o.hm.userData.uW.value = Math.min(1.7, Math.max(.32, (d - o.is.r * .5) * .0022)) / o.is.sx;
      }
      lavaMat.color.setHSL(.055, 1, .52 + .05 * Math.sin(time * 2.2));
    },
  };
}
