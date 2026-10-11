// 海面用的一张可平铺的噪声贴图（启动时用 JS 算一次，256×256，约 20 毫秒）：着色器里查表代替逐像素算噪声（手机上省很多）。
//   G = 大块的平滑噪声（梯度噪声，4 格一周期 + 8 格一周期）
//   B = 中等的平滑噪声（16 格为主，加一点 32 格）
//   R、A 没用（留着以后放别的）
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
  const GX = new Float32Array(P * P), GY = new Float32Array(P * P);
  for (let i = 0; i < P * P; i++) { GX[i] = Math.cos(L[i] * Math.PI * 2); GY[i] = Math.sin(L[i] * Math.PI * 2); }
  const f = t => t * t * t * (t * (t * 6 - 15) + 10);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const gx = x / cs, gy = y / cs, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
    const d = (i, j) => { const k = ((iy + j) % P) * P + (ix + i) % P; return GX[k] * (fx - i) + GY[k] * (fy - j); };
    const u = f(fx), v = f(fy), a = d(0, 0), b = d(1, 0), c = d(0, 1), e = d(1, 1);
    const n = (a + (b - a) * u) + ((c + (e - c) * u) - (a + (b - a) * u)) * v;
    out[y * N + x] = n * .75 + .5;
  }
  return out;
}

let tex = null;
export function seaNoise() {
  if (tex) return tex;
  const g1 = pnoise(4, 11), g2 = pnoise(8, 23), b1 = pnoise(16, 5), b2 = pnoise(32, 9);
  const d = new Uint8Array(N * N * 4), q = v => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < N * N; i++) {
    d[i * 4] = 128; d[i * 4 + 1] = q(g1[i] * .7 + g2[i] * .3); d[i * 4 + 2] = q(b1[i] * .9 + b2[i] * .1); d[i * 4 + 3] = 255;
  }
  tex = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.needsUpdate = true;
  return tex;
}
