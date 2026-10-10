// 12 种生物的造型（GDD §9.2）。每个函数用 creature-kit 的搭建器拼几块封闭的小实体，
// 返回 { geo, tris, kind, P, Q, eye, eyeType, emis, view }：
//   kind 动画类型（KIND），P / Q 动画参数（uP / uQ，位置类的值已经乘了归一化系数 s），
//   eye = [|x|, y, z, 半径]（片元里画圆眼），eyeType 1 普通 / 2 天敌（红眼怒眉），emis 自发光底色，
//   view 小图的视角 [偏航, 俯仰]
// 设计单位：体长约 1（z 从 +0.5 头到 -0.5 尾），最后 finish() 再精确归一化。
import { builder, KIND, backBelly, mixHex } from '../creature-kit.js';

// 建议的动画频率（Hz）：sim 推进 phase 时可参考（相位每秒走 2π·hz）；sim 没给 phase 时 view 自己按时间算
export const ANIM_HZ = { sparrow: 4.5, gull: 2.2, lavafinch: 5, cloudjelly: .5, roc: 1.1, flyfish: 3, manta: .45, sardine: 3, jelly: .6, squid: .8, turtle: .5, shark: 1.1 };

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const eyeAt = (B, o, d, r) => [...B.surf(o, d), r];
const eyeN = (e, s, off = [0, 0, 0]) => [(e[0] - off[0]) * s, (e[1] - off[1]) * s, (e[2] - off[2]) * s, e[3] * s];

// ---------- 天上 ----------

// 小雀：圆胖的五棱身体 + 两片三角翅，尾巴是一把扁扇（GDD：菱形身体加三角翅，褐色）
function sparrow({ body, belly, accent }) {
  const B = builder(11), beak = mixHex(accent, belly, .25);
  B.loft([
    { c: [0, .0, .54], rx: 0, ry: 0 },             // 喙尖
    { c: [0, .05, .36], rx: .15, ry: .17 },         // 头
    { c: [0, 0, .03], rx: .25, ry: .25 },           // 胸
    { c: [0, .08, -.5], rx: .16, ry: .02 },         // 尾扇
  ], { n: 5, cap1: true, paint: (c, n) => c.z > .42 ? beak : c.z < -.3 ? accent : n.y < -.35 ? belly : (c.z > .25 && n.y > .5) ? accent : body });
  for (const s of [1, -1]) B.fin([[s * .14, .07, .2], [s * .74, .12, -.06], [s * .14, .07, -.16]], [0, 1, 0], .05,
    { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? belly : Math.abs(c.x) > .4 ? accent : body });
  const eye = eyeAt(B, [0, .09, .31], [1, 0, 0], .05);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.bird, P: [.14 * s, .07 * s, 0, .02 * s], Q: [.95, 0, 0, .15], eye: eyeN(eye, s), eyeType: 1 };
}

// 海鸥：白身灰翼、翅膀长，翼尖黑，黄喙；两段翅（外段滞后，扇起来像 M）
function gull({ body, belly, accent }) {
  const B = builder(12), tip = mixHex(accent, 0x23272c, .75);
  B.loft([
    { c: [0, 0, .5], rx: 0, ry: 0 },               // 喙尖
    { c: [0, .04, .38], rx: .055, ry: .06 },        // 喙根
    { c: [0, .06, .3], rx: .11, ry: .12 },          // 头
    { c: [0, 0, .05], rx: .15, ry: .16 },           // 胸
    { c: [0, .04, -.45], rx: .1, ry: .015 },        // 尾
  ], { n: 4, cap1: true, paint: (c, n) => c.z > .37 ? 0xf2c040 : c.z < -.3 ? accent : n.y < -.2 ? belly : body });
  for (const s of [1, -1]) {
    B.fin([[s * .1, .07, .12], [s * .55, .09, .1], [s * .55, .09, -.07], [s * .1, .07, -.12]], [0, 1, 0], .04,
      { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? belly : accent });
    B.fin([[s * .55, .09, .1], [s * 1.05, .06, -.13], [s * .55, .09, -.07]], [0, 1, 0], .03,
      { ap: () => [s, 2, 0, 0], paint: (c, n) => n.y < -.3 ? belly : Math.abs(c.x) > .75 ? tip : accent });
  }
  const eye = eyeAt(B, [0, .09, .29], [1, 0, 0], .035);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.bird, P: [.1 * s, .07 * s, .55 * s, .015 * s], Q: [.55, .55, .8, .12], eye: eyeN(eye, s), eyeType: 1 };
}

