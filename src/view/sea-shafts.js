// 水下的光柱：从海面斜着照下来的一道道淡光（顺着折射后的太阳方向）。实例化，一次绘制，叠加混合。
// 光柱钉在世界的格子上（12 米一格，镜头周围 12×12 格，约一半的格子有光柱），所以镜头动时光柱不跟着走。
// 只在镜头在水下时画；越深越淡，离镜头近的淡掉（不会糊一脸），慢慢摆、慢慢明暗（不闪）。
import * as THREE from 'three';

const G = 12, CELL = 12;

const VERT = `attribute vec2 aCell; uniform vec2 uCell; uniform vec3 uDir; uniform float uT;
varying vec2 vUv; varying float vA; varying float vDist;
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 c = uCell + aCell;
  float on = step(h1(c + 0.7), 0.5);
  vec2 base = (c + vec2(h1(c + 1.3), h1(c + 7.1))) * ${CELL.toFixed(1)};
  base += vec2(sin(uT * 0.21 + h1(c) * 6.0), cos(uT * 0.17 + h1(c + 2.0) * 6.0)) * 1.5;
  float w = mix(2.0, 6.5, h1(c + 3.7)), len = mix(28.0, 55.0, h1(c + 5.1));
  vec3 top = vec3(base.x, 0.3, base.y);
  vec3 toCam = normalize(cameraPosition - top);
  vec3 side = normalize(cross(uDir, toCam));
  vec3 wp = top + side * position.x * w * on + uDir * position.y * len;
  vUv = vec2(position.x + 0.5, position.y);
  vA = on * (0.55 + 0.45 * sin(uT * 0.45 + h1(c + 9.0) * 6.28));
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `uniform vec3 uCol; uniform float uK; varying vec2 vUv; varying float vA; varying float vDist;
void main(){
  float x = 1.0 - abs(vUv.x * 2.0 - 1.0);
  float a = x * x * pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.05, vUv.y);
  a *= smoothstep(3.0, 12.0, vDist) * (1.0 - smoothstep(30.0, 85.0, vDist));
  gl_FragColor = vec4(uCol * a * vA * uK, 1.0);
}`;

export function createShafts(sunW) {
  const quad = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const geo = new THREE.InstancedBufferGeometry().copy(quad);
  const cells = new Float32Array(G * G * 2);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) cells.set([i - G / 2, j - G / 2], (j * G + i) * 2);
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  geo.instanceCount = G * G;
  const U = { uCell: { value: new THREE.Vector2() }, uDir: { value: sunW.clone().negate() }, uT: { value: 0 }, uCol: { value: new THREE.Color(0xbff6f0) }, uK: { value: 0 } };
  const mat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.name = 'seaShafts'; mesh.renderOrder = 3; mesh.visible = false;
  return {
    mesh,
    // k：水下程度 0..1；depth：镜头在水面下多深
    update(cam, time, k, depth) {
      mesh.visible = k > 0;
      if (!mesh.visible) return;
      // 光柱的顶在海面，镜头在其下方：把格子中心挪到镜头的水平位置往太阳反方向偏一点（往前看的光柱更多）
      U.uCell.value.set(Math.round((cam.x - U.uDir.value.x * depth) / CELL), Math.round((cam.z - U.uDir.value.z * depth) / CELL));
      U.uT.value = time;
      U.uK.value = k * .22 * (1 - Math.min(1, Math.max(0, (depth - 10) / 70)) * .75);
    },
  };
}
