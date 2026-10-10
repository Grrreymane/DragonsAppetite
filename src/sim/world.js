// 世界：海浪、区域、岛、海底。纯逻辑，浏览器和 Node 共用；view 层按这里的数据建网格。
// 坐标：y = 0 是海面，单位米。世界按 PERIOD 无限循环（岛的位置取「离玩家最近的那一份」）。
import { makeRng, lerp, clamp } from './rng.js';

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
export function seabedY(x, z) {
  const zn = zoneAt(x, z);
  const n = Math.sin(x * .013 + 1.7) * Math.cos(z * .011 - .6) * .5 + Math.sin((x - z) * .021) * .25;
  let y = zn === 'open' ? -82 + n * 12 : zn === 'volcano' ? -48 + n * 10 : -36 + n * 8;
  // 岛周围的海底往上抬（岛在水下有一圈坡）
  for (const is of islands) {
    const d = Math.hypot(wrapP(x - is.x), wrapP(z - is.z));
    if (d < is.r * 2.2) y = Math.max(y, heightAt(is.prof, d));
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
  return islands;
}
buildIslands();

// 离 (x,z) 最近的那一份岛的中心（世界坐标）
export function islandPos(is, x, z) { return { x: x + wrapP(is.x - x), z: z + wrapP(is.z - z) }; }

// 地面高度：(x,z) 处所有岛表面的最高点；不在岛上返回 -999
export function groundAt(x, z) {
  let g = -999;
  for (const is of islands) {
    const dx = wrapP(x - is.x), dz = wrapP(z - is.z);
    if (Math.abs(dx) > is.prof[0][0] || Math.abs(dz) > is.prof[0][0]) continue;
    const h = heightAt(is.prof, Math.hypot(dx, dz)); if (h > g) g = h;
  }
  return g;
}

// 把一个球（中心 p，半径 rad）推出岛外：返回推了多少（0 = 没碰到）。
// 先按原型的办法往上推（龙从山顶上滑过），陡的地方（石柱）再水平推开。
export function pushOutOfIslands(p, rad, dt) {
  let hit = 0;
  for (const is of islands) {
    const dx = wrapP(p.x - is.x), dz = wrapP(p.z - is.z);
    const reach = is.prof[0][0] + rad; if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    const d = Math.hypot(dx, dz), h = heightAt(is.prof, d);
    if (h < -900 || p.y > h + rad) continue;
    const pen = h + rad - p.y;
    // 坡度：剖面在这一点的陡峭程度
    const h2 = heightAt(is.prof, d + 2), slope = (h - h2) / 2;
    if (slope > 2.2 && d > 1) {                                  // 陡壁：水平推开
      const k = Math.min(pen / slope + .5, 6) * clamp(dt * 12, 0, 1);
      p.x += dx / d * k; p.z += dz / d * k;
    }
    p.y += pen * clamp(dt * 8, 0, 1);
    hit = Math.max(hit, pen);
  }
  return hit;
}

// 在 (x,z) 附近是否有岛挡着（生成生物时用）
export function blocked(x, y, z, margin = 4) { return groundAt(x, z) > y - margin; }
