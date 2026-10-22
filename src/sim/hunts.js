// 短途猎场：先看见线索，靠近才开始；错过后自然散场。普通觅食和成长独立继续。
import { makeRng, clamp, lerp, damp } from './rng.js';
import { groundAt, seabedY } from './world.js';
import { makeGroup } from './creatures.js';
import { SPECIES } from '../config/species.js';

const CHASE = 18, DURATION = 26, CUE_TIME = 35;
// 奖励（当场给，界面上看得见）：猎场里每吃一只 +1 成长；吃满 success 只再 +10；收尾的金色猎物本身就是 3 倍分
export const HUNT_PER = 1, HUNT_GOAL_BONUS = 10;
// 天敌抢食（GDD §19.3 B，做成猎场的升级版）：追猎开始几秒后，大鹏（云海）/ 鲨鱼（浅海）冲进来抢猎物。吃掉它 +RIVAL_PTS
export const RIVAL_PTS = 10;
const RIVAL_SP = { cloud: 'roc', tide: 'shark' };
const SETTINGS = {
  cloud: { sp: 'sparrow', count: 5, finale: 6, radius: 66, ahead: 76, reach: 26, success: 5, far: 430 },
  tide: { sp: 'sardine', count: 7, finale: 9, radius: 45, ahead: 54, reach: 20, success: 7, far: 260 },
};

// 存档仅留已发现的种类和实际捕获记录；旧档、坏字段都能安全进入。
export function initHunts(S, discoveries = {}) {
  S.discoveries = {};
  for (const kind of ['cloud', 'tide']) {
    const rec = discoveries && discoveries[kind];
    if (!rec || typeof rec !== 'object' || !rec.found) continue;
    const count = v => Number.isFinite(v) ? clamp(Math.floor(v), 0, 1000000) : 0;
    S.discoveries[kind] = { found: 1, best: count(rec.best), completed: count(rec.completed) };
  }
  S.hunt = null;
  S.huntRng = makeRng((S.seed | 0) ^ 0x48554e54);
  S.huntNext = 14;
  S.huntSerial = 0;
}

function routePoint(route, progress) {
  const q = clamp(progress, 0, 1) * (route.length - 1), i = Math.min(route.length - 2, Math.floor(q)), a = route[i], b = route[i + 1], f = q - i;
  return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f), yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

// 检查路线及两侧，给龙的身体、猎群和拐弯都留出空地。
function clearPoint(p, kind) {
  for (const [ox, oz] of [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]) {
    const x = p.x + ox, z = p.z + oz;
    if (kind === 'cloud' ? groundAt(x, z) > p.y - 15 : groundAt(x, z) > -5 || seabedY(x, z) > p.y - 5) return false;
  }
  return true;
}
function clearSegment(a, b, kind) {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 6));
  for (let i = 1; i <= n; i++) {
    const f = i / n;
    if (!clearPoint({ x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) }, kind)) return false;
  }
  return true;
}

// 也供无画面回归测试使用；仍执行正常地形和介质检查，不绕过生成条件。
export function createHunt(S) {
  if (S.hunt) return S.hunt;
  if (!S.huntRng) initHunts(S, S.discoveries);
  const kind = S.kind === 'fire' ? 'cloud' : 'tide', cfg = SETTINGS[kind], h = S.hero, r = S.huntRng;
  if (h.medium !== (kind === 'cloud' ? 'air' : 'water')) return null;
  // 深海的玩家先回到浅海才遇见鱼潮，避免把线索放到够不着的头顶。
  if (kind === 'tide' && h.y < -30) return null;
  const y = kind === 'cloud' ? clamp(h.y, 20, 215) : clamp(h.y, -18, -6);
  for (let attempt = 0; attempt < 18; attempt++) {
    const yaw = h.yaw + r.range(-.6, .6), hand = r.sign(), radius = cfg.radius * r.range(.9, 1.1);
    const ahead = cfg.ahead * r.range(.85, 1.1), x = h.x + Math.sin(yaw) * ahead, z = h.z + Math.cos(yaw) * ahead;
    const route = [];
    for (let i = 0; i <= 12; i++) {
      const a = i / 12 * 2.15, forward = Math.sin(a) * radius, side = (1 - Math.cos(a)) * radius * hand;
      route.push({ x: x + Math.sin(yaw) * forward + Math.cos(yaw) * side, y: y + Math.sin(a) * (kind === 'cloud' ? 3 : 1), z: z + Math.cos(yaw) * forward - Math.sin(yaw) * side });
    }
    if (!clearPoint(route[0], kind) || !clearSegment(h, route[0], kind)) continue;
    if (route.slice(1).some((p, i) => !clearSegment(route[i], p, kind))) continue;
    S.hunt = {
      id: `hunt-${++S.huntSerial}`, kind, phase: 'cue', x, y, z, yaw, route,
      elapsed: 0, duration: DURATION, caught: 0, total: cfg.count * 3 + cfg.finale, goal: cfg.success, bonus: 0, goalHit: false,
      first: !S.discoveries[kind], groups: [], away: 0, waveCount: 0, emptyFor: 0,
      // 天敌抢食：第一次发现的猎场不安排（先学会玩法）；之后七成的猎场会来，追猎开始后 6~9 秒到
      rival: { planned: !!S.discoveries[kind] && r() < .7, at: r.range(6, 9), id: 0, eaten: false }, stolen: 0,
    };
    return S.hunt;
  }
  return null;
}

