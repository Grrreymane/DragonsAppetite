// 粒子池：火焰、火星、进化光点、光点（加色混合）；水花、碎屑、烟、墨、星星泡泡（普通混合）。
// 每个池子一次绘制。颜色按「生命进度」在色表里插值。
import * as THREE from 'three';

const TABLES = {
  fire: [[1, .9, .6], [1, .62, .2], [1, .35, .08], [.65, .13, .04], [.15, .05, .03]],
  spark: [[1, 1, .85], [1, .85, .4], [1, .6, .2]],
  gold: [[1, 1, .8], [1, .85, .3], [1, .7, .2]],
  orb: [[1, 1, .9], [.9, 1, .7], [.6, .95, 1]],
  glow: [[.6, 1, 1], [.3, .9, 1], [.2, .6, .9]],
  splash: [[1, 1, 1], [.92, .98, 1], [.75, .9, .98]],
  bubble: [[.9, 1, 1], [.75, .95, 1], [.6, .85, 1]],
  smoke: [[.45, .4, .38], [.55, .52, .5], [.7, .7, .7]],
  steam: [[.95, .97, 1], [.85, .9, .95]],
  ink: [[.18, .1, .25], [.25, .15, .3], [.35, .3, .4]],
  star: [[1, 1, .7], [1, .95, .5], [1, .9, .6]],
};

function pool(max, additive) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), col = new Float32Array(max * 4), size = new Float32Array(max);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('col', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute float size; attribute vec4 col; varying vec4 vC; uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; vC = col; }',
    fragmentShader: additive
      ? 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC.rgb * vC.a * a, 1.0); }'
      : 'varying vec4 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.32, d); if (a < 0.02) discard; gl_FragColor = vec4(vC.rgb, vC.a * a); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 2;
  return { pts, geo, mat, pos, col, size, list: [], max };
}

export function createParticles({ scene }) {
  const add = pool(900, true), norm = pool(900, false);
  scene.add(add.pts, norm.pts);
  const P = {
    // kind：色表名；p 位置；v 速度；life 秒；size 米；opts：{ grav, drag, grow, fade }
    emit(kind, px, py, pz, vx, vy, vz, life, size, opts = {}) {
      const tbl = TABLES[kind] || TABLES.spark, isAdd = ['fire', 'spark', 'gold', 'orb', 'glow', 'star'].includes(kind);
      const pl = isAdd ? add : norm;
      if (pl.list.length >= pl.max) pl.list.shift();
      pl.list.push({ tbl, x: px, y: py, z: pz, vx, vy, vz, life, max: life, size, grav: opts.grav ?? 0, drag: opts.drag ?? 1.8, grow: opts.grow ?? 2.2, alpha: opts.alpha ?? 1, rise: opts.rise ?? 0, tint: opts.tint || null });
    },
    burst(kind, x, y, z, n, speed, life, size, opts = {}) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), s = speed * (.4 + Math.random() * .6);
        let vx = Math.sin(b) * Math.cos(a) * s, vy = Math.cos(b) * s, vz = Math.sin(b) * Math.sin(a) * s;
        if (opts.up) vy = Math.abs(vy) * opts.up;
        P.emit(kind, x, y, z, vx, vy, vz, life * (.7 + Math.random() * .6), size * (.7 + Math.random() * .6), opts);
      }
    },
    update(dt) {
      for (const pl of [add, norm]) {
        let n = 0;
        for (let i = pl.list.length - 1; i >= 0; i--) {
          const q = pl.list[i]; q.life -= dt; if (q.life <= 0) { pl.list.splice(i, 1); continue; }
          const k = Math.exp(-q.drag * dt); q.vx *= k; q.vy *= k; q.vz *= k; q.vy += (q.rise - q.grav) * dt;
          q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          const a = 1 - q.life / q.max, T = q.tbl, s = a * (T.length - 1), j = Math.min(T.length - 2, s | 0), f = s - j;
          pl.pos[n * 3] = q.x; pl.pos[n * 3 + 1] = q.y; pl.pos[n * 3 + 2] = q.z;
          let r = T[j][0] + (T[j + 1][0] - T[j][0]) * f, g = T[j][1] + (T[j + 1][1] - T[j][1]) * f, b = T[j][2] + (T[j + 1][2] - T[j][2]) * f;
          if (q.tint) { r *= q.tint[0]; g *= q.tint[1]; b *= q.tint[2]; }
          pl.col[n * 4] = r; pl.col[n * 4 + 1] = g; pl.col[n * 4 + 2] = b; pl.col[n * 4 + 3] = Math.min(1, (1 - a) * 2.2) * q.alpha;
          pl.size[n] = q.size * (.5 + a * q.grow); n++;
        }
        pl.geo.setDrawRange(0, n);
        for (const k of ['position', 'col', 'size']) pl.geo.attributes[k].needsUpdate = true;
      }
    },
    resize(h, pixelRatio, fov) {
      const s = h * pixelRatio * .5 / Math.tan(fov * Math.PI / 360);
      add.mat.uniforms.uScale.value = s; norm.mat.uniforms.uScale.value = s;
    },
  };
  return P;
}
