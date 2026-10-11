// 12 种生物的造型（GDD §9.2，v2：更圆润、头和身体分开、大眼睛、背深肚浅）。
// 每个函数用 creature-kit 的搭建器拼几块封闭的小实体，返回 { geo, tris, kind, P, Q, eye, eyeType, eyeFront, emis, view }：
//   kind 动画类型（KIND），P / Q 动画参数（uP / uQ，位置类的值已经乘了归一化系数 s），
//   eye = [|x|, y, z, 半径]（片元里画圆眼），eyeType 1 普通 / 2 天敌（红眼怒眉），eyeFront 眼睛朝前（水母类），
//   emis 自发光底色，view 小图的视角 [偏航, 俯仰]
// 设计单位：体长约 1（z 从 +0.5 头到 -0.5 尾），最后 finish() 再精确归一化。
// 明暗：身体部件用平滑法线（卡通色阶出圆润的明暗带），鳍 / 翅 / 喙用面法线（硬朗）。
import { builder, KIND, mixHex } from '../creature-kit.js';

// 建议的动画频率（Hz）：sim 推进 phase 时可参考（相位每秒走 2π·hz）；sim 没给 phase 时 view 自己按时间算
export const ANIM_HZ = { sparrow: 4.5, gull: 2.2, lavafinch: 5, cloudjelly: .5, roc: 1.1, flyfish: 3, manta: .45, sardine: 3, jelly: .6, squid: .8, turtle: .5, shark: 1.1 };

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const eyeAt = (B, o, d, r) => [...B.surf(o, d), r];
const eyeN = (e, s, off = [0, 0, 0]) => [(e[0] - off[0]) * s, (e[1] - off[1]) * s, (e[2] - off[2]) * s, e[3] * s];
const R = (z, rx, ry, y = 0, x = 0) => ({ c: [x, y, z], rx, ry });

// ---------- 天上 ----------

// 小雀：圆胖的蛋形身体 + 圆头（脖子处收一下）+ 橙色短喙，宽圆的翅膀带奶油色翼斑和深色翼尖，尾巴分叉
function sparrow({ body, belly, accent }) {
  const B = builder(11);
  // 背深肚浅：背是深棕（比肚子暗一大截，天上海上都分得开），头顶更深的棕色，脸和肚子奶油色
  const back = mixHex(body, belly, .1), cap = mixHex(0x6a2e14, accent, .25), cream = mixHex(belly, 0xffffff, .3);
  const beak = 0xf0a23a, tip = mixHex(accent, 0x24160c, .35), under = mixHex(belly, back, .3);
  B.ell([0, .02, -.05], [.2, .19, .26], { n: 10, m: 5, paint: (c, n) => n.y < -.3 ? belly : back });                 // 身体
  B.ell([0, .1, .25], [.135, .13, .14], { n: 10, m: 4, paint: (c, n) => n.y > .42 || (n.z < -.2 && n.y > .05) ? cap : (n.y < -.1 || (n.z > .4 && n.y < .35)) ? cream : back });  // 头
  B.pyr([[-.045, .095, .36], [.045, .095, .36], [0, .04, .36]], [0, .075, .5], { color: beak, flat: true });            // 喙
  for (const s of [1, -1]) B.fin([[s * .1, .12, .12], [s * .45, .16, .1], [s * .78, .14, .0], [s * .86, .12, -.13], [s * .56, .12, -.2], [s * .12, .11, -.1]], [0, 1, 0], .04,
    { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? under : Math.abs(c.x) > .62 ? tip : (Math.abs(c.x) > .3 && Math.abs(c.x) < .46) ? cream : back });
  B.fin([[-.05, .08, -.22], [.05, .08, -.22], [.1, .1, -.47], [0, .09, -.39], [-.1, .1, -.47]], [0, 1, 0], .02, { ap: v => [0, 3, sm(-.22, -.47, v.z), 0], color: cap });   // 分叉尾
  const eye = eyeAt(B, [0, .13, .29], [1, 0, 0], .074);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.bird, P: [.1 * s, .12 * s, 0, .02 * s], Q: [.6, 0, 0, -.05], eye: eyeN(eye, s), eyeType: 1, view: [.62, .3], pose: [1.25, .8] };
}

