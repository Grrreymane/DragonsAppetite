// 海底装饰（按区域）：翠岛海的珊瑚礁（脑珊瑚、海葵、桌面珊瑚、海星贝壳）、火山海的黑曜石尖柱 + 热泉气泡柱、
// 外海的发光植物 + 石拱 + 尖石。每种一个 InstancedMesh（一次绘制），跟着 sea-bed.js 的块一起生成，只摆镜头附近 100 米。
import * as THREE from 'three';
import { seabedInfo } from '../sim/world.js';

export const hash = (i, j, s) => {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296;
};
const C = h => new THREE.Color(h);
const ss = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// 珊瑚礁的疏密（0..1）：低频噪声，一片一片的礁
export const reefD = (x, z) => ss(.05, .5, Math.sin(x * .021 + 1) * Math.sin(z * .017 + .3) + .35 * Math.sin((x + z) * .031));

// 种类
export const T = { BRAIN: 0, ANEM: 1, PLATE: 2, BITS: 3, SPIRE: 4, ARCH: 5, PLUME: 6, GLOW: 7 };
const MAX = [60, 50, 50, 40, 60, 14, 28, 120];

// ---- 几何体工具：非索引三角形 + 顶点色 ----
function G() { return { p: [], c: [], e: [] }; }   // e：每个顶点的附加值（气泡的相位等）
function tri(g, a, b, c, ca, cb, cc, e = 0) { g.p.push(...a, ...b, ...c); g.c.push(...ca, ...cb, ...cc); g.e.push(e, e, e); }
// 管子：沿 pts 走，半径 rs，sides 边；颜色按段从 c0 到 c1（[r,g,b]）
function tube(g, pts, rs, sides, c0, c1, tip = true) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const d = new THREE.Vector3(q[0] - o[0], q[1] - o[1], q[2] - o[2]).normalize();
    const u = Math.abs(d.y) < .9 ? new THREE.Vector3(0, 1, 0).cross(d).normalize() : new THREE.Vector3(1, 0, 0).cross(d).normalize();
    const v = d.clone().cross(u);
    const ring = [];
    for (let k = 0; k < sides; k++) { const a = k / sides * Math.PI * 2; ring.push([p[0] + (u.x * Math.cos(a) + v.x * Math.sin(a)) * rs[i], p[1] + (u.y * Math.cos(a) + v.y * Math.sin(a)) * rs[i], p[2] + (u.z * Math.cos(a) + v.z * Math.sin(a)) * rs[i]]); }
    rings.push(ring);
  }
  const col = i => { const t = i / (pts.length - 1); return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t]; };
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < sides; k++) {
    const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides], ca = col(i), cb = col(i + 1);
    tri(g, a, c, b, ca, cb, ca); tri(g, b, c, d, ca, cb, cb);
  }
  if (tip) { const L = pts.length - 1, top = pts[L], r = rings[L], ct = col(L); for (let k = 0; k < sides; k++) tri(g, r[k], top.map((v, i) => v + (i === 1 ? rs[L] : 0)), r[(k + 1) % sides], ct, ct, ct); }
}
// 现成的 three 几何体并进来（颜色按函数 fc(x,y,z) 给）
function addGeo(g, geo, fc, e = 0) {
  const s = geo.index ? geo.toNonIndexed() : geo, p = s.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); g.p.push(x, y, z); g.c.push(...fc(x, y, z)); g.e.push(e); }
}
function finish(g, withE = false) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
  if (withE) geo.setAttribute('aE', new THREE.Float32BufferAttribute(g.e, 1));
  geo.computeVertexNormals(); return geo;
}
const gray = v => [v, v, v];
const rnd = (i, s) => hash(i, s, 913);

