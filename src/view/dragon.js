// 主角：按清单（models/<name>.json）加载 glb → 卡通材质 + 骨骼描边 → 动作混合 → 运行时叠加转动（先撤销上一帧！）
import * as THREE from 'three';
import { GLTFLoader } from '../../lib/jsm/loaders/GLTFLoader.js';
import { GRAD, outlineMat } from './toon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const loader = new GLTFLoader();
const cache = new Map();          // name → Promise<{ gltf, man }>
const BASE = new URL('../../', import.meta.url);   // 游戏根目录（试验页在 _lab/ 里也能找到 models/）

// 没有清单文件时的默认值（成年火龙，原型里量好的）
const DEFAULT_MAN = {
  fire_adult: { file: 'models/fire_adult_anim.glb', kind: 'fire', length: .94, pivot: [.15, 0, -.07], mouth: null, headBone: 'head',
    neckBones: ['neck1', 'neck2', 'head'], tailBones: ['tail1', 'tail2', 'tail3', 'tail4', 'tail5', 'tail6'],
    wingBones: { L: ['wing1.L', 'wing2.L', 'fing1.L'], R: ['wing1.R', 'wing2.R', 'fing1.R'] }, outline: .0042 },
};

export function loadModel(name, onProgress) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    let man = DEFAULT_MAN[name];
    try { const r = await fetch(new URL(`models/${name}.json`, BASE), { cache: 'no-cache' }); if (r.ok) man = { ...(man || {}), ...(await r.json()) }; } catch (e) { /* 没清单就用默认 */ }
    if (!man) throw new Error('没有模型 ' + name);
    const gltf = await new Promise((res, rej) => loader.load(new URL(man.file, BASE).href, res, e => onProgress && e.total && onProgress(e.loaded / e.total), rej));
    return { gltf, man, name };
  })();
  cache.set(name, p);
  p.catch(() => cache.delete(name));
  return p;
}
export const hasModel = name => fetch(new URL(`models/${name}.json`, BASE), { method: 'HEAD', cache: 'no-cache' }).then(r => r.ok).catch(() => false);