// 海鸥：白身、灰翅、黑翼尖、黄喙（带红点）；两段翅（外段滞后，扇起来像 M）
function gull({ body, belly, accent }) {
  const B = builder(12), tip = mixHex(accent, 0x1c2026, .82), wing = mixHex(accent, 0x6a7888, .2), under = mixHex(belly, accent, .25);
  B.loft([R(.22, 0, 0, .04), R(.12, .12, .13, .03), R(-.06, .15, .15, 0), R(-.26, .1, .09, .03), R(-.44, .07, .015, .05)],
    { n: 7, cap1: true, paint: (c, n) => c.z < -.3 ? wing : n.y < -.3 ? belly : body });
  B.ell([0, .1, .26], [.115, .115, .125], { n: 7, m: 4, color: body });
  B.pyr([[-.032, .09, .35], [.032, .09, .35], [0, .048, .35]], [0, .065, .53], { paint: c => c.z > .45 ? 0xe04030 : 0xf6c640, flat: true });
  for (const s of [1, -1]) {
    B.fin([[s * .08, .07, .1], [s * .52, .1, .1], [s * .52, .1, -.08], [s * .08, .07, -.12]], [0, 1, 0], .04,
      { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? under : wing });
    B.fin([[s * .52, .1, .1], [s * .86, .08, .02], [s * 1.06, .06, -.12], [s * .52, .1, -.08]], [0, 1, 0], .03,
      { ap: () => [s, 2, 0, 0], paint: (c, n) => Math.abs(c.x) > .74 ? tip : n.y < -.3 ? under : wing });
  }
  const eye = eyeAt(B, [0, .135, .3], [1, 0, 0], .062);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.bird, P: [.08 * s, .07 * s, .52 * s, .015 * s], Q: [.55, .55, .8, .12], eye: eyeN(eye, s), eyeType: 1, pose: [1.3, .6] };
}

// 熔岩雀：黑身、发光的橙肚子和翼缘，头顶火冠，尾巴三条火舌
function lavafinch({ body, belly, accent }) {
  const B = builder(13), soot = mixHex(body, 0x5a4048, .25);
  B.ell([0, .01, -.04], [.19, .18, .25], { n: 12, m: 6, paint: (c, n) => n.y < -.28 ? belly : soot, glowF: (c, n) => n.y < -.28 ? .6 : 0 });
  B.ell([0, .08, .24], [.13, .125, .135], { n: 10, m: 5, paint: (c, n) => n.y < -.25 ? belly : soot, glowF: (c, n) => n.y < -.25 ? .5 : 0 });
  B.pyr([[-.04, .08, .35], [.04, .08, .35], [0, .03, .35]], [0, .055, .49], { color: accent, flat: true, glow: .3 });
  for (const s of [1, -1]) B.fin([[s * .1, .09, .12], [s * .46, .14, .08], [s * .72, .12, -.06], [s * .5, .1, -.18], [s * .12, .08, -.1]], [0, 1, 0], .04,
    { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 || Math.abs(c.x) > .5 ? belly : soot, glowF: (c, n) => n.y < -.3 || Math.abs(c.x) > .5 ? .45 : 0 });
  // 火冠：三根往后飘
  for (const [x, h, z] of [[0, .3, .14], [.05, .24, .12], [-.05, .24, .12]])
    B.pyr([[x - .03, .18, .3], [x + .03, .18, .3], [x, .2, .22]], [x * 1.6, h, z], { open: true, paint: c => c.y > .23 ? accent : belly, glow: .7, flat: true });
  // 尾巴火舌：中间长、两边短
  for (const [x, y, l] of [[0, .06, .6], [.07, .04, .5], [-.07, .04, .5]])
    B.pyr([[x - .035, y, -.22], [x + .035, y, -.22], [x, y - .05, -.24]], [x * 1.8, y + .03, -l], { open: true, paint: c => c.z < -.38 ? accent : belly, glow: .7, flat: true });
  const eye = eyeAt(B, [0, .11, .28], [1, 0, 0], .066);
  const r = B.finish('z', .97), s = r.s;
  return { ...r, kind: KIND.bird, P: [.1 * s, .09 * s, 0, .02 * s], Q: [.75, 0, 0, .05], eye: eyeN(eye, s), eyeType: 1, pose: [1.2, .6] };
}

