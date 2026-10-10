// 程序生成的贴图：鳞片、岩石甲片（带熔岩裂纹）、翼膜、烟
import * as THREE from '../lib/three.module.min.js';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function rng(seed) {
  let s = seed | 0;
  return () => { s = s + 0x6d2b79f5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function tex(c, srgb) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 鳞片：x 方向 = 沿身体，后一列压在前一列上（像瓦片）
export function makeScaleTex() {
  const S = 512, cols = 16, rows = 12, cw = S / cols, rh = S / rows, r = rng(11);
  const c = cv(S, S), g = c.getContext('2d'), b = cv(S, S), h = b.getContext('2d');
  g.fillStyle = '#8c847c'; g.fillRect(0, 0, S, S);
  h.fillStyle = '#202020'; h.fillRect(0, 0, S, S);
  for (let col = -1; col <= cols; col++) for (let row = -1; row <= rows; row++) {
    const x = col * cw, y = (row + (col & 1) * 0.5) * rh, v = 0.84 + r() * 0.16;
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const X = x + dx, Y = y + dy;
      if (X < -cw * 1.5 || X > S + cw * 1.5 || Y < -rh * 1.5 || Y > S + rh * 1.5) continue;
      const gr = g.createRadialGradient(X - cw * .3, Y, 1, X, Y, cw * .75);
      const hi = Math.round(255 * v), lo = Math.round(185 * v);
      gr.addColorStop(0, `rgb(${hi},${hi},${hi})`); gr.addColorStop(1, `rgb(${lo},${lo - 4},${lo - 8})`);
      g.beginPath(); g.ellipse(X, Y, cw * .7, rh * .62, 0, 0, Math.PI * 2); g.fillStyle = gr; g.fill();
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(35,25,20,.4)'; g.stroke();
      const hg = h.createRadialGradient(X - cw * .25, Y, 1, X, Y, cw * .7);
      hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, '#2a2a2a');
      h.beginPath(); h.ellipse(X, Y, cw * .7, rh * .62, 0, 0, Math.PI * 2); h.fillStyle = hg; h.fill();
    }
  }
  return { map: tex(c, true), bump: tex(b, false) };
}

// Voronoi 裂纹：返回每个像素的“到裂缝的距离”和所在块的随机值（可平铺）
function voronoi(S, n, seed) {
  const r = rng(seed), P = [];
  for (let i = 0; i < n; i++) P.push([r(), r(), r()]);
  const edge = new Float32Array(S * S), cell = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S; let f1 = 9, f2 = 9, id = 0;
    for (let k = 0; k < n; k++) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
      const dx = P[k][0] + ox - u, dy = P[k][1] + oy - v, d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
    }
    edge[y * S + x] = Math.sqrt(f2) - Math.sqrt(f1); cell[y * S + x] = P[id][2];
  }
  return { edge, cell };
}

// 岩石甲片：深灰褐色，裂缝发橙光
export function makeRockTex() {
  const S = 256, { edge, cell } = voronoi(S, 20, 5);
  const c = cv(S, S), e = cv(S, S), gc = c.getContext('2d'), ge = e.getContext('2d');
  const ic = gc.createImageData(S, S), ie = ge.createImageData(S, S);
  const r = rng(9);
  for (let i = 0; i < S * S; i++) {
    const crack = 1 - Math.min(1, edge[i] / 0.022), n = r() * 0.05;
    const base = 0.2 + cell[i] * 0.09 + n;
    const k = base * (1 - crack * 0.5);
    ic.data[i * 4] = k * 255 * 1.08; ic.data[i * 4 + 1] = k * 255 * 0.95; ic.data[i * 4 + 2] = k * 255 * 0.88; ic.data[i * 4 + 3] = 255;
    const glow = Math.pow(crack, 1.5) * (0.35 + cell[i] * 0.65);
    ie.data[i * 4] = glow * 255; ie.data[i * 4 + 1] = glow * 255; ie.data[i * 4 + 2] = glow * 255; ie.data[i * 4 + 3] = 255;
  }
  gc.putImageData(ic, 0, 0); ge.putImageData(ie, 0, 0);
  return { map: tex(c, true), em: tex(e, true) };
}

// 翼膜：u = 横跨翅膀，v = 从腕部到翼缘。红色渐变 + 深色翼脉 + 熔岩细纹
export function makeWingTex() {
  const W = 512, H = 512, r = rng(21);
  const c = cv(W, H), g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#5e1a16'); grad.addColorStop(0.25, '#8f2b22'); grad.addColorStop(0.7, '#b23a28'); grad.addColorStop(1, '#8a2a20');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // 斑驳
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${r() < .5 ? '60,10,8' : '220,90,50'},${0.04 + r() * 0.05})`;
    g.beginPath(); g.ellipse(r() * W, r() * H, 6 + r() * 22, 4 + r() * 12, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // 翼脉：从腕部往外分叉
  const vein = (x, y, ang, len, w, depth) => {
    if (depth > 4 || len < 12) return;
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + (r() - .5) * len * .3, (y + y2) / 2, x2, y2);
    g.lineWidth = w; g.strokeStyle = 'rgba(55,12,10,.55)'; g.stroke();
    vein(x2, y2, ang + (r() - .5) * .9, len * (.55 + r() * .25), w * .7, depth + 1);
    if (r() < .6) vein(x2, y2, ang + (r() < .5 ? -1 : 1) * (.4 + r() * .5), len * (.45 + r() * .2), w * .6, depth + 1);
  };
  for (let i = 0; i < 9; i++) vein((i + .5) / 9 * W, 0, Math.PI / 2 + (r() - .5) * .3, 110 + r() * 60, 5, 0);
  // 熔岩细纹
  const S = 256, { edge, cell } = voronoi(S, 26, 33);
  const e = cv(S, S), ge = e.getContext('2d'), ie = ge.createImageData(S, S);
  const lava = cv(S, S), gl = lava.getContext('2d'), il = gl.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const y = Math.floor(i / S) / S;
    const crack = Math.pow(1 - Math.min(1, edge[i] / 0.012), 2) * (cell[i] > 0.35 ? 1 : 0.15) * (0.3 + 0.7 * Math.min(1, y * 2.2));
    ie.data[i * 4] = ie.data[i * 4 + 1] = ie.data[i * 4 + 2] = crack * 255; ie.data[i * 4 + 3] = 255;
    il.data[i * 4] = 255; il.data[i * 4 + 1] = 120; il.data[i * 4 + 2] = 40; il.data[i * 4 + 3] = crack * 150;
  }
  ge.putImageData(ie, 0, 0); gl.putImageData(il, 0, 0);
  g.drawImage(lava, 0, 0, W, H);
  return { map: tex(c, true), em: tex(e, true) };
}

export function makeSmokeTex() {
  const S = 64, c = cv(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(235,228,220,.9)'); gr.addColorStop(0.5, 'rgba(210,200,190,.45)'); gr.addColorStop(1, 'rgba(200,190,180,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
