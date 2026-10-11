// 海面用的一张可平铺的噪声贴图（启动时用 JS 算一次，256×256，约 20 毫秒）：着色器里查表代替逐像素算噪声（手机上省很多）。
//   R = 泡沫花纹：Voronoi 的 F2 − F1（细胞边上 = 0），阈值一取就是一圈圈干净的细线（浪尖的白沫、觅食点的翻腾水）
//   G = 大块的平滑噪声（梯度噪声，4 格一周期 + 8 格一周期）
//   B = 中等的平滑噪声（16 格为主，掺一点 32 格；等高线不会碎成一堆小圈）
//   A = Voronoi 的 F1（离细胞中心的距离）：阈值一取就是一颗颗圆点（水花、亮点）
import * as THREE from 'three';

const N = 256;

function lattice(P, seed) {
  const v = new Float32Array(P * P);
  let s = seed >>> 0;
  for (let i = 0; i < v.length; i++) { s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0; v[i] = (s >>> 8) / 16777216; }
  return v;
}
function pnoise(P, seed) {   // 可平铺的梯度噪声（Perlin），周期 P 格，输出 N×N，0..1（值噪声的「方块感」它没有）
  const L = lattice(P * P, seed), out = new Float32Array(N * N), cs = N / P;
  const G = i => { const a = L[i] * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; };
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = x / cs, gy = y / cs, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const g = (i, j) => G((((iy + j) % P) * P + (ix + i) % P));
    const d = (i, j) => { const q = g(i, j); return q[0] * (fx - i) + q[1] * (fy - j); };
    const u = f(fx), v = f(fy), a = d(0, 0), b = d(1, 0), c = d(0, 1), e = d(1, 1);
    const n = (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * v;
    out[y * N + x] = n * .75 + .5;
  }
  return out;
}
function voronoi(P, seed) {  // 可平铺的 Voronoi：返回 F1、F2 − F1（单位：格）
  const L = lattice(P * 2, seed), cs = N / P, F1 = new Float32Array(N * N), E = new Float32Array(N * N);
  const pt = (i, j) => { const ii = ((i % P) + P) % P, jj = ((j % P) + P) % P, k = jj * P + ii; return [i + .15 + .7 * L[k * 2 % L.length], j + .15 + .7 * L[(k * 2 + 1) % L.length]]; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = (x + .5) / cs, gy = (y + .5) / cs, ix = Math.floor(gx), iy = Math.floor(gy);
    let d1 = 9, d2 = 9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const [px, py] = pt(ix + i, iy + j), d = Math.hypot(px - gx, py - gy);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    F1[y * N + x] = d1; E[y * N + x] = d2 - d1;
  }
  return { F1, E };
}

let tex = null;
export function seaNoise() {
  if (tex) return tex;
  const { F1, E } = voronoi(8, 7), g1 = pnoise(4, 11), g2 = pnoise(8, 23), b1 = pnoise(16, 5), b2 = pnoise(32, 9);
  const d = new Uint8Array(N * N * 4), q = v => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = q(E[i] / .9); d[i * 4 + 1] = q(g1[i] * .7 + g2[i] * .3); d[i * 4 + 2] = q(b1[i] * .9 + b2[i] * .1); d[i * 4 + 3] = q(F1[i] / .9);
  }
  tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}
