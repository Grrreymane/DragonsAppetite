// 地标的画面：models/landmarks/<id>.glb（Tripo 模型，量化、不存法线、只有底色贴图），卡通着色、不描边（用户要求场景不描边）。
// 位置 / 朝向见 config/landmarks.js；每帧把模型挪到离镜头最近的那一份世界里。拱门洞口一圈淡淡的金光（提示能穿过去）。
import * as THREE from 'three';
import { GLTFLoader } from '../../lib/jsm/loaders/GLTFLoader.js';
import { LANDMARKS, LANDMARK_OPENING } from '../config/landmarks.js';
import { weldedNormals, bakeNode, dilateMap } from './islands.js';
import { wrapP } from '../sim/world.js';

const BASE = new URL('../../models/landmarks/', import.meta.url);

export function createLandmarks({ scene, GRAD }) {
  const loader = new GLTFLoader();
  const items = [];
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const load = L => new Promise(res => loader.load(new URL(L.id + '.glb', BASE).href, g => {
    const grp = new THREE.Group(); grp.name = 'lm_' + L.id;
    g.scene.updateMatrixWorld(true);
    g.scene.traverse(o => {
      if (!o.isMesh) return;
      const geo = bakeNode(o); if (!geo.attributes.normal) weldedNormals(geo);
      let map = o.material && o.material.map;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; try { map = dilateMap(map, geo); } catch (e) { } }
      const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map, gradientMap: GRAD, side: THREE.DoubleSide, color: map ? 0xffffff : 0xb09070 }));
      grp.add(m);
    });
    grp.rotation.y = L.yaw; grp.scale.setScalar(L.scale);
    const op = LANDMARK_OPENING[L.id];
    let ring = null;
    if (op) {   // 洞口的光圈：一圈椭圆环，贴在洞的平面上
      const hw = op.hw * .95, hh = op.peak * .46;   // 洞是圆拱：椭圆从海面上一点到拱顶下面
      const sh = new THREE.Shape(); sh.absellipse(0, 0, hw, hh, 0, Math.PI * 2);
      const hole = new THREE.Path(); hole.absellipse(0, 0, hw - 1.6, hh - 1.6, 0, Math.PI * 2); sh.holes.push(hole);
      ring = new THREE.Mesh(new THREE.ShapeGeometry(sh, 48), ringMat);
      ring.position.set(op.c[0], op.peak * .5, op.c[2]); grp.add(ring);
    }
    scene.add(grp);
    items.push({ L, grp, ring });
    res();
  }, undefined, e => { console.warn('地标模型加载失败（不画）', L.id, e && e.message); res(); }));
  const ready = Promise.all(LANDMARKS.map(load));
  return {
    ready, items,
    update(camera, T) {
      const c = camera.position;
      for (const it of items) {
        const L = it.L, x = c.x + wrapP(L.x - c.x), z = c.z + wrapP(L.z - c.z);
        it.grp.position.set(x, L.y, z);
        it.grp.visible = Math.hypot(x - c.x, z - c.z) < 1150;
      }
      ringMat.opacity = .35 + .2 * Math.sin(T * 2.4);
    },
  };
}
