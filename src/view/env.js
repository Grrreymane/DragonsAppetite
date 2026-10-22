// 昼夜 + 天气 + 区域：每帧算出「现在的天」，改天空球、雾、灯光、海、云的颜色。
// - 一天 CYCLE 秒（玩的时候才走）：上午 → 正午 → 金色傍晚 → 日落 → 暮色 → 夜（星星、月亮、海里荧光）→ 黎明 → 上午
// - 天气：晴 / 阵雨（阴天、雨丝、雷电）/ 海雾；雨停后有一阵彩虹
// - 区域（按主角位置平滑混合）：熔岩海雾偏暖偏浊、飘火山灰和火星；外海看得更远
// - 进入新区域时回调 onRegion（界面弹区域名）；打雷时回调 onLightning（玩法用）
// 调试：?tod=0.6 定住时间（0..1），?weather=rain|mist|bow|clear；window.__env 可读写
import * as THREE from 'three';
import { SKY, SUN, setFogTint } from './sky.js';
import { CLOUD_TINT } from './clouds.js';
import { zoneValue, wrapP, waveH } from '../sim/world.js';

export const CYCLE = 300;                 // 一天几秒
const START_F = .05;                      // 开局是上午

// 关键帧：f = 一天里的位置。颜色写 sRGB 十六进制（THREE.Color 自动转线性）
// sky：天顶 / 中段 / 地平线（= 雾）/ 朝太阳的地平线 / 背太阳的地平线 / 太阳光盘
// sunEl / moonEl：太阳、月亮的高度（度）；sunL：太阳光颜色、强度倍数；hemi：天光 / 地面反光颜色、强度倍数（相对画面预设）
// sea：海面底色乘数；uw：水下乘数；cloud：云的乘数；fog：雾的近 / 远；star：星星；exp：曝光倍数
const K = (o) => o;
const DAY = K({ sky: [0x2a63c4, 0x64a2e6, 0xcde2ee, 0xf6e2c2, 0xc0d9ee, 0xfff1d0], sunEl: 40, moonEl: -20, sunL: [null, 1], hemi: [null, null, 1], sea: [1, 1, 1], uw: [1, 1, 1], cloud: [1, 1, 1], fog: [180, 900], star: 0, exp: 1 });
const KEYS = [
  [0.00, K({ ...DAY, sunEl: 24, sky: [0x3366c0, 0x74a8e4, 0xd8e4ec, 0xf8e0c0, 0xc4d8ec, 0xfff0d0], sunL: [0xfff0d8, .95] })],
  [0.10, DAY],
  [0.40, K({ ...DAY, sunEl: 36 })],
  [0.48, K({ sky: [0x3560b8, 0x7aa0dc, 0xf0d6b4, 0xffc68a, 0xc4cce8, 0xffd9a0], sunEl: 14, moonEl: -20, sunL: [0xffd6a0, .9], hemi: [0xffe6cc, 0x9a7a60, .92], sea: [1, .94, .86], uw: [.95, .92, .88], cloud: [1.08, .9, .76], fog: [170, 850], star: 0, exp: 1 })],
  [0.55, K({ sky: [0x2a3d8a, 0x7a6cb8, 0xf4a77e, 0xff8a4a, 0xa88cc8, 0xffb070], sunEl: 2, moonEl: -10, sunL: [0xff9a60, .62], hemi: [0xd0a8c4, 0x6a4c5a, .78], sea: [.8, .6, .64], uw: [.8, .72, .76], cloud: [1.06, .6, .48], fog: [150, 800], star: 0, exp: .97 })],
  [0.60, K({ sky: [0x141e52, 0x3c3c86, 0x8a6a96, 0xd07a6a, 0x504c88, 0xff9060], sunEl: -8, moonEl: 8, sunL: [0x9a90d0, .4], hemi: [0x9a98d8, 0x3a3050, .78], sea: [.34, .3, .5], uw: [.5, .48, .64], cloud: [.4, .28, .42], fog: [140, 760], star: .5, exp: .94 })],
  [0.66, K({ sky: [0x060c24, 0x12204e, 0x2a3a6a, 0x3a4a80, 0x1e2a58, 0xe0e8ff], sunEl: -20, moonEl: 26, sunL: [0xa8c0ff, .5], hemi: [0x8aa0e0, 0x2a3050, .8], sea: [.13, .21, .4], uw: [.3, .38, .56], cloud: [.09, .11, .22], fog: [120, 700], star: 1, exp: .92 })],
  [0.86, K({ sky: [0x060c24, 0x12204e, 0x2a3a6a, 0x3a4a80, 0x1e2a58, 0xe0e8ff], sunEl: -20, moonEl: 38, sunL: [0xa8c0ff, .5], hemi: [0x8aa0e0, 0x2a3050, .8], sea: [.13, .21, .4], uw: [.3, .38, .56], cloud: [.09, .11, .22], fog: [120, 700], star: 1, exp: .92 })],
  [0.92, K({ sky: [0x34508e, 0x9a9cd0, 0xf2c4c0, 0xffc0a0, 0xb4b8e0, 0xffd0b0], sunEl: 0, moonEl: 20, sunL: [0xffc8a8, .62], hemi: [0xe8d0e0, 0x7a6870, .8], sea: [.7, .66, .8], uw: [.78, .76, .84], cloud: [1.04, .84, .88], fog: [130, 700], star: .15, exp: .95 })],
  [0.97, K({ sky: [0x3a5aa8, 0x8aaee0, 0xf0d4c8, 0xffd0a8, 0xbcc8e8, 0xffe0c0], sunEl: 10, moonEl: 10, sunL: [0xffdcbc, .82], hemi: [0xf0e0e8, 0x907a70, .9], sea: [.94, .9, .92], uw: [.9, .88, .9], cloud: [1.04, .9, .9], fog: [150, 800], star: 0, exp: .98 })],
];
// 预先把颜色转成 THREE.Color
for (const [, k] of KEYS) {
  k.skyC = k.sky.map(h => new THREE.Color(h));
  k.sunC = k.sunL[0] == null ? null : new THREE.Color(k.sunL[0]);
  k.hemiC = k.hemi[0] == null ? null : [new THREE.Color(k.hemi[0]), new THREE.Color(k.hemi[1])];
}
const smooth = t => t * t * (3 - 2 * t);
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const sstep = (a, b, x) => smooth(clamp01((x - a) / (b - a)));
const DEG = Math.PI / 180;

