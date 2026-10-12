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
// 描边的全局开关（setOutlineMode）：on 一直有 / fade 远处渐渐变细直到没有 / off 全关。所有描边材质共用这个 uniform
// 默认 fade（用户选的）：35 米内有描边，到 110 米渐渐没有
export const OUTLINE = { uOF: { value: new THREE.Vector2(35, 110) }, mats: [], mode: 'fade' };
// 描边颜色往深棕拉（用户：用深棕，不要纯黑）
const OUTLINE_BROWN = new THREE.Color(0x4a2a1a);
export function setOutlineMode(mode) {
  OUTLINE.mode = mode;
  OUTLINE.uOF.value.set(mode === 'fade' ? 35 : 1e5, mode === 'fade' ? 110 : 2e5);
  for (const m of OUTLINE.mats) m.visible = mode !== 'off';
}
export function outlineMat(color, w, { extraPars = '', extraVertex = '', key = '' } = {}) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(OUTLINE_BROWN, .65), side: THREE.BackSide, fog: true });
  m.userData.uW = { value: w };
  m.visible = OUTLINE.mode !== 'off'; OUTLINE.mats.push(m);
  m.onBeforeCompile = sh => {
    sh.uniforms.uW = m.userData.uW; sh.uniforms.uOF = OUTLINE.uOF;
    Object.assign(sh.uniforms, m.userData.extraUniforms || {});
    sh.vertexShader = 'uniform float uW; uniform vec2 uOF;\n' + extraPars + '\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vec3 oN = normal;\n' + extraVertex +
      '\n vec4 oWP = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n oWP = instanceMatrix * oWP;\n#endif\n oWP = modelMatrix * oWP;' +
      '\n float oK = 1.0 - smoothstep(uOF.x, uOF.y, distance(oWP.xyz, cameraPosition));\n transformed += normalize(oN) * uW * oK;');
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