// 熔岩雀：黑身橙腹（发光），头顶两根火冠，尾巴三条火舌
function lavafinch({ body, belly, accent }) {
  const B = builder(13);
  B.loft([
    { c: [0, -.01, .5], rx: 0, ry: 0 },
    { c: [0, .04, .36], rx: .14, ry: .15 },
    { c: [0, 0, .05], rx: .23, ry: .22 },
    { c: [0, .04, -.28], rx: .08, ry: .06 },
  ], { n: 4, cap1: true, paint: (c, n) => c.z > .42 ? accent : n.y < -.2 ? belly : body, glowF: (c, n) => n.y < -.2 ? .55 : 0 });
  for (const s of [1, -1]) B.fin([[s * .13, .06, .16], [s * .6, .12, -.08], [s * .13, .06, -.12]], [0, 1, 0], .05,
    { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? belly : Math.abs(c.x) > .38 ? belly : body, glowF: (c, n) => n.y < -.3 || Math.abs(c.x) > .38 ? .4 : 0 });
  // 火冠
  for (const s of [1, -1]) B.pyr([[s * .02, .15, .34], [s * .07, .13, .28], [s * .02, .14, .24]], [s * .05, .3, .18], { open: true, color: accent, glow: .6 });
  // 尾巴火舌：中间长、两边短
  for (const [x, y, l] of [[0, .07, .62], [.07, .04, .5], [-.07, .04, .5]])
    B.pyr([[x - .035, y, -.22], [x + .035, y, -.22], [x, y - .05, -.24]], [x * 1.8, y + .03, -l], { open: true, paint: c => c.z < -.38 ? accent : belly, glow: .7 });
  const eye = eyeAt(B, [0, .07, .32], [1, 0, 0], .045);
  const r = B.finish('z', .97), s = r.s;
  return { ...r, kind: KIND.bird, P: [.13 * s, .06 * s, 0, .02 * s], Q: [1.0, 0, 0, .18], eye: eyeN(eye, s), eyeType: 1, emis: 0x000000 };
}

// 云水母：车削的伞盖 + 4 条飘带，淡粉色，微微发光（伞盖朝上 +Y，按高度归一化）
function cloudjelly({ body, belly, accent }) {
  const B = builder(14);
  B.loft([
    { c: [0, 1.0, 0], rx: 0, ry: 0 },
    { c: [0, .9, 0], rx: .3, ry: .3 },
    { c: [0, .68, 0], rx: .48, ry: .48 },          // 伞边
    { c: [0, .72, 0], rx: .34, ry: .34 },
    { c: [0, .78, 0], rx: 0, ry: 0 },
  ], { n: 8, axis: 'y', rot: Math.PI / 8, ap: v => [sm(.95, .68, v.y), 0, 0, 0],
    paint: (c, n) => n.y < -.2 ? belly : c.y < .8 ? mixHex(body, accent, .35) : body, glowF: (c, n) => n.y < -.2 ? .35 : .12 });
  // 飘带：三棱、三段，越往下越细
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(a) * .26, z = Math.cos(a) * .26, rr = [.05, .04, .03, 0];
    B.loft([0, 1, 2, 3].map(k => ({ c: [x * (1 + k * .12), .74 - k * .24, z * (1 + k * .12)], rx: rr[k], ry: rr[k] * .45 })),
      { n: 3, axis: 'y', rot: -a, cap0: true, ap: v => [0, sm(.74, .02, v.y), i * 1.7, 0], paint: c => c.y < .3 ? accent : mixHex(belly, accent, .4), glow: .3 });
  }
  const eye = eyeAt(B, [0, .82, 0], [.42, 0, 1], .045);
  const OFF = [0, .84, 0], r = B.finish('y', 0, OFF), s = r.s;
  return { ...r, kind: KIND.jelly, P: [.12, .05 * s, .07 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s, OFF), eyeType: 1, emis: mixHex(accent, 0x000000, .82).getHex(), view: [.45, .5] };
}

