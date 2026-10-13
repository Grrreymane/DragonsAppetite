// 短途猎场：先看见线索，靠近才开始；错过后自然散场。普通觅食和成长独立继续。
import { makeRng, clamp, lerp, damp } from './rng.js';
import { groundAt, seabedY } from './world.js';
import { makeGroup } from './creatures.js';

const CHASE = 18, DURATION = 26, CUE_TIME = 35;
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
      elapsed: 0, duration: DURATION, caught: 0, total: cfg.count * 3 + cfg.finale,
      first: !S.discoveries[kind], groups: [], away: 0, waveCount: 0, emptyFor: 0,
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
  // 恢复普通群体，不瞬间抹掉玩家正在追的猎物；已回收的群体仍按原规则消失。
  for (const g of hunt.groups) { g.huntRetire = S.t + 45; delete g.huntId; delete g.huntMotion; delete g.huntPhase; delete g.huntIndex; delete g.huntStart; delete g.huntProgress; }
  for (const c of S.creatures) if (c.huntId === hunt.id) { delete c.huntId; delete c.huntSlot; delete c.huntCounted; }
  if (active) S.events.push({ type: 'huntEnd', kind: hunt.kind, caught: hunt.caught, total: hunt.total, completed });
  S.hunt = null;
  S.huntNext = S.t + (active ? 35 : 20);
}

export function stepHunts(S, dt) {
  if (!S.huntRng) initHunts(S, S.discoveries);
  let hunt = S.hunt;
  if (!hunt) {
    if (S.t < S.huntNext || S.stats.eaten < 1) return;
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

export function recordHuntEat(S, c) {
  const hunt = S.hunt;
  if (!hunt || hunt.phase === 'cue' || c.huntId !== hunt.id || c.huntCounted) return;
  c.huntCounted = true;
  hunt.caught++;
  const rec = S.discoveries[hunt.kind];
  if (rec) rec.best = Math.max(rec.best, hunt.caught);
}
