// 金色领头追逐（GDD §19.3 A 的首版切片）+ 永久特性（§19.4）。纯逻辑。
// 流程：远处一道光柱（线索）→ 靠近 55 米开始追 → 领头「冲一阵、累一阵」地逃（累的时候慢，是追上的窗口），带着一小群跟班
//      → 吃到领头：第一次学会这条龙的特性（永久），每次都 +LEADER_PTS 成长；45 秒没追上 / 离太远就跑掉，过一会儿再来。
// 特性（2026-10-24 扩到每条龙 3 个，最多带 2 个：学会时有空位就自动带上，暂停菜单「特性」里换）：
//   火龙 ember 余烬热浪：吃烤熟的猎物时，周围的猎物一起烤熟（热浪烤熟的再吃不会再起热浪）
//        echo  回声龙吼（少年起）：龙吼 1.1 秒后在龙身边再吼一次，范围小一圈（回声不再起回声）
//        skimF 掠水吸附（少年起）：扎水抓到鱼后 3 秒内，嘴边的吸力和判定变大（连着扎、连着抓）
//   海龙 eddy  残留漩涡：冲刺结束的地方留下一个小漩涡（2.6 秒），把附近的鱼卷进去转晕
//        surge 疾潮（少年起）：冲刺中每吃一口，冲刺多 0.4 秒（每次冲刺最多多 1.2 秒）、冷却少 1 秒
//        skimS 跃浪吸附（少年起）：跃出抓到鸟后 3 秒内，嘴边的吸力和判定变大
// 领头：按顺序出这条龙还没学会、现在用得上的特性的领头；都学会了就随机出（只给成长）
// 同一时间只有一个大事件：猎场进行中不出领头，领头在场时不开猎场（hunts.js 里也判断 S.leader）。
import { makeRng, clamp, lerp, damp } from './rng.js';
import { groundAt, seabedY, waveH } from './world.js';
import { makeGroup } from './creatures.js';
import { SPECIES } from '../config/species.js';

export const LEADER_PTS = 10;
export const TRAITS = {
  ember: { kind: 'fire', stage: 0, zh: '余烬热浪', desc: '吃烤熟的，周围的也一起烤熟', icon: 'fire', leader: '余烬雀', sp: 'sparrow', n: 6 },
  echo: { kind: 'fire', stage: 1, zh: '回声龙吼', desc: '龙吼过一会儿再吼一次', icon: 'roar', leader: '鸣风信天翁', sp: 'albatross', n: 3 },
  skimF: { kind: 'fire', stage: 1, zh: '掠水吸附', desc: '扎水抓到鱼后，3 秒内吸力变大', icon: 'plunge', leader: '银翼海鸥', sp: 'gull', n: 6 },
  eddy: { kind: 'sea', stage: 0, zh: '残留漩涡', desc: '冲刺结束留下一个小漩涡', icon: 'vortex', leader: '涡心鱼', sp: 'sardine', n: 10 },
  surge: { kind: 'sea', stage: 1, zh: '疾潮', desc: '冲刺时每吃一口，冲得更久', icon: 'dash', leader: '疾潮鲭', sp: 'mackerel', n: 10 },
  skimS: { kind: 'sea', stage: 1, zh: '跃浪吸附', desc: '跃出抓到鸟后，3 秒内吸力变大', icon: 'breach', leader: '跃浪飞鱼', sp: 'flyfish', n: 6 },
};
export const TRAIT_LIST = { fire: ['ember', 'echo', 'skimF'], sea: ['eddy', 'surge', 'skimS'] };
export const EQUIP_MAX = 2;
// 这个特性现在生效吗（学会了、而且带着）
export const traitOn = (S, id) => !!(S.traits && S.traits[id] && S.equip && S.equip.includes(id));
// 这次出哪个特性的领头：还没学会、阶段够的排前面；都学会了就随机
function pickTrait(S) {
  const list = TRAIT_LIST[S.kind].filter(id => TRAITS[id].stage <= S.stage);
  const miss = list.find(id => !S.traits[id]);
  if (miss) return miss;
  return list[Math.floor(S.leaderRng() * list.length)] || TRAIT_LIST[S.kind][0];
}
const FIRST_AT = 55, CUE_MAX = 45, CHASE_MAX = 45, START_R = 55, LOSE_R = 260;

