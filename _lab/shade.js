// 共用的材质：卡通分层光照、描边、水下变色
import * as THREE from '../lib/three.module.min.js';
export { THREE };

export const U = {
  time: { value: 0 },
  deep: { value: new THREE.Color(0x0a4a6c) },
};

// 海浪高度：JS 和着色器用同一个公式
export function waveH(x, z, t) {
  return Math.sin(x * 0.045 + t * 1.1) * 1.0 + Math.sin(z * 0.06 - t * 0.85) * 0.8 + Math.sin((x + z) * 0.1 + t * 1.7) * 0.35;
}
export const WAVE_GLSL = 'float waveH(vec2 p, float t){ return sin(p.x*0.045+t*1.1)*1.0 + sin(p.y*0.06-t*0.85)*0.8 + sin((p.x+p.y)*0.1+t*1.7)*0.35; }';

function gradTex(vals) {
  const t = new THREE.DataTexture(new Uint8Array(vals), vals.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
}
export const GRAD = gradTex([105, 180, 255]);

const WATER_V = 'varying vec3 vWP;\n';
const WATER_V_MAIN = `
  { vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
  #endif
    vWP = (modelMatrix * wp4).xyz; }
`;
const WATER_F = `varying vec3 vWP; uniform float uT; uniform vec3 uDeep;
float causF(vec2 p, float t){
  p *= 0.16;
  float a = sin(p.x*1.7 + t*0.9 + sin(p.y*2.3 + t*0.7)*1.3);
  float b = sin(p.y*1.9 - t*0.8 + sin(p.x*1.4 - t*0.6)*1.3);
  return pow(max(0.0, 1.0 - abs(a + b) * 0.8), 5.0);
}
`;
const WATER_F_MAIN = `
  if (vWP.y < 0.0) {
    float dd = clamp(-vWP.y / 55.0, 0.0, 1.0);
    gl_FragColor.rgb += causF(vWP.xz, uT) * (1.0 - dd) * 0.25;
    gl_FragColor.rgb = mix(gl_FragColor.rgb, uDeep, 0.1 + dd * 0.7);
  }
`;

// 给任何材质加上“水下变色 + 焦散光纹”；key 用来区分着色器缓存
export function patch(mat, key, fn) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = U.time; sh.uniforms.uDeep = U.deep;
    sh.vertexShader = WATER_V + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>' + WATER_V_MAIN);
    sh.fragmentShader = WATER_F + sh.fragmentShader.replace('#include <tonemapping_fragment>', WATER_F_MAIN + '\n#include <tonemapping_fragment>');
    if (fn) fn(sh);
  };
  mat.customProgramCacheKey = () => 'w:' + key;
  return mat;
}
export function toon(opts = {}, key = 'toon', fn) {
  return patch(new THREE.MeshToonMaterial({ gradientMap: GRAD, ...opts }), key, fn);
}
export function flatToon(opts = {}, key = 'flat', fn) {
  const m = toon(opts, 'flat:' + key, fn); m.flatShading = true; return m;
}
// 反面外扩的描边
export function hull(color, width = 0.03) {
  const w = { value: width };
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  patch(m, 'hull', sh => {
    sh.uniforms.uHW = w;
    sh.vertexShader = 'uniform float uHW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed += normalize(normal) * uHW;');
  });
  m.userData.w = w;
  return m;
}

// 龙皮：背 / 侧 / 腹三色 + 腹甲纹 + 每种龙自己的花纹（全在着色器里算，边缘干净）
const BODY_F = `
varying vec3 vPat;
uniform vec3 uBack, uSide, uBelly, uMark, uGlow;
uniform float uType, uPlates, uBellyW, uSpots;
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void bodyPattern(inout vec3 dc, inout vec3 em){
  float kind = vPat.z;
  if (kind > 0.5 && kind < 2.5) { if (kind > 1.5) em += dc * 0.6; return; }
  float u = vPat.x, db = vPat.y;
  float aa = max(fwidth(db), 1e-4) * 1.2;
  vec3 c = mix(uSide, uBack, smoothstep(0.68 - aa, 0.68 + aa, db));
  float belly = 1.0 - smoothstep(uBellyW - aa, uBellyW + aa, db);
  vec3 bc = uBelly;
  if (kind < 0.5) {
    float pu = u * uPlates, pa = max(fwidth(pu), 1e-4) * 1.2, pf = fract(pu);
    bc *= 1.0 - 0.16 * smoothstep(0.86 - pa, 0.86 + pa, pf);
    if (uType < 1.5) {            // 海龙：两排发光斑点
      float su = u * uSpots;
      vec2 q1 = vec2(fract(su) - 0.5, (db - 0.5) * 2.6);
      vec2 q2 = vec2(fract(su + 0.5) - 0.5, (db - 0.74) * 2.6);
      float r1 = length(q1), r2 = length(q2), ra = max(fwidth(r1), 1e-4) * 1.2;
      float s = max(1.0 - smoothstep(0.16 - ra, 0.16 + ra, r1), 1.0 - smoothstep(0.1 - ra, 0.1 + ra, r2));
      c = mix(c, uMark, s); em += uGlow * s * 0.9;
    } else if (uType < 2.5) {     // 火龙：背上的虎纹
      float st = sin(u * uSpots * 6.2832);
      float thr = mix(0.92, 0.25, smoothstep(0.55, 1.0, db));
      float sa = max(fwidth(st), 1e-4) * 1.2;
      float s = smoothstep(thr - sa, thr + sa, st) * smoothstep(0.5, 0.6, db);
      c = mix(c, uMark, s);
    } else if (uType < 3.5) {     // 冰龙：霜花点 + 背脊一条亮线
      vec2 g = vec2(u * uSpots * 3.0, db * 14.0), id = floor(g), f = fract(g) - 0.5;
      float h = hash12(id), r = length(f), ra = max(fwidth(r), 1e-4) * 1.2;
      float s = step(0.7, h) * (1.0 - smoothstep(0.2 - ra, 0.2 + ra, r)) * smoothstep(0.45, 0.6, db);
      float ln = smoothstep(0.955 - aa, 0.955 + aa, db);
      c = mix(c, uMark, max(s, ln)); em += uGlow * (s * 0.5 + ln * 0.7);
    } else {                      // 雷龙：身侧的闪电纹
      float z = abs(fract(u * uSpots) - 0.5) * 2.0;
      float center = 0.56 + (z - 0.5) * 0.18;
      float d = abs(db - center), da = max(fwidth(d), 1e-4) * 1.2;
      float s = 1.0 - smoothstep(0.035 - da, 0.035 + da, d);
      c = mix(c, uMark, s); em += uGlow * s * 0.8;
    }
  }
  dc = mix(c, bc, belly);
}
`;
export function bodyMat(P) {
  const C = h => new THREE.Color(h);
  const u = {
    uBack: { value: C(P.back) }, uSide: { value: C(P.side) }, uBelly: { value: C(P.belly) },
    uMark: { value: C(P.mark) }, uGlow: { value: C(P.glow) }, uType: { value: P.type },
    uPlates: { value: P.plates }, uBellyW: { value: P.bellyW }, uSpots: { value: P.spots },
  };
  return toon({ vertexColors: true }, 'body', sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'attribute vec3 aPat; varying vec3 vPat;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vPat = aPat;');
    sh.fragmentShader = BODY_F + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n bodyPattern(diffuseColor.rgb, totalEmissiveRadiance);');
  });
}
