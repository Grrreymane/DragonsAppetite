// 世界：海浪、区域、岛、海底。纯逻辑，浏览器和 Node 共用；view 层按这里的数据建网格。
// 坐标：y = 0 是海面，单位米。世界按 PERIOD 无限循环（岛的位置取「离玩家最近的那一份」）。
import { makeRng, lerp, clamp } from './rng.js';
import { SHAPES, SHAPE_KINDS } from '../config/island-shapes.js';

export const PERIOD = 2400;
export const SKY_CAP = 240;          // 火龙软上限

// 海浪：JS 和 GLSL 必须是同一个公式（sim 用它判断水面，着色器用它画浪）
export const WAVE_GLSL = 'float waveH(vec2 p, float t){ return sin(p.x*0.045+t*1.1)*1.0 + sin(p.y*0.06-t*0.85)*0.8 + sin((p.x+p.y)*0.1+t*1.7)*0.35 + sin(p.x*0.21-p.y*0.17+t*2.3)*0.15; }';
export const waveH = (x, z, t) => Math.sin(x * .045 + t * 1.1) + Math.sin(z * .06 - t * .85) * .8 + Math.sin((x + z) * .1 + t * 1.7) * .35 + Math.sin(x * .21 - z * .17 + t * 2.3) * .15;

export const wrapP = v => v - PERIOD * Math.round(v / PERIOD);

// 区域：低频、按 PERIOD 循环的噪声。green 翠岛海 / volcano 火山海 / open 外海
const TAU = Math.PI * 2;
export function zoneValue(x, z) {
  const u = x / PERIOD * TAU, v = z / PERIOD * TAU;
  return Math.sin(u + 1.3) * Math.cos(v * 1 + .4) * .9 + Math.sin(u * 2 - v + 2.1) * .45 + Math.cos(u - v * 2 + .7) * .3;
}
export function zoneAt(x, z) {
  if (Math.hypot(wrapP(x), wrapP(z - 120)) < 330) return 'green';   // 出生点附近固定是翠岛海
  const f = zoneValue(x, z);
  return f > .38 ? 'volcano' : f < -.42 ? 'open' : 'green';
}

// 海底深度：翠岛海浅、火山海中、外海有深沟
function zoneSeabed(x, z) {
  const zn = zoneAt(x, z);
  const n = Math.sin(x * .013 + 1.7) * Math.cos(z * .011 - .6) * .5 + Math.sin((x - z) * .021) * .25;
  return zn === 'open' ? -82 + n * 12 : zn === 'volcano' ? -48 + n * 10 : -36 + n * 8;
}
export function seabedY(x, z) {
  let y = zoneSeabed(x, z);
  // 岛周围的海底往上抬：岛的水下岩基本身；岩基够不到海底时下面再垫一圈海底坡（土丘）
  for (const is of islands) {
    const dx = wrapP(x - is.x), dz = wrapP(z - is.z), R = is.bedReach;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    if (!is.sh) { const d = Math.hypot(dx, dz); if (d < is.r * 2.2) y = Math.max(y, heightAt(is.prof, d)); continue; }
    const g = surf(is, dx, dz); if (g > y) y = g;
    if (is.moundTop > -900) { const m = is.moundTop - Math.max(0, Math.hypot(dx, dz) - is.moundR) * MOUND_SLOPE; if (m > y) y = m; }
  }
  return y;
}

// 岛「底下」的海底：只有区域海底 + 岩基够不到时垫的海底坡，不含岛的岩石本身。
// 画海底地形用这个（sea-bed.js）：岛的岩基自己会插进海底，两层在交界处自然相交；
// 用 seabedY（含岛面）的话，5 米一格的地形在陡的岩基（石柱）上连不准，会有大块平面从岩壁里戳出来。
export function seabedBase(x, z) {
  let y = zoneSeabed(x, z);
  for (const is of islands) {
    if (!(is.moundTop > -900)) continue;
    const dx = wrapP(x - is.x), dz = wrapP(z - is.z), R = is.bedReach;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const m = is.moundTop - Math.max(0, Math.hypot(dx, dz) - is.moundR) * MOUND_SLOPE; if (m > y) y = m;
  }
  return y;
}