export function initLeaders(S, traits = {}, equip = null) {
  S.traits = {};
  for (const k in traits || {}) if (traits[k] && TRAITS[k] && TRAITS[k].kind === S.kind) S.traits[k] = 1;
  // 带着的特性：存档里有就用（只留学会了的、最多 2 个），旧存档没有就把学会的前 2 个带上
  S.equip = (Array.isArray(equip) ? equip : TRAIT_LIST[S.kind]).filter(id => S.traits[id]).slice(0, EQUIP_MAX);
  S.echo = null; S.skimT = 0;
  S.leader = null;
  S.leaderNext = FIRST_AT;
  S.leaderRng = makeRng((S.seed | 0) ^ 0x4c454144);
  S.eddy = null;
}

const heroSpeed = S => S.cfg.level || S.cfg.cruise || 20;

// 在主角前方找个空地放线索（火龙：天上、离山远；海龙：浅海里、离海底远）
function placeCue(S) {
  const h = S.hero, r = S.leaderRng, fire = S.kind === 'fire';
  for (let k = 0; k < 14; k++) {
    const a = h.yaw + r.range(-.5, .5), d = r.range(120, 170);
    const x = h.x + Math.sin(a) * d, z = h.z + Math.cos(a) * d;
    if (fire) {
      const y = clamp(h.y, 35, 140);
      if (groundAt(x, z) > y - 25) continue;
      return { x, y, z };
    }
    const y = clamp(h.y, -14, -5);
    if (groundAt(x, z) > -5 || seabedY(x, z) > y - 8) continue;
    return { x, y, z };
  }
  return null;
}

function startCue(S) {
  const trait = pickTrait(S), T = TRAITS[trait], p = placeCue(S);
  if (!p) return null;
  const world = S.rng;
  let g;
  try { S.rng = S.leaderRng; g = makeGroup(S, T.sp, p.x, p.y, p.z, T.n, { leadMotion: true, home: null }); }
  finally { S.rng = world; }
  const members = S.creatures.filter(c => c.g === g);
  const c = members[0];
  c.special = trait; c.gold = false; c.baseSize *= 1.7; c.leadMotion = true; c.yaw = S.hero.yaw;
  const L = S.leader = { phase: 'cue', trait, x: p.x, y: p.y, z: p.z, cx: p.x, cy: p.y, cz: p.z, gid: g.id, cid: c.id, g, t: 0, cyc: 0, tired: false, away: 0, yaw: S.hero.yaw,
    first: !S.traits[trait] };
  S.events.push({ type: 'leaderCue', trait, first: L.first, x: p.x, y: p.y, z: p.z });
  return L;
}

// 结束：跟班变回普通的群（慢慢散开）；没吃到的领头飞走
function endLeader(S, caught) {
  const L = S.leader; if (!L) return;
  if (L.g) { delete L.g.leadMotion; L.g.huntRetire = S.t + 40; }
  const c = S.creatures.find(o => o.id === L.cid);
  if (c && !caught) c.dying = c.dying || .001;
  if (!caught) S.events.push({ type: 'leaderEnd', caught: false, trait: L.trait, chased: L.phase === 'chase' });
  S.leader = null;
  const k = S.env && (S.env.night > .5 || S.env.rain > .5) ? .7 : 1;    // 夜里 / 下雨更常见
  S.leaderNext = S.t + (caught ? 120 : L.phase === 'chase' ? 40 : 30) * k;
}

// 吃到领头（sim.js 的 eat 里调）
export function leaderCaught(S, c) {
  const L = S.leader, trait = c.special, T = TRAITS[trait];
  const first = !S.traits[trait];
  S.traits[trait] = 1;
  S.pts += LEADER_PTS;
  S.events.push({ type: 'leaderEnd', caught: true, trait, first, pts: LEADER_PTS, x: c.x, y: c.y, z: c.z });
  let equipped = S.equip.includes(trait);
  if (first && S.equip.length < EQUIP_MAX) { S.equip.push(trait); equipped = true; }
  if (first) S.events.push({ type: 'trait', id: trait, zh: T.zh, desc: T.desc + (equipped ? '' : '（暂停菜单里换上）'), icon: T.icon, equipped });
  if (L && L.cid === c.id) endLeader(S, true);
}

