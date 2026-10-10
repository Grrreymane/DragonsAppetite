// 自动试玩机器人（Node 跑平衡、浏览器录像都用它）。按玩家档位模拟反应时间和瞄准误差。
import { goalTarget, nearestEdible } from './sim.js';
import { makeRng, clamp, wrapAngle } from './rng.js';

// 档位：反应时间、瞄准误差（度）、是否理会「!」
export const TIERS = [
  { name: '快', react: .15, err: 5, dodge: true },
  { name: '中快', react: .28, err: 10, dodge: true },
  { name: '中慢', react: .4, err: 15, dodge: true },
  { name: '慢', react: .5, err: 25, dodge: false },
];

export function makeBot(tier, seed) {
  const r = makeRng(seed * 31 + 7);
  let tNext = 0, cur = { jx: 0, jy: 0, act: false, actTap: false }, errA = 0, errP = 0;
  return S => {
    if (S.t < tNext) { const o = { ...cur }; cur.actTap = false; return o; }
    tNext = S.t + tier.react * r.range(.8, 1.2);
    errA = r.range(-1, 1) * tier.err * Math.PI / 180; errP = r.range(-1, 1) * tier.err * Math.PI / 180 * .5;
    const h = S.hero;
    let tgt = goalTarget(S) || nearestEdible(S, 300);
    // 顺路的先吃：目标还远、身边 25 米内正前方有能吃的
    if (tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y, tgt.z - h.z) > 35) {
      const n = nearestEdible(S, 30);
      if (n && ((n.x - h.x) * h.fwd.x + (n.y - h.y) * h.fwd.y + (n.z - h.z) * h.fwd.z) > 0) tgt = n;
    }
    // 瞄准一群的中心（人会往鸟群 / 鱼群中间钻）
    if (tgt && tgt.edible) {
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const c of S.creatures) if (c.sp === tgt.sp && c.edible && Math.abs(c.x - tgt.x) < 10 && Math.abs(c.y - tgt.y) < 6 && Math.abs(c.z - tgt.z) < 10) { sx += c.x; sy += c.y; sz += c.z; n++; }
      if (n > 1) tgt = { ...tgt, x: (sx / n + tgt.x) / 2, y: (sy / n + tgt.y) / 2, z: (sz / n + tgt.z) / 2 };
    }
    let wantYaw = h.yaw, wantPitch = 0, act = false, tap = false;
    // 躲天敌
    const pred = tier.dodge && S.creatures.find(c => c.chasing || c.alert > .5);
    if (pred && Math.hypot(pred.x - h.x, pred.z - h.z) < 50) {
      wantYaw = Math.atan2(h.x - pred.x, h.z - pred.z); wantPitch = S.kind === 'fire' ? .2 : -.2; tgt = null;
    }
    if (tgt) {
      const dx = tgt.x - h.x, dy = tgt.y - h.y, dz = tgt.z - h.z, dh = Math.hypot(dx, dz);
      wantYaw = Math.atan2(dx, dz) + errA;
      wantPitch = Math.atan2(dy, Math.max(4, dh)) + errP;
      if (S.kind === 'fire' && tgt.edibleCooked && !tgt.edible) act = Math.hypot(dx, dy, dz) < S.cfg.fireRange * 1.3;
      if (S.kind === 'sea' && h.medium === 'water' && h.dashCd <= 0 && Math.hypot(dx, dy, dz) < 25) tap = true;
      if (S.kind === 'sea' && tgt.y > 0 && dh < 30) wantPitch = .9;       // 跃出抓鸟
    } else if (!pred) {
      wantYaw = h.yaw + Math.sin(S.t * .3) * .5; wantPitch = S.kind === 'fire' ? (h.y < 50 ? .2 : h.y > 120 ? -.2 : 0) : (h.y < -15 ? .2 : 0);
    }
    const yErr = wrapAngle(wantYaw - h.yaw);
    cur = {
      jx: clamp(-yErr * 2.2, -1, 1),
      jy: clamp(-(wantPitch) / S.cfg.pitchK * 1.2, -1, 1),
      act, actTap: tap,
    };
    return { ...cur };
  };
}

