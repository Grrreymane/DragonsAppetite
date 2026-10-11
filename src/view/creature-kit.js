// 生物的通用规矩（GDD §9.1）：低多边形 + 每面一色（±4% 抖动）+ 卡通色阶 + 背面外扩描边 + 顶点着色器动画。
// 以后要改生物的统一画法，就改这里，所有生物一起变。
//
// 几何约定：局部坐标 前 = +Z、上 = +Y，模型归一化成「体长 = 1」，每个个体按 c.size × 显示放大 缩放。
// 顶点属性：
//   position、normal（按部件平滑的法线：描边外扩用）、sN（明暗用的法线：身体 = 平滑，鳍 / 翅 = 面法线）
//   color（每面一色）、aP（vec4，动画参数，含义按动画类型，见 DEFORM；aP.w = 自发光）
// 每个个体的属性（InstancedBufferAttribute，挂在 geometry 上，本体和描边共用）：
//   iA = (相位, 力度, 个体随机 0..1, 状态)   状态 = 眼睛（0 普通 / 1 害怕 / 2 晕 / 3 烤熟）+ 金色 ? 8 : 0 + 正在烤 0..1 × 0.8
//   iC = (换色 rgb, 换色量)
//   iB = (害怕 0..1, 0, 0, 0)   害怕的姿势：鸟收翅、鱼弯身、水母缩伞、海龟缩头（顶点着色器里做，描边跟着走）
import * as THREE from 'three';
import { makeRng } from '../sim/rng.js';

// ---------- 动画类型 ----------
export const KIND = { bird: 0, fish: 1, manta: 2, jelly: 3, squid: 4, turtle: 5 };
export const EYE = { normal: 0, fear: 1, daze: 2, roast: 3 };
export const OUT_MIN_PX = 1.6;                   // 描边在屏幕上最细几个 CSS 像素（身体本身太小时再按比例收细，见 hullMat）