// 水母类的伞盖：真正的圆顶（半椭圆）+ 波浪花边的伞边 + 往上凹的伞底。rimY 伞边高度，R 最宽半径，H 圆顶高，lobes 花边几片（n = 2 × lobes）
// 面数：圆顶 3 圈 + 伞边 2 圈 + 伞底 1 个顶点 = 8n
function bell(B, { rimY, R, H, lobes, paint, glowF }) {
  const n = lobes * 2, y0 = rimY + .03, rings = [{ c: [0, y0 + H, 0], rx: 0, ry: 0 }];
  for (const th of [.46, .92, 1.3]) rings.push({ c: [0, y0 + H * Math.cos(th), 0], rx: R * Math.sin(th), ry: R * Math.sin(th) });
  rings.push({ c: [0, y0, 0], rx: R, ry: R });
  // 伞边：单数顶点往里、往上收一点 → 一片片的花边
  rings.push({ c: [0, rimY - .03, 0], rx: R * .96, ry: R * .96, f: k => k & 1 ? [.9, .06] : [1, 0] });
  rings.push({ c: [0, rimY + H * .3, 0], rx: 0, ry: 0 });
  B.loft(rings, { n, axis: 'y', rot: Math.PI / n, ap: v => [sm(y0 + H, rimY, v.y), 0, 0, 0], paint, glowF });
}
// 水母的一条触手 / 飘带：从伞底里面往下垂，左右弯成一个 S（越往下弯得越开，梢上自然卷过去），粗细收到一个尖。
// S 弯的方向所有触手一样（左右 = 脸的左右），相位只差一点：像一把顺着水流飘的飘带，不是一根根往外乱伸的细条。
// 根部藏在伞盖里（不用封口）；明暗用平滑法线（软的，不是一节一节硬硬的）。w 起始粗细；flat < 1 = 扁飘带（n = 4，宽面朝外）
function tendril(B, { a, r0, y0, y1, w, flat = 1, wave = .09, freq = 4.4, seg = 6, ph = 0, n = 3, taper = .65, paint, glow, i }) {
  const rd = [Math.sin(a), Math.cos(a)], rings = [];
  const f = flat < 1 ? k => [k & 1 ? 1 : flat, 0] : undefined;
  for (let k = 0; k <= seg; k++) {
    const t = k / seg, cu = sm(.6, 1, t);
    const y = y0 + (y1 - y0) * t + (y0 - y1) * .05 * cu * cu;
    const sx = Math.sin(t * freq + ph) * wave * (.15 + .85 * t), sz = Math.cos(t * 3.6 + ph * 1.3) * wave * .35 * t, rr = r0 * (1 + t * .1);
    const wk = k === seg ? 0 : w * (1 - t * taper);
    rings.push({ c: [rd[0] * rr + sx, y, rd[1] * rr + sz], rx: wk, ry: wk, f });
  }
  B.loft(rings, { n, axis: 'y', rot: a, ap: v => [0, sm(y0, y1, v.y), ph + i * .5, 0], paint, glow });
}

