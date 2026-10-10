// 岛（火山 / 绿岛 / 石柱）+ 云 + 火山烟。岛的数据来自 sim/world.js，这里只负责画。
// 岛和云按 PERIOD 循环：每帧把每座岛摆到离镜头最近的那一份；雾外的不画。
import * as THREE from 'three';
import { mergeGeometries } from '../../lib/jsm/utils/BufferGeometryUtils.js';
import { islands, PERIOD, wrapP, heightAt } from '../sim/world.js';
import { makeRng, hash3, lerp } from '../sim/rng.js';
import { GRAD, outlineMat } from './toon.js';

const C = h => new THREE.Color(h);
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const islandToon = Object.assign(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD }), { flatShading: true });
const islandHull = outlineMat(0x2a1e1a, .45);
const treeHull = outlineMat(0x1e2a18, .28);
const lavaMat = new THREE.MeshBasicMaterial({ color: 0xff6a1f, fog: true });

function colorize(g, colorFn) {
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  const p = ng.attributes.position, col = new Float32Array(p.count * 3), a = V(), b = V(), c = V(), n = V();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const cc = colorFn((a.y + b.y + c.y) / 3, n.y).multiplyScalar(1 + hash3(a.x, a.y, a.z) * .06);
    for (let k = 0; k < 3; k++) col.set([cc.r, cc.g, cc.b], (i + k) * 3);
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}
function islandGeo(prof, seg, jit, colorFn) {
  const g = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = jit * (y < 0 ? .3 : 1);
    pos.setXYZ(i, x + hash3(x, y, z) * k, y + hash3(z, x, y) * k * .6, z + hash3(y, z, x) * k);
  }
  g.computeVertexNormals();
  g.deleteAttribute('uv');
  return { body: colorize(g, colorFn), hull: g };
}

function buildIsland(is) {
  const grp = new THREE.Group(), rnd = makeRng(is.seed), { r, h, prof } = is;
  const add = (geo, hull, hullMat = islandHull) => {
    const m = new THREE.Mesh(geo, islandToon); grp.add(m);
    const hm = new THREE.Mesh(hull, hullMat); m.add(hm);
  };
  let smoke = null;
  if (is.kind === 'volcano') {
    const ig = islandGeo(prof, 18, r * .05, (y, ny) => y < -6 ? C(0x2a3a40) : y < 1.5 ? C(0x3a302c) : y > h * .78 ? C(0x2c2422) : ny < .45 ? C(0x5a4a42) : C(0x4a3c36).lerp(C(0x6a3a2a), Math.max(0, y / h - .4)));
    add(ig.body, ig.hull);
    const parts = [new THREE.CircleGeometry(r * .2, 14).rotateX(-Math.PI / 2).translate(0, h * .83, 0)];
    for (let k = 0; k < 3; k++) {
      const a0 = rnd.range(0, 6.28), pts = [];
      for (let t = 0; t <= 1.001; t += .1) { const d = lerp(r * .2, r * .75, t), a = a0 + Math.sin(t * 5 + k) * .15; pts.push(V(Math.cos(a) * d, heightAt(prof, d) + .6, Math.sin(a) * d)); }
      parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, r * .018, 5));
    }
    const lava = new THREE.Mesh(mergeGeometries(parts.map(p => { p.deleteAttribute('uv'); return p.toNonIndexed(); })), lavaMat); grp.add(lava);
    smoke = V(0, h * .9, 0);
  } else if (is.kind === 'green') {
    const ig = islandGeo(prof, 16, r * .06, (y, ny) => y < -6 ? C(0x3a5a5a) : y < 2 ? C(0xd9c48e) : ny < .5 ? C(0x7d7266) : C(0x5f9a4a).lerp(C(0x86b55a), y / h));
    add(ig.body, ig.hull);
    // 树：14 棵合成一个网格（原型是 14 次绘制）
    const trees = [], hulls = [];
    for (let k = 0; k < 14; k++) {
      const a = rnd.range(0, 6.28), d = rnd.range(r * .2, r * .75), y = heightAt(prof, d), s = rnd.range(1.3, 2.4);
      const cone = new THREE.ConeGeometry(1.6 * s, 4.2 * s, 7).translate(Math.cos(a) * d, y + 2.6 * s, Math.sin(a) * d);
      cone.deleteAttribute('uv'); hulls.push(cone.clone());
      const base = C(0x3f6e34).multiplyScalar(rnd.range(.85, 1.15));
      trees.push(colorize(cone, (yy, ny) => base.clone().multiplyScalar(ny > .3 ? 1.12 : .92)));
    }
    add(mergeGeometries(trees), mergeGeometries(hulls), treeHull);
  } else {
    const ig = islandGeo(prof, 9, r * .09, (y, ny) => y < -6 ? C(0x34444c) : ny > .7 ? C(0x6f8a52) : C(0x6e625a).lerp(C(0x8a7a6c), Math.max(0, y) / h));
    add(ig.body, ig.hull);
  }
  return { grp, smoke };
}

