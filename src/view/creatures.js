// 生物渲染：每种 1 个 InstancedMesh 本体 + 1 个描边（共用几何、实例矩阵和实例属性），
// 每帧按 S.creatures 写矩阵 / 相位 / 换色。近的排前面，描边只画前 nNear 个（150 米外不画描边）。
import * as THREE from 'three';
import { SPECIES, SPECIES_IDS, GOLD } from '../config/species.js';
import { bodyMat, hullMat, outlineW, outlineColor } from './creature-kit.js';
import { MODELS, ANIM_HZ } from './creatures/models.js';
export { ANIM_HZ };

const OUT_FAR = 150;                              // 描边可见距离
const CULL_DEPTH = 8, CULL_HEIGHT = 6;            // 镜头在水上：比 -8 米还深的不画；在水下：比 +6 米还高的不画
const FOG_UW = new THREE.Color(0x0e5a6e);         // 水下雾色（描边往这边偏）
const ROAST = new THREE.Color(0xb0602c);          // 烤熟的橙褐
const GOLD_C = new THREE.Color(GOLD);
const TAU = Math.PI * 2, WRAP = Math.PI * 4;      // 着色器里相位只用 0.5 / 1 / 2 倍，按 4π 取模不跳
const hash01 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822507); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };


export function createCreatures(ctx) {
  const { scene, camera, renderer, GRAD, outlineMat } = ctx;
  const root = new THREE.Group(); root.name = 'creatures'; scene.add(root);
  const B = {};
  for (const sp of SPECIES_IDS) {
    const cfg = SPECIES[sp], m = MODELS[sp](cfg.colors), geo = m.geo;
    const cap = Math.ceil(cfg.max * 1.25) + 4;
    const iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const iC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iA', iA); geo.setAttribute('iC', iC);
    const U = {
      uK: { value: new THREE.Vector4(m.kind, m.eyeType || 0, 0, 0) },
      uP: { value: new THREE.Vector4(...m.P) }, uQ: { value: new THREE.Vector4(...m.Q) },
      uEye: { value: new THREE.Vector4(...(m.eye || [0, 0, 0, 0])) },
    };
    const mat = bodyMat(GRAD, U, { emissive: m.emis || 0 });
    const oc = outlineColor(cfg.colors.body), ow = outlineW(cfg.len);
    const hull = hullMat(outlineMat, oc.clone(), ow, U);
    const body = new THREE.InstancedMesh(geo, mat, cap), line = new THREE.InstancedMesh(geo, hull, cap);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    line.instanceMatrix = body.instanceMatrix;                     // 描边和本体共用同一份实例矩阵
    for (const o of [body, line]) { o.frustumCulled = false; o.count = 0; o.visible = false; o.name = 'cr_' + sp; root.add(o); }
    line.name += '_line';
    B[sp] = { sp, cfg, m, cap, geo, iA, iC, U, mat, hull, body, line, oc, ow, near: [], far: [], nNear: 0, n: 0 };
  }

  // 每个个体的小状态（翻肚皮要平滑地转过去）
  const state = new Map(); let frameNo = 0;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const cp = new THREE.Vector3();

  function write(b, i, c, alpha, dt, time, fire) {
    let st = state.get(c.id);
    if (!st || st.sp !== c.sp) { st = { sp: c.sp, roll: c.stun > 0 ? 1 : 0, f: 0 }; state.set(c.id, st); }
    st.f = frameNo;
    st.roll += ((c.stun > 0 ? 1 : 0) - st.roll) * (1 - Math.exp(-7 * dt));
    const a = alpha, px = c.px ?? c.x, py = c.py ?? c.y, pz = c.pz ?? c.z;
    _p.set(px + (c.x - px) * a, py + (c.y - py) * a, pz + (c.z - pz) * a);
    const wob = c.stun > 0 ? Math.sin(time * 2.2 + c.id) * .18 : 0;
    _e.set(-(c.pitch || 0), c.yaw || 0, (c.roll || 0) + st.roll * Math.PI + wob);
    _q.setFromEuler(_e); _s.setScalar(c.size || b.cfg.len);
    _m.compose(_p, _q, _s).toArray(b.body.instanceMatrix.array, i * 16);
    // 动画：相位 + 力度（晕了 / 烤熟了基本不动）
    let ph = c.phase ?? (time * ANIM_HZ[b.sp] * TAU + hash01(c.id) * TAU), fl = c.flap ?? 1;
    if (c.stun > 0 || c.roast > 0) fl *= .12;
    ph %= WRAP; if (ph < 0) ph += WRAP;
    const A = b.iA.array, C = b.iC.array, k = i * 4;
    A[k] = ph; A[k + 1] = fl; A[k + 2] = hash01(c.id * 7 + 3); A[k + 3] = 0;
    // 换色：烤熟 > 金色 > 火龙正在烤（cooked 进度慢慢变橙）
    let col = null, amt = 0;
    if (c.roast > 0) { col = ROAST; amt = .85; }
    else if (c.gold) { col = GOLD_C; amt = 1; }
    else if (fire && c.cooked > 0) { col = ROAST; amt = Math.min(1, c.cooked) * .6; }
    if (col) { C[k] = col.r; C[k + 1] = col.g; C[k + 2] = col.b; C[k + 3] = amt; } else C[k + 3] = 0;
  }

  const range = (attr, n, w) => { attr.clearUpdateRanges(); attr.addUpdateRange(0, n * w); attr.needsUpdate = true; };

  function update(S, alpha = 1, dt = 1 / 60, time = 0) {
    frameNo++;
    camera.getWorldPosition(cp);
    const far2 = OUT_FAR * OUT_FAR, fire = S.kind === 'fire', list = S.creatures || [];
    // 海面不透明：镜头在水上时不画深水里的，在水下时不画天上的（留足浪和半透明的余量）
    const camUp = cp.y > 0, cull = api.cullMedium;
    for (const sp in B) { B[sp].near.length = 0; B[sp].far.length = 0; }
    for (const c of list) {
      const b = B[c.sp]; if (!b) continue;
      if (cull) { const r = (c.size || b.cfg.len) * .6; if (camUp ? c.y + r < -CULL_DEPTH : c.y - r > CULL_HEIGHT) continue; }
      const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z;
      (dx * dx + dy * dy + dz * dz < far2 ? b.near : b.far).push(c);
    }
    for (const sp in B) {
      const b = B[sp]; let n = 0;
      for (const c of b.near) { if (n >= b.cap) break; write(b, n++, c, alpha, dt, time, fire); }
      const nn = n;
      for (const c of b.far) { if (n >= b.cap) break; write(b, n++, c, alpha, dt, time, fire); }
      b.n = n; b.nNear = nn;
      b.body.count = n; b.line.count = nn; b.body.visible = n > 0; b.line.visible = nn > 0;
      if (n) { range(b.body.instanceMatrix, n, 16); range(b.iA, n, 4); range(b.iC, n, 4); }
    }
    if (frameNo % 120 === 0) for (const [id, st] of state) if (frameNo - st.f > 30) state.delete(id);
  }

  // 水下：描边颜色往水下雾色偏（k = 0..1）
  let uw = 0;
  function setUnderwater(k) {
    uw = Math.min(1, Math.max(0, k || 0));
    for (const sp in B) B[sp].hull.color.copy(B[sp].oc).lerp(FOG_UW, uw * .7);
  }

  // ---------- 小图：3/4 侧面、透明背景的 dataURL（图鉴 / 小目标卡用）----------
  // 用主渲染器画到一张离屏渲染目标上，再读回来；画完把渲染器状态（目标、清屏色）还原。
  const pCache = new Map();
  let pScene = null, pCam = null, pRT = null, pBody = null, pLine = null;
  function portrait(sp, size = 128) {
    const key = sp + ':' + size;
    if (pCache.has(key)) return pCache.get(key);
    const b = B[sp]; if (!b) return '';
    if (!pScene) {
      pScene = new THREE.Scene();
      pScene.add(new THREE.HemisphereLight(0xdcecff, 0x6b5a4a, 1.1));
      const sun = new THREE.DirectionalLight(0xfff0d8, 2.4); sun.position.set(-.35, .75, .9); pScene.add(sun);
      pCam = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 20); pCam.position.set(0, 0, 10);
    }
    const S2 = size * 2;
    if (!pRT || pRT.width !== S2) { pRT?.dispose(); pRT = new THREE.WebGLRenderTarget(S2, S2, { depthBuffer: true }); }
    // 单独的一份几何（每种一份，缓存着、不释放）：共用顶点数据，但个体属性只有 1 个，不碰游戏里的实例数据。
    // 注意不能 dispose 它：顶点缓冲是和游戏网格共用的
    if (!b.pm) {
      const g2 = new THREE.BufferGeometry();
      for (const k of ['position', 'normal', 'color', 'aP']) g2.setAttribute(k, b.geo.getAttribute(k));
      g2.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array([0.6, .5, .3, 0]), 4));
      g2.setAttribute('iC', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
      const pb = new THREE.InstancedMesh(g2, b.mat, 1), pl = new THREE.InstancedMesh(g2, b.hull, 1);
      pl.instanceMatrix = pb.instanceMatrix; pb.frustumCulled = pl.frustumCulled = false;
      b.pm = { pb, pl };
    }
    if (pBody) pScene.remove(pBody, pLine);
    pBody = b.pm.pb; pLine = b.pm.pl;
    const [yaw, tilt] = b.m.view || [.55, .32];
    const g = new THREE.Object3D(); g.rotation.set(tilt, Math.PI / 2 - yaw, 0, 'XYZ'); g.updateMatrix();
    pBody.setMatrixAt(0, g.matrix); pBody.instanceMatrix.needsUpdate = true;
    pScene.add(pBody, pLine);
    // 取景：静止姿态的包围盒转一下，正交相机框住（留 8% 边）
    const bb = b.geo.boundingBox, box = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) box.expandByPoint(v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(g.matrix));
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, h = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2 * 1.06 + b.ow;
    Object.assign(pCam, { left: cx - h, right: cx + h, top: cy + h, bottom: cy - h }); pCam.updateProjectionMatrix();
    // 画（描边用原色，不受水下影响）
    const prevRT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    const prevHull = b.hull.color.clone(); b.hull.color.copy(b.oc);
    renderer.setRenderTarget(pRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
    renderer.render(pScene, pCam);
    const buf = new Uint8Array(S2 * S2 * 4);
    renderer.readRenderTargetPixels(pRT, 0, 0, S2, S2, buf);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(prevC, prevA);
    b.hull.color.copy(prevHull);
    // 线性 → sRGB，上下翻转，2 倍超采样缩小
    const big = document.createElement('canvas'); big.width = big.height = S2;
    const bc = big.getContext('2d'), img = bc.createImageData(S2, S2);
    for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
      const si = ((S2 - 1 - y) * S2 + x) * 4, di = (y * S2 + x) * 4;
      img.data[di] = LUT[buf[si]]; img.data[di + 1] = LUT[buf[si + 1]]; img.data[di + 2] = LUT[buf[si + 2]]; img.data[di + 3] = buf[si + 3];
    }
    bc.putImageData(img, 0, 0);
    const out = document.createElement('canvas'); out.width = out.height = size;
    const oc2 = out.getContext('2d'); oc2.imageSmoothingEnabled = true; oc2.imageSmoothingQuality = 'high'; oc2.drawImage(big, 0, 0, size, size);
    const url = out.toDataURL('image/png');
    pCache.set(key, url);
    return url;
  }

  // 调试用：本帧生物的绘制次数和三角面（含描边）
  function stats() {
    let calls = 0, tris = 0;
    for (const sp in B) { const b = B[sp]; if (b.n) { calls += 1 + (b.nNear ? 1 : 0); tris += b.m.tris * (b.n + b.nNear); } }
    return { calls, tris };
  }

  // 预编译：加载时调一次，生物第一次出现时就不会卡一下（所有物种共用一个本体程序 + 一个描边程序）
  function prewarm() {
    const vis = [];
    for (const sp in B) for (const o of [B[sp].body, B[sp].line]) { vis.push([o, o.visible]); o.visible = true; }
    try { renderer.compile(scene, camera); } finally { for (const [o, v] of vis) o.visible = v; }
  }

  const api = { update, setUnderwater, portrait, prewarm, stats, root, species: B, cullMedium: true, get underwater() { return uw; } };
  return api;
}

const LUT = new Uint8Array(256).map((_, i) => { const c = i / 255; return Math.round(255 * (c <= .0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - .055)); });