// 大鹏（天敌）：深棕身、白头白尾、金喙，尖翅带三根飞羽，红冠红眼
function roc({ body, belly, accent }) {
  const B = builder(15), red = 0xd8322a, under = mixHex(body, belly, .3);
  B.loft([
    { c: [0, -.045, .53], rx: 0, ry: 0 },          // 钩喙尖
    { c: [0, .03, .43], rx: .045, ry: .055 },       // 喙根
    { c: [0, .05, .34], rx: .1, ry: .1 },           // 头
    { c: [0, .02, .2], rx: .1, ry: .1 },            // 脖
    { c: [0, 0, .02], rx: .17, ry: .15 },           // 胸
    { c: [0, .02, -.2], rx: .11, ry: .1 },          // 腰
    { c: [0, .04, -.32], rx: .06, ry: .04 },        // 尾根
    { c: [0, .05, -.52], rx: .17, ry: .015 },       // 尾扇
  ], { n: 6, cap1: true, paint: (c, n) => c.z > .41 ? accent : c.z > .17 ? belly : c.z < -.33 ? belly : n.y < -.3 ? under : body });
  for (const s of [1, -1]) {
    B.fin([[s * .12, .05, .12], [s * .62, .1, .12], [s * .62, .1, -.1], [s * .12, .05, -.14]], [0, 1, 0], .05,
      { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? under : body });
    B.fin([[s * .62, .1, .12], [s * 1.08, .08, 0], [s * 1.25, .05, -.15], [s * .62, .1, -.1]], [0, 1, 0], .035,
      { ap: () => [s, 2, 0, 0], paint: (c, n) => n.y < -.3 ? under : body });
    for (const [x, l] of [[.72, .3], [.86, .28], [1.0, .24]])        // 飞羽
      B.pyr([[s * (x - .05), .095, -.1], [s * (x + .05), .09, -.1], [s * x, .07, -.08]], [s * (x + .08), .07, -.1 - l], { open: true, ap: () => [s, 2, 0, 0], color: mixHex(body, 0x1a120c, .5) });
  }
  for (const s of [1, -1]) B.pyr([[s * .03, .14, .3], [s * .08, .1, .28], [s * .03, .12, .22]], [s * .07, .2, .12], { open: true, color: red });   // 红冠
  for (const s of [1, -1]) B.pyr([[s * .06, -.1, .06], [s * .09, -.1, 0], [s * .04, -.1, -.02]], [s * .07, -.2, .08], { open: true, color: accent });  // 爪
  const eye = eyeAt(B, [0, .08, .36], [1, 0, 0], .04);
  const r = B.finish('z', 1.07), s = r.s;
  return { ...r, kind: KIND.bird, P: [.12 * s, .05 * s, .62 * s, .012 * s], Q: [.42, .38, .9, .08], eye: eyeN(eye, s), eyeType: 2 };
}

// ---------- 海面 / 水下 ----------

// 飞鱼：细长银蓝身体 + 两片大胸鳍（像翅膀）+ 叉尾
function flyfish({ body, belly, accent }) {
  const B = builder(16), sway = v => sm(.25, -.4, v.z) ** 1.3;
  B.loft([
    { c: [0, 0, .5], rx: 0, ry: 0 },
    { c: [0, .01, .14], rx: .085, ry: .1 },
    { c: [0, .01, -.3], rx: 0, ry: 0 },
  ], { n: 4, ap: v => [sway(v), 0, 0, 0], paint: backBelly(body, belly, -.2) });
  B.bip([[0, .03, -.24], [0, .17, -.5], [0, .03, -.34]], [1, 0, 0], .012, { ap: v => [sway(v), 0, 0, 0], color: accent });
  B.bip([[0, -.01, -.24], [0, -.15, -.48], [0, -.01, -.34]], [1, 0, 0], .012, { ap: v => [sway(v), 0, 0, 0], color: accent });
  for (const s of [1, -1]) B.fin([[s * .06, .03, .2], [s * .5, .05, -.04], [s * .42, .04, -.2], [s * .06, .03, .08]], [0, 1, 0], .02,
    { ap: () => [0, 1, s, 0], paint: (c, n) => n.y < -.3 ? mixHex(accent, belly, .5) : accent, glow: .12 });
  const eye = eyeAt(B, [0, .03, .32], [1, 0, 0], .035);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.fish, P: [5 / s, .1 * s, 0, 0], Q: [.06 * s, .03 * s, .22, .08], eye: eyeN(eye, s), eyeType: 1 };
}

