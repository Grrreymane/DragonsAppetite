// 「龙会不会钻进看得见的石头」自检（Node）：读 models/env/*.glb 的 LOD0 网格（和画面同一份），
// 机器人玩几局，每一步拿主角球心去和真实网格比：球心在岛的真实表面以下多深（竖直方向，按 three.js 里的摆放：
// 旋转 yaw、缩放 sx / sy、水下再拉长 k）。碰撞用的是高度图（config/island-shapes.js），这里量的是它和模型之间的差。
//   node _lab/islands_meshcheck.mjs [kind=fire] [seeds=3] [minutes=3]
import { readFileSync } from 'node:fs';
import { islands, wrapP, groundAt } from '../src/sim/world.js';
import { SHAPES } from '../src/config/island-shapes.js';
import { createSim, step } from '../src/sim/sim.js';
import { makeBot, TIERS } from '../src/sim/bot.js';

const KIND = process.argv[2] || 'fire', SEEDS = +(process.argv[3] || 3), MIN = +(process.argv[4] || 3);
const ROOT = new URL('../', import.meta.url);

// ---- 极简 glb 读取：节点 lod0 的位置 + 索引
function loadGlb(file) {
  const b = readFileSync(new URL(file, ROOT));
  const jl = b.readUInt32LE(12), J = JSON.parse(b.subarray(20, 20 + jl).toString('utf8'));
  const bin = b.subarray(20 + jl + 8);
  const node = J.nodes.find(n => n.name === 'lod0' && n.mesh !== undefined);
  const prim = J.meshes[node.mesh].primitives[0];
  const acc = i => {
    const a = J.accessors[i], v = J.bufferViews[a.bufferView], off = (v.byteOffset || 0) + (a.byteOffset || 0);
    const n = a.count * ({ SCALAR: 1, VEC2: 2, VEC3: 3 })[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
    return new T(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * T.BYTES_PER_ELEMENT));
  };
  return { pos: acc(prim.attributes.POSITION), idx: acc(prim.indices) };
}
// 竖直射线：(x,z) 处网格的最高点（模型单位；没有 = -Infinity）。按 xz 网格分桶加速
function makeTop({ pos, idx }) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]); x1 = Math.max(x1, pos[i]); z0 = Math.min(z0, pos[i + 2]); z1 = Math.max(z1, pos[i + 2]); }
  const G = 64, cw = (x1 - x0) / G, ch = (z1 - z0) / G, cells = Array.from({ length: G * G }, () => []);
  for (let f = 0; f < idx.length; f += 3) {
    const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
    const i0 = Math.max(0, Math.floor((Math.min(pos[a], pos[b], pos[c]) - x0) / cw)), i1 = Math.min(G - 1, Math.floor((Math.max(pos[a], pos[b], pos[c]) - x0) / cw));
    const j0 = Math.max(0, Math.floor((Math.min(pos[a + 2], pos[b + 2], pos[c + 2]) - z0) / ch)), j1 = Math.min(G - 1, Math.floor((Math.max(pos[a + 2], pos[b + 2], pos[c + 2]) - z0) / ch));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) cells[j * G + i].push(f);
  }
  return (x, z) => {
    const i = Math.floor((x - x0) / cw), j = Math.floor((z - z0) / ch);
    if (i < 0 || j < 0 || i >= G || j >= G) return -Infinity;
    let best = -Infinity;
    for (const f of cells[j * G + i]) {
      const a = idx[f] * 3, b = idx[f + 1] * 3, c = idx[f + 2] * 3;
      const ax = pos[a], az = pos[a + 2], bx = pos[b], bz = pos[b + 2], cx = pos[c], cz = pos[c + 2];
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-12) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
      if (u < -1e-6 || v < -1e-6 || w < -1e-6) continue;
      const y = u * pos[a + 1] + v * pos[b + 1] + w * pos[c + 1]; if (y > best) best = y;
    }
    return best;
  };
}
const TOP = {};
for (const k of Object.keys(SHAPES)) TOP[k] = makeTop(loadGlb(SHAPES[k].file));
// 世界 (x,z) 处所有岛的真实表面最高点（米）
function meshGround(x, z) {
  let g = -Infinity, who = null;
  for (const is of islands) {
    if (!is.sh) continue;
    const dx = wrapP(x - is.x), dz = wrapP(z - is.z), R = is.reach;
    if (dx > R || dx < -R || dz > R || dz < -R) continue;
    const lx = (is.c * dx - is.s * dz) / is.sx, lz = (is.s * dx + is.c * dz) / is.sx;
    const t = TOP[is.shape](lx, lz); if (t === -Infinity) continue;
    const y = t >= 0 ? t * is.sy : t * is.sy * is.k;
    if (y > g) { g = y; who = is; }
  }
  return { g, who };
}

let worst = [], n = 0, inside = 0, deep = 0;
for (let seed = 1; seed <= SEEDS; seed++) for (const tier of TIERS) {
  const S = createSim({ kind: KIND, seed: seed * 31 }), bot = makeBot(tier, seed);
  for (let i = 0; i < 60 * 60 * MIN; i++) {
    step(S, bot(S));
    if (i % 2) continue;
    const h = S.hero, { g, who } = meshGround(h.x, h.z); n++;
    if (g === -Infinity) continue;
    const d = g - h.y;                          // > 0：球心在真实表面以下
    if (d > 0) {
      // 水平方向离「露在外面」还有多远（陡壁上竖直深度没意义：贴着竖直的岸壁差 0.5 米，竖直就差好几米）
      let hd = 99;
      for (let r = .25; r <= 12 && hd === 99; r += .25) for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2; if (meshGround(h.x + Math.cos(a) * r, h.z + Math.sin(a) * r).g <= h.y) { hd = r; break; }
      }
      inside++; if (hd > 1.5) deep++; worst.push({ hd, d: +d.toFixed(2), id: who.id, shape: who.shape, y: +h.y.toFixed(1), mesh: +g.toFixed(1), hmap: +groundAt(h.x, h.z).toFixed(1), medium: h.medium, x: +h.x.toFixed(0), z: +h.z.toFixed(0), run: seed + '/' + TIERS.indexOf(tier) + '@' + i }); }
  }
}
worst.sort((a, b) => b.hd - a.hd || b.d - a.d);
console.log(`${KIND}: samples ${n}, centre below real surface ${inside} (${(inside / n * 100).toFixed(3)}%), more than 1.5 m (horizontally) inside ${deep}`);
console.table(worst.slice(0, 10));