// 岛的剖面：[[半径, 高度], ...]，半径从大到小；最外面一段是水下的坡，一直到海底
export function heightAt(prof, d) {
  if (d >= prof[0][0]) return -999;
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, h0] = prof[i], [r1, h1] = prof[i + 1];
    if (d <= r0 && d >= r1) return lerp(h0, h1, (r0 - d) / Math.max(1e-4, r0 - r1));
  }
  return prof[prof.length - 1][1];
}

export function islandProfile(kind, r, h) {
  const skirt = [[r * 2.1, -70], [r * 1.5, -24], [r * 1.15, -8]];
  if (kind === 'volcano') return [...skirt, [r, .5], [r * .8, h * .22], [r * .5, h * .62], [r * .24, h], [r * .17, h * .9], [.01, h * .8]];
  if (kind === 'green') return [...skirt, [r, .5], [r * .85, 2.2], [r * .6, h * .45], [r * .32, h * .85], [.01, h]];
  return [[r * 1.9, -70], [r * 1.35, -20], [r * 1.1, -8], [r, .5], [r * .7, h * .3], [r * .55, h * .75], [r * .3, h], [.01, h * 1.02]];
}

// ---------- 精模岛（config/island-shapes.js 的高度图） ----------
// 每座岛 = 一个形状（模型单位：岸线半径 1、海平面 y = 0）× 水平缩放 sx（= 岸线半径 r，米）× 竖直缩放 sy，绕竖轴转 yaw。
// 水下部分（y < 0）再竖直拉长 k 倍，让岩基伸到海底；还够不到就在下面垫一圈海底坡（moundTop / moundR）。
const MOUND_SLOPE = .6;
const COAST = -3;                              // 水里的主角：岛面高过这个（米）就算岸，不能从底下钻过去
const SH = {};                                  // 解码后的形状：{ n, ext, inv, hm(Float32Array), top, bottom, crater, foot }
for (const [key, d] of Object.entries(SHAPES)) {
  const hm = new Float32Array(d.n * d.n), n = d.n;
  for (let i = 0; i < hm.length; i++) hm[i] = d.h[i] <= -9999 ? -50 : d.h[i] * d.q;
  // 量的时候射线从网格缝里漏下去的个别格子（四周大多有表面）：用邻格平均补上，免得龙从缝里钻进石头
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    if (d.h[j * n + i] > -9999) continue;
    let c = 0, s = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const w = d.h[(j + b) * n + i + a]; if ((a || b) && w > -9999) { c++; s += w; } }
    if (c >= 5) hm[j * n + i] = s / c * d.q;
  }
  SH[key] = { key, kind: d.kind, n: d.n, ext: d.ext, inv: (d.n - 1) / (2 * d.ext), hm, top: d.top, bottom: d.bottom, crater: d.crater || null, foot: d.foot || d.ext };
}
export const SHAPE_DATA = SH;
// 手摆的前 4 座用固定的形状和朝向（开局正前方那座火山要好看）
const FIXED = { 0: ['volcano_a', 2.6], 1: ['green_a', .9], 2: ['spire_a', 4.2], 3: ['volcano_b', 4.25] };

// 岛 is 在相对岛心 (dx, dz) 处的表面高度（世界米）；不在岛上 = -999。双线性插值高度图。
function surf(is, dx, dz) {
  const sh = is.sh, n = sh.n;
  const f = ((is.c * dx - is.s * dz) / is.sx + sh.ext) * sh.inv, g = ((is.s * dx + is.c * dz) / is.sx + sh.ext) * sh.inv;
  if (!(f >= 0 && g >= 0 && f < n - 1 && g < n - 1)) return -999;
  const i = f | 0, j = g | 0, a = f - i, b = g - j, H = sh.hm, k = j * n + i;
  const h = (H[k] * (1 - a) + H[k + 1] * a) * (1 - b) + (H[k + n] * (1 - a) + H[k + n + 1] * a) * b;
  if (h < sh.bottom - .02) return -999;
  return h >= 0 ? h * is.sy : h * is.sy * is.k;
}
// 一座岛在世界 (x,z) 处的表面高度（-999 = 不在这座岛上）
export function islandSurface(is, x, z) {
  const dx = wrapP(x - is.x), dz = wrapP(z - is.z);
  return is.sh ? surf(is, dx, dz) : heightAt(is.prof, Math.hypot(dx, dz));
}