export function stepLeaders(S, dt) {
  if (!S.leaderRng) initLeaders(S, S.traits);
  const h = S.hero, fire = S.kind === 'fire';
  stepEddy(S, dt);
  stepEcho(S, dt);
  if (S.skimT > 0) S.skimT -= dt;
  let L = S.leader;
  if (!L) {
    if (S.t < S.leaderNext || S.hunt || S.stats.eaten < 2) return;
    if (h.medium !== (fire ? 'air' : 'water') || (!fire && h.y < -30)) { S.leaderNext = S.t + 3; return; }
    if (!startCue(S)) S.leaderNext = S.t + 5;
    return;
  }
  L.t += dt;
  const c = S.creatures.find(o => o.id === L.cid);
  if (!c || c.dying) { endLeader(S, false); return; }
  const d = Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z);
  const busy = c.roast > 0 || c.stun > 0 || c.daze > 0;     // 烤熟 / 撞晕 / 吼晕：creatures.js 照常处理，这里不推
  if (L.phase === 'cue') {
    // 线索：领头在原地慢慢绕小圈，跟班围着它
    if (!busy) {
      const a = L.t * .6;
      c.vx = Math.cos(a) * 3; c.vz = -Math.sin(a) * 3; c.vy = (L.cy + Math.sin(L.t) * 1.5 - c.y) * 1.5;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      face(c, dt); c.flap = .7; c.phase += dt * 12;
    }
    L.g.x = c.x; L.g.y = c.y; L.g.z = c.z;
    if (d < START_R && h.medium === (fire ? 'air' : 'water')) {
      L.phase = 'chase'; L.t = 0; L.cyc = 0; L.tired = false;
      L.yaw = Math.atan2(c.x - h.x, c.z - h.z);
      S.events.push({ type: 'leaderChase', trait: L.trait });
    } else if (L.t > CUE_MAX || d > 450) endLeader(S, false);
  } else {
    // 追：冲 2.2 秒（和龙差不多快）→ 累 1.8 秒（慢到 35%）。第一次（教学）冲得慢一点
    L.cyc += dt;
    if (!L.tired && L.cyc > 2.2) { L.tired = true; L.cyc = 0; S.events.push({ type: 'leaderTired', x: c.x, y: c.y, z: c.z }); }
    else if (L.tired && L.cyc > 1.8) { L.tired = false; L.cyc = 0; }
    if (!busy) {
      const away = Math.atan2(c.x - h.x, c.z - h.z);
      let want = away + Math.sin(L.t * .5 + c.id) * .6;
      // 前方 30 米有山 / 浅水：往旁边拐
      const px = c.x + Math.sin(L.yaw) * 30, pz = c.z + Math.cos(L.yaw) * 30;
      const blocked = fire ? groundAt(px, pz) > c.y - 18 : groundAt(px, pz) > -5 || seabedY(px, pz) > c.y - 4;
      if (blocked) want = L.yaw + 1.6;
      let dy = Math.atan2(Math.sin(want - L.yaw), Math.cos(want - L.yaw));
      L.yaw += clamp(dy, -1.4 * dt, 1.4 * dt);
      const v = heroSpeed(S) * (L.tired ? .35 : L.first ? .85 : 1);
      const ty = fire ? clamp(lerp(c.y, h.y, .5), 30, 160) : clamp(lerp(c.y, h.y, .5), -16, -3);
      const k = damp(3, dt);
      c.vx += (Math.sin(L.yaw) * v - c.vx) * k; c.vz += (Math.cos(L.yaw) * v - c.vz) * k; c.vy += ((ty - c.y) * .8 - c.vy) * k;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (fire) c.y = Math.max(c.y, groundAt(c.x, c.z) + 10);
      else c.y = clamp(c.y, seabedY(c.x, c.z) + 2, waveH(c.x, c.z, S.t) - 1);
      face(c, dt); c.flap = L.tired ? .25 : 1; c.phase += dt * (L.tired ? 6 : 16);
    }
    // 跟班的锚点慢慢跟在领头后面
    const k2 = damp(1.2, dt);
    L.g.x = lerp(L.g.x, c.x, k2); L.g.y = lerp(L.g.y, c.y, k2); L.g.z = lerp(L.g.z, c.z, k2);
    L.away = d > LOSE_R ? L.away + dt : 0;
    if (L.t > CHASE_MAX || L.away > 4) { endLeader(S, false); return; }
  }
  L.x = c.x; L.y = c.y; L.z = c.z;
}

function face(c, dt) {
  const hs = Math.hypot(c.vx, c.vz);
  if (hs > .3) { const ny = Math.atan2(c.vx, c.vz); c.yaw += Math.atan2(Math.sin(ny - c.yaw), Math.cos(ny - c.yaw)) * damp(6, dt); }
  c.pitch = lerp(c.pitch, clamp(Math.atan2(c.vy, Math.max(.5, hs)), -1, 1), damp(5, dt));
}