// 云水母：圆顶伞盖（顶上淡、伞边深粉）+ 花边伞边 + 中间一簇花边短须 + 5 条长长的 S 形飘带，微微发光（伞盖朝上 +Y）；
// 脸朝前：大眼睛 + 腮红 + 小嘴。按「伞顶到原来须梢 = 1」归一化，飘带加长后伞盖大小不变
function cloudjelly({ body, belly, accent }) {
  const B = builder(14), rib = mixHex(belly, accent, .45), ribTip = mixHex(accent, 0xff6aa8, .3);
  bell(B, { rimY: .6, R: .5, H: .4, lobes: 6, paint: (c, n) => n.y < -.25 ? accent : c.y > .93 ? mixHex(body, belly, .5) : body, glowF: (c, n) => n.y < -.25 ? .35 : .14 });
  // 中间一簇花边短须（n = 6，半径一大一小交替；顶上一圈藏在伞里）
  B.loft([{ c: [0, .7, 0], rx: .13, ry: .13 }, { c: [0, .53, 0], rx: .12, ry: .12, f: k => [k & 1 ? .45 : 1, 0] }, { c: [0, .48, 0], rx: 0, ry: 0 }],
    { n: 6, axis: 'y', ap: v => [0, sm(.62, .2, v.y) * .6, 3.1, 0], color: accent, glow: .35 });
  for (let i = 0; i < 5; i++) {
    const a = Math.PI / 5 + i * Math.PI * 2 / 5;
    tendril(B, { a, r0: .25, y0: .65, y1: (i & 1) ? -.2 : -.08, w: .062, flat: .4, wave: .16, seg: 8, ph: .4 + i * .6, n: 4, i, paint: c => c.y < .2 ? ribTip : rib, glow: .3 });
  }
  const eye = eyeAt(B, [.15, .78, 0], [0, 0, 1], .07);
  const OFF = [0, .8, 0], r = B.finish('y', 1.01, OFF), s = r.s;
  return { ...r, kind: KIND.jelly, P: [.1, .05 * s, .1 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s, OFF), eyeType: 1, eyeFront: true, blush: 1, mouth: 1, emis: mixHex(accent, 0x000000, .82).getHex(), view: [1.15, .22] };
}

// 大鹏（天敌）：深棕身、白头白尾、金色钩喙，宽翅带五根飞羽，红冠红眼怒眉，金爪
function roc({ body, belly, accent }) {
  const B = builder(15), red = 0xd8322a, under = mixHex(body, belly, .28), dark = mixHex(body, 0x140e0a, .45), head = mixHex(belly, 0xffffff, .3);
  B.loft([R(.24, 0, 0, .02), R(.17, .12, .12, .02), R(.02, .18, .16, 0), R(-.16, .14, .12, .02), R(-.3, .07, .05, .04), R(-.36, 0, 0, .05)],
    { n: 16, paint: (c, n) => n.y < -.35 ? under : body });
  B.ell([0, .07, .29], [.1, .1, .12], { n: 12, m: 5, paint: (c, n) => n.y < -.5 && c.z < .3 ? under : head });
  B.loft([R(.36, .045, .055, .06), R(.45, .035, .045, .05), R(.52, .018, .025, .02), R(.53, 0, 0, -.03)], { n: 5, cap0: true, color: accent, flat: true });  // 钩喙
  for (const s of [1, -1]) {
    B.fin([[s * .1, .06, .14], [s * .62, .11, .14], [s * .62, .11, -.1], [s * .1, .05, -.14]], [0, 1, 0], .05,
      { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? under : body });
    B.fin([[s * .62, .11, .14], [s * 1.1, .09, .02], [s * 1.2, .06, -.12], [s * .62, .11, -.1]], [0, 1, 0], .035,
      { ap: () => [s, 2, 0, 0], paint: (c, n) => n.y < -.3 ? under : body });
    for (const [x, l] of [[.68, .26], [.8, .28], [.92, .28], [1.04, .24], [1.15, .18]])        // 飞羽
      B.pyr([[s * (x - .05), .1, -.08], [s * (x + .05), .095, -.09], [s * x, .07, -.07]], [s * (x + .07), .07, -.08 - l], { open: true, ap: () => [s, 2, 0, 0], color: dark, flat: true });
  }
  B.fin([[-.06, .05, -.3], [.06, .05, -.3], [.19, .05, -.56], [0, .05, -.6], [-.19, .05, -.56]], [0, 1, 0], .025, { ap: v => [0, 3, sm(-.3, -.6, v.z), 0], color: head });   // 白尾扇
  for (const [x, h] of [[0, .26], [.04, .22], [-.04, .22]]) B.pyr([[x - .025, .14, .3], [x + .025, .14, .3], [x, .15, .24]], [x * 1.5, h, .14], { open: true, color: red, flat: true });   // 红冠
  for (const s of [1, -1]) B.pyr([[s * .06, -.11, .08], [s * .1, -.11, .01], [s * .03, -.11, .0]], [s * .07, -.22, .1], { open: true, color: accent, flat: true });  // 爪
  const eye = eyeAt(B, [0, .1, .33], [1, 0, 0], .056);
  const r = B.finish('z', 1.08), s = r.s;
  return { ...r, kind: KIND.bird, P: [.1 * s, .06 * s, .62 * s, .012 * s], Q: [.42, .38, .9, .08], eye: eyeN(eye, s), eyeType: 2, view: [.5, .38], pose: [1.2, .7] };
}