// 区域名（界面弹出）
export const REGION = {
  green: { zh: '翠岛海', en: 'Emerald Isles' },
  volcano: { zh: '熔岩海', en: 'Lava Sea' },
  open: { zh: '深蓝外海', en: 'Deep Blue' },
};
// 平滑的区域权重：v = 熔岩海，o = 外海（出生点附近固定是翠岛海）
function zoneW(x, z) {
  const f = zoneValue(x, z), home = 1 - sstep(290, 350, Math.hypot(wrapP(x), wrapP(z - 120)));
  return { v: sstep(.3, .46, f) * (1 - home), o: sstep(-.34, -.5, f) * (1 - home) };
}
function zoneName(x, z) {
  if (Math.hypot(wrapP(x), wrapP(z - 120)) < 330) return 'green';
  const f = zoneValue(x, z); return f > .38 ? 'volcano' : f < -.42 ? 'open' : 'green';
}

export function createEnv(ctx, { sky, sea, look }) {
  const { scene, renderer, camera } = ctx;
  const Q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const base = {   // 画面预设（look.js）里的灯光：白天就用它
    sunC: sky.sun.color.clone(), sunI: sky.sun.intensity, hemiS: sky.hemi.color.clone(), hemiG: sky.hemi.groundColor.clone(), hemiI: sky.hemi.intensity,
    exp: renderer.toneMappingExposure,
  };
  const sunAz = Math.atan2(SUN.x, SUN.z), moonAz = sunAz + 2.6;
  const E = {
    f: Q.has('tod') ? +Q.get('tod') : START_F, fixed: Q.has('tod'),
    weather: 'clear', wT: 60, over: 0, rain: 0, mist: 0, bow: 0, bowT: 0, flash: 0, flashT: 8,
    zone: null, zoneCand: null, zoneT: 0, v: 0, o: 0,
    onRegion: null, onLightning: null, onMeteor: null, meteorDay: -1, day: 0,
  };
  if (Q.get('weather')) setWeather(Q.get('weather'), 1e9);
  window.__env = E;

  // ---- 雨丝 / 火山灰：跟着镜头的一盒粒子 ----
  const fx = createWeatherFx(scene);

  function setWeather(w, dur) {
    E.weather = w === 'bow' ? 'clear' : w; E.wT = dur;
    if (w === 'bow') E.bowT = 1e9;
    if (E.wT > 1e8) { E.over = w === 'rain' ? 1 : 0; E.rain = E.over; E.mist = w === 'mist' ? 1 : 0; }
  }
  E.setWeather = setWeather;
  function nextWeather() {
    const prev = E.weather, r = Math.random();
    if (prev !== 'clear') { setWeather('clear', 55 + Math.random() * 40); if (prev === 'rain') E.bowT = 45; return; }
    const pr = E.o > .5 ? .5 : E.v > .5 ? .3 : .4, pm = E.o > .5 ? .25 : E.v > .5 ? .15 : .2;
    if (r < pr) setWeather('rain', 34 + Math.random() * 16);
    else if (r < pr + pm) setWeather('mist', 32 + Math.random() * 14);
    else setWeather('clear', 40 + Math.random() * 30);
  }

  // 两个关键帧之间插值
  const cur = { skyC: [0, 1, 2, 3, 4, 5].map(() => new THREE.Color()), sunC: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), sea: [1, 1, 1], uw: [1, 1, 1], cloud: [1, 1, 1] };
  function sample(f) {
    let i = KEYS.length - 1;
    for (let k = 0; k < KEYS.length; k++) if (KEYS[k][0] <= f) i = k;
    const [fa, a] = KEYS[i], [fb0, b] = KEYS[(i + 1) % KEYS.length], fb = fb0 <= fa ? fb0 + 1 : fb0;
    const t = smooth(clamp01((f - fa) / Math.max(1e-4, fb - fa)));
    const L = (x, y) => x + (y - x) * t;
    for (let k = 0; k < 6; k++) cur.skyC[k].copy(a.skyC[k]).lerp(b.skyC[k], t);
    cur.sunC.copy(a.sunC || base.sunC).lerp(b.sunC || base.sunC, t);
    cur.hemiS.copy(a.hemiC ? a.hemiC[0] : base.hemiS).lerp(b.hemiC ? b.hemiC[0] : base.hemiS, t);
    cur.hemiG.copy(a.hemiC ? a.hemiC[1] : base.hemiG).lerp(b.hemiC ? b.hemiC[1] : base.hemiG, t);
    cur.sunI = L(a.sunL[1], b.sunL[1]); cur.hemiI = L(a.hemi[2], b.hemi[2]);
    for (let k = 0; k < 3; k++) { cur.sea[k] = L(a.sea[k], b.sea[k]); cur.uw[k] = L(a.uw[k], b.uw[k]); cur.cloud[k] = L(a.cloud[k], b.cloud[k]); }
    cur.near = L(a.fog[0], b.fog[0]); cur.far = L(a.fog[1], b.fog[1]); cur.star = L(a.star, b.star); cur.exp = L(a.exp, b.exp);
    cur.sunEl = L(a.sunEl, b.sunEl); cur.moonEl = L(a.moonEl, b.moonEl);
    return cur;
  }

  const sunDisc = new THREE.Vector3(), moonDir = new THREE.Vector3(), lightDir = new THREE.Vector3();
  const dirOf = (v, az, el) => v.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  const GRAY = new THREE.Color(0x8a96a4), MIST = new THREE.Color(0xdde6ea), ASH = new THREE.Color(0xd09468), ASH_N = new THREE.Color(0x5a2a2a);
  const _c = new THREE.Color(), _g = new THREE.Color();
  const fog = scene.fog;

  function update(dt, S, playing) {
    const cam = camera.position;
    // ---- 时间 ----
    if (playing && !E.fixed) { E.f += dt / CYCLE; if (E.f >= 1) { E.f -= 1; E.day++; } }
    // 流星雨：每天夜里一次（夜里过了一小段、不下雨的时候）
    if (playing && E.f > .7 && E.f < .84 && E.meteorDay !== E.day && E.over < .3 && E.onMeteor) { E.meteorDay = E.day; E.onMeteor(E); }
    // ---- 天气 ----
    if (playing) {
      E.wT -= dt; if (E.wT <= 0) nextWeather();
      E.bowT -= dt;
    }
    const ramp = dt / 7;
    E.over += Math.sign((E.weather === 'rain' ? 1 : 0) - E.over) * Math.min(ramp, Math.abs((E.weather === 'rain' ? 1 : 0) - E.over));
    E.rain = sstep(.5, 1, E.over);
    E.mist += Math.sign((E.weather === 'mist' ? 1 : 0) - E.mist) * Math.min(ramp, Math.abs((E.weather === 'mist' ? 1 : 0) - E.mist));
    // ---- 区域 ----
    const px = S ? S.hero.x : cam.x, pz = S ? S.hero.z : cam.z, zw = zoneW(px, pz);
    E.v += (zw.v - E.v) * Math.min(1, dt * .8); E.o += (zw.o - E.o) * Math.min(1, dt * .8);
    const zn = zoneName(px, pz);
    if (E.zone == null) E.zone = zn;
    else if (zn !== E.zone) {
      if (zn !== E.zoneCand) { E.zoneCand = zn; E.zoneT = 0; }
      E.zoneT += dt;
      if (E.zoneT > 2.5) { E.zone = zn; E.zoneCand = null; if (playing && E.onRegion) E.onRegion(zn, REGION[zn]); }
    } else E.zoneCand = null;

    const k = sample(E.f);
    const night = sstep(.62, .68, E.f) * (1 - sstep(.9, .95, E.f)), dusk = sstep(.42, .52, E.f) * (1 - sstep(.58, .64, E.f));
    const over = E.over, mist = E.mist, v = E.v * (1 - mist * .5);
    // 彩虹：雨停以后、白天、不是雾天
    const bowWant = E.bowT > 0 && k.sunEl > 4 ? 1 : 0;
    E.bow += (bowWant * (1 - over) * (1 - mist) - E.bow) * Math.min(1, dt * .25);

    // ---- 天空颜色（直接改 SKY 里的颜色对象：天空球、海的反射都引用它们）----
    const C = k.skyC;
    SKY.top.copy(C[0]); SKY.upper.copy(C[1]); SKY.mid.copy(C[2]); SKY.warm.copy(C[3]); SKY.cool.copy(C[4]); SKY.sun.copy(C[5]);
    // 熔岩海：地平线 / 雾偏暖偏浊（夜里偏暗红）
    _c.copy(ASH).lerp(ASH_N, night);
    if (v > 0) { SKY.mid.lerp(_c, v * .5); SKY.warm.lerp(_c, v * .45); SKY.cool.lerp(_c, v * .42); SKY.upper.lerp(_c, v * .22); SKY.top.lerp(_c, v * .08); }
    // 阴天：雾和地平线压灰（亮度跟着时间走）
    if (over > 0) {
      const lum = .14 + .86 * (1 - night) * (1 - dusk * .3);
      _g.copy(GRAY).multiplyScalar(lum);
      for (const c of [SKY.mid, SKY.warm, SKY.cool]) c.lerp(_g, over * .75);
      SKY.upper.lerp(_g, over * .6); SKY.top.lerp(_g, over * .45);
    }
    if (mist > 0) { _g.copy(MIST).multiplyScalar(.3 + .7 * (1 - night)); for (const c of [SKY.mid, SKY.warm, SKY.cool]) c.lerp(_g, mist * .8); }
    if (E.flash > 0) for (const c of [SKY.mid, SKY.warm, SKY.cool]) c.lerp(_g.setRGB(.8, .85, 1), E.flash * .35);

    const U = sky.U;
    dirOf(sunDisc, sunAz, k.sunEl * DEG); dirOf(moonDir, moonAz, k.moonEl * DEG);
    U.sunD.value.copy(sunDisc);
    U.uSunK.value = sstep(-6, 2, k.sunEl) * (1 - mist * .7);
    U.uMoon.value.set(moonDir.x, moonDir.y, moonDir.z, sstep(-2, 8, k.moonEl) * (1 - sstep(-4, 4, k.sunEl) * .8));
    U.uStar.value = k.star * (1 - mist);
    U.uOver.value = over * .9;
    U.uBow.value = E.bow * sstep(3, 9, k.sunEl);
    U.uFlash.value = E.flash;
    U.overC.value.copy(_g.copy(GRAY).multiplyScalar(.14 + .86 * (1 - night)));
    U.wispC.value.setRGB(k.cloud[0], k.cloud[1], k.cloud[2]);

    // ---- 雾 ----
    if (fog) {
      fog.color.copy(SKY.mid);
      const zf = (1 - v * .4) * (1 + E.o * .15);
      fog.near = k.near * zf * (1 - over * .2) * (1 - mist * .8);
      fog.far = k.far * zf * (1 - over * .25) * (1 - mist * .68);
    }
    setFogTint(SKY.warm, SKY.cool, SKY.mid, sunDisc);

    // ---- 灯光：白天跟着太阳，夜里换成月光；太阳低的时候光的方向最低压到 12°（不然卡通明暗全是暗面）----
    const sunUp = sstep(-6, 3, k.sunEl);
    dirOf(lightDir, sunAz, Math.max(12, k.sunEl) * DEG).lerp(_v.copy(moonDir).setY(Math.max(.35, moonDir.y)).normalize(), 1 - sunUp).normalize();
    sky.sun.position.copy(lightDir).multiplyScalar(100);
    sky.sun.color.copy(k.sunC);
    const gloom = (1 - over * .6) * (1 - mist * .35);
    sky.sun.intensity = base.sunI * k.sunI * gloom;
    sky.hemi.color.copy(k.hemiS).lerp(_g.setRGB(.8, .84, .9), over * .4);
    sky.hemi.groundColor.copy(k.hemiG);
    sky.hemi.intensity = base.hemiI * k.hemiI * (1 - over * .12) * (1 + E.flash * .9);
    renderer.toneMappingExposure = base.exp * k.exp;

    // ---- 海 / 云 ----
    if (sea && sea.U) {
      const g = 1 - over * .22;
      sea.U.uEnv.value.setRGB(k.sea[0] * g * (1 - v * .05), k.sea[1] * g * (1 - v * .1), k.sea[2] * g * (1 - v * .12));
      // 水下：阴天暗一点、偏灰蓝；熔岩海偏暖偏浑；打雷时水里也亮一下
      const ug = 1 - over * .3, fl = 1 + E.flash * 1.3;
      sea.U.uEnvU.value.setRGB(k.uw[0] * ug * (1 - over * .08) * (1 + v * .06) * fl, k.uw[1] * ug * (1 - v * .1) * fl, k.uw[2] * ug * (1 + over * .04) * (1 - v * .22) * fl);
      sea.U.uRain.value = E.rain;
      sea.U.uNight.value = night * (1 - mist * .4);
      sea.U.sunC.value.copy(k.sunEl > -2 ? SKY.sun : _g.setRGB(.55, .62, .85)).multiplyScalar((sunUp > .1 ? 1 : .32) * (1 - over * .9));
      sea.setSun && sea.setSun(sunUp > .5 ? sunDisc : moonDir);
      sea.shaftK = (1 - night * .75) * (1 - over * .6);
    }
    // 云：阴天压灰压暗（雨云）
    const cg = 1 - over * .45, cm = (k.cloud[0] + k.cloud[1] + k.cloud[2]) / 3;
    CLOUD_TINT.value.setRGB((k.cloud[0] + (cm * .8 - k.cloud[0]) * over) * cg, (k.cloud[1] + (cm * .84 - k.cloud[1]) * over) * cg, (k.cloud[2] + (cm * .92 - k.cloud[2]) * over) * cg);
    CLOUD_TINT.under = sea ? (sea.underwater || 0) > .5 : null;

    // ---- 打雷：大雨时隔几秒一下，先闪后响 ----
    E.flash = Math.max(0, E.flash - dt * 3.5);
    if (E.rain > .9 && playing) {
      E.flashT -= dt;
      if (E.flashT <= 0) {
        E.flashT = 6 + Math.random() * 9; E.flash = 1;
        if (E.onLightning) E.onLightning(E);
      }
    }

    // ---- 粒子 ----
    const under = sea ? (sea.underwater || 0) : 0;
    fx.update(cam, dt, E.rain, Math.max(E.v * .9, 0), night, sea ? sea.waveT : 0, under > .5);

    // 给别的模块读
    const env = ctx.env;
    env.night = night; env.dusk = dusk; env.rain = E.rain; env.over = over; env.mist = mist; env.bow = E.bow;
    env.zone = E.zone; env.under = under; env.tod = E.f; env.v = E.v; env.o = E.o; env.flash = E.flash;
    env.sunEl = k.sunEl;
  }
  const _v = new THREE.Vector3();
  return { E, update, setWeather, REGION };
}

