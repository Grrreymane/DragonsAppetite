// 带种子的随机数（sim 里只能用它，不能用 Math.random，否则浏览器和 Node 结果不一样）
export function makeRng(seed = 1) {
  let s = (seed | 0) || 1;
  const r = () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.sign = () => (r() < .5 ? -1 : 1);
  r.state = () => s;
  r.setState = v => { s = v | 0; };
  return r;
}

// 坐标哈希：同一个位置永远得到同一个值（-1..1），用来抖动顶点、决定区域
export function hash3(x, y, z) {
  let h = (Math.round(x * 97) * 73856093) ^ (Math.round(y * 97) * 19349663) ^ (Math.round(z * 97) * 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295 * 2 - 1;
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const damp = (k, dt) => 1 - Math.exp(-k * dt);
export const wrapAngle = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