// ---------- 特性：余烬热浪 ----------
// 吃掉烤熟的猎物 c（还没从列表里删）时调：周围最多 6 只一起烤熟（标 heat，不再起热浪）
export function heatWave(S, c) {
  if (!traitOn(S, 'ember') || S.kind !== 'fire' || !(c.cooked >= 1) || c.heat) return;
  const R = 10 + S.hero.len * .5; let n = 0;
  for (const o of S.creatures) {
    if (o === c || o.dying || o.roast > 0 || !(o.edible || o.edibleCooked) || o.special) continue;
    if (Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z) > R) continue;
    o.cooked = 1; o.roast = 3.5; o.heat = 1; o.vx *= .3; o.vz *= .3;
    S.events.push({ type: 'cook', id: o.id, sp: o.sp });
    if (++n >= 6) break;
  }
  if (n) S.events.push({ type: 'heatwave', x: c.x, y: c.y, z: c.z, r: R, n });
}

// ---------- 特性：残留漩涡 ----------
export function eddyCheck(S) {
  const h = S.hero;
  const was = h.prevDash || 0; h.prevDash = h.dashT || 0;
  if (!(was > 0) && h.dashT > 0) h.surgeAdd = 0;   // 新的一次冲刺：疾潮的加时重新算
  if (!traitOn(S, 'eddy') || S.kind !== 'sea' || !(was > 0) || h.dashT > 0 || h.medium !== 'water') return;
  S.eddy = { x: h.x, y: h.y, z: h.z, t: 2.6, r: 9 + h.len * .4 };
  S.events.push({ type: 'eddy', x: h.x, y: h.y, z: h.z, r: S.eddy.r });
}
function stepEddy(S, dt) {
  const E = S.eddy; if (!E) return;
  E.t -= dt; if (E.t <= 0) { S.eddy = null; return; }
  for (const c of S.creatures) {
    if (c.dying || c.special || !(c.edible || c.edibleCooked)) continue;
    const dx = c.x - E.x, dy = c.y - E.y, dz = c.z - E.z, d = Math.hypot(dx, dy, dz);
    if (d > E.r || c.y > waveH(c.x, c.z, S.t)) continue;
    c.daze = Math.max(c.daze || 0, .4);
    const k = Math.min(1, dt * (1.4 + 2.5 * (1 - d / E.r))), sx = -dz / (d || 1), sz = dx / (d || 1);
    c.x -= dx * k - sx * 7 * dt; c.y -= dy * k; c.z -= dz * k - sz * 7 * dt;
  }
}

// ---------- 龙吼的效果（技能和回声共用）----------
export function roarAt(S, x, y, z, r, t) {
  for (const c of S.creatures) {
    if (Math.hypot(c.x - x, c.y - y, c.z - z) > r) continue;
    c.skillHit = 1; c.daze = Math.max(c.daze || 0, t); if (c.edibleCooked) c.cooked = 1;
    if (SPECIES[c.sp].predator && !c.edible) { c.st = 'retreat'; c.stT = 8; }
  }
}
// ---------- 特性：回声龙吼 ----------
export function onRoar(S, sk) { if (traitOn(S, 'echo') && S.kind === 'fire') S.echo = { t: 1.1, r: sk.r * .65, d: sk.t }; }
function stepEcho(S, dt) {
  const E = S.echo; if (!E) return;
  E.t -= dt; if (E.t > 0) return;
  S.echo = null;
  const h = S.hero;
  roarAt(S, h.x, h.y, h.z, E.r, E.d);
  S.events.push({ type: 'skill', id: 'roar', echo: true, x: h.x, y: h.y, z: h.z, r: E.r });
}
// ---------- 特性：掠水 / 跃浪吸附、疾潮（sim.js 的 eat 里调）----------
export function traitsOnEat(S, c, cross) {
  const h = S.hero;
  if (cross && traitOn(S, S.kind === 'fire' ? 'skimF' : 'skimS')) { if (!(S.skimT > 0)) S.events.push({ type: 'skim', x: h.x, y: h.y, z: h.z }); S.skimT = 3; }
  if (traitOn(S, 'surge') && S.kind === 'sea' && h.dashT > 0 && h.medium === 'water' && (h.surgeAdd || 0) < 1.2) {
    h.dashT += .4; h.surgeAdd = (h.surgeAdd || 0) + .4; h.dashCd = Math.max(0, h.dashCd - 1);
    S.events.push({ type: 'surge', x: h.x, y: h.y, z: h.z });
  }
}
// 掠水 / 跃浪吸附生效时：吃的判定、吸附范围的倍数
export const skimK = S => S.skimT > 0 ? 1 : 0;