// 给岛挑形状和朝向，按形状的高宽比微调 r / h（竖直拉伸限制在 0.8~1.3 倍，贴图不变形；r·h 不变）
function fitShape(is) {
  const keys = (SHAPE_KINDS[is.kind] || []).filter(k => SH[k]);
  is.sh = null; is.shape = null; is.reach = is.prof[0][0]; is.bedReach = is.r * 2.2; is.moundTop = -999; is.smoke = null;
  if (!keys.length) return;
  const rnd = makeRng(is.seed ^ 0x5bd1e995);
  const want = is.h / is.r;
  let key, yaw;
  const fx = FIXED[is.id];
  if (fx && SH[fx[0]] && SH[fx[0]].kind === is.kind) [key, yaw] = fx;
  else {
    const w = keys.map(k => is.kind === 'green' ? 1 : Math.exp(-1.5 * Math.abs(Math.log(want / SH[k].top))));
    let t = rnd() * w.reduce((a, b) => a + b, 0); key = keys[keys.length - 1];
    for (let i = 0; i < keys.length; i++) { t -= w[i]; if (t <= 0) { key = keys[i]; break; } }
    yaw = rnd() * TAU;
  }
  const sh = SH[key], g = clamp(want / sh.top, .8, 1.3);
  // 绿岛保持岸线半径（树把模型的最高点抬高了，按高宽比算会把岛缩得太小）；火山、石柱保持 r·h
  const r = is.kind === 'green' ? is.r : Math.sqrt(is.r * is.h / (sh.top * g));
  is.shape = key; is.sh = sh; is.yaw = yaw; is.c = Math.cos(yaw); is.s = Math.sin(yaw);
  is.r = r; is.sx = r; is.sy = r * g; is.h = sh.top * is.sy;
  is.prof = islandProfile(is.kind, is.r, is.h);
  // 水下拉伸：岩基最低点到当地海底以下 4 米（最多拉 2.2 倍）
  let bed = 0;
  for (let k = 0; k < 6; k++) { const a = k * 1.2566, d = k ? r * sh.foot : 0; bed = Math.min(bed, zoneSeabed(is.x + Math.cos(a) * d, is.z + Math.sin(a) * d)); }
  const b0 = sh.bottom * is.sy;
  is.k = clamp((bed - 4) / Math.min(-1, b0), 1, 2.2);
  const bottom = b0 * is.k;
  is.reach = sh.ext * is.sx * 1.02;
  if (bottom > bed - 1) { is.moundTop = bottom + 2.5; is.moundR = sh.foot * is.sx * .8; is.bedReach = is.moundR + (is.moundTop + 100) / MOUND_SLOPE; }
  else is.bedReach = is.reach;
  if (sh.crater) { const [u, y, v] = sh.crater; is.smoke = { x: (is.c * u + is.s * v) * is.sx, y: y * is.sy, z: (-is.s * u + is.c * v) * is.sx }; }
}

