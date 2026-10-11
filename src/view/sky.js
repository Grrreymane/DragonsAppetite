// 天空、光、雾。水下时由 sea.js 改雾，这里只管天上。
// 天空球：天顶深蓝 → 中段亮蓝 → 地平线的薄雾（朝太阳那边偏暖、背着太阳偏冷）+ 太阳的光盘 / 光晕 + 9 缕高空卷云（云图集里的画）。
// 地平线颜色 = 雾的颜色：本文件一加载就改 three 的雾代码块（ShaderChunk），所有用雾的材质（岛、龙、海底、描边、海、云）
// 都按视线方向把雾染成和天空地平线一样的冷暖，远处的东西和天接得上。水下（雾色离空气雾色远）时不染。
import * as THREE from 'three';
import { loadCloudAtlas, WISPS, aspect } from './cloud-atlas.js';

export const SUN = new THREE.Vector3(-.35, .62, -.7).normalize();
// top 天顶 / upper 中段 / mid 地平线 = 雾色 / warm 朝太阳的地平线 / cool 背太阳的地平线 / sun 太阳
export const SKY = {
  top: new THREE.Color(0x2a63c4), upper: new THREE.Color(0x64a2e6), mid: new THREE.Color(0xcde2ee),
  warm: new THREE.Color(0xf6e2c2), cool: new THREE.Color(0xc0d9ee), bot: new THREE.Color(0xcde2ee), sun: new THREE.Color(0xfff1d0),
};
// 同样的颜色，sRGB 数值（雾是在转 sRGB 之后才混的，雾的染色要用这一套）
const srgb = c => c.clone().convertLinearToSRGB();
export const SKY_SRGB = { mid: srgb(SKY.mid), warm: srgb(SKY.warm), cool: srgb(SKY.cool) };
const v3 = c => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
const SUNXZ = new THREE.Vector2(SUN.x, SUN.z).normalize();

// 视线方向 d → 地平线颜色（线性）。uniform：sunDir, warmC, coolC（天空球自己用）
export const SKY_TINT_GLSL = `
vec3 skyHorizon(vec3 d, vec3 sunDir, vec3 warmC, vec3 coolC){
  vec2 a = d.xz / max(length(d.xz), 1e-4), s = sunDir.xz / max(length(sunDir.xz), 1e-4);
  float k = smoothstep(0.35, 1.0, dot(a, s) * 0.5 + 0.5);
  return mix(coolC, warmC, k * k);
}`;
// 雾的染色（sRGB，常量写死）：fogC = 雾色（sRGB），dir = 视线方向（世界坐标）。雾色就是空气的雾色时按方向染冷暖，水下的雾色不染
export const SKY_FOG_GLSL = `
vec3 skyFogTint(vec3 fogC, vec3 dir){
  vec2 a = dir.xz / max(length(dir.xz), 1e-4);
  float k = smoothstep(0.35, 1.0, dot(a, vec2(${SUNXZ.x.toFixed(4)}, ${SUNXZ.y.toFixed(4)})) * 0.5 + 0.5);
  vec3 mid = ${v3(SKY_SRGB.mid)};
  vec3 hor = mix(${v3(SKY_SRGB.cool)}, ${v3(SKY_SRGB.warm)}, k * k);
  float air = 1.0 - smoothstep(0.03, 0.12, distance(fogC, mid));
  return fogC + (hor - mid) * air;
}`;

// ---- three 的雾代码块：多传一个世界坐标的视线方向，雾色按方向染（只改一次）----
if (!THREE.ShaderChunk.__skyFog) {
  THREE.ShaderChunk.__skyFog = true;
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogDir;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogDir = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogDir;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  ${SKY_FOG_GLSL}
#endif`;
  THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, skyFogTint( fogColor, vFogDir ), fogFactor );
#endif`;
}

