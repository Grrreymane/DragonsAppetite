// 岛碰撞自检（Node）：一个球（半径 rad）以 speed 米/秒直直地冲向每座岛，每步调 pushOutOfIslands，
// 统计球心钻进岛面以下的最大深度和步数。还测 groundAt / seabedY 有没有 NaN、岛和海底接不接得上。
//   node _lab/islands_collide.mjs [speed=25] [rad=3]
import { islands, groundAt, seabedY, pushOutOfIslands, islandSurface } from '../src/sim/world.js';
const speed = +(process.argv[2] || 25), rad = +(process.argv[3] || 3), dt = 1 / 60;
let worst = [], nan = 0;
for (const is of islands) {
  let maxIn = 0, inSteps = 0, steps = 0;
  for (let a = 0; a < 8; a++) for (const hf of [-18, -6, .1, .35, .6, .85]) {   // 负数 = 水下的固定深度（米）
    const ang = a * Math.PI / 4, d0 = is.reach + 30;
    const p = { x: is.x + Math.sin(ang) * d0, y: hf < 0 ? hf : Math.max(4, is.h * hf), z: is.z + Math.cos(ang) * d0, px: 0, py: 0, pz: 0 };
    const vx = -Math.sin(ang) * speed, vz = -Math.cos(ang) * speed;
    for (let i = 0; i < 60 * 8; i++) {
      p.px = p.x; p.py = p.y; p.pz = p.z; p.x += vx * dt; p.z += vz * dt;
      pushOutOfIslands(p, rad, dt);
      const g = islandSurface(is, p.x, p.z);
      if (!Number.isFinite(p.x + p.y + p.z)) nan++;
      if (g > -900 && p.y < g) { maxIn = Math.max(maxIn, g - p.y); inSteps++; }
      steps++;
    }
  }
  worst.push({ id: is.id, kind: is.kind, shape: is.shape, r: +is.r.toFixed(1), h: +is.h.toFixed(1), maxIn: +maxIn.toFixed(2), inPct: +(inSteps / steps * 100).toFixed(2) });
}
worst.sort((a, b) => b.maxIn - a.maxIn);
console.table(worst.slice(0, 12));
// 海底和岛：岛外一圈的海底不能比岛面高出一截（会有台阶），也不能是 NaN
let bad = 0, t = performance.now(), n = 0;
for (const is of islands) for (let k = 0; k < 64; k++) {
  const a = k / 64 * Math.PI * 2;
  for (let d = 0; d < is.bedReach; d += 3) {
    const x = is.x + Math.cos(a) * d, z = is.z + Math.sin(a) * d, s = seabedY(x, z), g = groundAt(x, z); n++;
    if (!Number.isFinite(s) || !Number.isFinite(g)) bad++;
  }
}
console.log('seabed/ground samples', n, 'NaN', bad, 'push NaN', nan, `(${((performance.now() - t) / n * 1000).toFixed(2)} µs / sample)`);
