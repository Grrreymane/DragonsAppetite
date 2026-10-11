// 云和火山烟：实例化公告板，云、烟、远处地平线上的云带共用一张 AI 画的图集（img/clouds.webp），一次绘制。按 PERIOD 循环。
// - 每朵云 = 1 张大积云 + 0~2 张小的（前后错开几米，转镜头时有一点层次）
// - 离镜头近了就淡掉（龙穿云时不会看到一张平板）；镜头钻进云里时，镜头前面盖一层很淡的云雾
// - 地平线上一圈远处的低云（跟着镜头走 = 无限远，蒙一层地平线的雾色），哪个方向看过去天边都有层次
// - 实例每帧按离镜头的远近排序（半透明的画要从远往近画）；排序和写缓冲都不新建对象（不触发垃圾回收）
// - 远处的雾按视线方向染冷暖（sky.js 的 skyFogTint，和天空地平线一致）
import * as THREE from 'three';
import { PERIOD, wrapP, islands } from '../sim/world.js';
import { makeRng } from '../sim/rng.js';
import { loadCloudAtlas, rectUV, aspect, CUMULUS, SMOKE } from './cloud-atlas.js';
import { SKY_FOG_GLSL, SKY } from './sky.js';
// 雾色离空气的雾色很远 = 镜头在水下
const waterFog = c => Math.abs(c.r - SKY.mid.r) + Math.abs(c.g - SKY.mid.g) + Math.abs(c.b - SKY.mid.b) > .25;

const MAX = 240;
const BAND_D = 1300;          // 地平线云带离镜头的距离（在天空球 1400 以内）
// iSize = (宽, 高, 转角 / 云带的雾量, 模式)；模式 0 云和烟 / 1 镜头前的薄雾 / 2 地平线云带
const VERT = `attribute vec3 iOff; attribute vec4 iSize; attribute vec4 iCol; attribute vec4 iUv;
varying vec2 vUv; varying vec4 vC; varying vec3 vDir; varying float vHaze;
#include <fog_pars_vertex>
void main(){
  vec2 p = position.xy;
  float r = iSize.w > 0.5 ? 0.0 : iSize.z, cs = cos(r), sn = sin(r);
  p = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  vUv = iUv.xy + uv * iUv.zw; vC = iCol;
  vec4 mvPosition = viewMatrix * vec4(iOff, 1.0);
  // 离镜头近了淡掉：半径的 0.35 倍以内看不见，1.1 倍以外完全显示
  float rad = max(iSize.x, iSize.y) * 0.5, dist = length(mvPosition.xyz);
  if (iSize.w < 0.5) vC.a *= smoothstep(rad * 0.35, rad * 1.1, dist) * step(0.0, -mvPosition.z + rad * 0.2);
  vHaze = iSize.w > 1.5 ? iSize.z : -1.0;
  mvPosition.xy += p * iSize.xy;
  vDir = iOff - cameraPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = `uniform sampler2D map;