const NW = Math.max(1, WISPS.length);   // 卷云贴片数（图集里还没有卷云时着色器也要能编译）
const VERT = 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const FRAG = `uniform vec3 top, upper, warm, cool, sunC, sunD; uniform float uWisp;
uniform sampler2D map; uniform vec4 wRect[${NW}]; uniform vec3 wC[${NW}], wR[${NW}], wU[${NW}]; uniform vec3 wS[${NW}];
varying vec3 vP;
${SKY_TINT_GLSL}
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 d = normalize(vP);
  vec3 ddx = dFdx(d), ddy = dFdy(d);                 // 卷云贴图的取样梯度：在分支外面算（分支里的导数不可靠）
  float h = d.y;
  vec3 hor = skyHorizon(d, sunD, warm, cool);
  // 地平线以下 = 雾色（远处的海融进去）；以上：薄雾带 → 亮蓝 → 天顶
  vec3 c = mix(hor, upper, smoothstep(0.0, 0.3, h));
  c = mix(c, top, smoothstep(0.24, 0.95, h));
  c = mix(c, hor, 1.0 - smoothstep(-0.02, 0.05, h));
  // 太阳：光盘 + 两层光晕 + 太阳那边天空整体暖一点（不做大面积闪白）
  float s = max(dot(d, sunD), 0.0);
  c = mix(c, warm, pow(s, 6.0) * 0.18 * (1.0 - smoothstep(0.1, 0.7, h)));
  c += sunC * (smoothstep(0.99955, 0.9998, s) * 1.4 + pow(s, 260.0) * 0.55 + pow(s, 24.0) * 0.2 + pow(s, 5.0) * 0.06);
  // 高空卷云：几张画好的贴片，贴在天上（无限远，慢慢转）。wC 中心方向、wR / wU 切平面的两个轴、wS = (半宽, 半高, 透明度)
  if (uWisp > 0.0 && h > 0.0) {
    for (int i = 0; i < ${NW}; i++) {
      float fz = dot(d, wC[i]); if (fz < 0.6) continue;
      vec3 S = wS[i];
      vec2 q = vec2(dot(d, wR[i]) / S.x, dot(d, wU[i]) / S.y) / fz * 0.5 + 0.5;
      if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) continue;
      vec4 R = wRect[i];
      vec2 gx = vec2(dot(ddx, wR[i]) / S.x, dot(ddx, wU[i]) / S.y) / fz * 0.5 * R.zw, gy = vec2(dot(ddy, wR[i]) / S.x, dot(ddy, wU[i]) / S.y) / fz * 0.5 * R.zw;
      vec4 t = textureGrad(map, R.xy + q * R.zw, gx, gy);
      float a = t.a * S.z * uWisp * smoothstep(0.03, 0.14, h);
      c = mix(c, mix(t.rgb, vec3(1.0), 0.55), a);     // 偏白（画里是奶油色，天上显得灰）
      c += vec3(0.05, 0.05, 0.04) * a;                 // 再亮一点点：像被太阳照透的薄云
    }
  }
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;   // 抖动：大面积渐变不出色阶
}`;

export function createSky({ scene, renderer }) {
  scene.fog = new THREE.Fog(SKY.mid.clone(), 180, 900);
  const W = WISPS.length ? WISPS : [{ id: '', az: 0, el: 1, w: .1, a: 0 }];
  const wRect = W.map(() => new THREE.Vector4()), wC = W.map(() => new THREE.Vector3()), wR = W.map(() => new THREE.Vector3()), wU = W.map(() => new THREE.Vector3());
  const wS = W.map(w => new THREE.Vector3(Math.tan(w.w / 2) * (w.flip ? -1 : 1), Math.tan(w.w / 2) / aspect(w.id) * .75, w.a));   // 半宽为负 = 左右翻；竖向压扁一点 = 更细的卷云
  const U = {
    top: { value: SKY.top }, upper: { value: SKY.upper }, warm: { value: SKY.warm }, cool: { value: SKY.cool },
    sunC: { value: SKY.sun }, sunD: { value: SUN }, uWisp: { value: 0 },
    map: { value: null }, wRect: { value: wRect }, wC: { value: wC }, wR: { value: wR }, wU: { value: wU }, wS: { value: wS },
  };
  const _up = new THREE.Vector3(0, 1, 0);
  function placeWisps(t) {   // 卷云跟着时间绕天顶慢慢转
    W.forEach((w, i) => {
      const az = w.az + t * .004;
      wC[i].set(Math.cos(w.el) * Math.sin(az), Math.sin(w.el), Math.cos(w.el) * Math.cos(az));
      wR[i].crossVectors(_up, wC[i]).normalize(); wU[i].crossVectors(wC[i], wR[i]);
    });
  }
  placeWisps(0);
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U, vertexShader: VERT, fragmentShader: FRAG });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = -10; sky.name = 'sky'; scene.add(sky);
  {
    const pm = new THREE.PMREMGenerator(renderer), s2 = new THREE.Scene();
    s2.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    scene.environment = pm.fromScene(s2, .02).texture; pm.dispose();
  }
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x6b5a4a, .9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.copy(SUN).multiplyScalar(100); scene.add(sun);
  const ready = loadCloudAtlas().then(a => {
    U.map.value = a.tex;
    WISPS.forEach((w, i) => { const r = a.rect(w.id); wRect[i].set(r[0], r[1], r[2], r[3]); });
    U.uWisp.value = WISPS.length ? 1 : 0;
  }).catch(e => console.warn('云图集加载失败（天上不画卷云）', e && e.message));
  let lastT = -1;
  return {
    sky, hemi, sun, ready,
    update(camera, time) {
      sky.position.copy(camera.position);
      const t = time !== undefined ? time : performance.now() / 1000;
      if (Math.abs(t - lastT) > .05) { lastT = t; placeWisps(t); }
    },
  };
}
