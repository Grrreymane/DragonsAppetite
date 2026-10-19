// 天空、光、雾。水下时由 sea.js 改雾，这里只管天上。
// 天空球：天顶深蓝 → 中段亮蓝 → 地平线的薄雾（朝太阳那边偏暖、背着太阳偏冷）+ 太阳的光盘 / 光晕 + 9 片高空卷云（云图集里的画）。
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
// 雾的染色（sRGB）：fogC = 雾色（sRGB），dir = 视线方向（世界坐标）。雾色就是空气的雾色时按方向染冷暖，水下的雾色不染。
// 颜色放在三个共享的 uniform 里（昼夜 / 天气每帧改，见 env.js）：skyFogW = (暖边 rgb, 有效 1)，skyFogC = (冷边 rgb, 太阳方向 x)，
// skyFogM = (空气雾色 rgb, 太阳方向 z)。值是 Float32Array：three 克隆 uniform 时数组按引用共享，所有材质跟着一起变。
// 没拿到这三个 uniform 的材质（w = 0）退回写死的白天颜色。
export const SKY_FOG_GLSL = `
uniform vec4 skyFogW, skyFogC, skyFogM;
vec3 skyFogTint(vec3 fogC, vec3 dir){
  vec2 a = dir.xz / max(length(dir.xz), 1e-4);
  bool ok = skyFogW.w > 0.5;
  vec2 s = ok ? vec2(skyFogC.w, skyFogM.w) : vec2(${SUNXZ.x.toFixed(4)}, ${SUNXZ.y.toFixed(4)});
  float k = smoothstep(0.35, 1.0, dot(a, s) * 0.5 + 0.5);
  vec3 mid = ok ? skyFogM.rgb : ${v3(SKY_SRGB.mid)};
  vec3 hor = ok ? mix(skyFogC.rgb, skyFogW.rgb, k * k) : mix(${v3(SKY_SRGB.cool)}, ${v3(SKY_SRGB.warm)}, k * k);
  float air = 1.0 - smoothstep(0.03, 0.12, distance(fogC, mid));
  return fogC + (hor - mid) * air;
}`;
// 共享的雾染色数值（env.js 每帧写）。先填白天的值
export const FOG_U = { skyFogW: { value: new Float32Array(4) }, skyFogC: { value: new Float32Array(4) }, skyFogM: { value: new Float32Array(4) } };
export function setFogTint(warmL, coolL, midL, sunDir) {   // 线性颜色 → sRGB 写进共享数组
  const w = FOG_U.skyFogW.value, c = FOG_U.skyFogC.value, m = FOG_U.skyFogM.value, t = _fc;
  t.copy(warmL).convertLinearToSRGB(); w[0] = t.r; w[1] = t.g; w[2] = t.b; w[3] = 1;
  t.copy(coolL).convertLinearToSRGB(); c[0] = t.r; c[1] = t.g; c[2] = t.b;
  t.copy(midL).convertLinearToSRGB(); m[0] = t.r; m[1] = t.g; m[2] = t.b;
  const l = Math.hypot(sunDir.x, sunDir.z) || 1; c[3] = sunDir.x / l; m[3] = sunDir.z / l;
}
const _fc = new THREE.Color();
setFogTint(SKY.warm, SKY.cool, SKY.mid, SUN);
// 所有带雾的内置材质（ShaderLib）和自己写的着色器（合并 UniformsLib.fog）都带上这三个 uniform
for (const lib of [THREE.UniformsLib.fog, ...Object.values(THREE.ShaderLib).map(s => s.uniforms)]) if (lib && lib.fogColor) Object.assign(lib, FOG_U);

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
uniform float uSunK, uStar, uBow, uOver, uFlash, uT; uniform vec4 uMoon; uniform vec3 wispC, overC;
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
  // 阴天：整片天往灰里压（地平线以上）
  c = mix(c, overC * mix(1.0, 0.82, smoothstep(0.0, 0.8, h)), uOver * 0.85);
  // 星星：天球按方向分格，每格一颗，亮度不同、慢慢闪；地平线附近和阴天看不见
  if (uStar > 0.0 && h > 0.0) {
    vec3 q = d * 160.0, gi = floor(q), f = fract(q) - 0.5;
    float r = hash12(gi.xy + gi.z * 7.31), r2 = hash12(gi.yz + 3.7);
    vec3 o = vec3(r - 0.5, r2 - 0.5, hash12(gi.zx + 1.3) - 0.5) * 0.6;
    float sz = mix(0.05, 0.16, r2 * r2) * (1.0 + 0.9 * step(0.985, r));
    float st = (1.0 - smoothstep(sz * 0.4, sz, length(f - o))) * step(0.72, r);
    st *= 0.6 + 0.4 * sin(uT * (1.0 + r * 3.0) + r2 * 40.0);
    // 银河：一条斜着的淡淡的光带
    float band = exp(-pow(dot(d, normalize(vec3(0.5, 0.35, -0.8))) * 5.0, 2.0)) * (0.6 + 0.4 * sin(d.x * 23.0 + sin(d.z * 17.0) * 2.0) * sin(d.z * 19.0 - d.y * 11.0));
    c += (vec3(0.95, 0.97, 1.0) * st * 1.4 + vec3(0.18, 0.2, 0.32) * band * 0.12) * uStar * smoothstep(0.02, 0.25, h) * (1.0 - uOver);
  }
  // 太阳：光盘 + 两层光晕 + 太阳那边天空整体暖一点（不做大面积闪白）；落到地平线以下就没了
  float s = max(dot(d, sunD), 0.0), sk = uSunK * (1.0 - uOver) * smoothstep(-0.06, 0.0, h);
  c = mix(c, warm, pow(s, 6.0) * 0.18 * (1.0 - smoothstep(0.1, 0.7, h)) * uSunK);
  c += sunC * (smoothstep(0.99955, 0.9998, s) * 1.4 + pow(s, 260.0) * 0.55 + pow(s, 24.0) * 0.2 + pow(s, 5.0) * 0.06) * sk;
  // 月亮：浅色的圆 + 几块暗斑 + 一圈淡淡的光晕
  if (uMoon.w > 0.0) {
    float m = dot(d, uMoon.xyz);
    float disc = smoothstep(0.99935, 0.99955, m);
    vec3 mr = normalize(cross(uMoon.xyz, vec3(0.0, 1.0, 0.0))), mu = cross(mr, uMoon.xyz);
    vec2 mq = vec2(dot(d, mr), dot(d, mu)) * 33.0;
    float spot = smoothstep(0.32, 0.2, length(mq - vec2(0.25, 0.3))) * 0.5 + smoothstep(0.22, 0.1, length(mq - vec2(-0.35, -0.15))) * 0.4 + smoothstep(0.15, 0.05, length(mq - vec2(0.1, -0.45))) * 0.4;
    c = mix(c, vec3(1.0, 0.98, 0.9) * (1.0 - spot * 0.35), disc * uMoon.w * (1.0 - uOver * 0.7));
    c += vec3(0.5, 0.6, 0.9) * (pow(max(m, 0.0), 300.0) * 0.35 + pow(max(m, 0.0), 30.0) * 0.08) * uMoon.w * (1.0 - uOver * 0.5);
  }
  // 彩虹：太阳背面一道 42° 的弧（太阳太高时把「反日点」压到地平线下 10°，总能看到一大道）
  if (uBow > 0.0 && h > -0.02) {
    vec3 anti = normalize(vec3(-sunD.x, max(-sunD.y, -0.17), -sunD.z));
    float ang = acos(clamp(dot(d, anti), -1.0, 1.0)) * 57.2958;
    float t = (ang - 40.0) / 3.2;                                    // 0..1 = 紫 → 红
    vec3 bow = clamp(vec3(abs(t * 6.0 - 3.0) - 1.0, 2.0 - abs(t * 6.0 - 2.0), 2.0 - abs(t * 6.0 - 4.0)), 0.0, 1.0);
    float bk = smoothstep(-0.15, 0.1, t) * (1.0 - smoothstep(0.9, 1.15, t)) * smoothstep(-0.02, 0.12, h) * (1.0 - smoothstep(0.35, 0.75, h));
    c = mix(c, c + bow * 0.55, bk * uBow);
    c = mix(c, c * 1.06 + 0.03, smoothstep(0.1, -0.6, t) * smoothstep(-2.5, -0.6, t) * uBow * smoothstep(0.0, 0.1, h));   // 弧里面亮一点
  }
  c += vec3(0.75, 0.8, 1.0) * uFlash * (0.4 + 0.6 * smoothstep(-0.1, 0.4, h));   // 闪电
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;   // 抖动：大面积渐变不出色阶
}`;

export function createSky({ scene }) {   // 不做 PMREM：材质全是卡通的，没人用它
  scene.fog = new THREE.Fog(SKY.mid.clone(), 180, 900);
  const W = WISPS.length ? WISPS : [{ id: '', az: 0, el: 1, w: .1, a: 0 }];
  const wRect = W.map(() => new THREE.Vector4()), wC = W.map(() => new THREE.Vector3()), wR = W.map(() => new THREE.Vector3()), wU = W.map(() => new THREE.Vector3());
  const wS = W.map(w => new THREE.Vector3(Math.tan(w.w / 2) * (w.flip ? -1 : 1), Math.tan(w.w / 2) / aspect(w.id) * .75, w.a));   // 半宽为负 = 左右翻；竖向压扁一点 = 更细的卷云
  const U = {
    top: { value: SKY.top }, upper: { value: SKY.upper }, warm: { value: SKY.warm }, cool: { value: SKY.cool },
    sunC: { value: SKY.sun }, sunD: { value: SUN.clone() }, uWisp: { value: 0 },
    uSunK: { value: 1 }, uStar: { value: 0 }, uBow: { value: 0 }, uOver: { value: 0 }, uFlash: { value: 0 }, uT: { value: 0 },
    uMoon: { value: new THREE.Vector4(0, 1, 0, 0) }, wispC: { value: new THREE.Color(1, 1, 1) }, overC: { value: new THREE.Color(0x8a96a4) },
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
  const hemi = new THREE.HemisphereLight(0xdcecff, 0x6b5a4a, .9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6); sun.position.copy(SUN).multiplyScalar(100); scene.add(sun);
  const ready = loadCloudAtlas().then(a => {
    U.map.value = a.tex;
    WISPS.forEach((w, i) => { const r = a.rect(w.id); wRect[i].set(r[0], r[1], r[2], r[3]); });
    U.uWisp.value = WISPS.length ? 1 : 0;
  }).catch(e => console.warn('云图集加载失败（天上不画卷云）', e && e.message));
  let lastT = -1;
  return {
    sky, hemi, sun, ready, U,
    update(camera, time) {
      sky.position.copy(camera.position);
      const t = time !== undefined ? time : performance.now() / 1000;
      if (Math.abs(t - lastT) > .05) { lastT = t; placeWisps(t); }
      U.uT.value = t;
    },
  };
}
