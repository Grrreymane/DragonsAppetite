// 猎场线索：少量复用网格，世界坐标和猎群路线保持一致，不改变镜头或输入。
import * as THREE from 'three';
import { waveH, seabedY } from '../sim/world.js';

const TAU = Math.PI * 2;
const clamp01 = n => Math.max(0, Math.min(1, n));

// 按路线各段的实际长度插值，弯道里的光点不会忽快忽慢。
function sample(route, lengths, total, u, out) {
  let d = clamp01(u) * total;
  for (let i = 1; i < route.length; i++) {
    const len = lengths[i - 1];
    if (d <= len || i === route.length - 1) {
      const a = route[i - 1], b = route[i], f = len > 0 ? d / len : 0;
      out.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
      return out;
    }
    d -= len;
  }
  const a = route[0];
  return out.set(a.x, a.y, a.z);
}

export function createHuntView(scene) {
  const root = new THREE.Group(); root.name = 'hunt-clues'; root.visible = false; scene.add(root);
  const dummy = new THREE.Object3D(), point = new THREE.Vector3();
  const materials = [], geometries = [];
  const mat = (color, opacity) => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    materials.push(m); return m;
  };
  const geo = g => { geometries.push(g); return g; };
  const instances = (g, m, n) => {
    const mesh = new THREE.InstancedMesh(g, m, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
    root.add(mesh); return mesh;
  };
  const glowMat = mat(0xffe7a3, .76), wispMat = mat(0xfff3cf, .42), seaMat = mat(0xaffff0, .4);
  const sparks = instances(geo(new THREE.OctahedronGeometry(1, 0)), glowMat, 34);
  const arcs = instances(geo(new THREE.RingGeometry(.94, 1, 36, 1, .15, Math.PI * 1.36)), wispMat, 4);
  const ripples = instances(geo(new THREE.RingGeometry(.965, 1, 48)), seaMat, 3);
  const bed = new THREE.Mesh(geo(new THREE.RingGeometry(3.5, 4.2, 40)), mat(0x57e5d8, .22));
  bed.rotation.x = -Math.PI / 2; root.add(bed);
  let last = null, route = [], lengths = [], total = 0;
  const set = (mesh, i, x, y, z, sx, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(rx, ry, rz);
    dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  };
  return {
    update(S, dt) {
      const hunt = S && S.hunt;
      root.visible = !!hunt;
      if (!hunt) { last = null; return; }
      if (hunt !== last) {
        last = hunt; route = hunt.route && hunt.route.length > 1 ? hunt.route : [hunt, hunt];
        lengths = []; total = 0;
        for (let i = 1; i < route.length; i++) {
          const a = route[i - 1], b = route[i], len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
          lengths.push(len); total += len;
        }
      }
      const sea = hunt.kind === 'tide', cue = hunt.phase === 'cue', finale = hunt.phase === 'finale';
      const t = S.t || 0, anchor = finale ? route[route.length - 1] : hunt;
      const endFade = cue ? 1 : Math.min(1, Math.max(0, (hunt.duration - hunt.elapsed) / 1.4));
      const fade = endFade * Math.min(1, (hunt.elapsed + .1) / .8);
      glowMat.color.setHex(sea ? 0xb5fff0 : 0xffdc76);
      glowMat.opacity = (cue ? .84 : .66) * fade;
      // 飞进线索时让出视野，避免近处断弧放大成贯穿画面的亮带。
      const hero = S.hero, distance = Math.hypot(hero.x - anchor.x, hero.y - anchor.y, hero.z - anchor.z);
      const near = clamp01((distance - 12) / 18), cloudFade = near * near * (3 - 2 * near);
      wispMat.opacity = .42 * fade * cloudFade; seaMat.opacity = .36 * fade;
      arcs.visible = !sea && cloudFade > .01; ripples.visible = sea; bed.visible = sea && cue;
      // 云隙是一组柔软的断弧，围着真正可飞过的猎场入口；不使用整圈靶心。
      if (!sea) {
        for (let i = 0; i < 4; i++) {
          const a = t * .09 + i * 1.7, r = (cue ? 8 : finale ? 10 : 6) + i * 1.6;
          set(arcs, i, anchor.x + Math.cos(a) * .7, anchor.y + Math.sin(a * .8) * .5, anchor.z + i * .6,
            r * 1.3, r * .58, 1, 0, hunt.yaw || 0, a);
        }
        arcs.instanceMatrix.needsUpdate = true;
      } else {
        // 水面波纹跟着同一个海浪公式；海底微光只作为远处线索，不要求玩家潜到海床。
        for (let i = 0; i < 3; i++) {
          const r = 5 + i * 3.6 + Math.sin(t * .5 + i) * .6;
          set(ripples, i, anchor.x, waveH(anchor.x, anchor.z, t) + .18 + i * .08, anchor.z,
            r, r, 1, -Math.PI / 2, 0, i * .5);
        }
        ripples.instanceMatrix.needsUpdate = true;
        bed.position.set(anchor.x, seabedY(anchor.x, anchor.z) + .25, anchor.z);
        bed.scale.setScalar(1.6 + Math.sin(t * .45) * .08); bed.material.opacity = .22 * fade;
      }
      // 入口的小光点聚集成群；路线上的光点缓缓流向终点，提示弯道和抄近路的方向。
      let n = 0;
      const cluster = cue || finale;
      for (let i = 0; i < (cluster ? 16 : 8); i++) {
        const a = i * 2.39996 + t * .16, r = 2 + (i % 5) * (sea ? .8 : 1.2);
        const sy = sea ? .42 : .6, size = .22 + .1 * (.5 + .5 * Math.sin(t * .8 + i));
        const x = anchor.x + Math.sin(a) * r, y = anchor.y + Math.cos(i * 1.71 + t * .3) * (sea ? 1.8 : 3), z = anchor.z + Math.cos(a) * r;
        const close = clamp01((Math.hypot(hero.x - x, hero.y - y, hero.z - z) - 5) / 13);
        set(sparks, n++, x, y, z, size * close, sy * close, size * close, 0, a, .2);
      }
      if (!finale) for (let i = 0; i < 18; i++) {
        const u = ((i / 18 + t * .018) % 1) * (cue ? .24 : 1);
        sample(route, lengths, total, u, point);
        const close = clamp01((Math.hypot(hero.x - point.x, hero.y - point.y, hero.z - point.z) - 5) / 13);
        const s = (cue ? .22 : .32) * close;
        set(sparks, n++, point.x, point.y + .8 + Math.sin(i + t * .65) * .35, point.z,
          s, s * 1.7, s, 0, t * .25 + i, 0);
      }
      sparks.count = n; sparks.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(root);
      geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    },
  };
}