// 游戏逻辑总入口：createSim / step（固定步长 1/60 秒）。纯逻辑，浏览器和 Node（机器人）共用。
import { makeRng, clamp, lerp } from './rng.js';
import { waveH } from './world.js';
import { SPECIES, SPECIES_IDS } from '../config/species.js';
import { DRAGONS, STAGE_PTS, GOALS, GOAL_REWARD } from '../config/dragons.js';
import { makeHero, stepFire, stepSea, heroMouth } from './hero.js';
import { stepCreatures, spawnInitial, manageSpawns, rescueSpawn } from './creatures.js';

export const DT = 1 / 60;
const TIER_PTS = [0, 1, 3, 8];

export function createSim({ kind = 'fire', seed = 1, stage = 0, pts, goalIdx = 0, codex = {}, x = 0, z = 0, yaw = 0 } = {}) {
  const cfg = DRAGONS[kind].stages[stage];
  const S = {
    t: 0, kind, stage, cfg, seed, rng: makeRng(seed),
    pts: pts == null ? STAGE_PTS[stage] : Math.max(pts, STAGE_PTS[stage]),
    hero: makeHero(kind, cfg), creatures: [], groups: [], orbs: [], spots: [], events: [],
    nextId: 0, goalIdx, goal: null, combo: { n: 0, t: 0 }, codex: JSON.parse(JSON.stringify(codex)),
    stats: { eaten: 0, time: 0, bites: 0, cross: 0, maxNoEat: 0 }, lastEat: 0, bitesT: [],
    slowmo: 1, evolving: 0, spawnT: 0, fireCone: [], autoAimT: 0,
  };
  S.hero.x = x; S.hero.z = z; S.hero.yaw = yaw; S.hero.px = x; S.hero.pz = z;
  for (const id of SPECIES_IDS) S.codex[id] = S.codex[id] || { n: 0, gold: 0 };
  updateSize(S);
  setGoal(S);
  S.bite = c => bite(S, c);
  spawnInitial(S);
  return S;
}

// 阶段内体型：每吃一口大一点（×0.9 → ×1.1），成龙固定 ×1.0
function updateSize(S) {
  const h = S.hero, s = S.stage;
  let k = 1;
  if (s < 2) { const a = STAGE_PTS[s], b = STAGE_PTS[s + 1]; k = .9 + .2 * clamp((S.pts - a) / (b - a), 0, 1); }
  h.sizeK = lerp(h.sizeK, k, .05); h.len = S.cfg.len * h.sizeK;
}