varying vec2 vUv; varying vec4 vC; varying vec3 vDir; varying float vHaze;
#include <fog_pars_fragment>
#ifndef USE_FOG
${SKY_FOG_GLSL}
#endif
void main(){
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(t.rgb * vC.rgb, t.a * vC.a);
  if (gl_FragColor.a < 0.004) discard;
  #include <colorspace_fragment>
  #ifdef USE_FOG
    #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
    float fogFactor = smoothstep(fogNear * 1.4, fogFar * 1.5, vFogDepth) * 0.8;   // 云在天上：雾薄一点，远处的云不变成一块平的剪影
    #endif
    if (vHaze >= 0.0) fogFactor = vHaze;                                          // 地平线云带：固定的雾量
    gl_FragColor.rgb = mix(gl_FragColor.rgb, skyFogTint(fogColor, vDir), fogFactor);
  #endif
}`;

function billboards(max) {
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const A = k => new THREE.InstancedBufferAttribute(new Float32Array(max * k), k).setUsage(THREE.DynamicDrawUsage);
  const off = A(3), sz = A(4), col = A(4), uv = A(4);
  geo.setAttribute('iOff', off); geo.setAttribute('iSize', sz); geo.setAttribute('iCol', col); geo.setAttribute('iUv', uv);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null } }]),
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'clouds'; mesh.renderOrder = 2;
  // 先收集到暂存数组里，按距离排好序再写进缓冲（暂存数组和排序用的下标数组都只建一次）
  const B = new Float32Array(max * 16), D = new Float32Array(max), order = [];
  let n = 0;
  const byFar = (a, b) => D[b] - D[a];
  return {
    mesh, mat,
    begin() { n = 0; },
    // mode：0 云和烟 / 1 镜头前的薄雾 / 2 地平线云带（rot 这时是雾量）
    push(x, y, z, w, h, rot, r, g, b, a, uvr, mode = 0) {
      if (n >= max || a <= .003) return;
      const o = n * 16;
      B[o] = x; B[o + 1] = y; B[o + 2] = z; B[o + 3] = w; B[o + 4] = h; B[o + 5] = rot; B[o + 6] = mode;
      B[o + 7] = r; B[o + 8] = g; B[o + 9] = b; B[o + 10] = a; B[o + 11] = uvr[0]; B[o + 12] = uvr[1]; B[o + 13] = uvr[2]; B[o + 14] = uvr[3];
      n++;
    },
    end(cam) {
      order.length = n;
      for (let i = 0; i < n; i++) { const o = i * 16; D[i] = (B[o] - cam.x) ** 2 + (B[o + 1] - cam.y) ** 2 + (B[o + 2] - cam.z) ** 2; order[i] = i; }
      order.sort(byFar);
      const O = off.array, Z = sz.array, Cc = col.array, U = uv.array;
      for (let i = 0; i < n; i++) {
        const o = order[i] * 16;
        O[i * 3] = B[o]; O[i * 3 + 1] = B[o + 1]; O[i * 3 + 2] = B[o + 2];
        Z[i * 4] = B[o + 3]; Z[i * 4 + 1] = B[o + 4]; Z[i * 4 + 2] = B[o + 5]; Z[i * 4 + 3] = B[o + 6];
        Cc[i * 4] = B[o + 7]; Cc[i * 4 + 1] = B[o + 8]; Cc[i * 4 + 2] = B[o + 9]; Cc[i * 4 + 3] = B[o + 10];
        U[i * 4] = B[o + 11]; U[i * 4 + 1] = B[o + 12]; U[i * 4 + 2] = B[o + 13]; U[i * 4 + 3] = B[o + 14];
      }
      geo.instanceCount = n;
      for (const a of [off, sz, col, uv]) { a.needsUpdate = true; a.clearUpdateRanges && a.clearUpdateRanges(); a.addUpdateRange(0, Math.max(1, n) * a.itemSize); }
    },
  };
}

export function createClouds({ scene }) {
  const rnd = makeRng(4242);
  // ---- 云的分布（固定种子）：不压在高山上 ----
  const clouds = [];
  let tries = 0;
  while (clouds.length < 40 && tries++ < 400) {
    const x = rnd.range(-PERIOD / 2, PERIOD / 2), z = rnd.range(-PERIOD / 2, PERIOD / 2);
    const big = rnd() < .55, low = rnd() < .25;
    const kind = low ? 3 : big ? rnd.int(0, 2) : rnd.int(4, 5);
    const w = low ? rnd.range(110, 170) : big ? rnd.range(80, 150) : rnd.range(40, 70);
    const y = low ? rnd.range(50, 75) : rnd.range(70, 175);
    if (islands.some(is => Math.hypot(wrapP(is.x - x), wrapP(is.z - z)) < is.r + w * .6 && is.h > y - w * .35)) continue;
    const parts = [{ id: CUMULUS[Math.min(kind, CUMULUS.length - 1)], dx: 0, dy: 0, dz: 0, w, c: 1 }];
    const extra = low ? 0 : rnd.int(0, 2);
    for (let k = 0; k < extra; k++) {
      const s = rnd.range(.35, .6), side = rnd() < .5 ? -1 : 1;
      parts.push({ id: CUMULUS[rnd.int(4, 5) % CUMULUS.length], dx: side * w * rnd.range(.35, .55), dy: -w * rnd.range(.05, .15), dz: rnd.range(-1, 1) * w * .3, w: w * s, c: rnd.range(.95, 1) });
    }
    clouds.push({ x, y, z, drift: rnd.range(1.5, 3.5), parts });
  }
  // ---- 地平线云带：一圈 18 张，方位角均匀 + 抖一点；扁的云带为主，夹几朵宽积云冒头 ----
  const band = [];
  const bandIds = ['cu2', 'cu3', 'cu2', 'cu1', 'cu2', 'cu3'].filter(id => CUMULUS.includes(id));
  if (bandIds.length) for (let i = 0; i < 18; i++) {
    const id = bandIds[i % bandIds.length], tall = id !== 'cu2';
    const wa = tall ? rnd.range(.2, .28) : rnd.range(.3, .42);          // 角宽（弧度）
    band.push({ id, az: i / 18 * Math.PI * 2 + rnd.range(-.08, .08), wa, sq: tall ? .62 : .8, el0: rnd.range(-.012, .004), haze: tall ? rnd.range(.5, .6) : rnd.range(.38, .5) });
  }
  const bb = billboards(MAX); scene.add(bb.mesh);
  let ok = false;
  const ready = loadCloudAtlas().then(a => { bb.mat.uniforms.map.value = a.tex; ok = true; }).catch(e => console.warn('云图集加载失败', e && e.message));
  const UV = {}; for (const id of [...CUMULUS, ...SMOKE]) UV[id] = rectUV(id);
  const AS = {}; for (const id of [...CUMULUS, ...SMOKE]) AS[id] = aspect(id);
  const veilUV = (() => { const r = UV[CUMULUS[0]] || [0, 0, 1, 1]; return [r[0] + r[2] * .25, r[1] + r[3] * .3, r[2] * .4, r[3] * .35]; })();   // 云的中间一块（镜头在云里时的薄雾）
  const _f = new THREE.Vector3();
  return {
    ready,
    // smokePoints：[{x,y,z,id}] 火山口位置（islands.smokePoints()）
    update(camera, time, dt, smokePoints = []) {
      if (!ok) return;
      const cam = camera.position, cx = cam.x, cz = cam.z;
      bb.mesh.visible = !(scene.fog && waterFog(scene.fog.color));   // 水下（雾是水的颜色）：天上的东西都看不到
      if (!bb.mesh.visible) return;
      bb.begin();
      // 地平线云带（镜头在水下时看不到天，不画）
      if (cam.y > -1) for (const b of band) {
        const w = 2 * BAND_D * Math.tan(b.wa / 2), h = w / AS[b.id] * b.sq, el = b.el0 + h / 2 / BAND_D;
        const ce = Math.cos(el);
        bb.push(cx + Math.sin(b.az) * ce * BAND_D, cam.y + Math.sin(el) * BAND_D, cz + Math.cos(b.az) * ce * BAND_D, w, h, b.haze, 1, 1, 1, .95, UV[b.id], 2);
      }
      let inside = 0;
      for (const cl of clouds) {
        cl.x += cl.drift * dt;
        const x = cx + wrapP(cl.x - cx), z = cz + wrapP(cl.z - cz);
        const dh = Math.hypot(x - cx, z - cz);
        if (dh > 1180) continue;
        const fa = 1 - Math.min(1, Math.max(0, (dh - 880) / 300));     // 循环的边上慢慢淡掉，不会突然冒出来
        for (const p of cl.parts) {
          const w = p.w, h = w / AS[p.id], px = x + p.dx, py = cl.y + p.dy, pz = z + p.dz;
          bb.push(px, py, pz, w, h, 0, p.c, p.c, p.c, fa, UV[p.id]);
          // 镜头在云团里：离中心越近雾越浓（椭球，竖向扁）
          const d = Math.hypot((cam.x - px) / (w * .42), (cam.y - py) / (h * .38), (cam.z - pz) / (w * .3));
          inside = Math.max(inside, 1 - Math.min(1, d));
        }
      }
      // 火山烟：每个火山口一串往上飘、越来越大、越来越淡的烟团（顺风往 +x 偏）
      for (const sp of smokePoints) {
        if (Math.hypot(sp.x - cx, sp.z - cz) > 1050) continue;
        const N = 9;
        for (let k = 0; k < N; k++) {
          const t = (time * .045 + k / N + sp.id * .137) % 1, id = SMOKE[(k + sp.id) % SMOKE.length];
          if (!id) break;
          const sz = (14 + (k * 37 % 11)) * (.45 + t * 1.9), a = Math.min(1, t * 8) * (1 - t) ** 1.3 * .95;
          const g = .66 + t * .36, warm = Math.max(0, 1 - t * 6);                      // 刚冒出来的烟底下被熔岩映得偏暖
          bb.push(sp.x + Math.sin(t * 5 + k) * 4 + t * 34, sp.y + t * 95, sp.z + t * 10 + Math.cos(t * 4 + k) * 3, sz * AS[id], sz, Math.sin(k * 2.3) * .25, g + warm * .3, g * .97 + warm * .08, g * .95 - warm * .1, a, UV[id]);
        }
      }
      // 镜头在云里：镜头前 2 米一张很淡的云雾（最多 35%，按距离渐变，不闪）
      if (inside > .01) {
        camera.getWorldDirection(_f);
        const k = Math.min(.35, inside * .6), dd = 2, hh = 2 * dd * Math.tan(camera.fov * Math.PI / 360) * 1.3;
        bb.push(cam.x + _f.x * dd, cam.y + _f.y * dd, cam.z + _f.z * dd, hh * camera.aspect * 1.4, hh, 0, 1, 1, 1, k, veilUV, 1);
      }
      bb.end(cam);
    },
  };
}
