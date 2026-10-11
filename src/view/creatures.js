// 生物渲染：每种 1 个 InstancedMesh 本体 + 1 个描边（共用几何、实例矩阵和实例属性），
// 每帧按 S.creatures 写矩阵 / 相位 / 换色 / 状态。画面外的不画；近的排前面，描边只画前 nNear 个（150 米外不画描边，112 米起慢慢收细；身体在屏幕上不到 6 像素的也不画）。
// 远处的画大一点（26 米起慢慢放大，75 米外 +35%，200 米外 +60%），手机上远处的鸟群鱼群也认得出；嘴边的大小不变。
// 状态表现：金色（流光 + 小闪星）、烤熟（橙褐 + 烤痕 + × 眼）、正在被火烤（按烤的进度暖一点、边缘透出红橙热光，本身的颜色不变，离开火焰就褪回去）、
// 撞晕 / 被龙吼漩涡打中（翻肚皮或晃脑袋 + 螺旋眼 + 头顶转圈的星星，星星在屏幕上最小约 9 像素）、
// 被威压吓呆（小瞳孔 + 轻轻发抖）。都是慢动作，不闪。
import * as THREE from 'three';
import { SPECIES, SPECIES_IDS, GOLD } from '../config/species.js';
import { bodyMat, hullMat, outlineW, outlineColor, EYE, FOG, KIND, OUT_MIN_PX } from './creature-kit.js';
import { MODELS, ANIM_HZ, VIS } from './creatures/models.js';
import { waveH } from '../sim/world.js';
export { ANIM_HZ, VIS };