// ---------- 小目标 ----------
function setGoal(S) {
  const list = GOALS[S.kind][S.stage];
  if (S.goalIdx < list.length) {
    const g = list[S.goalIdx];
    S.goal = { ...g, have: 0, done: false, icon: g.sp || g.type };
  } else {
    // 本阶段的小目标做完了：推荐还没吃过、现在就能吃的图鉴
    const can = SPECIES_IDS.filter(id => SPECIES[id].who.includes(S.kind) && SPECIES[id].tier <= S.cfg.eatTier);
    const miss = can.find(id => !S.codex[id].n) || can.find(id => !S.codex[id].gold);
    S.goal = miss ? { type: 'eat', sp: miss, n: 1, have: 0, done: false, icon: miss, extra: true }
      : { type: 'grow', n: 1, have: 0, done: false, icon: 'grow', extra: true };
  }
}
function goalProgress(S, e) {
  const g = S.goal; if (!g || g.done) return;
  let inc = 0;
  if (g.type === 'eat' && e.sp === g.sp) inc = 1;
  else if (g.type === 'cooked' && e.cooked) inc = 1;
  else if (g.type === 'cross' && e.cross) inc = 1;
  else if (g.type === 'combo') { g.have = Math.max(g.have, e.combo); if (g.have >= g.n) inc = 0, g.have = g.n; }
  g.have = Math.min(g.n, g.have + inc);
  if (g.have >= g.n) {
    g.done = true; S.goalDoneT = 1.2;
    S.events.push({ type: 'goal', idx: S.goalIdx, extra: !!g.extra });
    if (!g.extra) { S.pts += GOAL_REWARD[S.stage]; S.goalIdx++; }
  }
}
// 小目标指向的猎物：能吃（或烤熟后能吃）、离得最近的那只
export function goalTarget(S) {
  const g = S.goal, h = S.hero; if (!g || g.done) return null;
  let best = null, bd = 1e9;
  for (const c of S.creatures) {
    if (c.dying) continue;
    let ok = false;
    if (g.type === 'eat') ok = c.sp === g.sp && (c.edible || c.edibleCooked);
    else if (g.type === 'cooked') ok = !c.edible && c.edibleCooked;
    else if (g.type === 'cross') ok = S.kind === 'fire' ? SPECIES[c.sp].hab !== 'air' && c.edible && c.y > -10 : (c.sp === 'gull' || c.sp === 'flyfish') && c.edible;
    else ok = c.edible;
    if (!ok) continue;
    const d = Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
export function nearestEdible(S, maxD = 400) {
  const h = S.hero; let best = null, bd = maxD;
  for (const c of S.creatures) {
    if (c.dying || !(c.edible || (c.cooked >= 1 && c.edibleCooked))) continue;
    const d = Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z); if (d < bd) { bd = d; best = c; }
  }
  return best;
}

// ---------- 吃 ----------
function eat(S, c, cross) {
  const d = SPECIES[c.sp], h = S.hero;
  const myTier = S.stage + 1, diff = Math.max(0, myTier - d.tier);
  let k = diff === 0 ? 1 : diff === 1 ? .5 : .25;
  const cooked = c.cooked >= 1;
  let mult = 1; if (cooked) mult *= 2; if (cross) mult *= 2; mult = Math.min(mult, 4);
  if (c.gold) mult *= 3;
  S.combo.n = S.combo.t > 0 ? S.combo.n + 1 : 1; S.combo.t = 1.5;
  const comboK = 1 + .1 * Math.min(5, S.combo.n - 1);
  const pts = Math.max(1, Math.round(TIER_PTS[d.tier] * k * mult * comboK));
  S.pts += pts; S.stats.eaten++; if (cross) S.stats.cross++;
  const cx = S.codex[c.sp], first = !cx.n; cx.n++; if (c.gold) cx.gold++;
  const e = { type: 'eat', sp: c.sp, x: c.x, y: c.y, z: c.z, pts, combo: S.combo.n, gold: c.gold, cross, cooked, size: c.size };
  S.events.push(e);
  if (first) S.events.push({ type: 'codex', sp: c.sp });
  goalProgress(S, e);
  S.noEat = 0;
  c.dying = 1; c.size = 0; c.g.members--;
  const i = S.creatures.indexOf(c); if (i >= 0) { S.creatures[i] = S.creatures[S.creatures.length - 1]; S.creatures.pop(); }
}

function interact(S, dt) {
  const h = S.hero, m = heroMouth(h), f = h.fwd;
  const fire = S.kind === 'fire';
  const mR = S.cfg.mouthR * h.sizeK;
  const crossNow = fire ? h.medium === 'water' : h.medium === 'air';
  const coneCos = Math.cos(12 * Math.PI / 180), range = S.cfg.fireRange * h.sizeK;
  let autoAim = false;
  for (let i = S.creatures.length - 1; i >= 0; i--) {
    const c = S.creatures[i]; if (c.dying || c.size < .05) continue;
    const dx = c.x - m.x, dy = c.y - m.y, dz = c.z - m.z, d = Math.hypot(dx, dy, dz);
    const canEat = c.edible || (c.cooked >= 1 && c.edibleCooked);
    const eatR = mR + c.size * .5;
    if (canEat) {
      const ahead = (dx * f.x + dy * f.y + dz * f.z) / (d || 1);
      const magR = eatR * (h.medium === 'air' && !fire ? 2.8 : 2.2);
      if (d < eatR) { eat(S, c, crossNow); continue; }
      if (d < magR && ahead > .76) {                       // 吸附：0.12 秒内吸进嘴里
        const k = Math.min(1, dt / .12);
        c.x -= dx * k; c.y -= dy * k; c.z -= dz * k;
      }
    }
    // 喷火：火焰锥里累计 0.4 秒就烤熟
    if (fire && h.medium === 'air' && d < range + c.size * .5 && !c.roast) {
      const along = (dx * f.x + dy * f.y + dz * f.z);
      if (along > 0 && along / (d || 1) > coneCos - c.size / Math.max(4, d) * .5) {
        const cookable = c.edibleCooked && !c.edible;
        if (h.firing && c.edibleCooked) {
          c.cookT += dt;
          if (c.cookT >= .4 && c.cooked < 1) { c.cooked = 1; c.roast = 4; c.vx *= .3; c.vz *= .3; S.events.push({ type: 'cook', id: c.id, sp: c.sp }); }
        }
        if (cookable && c.cooked < 1) autoAim = true;
      }
    }
    // 海龙冲刺：撞到「撞晕后才能吃」的 → 撞晕 4 秒
    if (!fire && h.dashT > 0 && !c.edible && c.edibleCooked && c.stun <= 0) {
      const bx = c.x - h.x, by = c.y - h.y, bz = c.z - h.z;
      if (Math.hypot(bx, by, bz) < h.len * .45 + c.size * .6) {
        c.stun = 4; c.cooked = 1; c.vx += f.x * 6; c.vz += f.z * 6;
        S.events.push({ type: 'stun', id: c.id, sp: c.sp });
      }
    }
  }
  // 自动辅助喷火：前方火焰锥里有要烤熟才能吃的猎物，停留满 0.25 秒就自动喷 0.6 秒
  if (fire) {
    S.autoAimT = autoAim ? S.autoAimT + dt : 0;
    if (S.autoAimT > .25 && h.autoFire <= 0) { h.autoFire = .6; S.autoAimT = 0; }
  }
}

// ---------- 被咬 / 光点 ----------
function bite(S, c) {
  const h = S.hero, r = S.rng;
  if (h.invuln > 0 || h.shield > 0) return;
  const floor = STAGE_PTS[S.stage];
  const lost = Math.max(0, Math.min(5, S.pts - floor));
  S.pts -= lost;
  for (let i = 0; i < lost; i++) S.orbs.push({ x: h.x + r.range(-3, 3), y: h.y + r.range(-2, 2), z: h.z + r.range(-3, 3), t: 6, vx: r.range(-2, 2), vy: r.range(-1, 2), vz: r.range(-2, 2) });
  const dx = h.x - c.x, dz = h.z - c.z, d = Math.hypot(dx, dz) || 1;
  h.x += dx / d * 6; h.z += dz / d * 6; h.invuln = 2; h.slowT = 1;
  S.stats.bites++; S.bitesT.push(S.t);
  S.events.push({ type: 'bite', x: h.x, y: h.y, z: h.z, lost });
  S.bitesT = S.bitesT.filter(t => S.t - t < 60);
  if (S.bitesT.length >= 3) { h.shield = 25; S.bitesT = []; S.events.push({ type: 'shield' }); }
  for (const o of S.creatures) if (o.sp === c.sp && o !== c && o.st === 'chase') { o.st = 'retreat'; o.stT = 6; }
}

function stepOrbs(S, dt) {
  const h = S.hero;
  for (let i = S.orbs.length - 1; i >= 0; i--) {
    const o = S.orbs[i]; o.t -= dt;
    o.vx *= Math.exp(-dt); o.vy *= Math.exp(-dt); o.vz *= Math.exp(-dt);
    o.x += o.vx * dt; o.y += o.vy * dt + Math.sin(S.t * 2 + i) * .3 * dt; o.z += o.vz * dt;
    if (Math.hypot(o.x - h.x, o.y - h.y, o.z - h.z) < h.len * .6 + 2.5) {
      S.pts += 1; S.events.push({ type: 'orb', x: o.x, y: o.y, z: o.z }); S.orbs.splice(i, 1); continue;
    }
    if (o.t <= 0) S.orbs.splice(i, 1);
  }
}

// ---------- 进化 ----------
function checkEvolve(S) {
  if (S.stage >= 2) return;
  if (S.pts < STAGE_PTS[S.stage + 1]) return;
  if (S.hero.crossMax > 0) return;                       // 正在跨界：回到自己的地盘再进化
  S.stage++; S.cfg = DRAGONS[S.kind].stages[S.stage]; S.goalIdx = 0; setGoal(S);
  S.evolving = 2.5;
  S.events.push({ type: 'evolve', stage: S.stage });
  for (const c of S.creatures) if (c.st === 'chase' || c.st === 'alert') { c.st = 'retreat'; c.stT = 6; }
}

// ---------- 一步 ----------
export function step(S, inp) {
  const dt = DT, h = S.hero;
  S.events.length = 0; S.slowmo = 1;
  S.t += dt; S.stats.time += dt;
  h.px = h.x; h.py = h.y; h.pz = h.z;
  h.invuln = Math.max(0, h.invuln - dt); h.shield = Math.max(0, h.shield - dt); h.slowT = Math.max(0, h.slowT - dt); h.bumpT = Math.max(0, h.bumpT - dt);
  if (S.kind === 'fire') stepFire(S, inp, dt); else stepSea(S, inp, dt);
  // 卡住 / NaN 保护
  if (!Number.isFinite(h.x + h.y + h.z + h.yaw + h.pitch)) { h.x = h.px || 0; h.y = S.kind === 'fire' ? 60 : -6; h.z = h.pz || 0; h.pitch = 0; h.speed = 15; h.yawRate = 0; S.stats.nan = (S.stats.nan || 0) + 1; }
  const moved = Math.hypot(h.x - h.px, h.y - h.py, h.z - h.pz) / dt;
  h.stuckT = moved < 3 ? h.stuckT + dt : 0;
  if (h.stuckT > 2) { h.y += S.kind === 'fire' ? 20 : 0; h.yaw += Math.PI / 2; h.stuckT = 0; S.stats.stuck = (S.stats.stuck || 0) + 1; }
  heroMouth(h);
  stepCreatures(S, dt);
  interact(S, dt);
  stepOrbs(S, dt);
  S.combo.t = Math.max(0, S.combo.t - dt); if (S.combo.t <= 0) S.combo.n = 0;
  S.noEat = (S.noEat || 0) + dt; S.stats.maxNoEat = Math.max(S.stats.maxNoEat, S.noEat);
  if (S.goalDoneT > 0) { S.goalDoneT -= dt; if (S.goalDoneT <= 0) setGoal(S); }
  checkEvolve(S);
  if (S.evolving > 0) S.evolving -= dt;
  updateSize(S);
  // 生成：每 0.5 秒整理一次；保底刷新
  S.spawnT -= dt;
  if (S.spawnT <= 0) {
    S.spawnT = .5; manageSpawns(S);
    const g = S.goal, tgt = goalTarget(S);
    const far = tgt && Math.hypot(tgt.x - S.hero.x, tgt.y - S.hero.y, tgt.z - S.hero.z) > (S.kind === 'fire' ? 160 : 90);
    if (g && !g.done && (!tgt || far) && (S.rescueT || 0) <= 0) {
      const sp = g.sp || (g.type === 'cooked' ? (S.kind === 'fire' ? (S.stage === 0 ? 'lavafinch' : 'roc') : (S.stage === 0 ? 'squid' : 'shark'))
        : g.type === 'cross' ? (S.kind === 'fire' ? 'sardine' : 'gull') : null);
      if (sp && !(g.type === 'cross' && S.spots.length)) rescueSpawn(S, sp);
      S.rescueT = far ? 20 : 8;
    }
    if (S.noEat > 12 && (S.rescueT || 0) <= 0) {
      const sp = pickRescue(S); if (sp) rescueSpawn(S, sp); S.rescueT = 8; S.noEat = 6;
    }
  }
  S.rescueT = (S.rescueT || 0) - dt;
}

function pickRescue(S) {
  const h = S.hero;
  if (S.kind === 'fire') return h.medium === 'water' ? null : (h.y > 140 && S.stage >= 1 ? 'cloudjelly' : 'sparrow');
  return h.medium === 'air' ? null : 'sardine';
}

// 换阶段（调试 / 读档用）
export function setStage(S, stage) {
  S.stage = clamp(stage, 0, 2); S.cfg = DRAGONS[S.kind].stages[S.stage];
  S.pts = Math.max(S.pts, STAGE_PTS[S.stage]); S.goalIdx = 0; setGoal(S);
}
export { SPECIES };