// ---------- 海面 / 水下 ----------

// 飞鱼：圆头的流线身体（蓝背银肚）+ 两片大胸鳍（像翅膀）+ 叉尾
function flyfish({ body, belly, accent }) {
  const B = builder(16), sway = v => sm(.2, -.42, v.z) ** 1.3, fin = mixHex(accent, 0xffffff, .1);
  B.loft([R(.5, 0, 0, -.005), R(.44, .055, .06), R(.3, .095, .11, .01), R(.08, .1, .115, .01), R(-.16, .065, .075, .015), R(-.3, .025, .03, .02), R(-.33, 0, 0, .02)],
    { n: 7, ap: v => [sway(v), 0, 0, 0], paint: (c, n) => n.y > .25 ? body : n.y < -.45 ? belly : mixHex(belly, accent, .35) });
  B.bip([[0, .03, -.28], [0, .2, -.52], [0, .06, -.36]], [1, 0, 0], .012, { ap: v => [sway(v), 0, 0, 0], color: body });
  B.bip([[0, .0, -.28], [0, -.17, -.5], [0, -.01, -.36]], [1, 0, 0], .012, { ap: v => [sway(v), 0, 0, 0], color: body });
  for (const s of [1, -1]) B.fin([[s * .07, .04, .24], [s * .5, .07, .02], [s * .52, .06, -.12], [s * .38, .05, -.2], [s * .07, .04, .1]], [0, 1, 0], .02,
    { ap: () => [0, 1, s, 0], paint: (c, n) => n.y < -.3 ? mixHex(fin, belly, .5) : Math.abs(c.x) > .3 ? fin : mixHex(fin, body, .35), glow: .1 });
  const eye = eyeAt(B, [0, .045, .38], [1, 0, 0], .06);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.fish, P: [5 / s, .1 * s, 0, 0], Q: [.07 * s, .04 * s, .22, .08], eye: eyeN(eye, s), eyeType: 1 };
}

