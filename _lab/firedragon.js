// 火山·火龙：一整条连续的身体（每帧按脊柱重算），腿用 IK，翅膀骨架 + 翼膜
import * as THREE from '../lib/three.module.min.js';
import { makeScaleTex, makeRockTex, makeWingTex } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const col = h => new THREE.Color(h);
function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function curve(K, j) {
  const n = K.length, T = K.map(k => k[0]), Y = K.map(k => k[j]);
  const M = Y.map((y, i) => i === 0 ? (Y[1] - Y[0]) / (T[1] - T[0]) : i === n - 1 ? (Y[n - 1] - Y[n - 2]) / (T[n - 1] - T[n - 2]) : (Y[i + 1] - Y[i - 1]) / (T[i + 1] - T[i - 1]));
  return t => {
    if (t <= T[0]) return Y[0]; if (t >= T[n - 1]) return Y[n - 1];
    let i = 0; while (t > T[i + 1]) i++;
    const h = T[i + 1] - T[i], s = (t - T[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * Y[i] + (s3 - 2 * s2 + s) * h * M[i] + (-2 * s3 + 3 * s2) * Y[i + 1] + (s3 - s2) * h * M[i + 1];
  };
}

export const STAGES = [
  { name: '幼龙', size: .44, len: .7, thick: 1.32, neck: .62, neckThick: 1.15, head: 2.05, eye: 2.0, wing: .62, plate: .5, horn: .3, club: .9, leg: .92, plates: 'bumps', snout: .6 },
  { name: '少年龙', size: .72, len: .92, thick: 1.0, neck: 1.2, neckThick: .95, head: 1.55, eye: 1.2, wing: 1.15, plate: .9, horn: .7, club: 1.3, leg: 1.06, plates: 'some', snout: .72 },
  { name: '成龙', size: 1, len: 1, thick: 1.3, neck: 1.0, neckThick: 1.35, head: 1.5, eye: 1.0, wing: 1.5, plate: 1.35, horn: 1.3, club: 1.7, leg: 1.0, plates: 'full', snout: .7 },
];
const PAL = { back: col(0x5e2016), side: col(0x93392a), belly: col(0xefd8b6), dark: col(0x4a1f18), mouth: col(0x5a1a1a), finger: col(0x5a2018) };

let SH = null;
export function sharedMats() {
  if (SH) return SH;
  const sc = makeScaleTex(), rk = makeRockTex(), wg = makeWingTex();
  SH = {
    skin: new THREE.MeshStandardMaterial({ vertexColors: true, map: sc.map, bumpMap: sc.bump, bumpScale: .5, roughness: .7, metalness: 0 }),
    rock: new THREE.MeshStandardMaterial({ map: rk.map, emissive: 0xff5a18, emissiveMap: rk.em, emissiveIntensity: 1.6, roughness: .82, metalness: .05, flatShading: true }),
    wing: new THREE.MeshStandardMaterial({ map: wg.map, emissive: 0xff6a22, emissiveMap: wg.em, emissiveIntensity: 1.3, roughness: .8, side: THREE.DoubleSide }),
    eye: new THREE.MeshStandardMaterial({ color: 0xf0a020, emissive: 0x5a2800, roughness: .2 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x120806, roughness: .25 }),
    shine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: .45 }),
  };
  return SH;
}

