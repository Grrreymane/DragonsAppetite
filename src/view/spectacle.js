// 大场面的画面：闪电（一道折线 + 分叉，朝镜头的带子）、流星（天上划过的亮线）、落下来的星星（发光的星 + 拖尾，落到位以后闪着等主角来吃）。
// 玩法效果在 sim.js（zap / spawnStars），这里只画。
import * as THREE from 'three';

const MAXQ = 900;   // 带子的四边形上限（闪电 + 流星 + 星星拖尾共用一个网格）

export function createSpectacle({ scene, camera }) {
  // ---- 朝镜头的带子：每段 = 一个四边形，颜色带透明度（加色混合）----
  const pos = new Float32Array(MAXQ * 4 * 3), col = new Float32Array(MAXQ * 4 * 4), idx = new Uint16Array(MAXQ * 6);
  for (let i = 0; i < MAXQ; i++) { const v = i * 4, o = i * 6; idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], o); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
  const ribbons = new THREE.Mesh(geo, mat); ribbons.frustumCulled = false; ribbons.renderOrder = 4; scene.add(ribbons);
  let nq = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3();
  // 一段带子：a → b，半宽 w，颜色 (r,g,b) 透明度 a0 → a1
  function seg(ax, ay, az, bx, by, bz, w, r, g, b, a0, a1) {
    if (nq >= MAXQ) return;
    _a.set(ax, ay, az); _b.set(bx, by, bz); _d.subVectors(_b, _a);
    _v.subVectors(_a, camera.position);
    _s.crossVectors(_d, _v); const l = _s.length(); if (l < 1e-6) return;
    _s.multiplyScalar(w * Math.max(.2, Math.min(1.6, _v.length() / 70)) / l);   // 宽度跟着离镜头的远近：近处不会变成一大块白板
    const p = nq * 12, c = nq * 16;
    pos[p] = ax + _s.x; pos[p + 1] = ay + _s.y; pos[p + 2] = az + _s.z;
    pos[p + 3] = ax - _s.x; pos[p + 4] = ay - _s.y; pos[p + 5] = az - _s.z;
    pos[p + 6] = bx + _s.x; pos[p + 7] = by + _s.y; pos[p + 8] = bz + _s.z;
    pos[p + 9] = bx - _s.x; pos[p + 10] = by - _s.y; pos[p + 11] = bz - _s.z;
    for (let k = 0; k < 4; k++) { col[c + k * 4] = r; col[c + k * 4 + 1] = g; col[c + k * 4 + 2] = b; col[c + k * 4 + 3] = k < 2 ? a0 : a1; }
    nq++;
  }

  // ---- 星星：发光的贴片（四角星）----
  const starTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(.25, 'rgba(255,220,120,.7)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,240,1)'; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 2, r = i % 2 ? 6 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    return new THREE.CanvasTexture(c);
  })();
  const NS = 40;
  const sprites = Array.from({ length: NS }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, toneMapped: false }));
    s.visible = false; scene.add(s); return s;
  });

  // ---- 闪电 ----
  const bolts = [];   // { pts: [[x,y,z]...], branches: [[...]], t }
  function strike(x0, y0, z0, x1, y1, z1) {
    const main = [], n = 14;
    for (let i = 0; i <= n; i++) {
      const f = i / n, j = i && i < n ? 1 : 0, sp = Math.hypot(x1 - x0, y1 - y0, z1 - z0) * .06;
      main.push([x0 + (x1 - x0) * f + (Math.random() - .5) * sp * j * 2, y0 + (y1 - y0) * f + (Math.random() - .5) * sp * j, z0 + (z1 - z0) * f + (Math.random() - .5) * sp * j * 2]);
    }
    const branches = [];
    for (let b = 0; b < 3; b++) {
      const k = 2 + Math.floor(Math.random() * (n - 5)), p = main[k], br = [p];
      let [x, y, z] = p; const dx = (Math.random() - .5) * 14, dz = (Math.random() - .5) * 14;
      for (let i = 0; i < 4; i++) { x += dx + (Math.random() - .5) * 6; y -= 6 + Math.random() * 6; z += dz + (Math.random() - .5) * 6; br.push([x, y, z]); }
      branches.push(br);
    }
    bolts.push({ main, branches, t: 0 });
  }

  // ---- 流星（天上）----
  const meteors = []; let showerT = 0, nextM = 0;
  function shower(dur) { showerT = dur; nextM = 0; }

  return {
    strike, shower,
    get busy() { return showerT > 0 || bolts.length > 0; },
    update(S, dt) {
      nq = 0;
      // 闪电：0.35 秒，前 0.1 秒最亮，中间闪一下
      for (let i = bolts.length - 1; i >= 0; i--) {
        const B = bolts[i]; B.t += dt;
        if (B.t > .4) { bolts.splice(i, 1); continue; }
        const a = B.t < .08 ? 1 : B.t < .14 ? .35 : B.t < .2 ? .9 : Math.max(0, 1 - (B.t - .2) / .2);
        const draw = (P, w, k) => { for (let j = 0; j < P.length - 1; j++) { const p = P[j], q = P[j + 1]; seg(p[0], p[1], p[2], q[0], q[1], q[2], w * 3.2, .35, .45, 1, a * .35 * k, a * .35 * k); seg(p[0], p[1], p[2], q[0], q[1], q[2], w, 1, 1, 1, a * k, a * k); } };
        draw(B.main, .7, 1); for (const br of B.branches) draw(br, .35, .7);
      }
      // 流星：镜头远处的天上（800 米外），斜着往下划，0.7 秒
      if (showerT > 0) {
        showerT -= dt; nextM -= dt;
        if (nextM <= 0) {
          nextM = .25 + Math.random() * .6;
          const az = Math.random() * Math.PI * 2, el = .35 + Math.random() * .6;
          meteors.push({ az, el, daz: (Math.random() < .5 ? -1 : 1) * (.1 + Math.random() * .12), del: -(.12 + Math.random() * .1), t: 0, life: .6 + Math.random() * .4 });
        }
      }
      const cam = camera.position, R = 800;
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]; m.t += dt; if (m.t > m.life) { meteors.splice(i, 1); continue; }
        const f = m.t / m.life, a = Math.sin(f * Math.PI);
        const dir = (az, el) => [cam.x + Math.cos(el) * Math.sin(az) * R, cam.y + Math.sin(el) * R, cam.z + Math.cos(el) * Math.cos(az) * R];
        const h = dir(m.az + m.daz * f, m.el + m.del * f), t = dir(m.az + m.daz * (f - .4), m.el + m.del * (f - .4));
        seg(t[0], t[1], t[2], h[0], h[1], h[2], 2.6, 1, .92, .75, 0, a * 1.2);
      }
      // 落下来的星星：亮星 + 一条拖尾；落到位的星一闪一闪，稍微大一点
      let ns = 0;
      if (S) for (const o of S.orbs) {
        if (!o.star || o.wait > 0 || ns >= NS) continue;
        const s = sprites[ns++]; s.visible = true; s.position.set(o.x, o.y, o.z);
        const tw = .85 + .15 * Math.sin(S.t * 6 + o.ty);
        s.scale.setScalar((o.fall > 0 ? 5 : 6.5) * tw);
        s.material.rotation = S.t * .8;
        s.material.opacity = Math.min(1, o.t / 2);
        if (o.fall > 0) { const k = 1.1; seg(o.x - o.vx * k, o.y - o.vy * k, o.z - o.vz * k, o.x, o.y, o.z, 1, 1, .8, .4, 0, .9); }
      }
      for (let i = ns; i < NS; i++) sprites[i].visible = false;
      geo.setDrawRange(0, nq * 6);
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
      ribbons.visible = nq > 0;
    },
  };
}