// ---------- 软软的贴图（云、烟） ----------
function puffTex(warm, seed) {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), rnd = makeRng(seed);
  for (let i = 0; i < 9; i++) {
    const x = S * (.3 + rnd() * .4), y = S * (.35 + rnd() * .3), r = S * (.18 + rnd() * .16);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, warm ? 'rgba(120,110,105,.55)' : 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// 实例化公告板：一次绘制画很多张朝向镜头的贴图（云、烟）
function billboards(tex, max) {
  const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
  const off = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const sz = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iOff', off); geo.setAttribute('iSize', sz); geo.setAttribute('iCol', col);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: tex } }]),
    vertexShader: `attribute vec3 iOff; attribute vec2 iSize; attribute vec4 iCol; varying vec2 vUv; varying vec4 vC;
      #include <fog_pars_vertex>
      void main(){
        vUv = uv; vC = iCol;
        vec4 mvPosition = viewMatrix * vec4(iOff, 1.0);
        mvPosition.xy += position.xy * iSize;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying vec2 vUv; varying vec4 vC;
      #include <fog_pars_fragment>
      void main(){
        vec4 t = texture2D(map, vUv);
        gl_FragColor = vec4(t.rgb * vC.rgb, t.a * vC.a);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
  let n = 0;
  return {
    mesh,
    begin() { n = 0; },
    push(x, y, z, w, h, r, g, b, a) {
      if (n >= max) return;
      off.array[n * 3] = x; off.array[n * 3 + 1] = y; off.array[n * 3 + 2] = z;
      sz.array[n * 2] = w; sz.array[n * 2 + 1] = h;
      col.array[n * 4] = r; col.array[n * 4 + 1] = g; col.array[n * 4 + 2] = b; col.array[n * 4 + 3] = a; n++;
    },
    end() { geo.instanceCount = n; off.needsUpdate = sz.needsUpdate = col.needsUpdate = true; },
  };
}

export function createIslands({ scene }) {
  const list = islands.map(is => { const b = buildIsland(is); scene.add(b.grp); return { is, ...b }; });
  // 云：34 团，每团 4~8 片
  const rnd = makeRng(4242);
  const clouds = [];
  for (let i = 0; i < 34; i++) {
    const n = 4 + rnd.int(0, 4), w = rnd.range(20, 45), puffs = [];
    for (let k = 0; k < n; k++) { const s = rnd.range(.6, 1) * w * 1.6; puffs.push({ x: rnd.range(-w, w), y: rnd.range(-w, w) * .15, z: rnd.range(-w, w) * .5, w: s * 1.6, h: s, c: rnd.range(.92, 1), a: rnd.range(.75, .95) }); }
    clouds.push({ x: rnd.range(-PERIOD / 2, PERIOD / 2), y: rnd.range(45, 150), z: rnd.range(-PERIOD / 2, PERIOD / 2), drift: rnd.range(1.5, 4), puffs });
  }
  const cloudBB = billboards(puffTex(false, 11), 300); scene.add(cloudBB.mesh);
  const smokeBB = billboards(puffTex(true, 23), 200); scene.add(smokeBB.mesh); smokeBB.mesh.renderOrder = 1;
  const lavaC = new THREE.Color();
  return {
    update(camera, time, dt) {
      const cx = camera.position.x, cz = camera.position.z;
      for (const o of list) {
        const x = cx + wrapP(o.is.x - cx), z = cz + wrapP(o.is.z - cz);
        o.grp.position.set(x, 0, z);
        o.grp.visible = Math.hypot(x - cx, z - cz) < 1050 + o.is.r;
      }
      cloudBB.begin();
      for (const cl of clouds) {
        cl.x += cl.drift * dt;
        const x = cx + wrapP(cl.x - cx), z = cz + wrapP(cl.z - cz);
        if (Math.hypot(x - cx, z - cz) > 1000) continue;
        for (const p of cl.puffs) cloudBB.push(x + p.x, cl.y + p.y, z + p.z, p.w, p.h, p.c, p.c, p.c, p.a);
      }
      cloudBB.end();
      smokeBB.begin();
      for (const o of list) {
        if (!o.smoke || !o.grp.visible) continue;
        for (let k = 0; k < 7; k++) {
          const t = (time * .05 + k / 7 + o.is.id * .13) % 1, sz = 25 + (k * 37 % 15);
          smokeBB.push(o.grp.position.x + o.smoke.x + Math.sin(t * 5) * 4 + t * 30, o.smoke.y + t * 90, o.grp.position.z + o.smoke.z + t * 12,
            sz * (.4 + t * 1.6), sz * (.4 + t * 1.6), 1, 1, 1, Math.sin(Math.PI * t) * .55);
        }
      }
      smokeBB.end();
      lavaMat.color.setHSL(.055, 1, .52 + .05 * Math.sin(time * 2.2));
    },
  };
}