// 雨丝（线段）+ 火山灰（点）：粒子在镜头周围一个盒子里循环
function createWeatherFx(scene) {
  const NR = 700, BOX = 46, HB = 30;
  const rp = new Float32Array(NR * 3), rpos = new Float32Array(NR * 6);
  for (let i = 0; i < NR; i++) { rp[i * 3] = (Math.random() - .5) * 2 * BOX; rp[i * 3 + 1] = (Math.random() - .5) * 2 * HB; rp[i * 3 + 2] = (Math.random() - .5) * 2 * BOX; }
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rpos, 3).setUsage(THREE.DynamicDrawUsage));
  const rmat = new THREE.LineBasicMaterial({ color: 0xdde8f4, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const rain = new THREE.LineSegments(rg, rmat); rain.frustumCulled = false; rain.renderOrder = 3; scene.add(rain);
  // 灰：灰白的碎屑慢慢往下飘，两成是往上飘的火星
  const NA = 360, AB = 50;
  const ap = new Float32Array(NA * 3), apos = new Float32Array(NA * 3), acol = new Float32Array(NA * 3), aseed = new Float32Array(NA);
  for (let i = 0; i < NA; i++) {
    ap[i * 3] = (Math.random() - .5) * 2 * AB; ap[i * 3 + 1] = (Math.random() - .5) * 2 * AB * .6; ap[i * 3 + 2] = (Math.random() - .5) * 2 * AB;
    aseed[i] = Math.random();
    const ember = aseed[i] < .22;
    acol[i * 3] = ember ? 1 : .62; acol[i * 3 + 1] = ember ? .55 : .58; acol[i * 3 + 2] = ember ? .2 : .56;
  }
  const ag = new THREE.BufferGeometry();
  ag.setAttribute('position', new THREE.BufferAttribute(apos, 3).setUsage(THREE.DynamicDrawUsage));
  ag.setAttribute('color', new THREE.BufferAttribute(acol, 3));
  const dot = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const amat = new THREE.PointsMaterial({ size: .8, map: dot, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, sizeAttenuation: true });
  const ash = new THREE.Points(ag, amat); ash.frustumCulled = false; ash.renderOrder = 3; scene.add(ash);
  let t = 0, wasUnder = false;
  const wrapB = (v, c, b) => c + ((((v - c) % (2 * b)) + 3 * b) % (2 * b)) - b;
  return {
    update(cam, dt, rainK, ashK, night, waveT, under) {   // under：水下时火山灰换成往上冒的热气泡
      t += dt;
      rain.visible = rainK > .01; ash.visible = ashK > .01;
      if (rain.visible) {
        rmat.opacity = (under ? .28 : .42) * rainK * (1 - night * .45);
        const vx = 6, vy = -42, vz = 3, len = .045;   // 风吹得斜一点；线长 = 速度 × 0.045 秒
        for (let i = 0; i < NR; i++) {
          let x = rp[i * 3] + vx * dt, y = rp[i * 3 + 1] + vy * dt, z = rp[i * 3 + 2] + vz * dt;
          if (y < -HB) y += 2 * HB;
          rp[i * 3] = x; rp[i * 3 + 1] = y; rp[i * 3 + 2] = z;
          const wx = wrapB(x, cam.x, BOX), wy = wrapB(y, cam.y, HB), wz = wrapB(z, cam.z, BOX);
          const o = i * 6, sea = waveH(wx, wz, waveT);
          // 水上：水面以下不画；水下：只画扎进水面下 3 米以内的一小截（雨丝扎进水里）
          const yy = under ? (wy < sea && wy > sea - 3 ? wy : -999) : wy < sea ? -999 : wy;
          rpos[o] = wx; rpos[o + 1] = yy; rpos[o + 2] = wz; rpos[o + 3] = wx - vx * len; rpos[o + 4] = yy - vy * len; rpos[o + 5] = wz - vz * len;
        }
        rg.attributes.position.needsUpdate = true;
      }
      if (ash.visible) {
        amat.opacity = (under ? .6 : .85) * ashK;
        if (under !== wasUnder) {   // 换颜色：水下是淡青的泡泡，水上是灰 + 火星
          wasUnder = under;
          for (let i = 0; i < NA; i++) { const ember = aseed[i] < .22; acol[i * 3] = under ? .75 : ember ? 1 : .62; acol[i * 3 + 1] = under ? .95 : ember ? .55 : .58; acol[i * 3 + 2] = under ? 1 : ember ? .2 : .56; }
          ag.attributes.color.needsUpdate = true;
        }
        for (let i = 0; i < NA; i++) {
          const s = aseed[i], ember = s < .22;
          ap[i * 3] += (Math.sin(t * .7 + s * 30) * 1.2 + 1.5) * dt;
          ap[i * 3 + 1] += (under ? 2 + s * 3 : ember ? 2.2 + s * 4 : -1.4 - s) * dt;
          ap[i * 3 + 2] += Math.cos(t * .6 + s * 20) * 1.2 * dt;
          const o = i * 3;
          apos[o] = wrapB(ap[o], cam.x, AB); apos[o + 1] = wrapB(ap[o + 1], cam.y, AB * .6); apos[o + 2] = wrapB(ap[o + 2], cam.z, AB);
          if (ember && !under) { const fl = .7 + .3 * Math.sin(t * 9 + s * 50); acol[o] = 1 * fl; acol[o + 1] = (.45 + night * .1) * fl; acol[o + 2] = .15 * fl; }
        }
        ag.attributes.position.needsUpdate = true; ag.attributes.color.needsUpdate = true;
      }
    },
  };
}