// 岛表：固定种子，所有玩家同一个世界。前 4 座是原型里手摆的（开局正前方那座火山）
export const islands = [];
export function buildIslands(seed = 7) {
  islands.length = 0;
  const rnd = makeRng(seed * 7919 + 13);
  const add = (kind, x, z, r, h) => islands.push({ id: islands.length, kind, x, z, r, h, prof: islandProfile(kind, r, h), seed: rnd.int(1, 1e9) });
  add('volcano', 30, 300, 60, 75); add('green', -170, 170, 45, 22); add('spire', 120, 120, 14, 55); add('volcano', -260, 520, 70, 95);
  let tries = 0;
  while (islands.length < 38 && tries++ < 4000) {
    const x = rnd.range(-PERIOD / 2, PERIOD / 2), z = rnd.range(-PERIOD / 2, PERIOD / 2);
    if (Math.hypot(x, z - 120) < 240) continue;                  // 出生点留空
    const zn = zoneAt(x, z);
    const kind = zn === 'volcano' ? (rnd() < .55 ? 'volcano' : rnd() < .5 ? 'spire' : 'green')
      : zn === 'open' ? (rnd() < .75 ? 'spire' : 'green')
      : (rnd() < .7 ? 'green' : 'spire');
    const r = kind === 'spire' ? rnd.range(10, 18) : rnd.range(35, 70);
    const h = kind === 'volcano' ? rnd.range(55, 100) : kind === 'spire' ? rnd.range(40, 85) : rnd.range(14, 28);
    if (islands.some(o => Math.hypot(wrapP(o.x - x), wrapP(o.z - z)) < Math.max(150, (o.r + r) * 1.6))) continue;
    if (kind === 'spire' && rnd() < .6) {                         // 外海的石柱成簇
      add(kind, x, z, r, h);
      for (let k = 0; k < 2; k++) { const a = rnd.range(0, TAU), d = rnd.range(30, 55); add('spire', x + Math.cos(a) * d, z + Math.sin(a) * d, rnd.range(8, 14), rnd.range(30, 70)); }
    } else add(kind, x, z, r, h);
  }
  for (const is of islands) fitShape(is);
  return islands;
}
buildIslands();

// 离 (x,z) 最近的那一份岛的中心（世界坐标）
export function islandPos(is, x, z) { return { x: x + wrapP(is.x - x), z: z + wrapP(is.z - z) }; }

// 地面高度：(x,z) 处所有岛表面的最高点；不在岛上返回 -999
export function groundAt(x, z) {
  let g = -999;
  for (const is of islands) {
    const dx = wrapP(x - is.x), dz = wrapP(z - is.z), R = is.reach;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const h = is.sh ? surf(is, dx, dz) : heightAt(is.prof, Math.hypot(dx, dz));
    if (h > g) g = h;
  }
  return g;
}

