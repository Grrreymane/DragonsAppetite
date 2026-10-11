// 岸线场：把镜头周围 1536×1536 米里「海平面上哪儿是岛」画成一张俯视图（512×512，每格 3 米），再模糊成两档距离场。
// 海面着色器据此画岛边的浅水色带、贴岸的白沫和往岸上推的浪线。和岛的模型无关（精模、剖面岛都行）：
// 正交相机从高处往下看，只画岛的网格、只画 y > 0.2 的部分 = 岛露出水面的轮廓（不要求模型是封闭的）。
// 区域中心放在镜头前方 300 米（前面看得远、后面看不到）；中心要挪 96 米以上才重画，另外每秒看一眼岛的网格变没变（精模是后加载的）。
import * as THREE from 'three';
import { islands, wrapP } from '../sim/world.js';

export const SHORE_RES = 512, SHORE_SIZE = 1536;
const LAYER = 30;
const TAPS = 12;
const AHEAD = 300;

function gauss(sig) {
  const w = []; let s = 0;
  for (let i = -TAPS; i <= TAPS; i++) { const v = Math.exp(-i * i / (2 * sig * sig)); w.push(v); s += v; }
  return w.map(v => v / s);
}

export function createShore(renderer, scene, exclude = []) {
  const opt = { depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping };
  const rtMask = new THREE.WebGLRenderTarget(SHORE_RES, SHORE_RES, { ...opt, depthBuffer: true });
  const rtA = new THREE.WebGLRenderTarget(SHORE_RES, SHORE_RES, opt), rtB = new THREE.WebGLRenderTarget(SHORE_RES, SHORE_RES, opt);
  const H = SHORE_SIZE / 2;
  const TOPY = 600, CLIPY = .2;
  const cam = new THREE.OrthographicCamera(-H, H, H, -H, .01, TOPY - CLIPY);
  cam.up.set(0, 0, -1); cam.layers.set(LAYER);
  const maskMat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main(){ gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); }',
  });
  // 分离的高斯模糊：R = 窄（岸边白沫，σ ≈ 6 米），G = 宽（浅水色带，σ ≈ 16 米）
  const wS = gauss(2), wL = gauss(5.3);
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, dir: { value: new THREE.Vector2() }, wS: { value: wS }, wL: { value: wL }, first: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `uniform sampler2D map; uniform vec2 dir; uniform float wS[${TAPS * 2 + 1}], wL[${TAPS * 2 + 1}]; uniform float first; varying vec2 vUv;
      void main(){
        float s = 0.0, l = 0.0;
        for (int i = 0; i < ${TAPS * 2 + 1}; i++) {
          vec4 t = texture2D(map, vUv + dir * float(i - ${TAPS}));
          s += t.r * wS[i]; l += (first > 0.5 ? t.r : t.g) * wL[i];
        }
        gl_FragColor = vec4(s, l, 0.0, 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMat); quad.frustumCulled = false; quadScene.add(quad);

  const center = new THREE.Vector2(1e9, 1e9);
  let lastSig = -1;
  const api = {
    tex: rtB.texture,
    region: new THREE.Vector4(0, 0, SHORE_SIZE, 0),     // x, z = 中心；z = 边长；w = 1 已经画好
    lastT: -1e9, count: 0,
    // fwd：镜头朝向（可选）。区域中心 = 镜头水平位置 + 朝向 × 300 米
    update(camPos, time, fwd) {
      let ax = camPos.x, az = camPos.z;
      if (fwd) { const l = Math.hypot(fwd.x, fwd.z); if (l > .05) { ax += fwd.x / l * AHEAD; az += fwd.z / l * AHEAD; } }
      const moved = Math.max(Math.abs(ax - center.x), Math.abs(az - center.y)) > 96;
      if (!moved && time - api.lastT < 1) return;
      api.lastT = time;
      if (moved) center.set(Math.round(ax / 48) * 48, Math.round(az / 48) * 48);
      // 每秒看一眼岛的网格有没有变（精模是后加载的、岛换了一份循环的位置）；变了或者走远了才重画（换 LOD 不重画）
      pick();
      let sig = picked.length;
      for (const o of picked) sig = (sig * 31 + o.id + Math.round(o.matrixWorld.elements[12]) * 7 + Math.round(o.matrixWorld.elements[14]) * 13) % 1e9;
      if (!moved && sig === lastSig) return;
      lastSig = sig;
      render();
      api.region.set(center.x, center.y, SHORE_SIZE, 1);
    },
    dispose() { for (const r of [rtMask, rtA, rtB]) r.dispose(); maskMat.dispose(); blurMat.dispose(); quad.geometry.dispose(); },
  };

  // 挑岛的网格：包围球中心离某座岛（最近的那一份）中心不远、球不小；不要实例 / 蒙皮 / 半透明的
  const picked = [], _s = new THREE.Sphere();
  function pick() {
    picked.length = 0;
    const near = [];
    for (const is of islands) {
      const x = center.x + wrapP(is.x - center.x), z = center.y + wrapP(is.z - center.y);
      if (Math.abs(x - center.x) < H + is.r && Math.abs(z - center.y) < H + is.r) near.push({ x, z, r: is.r });
    }
    if (!near.length) return;
    scene.traverseVisible(o => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.geometry || exclude.includes(o)) return;
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && (m.transparent || m.blending === THREE.AdditiveBlending || m.side === THREE.BackSide)) return;   // 描边壳不用画
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) return;
      _s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
      if (_s.center.y - _s.radius > 1 || _s.center.y + _s.radius < -1) return;      // 不跨海平面的不要
      for (const n of near) if (Math.hypot(_s.center.x - n.x, _s.center.z - n.z) < n.r * .6 + 6 && _s.radius > n.r * .3) { picked.push(o); break; }
    });
  }
  function render() {
    const prevRT = renderer.getRenderTarget(), prevBg = scene.background, prevOv = scene.overrideMaterial, prevAuto = renderer.autoClear;
    const cc = new THREE.Color(); renderer.getClearColor(cc); const ca = renderer.getClearAlpha();
    const added = [];
    for (const o of picked) if (!o.layers.isEnabled(LAYER)) { o.layers.enable(LAYER); added.push(o); }
    cam.position.set(center.x, TOPY, center.y); cam.lookAt(center.x, 0, center.y); cam.updateMatrixWorld();
    scene.background = null; scene.overrideMaterial = maskMat; renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(rtMask); renderer.clear(); if (picked.length) renderer.render(scene, cam);
    scene.overrideMaterial = prevOv; scene.background = prevBg;
    for (const o of added) o.layers.disable(LAYER);
    // 模糊：横 → 纵
    const px = 1 / SHORE_RES;
    blurMat.uniforms.map.value = rtMask.texture; blurMat.uniforms.dir.value.set(px, 0); blurMat.uniforms.first.value = 1;
    renderer.setRenderTarget(rtA); renderer.render(quadScene, quadCam);
    blurMat.uniforms.map.value = rtA.texture; blurMat.uniforms.dir.value.set(0, px); blurMat.uniforms.first.value = 0;
    renderer.setRenderTarget(rtB); renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(prevRT); renderer.setClearColor(cc, ca); renderer.autoClear = prevAuto;
    api.count = picked.length;
  }
  api.picked = picked; api.rt = rtB;
  if (typeof location !== 'undefined' && /[?&](debug|rec)/.test(location.search)) window.__shore = api;   // 调试 / 录像脚本用
  return api;
}