function spawnGroup(S, hunt, count, progress, index, gold = false) {
  const cfg = SETTINGS[hunt.kind], p = routePoint(hunt.route, progress);
  // 猎场只使用自己的随机序列，不因远处出现一个线索改变普通刷怪顺序。
  const worldRng = S.rng;
  let g;
  try {
    S.rng = S.huntRng;
    g = makeGroup(S, cfg.sp, p.x, p.y, p.z, count, { huntId: hunt.id, huntMotion: true, huntPhase: hunt.phase, yaw: p.yaw, huntIndex: index, huntStart: hunt.elapsed, huntProgress: progress });
  } finally { S.rng = worldRng; }
  const members = S.creatures.filter(c => c.g === g);
  members.forEach((c, i) => {
    c.huntId = hunt.id; c.huntSlot = i; c.gold = gold && i === 0;
    // 出生朝向和动势沿路线，玩家近距离发现时不会先看见一团静止猎物。
    c.yaw = p.yaw; c.vx = Math.sin(p.yaw) * (hunt.kind === 'cloud' ? 7 : 5); c.vz = Math.cos(p.yaw) * (hunt.kind === 'cloud' ? 7 : 5);
  });
  hunt.groups.push(g);
  return g;
}

function waveProgress(index) { return .06 + index * .27; }
function releaseWave(S, hunt) {
  const index = hunt.waveCount++;
  spawnGroup(S, hunt, SETTINGS[hunt.kind].count, waveProgress(index), index);
  hunt.emptyFor = 0;
}

function startHunt(S, hunt) {
  hunt.phase = 'chase'; hunt.elapsed = 0;
  hunt.first = !S.discoveries[hunt.kind];
  hunt.prevBest = (S.discoveries[hunt.kind] && S.discoveries[hunt.kind].best) || 0;
  if (hunt.first) S.discoveries[hunt.kind] = { found: 1, best: 0, completed: 0 };
  releaseWave(S, hunt);
  S.events.push({ type: 'huntDiscover', kind: hunt.kind, first: hunt.first });
  S.events.push({ type: 'huntPhase', kind: hunt.kind, phase: 'chase' });
}

function endHunt(S, hunt) {
  const active = hunt.phase !== 'cue', rec = S.discoveries[hunt.kind];
  const completed = active && hunt.caught >= SETTINGS[hunt.kind].success;
  if (active && rec) {
    rec.best = Math.max(rec.best, hunt.caught);
    if (completed) rec.completed++;
  }
  // 天敌：回到平常的样子（巡逻 / 逃），过一会儿被回收
  for (const c of S.creatures) if (c.rivalOf === hunt.id) { delete c.rivalMotion; c.g.huntRetire = S.t + 25; }
  // 恢复普通群体，不瞬间抹掉玩家正在追的猎物；已回收的群体仍按原规则消失。
  for (const g of hunt.groups) { g.huntRetire = S.t + 45; delete g.huntId; delete g.huntMotion; delete g.huntPhase; delete g.huntIndex; delete g.huntStart; delete g.huntProgress; }
  for (const c of S.creatures) if (c.huntId === hunt.id) { delete c.huntId; delete c.huntSlot; delete c.huntCounted; }
  // 奖励已经在抓的时候当场给了（recordHuntEat），这里只汇总；best 用结束前的旧纪录判断是不是新纪录
  if (active) S.events.push({ type: 'huntEnd', kind: hunt.kind, caught: hunt.caught, total: hunt.total, completed, bonus: hunt.bonus, record: hunt.caught > 0 && hunt.caught > (hunt.prevBest || 0), stolen: hunt.stolen || 0, rivalEaten: !!(hunt.rival && hunt.rival.eaten) });
  S.hunt = null;
  S.huntNext = S.t + (active ? 35 : 20);
}