// 蝠鲼：扁平菱形（翼展 = 2 × 体长），背黑腹白，背上一对白色肩斑，前面两片头鳍，细长尾巴；翅膀从前往后波动
function manta({ body, belly, accent }) {
  const B = builder(17), H = .92, wing = v => [Math.min(1, Math.abs(v.x) / H), 0, Math.sign(v.x), 0];
  const ring = (x, f, b, top, bot) => ({ c: [x, (top - bot) / 2, (f + b) / 2], rx: (f - b) / 2, ry: (top + bot) / 2 });
  const spot = mixHex(belly, accent, .25), tipC = mixHex(body, accent, .35);
  // 翼形：前缘外凸、往后掠到尖，后缘内凹（不是风筝那样的直边菱形）；圈按翼展 15 段取
  const span = [];
  for (let i = -7; i <= 7; i++) {
    const u = Math.abs(i) / 7.6, x = Math.sign(i) * u * H, t = (1 - u) ** .85;
    span.push(ring(x, .44 - .2 * u - .3 * u * u, -.42 + .27 * u ** 2.4, .015 + .095 * t, .008 + .037 * t));
  }
  B.loft([
    { c: [-H, .03, -.1], rx: 0, ry: 0 },
    ...span,
    { c: [H, .03, -.1], rx: 0, ry: 0 },
  ], { n: 8, axis: 'x', ap: wing, paint: (c, n) => n.y < -.25 ? belly : Math.abs(c.x) > .7 ? tipC
    : (c.z > .0 && Math.abs(c.x) > .14 && Math.abs(c.x) < .45 && n.y > .3) ? spot : body });
  for (const s of [1, -1]) B.fin([[s * .1, .03, .4], [s * .21, .03, .37], [s * .17, 0, .6]], [0, 1, 0], .025, { ap: wing, paint: (c, n) => n.y < -.3 ? belly : tipC });   // 头鳍
  B.pyr([[-.03, .05, -.36], [.03, .05, -.36], [0, .01, -.36]], [0, .04, -1.15], { open: true, ap: v => [0, sm(-.36, -1.1, v.z), 0, 0], color: body, flat: true });  // 尾
  const eye = eyeAt(B, [.15, .06, .3], [1, .35, .25], .052);
  const r = B.finish('z', .9), s = r.s;
  return { ...r, kind: KIND.manta, P: [3 / s, .28 * s, .08 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 1, view: [.25, .95] };
}

// 沙丁鱼：五棱纺锤（青背、银白侧面、白肚），竖起的叉尾；同屏最多，所以面数最少
function sardine({ body, belly, accent }) {
  const B = builder(18), side = mixHex(belly, accent, .45), sw = v => [sm(.2, -.5, v.z) ** 1.2, 0, 0, 0];
  B.loft([R(.5, 0, 0, -.01), R(.36, .07, .09), R(.1, .09, .14, .01), R(-.2, .05, .07, .02), R(-.3, .02, .03, .025)],
    { n: 5, cap1: true, ap: sw, paint: (c, n) => n.y > .3 ? body : n.y < -.5 ? belly : side, glowF: (c, n) => n.y > .3 ? 0 : .15 });
  B.bip([[0, .03, -.27], [0, .17, -.5], [0, .02, -.4], [0, -.12, -.5]], [1, 0, 0], .012, { ap: sw, color: mixHex(body, accent, .3) });
  const eye = eyeAt(B, [0, .05, .3], [1, 0, 0], .064);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.fish, P: [6 / s, .09 * s, 0, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 1 };
}

// 水母：圆顶伞盖（深一点的青，顶上亮）+ 花边伞边 + 中间一簇短须 + 5 条 S 形的扁触手，自己发青光（伞盖朝上 +Y）；脸朝前（大眼睛 + 小嘴）
// 面数约 340（一群 3–6 只）：伞盖 5 片花边、触手 6 节
function jelly({ body, belly, accent }) {
  // 颜色比 species 的主色深一点、饱和一点（主色太浅，在卡通光照下几乎是白的），靠自发光亮起来
  const B = builder(19), deep = mixHex(accent, 0x0a86b8, .35), top = mixHex(body, accent, .35), ten = mixHex(body, accent, .55);
  bell(B, { rimY: .58, R: .44, H: .4, lobes: 5, paint: (c, n) => n.y < -.25 ? mixHex(accent, belly, .2) : c.y > .9 ? top : deep, glowF: (c, n) => n.y < -.25 ? .55 : c.y > .9 ? .2 : .3 });
  // 中间一簇短短的花边（像裙边，不是往下戳的尖）
  B.loft([{ c: [0, .67, 0], rx: .1, ry: .1 }, { c: [0, .51, 0], rx: .1, ry: .1, f: k => [k & 1 ? .45 : 1, 0] }, { c: [0, .47, 0], rx: 0, ry: 0 }],
    { n: 6, axis: 'y', ap: v => [0, sm(.6, .35, v.y) * .6, 2.2, 0], color: deep, glow: .45 });
  for (let i = 0; i < 5; i++) {            // 5 条扁飘带一样的触手（宽面朝外，S 形 + 梢上卷）
    const a = .3 + i * Math.PI * 2 / 5;
    tendril(B, { a, r0: .21, y0: .63, y1: (i & 1) ? -.24 : -.06, w: .05, flat: .5, wave: .13, seg: 6, ph: 1 + i * .55, n: 4, i, paint: () => ten, glow: .5 });
  }
  const eye = eyeAt(B, [.14, .76, 0], [0, 0, 1], .068);
  const OFF = [0, .78, 0], r = B.finish('y', 1.01, OFF), s = r.s;
  return { ...r, kind: KIND.jelly, P: [.14, .05 * s, .1 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s, OFF), eyeType: 1, eyeFront: true, blush: 1, mouth: 1, emis: mixHex(accent, 0x000000, .7).getHex(), view: [1.15, .22] };
}

// 鱿鱼：圆锥外套膜朝前（+Z），尖端两片鳍，大眼睛的头，后面 8 条触手；一下一下喷射
function squid({ body, belly, accent }) {
  const B = builder(20), spots = mixHex(accent, body, .2);
  B.loft([R(.5, 0, 0), R(.42, .06, .06), R(.28, .11, .11), R(.04, .135, .135), R(-.06, .09, .09)],
    { n: 12, cap1: true, ap: v => [v.z > -.06 ? sm(-.06, .1, v.z) : 0, 0, 0, 0], paint: (c, n) => n.y < -.3 ? belly : (n.y > .3 && c.z > .1) ? spots : body });
  B.ell([0, 0, -.14], [.12, .11, .1], { n: 10, m: 4, paint: (c, n) => n.y < -.3 ? belly : mixHex(body, belly, .25) });
  for (const s of [1, -1]) B.fin([[s * .05, 0, .47], [s * .22, 0, .34], [s * .1, 0, .2]], [0, 1, 0], .02, { ap: () => [1, 0, 0, 0], color: accent });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, x = Math.sin(a), y = Math.cos(a), l = i % 4 === 1 ? .62 : .5;
    B.pyr([[x * .07 - y * .025, y * .07 + x * .025, -.2], [x * .07 + y * .025, y * .07 - x * .025, -.2], [x * .045, y * .045, -.21]],
      [x * .1, y * .1, -l], { open: true, ap: v => [0, sm(-.2, -l, v.z), a, 0], paint: c => c.z < -.36 ? accent : mixHex(body, belly, .25), flat: true });
  }
  const eye = eyeAt(B, [0, .025, -.12], [1, 0, 0], .07);
  const r = B.finish('z', 1.05), s = r.s;
  return { ...r, kind: KIND.squid, P: [.14, .06 * s, .035 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 1 };
}

// 海龟：高高的圆顶壳（壳片深浅交替、壳顶更亮）+ 四片鳍（前鳍尖往下垂）+ 带脖子的大圆头，绿色
function turtle({ body, belly, accent }) {
  const B = builder(21), skin = mixHex(body, 0xc8e098, .45), top = mixHex(body, 0xd8e8a0, .25);
  // 壳片：中间一圈 8 大片、外面一圈 16 小片，深浅交替（壳顶最亮）
  const sector = (c, k) => Math.floor((Math.atan2(c.x, c.z + .02) + Math.PI) / (Math.PI * 2 / k)) & 1;
  const mid = mixHex(body, top, .5);
  B.loft([
    { c: [0, .34, -.02], rx: 0, ry: 0 },
    { c: [0, .31, -.02], rx: .19, ry: .23 },
    { c: [0, .24, -.02], rx: .32, ry: .39 },
    { c: [0, .15, -.02], rx: .39, ry: .47 },
    { c: [0, .05, -.02], rx: .41, ry: .49 },        // 壳边
    { c: [0, -.02, -.02], rx: .36, ry: .43 },
    { c: [0, -.045, -.02], rx: 0, ry: 0 },
  ], { n: 16, axis: 'y', rot: Math.PI / 16, paint: (c, n) => n.y < -.6 ? belly : c.y > .3 ? top : c.y > .165 ? (sector(c, 8) ? mid : body) : c.y > .07 ? (sector(c, 16) ? accent : body) : accent });
  // 头：从壳下伸出的脖子 + 圆圆的大脑袋
  B.loft([R(.28, .09, .08), R(.46, .12, .11, .03), R(.6, .085, .08, .03), R(.66, 0, 0, .025)], { n: 10, cap0: true, ap: () => [0, 3, 0, 0], paint: (c, n) => n.y < -.3 ? belly : skin });
  const dn = Math.tan(.26);           // 前鳍尖往下垂约 15°
  for (const s of [1, -1]) {          // 鳍：平滑的明暗（软软的，不是硬片）
    B.fin([[.25, 0, .2], [.5, -.01, .14], [.66, -.02, .03], [.72, -.03, -.08], [.5, -.02, -.02], [.28, 0, .06]].map(([x, y, z]) => [s * x, y - (x - .25) * dn, z]), [0, 1, 0], .035,
      { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? belly : skin, flat: false });
    B.fin([[s * .18, -.02, -.3], [s * .32, -.03, -.38], [s * .36, -.03, -.46], [s * .14, -.02, -.44]], [0, 1, 0], .028, { ap: () => [s, 2, 0, 0], color: skin, flat: false });
  }
  B.pyr([[-.03, -.01, -.42], [.03, -.01, -.42], [0, .02, -.42]], [0, -.01, -.56], { open: true, color: skin, flat: true });
  const eye = eyeAt(B, [0, .075, .5], [1, 0, 0], .06);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.turtle, P: [.25 * s, 0, .13 * s, .18 * s], Q: [.5, .35, .3, 0], eye: eyeN(eye, s), eyeType: 1, view: [.5, .6] };
}