// 蝠鲼：扁平菱形（翼展 = 2 × 体长），背黑腹白，前面两片头鳍，细长尾巴；翅膀从前往后波动
function manta({ body, belly, accent }) {
  const B = builder(17), H = .92, wing = v => [Math.min(1, Math.abs(v.x) / H), 0, Math.sign(v.x), 0];
  const ring = (x, f, b, top, bot) => ({ c: [x, (top - bot) / 2, (f + b) / 2], rx: (f - b) / 2, ry: (top + bot) / 2 });
  B.loft([
    { c: [-H, .02, -.12], rx: 0, ry: 0 },
    ring(-.62, .1, -.25, .045, .015),
    ring(-.3, .3, -.33, .07, .03),
    ring(0, .44, -.42, .1, .045),
    ring(.3, .3, -.33, .07, .03),
    ring(.62, .1, -.25, .045, .015),
    { c: [H, .02, -.12], rx: 0, ry: 0 },
  ], { n: 4, axis: 'x', ap: wing, paint: (c, n) => n.y < -.25 ? belly : Math.abs(c.x) > .7 ? mixHex(body, accent, .35)
    : (c.z > .02 && Math.abs(c.x) > .12 && Math.abs(c.x) < .5) ? mixHex(belly, accent, .35) : body });   // 背上一对白色肩斑：深水里也认得出
  for (const s of [1, -1]) B.fin([[s * .1, .02, .4], [s * .2, .02, .38], [s * .16, -.01, .58]], [0, 1, 0], .02, { ap: wing, color: accent });   // 头鳍
  B.pyr([[-.03, .05, -.36], [.03, .05, -.36], [0, .01, -.36]], [0, .04, -1.15], { open: true, ap: v => [0, sm(-.36, -1.1, v.z), 0, 0], color: body });  // 尾
  const eye = eyeAt(B, [.12, .05, .3], [1, .4, .2], .035);
  const r = B.finish('z', .9), s = r.s;
  return { ...r, kind: KIND.manta, P: [3 / s, .28 * s, .08 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 1, view: [.25, 1.05] };
}

// 沙丁鱼：三棱纺锤（顶面青背、两侧银白），竖起的尾扇；同屏最多，所以只用 16 面
function sardine({ body, belly, accent }) {
  const B = builder(18);
  B.loft([
    { c: [0, 0, .5], rx: 0, ry: 0 },
    { c: [0, .03, .14], rx: .085, ry: .13 },
    { c: [0, .02, -.28], rx: .03, ry: .04 },
    { c: [0, .04, -.5], rx: .012, ry: .15 },
  ], { n: 3, rot: Math.PI, cap1: true, ap: v => [sm(.2, -.5, v.z) ** 1.2, 0, 0, 0], paint: (c, n) => c.z < -.3 ? accent : n.y > .3 ? body : mixHex(belly, body, .38) });
  const eye = eyeAt(B, [0, .045, .3], [1, 0, 0], .038);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.fish, P: [6 / s, .09 * s, 0, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 1 };
}

// 水母：半球伞盖 + 5 根短须，青色，自己发光（伞盖朝上 +Y）
function jelly({ body, belly, accent }) {
  const B = builder(19);
  B.loft([
    { c: [0, 1.0, 0], rx: 0, ry: 0 },
    { c: [0, .9, 0], rx: .3, ry: .3 },
    { c: [0, .62, 0], rx: .45, ry: .45 },
    { c: [0, .67, 0], rx: .3, ry: .3 },
    { c: [0, .72, 0], rx: 0, ry: 0 },
  ], { n: 7, axis: 'y', ap: v => [sm(.98, .62, v.y), 0, 0, 0], paint: (c, n) => n.y < -.2 ? accent : c.y > .93 ? belly : body, glowF: (c, n) => n.y < -.2 ? .5 : .2 });
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 + .3, x = Math.sin(a) * .24, z = Math.cos(a) * .24;
    B.pyr([[x - .035, .68, z], [x + .02, .68, z + .03], [x + .02, .68, z - .03]], [x * 1.25, .02 + (i % 2) * .12, z * 1.25],
      { open: true, ap: v => [0, sm(.68, .02, v.y), i * 1.3, 0], color: mixHex(body, belly, .4), glow: .45 });
  }
  const eye = eyeAt(B, [0, .8, 0], [.4, 0, 1], .045);
  const OFF = [0, .81, 0], r = B.finish('y', 0, OFF), s = r.s;
  return { ...r, kind: KIND.jelly, P: [.16, .05 * s, .08 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s, OFF), eyeType: 1, emis: mixHex(accent, 0x000000, .72).getHex(), view: [.45, .5] };
}