export function stepHunts(S, dt) {
  if (!S.huntRng) initHunts(S, S.discoveries);
  let hunt = S.hunt;
  if (!hunt) {
    if (S.t < S.huntNext || S.stats.eaten < 1) return;
    if (S.leader) { S.huntNext = S.t + 8; return; }   // 同一时间只有一个大事件：领头在场时不开猎场
    hunt = createHunt(S);
    if (!hunt) S.huntNext = S.t + 5;
    return;
  }
  hunt.elapsed += dt;
  const cfg = SETTINGS[hunt.kind], h = S.hero;
  const distance = Math.hypot(h.x - hunt.x, h.y - hunt.y, h.z - hunt.z);
  if (hunt.phase === 'cue') {
    if (h.medium === (hunt.kind === 'cloud' ? 'air' : 'water') && distance <= cfg.reach) startHunt(S, hunt);
    else if (hunt.elapsed >= CUE_TIME || distance > cfg.far) endHunt(S, hunt);
    return;
  }
  hunt.away = distance > cfg.far ? hunt.away + dt : 0;
  const live = S.creatures.some(c => c.huntId === hunt.id && !c.dying);
  hunt.emptyFor = live ? 0 : hunt.emptyFor + dt;
  if (hunt.elapsed >= hunt.duration || hunt.away > 3 || (hunt.phase === 'finale' && !live)) { endHunt(S, hunt); return; }
  if (hunt.rival && hunt.rival.planned && !hunt.rival.id && hunt.phase !== 'cue' && hunt.elapsed >= hunt.rival.at) spawnRival(S, hunt);
  if (hunt.phase === 'chase') {
    // 分批穿过云缝 / 浅海；抓得快就提前接上下一波，最多只留三秒看路线。
    if (hunt.waveCount < 3 && (hunt.elapsed >= hunt.waveCount * 6 || hunt.emptyFor >= 3)) releaseWave(S, hunt);
    else if (hunt.waveCount === 3 && (hunt.elapsed >= CHASE || hunt.emptyFor >= 3)) {
      hunt.phase = 'finale';
      hunt.duration = Math.min(DURATION, hunt.elapsed + 8);
      spawnGroup(S, hunt, cfg.finale, 1, 3, true);
      S.events.push({ type: 'huntPhase', kind: hunt.kind, phase: 'finale' });
    }
  }
  let closest = null, best = Infinity;
  for (const g of hunt.groups) {
    const start = g.huntProgress;
    const travel = clamp((hunt.elapsed - g.huntStart) / Math.max(3, CHASE - g.huntStart), 0, 1);
    const p = routePoint(hunt.route, hunt.phase === 'finale' ? 1 : start + (.9 - start) * travel);
    const k = hunt.phase === 'finale' ? damp(1.7, dt) : 1;
    g.x = lerp(g.x, p.x, k); g.y = lerp(g.y, p.y, k); g.z = lerp(g.z, p.z, k); g.yaw = p.yaw; g.huntPhase = hunt.phase;
    const d = Math.hypot(h.x - g.x, h.y - g.y, h.z - g.z);
    if (!g.dead && g.members > 0 && d < best) { closest = g; best = d; }
  }
  const focus = closest || routePoint(hunt.route, hunt.waveCount < 3 ? waveProgress(hunt.waveCount) : 1);
  hunt.x = focus.x; hunt.y = focus.y; hunt.z = focus.z;
}

