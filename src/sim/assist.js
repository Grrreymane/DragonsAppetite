// 捕猎辅助（v2）：自动瞄准锁定 + 转向 / 俯仰往猎物偏。玩家用力往反方向拖时让位。
// 锁定范围和锥角随阶段变大（config/dragons.js assist），所以长大以后更好抓。
import { SPECIES } from '../config/species.js';
import { clamp, wrapAngle } from './rng.js';
import { waveH } from './world.js';

const D2R = Math.PI / 180;

// 这只现在能不能当瞄准目标：能吃（或已烤熟 / 撞晕后能吃），而且够得着（不在另一个地盘、或者已经学会跨界）
export function targetable(S, c) {
  if (c.dying || c.size < .05) return false;
  if (!(c.edible || (c.cooked >= 1 && c.edibleCooked))) return false;
  const h = S.hero, under = c.y < waveH(c.x, c.z, S.t) - .3, hab = SPECIES[c.sp].hab;
  if (S.kind === 'fire') {
    if (h.medium === 'water') return under;
    if (under) return S.cfg.canCross && c.y > -S.cfg.plungeDepth + 1 && hab !== 'air';
    return true;
  }
  if (h.medium === 'air') return !under;
  if (!under) return S.cfg.canCross;                       // 天上的：学会跃出以后才瞄
  return true;
}

// 能锁定：能吃的；或者「烤熟 / 撞晕后能吃」的（小目标要烤熟、或者正按着喷火 / 正在冲刺时）——锁定后自动转向，火焰锥对准就会自动喷
function lockable(S, c) {
  if (targetable(S, c)) return true;
  if (c.dying || c.size < .05 || c.edible || !c.edibleCooked || c.cooked >= 1) return false;
  const h = S.hero, g = S.goal, want = (g && g.type === 'cooked' && !g.done) || h.firing || h.dashT > 0;
  if (!want) return false;
  const under = c.y < waveH(c.x, c.z, S.t) - .3, hab = SPECIES[c.sp].hab;
  return S.kind === 'fire' ? h.medium === 'air' && !under && hab !== 'water' : h.medium === 'water' && under && hab !== 'air';
}

// 每步：维持 / 选择锁定目标。返回锁定的生物（或 null）
export function updateLock(S, inp, dt) {
  const h = S.hero, A = S.cfg.assist, f = h.fwd;
  const cur = h.lock ? S.creatures.find(c => c.id === h.lock) : null;
  const angTo = c => {
    const dx = c.x - h.x, dy = c.y - h.y, dz = c.z - h.z, d = Math.hypot(dx, dy, dz) || 1;
    return { d, cos: (dx * f.x + dy * f.y + dz * f.z) / d };
  };
  // 玩家用力往反方向拖：0.3 秒后放弃这只
  if (cur && h.oppose > .45) { h.lock = 0; h.lockCd = .6; }
  else if (cur && lockable(S, cur)) {
    const a = angTo(cur);
    if (a.d < A.range * 1.35 && a.cos > Math.cos(A.cone * 1.5 * D2R)) return cur;
  }
  h.lock = 0;
  if ((h.lockCd = Math.max(0, (h.lockCd || 0) - dt)) > 0) return null;
  let best = null, bs = 1e9;
  const cosC = Math.cos(A.cone * D2R);
  for (const c of S.creatures) {
    if (!lockable(S, c)) continue;
    const a = angTo(c);
    if (a.d > A.range || a.cos < cosC) continue;
    const s = a.d / A.range + (1 - a.cos) * 6 + (c.gold ? -.2 : 0);
    if (s < bs) { bs = s; best = c; }
  }
  if (best) { h.lock = best.id; S.events.push({ type: 'locked', id: best.id }); }
  return best;
}

// 转向辅助：给出加在玩家输入上的偏航速度目标、俯仰目标。strength 0..1
export function assistSteer(S, inp, tgt) {
  const h = S.hero;
  if (!tgt) { h.oppose = 0; return null; }
  const dx = tgt.x - h.x, dy = tgt.y - h.y, dz = tgt.z - h.z, dh = Math.hypot(dx, dz) || 1;
  const yawErr = wrapAngle(Math.atan2(dx, dz) - h.yaw);
  const turn = S.cfg.turn;
  const yawRate = clamp(yawErr * 4, -turn * 1.4, turn * 1.4);   // v2.1：用户要更强的瞄准辅助
  const pitch = clamp(Math.atan2(dy, dh), -.75, .65);
  // 玩家的意图：摇杆往反方向用力 → 计时，超过 0.3 秒就放弃锁定
  const playerYaw = -inp.jx * turn;
  const opp = Math.abs(inp.jx) > .6 && Math.sign(playerYaw) !== Math.sign(yawRate) && Math.abs(yawErr) > .1;
  h.oppose = opp ? (h.oppose || 0) + 1 / 60 : 0;
  // 越靠近越用力（最后几米基本自动对准）
  const d = Math.hypot(dx, dy, dz), near = clamp(1 - d / S.cfg.assist.range, 0, 1);
  const w = opp ? 0 : clamp(.8 + near * .2, 0, 1) * (1 - Math.min(.35, Math.abs(inp.jx) * .35));
  const wp = Math.abs(inp.jy) > .5 && Math.sign(-inp.jy) !== Math.sign(pitch) ? 0 : w;
  return { yawRate, pitch, w, wp };
}