const OUT_FAR = 150;                              // 描边可见距离（0.75 倍起慢慢收细，到这里收到 0）
const CULL_DEPTH = 8, CULL_HEIGHT = 6;            // 镜头在水上：比 -8 米还深的不画；在水下：比 +6 米还高的不画
const FOG_UW = new THREE.Color(0x06303c);         // 水下描边往这个深青色偏一点（不用纯黑，也不能淡到看不见）
const ROAST = new THREE.Color(0xa8531e);          // 烤熟的橙褐
const GOLD_C = new THREE.Color(GOLD);
const DAZE_T = 4;                                 // skillHit 是布尔值时：打中后晕多久（秒）
const PORT_PAD = .07;                             // 小图四周留白（给浅色光边），占边长的比例
const HEAT_MAX = .55;                           // 正在被火烤：st.heat 的上限（除以它 = 烤的进度 0..1，传给着色器）
const TAU = Math.PI * 2, WRAP = Math.PI * 4;      // 着色器里相位只用 0.5 / 1 / 2 倍，按 4π 取模不跳
const hash01 = n => { let h = Math.imul((n | 0) ^ 0x9e3779b9, 2654435761); h ^= h >>> 15; h = Math.imul(h, 2246822507); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const clamp01 = x => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const FAR_BOOST = .35, FAR_D0 = 26, FAR_D1 = 75, FAR_BOOST2 = .25;   // 显示尺寸随距离放大：26 米内不变，75 米外大 35%，200 米外大 60%
const NEAR_K0 = .3, NEAR_K1 = .8;                 // 比主角离镜头还近（镜头和主角之间）的：离镜头 0.8 倍主角距离起慢慢缩小，0.3 倍时缩没（不挡龙、不挡界面）
const farK = dd => 1 + FAR_BOOST * smooth(FAR_D0, FAR_D1, dd) + FAR_BOOST2 * smooth(100, 200, dd);
const OUT_PX = 6;                                 // 身体在屏幕上小于这么多像素就不画描边（省三角面）
const STAR_MAX = 40, STAR_BIG = 4;                // 头顶的晕星同屏最多几颗；最近的几只每只 3 颗，别的晕了的每只 1 颗

export function createCreatures(ctx) {
  const { scene, camera, renderer, GRAD, outlineMat } = ctx;
  const root = new THREE.Group(); root.name = 'creatures'; scene.add(root);
  const uT = { value: 0 }, uPx = { value: 0 }, uFar = { value: OUT_FAR };    // 所有物种共用：时间、描边最细（世界单位 / 米深度）、描边收没的距离
  const B = {};
  for (const sp of SPECIES_IDS) {
    const cfg = SPECIES[sp], m = MODELS[sp](cfg.colors), geo = m.geo;
    const U = {
      uK: { value: new THREE.Vector4(m.kind, m.eyeType || 0, m.eyeFront ? (m.mouth ? 2 : 1) : 0, m.blush || 0) },
      uP: { value: new THREE.Vector4(...m.P) }, uQ: { value: new THREE.Vector4(...m.Q) },
      uEye: { value: new THREE.Vector4(...(m.eye || [0, 0, 0, 0])) },
      uT, uPx, uFar,
    };
    const mat = bodyMat(GRAD, U, { emissive: m.emis || 0 });
    const oc = outlineColor(cfg.colors.body), ow = outlineW(cfg.len);
    const hull = hullMat(outlineMat, oc.clone(), ow, U);
    const vis = VIS[sp] || 1, rad = (geo.boundingSphere.radius + geo.boundingSphere.center.length()) * 1.15;
    const b = { sp, cfg, m, geo, U, mat, hull, oc, ow, vis, rad, cap: 0, near: [], far: [], nearS: [], farS: [], nNear: 0, n: 0, body: null, line: null, iA: null, iC: null, iB: null };
    alloc(b, cfg.max * 2 + 16);
    B[sp] = b;
  }

  // 实例容量：不够时整体翻倍（一次性的，sim 偶尔超过 species.max）
  function alloc(b, cap) {
    const old = b.body;
    b.cap = cap;
    b.iA = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    b.iC = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    b.iB = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    b.geo.setAttribute('iA', b.iA); b.geo.setAttribute('iC', b.iC); b.geo.setAttribute('iB', b.iB);
    const body = new THREE.InstancedMesh(b.geo, b.mat, cap), line = new THREE.InstancedMesh(b.geo, b.hull, cap);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    line.instanceMatrix = body.instanceMatrix;                     // 描边和本体共用同一份实例矩阵
    for (const o of [body, line]) { o.frustumCulled = false; o.count = 0; o.visible = false; o.name = 'cr_' + b.sp; root.add(o); }
    line.name += '_line';
    if (old) { root.remove(old, b.line); old.dispose(); b.line.dispose(); }
    b.body = body; b.line = line;
  }

  // ---------- 头顶的晕星 / 金色小闪星：两个 InstancedMesh，朝向镜头 ----------
  const fx = (() => {
    const star = (pts, r0, r1, rot = -Math.PI / 2) => { const out = []; for (let i = 0; i < pts * 2; i++) { const a = rot + Math.PI * i / pts, r = i & 1 ? r1 : r0; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
    const shape = (poly, fill, rim, k) => {        // 填色的星 + 后面大一圈的深色边（卡通描边的感觉）
      const pos = [], col = [], cf = new THREE.Color(fill), cr = new THREE.Color(rim);
      for (const [sc, z, c] of [[k, 0, cr], [1, .1, cf]]) for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b2 = poly[(i + 1) % poly.length];
        pos.push(0, 0, z, a[0] * sc, a[1] * sc, z, b2[0] * sc, b2[1] * sc, z);
        for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    const mk = (geo, cap, name) => {
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: true, side: THREE.DoubleSide });
      mat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', FOG); };
      mat.customProgramCacheKey = () => 'crfx';
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.visible = false; m.name = name; m.renderOrder = 2; root.add(m);
      return m;
    };
    return {
      stars: mk(shape(star(5, 1, .45), 0xffd84a, 0x6a3a10, 1.32), 96, 'cr_stars'),
      glints: mk(shape(star(4, 1, .2, 0), 0xfff4c0, 0xb07a10, 1.35), 64, 'cr_glints'),
    };
  })();

  // 每个个体的小状态（翻肚皮 / 吓呆 / 晕 都要平滑地过渡）
  const state = new Map(); let frameNo = 0, lastS = null, cookTime = .4, pxM = .001;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  const cp = new THREE.Vector3(), _fr = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sph = new THREE.Sphere(), Z = new THREE.Vector3(0, 0, 1);
  const lastNk = [0, 0];                           // 本帧「镜头前缩小」的两个距离（visScale 用）
  const dizzy = [], shiny = [];                    // 本帧要画晕星 / 闪星的个体：[x, y, z, 尺寸, id, 晕的程度, 状态]

  function stateOf(c, time) {
    let st = state.get(c.id);
    if (!st || st.sp !== c.sp) { st = { sp: c.sp, roll: c.stun > 0 ? 1 : 0, fear: 0, daze: 0, hitT: -1e9, hit: false, f: 0, cookT: c.cookT || 0, heatT: -1e9, heat: 0, sk: 0, sk3: 0 }; state.set(c.id, st); }
    return st;
  }

  function write(b, i, c, alpha, dt, time, fire, sz) {
    const st = stateOf(c, time);
    st.f = frameNo;
    const k = 1 - Math.exp(-7 * dt);
    // 被龙吼 / 漩涡打中：skillHit 是数字就当剩余秒，是布尔值就从变成 true 那一刻起晕 DAZE_T 秒
    const hit = !!c.skillHit;
    if (hit && !st.hit) st.hitT = time;
    st.hit = hit;
    const dazed = c.stun > 0 || (typeof c.skillHit === 'number' ? c.skillHit > 0 : hit && time - st.hitT < DAZE_T);
    st.roll += ((c.stun > 0 ? 1 : 0) - st.roll) * k;
    st.daze += ((dazed && !(c.roast > 0) ? 1 : 0) - st.daze) * k;
    st.fear += ((c.feared && !dazed && !(c.roast > 0) ? 1 : 0) - st.fear) * (1 - Math.exp(-5 * dt));
    const a = alpha, px = c.px ?? c.x, py = c.py ?? c.y, pz = c.pz ?? c.z, L = sz * b.vis, h = hash01(c.id), kind = b.m.kind;
    _p.set(px + (c.x - px) * a, py + (c.y - py) * a, pz + (c.z - pz) * a);
    let yaw = c.yaw || 0, roll = c.roll || 0, pitch = c.pitch || 0;
    // 水母类是圆的，朝哪边游都一样：脸慢慢转向镜头（每只偏一点，不会全都一样），镜头在上面时稍微抬脸
    if (kind === KIND.jelly) {
      const dx = cp.x - _p.x, dz = cp.z - _p.z, ty = Math.atan2(dx, dz) + (h - .5) * .6, tp = Math.max(-.45, Math.min(.45, Math.atan2(cp.y - _p.y, Math.hypot(dx, dz)) * .5));
      if (st.jy === undefined) { st.jy = ty; st.jp = tp; }
      const kj = 1 - Math.exp(-3 * dt), dy = ((ty - st.jy) % TAU + TAU * 1.5) % TAU - Math.PI;
      st.jy += dy * kj; st.jp += (tp - st.jp) * kj;
      yaw = st.jy; pitch = st.jp;
    }
    // 晕：慢慢晃脑袋（翻肚皮时也带一点）
    if (st.daze > .01) { roll += Math.sin(time * 2.4 + h * TAU) * .28 * st.daze; yaw += Math.sin(time * 1.7 + h * 9) * .22 * st.daze; }
    // 吓呆：轻轻发抖（左右小幅，约 5.4 次 / 秒；幅度 = 体长的 2.5%，但远处至少 0.8 像素，最多体长的 5%；只是这只生物在抖，镜头不动）
    if (st.fear > .01) {
      const pw = Math.hypot(_p.x - cp.x, _p.y - cp.y, _p.z - cp.z) * pxM, amp = Math.min(.05 * L, Math.max(.025 * L, .8 * pw));
      const sh = Math.sin(time * 34 + h * 40) * amp * st.fear; _p.x += Math.cos(yaw) * sh; _p.z -= Math.sin(yaw) * sh; roll += Math.sin(time * 29 + h * 20) * .06 * st.fear;
    }
    // 撞晕：翻肚皮（sim 已经把 roll 往 π 拉，这里往 π 混，两边谁做都对）；水母翻过来只剩一把朝天的须，改成侧着
    const flip = kind === KIND.jelly ? Math.PI * .55 : Math.PI;
    _e.set(-pitch, yaw, roll + (flip - roll) * st.roll);
    _q.setFromEuler(_e); _s.setScalar(L);
    // 吓呆的鸟：缩成一团（矮一点、胖一点；翅膀往下收在着色器里做）
    if (kind === KIND.bird && st.fear > .01) _s.set(L * (1 + .06 * st.fear), L * (1 - .1 * st.fear), L * (1 + .04 * st.fear));
    _m.compose(_p, _q, _s).toArray(b.body.instanceMatrix.array, i * 16);
    // 动画：相位 + 力度（晕了 / 烤熟了基本不动，吓呆了动得小）
    let ph = c.phase ?? (time * ANIM_HZ[b.sp] * TAU + h * TAU), fl = c.flap ?? 1;
    if (b.sp === 'squid' && c.phase !== undefined) ph += Math.PI / 2;     // sim 的喷射在 phase = 0（整圈处）：对到外套膜收得最紧
    if (c.stun > 0 || c.roast > 0) fl *= .12;
    fl *= 1 - .45 * st.fear;
    ph %= WRAP; if (ph < 0) ph += WRAP;
    const A = b.iA.array, C = b.iC.array, Bf = b.iB.array, j = i * 4;
    Bf[j] = st.fear;
    const eye = c.roast > 0 ? EYE.roast : st.daze > .5 ? EYE.daze : st.fear > .5 ? EYE.fear : EYE.normal;
    A[j] = ph; A[j + 1] = fl; A[j + 2] = hash01(c.id * 7 + 3);
    // 正在被火烤：sim 的 cookT 在涨（在火焰锥里）就按进度慢慢变橙；离开火焰 0.15 秒后约 1 秒褪回去。
    // （cooked 只有 0 / 1：被龙吼吼中也会 = 1 但没烤，所以不能拿 cooked 当进度）
    const ck = c.cookT || 0;
    if (ck > st.cookT + 1e-6) st.heatT = time;
    st.cookT = ck;
    if (fire && !(c.cooked >= 1) && time - st.heatT < .15) st.heat = Math.max(st.heat, clamp01(ck / cookTime) * HEAT_MAX);
    else st.heat = Math.max(0, st.heat - dt * HEAT_MAX);
    // 换色：烤熟 > 金色（正在烤不换色：只在片元里乘一点暖色 + 边缘热光，保留本身的颜色）
    let col = null, amt = 0;
    if (c.roast > 0) { col = ROAST; amt = .9; }
    else if (c.gold) { col = GOLD_C; amt = 1; }
    if (col) { C[j] = col.r; C[j + 1] = col.g; C[j + 2] = col.b; C[j + 3] = amt; } else C[j + 3] = 0;
    // 状态 = 眼睛 + 金色 8 + 正在烤的热光（小数部分，0..0.8；金色的也有，烤的进度看得出来）
    const roasted = c.roast > 0;
    A[j + 3] = eye + (c.gold && !roasted ? 8 : 0) + (st.heat > .005 && !roasted ? .8 * clamp01(st.heat / HEAT_MAX) : 0);
    // 头顶的星星 / 金色闪星（每种生物近的先写，名额先给近的）
    if ((st.daze > .05 || st.sk > .02) && dizzy.length < 48) dizzy.push([_p.x, _p.y, _p.z, L, c.id, st.daze, st]);
    if (c.gold && !(c.roast > 0) && shiny.length < 32) shiny.push([_p.x, _p.y, _p.z, L, c.id, 1]);
  }

  const range = (attr, n, w) => { attr.clearUpdateRanges(); attr.addUpdateRange(0, n * w); attr.needsUpdate = true; };

  // 晕星的屏幕尺寸（CSS 像素）：星星半径、绕圈半径、离头顶的高度最少这么大，远处的晕也看得出来
  const STAR_PX = 3.6, RING_PX = 9, LIFT_PX = 8;
  const _ndc = new THREE.Vector3();
  function drawFx(time, dt, cssW, cssH) {
    // 晕星：在头顶绕圈（世界的「上」，翻肚皮也在上面）。尺寸 = max(按体长, 按屏幕最少几像素)。
    // 最近的 STAR_BIG 只每只 3 颗（绕圈不和别的重叠的才算）；别的晕了的每只 1 颗 —— 龙吼吼中一片的时候，每只都看得出晕了。
    // 几只挤成一团（漩涡卷在一起）时只给一只画：屏幕上离已经有星星的那只的中心不到一个绕圈半径的就不画。
    // 同屏最多 STAR_MAX 颗（一个绘制）。上一帧有星星的先排（星星不会在几只之间跳来跳去）；
    // 第 1 颗（sk）和第 2、3 颗（sk3）各自慢慢变大变小（不闪），1 颗和 3 颗之间也是长出来 / 缩回去
    const S1 = fx.stars, S2 = fx.glints, ks = 1 - Math.exp(-6 * dt); let n = 0;
    for (const d of dizzy) {
      const dist = Math.hypot(d[0] - cp.x, d[1] - cp.y, d[2] - cp.z), pw = dist * pxM;
      d[7] = Math.max(d[3] * .34, pw * RING_PX); d[8] = pw; d[12] = dist; d[13] = 0;
      _ndc.set(d[0], d[1], d[2]).project(camera); d[9] = (_ndc.x * .5 + .5) * cssW; d[10] = (-_ndc.y * .5 + .5) * cssH; d[11] = d[7] / Math.max(pw, 1e-6);   // 屏幕位置、绕圈半径（像素）
    }
    const acc = []; let taken = 0, big = 0;
    // 先挑 3 颗的（上一帧是 3 颗的先排，再按远近）
    dizzy.sort((a, b) => (b[6].sk3 > .5) - (a[6].sk3 > .5) || a[12] - b[12]);
    for (const d of dizzy) {
      if (big >= STAR_BIG || taken + 3 > STAR_MAX) break;
      if (!(d[5] > .05)) continue;
      let ok = true;
      for (const e of acc) { const rr = d[11] + e[11]; if ((d[9] - e[9]) ** 2 + (d[10] - e[10]) ** 2 < rr * rr) { ok = false; break; } }
      if (ok) { acc.push(d); d[13] = 3; taken += 3; big++; }
    }
    // 再给别的每只 1 颗（上一帧有星星的先排，再按远近）；中心落在别人绕圈里的（挤成一团）不画
    dizzy.sort((a, b) => (b[6].sk > .5) - (a[6].sk > .5) || a[12] - b[12]);
    for (const d of dizzy) {
      if (d[13] || !(d[5] > .05) || taken + 1 > STAR_MAX) continue;
      let ok = true;
      for (const e of acc) { const rr = Math.max(d[11], e[11]); if ((d[9] - e[9]) ** 2 + (d[10] - e[10]) ** 2 < rr * rr) { ok = false; break; } }
      if (ok) { acc.push(d); d[13] = 1; taken++; }
    }
    for (const d of dizzy) { const st = d[6]; st.sk += ((d[13] ? 1 : 0) - st.sk) * ks; st.sk3 += ((d[13] === 3 ? 1 : 0) - st.sk3) * ks; }
    for (const [x, y, z, L, id, k, st, ring, pw] of dizzy) {
      if (st.sk < .02) continue;
      const a0 = time * 2.6 + hash01(id) * TAU, cy = y + Math.max(L * .42, L * .2 + pw * LIFT_PX), sz = Math.max(L * .085, pw * STAR_PX) * (.4 + .6 * k);
      for (let i = 0; i < 3; i++) {
        const g = i ? st.sk3 : st.sk; if (g < .02) continue;
        const a = a0 + i * TAU / 3;
        _p.set(x + Math.cos(a) * ring, cy + Math.sin(a * 2 + i) * ring * .12, z + Math.sin(a) * ring);
        _q2.setFromAxisAngle(Z, time * 3 + i * 2); _q.copy(camera.quaternion).multiply(_q2);
        _s.setScalar(sz * g);
        _m.compose(_p, _q, _s); S1.setMatrixAt(n++, _m);
      }
      if (n > 93) break;
    }
    S1.count = n; S1.visible = n > 0; if (n) S1.instanceMatrix.needsUpdate = true;
    // 金色闪星：每只 2 颗，在身体周围随机的点上慢慢变大再变小（一颗约 1.3 秒，不闪）；远处的最小约 6 像素宽，金色的远远也认得出
    n = 0;
    for (const [x, y, z, L, id] of shiny) {
      const pw = Math.hypot(x - cp.x, y - cp.y, z - cp.z) * pxM, Ls = Math.max(L, pw * 12);
      for (let i = 0; i < 2; i++) {
        const per = 1.3, t = time / per + hash01(id * 3 + i) + i * .5, cyc = Math.floor(t), f = t - cyc, s0 = hash01(id * 131 + cyc * 7 + i);
        const s1 = hash01(id * 71 + cyc * 13 + i), s2 = hash01(id * 37 + cyc * 3 + i);
        _p.set(x + (s0 - .5) * Ls * .8, y + (s1 - .3) * Ls * .5, z + (s2 - .5) * Ls * .8);
        _q2.setFromAxisAngle(Z, f * 1.2); _q.copy(camera.quaternion).multiply(_q2);
        _s.setScalar(Math.max(L * .11, pw * 3) * Math.sin(Math.PI * f) ** 2 + 1e-4);
        _m.compose(_p, _q, _s); S2.setMatrixAt(n++, _m);
        if (n >= 64) break;
      }
      if (n >= 64) break;
    }
    S2.count = n; S2.visible = n > 0; if (n) S2.instanceMatrix.needsUpdate = true;
  }

  function update(S, alpha = 1, dt = 1 / 60, time = 0) {
    frameNo++;
    if (S !== lastS) { state.clear(); lastS = S; }          // 新开一局：生物 id 会从头编，旧状态不能留
    uT.value = time;
    camera.updateMatrixWorld();
    camera.getWorldPosition(cp);
    _fr.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const cssH = renderer.domElement.clientHeight || renderer.domElement.height || 960, cssW = renderer.domElement.clientWidth || renderer.domElement.width || 540;
    pxM = 2 * Math.tan(THREE.MathUtils.degToRad((camera.fov || 60) / 2)) / cssH;   // 离镜头 1 米处 1 个 CSS 像素有多少米
    uPx.value = OUT_MIN_PX * pxM;
    const far2 = OUT_FAR * OUT_FAR, fire = S.kind === 'fire', list = S.creatures || [];
    cookTime = (S.cfg && S.cfg.cookTime) || .4;
    // 海面不透明：镜头在水上时不画深水里的，在水下时不画天上的。
    // 直接比镜头高度和浪高（和水的模块同一个公式、同一个时间），本帧就对，不等 setUnderwater（主循环在 update 之后才调它）
    const wt = typeof S.t === 'number' ? S.t - (1 - alpha) / 60 : time;
    const camUp = cp.y >= waveH(cp.x, cp.z, wt), cull = api.cullMedium;
    for (const sp in B) { const b = B[sp]; b.near.length = b.far.length = b.nearS.length = b.farS.length = 0; }
    dizzy.length = 0; shiny.length = 0;
    // 主角离镜头多远（插值后的位置）：比主角还近的生物（从镜头旁边飞过、跟在龙后面）慢慢缩没，不挡龙、不挡界面
    const H = S.hero; let dh = 0;
    if (H && Number.isFinite(H.x)) { const hpx = H.px ?? H.x, hpy = H.py ?? H.y, hpz = H.pz ?? H.z; dh = Math.hypot(hpx + (H.x - hpx) * alpha - cp.x, hpy + (H.y - hpy) * alpha - cp.y, hpz + (H.z - hpz) * alpha - cp.z); }
    const nk0 = NEAR_K0 * dh, nk1 = NEAR_K1 * dh; lastNk[0] = nk0; lastNk[1] = nk1;
    for (const c of list) {
      const b = B[c.sp]; if (!b) continue;
      const s0 = c.size ?? b.cfg.len;
      if (!(s0 > 1e-3)) continue;                            // 刚出生（size 还是 0）的先不画，免得闪一下原大小
      const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z, d2 = dx * dx + dy * dy + dz * dz;
      // 远处的画大一点（手机上远处的鸟群鱼群也认得出）；到嘴边的距离（镜头前 26 米内）保持原样
      const dd = Math.sqrt(d2);
      let sz = s0 * farK(dd);
      if (dd < nk1) { const f = smooth(nk0, nk1, dd); if (f < .05) continue; sz *= f; }
      const r = sz * b.vis * b.rad;
      if (cull) { const rr = sz * b.vis * .6; if (camUp ? c.y + rr < -CULL_DEPTH : c.y - rr > CULL_HEIGHT) continue; }
      if (!_fr.intersectsSphere(_sph.set(_v.set(c.x, c.y, c.z), r + 1))) continue;    // 画面外
      // 描边：150 米内、而且身体在屏幕上大于 OUT_PX 像素的才画（再小的描边本来就淡成中间调了；着色器在 7.5 → 11 像素之间把描边收没，切换时看不出来）
      if (d2 < far2 && sz * b.vis > OUT_PX * dd * pxM) { b.near.push(c); b.nearS.push(sz); } else { b.far.push(c); b.farS.push(sz); }   // sim 的对象只读，尺寸另存
    }
    for (const sp in B) {
      const b = B[sp], tot = b.near.length + b.far.length;
      if (tot > b.cap) alloc(b, Math.max(b.cap * 2, tot + 8));
      let n = 0;
      for (let k = 0; k < b.near.length; k++) write(b, n++, b.near[k], alpha, dt, time, fire, b.nearS[k]);
      const nn = n;
      for (let k = 0; k < b.far.length; k++) write(b, n++, b.far[k], alpha, dt, time, fire, b.farS[k]);
      b.n = n; b.nNear = nn;
      b.body.count = n; b.line.count = nn; b.body.visible = n > 0; b.line.visible = nn > 0;
      if (n) { range(b.body.instanceMatrix, n, 16); range(b.iA, n, 4); range(b.iC, n, 4); range(b.iB, n, 4); }
    }
    drawFx(time, dt, cssW, cssH);
    if (frameNo % 120 === 0) for (const [id, st] of state) if (frameNo - st.f > 30) state.delete(id);
  }

  // 生物画出来比 sim 的体长大多少倍（显示放大 × 远处放大 × 镜头前缩小），界面的锁定圈按这个画才套得住：
  // 屏幕上的半径 ≈ 投影 c.size × 0.5 × visScale(c)。用本帧 update 时的镜头位置（主循环先 update 生物、再更新界面）
  function visScale(c) {
    const b = c && B[c.sp]; if (!b) return 1;
    const dd = Math.hypot(c.x - cp.x, c.y - cp.y, c.z - cp.z);
    return b.vis * farK(dd) * (dd < lastNk[1] ? smooth(lastNk[0], lastNk[1], dd) : 1);
  }

  // 水下：描边颜色往水下雾色偏（k = 0..1）
  let uw = 0;
  function setUnderwater(k) {
    uw = Math.min(1, Math.max(0, k || 0));
    for (const sp in B) B[sp].hull.color.copy(B[sp].oc).lerp(FOG_UW, uw * .35);
  }

  // ---------- 小图：3/4 侧面、透明背景的 dataURL（图鉴 / 小目标卡用）----------
  // 用主渲染器画到一张离屏渲染目标上，再读回来；画完把渲染器状态（目标、清屏色）还原。
  // 生物外面加一圈浅色光边：放在深色的界面面板上也看得清（深色的小雀、熔岩雀、蝠鲼、大鹏）
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
      for (const k of ['position', 'normal', 'sN', 'color', 'aP']) g2.setAttribute(k, b.geo.getAttribute(k));
      const [ph, fl] = b.m.pose || [.6, .5];                         // 小图的姿势（鸟：翅膀抬成 V 字）
      g2.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array([ph, fl, .3, 0]), 4));
      g2.setAttribute('iC', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
      g2.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(4), 4));
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
    // 取景：先按静止姿态的包围盒粗框一次画出来，量出真正有颜色的范围（翅膀抬起 / 透视后的实际剪影），
    // 再按这个范围把正交相机框紧画第二次 —— 生物在小图里尽量大（小目标卡只有 40 多像素）
    const bb = b.geo.boundingBox, box = new THREE.Box3(), v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) box.expandByPoint(v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(g.matrix));
    let cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2, h = Math.max(box.max.x - box.min.x, box.max.y - box.min.y) / 2 * 1.25 + b.ow * 2;
    // 画（描边用原色，不受水下影响；正交相机没有「远处变细」，屏幕最细限制关掉）
    const prevRT = renderer.getRenderTarget(), prevC = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
    const prevHull = b.hull.color.clone(), prevPx = uPx.value, prevT = uT.value; b.hull.color.copy(b.oc); uPx.value = 0; uT.value = 0;
    const buf = new Uint8Array(S2 * S2 * 4);
    const shoot = () => {
      Object.assign(pCam, { left: cx - h, right: cx + h, top: cy + h, bottom: cy - h }); pCam.updateProjectionMatrix();
      renderer.setRenderTarget(pRT); renderer.setClearColor(0x000000, 0); renderer.clear(true, true, true);
      renderer.render(pScene, pCam);
      renderer.readRenderTargetPixels(pRT, 0, 0, S2, S2, buf);
    };
    try {
      shoot();
      let x0 = S2, y0 = S2, x1 = -1, y1 = -1;
      for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) if (buf[(y * S2 + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= 0) {                                                  // 像素 → 相机坐标（读回来的第 0 行是画面底部）
        const k = 2 * h / S2, ax = cx - h + (x0 + x1 + 1) / 2 * k, ay = cy - h + (y0 + y1 + 1) / 2 * k;
        cx = ax; cy = ay; h = Math.max(x1 - x0 + 1, y1 - y0 + 1) / 2 * k / (1 - 2 * PORT_PAD);
        shoot();
      }
    } finally {
      renderer.setRenderTarget(prevRT); renderer.setClearColor(prevC, prevA);
      b.hull.color.copy(prevHull); uPx.value = prevPx; uT.value = prevT;
    }
    // 线性 → sRGB，上下翻转，2 倍超采样缩小
    const big = document.createElement('canvas'); big.width = big.height = S2;
    const bc = big.getContext('2d'), img = bc.createImageData(S2, S2);
    for (let y = 0; y < S2; y++) for (let x = 0; x < S2; x++) {
      const si = ((S2 - 1 - y) * S2 + x) * 4, di = (y * S2 + x) * 4;
      img.data[di] = LUT[buf[si]]; img.data[di + 1] = LUT[buf[si + 1]]; img.data[di + 2] = LUT[buf[si + 2]]; img.data[di + 3] = buf[si + 3];
    }
    bc.putImageData(img, 0, 0);
    // 光边：把剪影往外扩一圈（16 个方向各画一次，再整体染成奶白色），垫在生物下面
    const halo = document.createElement('canvas'); halo.width = halo.height = S2;
    const hc = halo.getContext('2d'), R0 = Math.max(2, S2 * .035);
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; hc.drawImage(big, Math.cos(a) * R0, Math.sin(a) * R0); }
    hc.drawImage(big, 0, 0);
    hc.globalCompositeOperation = 'source-in'; hc.fillStyle = 'rgba(255,250,240,.92)'; hc.fillRect(0, 0, S2, S2);
    hc.globalCompositeOperation = 'source-over'; hc.drawImage(big, 0, 0);
    const out = document.createElement('canvas'); out.width = out.height = size;
    const oc2 = out.getContext('2d'); oc2.imageSmoothingEnabled = true; oc2.imageSmoothingQuality = 'high'; oc2.drawImage(halo, 0, 0, size, size);
    const url = out.toDataURL('image/png');
    pCache.set(key, url);
    return url;
  }

  // 调试用：本帧生物的绘制次数和三角面（含描边、星星）
  function stats() {
    let calls = 0, tris = 0;
    for (const sp in B) { const b = B[sp]; if (b.n) { calls += 1 + (b.nNear ? 1 : 0); tris += b.m.tris * (b.n + b.nNear); } }
    for (const o of [fx.stars, fx.glints]) if (o.visible) { calls++; tris += o.count * o.geometry.attributes.position.count / 3; }
    return { calls, tris };
  }

  // 预编译：所有物种共用一个本体程序 + 一个描边程序（加载时调一次，生物第一次出现时就不会卡一下）
  function prewarm() {
    const vis = [];
    for (const sp in B) for (const o of [B[sp].body, B[sp].line]) { vis.push([o, o.visible]); o.visible = true; }
    for (const o of [fx.stars, fx.glints]) { vis.push([o, o.visible]); o.visible = true; }
    try { renderer.compile(scene, camera); } finally { for (const [o, v] of vis) o.visible = v; }
  }
  // 小图也先画好（第一次画要编译两个没雾的程序，还要读回像素）
  function prewarmPortraits(size = 128) { for (const sp of SPECIES_IDS) portrait(sp, size); }

  // 主程序会 await ready：等同一轮里别的模块（水、天空）把雾和灯设好再预编译
  const ready = new Promise(res => setTimeout(() => {
    try { prewarm(); prewarmPortraits(); } catch (e) { console.warn('生物预编译失败', e && e.message); }
    res();
  }, 0));

  const api = { update, setUnderwater, portrait, visScale, prewarm, prewarmPortraits, stats, ready, root, species: B, fx, cullMedium: true, get underwater() { return uw; } };
  root.userData.api = api;                         // 调试脚本用：scene.getObjectByName('creatures').userData.api
  return api;
}

const LUT = new Uint8Array(256).map((_, i) => { const c = i / 255; return Math.round(255 * (c <= .0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - .055)); });