// 脑珊瑚：压扁的圆顶 + 一圈圈沟纹（顶点色深浅），旁边一个小的
function brainGeo() {
  const g = G();
  const dome = (r, ox, oz, sd, det) => {
    const geo = new THREE.IcosahedronGeometry(r, det), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { let y = p.getY(i); y = y < 0 ? y * .12 : y * .72; p.setXYZ(i, p.getX(i) + ox, y, p.getZ(i) + oz); }
    addGeo(g, geo, (x, y, z) => gray(Math.sin((x * 3.1 + Math.sin(z * 4 + sd) * .8) * 3) > 0 ? 1 : .72));
  };
  dome(1, 0, 0, 0, 1); dome(.5, 1.05, .45, 2, 0);
  return finish(g);
}
// 海葵：短柱身 + 一圈弯弯的触手（根部是柱身的颜色，梢头发白）
function anemGeo() {
  const g = G(), n = 8;
  addGeo(g, new THREE.CylinderGeometry(.42, .5, .45, 7, 1, true).translate(0, .22, 0), () => gray(.6));
  addGeo(g, new THREE.CircleGeometry(.42, 7).rotateX(-Math.PI / 2).translate(0, .44, 0), () => gray(.45));
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(i, 1) * .4, ring = i % 2 ? .36 : .22, h = .75 + rnd(i, 2) * .5, out = .35 + rnd(i, 3) * .35, pts = [];
    for (let s = 0; s <= 2; s++) { const t = s / 2, r = ring + out * t * t; pts.push([Math.cos(a) * r, .42 + h * t - out * t * t * .3, Math.sin(a) * r]); }
    tube(g, pts, [.085, .065, .04], 3, [.85, .85, .85], [1.6, 1.6, 1.6]);
  }
  return finish(g);
}
// 桌面珊瑚：短柄上两层波浪边的圆盘
function plateGeo() {
  const g = G();
  addGeo(g, new THREE.CylinderGeometry(.13, .2, .55, 5, 1, true).translate(0, .27, 0), () => gray(.55));
  const disc = (r, y, ox, oz, sd) => {
    const geo = new THREE.CylinderGeometry(r, r * .78, .14, 10, 1, false), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + .12 * Math.sin(a * 5 + sd) * Math.min(1, Math.hypot(x, z) / r * 1.3); p.setXYZ(i, x * k + ox, p.getY(i) + y + .08 * Math.sin(a * 3 + sd) * Math.hypot(x, z) / r, z * k + oz); }
    addGeo(g, geo, (x, y, z) => gray(.7 + .35 * Math.min(1, Math.hypot(x - ox, z - oz) / r)));
  };
  disc(1, .55, 0, 0, 0); disc(.55, .95, .25, -.15, 2);
  addGeo(g, new THREE.CylinderGeometry(.08, .1, .4, 4, 1, true).translate(.25, .75, -.15), () => gray(.55));
  return finish(g);
}
// 小东西：海星 + 扇贝 + 一颗卵石（颜色直接在顶点里）
function bitsGeo() {
  const g = G(), sc = [1, .45, .25], sc2 = [1, .7, .35];
  const star = (ox, oz, r, rot) => {
    const P = [];
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + rot, rr = i % 2 ? r * .38 : r; P.push([ox + Math.cos(a) * rr, .06, oz + Math.sin(a) * rr]); }
    const top = [ox, .2 * r, oz];
    for (let i = 0; i < 10; i++) { const a = P[i], b = P[(i + 1) % 10]; tri(g, top, b, a, sc2, i % 2 ? sc : sc2, i % 2 ? sc2 : sc); tri(g, a, b, [b[0], 0, b[2]], sc, sc, sc); tri(g, a, [b[0], 0, b[2]], [a[0], 0, a[2]], sc, sc, sc); }
  };
  star(0, 0, .9, .3);
  const shell = (ox, oz, r, rot) => {   // 扇贝：一把扇形的棱
    const hinge = [ox, .05, oz], M = 7, cA = [1, .88, .78], cB = [1, .7, .68];
    for (let i = 0; i < M; i++) {
      const a0 = rot - .9 + i / M * 1.8, a1 = rot - .9 + (i + 1) / M * 1.8, am = (a0 + a1) / 2;
      const p0 = [ox + Math.cos(a0) * r, .05, oz + Math.sin(a0) * r], p1 = [ox + Math.cos(a1) * r, .05, oz + Math.sin(a1) * r], pm = [ox + Math.cos(am) * r * 1.04, .28 * r, oz + Math.sin(am) * r * 1.04];
      tri(g, hinge, pm, p0, cB, cA, cA); tri(g, hinge, p1, pm, cB, cA, cA);
    }
  };
  shell(1.5, .7, .75, 2.2); shell(-1.2, -1, .5, -.6);
  addGeo(g, new THREE.IcosahedronGeometry(.35, 0).scale(1, .6, 1).translate(-1.1, .1, .9), () => [.85, .82, .78]);
  return finish(g);
}
// 尖柱：一簇 4 根五棱锥，往外歪（火山海：黑曜石；外海：尖石）
function spireGeo() {
  const g = G();
  const spike = (r, h, x, z, ax, az) => {
    const geo = new THREE.ConeGeometry(r, h, 5, 2, true).translate(0, h / 2, 0).rotateX(ax).rotateZ(az).translate(x, 0, z);
    addGeo(g, geo, (px, y) => gray(.5 + .7 * Math.min(1, Math.max(0, y) / h)));
  };
  spike(.55, 4, 0, 0, .05, -.05); spike(.4, 2.8, .7, .3, .25, -.35); spike(.35, 2.2, -.6, .4, .35, .3); spike(.3, 1.6, .1, -.65, -.4, .1);
  return finish(g);
}
// 石拱：一道歪歪的拱，腿粗、顶细，截面是抖过的六边形（像石头不像管子）；腿插进地里
function archGeo() {
  const g = G(), pts = [], rs = [], M = 9;
  for (let i = 0; i <= M; i++) { const t = i / M, a = Math.PI * (1 - t); pts.push([Math.cos(a) * 1.1, Math.sin(a) * 1.25 - .15 + (t < .5 ? .1 : 0) * Math.sin(t * 6.28), Math.sin(t * 3.14) * .15]); rs.push(.3 - .12 * Math.sin(t * Math.PI) + .04 * Math.sin(i * 2.3)); }
  const n0 = g.p.length;
  tube(g, pts, rs, 6, [.62, .62, .62], [.62, .62, .62], false);
  for (let i = n0; i < g.p.length; i += 3) {   // 抖一下，按高度分层的岩纹
    const x = g.p[i], y = g.p[i + 1], z = g.p[i + 2], j = hash(Math.round(x * 40), Math.round(y * 40), Math.round(z * 40) + 3) - .5;
    g.p[i] = x + j * .08; g.p[i + 1] = y + j * .05; g.p[i + 2] = z * 1.3 + j * .1;
    const v = (Math.floor((y + 2) * 5) % 2 ? .78 : .95) * (.7 + .3 * Math.min(1, Math.max(0, y)));
    g.c[i] = g.c[i + 1] = g.c[i + 2] = v;
  }
  return finish(g);
}
// 气泡柱：14 个小八面体，aE = 相位；着色器里一路往上冒、晃，冒到顶变小消失
function plumeGeo() {
  const g = G();
  for (let i = 0; i < 14; i++) addGeo(g, new THREE.IcosahedronGeometry(1, 0), () => gray(1), i / 14 + rnd(i, 5) * .05);
  return finish(g, true);
}
// 发光植物：4 根弯弯的细茎，顶上一颗亮球；茎暗、球亮（不受光照）
function glowGeo() {
  const g = G();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + rnd(i, 7), h = .55 + rnd(i, 8) * .55, lean = .15 + rnd(i, 9) * .25, pts = [];
    for (let s = 0; s <= 3; s++) { const t = s / 3; pts.push([Math.cos(a) * (.12 + lean * t * t), h * t, Math.sin(a) * (.12 + lean * t * t)]); }
    tube(g, pts, [.05, .04, .03, .025], 3, [.18, .18, .2], [.35, .35, .4], false);
    const r = .09 + rnd(i, 10) * .07, tp = pts[3];
    addGeo(g, new THREE.OctahedronGeometry(r, 0).scale(1, 1.3, 1).translate(tp[0], tp[1] + r, tp[2]), () => gray(1.15));
  }
  return finish(g);
}