// 顶点变形：本体和描边用同一段（描边的外扩在变形之后做，所以会跟着翅膀走）
// uK = (动画类型, 眼睛类型, 眼睛朝向 0 侧面 / 1 正面, 腮红 0..1)；uP / uQ = 各类型自己的参数（见每个分支的注释）
// 相位：JS 按 4π 取模（只有 0.5 倍的项要用到 4π），鱿鱼的相位会整圈跳，所以鱿鱼分支只用整数倍
export const DEFORM_PARS = /* glsl */`
attribute vec4 aP;
attribute vec4 iA;
attribute vec4 iC;
attribute vec4 iB;
uniform vec4 uK, uP, uQ;
uniform float uT, uPx;
vec2 cr2(vec2 v, float a){ float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
void crRotXY(inout vec3 p, inout vec3 n, vec2 o, float a){ p.xy = o + cr2(p.xy - o, a); n.xy = cr2(n.xy, a); }
void crRotXZ(inout vec3 p, inout vec3 n, vec2 o, float a){ p.xz = o + cr2(p.xz - o, a); n.xz = cr2(n.xz, a); }
void crDeform(inout vec3 p, inout vec3 n){
  float ph = iA.x, fl = iA.y, k = uK.x, fe = iB.x;
  if (k < 0.5) {
    // 鸟：aP.x 左右（±1），aP.y 0 身体 / 1 内翼 / 2 外翼 / 3 尾巴。uP = (肩 x, 肩 y, 肘 x, 身体起伏)，uQ = (内翼幅度, 外翼幅度, 外翼滞后, 平举角)
    // 害怕：翅膀往下垂、往后收（缩成一团）
    float s = aP.x, g = aP.y;
    if (g > 0.5 && g < 2.5) {
      if (g > 1.5) crRotXY(p, n, vec2(s * uP.z, uP.y), s * (sin(ph - uQ.z) * uQ.y * fl - fe * 0.6));
      crRotXY(p, n, vec2(s * uP.x, uP.y), s * (uQ.w - fe * 0.4 + sin(ph) * uQ.x * fl));
      crRotXZ(p, n, vec2(s * uP.x, 0.0), -s * fe * 0.6);
    } else if (g > 2.5) {
      p.y += sin(ph - 1.2) * 0.02 * fl * aP.z;     // 尾巴跟着轻轻上下
    }
    p.y -= cos(ph) * fl * uP.w;
  } else if (k < 1.5) {
    // 鱼：aP.x 摆尾权重（头 0 → 尾 1），aP.y = 1 胸鳍，aP.z 胸鳍左右。uP = (波数, 摆幅, 0, 0)，uQ = (鳍根 x, 鳍根 y, 鳍扇幅度, 鳍平举角)
    if (aP.y > 0.5) { float s = aP.z; crRotXY(p, n, vec2(s * uQ.x, uQ.y), s * (uQ.w + sin(ph * 2.0) * uQ.z * (0.25 + fl))); }
    float a = ph + p.z * uP.x, w = aP.x * fl * uP.y;
    p.x += sin(a) * w + fe * 0.16 * aP.x * aP.x * (iA.z > 0.5 ? 1.0 : -1.0);   // 害怕：身体弯成 C 字
    n.xz = cr2(n.xz, -cos(a) * w * uP.x);
  } else if (k < 2.5) {
    // 蝠鲼：aP.x 翼展权重（中线 0 → 翼尖 1），aP.y 尾巴权重，aP.z 左右。uP = (波数, 翼幅, 尾幅, 0)
    float a = ph + p.z * uP.x, w = aP.x, A = uP.y * (0.35 + fl * 0.65);
    p.y += sin(a) * A * w * sqrt(w);
    n.xy = cr2(n.xy, aP.z * atan(1.5 * A * sqrt(w) * sin(a)));
    p.x += sin(ph * 0.5 + p.z * 5.0) * uP.z * aP.y;
  } else if (k < 3.5) {
    // 水母 / 云水母：aP.x 伞盖权重（顶 0 → 边 1），aP.y 触手 / 飘带权重（根 0 → 梢 1），aP.z 每根的相位。uP = (收缩幅度, 伞边下沉, 飘带摆幅, 0)
    float c = mix(0.5 + 0.5 * sin(ph), 1.0, fe * 0.7);     // 害怕：伞缩紧、触手收拢
    p.xz *= 1.0 - uP.x * c * max(aP.x, aP.y > 0.0 ? 0.7 : 0.0);
    p.y -= uP.y * c * aP.x;
    // 触手：一道波从根往梢走（不是整根一起往一边摆），梢上摆得大
    float o = aP.z + iA.z * 6.2832, r = aP.y;
    p.x += sin(ph * 0.5 + o - r * 4.2) * uP.z * r;
    p.z += cos(ph * 0.5 + o * 1.3 - r * 3.6) * uP.z * r;
  } else if (k < 4.5) {
    // 鱿鱼：aP.x 外套膜权重，aP.y 触手权重（根 0 → 梢 1），aP.z 触手角度。uP = (收缩幅度, 触手张开, 触手摆幅, 0)
    // 相位约定：sin(ph) = 1 时外套膜收得最紧（JS 已经把喷射的那一刻对到这里）
    float c = 0.5 + 0.5 * sin(ph);
    p.xy *= 1.0 - uP.x * c * aP.x;
    float r = aP.y;
    vec2 dir = vec2(sin(aP.z), cos(aP.z));
    p.xy += dir * uP.y * (1.0 - c) * r;
    p.x += sin(ph + aP.z * 3.0 + r * 3.0) * uP.z * r;
    p.y += cos(ph + aP.z * 1.7 + r * 2.5) * uP.z * r;
  } else {
    // 海龟：aP.x 左右，aP.y 1 前鳍 / 2 后鳍 / 3 头。uP = (前鳍根 x, 鳍根 y, 前鳍根 z, 后鳍根 x)，uQ = (前鳍上下幅度, 前鳍前后幅度, 后鳍幅度, 0)
    float s = aP.x, g = aP.y;
    if (g > 0.5 && g < 1.5) {
      crRotXZ(p, n, vec2(s * uP.x, uP.z), s * cos(ph) * uQ.y * fl);
      crRotXY(p, n, vec2(s * uP.x, uP.y), s * sin(ph) * uQ.x * fl);
    } else if (g > 1.5 && g < 2.5) {
      crRotXY(p, n, vec2(s * uP.w, uP.y), s * sin(ph + 1.6) * uQ.z * fl);
    } else if (g > 2.5) {
      p.y += sin(ph * 0.5) * 0.012;
      p.z -= fe * 0.08;                                   // 害怕：缩头
    }
  }
}
`;