// 鲨鱼（天敌）：流线身体、高背鳍（红尖）、新月尾、红眼怒眉、白牙咧嘴
function shark({ body, belly, accent }) {
  const B = builder(22), red = 0xc8302a, mouth = 0x3a1418, sway = v => .12 + .88 * sm(.3, -.45, v.z) ** 1.2;
  B.loft([R(.5, 0, 0, .0), R(.45, .05, .055, .01), R(.32, .1, .105, .01), R(.12, .125, .13, .0), R(-.08, .12, .125, .0), R(-.27, .065, .07, .01), R(-.38, .025, .03, .02), R(-.42, 0, 0, .02)],
    { n: 16, ap: v => [sway(v), 0, 0, 0], paint: (c, n) => n.y < -.35 ? ((c.z > .3 && c.z < .45) ? mouth : belly) : n.y < -.05 ? mixHex(body, belly, .35) : body });
  B.bip([[0, .1, .12], [0, .38, -.08], [0, .11, -.13]], [1, 0, 0], .025, { ap: v => [sway(v), 0, 0, 0], color: accent });
  B.bip([[0, .285, -.012], [0, .395, -.085], [0, .305, -.1]], [1, 0, 0], .022, { ap: v => [sway(v), 0, 0, 0], color: red });   // 背鳍的红尖（单独一小块，盖在鳍尖上）
  for (const s of [1, -1]) B.fin([[s * .1, -.05, .16], [s * .3, -.12, .04], [s * .42, -.18, -.07], [s * .1, -.06, .02]], [0, 1, 0], .022, { ap: v => [sway(v), 0, 0, 0], paint: (c, n) => n.y < -.3 ? belly : accent, flat: false });
  B.bip([[0, .03, -.34], [0, .3, -.56], [0, .06, -.44]], [1, 0, 0], .018, { ap: v => [sway(v), 0, 0, 0], color: accent });
  B.bip([[0, .0, -.36], [0, -.18, -.5], [0, .01, -.44]], [1, 0, 0], .018, { ap: v => [sway(v), 0, 0, 0], color: accent });
  B.bip([[0, -.1, -.14], [0, -.17, -.24], [0, -.08, -.22]], [1, 0, 0], .012, { ap: v => [sway(v), 0, 0, 0], color: accent });     // 腹鳍
  // 白牙：嘴边一排小三角（朝下）
  for (const s of [1, -1]) for (let k = 0; k < 4; k++) {
    const z = .41 - k * .035, x = .042 + k * .014, y = -.035 - k * .006;
    B.pyr([[s * x, y, z + .014], [s * x, y, z - .014], [s * (x - .012), y, z]], [s * (x + .004), y - .03, z], { open: true, color: 0xfaf6ee, flat: true, ap: () => [.12, 0, 0, 0] });
  }
  const eye = eyeAt(B, [0, .055, .34], [1, 0, 0], .04);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.fish, P: [4 / s, .07 * s, 0, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 2, view: [.55, .2] };
}

export const MODELS = { sparrow, gull, lavafinch, cloudjelly, roc, flyfish, manta, sardine, jelly, squid, turtle, shark };

// 显示放大（sim 里的体长不变，只是画大一点，远处更好认）：小猎物放得多，天敌放得少
export const VIS = { sparrow: 1.38, gull: 1.28, lavafinch: 1.3, cloudjelly: 1.15, roc: 1.12, flyfish: 1.35, manta: 1.12, sardine: 1.4, jelly: 1.25, squid: 1.25, turtle: 1.18, shark: 1.12 };