// ---- 着色器片段 ----
const SWAY = `
  vec3 ip = instanceMatrix[3].xyz; float ph = dot(ip.xz, vec2(.13, .17));
  float sy = max(transformed.y, 0.0);
  transformed.x += sin(uDT * 1.3 + ph + sy * 2.0) * .13 * sy * sy;
  transformed.z += cos(uDT * 1.1 + ph * 1.3 + sy * 1.5) * .09 * sy * sy;`;
const PLUME = `
  float bf = fract(aE + uDT * .11 + fract(dot(instanceMatrix[3].xz, vec2(.071, .113))));
  float bs = (.12 + .22 * bf) * smoothstep(0.0, .06, bf) * (1.0 - smoothstep(.85, 1.0, bf));
  float bp = aE * 37.0;
  transformed = position * bs + vec3(sin(bp) * .5 + sin(uDT * 2.0 + bp) * .5 * bf, bf * 22.0, cos(bp * 1.3) * .5 + cos(uDT * 1.7 + bp) * .5 * bf);
  vBF = bf;`;

export function createDeco(group, { toonMat, farFade, uT, uNight }) {
  const uDT = uT;
  const meshes = [];
  const mk = (geo, mat, t, name) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX[t]); m.name = name; m.count = 0; m.visible = false; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const w = new THREE.Color(1, 1, 1); for (let i = 0; i < MAX[t]; i++) m.setColorAt(i, w);
    group.add(m); meshes[t] = m; return m;
  };
  const sway = (mat, key) => {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => { sh.uniforms.uDT = uDT; sh.vertexShader = 'uniform float uDT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY); if (prev) prev.call(mat, sh, r); };
    return farFade(mat, key);
  };
  // 发光材质：不受光照、不走色调映射（颜色鲜），雾只吃一部分（远处也看得见一点亮），一闪一闪
  const glowMat = (key, extraV = '', vpars = '', fpars = '', frag = '') => {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, toneMapped: false });
    m.onBeforeCompile = sh => {
      sh.uniforms.uDT = uDT; sh.uniforms.uNight = uNight;
      sh.vertexShader = 'uniform float uDT; varying float vPulse; ' + vpars + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + extraV +
        '\n vPulse = .8 + .2 * sin(uDT * 1.7 + dot(instanceMatrix[3].xz, vec2(.31, .23)));');
      sh.fragmentShader = 'uniform float uNight; varying float vPulse; ' + fpars + '\n' + sh.fragmentShader
        .replace('#include <tonemapping_fragment>', frag + '\n gl_FragColor.rgb *= vPulse * (.85 + .35 * uNight);\n vec3 preFog = gl_FragColor.rgb;\n#include <tonemapping_fragment>')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