// 本体的换色（金色 / 烤熟）：保留明暗（肚子比背亮），只换色相；不超过 1（超了在 ACES 下发白）
// 金色：暗处是深琥珀 #c07a10，亮处是 iC 的金色（有厚度，不是一片柠檬黄）
const TINT = /* glsl */`
{ float l = sqrt(dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722)));
  vec3 tc = iA.w > 7.5 ? mix(vec3(0.527, 0.195, 0.0052), iC.rgb, smoothstep(0.08, 0.95, l)) : iC.rgb * (0.42 + 0.78 * l);
  vColor.rgb = mix(vColor.rgb, min(tc, vec3(1.0)), iC.a); }
`;

// 雾：生物比场景的雾淡一些（远处、水下的猎物不糊进雾里），到雾的尽头再和场景一样全进雾（晕星 / 闪星也用这个）
export const FOG = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  fogFactor *= 0.68 + 0.32 * fogFactor * fogFactor * fogFactor;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

// 片元：自发光（换色时一起换）、金色的流光、烤熟的烤痕、眼睛（不占三角面，边缘干净）
// uEye = (|x|, y, z, 半径)，半径 0 = 没眼睛；uK.y：1 普通（大黑眼 + 浅色眼圈 + 两个高光）/ 2 天敌（红眼 + 怒眉切角）
// 眼睛状态（vFx.x）：1 害怕（大眼白 + 小瞳孔）/ 2 晕（转圈的螺旋）/ 3 烤熟（× 眼）
const FRAG_PARS = /* glsl */`
uniform vec4 uK, uEye;
uniform float uT;
varying vec3 vLoc;
varying float vGlow;
varying vec4 vFx;
varying float vRim;
varying float vHeat;
`;
const FRAG_FX = /* glsl */`
totalEmissiveRadiance *= 1.0 - vFx.w;
float crR = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
// 正在被火烤：本身的颜色只乘一点暖色（黑的还是黑、粉的还是粉，不会变成一片浅橙、不会像金色），
// 「烫」主要靠边缘透出的红橙热光（像烧红的边，不带黄）
// 浅色的（粉色云水母）光往上加红是加不出来的（已经很亮了），所以边缘这一圈的本色也往深红橙换一点（越浅换得越多）
{ float crH = vHeat * smoothstep(0.36, 0.78, crR);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(1.2, 0.68, 0.45), vHeat * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.2, 0.04), min(1.0, crH * (0.55 + 0.75 * dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)))));
  totalEmissiveRadiance *= 1.0 - 0.6 * vHeat;
  totalEmissiveRadiance += vec3(1.0, 0.28, 0.04) * (vHeat * 0.06 + crH * 0.75); }
totalEmissiveRadiance += diffuseColor.rgb * vGlow;
{ // 轮廓光：身体朝上的边缘亮一道（卡通的硬边），只在近处（屏幕上够大）才有，远处的小鸟小鱼保持干净的剪影
  float crRim = smoothstep(0.58, 0.66, crR) * smoothstep(-0.25, 0.45, normal.y) * vRim;
  totalEmissiveRadiance += (diffuseColor.rgb * 0.45 + vec3(0.12, 0.115, 0.1)) * crRim;
}
float crState = floor(vFx.x + 0.5);
if (crState > 2.5) {          // 烤熟：斜着的烤痕 + 背上焦一点
  float gq = (vLoc.z - vLoc.y * 0.7) * 7.0, gm = abs(fract(gq) - 0.5), ga = fwidth(gq) + 1e-4;
  diffuseColor.rgb *= 1.0 - 0.42 * (1.0 - smoothstep(0.1 - ga, 0.1 + ga, gm));
  diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.0, 0.25, vLoc.y);
}
if (vFx.y > 0.5) {            // 金色：一道亮光慢慢扫过身体（约 2 秒一次，不闪）
  float sw = fract(uT * 0.5 + vFx.z) * 2.8 - 1.4;
  float bd = vLoc.z * 0.9 + vLoc.y * 0.6 + vLoc.x * 0.25 - sw;
  totalEmissiveRadiance += vec3(1.0, 0.9, 0.6) * exp(-bd * bd * 60.0) * 0.75 + diffuseColor.rgb * 0.14;
}
if (uEye.w > 0.0) {
  vec3 q = vLoc; q.x = abs(q.x);
  vec3 dq = q - uEye.xyz;
  float r = uEye.w, d = length(dq), aa = fwidth(d) * 0.75 + 1e-5;
  float e = 1.0 - smoothstep(r - aa, r + aa, d);
  bool pred = uK.y > 1.5;
  vec2 uv = (uK.z > 0.5 ? vec2(dq.x, dq.y) : vec2(dq.z, dq.y)) / r;
  float ad = length(uv), av = aa / r;
  if (pred && crState < 1.5) e *= smoothstep(-aa, aa, r * 0.22 - (dq.y + dq.z * 0.75));
  vec3 ink = vec3(0.025, 0.02, 0.035), wht = vec3(0.97, 0.96, 0.92);
  vec3 ec; float hl = 1.0;
  if (crState > 2.5) {
    float xd = min(abs(uv.x - uv.y), abs(uv.x + uv.y)) * 0.7071;
    float xx = (1.0 - smoothstep(0.17 - av, 0.17 + av, xd)) * (1.0 - smoothstep(0.82 - av, 0.82 + av, ad));
    ec = mix(diffuseColor.rgb, ink, xx); hl = 0.0;
  } else if (crState > 1.5) {
    float sp = fract(ad * 2.3 - atan(uv.y, uv.x) * 0.15915 + uT * 0.6), sa = fwidth(ad * 2.3) + 0.02;
    float ln = smoothstep(0.38 - sa, 0.38 + sa, sp) * (1.0 - smoothstep(0.66 - sa, 0.66 + sa, sp));
    ec = mix(wht, ink, max(ln, smoothstep(0.84 - av, 0.84 + av, ad))); hl = 0.0;
  } else if (crState > 0.5) {
    float pd = length(uv - vec2(0.08, 0.0));
    ec = mix(ink, wht, smoothstep(0.3 - av, 0.3 + av, pd));
    ec = mix(ec, ink, smoothstep(0.86 - av, 0.86 + av, ad)); hl = 0.5;
  } else if (pred) {
    ec = mix(vec3(0.03, 0.0, 0.0), vec3(0.98, 0.16, 0.06), smoothstep(0.42 - av, 0.42 + av, ad));
    ec = mix(ec, vec3(0.2, 0.02, 0.0), smoothstep(0.86 - av, 0.86 + av, ad));
    hl = 0.6;
  } else {
    ec = mix(ink, mix(wht, diffuseColor.rgb, 0.2), smoothstep(0.78 - av, 0.78 + av, ad));
  }
  if (uK.w > 0.0) {             // 腮红（水母类）：眼睛外下方一团粉
    float bl = (1.0 - smoothstep(0.6, 0.85, length((uv - vec2(0.55, -1.3)) * vec2(0.75, 1.3)))) * smoothstep(0.05, 0.2, vLoc.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.38, 0.55), bl * 0.7 * uK.w * step(crState, 0.5));
  }
  if (uK.z > 1.5) {             // 小嘴（水母类）：两眼中间下方弯弯的一道；晕的时候是波浪线
    vec2 mq = vec2(vLoc.x, vLoc.y - (uEye.y - uEye.w * 0.75)) / uEye.w;
    float wv = crState > 1.5 && crState < 2.5 ? 0.12 * sin(mq.x * 9.0) : 0.0;
    float md = crState > 1.5 && crState < 2.5 ? abs(mq.y + 0.42 - wv) : abs(length(mq) - 0.42), ma = fwidth(md) + 1e-4;
    float mm = (1.0 - smoothstep(0.1 - ma, 0.1 + ma, md)) * smoothstep(0.1, -0.06, mq.y) * step(abs(mq.x), 0.5) * step(0.0, vLoc.z);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.04, 0.1), mm);
    totalEmissiveRadiance *= 1.0 - mm;
  }
  diffuseColor.rgb = mix(diffuseColor.rgb, ec, e);
  totalEmissiveRadiance *= 1.0 - e;
  float h1 = 1.0 - smoothstep(0.3 - av, 0.3 + av, length(uv - vec2(0.3, 0.34)));
  float h2 = 1.0 - smoothstep(0.13 - av, 0.13 + av, length(uv - vec2(-0.3, -0.3)));
  totalEmissiveRadiance += vec3(0.95) * max(h1, h2 * 0.8) * hl * e;
  if (pred && crState < 0.5) totalEmissiveRadiance += vec3(0.45, 0.04, 0.0) * smoothstep(0.42, 0.6, ad) * e;
}
`;