// ---------- 几何工具 ----------
// 动态管子：每帧给每一圈的中心、朝向、半径，算出顶点和法线（法线直接算，不会有接缝）
class DynTube {
  constructor(n, M, mat, colorFn, uvFn) {
    this.n = n; this.M = M;
    const nv = n * (M + 1);
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2), cl = new Float32Array(nv * 3), idx = [];
    this.sn = []; this.cs = [];
    for (let j = 0; j <= M; j++) { const th = j / M * Math.PI * 2; this.sn.push(Math.sin(th)); this.cs.push(Math.cos(th)); }
    for (let i = 0; i < n; i++) for (let j = 0; j <= M; j++) {
      const k = i * (M + 1) + j, [u, v] = uvFn(i, j), c = colorFn(i, j, j / M * Math.PI * 2);
      uv[k * 2] = u; uv[k * 2 + 1] = v; cl[k * 3] = c.r; cl[k * 3 + 1] = c.g; cl[k * 3 + 2] = c.b;
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setIndex(idx);
    this.geo = g; this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.S = V(); this.U = V();
  }
  // C 中心，T 前进方向，U 上方向提示；w 横向半径，hT 上半径，hB 下半径
  ring(i, C, T, U, w, hT, hB) {
    const S = this.S.crossVectors(U, T).normalize(), U2 = this.U.crossVectors(T, S);
    const M = this.M, P = this.pos, N = this.nor;
    for (let j = 0; j <= M; j++) {
      const s = this.sn[j], c = this.cs[j], h = c >= 0 ? hT : hB, k = (i * (M + 1) + j) * 3;
      P[k] = C.x + S.x * w * s + U2.x * h * c; P[k + 1] = C.y + S.y * w * s + U2.y * h * c; P[k + 2] = C.z + S.z * w * s + U2.z * h * c;
      let nx = S.x * h * s + U2.x * w * c, ny = S.y * h * s + U2.y * w * c, nz = S.z * h * s + U2.z * w * c;
      const l = Math.hypot(nx, ny, nz) || 1; N[k] = nx / l; N[k + 1] = ny / l; N[k + 2] = nz / l;
    }
  }
  commit() { this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true; }
}
// 静态管子（角、指骨、脚趾）：沿点列，圆截面，末端收尖
function tubeGeo(pts, radii, M = 6, uvs = 1) {
  const n = pts.length, P = [], UV = [], I = [];
  let up = V(0, 1, 0); const T = V(), S = V(), U2 = V(), q = V();
  let len = 0;
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    if (Math.abs(T.dot(up)) > .95) up = V(1, 0, 0);
    S.crossVectors(up, T).normalize(); U2.crossVectors(T, S); up = U2.clone();
    if (i) len += pts[i].distanceTo(pts[i - 1]);
    for (let j = 0; j <= M; j++) {
      const th = j / M * Math.PI * 2;
      q.copy(pts[i]).addScaledVector(S, Math.sin(th) * radii[i]).addScaledVector(U2, Math.cos(th) * radii[i]);
      P.push(q.x, q.y, q.z); UV.push(len * uvs, j / M);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I); g.computeVertexNormals(); return g;
}
function bezPts(a, c, b, n) { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push(V(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z)); } return o; }
function mergeGeos(geos) {
  const attrs = ['position', 'normal', 'uv', 'color'].filter(a => geos.every(g => g.attributes[a]));
  const out = new THREE.BufferGeometry(), I = []; let off = 0;
  for (const a of attrs) {
    const size = geos[0].attributes[a].itemSize, arr = [];
    for (const g of geos) arr.push(...g.attributes[a].array);
    out.setAttribute(a, new THREE.Float32BufferAttribute(arr, size));
  }
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.index) for (let k = 0; k < g.index.count; k++) I.push(g.index.getX(k) + off); else for (let k = 0; k < n; k++) I.push(k + off);
    off += n;
  }
  out.setIndex(I); return out;
}
function solidColor(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
// 头部用的横截面放样：沿 z 轴，截面是“方圆形”，接缝放在下巴底下
function headLoft(K, n, M, e, colorFn) {
  const fw = curve(K, 1), fT = curve(K, 2), fB = curve(K, 3), fy = curve(K, 4), z0 = K[0][0], z1 = K[K.length - 1][0];
  const P = [], UV = [], CL = [], I = [];
  for (let i = 0; i < n; i++) {
    const z = lerp(z0, z1, i / (n - 1)), w = Math.max(.004, fw(z)), hT = Math.max(.004, fT(z)), hB = Math.max(.004, fB(z)), cy = fy(z);
    for (let j = 0; j <= M; j++) {
      const th = Math.PI + j / M * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
      const x = Math.sign(s) * Math.pow(Math.abs(s), 2 / e), y = Math.sign(c) * Math.pow(Math.abs(c), 2 / e);
      P.push(x * w, cy + y * (c >= 0 ? hT : hB), z);
      UV.push(z * 3, j / M * 2.5);
      const cc = colorFn(z, (y + 1) / 2, x); CL.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + 1, c = a + M + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  // 两头封口（不封的话鼻尖和下巴尖会露出两个洞）
  for (const [ring, z, front] of [[0, z0, false], [n - 1, z1, true]]) {
    const ci = P.length / 3, base = ring * (M + 1);
    P.push(0, fy(z), z); UV.push(z * 3, 0); const cc = colorFn(z, .5, 0); CL.push(cc.r, cc.g, cc.b);
    for (let j = 0; j < M; j++) front ? I.push(ci, base + j + 1, base + j) : I.push(ci, base + j, base + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(CL, 3)); g.setIndex(I); g.computeVertexNormals(); return g;
}
// 甲片：一个往后斜的盾形尖锥，扁平着色像岩石
function scuteGeo() {
  const base = [[0, 0, .55], [.44, 0, .22], [.48, 0, -.28], [.2, 0, -.62], [-.2, 0, -.62], [-.48, 0, -.28], [-.44, 0, .22]];
  const apex = [0, 1, -.42], mid = [0, .45, .25];
  const P = [], UV = [];
  const tri = (a, b, c) => {
    const A = V(...a), B = V(...b), C = V(...c), n = V().subVectors(B, A).cross(V().subVectors(C, A));
    const cen = V().add(A).add(B).add(C).multiplyScalar(1 / 3);
    if (n.dot(cen.clone().sub(V(0, .2, -.05))) < 0) { const t = B.clone(); B.copy(C); C.copy(t); }
    for (const p of [A, B, C]) { P.push(p.x, p.y, p.z); UV.push(p.x * .7 + .5, p.z * .7 + p.y * .4 + .5); }
  };
  for (let k = 0; k < base.length; k++) {
    const a = base[k], b = base[(k + 1) % base.length];
    if (k === 0 || k === base.length - 1) { tri(a, b, mid); } else tri(a, b, apex);
  }
  tri(base[0], mid, base[1]); tri(base[base.length - 1], base[0], mid);
  tri(mid, base[1], apex); tri(mid, apex, base[base.length - 1]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.computeVertexNormals(); return g;
}

// ---------- 龙 ----------
const _a = V(), _b = V(), _c = V(), _d = V(), _e = V(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = V();
export function createFireDragon(stageIdx) {
  const st = STAGES[stageIdx], MT = sharedMats();
  const D = { st, stage: stageIdx, MT, root: new THREE.Group(), rig: new THREE.Group(), t: hash(stageIdx + 3) * 10, b: 0, ph: hash(stageIdx) * 6, baseY: 0, flyY: 4 };
  D.root.add(D.rig); D.root.scale.setScalar(st.size);
  buildBody(D); buildHead(D); buildLegs(D); buildWings(D); buildClub(D); buildPlates(D);
  poseSpine(D, 0, 0); placeHead(D, 0);
  // 站立时脚踩的地面高度（龙自身坐标）
  const h = hipPos(D, D.legs[0], _a), L0 = D.legs[0];
  D.groundRig = h.y - (L0.l1 + L0.l2) * .93 - L0.ank;
  D.standH = -D.groundRig;
  D.update = (dt, target) => update(D, dt, target);
  D.update(0, 0);
  return D;
}

// ---------- 身体 ----------
function buildBody(D) {
  const st = D.st, Ln = 2.0 * st.neck * st.len, Lt = 2.7 * st.len, Lc = 5.0 * st.len, L = Ln + Lt + Lc;
  const N = 100, M = 24, ds = L / (N - 1), a = Math.round(Ln / ds), th = st.thick, nt = st.neckThick;
  const K = [
    [0, .3 * nt, .3 * nt, .33 * nt, 0], [Ln * .5, .38 * nt, .37 * nt, .47 * nt, -.04], [Ln * .92, .6 * th, .52 * th, .7 * th, -.1],
    [Ln + .15, .76 * th, .6 * th, .88 * th, -.13], [Ln + Lt * .3, .8 * th, .62 * th, .84 * th, -.1], [Ln + Lt * .68, .64 * th, .55 * th, .6 * th, -.02],
    [Ln + Lt, .6 * th, .56 * th, .52 * th, .03], [Ln + Lt + Lc * .12, .46 * th, .44 * th, .4 * th, 0], [Ln + Lt + Lc * .4, .3 * th, .28 * th, .26 * th, 0],
    [Ln + Lt + Lc * .75, .16 * th, .15 * th, .14 * th, 0], [L, .07, .07, .07, 0]];
  const fw = curve(K, 1), fT = curve(K, 2), fB = curve(K, 3), fy = curve(K, 4);
  const bw = s => s < Ln ? .46 : s < Ln + Lt ? lerp(.44, .38, (s - Ln) / Lt) : lerp(.36, .26, (s - Ln - Lt) / Lc);
  const colorFn = (i, j, t) => {
    const s = i * ds, db = Math.abs(t - Math.PI) / Math.PI, w = bw(s);
    const c = PAL.side.clone().lerp(PAL.back, sm(.6, .92, db)).lerp(PAL.belly, 1 - sm(w - .06, w + .06, db));
    if (s > Ln + Lt + Lc * .6) c.lerp(PAL.dark, sm(Ln + Lt + Lc * .6, L, s) * .5 * sm(.3, .5, db));
    return c.multiplyScalar(1.22 * (1 + (hash(i * 31.7 + j * 7.3) - .5) * .08));
  };
  const tube = new DynTube(N, M, D.MT.skin, colorFn, (i, j) => [i * ds / .55, j / M * 9]);
  D.rig.add(tube.mesh);
  const arr = () => Array.from({ length: N }, () => V());
  D.body = { tube, N, M, ds, a, L, Ln, Lt, Lc, fw, fT, fB, fy, P: arr(), F: arr(), T: arr(), U: arr(), C: arr(), w: new Float32Array(N), hT: new Float32Array(N), hB: new Float32Array(N) };
}
function ortho(out, up, f) { out.copy(up).addScaledVector(f, -up.dot(f)).normalize(); }
function poseSpine(D, time, b) {
  const B = D.body, { N, ds, a, Ln, Lt, Lc } = B;
  for (let i = 0; i < N; i++) {
    const s = i * ds; let p = 0, y = 0;
    if (s < Ln) {
      const u = 1 - s / Ln;
      p = lerp(lerp(.12, 1.0, sm(0, 1, u)), lerp(.02, .3, u), b) + .03 * Math.sin(time * 1.1 + u * 2);
      y = .07 * Math.sin(time * .55) * (1 - u);
    } else if (s < Ln + Lt) { p = lerp(lerp(.2, -.02, (s - Ln) / Lt), 0, b); }
    else {
      const w = (s - Ln - Lt) / Lc;
      p = lerp(.55 - 1.05 * sm(.04, 1, w) + .03 * Math.sin(time * 1.3 - w * 4) * w, .1 - .14 * w + .07 * Math.sin(time * 2.2 - w * 4) * w, b);
      y = lerp(.38 * sm(0, 1, w) + .07 * Math.sin(time * .9 - w * 3) * w, .14 * Math.sin(time * 1.4 - w * 3.5) * w, b);
    }
    const cp = Math.cos(p); B.F[i].set(Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp);
  }
  B.P[a].set(0, 0, 0);
  for (let i = a - 1; i >= 0; i--) B.P[i].copy(B.F[i]).add(B.F[i + 1]).normalize().multiplyScalar(ds).add(B.P[i + 1]);
  for (let i = a + 1; i < N; i++) B.P[i].copy(B.F[i]).add(B.F[i - 1]).normalize().multiplyScalar(-ds).add(B.P[i - 1]);
  ortho(B.U[a], _a.set(0, 1, 0), B.F[a]);
  for (let i = a - 1; i >= 0; i--) ortho(B.U[i], B.U[i + 1], B.F[i]);
  for (let i = a + 1; i < N; i++) ortho(B.U[i], B.U[i - 1], B.F[i]);
  const br = 1 + .028 * Math.sin(time * 1.7);
  for (let i = 0; i < N; i++) {
    const s = i * ds, k = s > Ln * .6 && s < Ln + Lt ? br : 1;
    B.T[i].copy(B.F[i]).negate();
    B.w[i] = B.fw(s) * k; B.hT[i] = B.fT(s) * k; B.hB[i] = B.fB(s) * k;
    B.C[i].copy(B.P[i]).addScaledVector(B.U[i], B.fy(s));
    B.tube.ring(i, B.C[i], B.T[i], B.U[i], B.w[i], B.hT[i], B.hB[i]);
  }
  B.tube.commit();
}
// 身体表面上一点：fi = 第几圈（可以带小数），th = 绕身体的角度（0 = 背中线，正 = 右侧）
function bodySurf(D, fi, th, out, nOut, tOut, r = 1) {
  const B = D.body, i0 = clamp(Math.floor(fi), 0, B.N - 2), f = clamp(fi - i0, 0, 1);
  const s = Math.sin(th), c = Math.cos(th);
  out.set(0, 0, 0); if (nOut) nOut.set(0, 0, 0); if (tOut) tOut.set(0, 0, 0);
  for (const [i, wt] of [[i0, 1 - f], [i0 + 1, f]]) {
    const S = _s.crossVectors(B.U[i], B.T[i]).normalize(), h = c >= 0 ? B.hT[i] : B.hB[i];
    out.addScaledVector(B.C[i], wt).addScaledVector(S, B.w[i] * s * r * wt).addScaledVector(B.U[i], h * c * r * wt);
    if (nOut) nOut.addScaledVector(S, h * s * wt).addScaledVector(B.U[i], B.w[i] * c * wt);
    if (tOut) tOut.addScaledVector(B.T[i], wt);
  }
  if (nOut) nOut.normalize(); if (tOut) tOut.normalize();
  return out;
}
const ringAt = (D, s) => s / D.body.ds;

// ---------- 头 ----------
function buildHead(D) {
  const st = D.st, MT = D.MT, baby = D.stage === 0;
  const head = new THREE.Group(), hs = new THREE.Group(); hs.scale.setScalar(st.head); head.add(hs); D.rig.add(head);
  D.head = head; D.hs = hs;
  const Z = z => z > .3 ? .3 + (z - .3) * st.snout : z;
  const sk = baby ? 1.1 : 1;
  const UP = [[-.3, .05, .05, .05, .03], [-.22, .3, .3, .27, .04], [0, .4 * sk, .35 * sk, .25, .05], [.2, .4 * sk, .33 * sk, .19, .06], [.38, .33, .25, .13, .03], [.58, .27, .19, .09, -.01], [.76, .24, .16, .08, -.03], [.88, .18, .11, .07, -.04], [.95, .05, .05, .04, -.05]].map(k => [Z(k[0]), ...k.slice(1)]);
  const headCol = (z, db) => PAL.side.clone().lerp(PAL.back, sm(.6, .95, db)).lerp(PAL.belly, 1 - sm(.24, .36, db)).multiplyScalar(1.2);
  const upper = new THREE.Mesh(headLoft(UP, 30, 24, 2.5, headCol), MT.skin); upper.castShadow = true; hs.add(upper);
  // 下巴
  const jaw = new THREE.Group(); jaw.position.set(0, -.11, .02); hs.add(jaw); D.jaw = jaw;
  const JW = [[-.08, .05, .04, .05, -.04], [0, .3, .07, .17, -.05], [.25, .3, .07, .16, -.05], [.5, .24, .06, .12, -.03], [.72, .2, .05, .09, -.01], [.84, .05, .03, .04, 0]].map(k => [Z(k[0] + .02) - .02, ...k.slice(1)]);
  const jawCol = (z, db) => db > .8 ? PAL.mouth.clone() : PAL.side.clone().lerp(PAL.belly, 1 - sm(.4, .55, db)).multiplyScalar(1.2);
  const jm = new THREE.Mesh(headLoft(JW, 18, 20, 2.3, jawCol), MT.skin); jm.castShadow = true; jaw.add(jm);
  // 牙
  const teeth = [];
  const fang = baby ? .045 : .1;
  for (const sx of [1, -1]) {
    teeth.push(new THREE.ConeGeometry(.026 * (baby ? .8 : 1), fang, 6).rotateX(Math.PI).translate(sx * .15, -.12 - fang / 2 + .02, Z(.68)));
    if (!baby) for (const z of [.48, .57]) teeth.push(new THREE.ConeGeometry(.018, .05, 5).rotateX(Math.PI).translate(sx * .19, -.1, Z(z)));
  }
  const tm = new THREE.Mesh(mergeGeos(teeth), MT.tooth); hs.add(tm);
  // 鼻孔
  const nos = [];
  for (const sx of [1, -1]) nos.push(new THREE.SphereGeometry(1, 8, 6).scale(.035, .02, .045).translate(sx * .085, Z(.88) > .7 ? .055 : .08, Z(.86)));
  hs.add(new THREE.Mesh(mergeGeos(nos), MT.pupil));
  D.nostrils = [V(.085, .07, Z(.88)), V(-.085, .07, Z(.88))];
  // 眼睛
  const es = st.eye, er = .07 * es;
  for (const sx of [1, -1]) {
    const eg = new THREE.Group(); eg.position.set(sx * (.31 + er * .25), .15 + (baby ? .02 : 0), Z(.24)); if (sx < 0) eg.scale.x = -1;
    eg.rotation.y = -.5 * sx; eg.rotation.z = .15 * sx; hs.add(eg);
    eg.add(new THREE.Mesh(new THREE.SphereGeometry(er, 16, 12).scale(.75, 1, 1), MT.eye));
    eg.add(new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8).scale(er * .2, baby ? er * .62 : er * .78, baby ? er * .5 : er * .25).translate(er * .62, 0, 0), MT.pupil));
    eg.add(new THREE.Mesh(new THREE.SphereGeometry(er * (baby ? .22 : .16), 8, 6).translate(er * .68, er * .35, er * .3), MT.shine));
    if (baby) eg.add(new THREE.Mesh(new THREE.SphereGeometry(er * .1, 6, 5).translate(er * .7, -er * .3, -er * .2), MT.shine));
    (D.eyes ||= []).push(eg);
  }
  // 眉骨甲 + 头上的角冠（岩石）
  const rk = [];
  if (!baby) for (const sx of [1, -1]) rk.push(new THREE.IcosahedronGeometry(1, 0).scale(.1, .06, .19).rotateZ(-sx * .3).translate(sx * .26, .27, Z(.27)));
  const h = st.horn;
  const HN = [
    [[.15, .3, 0], [.3, .7, -.65], .75, .085], [[.29, .21, -.02], [.65, .45, -.6], .55, .07], [[.36, .03, .02], [.75, -.05, -.65], .42, .06],
    [[.3, -.13, .1], [.6, -.45, -.65], .3, .045], [[0, .35, -.08], [0, .55, -.85], .34, .055], [[0, .3, -.22], [0, .5, -.9], .26, .045],
  ];
  HN.forEach(([b, d, len, r], k) => {
    if (baby && k > 1) return;
    for (const sx of b[0] === 0 ? [1] : [1, -1]) {
      const base = V(b[0] * sx, b[1], b[2]), dir = V(d[0] * sx, d[1], d[2]).normalize(), L = len * h;
      const tip = base.clone().addScaledVector(dir, L).add(V(0, -.12 * L, -.2 * L));
      const ctrl = base.clone().addScaledVector(dir, L * .55);
      const pts = bezPts(base, ctrl, tip, 7), rr = pts.map((_, i) => lerp(r * Math.sqrt(h) + .01, .006, Math.pow(i / 7, .85)));
      rk.push(tubeGeo(pts, rr, 6, 2));
    }
  });
  const rm = new THREE.Mesh(mergeGeos(rk.map(g => { if (!g.attributes.uv) { g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); } return g.index ? g : g; })), MT.rock);
  rm.castShadow = true; hs.add(rm);
}
function placeHead(D, b) {
  const B = D.body, F = B.F[0];
  D.head.position.copy(B.C[0]).addScaledVector(F, .1 * D.st.head);
  const yaw = Math.atan2(F.x, F.z), pitch = lerp(-.06, .05, b) + .04 * Math.sin(D.t * .8);
  D.head.rotation.set(-pitch, yaw + .08 * Math.sin(D.t * .5) * (1 - b), 0, 'YXZ');
}

// ---------- 腿（两节 IK + 脚掌） ----------
function buildLegs(D) {
  D.legs = [];
  for (const front of [true, false]) for (const side of [1, -1]) {
    const st = D.st, k = st.leg * Math.sqrt(st.thick) * (D.stage === 0 ? .85 : 1);
    const L = front ? { l1: .95 * k, l2: .85 * k, foot: .34 * k, ank: .22 * k, R: [.36, .33, .3, .16, .19, .12, .1] } : { l1: 1.05 * k, l2: .95 * k, foot: .5 * k, ank: .45 * k, R: [.52, .47, .4, .2, .17, .11, .1] };
    L.R = L.R.map(r => r * k * (D.stage === 0 ? 1.15 : 1) * (front ? 1.3 : 1.2)); L.front = front; L.side = side; L.k = k;
    const n = 40, M = 12;
    const colorFn = (i) => PAL.side.clone().lerp(PAL.dark, sm(.55, 1, i / (n - 1)) * .7).multiplyScalar(1.2 * (1 + (hash(i * 3.1) - .5) * .06));
    L.tube = new DynTube(n, M, D.MT.skin, colorFn, (i, j) => [i * .08, j / M * 3.5]);
    D.rig.add(L.tube.mesh);
    L.pts = [V(), V(), V(), V(), V()]; L.knee = V(); L.ring = Array.from({ length: n }, () => ({ C: V(), T: V(), U: V(), r: 0 }));
    // 脚趾 + 爪子
    const paw = new THREE.Group(); D.rig.add(paw); L.paw = paw;
    const toes = [], claws = [], nt = front ? 4 : 3;
    for (let t = 0; t < nt; t++) {
      const x = (t - (nt - 1) / 2) * .09 * k, a = V(x, .02, -.04 * k), b = V(x * 1.7, -.01, .2 * k);
      toes.push(solidColor(tubeGeo([a, a.clone().lerp(b, .5).add(V(0, .03, 0)), b], [.065 * k, .06 * k, .045 * k], 8, 2), PAL.side.clone().lerp(PAL.dark, .5).multiplyScalar(1.1)));
      claws.push(tubeGeo(bezPts(b, b.clone().add(V(x * .3, .02, .08 * k)), b.clone().add(V(x * .4, -.08 * k, .12 * k)), 4), [.035 * k, .03 * k, .02 * k, .01 * k, .003], 5, 2));
    }
    const tm = new THREE.Mesh(mergeGeos(toes), D.MT.skin), cm = new THREE.Mesh(mergeGeos(claws), D.MT.rock);
    tm.castShadow = cm.castShadow = true; paw.add(tm, cm);
    D.legs.push(L);
  }
}
function hipPos(D, L, out) {
  const B = D.body, s = L.front ? B.Ln + .3 * D.st.len : B.Ln + B.Lt - .25 * D.st.len;
  return bodySurf(D, ringAt(D, s), L.side * (L.front ? 1.95 : 1.85), out, null, null, .72);
}
// 两节 IK：髋 H、目标 A、两段长度、膝盖朝向提示
function ik(H, A, l1, l2, hint, knee, ankle) {
  _d.subVectors(A, H); const L = _d.length(), Lc = clamp(L, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3); _d.multiplyScalar(1 / (L || 1));
  const a = (l1 * l1 - l2 * l2 + Lc * Lc) / (2 * Lc), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  _e.copy(hint).addScaledVector(_d, -hint.dot(_d)).normalize();
  knee.copy(H).addScaledVector(_d, a).addScaledVector(_e, h);
  ankle.copy(H).addScaledVector(_d, Lc);
}
const crP = (p0, p1, p2, p3, t, o) => { const t2 = t * t, t3 = t2 * t; return o.set(
  .5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
  .5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  .5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)); };
const SEG = [3, 13, 13, 10];
function poseLeg(D, L, b) {
  const B = D.body, F = B.F[B.a], k = L.k;
  const hip = hipPos(D, L, L.pts[1]);
  const inward = _c.copy(B.C[ringAt(D, L.front ? B.Ln + .3 : B.Ln + B.Lt - .25) | 0]).sub(hip);
  L.pts[0].copy(hip).addScaledVector(inward, .45);
  const gy = D.groundRig, step = (L.side > 0 ? 1 : -1) * (L.front ? .16 : -.12) * k;
  // 目标：站立踩地 / 飞行收腿
  const A = _a, Tp = _b;
  if (L.front) {
    A.set(hip.x * 1.05, lerp(gy + L.ank, hip.y - .5 * (L.l1 + L.l2), b), lerp(hip.z + .12 * k + step, hip.z - .2 * (L.l1 + L.l2), b));
    Tp.set(A.x, lerp(gy + .05, A.y - .08, b), A.z + lerp(.34 * k, -.3 * k, b));
  } else {
    A.set(hip.x * 1.05, lerp(gy + L.ank, hip.y - .4 * (L.l1 + L.l2), b), lerp(hip.z - .42 * k + step, hip.z - .78 * (L.l1 + L.l2), b));
    Tp.set(A.x, lerp(gy + .05, A.y - .05, b), A.z + lerp(.52 * k, -.45 * k, b));
  }
  const hint = _e.copy(F).multiplyScalar(L.front ? -1 : 1).add(V(hip.x > 0 ? .3 : -.3, 0, 0));
  const ank = L.pts[3], knee = L.pts[2];
  ik(hip, A, L.l1, L.l2, hint.clone(), knee, ank);
  L.pts[4].copy(Tp).add(_d.subVectors(ank, A));
  // 沿 5 个控制点画一条平滑的腿
  const P = L.pts, R = L.R, rings = L.ring;
  let idx = 0;
  for (let sgi = 0; sgi < 4; sgi++) {
    const p0 = P[Math.max(0, sgi - 1)], p1 = P[sgi], p2 = P[sgi + 1], p3 = P[Math.min(4, sgi + 2)], cnt = SEG[sgi];
    for (let q = 0; q < cnt + (sgi === 3 ? 1 : 0); q++) {
      const f = q / cnt; crP(p0, p1, p2, p3, f, rings[idx].C);
      let r;
      if (sgi === 0) r = lerp(R[0], R[1], f);
      else if (sgi === 1) r = lerp(R[1], R[3], f) + (R[2] - (R[1] + R[3]) / 2) * Math.sin(Math.PI * f) * 1.2;
      else if (sgi === 2) r = lerp(R[3], R[5], f) + (R[4] - (R[3] + R[5]) / 2) * Math.sin(Math.PI * f) * 1.2;
      else r = lerp(R[5], R[6], f);
      rings[idx].r = r; idx++;
    }
  }
  let up = V(hip.x > 0 ? 1 : -1, 0, 0);
  for (let i = 0; i < rings.length; i++) {
    const T = rings[i].T.subVectors(rings[Math.min(rings.length - 1, i + 1)].C, rings[Math.max(0, i - 1)].C).normalize();
    ortho(rings[i].U, up, T); up = rings[i].U;
    L.tube.ring(i, rings[i].C, T, rings[i].U, rings[i].r, rings[i].r, rings[i].r);
  }
  L.tube.commit();
  // 脚掌
  const fd = _d.subVectors(P[4], P[3]); fd.y = lerp(0, fd.y, b); fd.normalize();
  const upv = V(0, 1, 0).addScaledVector(fd, -fd.y).normalize(), xs = V().crossVectors(upv, fd);
  L.paw.position.copy(P[4]); _m.makeBasis(xs, upv, fd); L.paw.quaternion.setFromRotationMatrix(_m);
}

// ---------- 翅膀 ----------
const FINGERS = [[0, 2.85], [.42, 2.6], [.85, 2.3], [1.25, 1.85]];
function buildWings(D) {
  D.wings = [];
  const ws = D.st.wing, K = 6, R = 6;
  for (const side of [1, -1]) {
    const W = { side };
    const root = new THREE.Group(); if (side < 0) root.scale.x = -1; D.rig.add(root);
    const sh = new THREE.Group(); root.add(sh);
    const E = V(1.25, .2, .25).multiplyScalar(ws), Wv = V(1.65, 0, -.35).multiplyScalar(ws);
    const el = new THREE.Group(); el.position.copy(E); sh.add(el);
    const wr = new THREE.Group(); wr.position.copy(Wv); el.add(wr);
    W.fingers = []; W.tips = [];
    const fg = [];
    for (const [ang, len] of FINGERS) {
      const piv = new THREE.Group(); piv.rotation.y = ang; wr.add(piv);
      const g = solidColor(tubeGeo([V(), V(len * ws * .5, .02, 0), V(len * ws, 0, 0)], [.075 * ws, .05 * ws, .015 * ws], 8, 2), PAL.finger.clone().multiplyScalar(1.2));
      const m = new THREE.Mesh(g, D.MT.skin); m.castShadow = true; piv.add(m);
      const tip = new THREE.Object3D(); tip.position.set(len * ws, 0, 0); piv.add(tip);
      W.fingers.push({ piv, ang }); W.tips.push(tip);
    }
    const claw = new THREE.Mesh(tubeGeo(bezPts(V(.04, .03, .02), V(.12 * ws, .16 * ws, .12 * ws), V(.04 * ws, .26 * ws, .24 * ws), 5), [.06 * ws, .05 * ws, .04 * ws, .028 * ws, .014 * ws, .003], 6, 2), D.MT.rock);
    claw.castShadow = true; wr.add(claw);
    // 上臂 + 前臂：一条动态的管子
    W.arm = new DynTube(24, 12, D.MT.skin, i => PAL.back.clone().lerp(PAL.dark, i / 23 * .6).multiplyScalar(1.2), (i, j) => [i * .06, j / 12 * 2]);
    root.add(W.arm.mesh);
    W.armRing = Array.from({ length: 24 }, () => ({ C: V(), T: V(), U: V(), r: 0 }));
    // 翼膜：从腕部扇形展开
    const nb = FINGERS.length + 3, S = nb - 1, Ne = S * K + 1, nv = 1 + Ne * R;
    const g = new THREE.BufferGeometry(), pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), I = [];
    uv[0] = .5; uv[1] = 0;
    for (let e = 0; e < Ne; e++) for (let r = 1; r <= R; r++) { const k = 1 + e * R + (r - 1); uv[k * 2] = e / (Ne - 1); uv[k * 2 + 1] = r / R; }
    for (let e = 0; e < Ne - 1; e++) {
      const a = 1 + e * R, bb = 1 + (e + 1) * R; I.push(0, a, bb);
      for (let r = 0; r < R - 1; r++) I.push(a + r, a + r + 1, bb + r, bb + r, a + r + 1, bb + r + 1);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(I);
    const mem = new THREE.Mesh(g, D.MT.wing); mem.frustumCulled = false; mem.castShadow = true; mem.receiveShadow = true; root.add(mem);
    Object.assign(W, { root, sh, el, wr, mem, pos, S, K, R, Ne, sags: [.2, .2, .2, .26, 0, 0] });
    W.jag = Array.from({ length: Ne }, (_, e) => (hash(e * 9.1 + side) * .05 + (e % 2) * .025) * ws);
    D.wings.push(W);
  }
}
const _inv = new THREE.Matrix4(), _bp = [], _wpt = V();
for (let i = 0; i < 12; i++) _bp.push(V());
function poseWing(D, W, b) {
  const B = D.body, st = D.st;
  // 翅根：肩上
  const p = bodySurf(D, ringAt(D, B.Ln + .12), -W.side * .78, _a, null, null, .82);
  const S = _b.crossVectors(B.U[B.a], B.T[B.a]).normalize(), X = _c.copy(S).negate();
  W.root.position.copy(p); _m.makeBasis(X, B.U[B.a], B.F[B.a]); W.root.quaternion.setFromRotationMatrix(_m);
  // 站立：翅膀高高举起；飞行：扇动
  const ph = D.ph, a = .85, c = Math.cos(ph), s = Math.sin(ph), fold = a * Math.max(0, c) * .45;
  const fly = [.12 * a * c, .15 * a * c + fold * .3, .12 + a * s, fold * .6, .3 * a * Math.sin(ph - .7), fold * 1.0, .28 * a * Math.sin(ph - 1.3), 1 - fold * .3];
  const sb = .05 * Math.sin(D.t * .9);
  const stand = [-.32, .05, 1.48 + sb, .1, .18, .55 + sb, -.05, 1.05];
  const v = stand.map((x, i) => lerp(x, fly[i], b));
  W.sh.rotation.set(v[0], v[1], v[2], 'XYZ'); W.el.rotation.set(0, v[3], v[4]); W.wr.rotation.set(0, v[5], v[6]);
  W.fingers.forEach(f => { f.piv.rotation.y = f.ang * v[7]; });
}
function wingSkin(D, W) {
  const B = D.body;
  _inv.copy(W.root.matrixWorld).invert();
  const loc = (o, out) => out.setFromMatrixPosition(o.matrixWorld).applyMatrix4(_inv);
  const Wr = loc(W.wr, _bp[0]), E = loc(W.el, _bp[1]), A = _bp[2].set(0, 0, 0);
  // 腰部的连接点（龙自身坐标 → 翅根坐标）
  const hip = bodySurf(D, ringAt(D, B.Ln + B.Lt * .85), -W.side * .7, _bp[3], null, null, .9);
  hip.applyMatrix4(D.rig.matrixWorld).applyMatrix4(_inv);
  const bnd = W.tips.map((t, i) => loc(t, _bp[4 + i])).concat([hip, A, E]);
  const { pos, S, K, R, Ne, sags, jag } = W;
  pos[0] = Wr.x; pos[1] = Wr.y; pos[2] = Wr.z;
  for (let e = 0; e < Ne; e++) {
    let sct = Math.min(S - 1, Math.floor(e / K)), f = (e - sct * K) / K;
    if (e === Ne - 1) { sct = S - 1; f = 1; }
    const p = _d.lerpVectors(bnd[sct], bnd[sct + 1], f);
    const sag = sags[sct] * Math.sin(Math.PI * f) + (sct < 4 ? jag[e] : 0);
    p.addScaledVector(_e.subVectors(Wr, p), sag);
    for (let r = 1; r <= R; r++) {
      const k = (1 + e * R + (r - 1)) * 3, t = r / R;
      pos[k] = Wr.x + (p.x - Wr.x) * t; pos[k + 1] = Wr.y + (p.y - Wr.y) * t; pos[k + 2] = Wr.z + (p.z - Wr.z) * t;
    }
  }
  W.mem.geometry.attributes.position.needsUpdate = true; W.mem.geometry.computeVertexNormals();
  // 手臂管子：肩内 → 肩 → 肘 → 腕
  const ws = D.st.wing, P = [V(-.3 * ws, -.12, 0), A.clone(), E.clone(), Wr.clone()], Rr = [.3, .26, .14, .09].map(r => r * Math.sqrt(ws) * (D.stage === 0 ? 1.2 : 1));
  const rings = W.armRing, cnt = [4, 10, 10];
  let idx = 0;
  for (let sg = 0; sg < 3; sg++) for (let q = 0; q < cnt[sg] + (sg === 2 ? 0 : 0); q++) {
    if (idx >= 24) break;
    const f = q / cnt[sg]; crP(P[Math.max(0, sg - 1)], P[sg], P[sg + 1], P[Math.min(3, sg + 2)], f, rings[idx].C);
    rings[idx].r = lerp(Rr[sg], Rr[sg + 1], f) + (sg === 1 ? .04 * Math.sin(Math.PI * f) : 0); idx++;
  }
  while (idx < 24) { rings[idx].C.copy(Wr); rings[idx].r = Rr[3] * .5; idx++; }
  let up = V(0, 1, 0);
  for (let i = 0; i < 24; i++) {
    const T = rings[i].T.subVectors(rings[Math.min(23, i + 1)].C, rings[Math.max(0, i - 1)].C);
    if (T.lengthSq() < 1e-8) T.set(1, 0, 0); T.normalize();
    ortho(rings[i].U, up, T); up = rings[i].U;
    W.arm.ring(i, rings[i].C, T, rings[i].U, rings[i].r, rings[i].r * 1.1, rings[i].r * .9);
  }
  W.arm.commit();
}

// ---------- 尾巴上的黑曜石 ----------
function buildClub(D) {
  const k = D.st.club;
  const g = mergeGeos([
    new THREE.OctahedronGeometry(1, 0).scale(.3 * k, .34 * k, .62 * k).translate(0, 0, .35 * k),
    new THREE.OctahedronGeometry(1, 0).scale(.08 * k, .2 * k, .12 * k).rotateX(-.6).translate(0, .26 * k, .1 * k),
    new THREE.OctahedronGeometry(1, 0).scale(.06 * k, .14 * k, .1 * k).rotateX(.7).translate(0, -.22 * k, .12 * k),
  ].map(x => x.index ? x : x));
  D.club = new THREE.Mesh(g, D.MT.rock); D.club.castShadow = true; D.rig.add(D.club);
}
function placeClub(D) {
  const B = D.body, i = B.N - 1, T = B.T[i], U = B.U[i], X = _a.crossVectors(U, T).normalize();
  D.club.position.copy(B.C[i]).addScaledVector(T, -.06);
  _m.makeBasis(X, U, T); D.club.quaternion.setFromRotationMatrix(_m); D.club.rotateZ(.5);
}

// ---------- 甲片 ----------
function buildPlates(D) {
  const B = D.body, st = D.st, list = [], ps = st.plate;
  const add = (src, fi, th, sx, sy, sz, sink = .3, extra = {}) => list.push({ src, fi, th, sx: sx * ps, sy: sy * ps, sz: sz * ps, sink, ...extra });
  const dorsalSize = s => s < B.Ln ? lerp(.2, .36, s / B.Ln) : s < B.Ln + B.Lt ? lerp(.44, .34, (s - B.Ln) / B.Lt) : lerp(.32, .12, (s - B.Ln - B.Lt) / B.Lc);
  if (st.plates === 'bumps') {
    for (let s = B.Ln * .5; s < B.L - .4; s += .26) { const z = dorsalSize(s) * .9; add('body', ringAt(D, s), 0, z * .8, z * .9, z, .35); }
  } else {
    const gap = st.plates === 'full' ? .3 : .36;
    for (let s = .25; s < B.L - .35; s += gap * (s > B.Ln + B.Lt ? .85 : 1)) { const z = dorsalSize(s); add('body', ringAt(D, s), 0, z * .8, z * 1.35, z, .25); }
    const rows = st.plates === 'full' ? [.62, 1.05, 1.45] : [.7];
    for (const th of rows) for (let s = B.Ln - .3; s < B.Ln + B.Lt * (th > 1.2 ? .45 : .85); s += .3) {
      const z = (th > 1.2 ? .26 : .32) * (1 - .3 * Math.abs(s - B.Ln) / B.Lt);
      for (const sd of [1, -1]) add('body', ringAt(D, s + (th > .9 ? .15 : 0)), th * sd, z, z * .5, z * 1.1, .35);
    }
    if (st.plates === 'full') {
      for (let s = .4; s < B.Ln - .2; s += .28) for (const sd of [1, -1]) add('body', ringAt(D, s), .95 * sd, .2, .12, .24, .4);
      for (let s = B.Ln + B.Lt + .2; s < B.Ln + B.Lt + B.Lc * .45; s += .3) for (const sd of [1, -1]) add('body', ringAt(D, s), .75 * sd, .2, .12, .24, .4);
    }
    // 前腿、翅膀前缘的护甲
    D.legs.forEach((L, li) => { if (!L.front) return; for (const ri of (st.plates === 'full' ? [6, 9, 12, 19, 23] : [7, 20])) add('leg', ri, 0, .26, .16, .3, .4, { li }); });
    D.wings.forEach((W, wi) => { for (const ri of (st.plates === 'full' ? [5, 8, 11, 14, 17] : [7, 13])) add('arm', ri, 0, .2, .2, .26, .35, { wi }); });
  }
  const im = new THREE.InstancedMesh(scuteGeo(), D.MT.rock, list.length);
  im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; D.rig.add(im);
  D.plates = { list, im };
}
const _P = V(), _N = V(), _T = V(), _X = V(), _Z = V();
function placePlates(D) {
  const { list, im } = D.plates;
  list.forEach((pl, k) => {
    if (pl.src === 'body') bodySurf(D, pl.fi, pl.th, _P, _N, _T);
    else {
      const rg = pl.src === 'leg' ? D.legs[pl.li].ring[pl.fi] : D.wings[pl.wi].armRing[pl.fi];
      const S = _X.crossVectors(rg.U, rg.T).normalize(), s = Math.sin(pl.th), c = Math.cos(pl.th);
      _N.copy(rg.U).multiplyScalar(c).addScaledVector(S, s).normalize();
      _P.copy(rg.C).addScaledVector(_N, rg.r); _T.copy(rg.T);
      if (pl.src === 'arm') { const mw = D.wings[pl.wi].root.matrix; _P.applyMatrix4(mw); _N.transformDirection(mw); _T.transformDirection(mw); }
    }
    _Z.copy(_T).negate().addScaledVector(_N, _T.dot(_N)).normalize();
    _X.crossVectors(_N, _Z).normalize();
    _P.addScaledVector(_N, -pl.sy * pl.sink);
    _m.makeBasis(_X, _N, _Z); _m.scale(_s.set(pl.sx, pl.sy, pl.sz)); _m.setPosition(_P);
    im.setMatrixAt(k, _m);
  });
  im.instanceMatrix.needsUpdate = true;
}

// ---------- 每帧 ----------
function update(D, dt, target) {
  D.t += dt;
  D.b += (target - D.b) * (1 - Math.exp(-dt * 3));
  const b = sm(0, 1, D.b);
  D.ph += dt * Math.PI * 2 * .72 * b;
  poseSpine(D, D.t, b);
  placeHead(D, b);
  D.jaw.rotation.x = .04 + .02 * Math.sin(D.t * 1.3);
  // 眨眼
  const bl = (D.t % 4.3) < .12 ? .12 : 1; for (const e of D.eyes) e.scale.y = bl;
  for (const L of D.legs) poseLeg(D, L, b);
  for (const W of D.wings) poseWing(D, W, b);
  placeClub(D);
  const bob = -.12 * b * Math.sin(D.ph - .5);
  D.root.position.y = D.baseY + lerp(D.standH * D.st.size, D.flyY, b) + bob * D.st.size;
  D.root.updateMatrixWorld(true);
  for (const W of D.wings) wingSkin(D, W);
  placePlates(D);
  D.MT.rock.emissiveIntensity = 1.5 + .35 * Math.sin(D.t * 2.1);
}
// 鼻孔的世界坐标（冒烟用）
export function nostrilWorld(D, i, out) { return out.copy(D.nostrils[i]).applyMatrix4(D.hs.matrixWorld); }