#ifdef USE_FOG
 gl_FragColor.rgb = mix(gl_FragColor.rgb, preFog, fogFactor * .45);
 gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(82.0, 100.0, vFogDepth));
#endif`);
    };
    m.customProgramCacheKey = () => 'deco:' + key;
    return m;
  };
  const lit = (key, swayIt) => { const m = toonMat({ vertexColors: true, flatShading: true }); return swayIt ? sway(m, key) : farFade(m, key); };
  mk(brainGeo(), lit('brain'), T.BRAIN, 'brainCoral');
  mk(anemGeo(), lit('anem', true), T.ANEM, 'anemone');
  mk(plateGeo(), lit('plate'), T.PLATE, 'plateCoral');
  mk(bitsGeo(), lit('bits'), T.BITS, 'starfish');
  mk(spireGeo(), lit('spire'), T.SPIRE, 'spire');
  mk(archGeo(), lit('arch'), T.ARCH, 'arch');
  // 气泡：片元里按高度从暖到冷（出口附近被熔岩照成橙色）
  mk(plumeGeo(), glowMat('plume', PLUME, 'attribute float aE; varying float vBF;', 'varying float vBF;',
    'gl_FragColor.rgb *= mix(vec3(1.25, .7, .4), vec3(.7, .9, 1.0), smoothstep(.0, .35, vBF));'), T.PLUME, 'plume');
  mk(glowGeo(), glowMat('glow', SWAY), T.GLOW, 'glowPlant');

  // ---- 按块生成（确定性）----
  const PAL = {
    brain: [C(0xd8e06a), C(0xf2a050), C(0xc08af0), C(0x8ad48a), C(0xff8a8a)],
    anem: [C(0xff6fb0), C(0xb47cff), C(0xff9248), C(0x5fe0d0), C(0xffd04a)],
    plate: [C(0xf0c050), C(0x9ed86a), C(0xe888c4), C(0x6cc8f0)],
    bits: [C(0xffffff), C(0xffe0e8), C(0xfff0c8)],
    spireV: [C(0x3c2f4c), C(0x4a3048), C(0x2e2a3c)], spireO: [C(0x52698a), C(0x48607e), C(0x5e7898)],
    archV: C(0x5a4a4e), archO: C(0x5a7090),
    glow: [C(0x40f0ff), C(0x9a70ff), C(0x50ffb0), C(0xff70e0), C(0x40c0ff)],
    plume: C(0xffffff),
  };
  const pick = (arr, h) => arr[Math.floor(h * arr.length) % arr.length];
  // bedAt(x, z)：放东西的高度（和地形网格一致，sea-bed.js 给）
  function gen(ci, cj, x0, z0, CH, vent, bedAt) {
    const out = [], H = (k) => hash(ci, cj, 5000 + k);
    const add = (t, x, z, s, a, c, sy = s, dy = 0) => {   // 陡壁上只长发光植物
      if (t !== T.GLOW && t !== T.PLUME && bedAt.steep(x, z) > .8) return;
      out.push({ t, x, y: bedAt(x, z) + dy, z, s, sy, a, c });
    };
    const at = (k) => [x0 + 2 + H(k) * (CH - 4), z0 + 2 + H(k + 1) * (CH - 4)];
    // 翠岛海：礁区里一丛丛的珊瑚（每丛 4~7 个挤在一起），礁外零星的海星贝壳
    const cx0 = x0 + CH / 2, cz0 = z0 + CH / 2;
    if (seabedInfo(cx0, cz0).wg > .3) {
      const ncl = Math.floor(reefD(cx0, cz0) * 4.5 + H(1) * 1.2);
      for (let k = 0; k < ncl; k++) {
        const [cx, cz] = at(10 + k * 40), nb = 4 + Math.floor(H(12 + k * 40) * 4);
        for (let m = 0; m < nb; m++) {
          const q = 13 + k * 40 + m * 3, a = H(q) * 6.28, d = Math.sqrt(H(q + 1)) * 5.5, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d, I = seabedInfo(x, z);
          if (I.wg < .6 || I.y > -5 || I.y < -46) continue;
          const r = H(q + 2), s = 1.3 + ((r * 7.31) % 1) * 1.5, c = (r * 13.7) % 1;
          if (r < .3) add(T.BRAIN, x, z, s * 1.1, a, pick(PAL.brain, c), s * (.75 + c * .5), -.15);
          else if (r < .62) add(T.ANEM, x, z, s, a, pick(PAL.anem, c), undefined, -.1);
          else if (r < .92) add(T.PLATE, x, z, s * 1.3, a, pick(PAL.plate, c), undefined, -.1);
          else add(T.BITS, x, z, s * .7, a, pick(PAL.bits, c), undefined, .05);
        }
      }
      for (let k = 0; k < 2; k++) {
        const [x, z] = at(200 + k * 3);
        if (H(202 + k * 3) < .4 && seabedInfo(x, z).wg > .6 && bedAt(x, z) < -5) add(T.BITS, x, z, .9 + H(203 + k * 3) * .6, H(204 + k * 3) * 6.28, pick(PAL.bits, H(205 + k * 3)), undefined, .05);
      }
    }
    // 火山海：黑曜石尖柱（裂谷边多一点），裂谷底冒气泡
    for (let k = 0; k < 6; k++) {
      const [x, z] = at(300 + k * 5), I = seabedInfo(x, z);
      if (I.wv < .6) continue;
      if (I.lava > .55) { if (H(300 + k * 5 + 2) < .45) add(T.PLUME, x, z, .9 + H(300 + k * 5 + 3) * .4, 0, PAL.plume, undefined, .5); continue; }
      if (H(300 + k * 5 + 2) < .38) add(T.SPIRE, x, z, 1.2 + H(300 + k * 5 + 3) * 1.6, H(300 + k * 5 + 4) * 6.28, pick(PAL.spireV, H(300 + k * 5 + 5)), undefined, -.4);
    }
    if (vent) out.push({ t: T.PLUME, x: vent.x, y: vent.y - .4 + vent.h, z: vent.z, s: 1.1, sy: 1.1, a: 0, c: PAL.plume });
    // 外海：发光植物（峡谷里多）、尖石、石拱
    for (let k = 0; k < 12; k++) {
      const [x, z] = at(600 + k * 5), I = seabedInfo(x, z);
      if (I.wo < .6) continue;
      if (H(600 + k * 5 + 2) < .3 + I.canyon * .6) add(T.GLOW, x, z, 2.2 + H(600 + k * 5 + 3) * 3.2, H(600 + k * 5 + 4) * 6.28, pick(PAL.glow, H(600 + k * 5 + 5)), undefined, -.2);
      else if (k < 3 && I.canyon < .25 && H(600 + k * 5 + 3) < .5) add(T.SPIRE, x, z, 2 + H(600 + k * 5 + 4) * 2.2, H(600 + k * 5 + 5) * 6.28, pick(PAL.spireO, H(600 + k * 5 + 6)), undefined, -.6);
    }
    if (H(900) < .22) {   // 石拱：外海，一块里最多一个
      const [x, z] = at(901), I = seabedInfo(x, z);
      if (I.wo > .6) { const s = 6 + H(903) * 5; add(T.ARCH, x, z, s, H(904) * 6.28, PAL.archO, s * (.9 + H(905) * .5), -s * .12); }
    }
    return out;
  }

  // ---- 填实例：每种挑离镜头最近的（100 米内）----
  const lists = MAX.map(() => []), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
  const byD = (a, b) => a[0] - b[0];
  let capK = 1;
  function fill(slots, cam) {
    for (const l of lists) l.length = 0;
    for (const s of slots) if (s && s.deco) for (const o of s.deco) {
      const d = (o.x - cam.x) ** 2 + (o.z - cam.z) ** 2;
      if (d < (o.t === T.ARCH ? 115 * 115 : 100 * 100)) lists[o.t].push([d, o]);
    }
    for (let t = 0; t < MAX.length; t++) {
      const m = meshes[t], l = lists[t], cap = Math.floor(MAX[t] * (t === T.GLOW || t === T.ANEM ? capK : 1));
      if (l.length > cap) l.sort(byD);
      const n = Math.min(cap, l.length);
      for (let i = 0; i < n; i++) {
        const o = l[i][1];
        _q.setFromAxisAngle(_y, o.a);
        _m.compose(_p.set(o.x, o.y, o.z), _q, _s.set(o.s, o.sy, o.s)); m.setMatrixAt(i, _m); m.setColorAt(i, o.c);
      }
      m.count = n; m.visible = n > 0;
      m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
  return {
    gen, fill, meshes,
    setQuality(q) { capK = q >= 1 ? 1 : .55; },
  };
}