// 鱿鱼：锥形外套膜朝前（+Z），尾端两片鳍，后面 8 条触手；一下一下喷射
function squid({ body, belly, accent }) {
  const B = builder(20);
  B.loft([
    { c: [0, 0, .5], rx: 0, ry: 0 },
    { c: [0, 0, .3], rx: .1, ry: .1 },
    { c: [0, 0, 0], rx: .13, ry: .13 },
    { c: [0, 0, -.07], rx: .085, ry: .085 },       // 脖
    { c: [0, 0, -.17], rx: .11, ry: .1 },          // 头
    { c: [0, 0, -.23], rx: .05, ry: .05 },
  ], { n: 5, cap1: true, ap: v => [v.z > -.07 ? sm(-.07, .1, v.z) : 0, 0, 0, 0], paint: (c, n) => c.z < -.07 ? mixHex(body, belly, .3) : n.y < -.3 ? belly : (c.z > .12 && n.y > .3) ? accent : body });
  for (const s of [1, -1]) B.fin([[s * .06, 0, .45], [s * .21, 0, .33], [s * .1, 0, .2]], [0, 1, 0], .02, { ap: () => [1, 0, 0, 0], color: accent });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, x = Math.sin(a), y = Math.cos(a), l = i % 4 === 1 ? .62 : .5;
    B.pyr([[x * .07 - y * .025, y * .07 + x * .025, -.2], [x * .07 + y * .025, y * .07 - x * .025, -.2], [x * .045, y * .045, -.21]],
      [x * .1, y * .1, -l], { open: true, ap: v => [0, sm(-.2, -l, v.z), a, 0], paint: c => c.z < -.36 ? accent : mixHex(body, belly, .25) });
  }
  const eye = eyeAt(B, [0, .02, -.15], [1, 0, 0], .05);
  const r = B.finish('z', 1.05), s = r.s;
  return { ...r, kind: KIND.squid, P: [.14, .06 * s, .035 * s, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 1 };
}

