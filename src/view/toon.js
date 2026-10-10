// 卡通描边的共用件：3 级色阶图 + 背面外扩描边材质（主角、岛、生物都用这一套）
import * as THREE from 'three';

export const GRAD = (() => {
  const t = new THREE.DataTexture(new Uint8Array([95, 170, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();

// 背面外扩描边：沿「原始」法线外扩 w（模型自己的单位），在蒙皮 / 实例变换之前做，所以会跟着动作走
// extraVertex：可选的 GLSL，插在外扩之前（生物的扇翅、摆尾要和本体用同一段变形代码）；
//   里面可以改 transformed（位置）和 oN（法线，默认 = 原始 normal）
// 注意：MeshBasicMaterial 没开蒙皮时没有 objectNormal，只能用 normal 属性
export function outlineMat(color, w, { extraPars = '', extraVertex = '', key = '' } = {}) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.userData.uW = { value: w };
  m.onBeforeCompile = sh => {
    sh.uniforms.uW = m.userData.uW;
    Object.assign(sh.uniforms, m.userData.extraUniforms || {});
    sh.vertexShader = 'uniform float uW;\n' + extraPars + '\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vec3 oN = normal;\n' + extraVertex + '\n transformed += normalize(oN) * uW;');
  };
  m.customProgramCacheKey = () => 'outline' + key;
  return m;
}

// 普通的卡通材质（顶点色 / 贴图都行）
export function toonMat(opts = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: GRAD, ...opts });
  if (opts.flatShading) m.flatShading = true;
  return m;
}

// 给一个已有的（静态）网格加描边壳：共用 geometry，挂成子物体
export function addHull(mesh, color, w) {
  const h = new THREE.Mesh(mesh.geometry, outlineMat(color, w));
  h.renderOrder = mesh.renderOrder; mesh.add(h); return h;
}