// 把一个球（中心 p，半径 rad）推出岛外：返回推了多少（0 = 没碰到）。
// 先往上推（龙从山顶上滑过），陡的地方（石柱、悬崖）再顺着下坡方向水平推开。
export function pushOutOfIslands(p, rad, dt) {
  let hit = 0;
  for (const is of islands) {
    const dx = wrapP(p.x - is.x), dz = wrapP(p.z - is.z);
    const reach = is.reach + rad; if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
    if (!is.sh) {                                                // 旧的剖面岛（形状表还没生成时）
      const d = Math.hypot(dx, dz), h = heightAt(is.prof, d);
      if (h < -900 || p.y > h + rad) continue;
      const pen = h + rad - p.y, slope = (h - heightAt(is.prof, d + 2)) / 2;
      if (slope > 2.2 && d > 1) { const k = Math.min(pen / slope + .5, 6) * clamp(dt * 12, 0, 1); p.x += dx / d * k; p.z += dz / d * k; }
      p.y += pen * clamp(dt * 8, 0, 1); hit = Math.max(hit, pen);
      continue;
    }
    const h = surf(is, dx, dz);
    if (h < -900 || p.y > h + rad) continue;
    const pen = h + rad - p.y;
    hit = Math.max(hit, pen);
    // 坡度：高度图在这一点的梯度（米 / 米）；岛外的点当作比这里低很多
    const e = Math.max(1, is.sx / is.sh.inv), lo = h - 3 * e;
    const gx = (Math.max(lo, surf(is, dx + e, dz)) - Math.max(lo, surf(is, dx - e, dz))) / (2 * e);
    const gz = (Math.max(lo, surf(is, dx, dz + e)) - Math.max(lo, surf(is, dx, dz - e))) / (2 * e);
    const slope = Math.hypot(gx, gz);
    // 在水里（海龙 / 扎水的火龙）碰到露出水面的岸：水里的步进每步都把它压回水面下，往上推没用（会从沙滩底下钻过去）；
    // 跃出水面的海龙（crossMax > 0 = 在对方地盘）也不许爬上岛（会在树丛里卡住）→ 当成墙：退回岸线外，顺着岸滑
    const coast = (p.medium === 'water' || p.crossMax > 0) && h > COAST;
    if (slope > 1.6 || coast) {
      // 陡壁（石柱、悬崖）：上一步还在墙外（p.px 有的话）→ 退回到刚碰墙的位置，再顺着墙滑（扣掉往墙里的那部分），
      // 不会穿进石头，也不会被推到柱子另一边去。没有上一步的位置就按坡度方向慢慢推开。
      let nx = -gx / slope, nz = -gz / slope;                    // 水平往外的方向
      if (!(slope > .15)) { const r = Math.hypot(dx, dz) || 1; nx = dx / r; nz = dz / r; }   // 平的沙滩：从岛心往外
      let slid = false;
      if (p.px !== undefined) {
        const qx = dx + wrapP(p.px - p.x), qz = dz + wrapP(p.pz - p.z), qy = p.py, qh = surf(is, qx, qz);
        if (qh > -900 && (coast ? qh > COAST : qy <= qh)) { /* 上一步球心就在石头里（岸里）：只能慢慢推出去 */ }
        else if (!coast && (h < p.y - rad * .25 || (qh > -900 && h <= qh + .05))) slid = true;   // 地面还在球心下面，或往同样高 / 更低的地面走：随它（竖直方向再慢慢推上去）
        else {
          // 往更高的陡壁里钻、地面快到球心了：退回到「脚下不比上一步高（或还在球心下 1/4 半径）」的最远位置，再顺着墙滑
          const gmax = coast ? COAST : Math.max(qh, p.y - rad * .25);
          const ok = (x, z) => { const g = surf(is, x, z); return g < -900 || g <= gmax; };
          let a = 0, b = 1;
          for (let it = 0; it < 7; it++) { const t = (a + b) / 2; if (ok(qx + (dx - qx) * t, qz + (dz - qz) * t)) a = t; else b = t; }
          const bx = qx + (dx - qx) * a, bz = qz + (dz - qz) * a, mx = dx - bx, mz = dz - bz, into = Math.min(0, mx * nx + mz * nz);
          // 顺墙滑：切向分量至少留 80% 的速度（正面撞上也会往一边滑开，不会贴在墙上不动）；
          // 往这边滑会钻进石头（凹进去的拐角）就试另一边，两边都不行就往外退，再不行才停在碰墙的位置
          const tx = -nz, tz = nx, m = Math.hypot(mx, mz), mt = mx * tx + mz * tz, out = into < 0 ? 0 : mx * nx + mz * nz;
          const s0 = Math.abs(mt) > .05 * m ? Math.sign(mt) : (is.id & 1 ? 1 : -1), st = Math.max(Math.abs(mt), .8 * m);
          let cx = bx, cz = bz;
          for (const sg of [s0, -s0, 0]) {                        // 两边都滑不动（凹进去的小湾）：往外退
            const x = sg ? bx + tx * st * sg + out * nx : bx + nx * m, z = sg ? bz + tz * st * sg + out * nz : bz + nz * m;
            if (ok(x, z)) { cx = x; cz = z; break; }
          }
          p.x += cx - dx; p.z += cz - dz;
          slid = true;
        }
      }
      if (!slid) { const k = Math.min(coast ? h - COAST + 1 : pen / slope + .5, 6) * clamp(dt * 12, 0, 1); p.x += nx * k; p.z += nz * k; }
      const h2 = surf(is, wrapP(p.x - is.x), wrapP(p.z - is.z));   // 挪开以后脚下的高度
      if (h2 > -900 && !coast) p.y += Math.max(0, h2 + rad - p.y) * clamp(dt * 8, 0, 1);
    } else {
      if (p.y < h) p.y = h;                                      // 缓坡：球心不许在岛面以下（龙从山坡上滑过去）
      p.y += (h + rad - p.y) * clamp(dt * 8, 0, 1);
    }
  }
  return hit;
}

// 在 (x,z) 附近是否有岛挡着（生成生物时用）
export function blocked(x, y, z, margin = 4) { return groundAt(x, z) > y - margin; }