// 本体材质：所有生物同一个着色器程序（参数走 uniform），省编译时间
export function bodyMat(GRAD, U, { emissive = 0x000000 } = {}) {
  const m = new THREE.MeshToonMaterial({ gradientMap: GRAD, vertexColors: true, emissive });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = DEFORM_PARS + 'attribute vec3 sN;\nvarying vec3 vLoc;\nvarying float vGlow;\nvarying vec4 vFx;\nvarying float vRim;\nvarying float vHeat;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = sN; vec3 crP = position; crDeform(crP, objectNormal);')
      .replace('#include <color_vertex>', '#include <color_vertex>\n' + TINT)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed = crP; vLoc = position; vGlow = aP.w;'
        + ' float crG = step(7.5, iA.w), crS = iA.w - 8.0 * crG, crE = floor(crS + 0.01); vFx = vec4(crE, crG, iA.z, iC.a); vHeat = (crS - crE) * 1.25;')
      // 轮廓光的强度：距离 / 体长 < 14（屏幕上很大）全有，> 32 没有；只给圆润的身体（明暗法线 = 平滑法线），鳍和翅膀不加
      .replace('#include <project_vertex>', '#include <project_vertex>\n vRim = (1.0 - smoothstep(14.0, 32.0, -mvPosition.z / max(length(instanceMatrix[0].xyz), 1e-3))) * step(0.995, dot(sN, normal));');
    sh.fragmentShader = FRAG_PARS + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_FX)
      .replace('#include <fog_fragment>', FOG);
  };
  m.customProgramCacheKey = () => 'creature3';
  return m;
}