// 海龟：圆壳（壳片深浅交替）+ 四片鳍 + 头，绿色
function turtle({ body, belly, accent }) {
  const B = builder(21), skin = mixHex(body, belly, .45);
  const plate = c => { const a = Math.atan2(c.x, c.z + .02); return (Math.round(a / (Math.PI / 4)) & 1) ? accent : body; };
  B.loft([
    { c: [0, .22, -.02], rx: 0, ry: 0 },
    { c: [0, .17, -.02], rx: .25, ry: .31 },
    { c: [0, .04, -.02], rx: .4, ry: .48 },        // 壳边
    { c: [0, -.04, -.02], rx: .3, ry: .38 },
    { c: [0, -.06, -.02], rx: 0, ry: 0 },
  ], { n: 8, axis: 'y', rot: Math.PI / 8, paint: (c, n) => n.y < -.3 ? belly : c.y > .19 ? mixHex(body, accent, .5) : plate(c) });
  B.loft([
    { c: [0, 0, .28], rx: .07, ry: .06 },
    { c: [0, .03, .47], rx: .09, ry: .08 },
    { c: [0, .015, .58], rx: 0, ry: 0 },
  ], { n: 5, cap0: true, ap: () => [0, 3, 0, 0], paint: (c, n) => n.y < -.3 ? belly : skin });
  for (const s of [1, -1]) {
    B.fin([[s * .25, 0, .2], [s * .64, -.02, .04], [s * .68, -.03, -.1], [s * .28, 0, .06]], [0, 1, 0], .03, { ap: () => [s, 1, 0, 0], paint: (c, n) => n.y < -.3 ? belly : skin });
    B.fin([[s * .18, -.02, -.3], [s * .36, -.03, -.46], [s * .14, -.02, -.44]], [0, 1, 0], .025, { ap: () => [s, 2, 0, 0], color: skin });
  }
  B.pyr([[-.03, -.01, -.42], [.03, -.01, -.42], [0, .02, -.42]], [0, -.01, -.56], { open: true, color: skin });
  const eye = eyeAt(B, [0, .055, .5], [1, 0, 0], .03);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.turtle, P: [.25 * s, 0, .13 * s, .18 * s], Q: [.5, .35, .3, 0], eye: eyeN(eye, s), eyeType: 1, view: [.5, .65] };
}

// 鲨鱼（天敌）：流线身体、高背鳍（红尖）、新月尾、红眼怒眉
function shark({ body, belly, accent }) {
  const B = builder(22), red = 0xc8302a, sway = v => .12 + .88 * sm(.3, -.45, v.z) ** 1.2;
  B.loft([
    { c: [0, .02, .5], rx: 0, ry: 0 },
    { c: [0, .02, .41], rx: .06, ry: .065 },
    { c: [0, .01, .2], rx: .115, ry: .12 },
    { c: [0, 0, -.05], rx: .12, ry: .125 },
    { c: [0, .01, -.27], rx: .065, ry: .07 },
    { c: [0, .02, -.38], rx: .025, ry: .03 },
    { c: [0, .02, -.42], rx: 0, ry: 0 },
  ], { n: 6, ap: v => [sway(v), 0, 0, 0], paint: (c, n) => n.y < -.3 ? (c.z > .3 && c.z < .44 ? red : belly) : body });
  B.bip([[0, .1, .1], [0, .38, -.1], [0, .11, -.13]], [1, 0, 0], .025, { ap: v => [sway(v), 0, 0, 0], paint: c => c.y > .27 ? red : accent });
  for (const s of [1, -1]) B.fin([[s * .1, -.05, .16], [s * .4, -.17, -.06], [s * .1, -.06, .02]], [0, 1, 0], .02, { ap: v => [sway(v), 0, 0, 0], paint: (c, n) => n.y < -.3 ? belly : accent });
  B.bip([[0, .03, -.34], [0, .3, -.56], [0, .06, -.44]], [1, 0, 0], .018, { ap: v => [sway(v), 0, 0, 0], color: accent });
  B.bip([[0, .0, -.36], [0, -.18, -.5], [0, .01, -.44]], [1, 0, 0], .018, { ap: v => [sway(v), 0, 0, 0], color: accent });
  B.bip([[0, -.1, -.14], [0, -.17, -.24], [0, -.08, -.22]], [1, 0, 0], .012, { ap: v => [sway(v), 0, 0, 0], color: accent });     // 腹鳍
  const eye = eyeAt(B, [0, .05, .33], [1, 0, 0], .028);
  const r = B.finish(), s = r.s;
  return { ...r, kind: KIND.fish, P: [4 / s, .07 * s, 0, 0], Q: [0, 0, 0, 0], eye: eyeN(eye, s), eyeType: 2 };
}

export const MODELS = { sparrow, gull, lavafinch, cloudjelly, roc, flyfish, manta, sardine, jelly, squid, turtle, shark };