// 天敌从猎群后侧 45 米冲进来
function spawnRival(S, hunt) {
  const sp = RIVAL_SP[hunt.kind], r = S.huntRng, a = (hunt.yaw || 0) + Math.PI + r.range(-.8, .8);
  const x = hunt.x + Math.sin(a) * 45, z = hunt.z + Math.cos(a) * 45, y = hunt.kind === 'cloud' ? hunt.y + 6 : Math.min(-6, hunt.y - 3);
  const world = S.rng; let g;
  try { S.rng = S.huntRng; g = makeGroup(S, sp, x, y, z, 1, { huntRival: hunt.id }); } finally { S.rng = world; }
  const c = S.creatures.find(o => o.g === g);
  hunt.rival.id = -1; if (!c) return;
  c.rivalOf = hunt.id; c.rivalMotion = true; c.biteCd = 0; c.age = 1; c.size = c.baseSize;
  hunt.rival.id = c.id;
  S.events.push({ type: 'huntRival', kind: hunt.kind, sp, x, y, z });
}
// 天敌：冲向最近的猎场猎物，一口吞掉（被抢走）；幼龙离太近会被咬一口。烤熟 / 撞晕 / 吼晕时 creatures.js 照常处理
export function stepHuntRival(S, dt) {
  const hunt = S.hunt; if (!hunt || !hunt.rival || !(hunt.rival.id > 0)) return;
  const c = S.creatures.find(o => o.id === hunt.rival.id);
  if (!c || c.dying) { hunt.rival.id = -2; return; }
  if (c.roast > 0 || c.stun > 0 || c.daze > 0) return;
  const h = S.hero, d = SPECIES[c.sp];
  let best = null, bd = 1e9;
  for (const o of S.creatures) {
    if (o.huntId !== hunt.id || o.dying || o.rivalOf) continue;
    const q = Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z); if (q < bd) { bd = q; best = o; }
  }
  const tx = best ? best.x : hunt.x, ty = best ? best.y : hunt.y, tz = best ? best.z : hunt.z;
  const dx = tx - c.x, dy = ty - c.y, dz = tz - c.z, dd = Math.hypot(dx, dy, dz) || 1, v = d.speed * (best ? .95 : .5), k = damp(2.5, dt);
  c.vx += (dx / dd * v - c.vx) * k; c.vy += (dy / dd * v - c.vy) * k; c.vz += (dz / dd * v - c.vz) * k;
  c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  if (d.hab === 'air') c.y = Math.max(c.y, groundAt(c.x, c.z) + 8, 4);
  else c.y = clamp(c.y, seabedY(c.x, c.z) + 2, -1.5);
  const hs = Math.hypot(c.vx, c.vz); if (hs > .3) { const ny = Math.atan2(c.vx, c.vz); c.yaw += Math.atan2(Math.sin(ny - c.yaw), Math.cos(ny - c.yaw)) * damp(6, dt); }
  c.pitch = lerp(c.pitch, clamp(Math.atan2(c.vy, Math.max(.5, hs)), -1, 1), damp(5, dt));
  c.flap = d.hab === 'air' ? .9 : 1; c.phase += dt * (d.hab === 'air' ? 8 : 7);
  c.biteCd = Math.max(0, c.biteCd - dt);
  // 抢：嘴边的猎物被吞掉
  if (best && bd < c.size * .6 + 1.8 && c.biteCd <= 0) {
    best.dying = best.dying || .001; c.biteCd = 1.1; hunt.stolen++;
    S.events.push({ type: 'rivalEat', kind: hunt.kind, x: best.x, y: best.y, z: best.z, sp: c.sp });
  }
  // 幼龙凑得太近：被咬一口（掉光点）——小时候只能从边上偷吃
  if (S.stage === 0 && S.bite && h.invuln <= 0 && Math.hypot(h.x - c.x, h.y - c.y, h.z - c.z) < c.size * .6 + h.len * .45) S.bite(c);
}
// 吃掉了天敌（sim.js 的 eat 里调）
export function recordRivalEat(S, c) {
  const hunt = S.hunt; if (!c.rivalOf) return;
  S.pts += RIVAL_PTS;
  if (hunt && hunt.rival && hunt.id === c.rivalOf) hunt.rival.eaten = true;
  S.events.push({ type: 'huntRivalEaten', x: c.x, y: c.y, z: c.z, pts: RIVAL_PTS, sp: c.sp });
}

export function recordHuntEat(S, c) {
  const hunt = S.hunt;
  if (!hunt || hunt.phase === 'cue' || c.huntId !== hunt.id || c.huntCounted) return;
  c.huntCounted = true;
  hunt.caught++;
  S.pts += HUNT_PER; hunt.bonus += HUNT_PER;
  S.events.push({ type: 'huntCatch', kind: hunt.kind, x: c.x, y: c.y, z: c.z, bonus: HUNT_PER, caught: hunt.caught, goal: hunt.goal });
  if (!hunt.goalHit && hunt.caught >= hunt.goal) {
    hunt.goalHit = true; S.pts += HUNT_GOAL_BONUS; hunt.bonus += HUNT_GOAL_BONUS;
    S.events.push({ type: 'huntGoal', kind: hunt.kind, bonus: HUNT_GOAL_BONUS });
  }
  const rec = S.discoveries[hunt.kind];
  if (rec) rec.best = Math.max(rec.best, hunt.caught);
}