// 描边材质：用 toon.js 的 outlineMat，插同一段变形；再加这几样：
//   屏幕上最细 uPx（远处的小鸟小鱼描边不会细到 1 像素以下而闪），但最多体长的 7%（身体本身只有几像素时，不能整只都是描边）；
//   身体在屏幕上小于约 14 像素时，描边颜色慢慢换成这个面自己颜色的中间调（远处的小鱼是一点银青色，不是黑点）；
//   身体在屏幕上 11 → 7.5 像素之间描边宽度慢慢收到 0（再小的 creatures.js 直接不画描边，省三角面，切换时看不出来）；
//   水母的触手越往梢描边越细（像透光的细丝，不是一根根黑线）；
//   离镜头 0.75·uFar → uFar 之间整圈描边慢慢收到 0（超过 uFar 就不画描边，这样切换时看不出来）；
//   金色 / 烤熟的个体描边跟着换成同色相的深色（深金 / 深褐，亮度和别的描边差不多）
export function hullMat(outlineMat, color, w, U) {
  const m = outlineMat(color, w, {
    extraPars: DEFORM_PARS + 'uniform float uFar;\nattribute vec3 color;\nvarying vec4 vOT;\nvarying vec3 vCrMid;\nvarying float vCrSmall;\n',
    extraVertex: `crDeform(transformed, oN); vOT = iC; vCrMid = color;
      { vec4 crV = modelViewMatrix * instanceMatrix * vec4(transformed, 1.0);
        float crS = length(instanceMatrix[0].xyz), crF = 1.0 - smoothstep(uFar * 0.75, uFar, length(crV.xyz));
        float crMin = uPx * max(-crV.z, 0.0) / max(crS, 1e-4);
        float crJ = uK.x > 2.5 && uK.x < 3.5 ? 1.0 - 0.6 * aP.y : 1.0;
        float crBp = ${OUT_MIN_PX.toFixed(2)} / max(crMin, 1e-5);
        vCrSmall = uPx > 0.0 ? 1.0 - smoothstep(5.0, 14.0, crBp) : 0.0;
        crF *= smoothstep(7.5, 11.0, crBp);
        transformed += normalize(oN) * (crF * crJ * max(uW, min(crMin, 0.07)) - uW); }`,
    key: 'creature3',
  });
  m.userData.extraUniforms = U;
  const base = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    sh.fragmentShader = 'varying vec4 vOT;\nvarying vec3 vCrMid;\nvarying float vCrSmall;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        { vec3 crT = vOT.rgb * (0.028 / max(dot(vOT.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-3));
          diffuseColor.rgb = mix(diffuseColor.rgb, crT, vOT.a * 0.9);
          vec3 crM = mix(vCrMid, vOT.rgb, vOT.a) * 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, crM, vCrSmall * 0.75); }`)
      .replace('#include <fog_fragment>', FOG);
  };
  return m;
}

// 描边宽度（模型单位，体长 = 1）：小生物 3%，大生物 1.6%，世界里最少 0.03（远处另有屏幕最细限制）
export function outlineW(len) {
  const k = Math.min(1, Math.max(0, (len - 1.2) / 3.3));
  return Math.max(0.03 - 0.014 * k, 0.03 / len);
}
// 描边颜色：主色的色相、在 sRGB 里压到很暗（亮度 ≈ 0.12，和主角 / 岛 / 海草的描边一样深，浅色生物也不会是灰边）
// 几乎没颜色的（白海鸥）用冷一点的青灰；饱和度压一点，免得像霓虹
export function outlineColor(hex) {
  const h = {}; new THREE.Color(hex).getHSL(h, THREE.SRGBColorSpace);
  const grey = h.s < .2;
  return new THREE.Color().setHSL(grey ? .58 : h.h, grey ? .28 : Math.min(.6, Math.max(.25, h.s * .75)), .12, THREE.SRGBColorSpace);
}

// ---------- 低多边形搭建器 ----------
// 所有部件都是封闭的小实体（描边要靠背面外扩，单面片会破）。
// 每个部件内的三角形按一致的绕向生成，收尾时按「有向体积」整体判断朝外还是朝里（凹的车削体也不会判错）。
// 部件选项：paint(中心, 法线) / color 上色，ap(顶点) 动画参数，glow / glowF 自发光，flat = 明暗用面法线（鳍、翅、喙）
const V3 = THREE.Vector3;
export function builder(seed = 1) {
  const rnd = makeRng(seed);
  const tris = [];   // { p: [V3 ×3], a: [[4] ×3], c: Color, part, flat }
  let part = 0;
  const _e1 = new V3(), _e2 = new V3(), _n = new V3(), _c = new V3();
  const col = c => (c && c.isColor) ? c.clone() : new THREE.Color(c);
  const v3 = p => new V3(p[0], p[1], p[2]);

  function commit(raw, o) {
    const pt = ++part, ctr = new V3(); let cnt = 0;
    for (const t of raw) for (const v of t) { ctr.add(v); cnt++; }
    ctr.divideScalar(cnt || 1);
    let vol = 0; const a = new V3(), b = new V3(), c = new V3();
    for (const t of raw) { a.subVectors(t[0], ctr); b.subVectors(t[1], ctr); c.subVectors(t[2], ctr); vol += a.dot(b.cross(c)); }
    const flip = vol < 0;
    for (const t of raw) {
      const P = flip ? [t[0], t[2], t[1]] : t;
      _e1.subVectors(P[1], P[0]); _e2.subVectors(P[2], P[0]); _n.crossVectors(_e1, _e2);
      if (_n.lengthSq() < 1e-14) continue;
      _n.normalize(); _c.copy(P[0]).add(P[1]).add(P[2]).divideScalar(3);
      const color = col(o.paint ? o.paint(_c.clone(), _n.clone()) : o.color ?? 0xff00ff);
      color.multiplyScalar(1 + (rnd() * 2 - 1) * .04);          // 每面 ±4% 抖动
      const g = o.glowF ? o.glowF(_c.clone(), _n.clone()) : o.glow || 0;
      tris.push({ p: P.map(v => v.clone()), a: P.map(v => { const r = o.ap ? o.ap(v) : [0, 0, 0, 0]; r[3] = g; return r; }), c: color, part: pt, flat: !!o.flat, fn: _n.clone() });
    }
    return B;
  }

  const B = {
    tris,
    // 沿一条轴放样：rings = [{ c:[x,y,z], rx, ry }...]，按顺序连接；rx = ry = 0 是尖点。
    // axis 'z'：圈在 xy 平面（x = rx·sinθ, y = ry·cosθ）；'y'：圈在 xz 平面（x = rx·sinθ, z = ry·cosθ）；'x'：圈在 yz 平面（z = rx·sinθ, y = ry·cosθ）
    // n 边数，rot 起始角（0 = 第一个顶点在正上 / 正前），cap0 / cap1 两头封口
    loft(rings, o = {}) {
      const n = o.n || 4, rot = o.rot || 0, ax = o.axis || 'z', raw = [];
      const pts = rings.map(r => {
        if (!r.rx && !r.ry) return null;
        const out = [];
        for (let k = 0; k < n; k++) {
          // r.f(k) = [半径倍数, 沿轴偏移]：可选，做花边（水母伞边的波浪）
          const [fk, dk] = r.f ? r.f(k) : [1, 0];
          const t = rot + Math.PI * 2 * k / n, s = Math.sin(t) * r.rx * fk, c = Math.cos(t) * r.ry * fk, [x, y, z] = r.c;
          out.push(new V3(...(ax === 'z' ? [x + s, y + c, z + dk] : ax === 'y' ? [x + s, y + dk, z + c] : [x + dk, y + c, z + s])));
        }
        return out;
      });
      for (let i = 0; i < rings.length - 1; i++) {
        const A = pts[i], Bp = pts[i + 1], ca = v3(rings[i].c), cb = v3(rings[i + 1].c);
        if (!A && !Bp) continue;
        for (let k = 0; k < n; k++) {
          const k1 = (k + 1) % n;
          if (!A) raw.push([ca, Bp[k1], Bp[k]]);
          else if (!Bp) raw.push([A[k], A[k1], cb]);
          else { raw.push([A[k], A[k1], Bp[k1]]); raw.push([A[k], Bp[k1], Bp[k]]); }
        }
      }
      const L = rings.length - 1;
      if (o.cap0 && pts[0]) for (let k = 1; k < n - 1; k++) raw.push([pts[0][0], pts[0][k + 1], pts[0][k]]);
      if (o.cap1 && pts[L]) for (let k = 1; k < n - 1; k++) raw.push([pts[L][0], pts[L][k], pts[L][k + 1]]);
      return commit(raw, o);
    },
    // 椭球（沿 z 轴放样）：中心 c，半径 [rx, ry, rz]，m 段（≥ 3），n 边
    ell(c, r, o = {}) {
      const m = o.m || 4, rings = [];
      for (let i = 0; i <= m; i++) {
        const th = Math.PI * i / m, s = Math.sin(th);
        rings.push({ c: [c[0], c[1], c[2] + r[2] * Math.cos(th)], rx: i % m ? r[0] * s : 0, ry: i % m ? r[1] * s : 0 });
      }
      return B.loft(rings, o);
    },
    // 棱锥：底面多边形 + 顶点（open = 不封底，插在身体里时省面）
    pyr(base, apex, o = {}) {
      const bs = base.map(v3), ap = v3(apex), raw = [];
      for (let k = 0; k < bs.length; k++) raw.push([bs[k], bs[(k + 1) % bs.length], ap]);
      if (!o.open) for (let k = 1; k < bs.length - 1; k++) raw.push([bs[0], bs[k + 1], bs[k]]);
      return commit(raw, o);
    },
    // 薄片（翅、鳍）：平面多边形，往 up 方向鼓起 bulge，做成封闭的扁棱锥（上面一圈 + 底面）
    fin(poly, up, bulge, o = {}) {
      const c = [0, 0, 0]; poly.forEach(p => { for (let i = 0; i < 3; i++) c[i] += p[i] / poly.length; });
      return B.pyr(poly, o.apex || [c[0] + up[0] * bulge, c[1] + up[1] * bulge, c[2] + up[2] * bulge], { flat: true, ...o });
    },
    // 两面都鼓起的薄片（竖着的背鳍、尾鳍）：两边各一个顶点
    bip(poly, side, bulge, o = {}) {
      const c = [0, 0, 0]; poly.forEach(p => { for (let i = 0; i < 3; i++) c[i] += p[i] / poly.length; });
      const bs = poly.map(v3), a1 = v3(c).addScaledVector(v3(side), bulge), a2 = v3(c).addScaledVector(v3(side), -bulge), raw = [];
      for (let k = 0; k < bs.length; k++) { const k1 = (k + 1) % bs.length; raw.push([bs[k], bs[k1], a1]); raw.push([bs[k1], bs[k], a2]); }
      return commit(raw, { flat: true, ...o });
    },
    // 从 o 点沿 d 方向打一条射线，返回最近的表面点（放眼睛用）
    surf(o, d) {
      const O = v3(o), D = v3(d).normalize(); let best = Infinity;
      const e1 = new V3(), e2 = new V3(), h = new V3(), s = new V3(), q = new V3();
      for (const t of tris) {
        const [a, b, c] = t.p; e1.subVectors(b, a); e2.subVectors(c, a); h.crossVectors(D, e2);
        const det = e1.dot(h); if (Math.abs(det) < 1e-9) continue;
        const f = 1 / det; s.subVectors(O, a); const u = f * s.dot(h); if (u < 0 || u > 1) continue;
        q.crossVectors(s, e1); const v = f * D.dot(q); if (v < 0 || u + v > 1) continue;
        const tt = f * e2.dot(q); if (tt > 1e-6 && tt < best) best = tt;
      }
      return best < Infinity ? O.addScaledVector(D, best).toArray() : o;
    },
    // 收尾：先把 off 点移到原点，再缩放到「ext 那段长度 = 1」（默认按 norm 轴的包围盒长度），
    // 算每部件的平滑法线（描边 + 身体明暗用），输出非索引 BufferGeometry
    finish(norm = 'z', ext = 0, off = [0, 0, 0]) {
      const box = new THREE.Box3(); for (const t of tris) for (const p of t.p) box.expandByPoint(p);
      const s = 1 / (ext || (norm === 'y' ? box.max.y - box.min.y : box.max.z - box.min.z));
      const n = tris.length * 3, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), sn = new Float32Array(n * 3), colA = new Float32Array(n * 3), ap = new Float32Array(n * 4);
      // 平滑法线：同一部件、同一位置的顶点共用（面积加权）
      const acc = new Map(), key = (pt, v) => pt + ':' + Math.round(v.x * 1e4) + ',' + Math.round(v.y * 1e4) + ',' + Math.round(v.z * 1e4);
      for (const t of tris) {
        _e1.subVectors(t.p[1], t.p[0]); _e2.subVectors(t.p[2], t.p[0]); const fn = new V3().crossVectors(_e1, _e2);
        for (const v of t.p) { const k = key(t.part, v); const a = acc.get(k); if (a) a.add(fn); else acc.set(k, fn.clone()); }
      }
      tris.forEach((t, i) => {
        for (let j = 0; j < 3; j++) {
          const v = t.p[j], m = i * 3 + j;
          pos.set([(v.x - off[0]) * s, (v.y - off[1]) * s, (v.z - off[2]) * s], m * 3);
          const nn = acc.get(key(t.part, v)).clone().normalize(); nor.set([nn.x, nn.y, nn.z], m * 3);
          const sh = t.flat ? t.fn : nn; sn.set([sh.x, sh.y, sh.z], m * 3);
          colA.set([t.c.r, t.c.g, t.c.b], m * 3);
          ap.set(t.a[j], m * 4);
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('sN', new THREE.BufferAttribute(sn, 3));
      g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
      g.setAttribute('aP', new THREE.BufferAttribute(ap, 4));
      g.computeBoundingBox(); g.computeBoundingSphere();
      return { geo: g, s, tris: tris.length };
    },
  };
  return B;
}

// 常用的上色规则：按面法线分背 / 肚（y < 阈值算肚子）
export const backBelly = (back, belly, th = -.25) => (c, n) => n.y < th ? belly : back;
export const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
