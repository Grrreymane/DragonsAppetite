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

export function createIslands({ scene }) {
  const list = islands.map(is => { const b = buildIsland(is); scene.add(b.grp); return { is, ...b }; });
  const lavaC = new THREE.Color();
  return {
    list,
    // 火山烟柱的位置（世界坐标，只给看得见的火山），clouds.js 用
    smokePoints() { const a = []; for (const o of list) if (o.smoke && o.grp.visible) a.push({ x: o.grp.position.x + o.smoke.x, y: o.smoke.y, z: o.grp.position.z + o.smoke.z, id: o.is.id }); return a; },
    update(camera, time, dt) {
      const cx = camera.position.x, cz = camera.position.z;
      for (const o of list) {
        const x = cx + wrapP(o.is.x - cx), z = cz + wrapP(o.is.z - cz);
        o.grp.position.set(x, 0, z);
        o.grp.visible = Math.hypot(x - cx, z - cz) < 1050 + o.is.r;
      }
      lavaMat.color.setHSL(.055, 1, .52 + .05 * Math.sin(time * 2.2));
    },
  };
}