// 一条龙的显示对象。build() 换模型（进化 / 换龙），update() 每帧
export function createDragonView({ scene }) {
  const root = new THREE.Group(); scene.add(root);
  const D = { root, model: null, mixer: null, act: {}, bones: {}, man: null, kind: 'fire', scale: 1, saved: new Map(), boneScale: null,
    toonMats: [], hulls: [], glow: { value: 0 }, flash: { value: 0 }, rim: { value: 0 }, bite: 0, gulp: 0, roar: 0, name: null };
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = V(), U = V(), F = V(), Lf = V();

  D.build = (loaded, desiredLen, boneScale) => {
    const { gltf, man, name } = loaded;
    if (D.model) { root.remove(D.model); D.mixer && D.mixer.stopAllAction(); }
    // 同一个 glb 可能被两个阶段共用（顶替时），所以每次克隆骨骼网格
    const model = cloneSkinned(gltf.scene);
    D.man = man; D.kind = man.kind || 'fire'; D.name = name;
    const s = desiredLen / (man.length || 1); D.scale = s; D.buildLen = desiredLen;
    // 嘴在体长方向上的位置（相对身体中心，按体长算）：sim 用它判定吃东西，和看得见的嘴对上
    D.mouthK = man.mouth && man.pivot ? Math.max(.25, Math.min(.6, (man.mouth[0] - man.pivot[0]) / (man.length || 1))) : .47;
    model.rotation.y = -Math.PI / 2; model.scale.setScalar(s);
    const pv = man.pivot || [0, 0, 0];
    model.position.set(-pv[1] * s, -pv[2] * s, -pv[0] * s);
    D.bones = {}; D.toonMats = []; D.hulls = [];
    const skinned = [];
    model.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.isSkinnedMesh) skinned.push(o); } if (o.isBone) D.bones[o.name] = o; });
    for (const o of skinned) {
      const std = o.material;
      const toon = new THREE.MeshToonMaterial({ map: std.map, gradientMap: GRAD, color: 0xffffff, side: std.side });   // 翼膜 / 鳍是单片，跟原材质一样双面
      toon.onBeforeCompile = sh => {
        sh.uniforms.uGlow = D.glow; sh.uniforms.uFlash = D.flash; sh.uniforms.uRim = D.rim;
        sh.fragmentShader = 'uniform float uGlow; uniform float uFlash; uniform float uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { vec3 tc = diffuseColor.rgb; float mx = max(tc.r, max(tc.g, tc.b)), mn = min(tc.r, min(tc.g, tc.b));
            float sat = (mx - mn) / max(mx, 1e-3);
            float cyan = smoothstep(.35, .6, sat) * smoothstep(.05, .2, tc.g - tc.r) * smoothstep(-.05, .08, tc.b - tc.g * .8) * smoothstep(.25, .45, mx);
            totalEmissiveRadiance += tc * cyan * uGlow * 1.6 + vec3(uFlash);
            // 进化时的金色轮廓光（只亮边缘，不把整条龙刷白）
            float rimF = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
            totalEmissiveRadiance += vec3(1.0, .72, .28) * uRim * (rimF * .9 + .04); }`);
      };
      toon.customProgramCacheKey = () => 'heroToon';
      o.material = toon; D.toonMats.push(toon);
      const h = new THREE.SkinnedMesh(o.geometry, outlineMat(0x1c0d08, man.outline || .0042 * (man.length || .94) / .94));
      h.bind(o.skeleton, o.bindMatrix); h.frustumCulled = false;
      h.position.copy(o.position); h.quaternion.copy(o.quaternion); h.scale.copy(o.scale);
      o.parent.add(h); D.hulls.push(h);
    }
    root.add(model); D.model = model;
    D.mixer = new THREE.AnimationMixer(model); D.act = {};
    for (const c of gltf.animations) { const a = D.mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); D.act[c.name] = a; }
    D.boneScale = boneScale || null;
    // 嘴：清单给了静止姿势下的嘴尖坐标（Blender 坐标）就换算到 head 骨的局部坐标
    D.mouthLocal = null;
    const hb = D.bone(man.headBone || 'head');
    if (hb && man.mouth) {
      model.updateMatrixWorld(true);
      // Blender (bx,by,bz) → glTF (bx,bz,-by) → 绕 Y 转 -90° 后 = (by,bz,bx)
      const m = man.mouth, wp = V(m[1], m[2], m[0]).multiplyScalar(s).add(model.position);
      root.updateMatrixWorld(true); D.mouthLocal = hb.worldToLocal(root.localToWorld(wp.clone()));
    }
    D.saved.clear();
  };
  D.bone = n => D.bones[n] || D.bones[n.replace('.', '')];

  function undoOverlay() { for (const [b, q] of D.saved) b.quaternion.copy(q); D.saved.clear(); }
  function rotWorld(name, axis, ang) {
    const b = D.bone(name); if (!b || !ang) return;
    if (!D.saved.has(b)) D.saved.set(b, b.quaternion.clone());
    b.parent.getWorldQuaternion(_q).invert(); _ax.copy(axis).applyQuaternion(_q).normalize();
    b.quaternion.premultiply(_q2.setFromAxisAngle(_ax, ang)); b.updateMatrixWorld(true);
  }

  // 每帧：h = 插值后的主角状态 {x,y,z,yaw,pitch,bank,yawRate,flyW,tuck,...}；S = sim
  D.update = (h, S, dt, time) => {
    if (!D.model) return;
    const bob = D.kind === 'fire' && h.medium === 'air' ? Math.sin(time * Math.PI * 2) * .35 * h.flyW * (D.scale / 11) : 0;
    root.position.set(h.x, h.y + bob, h.z);
    root.rotation.set(-h.pitch, h.yaw, h.bank, 'YXZ');
    // 吞下去时身体鼓一下（3%，0.15 秒）
    D.gulp = Math.max(0, D.gulp - dt);
    // 体型跟着体长走（阶段内每吃一口大一点）；吞下去时鼓一下
    root.scale.setScalar((h.len / (D.buildLen || h.len)) * (1 + .03 * Math.sin(Math.PI * Math.min(1, D.gulp / .15)) * (D.gulp > 0 ? 1 : 0)));
    const A = D.act;
    if (D.kind === 'fire') {
      if (A.Fly) { A.Fly.setEffectiveWeight(h.flyW); A.Fly.setEffectiveTimeScale(h.climbing ? 1.35 : 1); }
      if (A.Glide) A.Glide.setEffectiveWeight(1 - h.flyW);
    } else {
      // 跃出时播 Breach（没有就用 Glide）；游泳动作的速度跟游速走（身上的波和前进速度对得上）
      const air = h.medium === 'air', dash = h.dashT > 0 ? 1 : 0, surf = h.surf || 0, br = air && A.Breach ? 1 : 0;
      const wDash = air ? 0 : dash, wGlide = air ? 1 - br : surf * .5 * (1 - dash), wSwim = Math.max(0, 1 - wDash - wGlide - br);
      const sp = Math.max(.6, Math.min(2.2, h.speed / (S.cfg.cruise || 20)));
      if (A.Swim) { A.Swim.setEffectiveWeight(A.Dash ? wSwim : wSwim + wDash); A.Swim.setEffectiveTimeScale(sp * (A.Dash ? 1 : 1 + dash * .6)); }
      if (A.Dash) { A.Dash.setEffectiveWeight(wDash); A.Dash.setEffectiveTimeScale(Math.max(1, sp * .8)); }
      if (A.Breach) A.Breach.setEffectiveWeight(br);
      if (A.Glide) A.Glide.setEffectiveWeight(wGlide); else if (A.Swim) A.Swim.setEffectiveWeight(1);
      if (!A.Swim && A.Idle) A.Idle.setEffectiveWeight(1);
    }
    undoOverlay(); D.mixer.update(dt);
    if (D.boneScale) for (const n in D.boneScale) { const b = D.bone(n); if (b) b.scale.setScalar(D.boneScale[n]); }
    if (window.__noOverlay) return;
    root.updateMatrixWorld(true);
    U.set(0, 1, 0).applyQuaternion(root.quaternion); F.set(0, 0, 1).applyQuaternion(root.quaternion); Lf.set(1, 0, 0).applyQuaternion(root.quaternion);
    const man = D.man, turn = h.yawRate;
    const neck = man.neckBones || ['neck1', 'neck2', 'head'], tail = man.tailBones || [];
    const nk = D.kind === 'fire' ? .16 : .22;
    for (const n of neck) { rotWorld(n, U, turn * nk); rotWorld(n, Lf, -h.pitch * .18 * (D.kind === 'fire' ? 1 : .5)); }
    for (let i = 0; i < tail.length; i++) rotWorld(tail[i], U, -turn * (D.kind === 'fire' ? .05 : .07));
    // 海龙转弯时身体弯成 C 形
    if (man.spineBones) for (const n of man.spineBones) rotWorld(n, U, turn * .05);
    // 龙吼：抬头张嘴吼 0.9 秒
    if (D.roar > 0) { D.roar = Math.max(0, D.roar - dt); const k = Math.sin(Math.PI * Math.min(1, (.9 - D.roar) / .9)); for (const n of neck) rotWorld(n, Lf, -.28 * k); }
    // 咬：点头（0.08 秒低头、0.12 秒抬回）
    if (D.bite > 0) { D.bite = Math.max(0, D.bite - dt); const k = D.bite > .12 ? (.2 - D.bite) / .08 : D.bite / .12; rotWorld(man.headBone || 'head', Lf, .3 * k); }
    if (D.kind === 'fire' && h.tuck > .01 && man.wingBones) {
      const t = h.tuck, W = man.wingBones;
      rotWorld(W.L[0], U, .85 * t); rotWorld(W.L[0], F, -.3 * t); rotWorld(W.L[1], U, .7 * t); rotWorld(W.L[2], U, .5 * t);
      rotWorld(W.R[0], U, -.85 * t); rotWorld(W.R[0], F, .3 * t); rotWorld(W.R[1], U, -.7 * t); rotWorld(W.R[2], U, -.5 * t);
    }
  };

  D.mouth = out => {
    const hb = D.model && D.bone((D.man && D.man.headBone) || 'head');
    if (!hb) return out.set(root.position.x, root.position.y, root.position.z);
    if (D.mouthLocal) return hb.localToWorld(out.copy(D.mouthLocal));
    hb.getWorldPosition(out); F.set(0, 0, 1).applyQuaternion(root.quaternion);
    return out.addScaledVector(F, .1 * D.scale).addScaledVector(U.set(0, 1, 0).applyQuaternion(root.quaternion), -.012 * D.scale);
  };
  D.forward = out => out.set(0, 0, 1).applyQuaternion(root.quaternion);
  return D;
}

// 克隆带骨骼的场景（three 的 SkeletonUtils.clone 的精简版）
function cloneSkinned(src) {
  const clone = src.clone(true);
  const srcBones = new Map(), cloneBones = new Map();
  const walk = (a, b) => { if (a.isBone) { srcBones.set(a.name, a); cloneBones.set(a.name, b); } for (let i = 0; i < a.children.length; i++) walk(a.children[i], b.children[i]); };
  walk(src, clone);
  const srcMeshes = [], cloneMeshes = [];
  src.traverse(o => o.isSkinnedMesh && srcMeshes.push(o)); clone.traverse(o => o.isSkinnedMesh && cloneMeshes.push(o));
  cloneMeshes.forEach((m, i) => {
    const s = srcMeshes[i];
    m.skeleton = s.skeleton.clone();
    m.bindMatrix.copy(s.bindMatrix);
    m.skeleton.bones = s.skeleton.bones.map(b => cloneBones.get(b.name));
    m.bind(m.skeleton, m.bindMatrix);
  });
  return clone;
}
