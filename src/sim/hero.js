// 主角的移动：火龙飞行（原型手感原样保留）+ 扎水；海龙游泳 + 冲刺 + 跃出。纯逻辑。
// v2：as = 捕猎辅助（sim/assist.js）给的转向 / 俯仰偏向；扎水 / 跃出要到少年龙才学会（cfg.canCross）
import { lerp, clamp, damp } from './rng.js';
import { waveH, pushOutOfIslands, seabedY, SKY_CAP } from './world.js';

const G = 30;                           // 海龙跃出时的重力

export function makeHero(kind, cfg) {
  const h = {
    x: 0, y: kind === 'fire' ? 60 : -6, z: 0, px: 0, py: 0, pz: 0,
    yaw: 0, pitch: 0, bank: 0, yawRate: 0, speed: kind === 'fire' ? cfg.level : cfg.cruise, vy: 0,
    len: cfg.len * .9, sizeK: .9,
    medium: kind === 'fire' ? 'air' : 'water', crossT: 0, crossMax: 0, warned: false,
    flyW: 1, tuck: 0, flapping: true, flapT: 3, forceFlap: 0, lastFlapPh: 0,
    firing: false, autoFire: 0,
    dashT: 0, dashCd: 0, dashCdMax: 3.7,
    invuln: 0, shield: 0, slowT: 0, bumpT: 0,
    surf: 0,                           // 海龙：贴水面巡游程度 0..1
    mouth: { x: 0, y: 0, z: 0 }, fwd: { x: 0, y: 0, z: 1 },
    stuckT: 0, lock: 0, oppose: 0, blockedT: 0, skill: null,
  };
  h.px = h.x; h.py = h.y; h.pz = h.z;
  return h;
}

function fwdOf(h) {
  const cp = Math.cos(h.pitch);
  h.fwd.x = Math.sin(h.yaw) * cp; h.fwd.y = Math.sin(h.pitch); h.fwd.z = Math.cos(h.yaw) * cp;
  return h.fwd;
}

// ---------- 火龙 ----------
// 玩家输入 + 辅助：辅助的权重 w 在玩家没拖或往同一边拖时最大
function steerYaw(inp, c, as) {
  let yr = -inp.jx * c.turn;
  if (as) yr = clamp(yr * (1 - as.w * (1 - Math.abs(inp.jx))) + as.yawRate * as.w, -c.turn * 1.5, c.turn * 1.5);
  return yr;
}
function steerPitch(base, as) { return as ? base * (1 - as.wp) + as.pitch * as.wp : base; }
function blocked(S, ability) {
  const h = S.hero;
  if (h.blockedT > 0) return;
  h.blockedT = 5; S.events.push({ type: 'blocked', ability });
}

export function stepFire(S, inp, dt, as) {
  const h = S.hero, c = S.cfg, t = S.t;
  const sea0 = waveH(h.x, h.z, t);
  h.blockedT = Math.max(0, h.blockedT - dt);
  const turnK = (h.slowT > 0 ? .5 : 1) * (h.medium === 'water' ? .6 : 1);
  h.yawRate = lerp(h.yawRate, steerYaw(inp, c, as) * turnK, damp(3.5, dt));
  h.yaw += h.yawRate * dt;

  if (h.medium === 'air') {
    let pt = steerPitch(-inp.jy * c.pitchK, as);
    // 扎水通道：离海面 12 以内、俯仰 ≤ -0.35、下降速度 ≥ 10 时，这一次不自动拉起
    const vyDown = -Math.sin(h.pitch) * h.speed;
    // 另外：玩家把摇杆用力往下拖（jy > 0.6）就是想扎水，低空也放行；松手 / 轻拖时原型的自动拉起照旧
    // 幼龙还没学会扎水（canCross = false）：往下拖也只会贴着海面拉起，并提示「长大后学会」
    let wantDive = inp.jy > .6 || (as && as.pitch < -.3 && as.wp > .3 && h.lockUnder);
    if (!c.canCross && wantDive && h.y < sea0 + 14) { blocked(S, 'plunge'); wantDive = false; }
    const plunging = c.canCross && h.y < sea0 + 14 && ((h.pitch <= -.3 && vyDown >= 7) || (wantDive && h.pitch < -.1));
    if (!plunging && !wantDive && h.y < sea0 + 9 && pt < .2) pt = .35;
    if (h.y > SKY_CAP && pt > 0) pt = -.2;
    if (h.forceFlap > 0 && pt < .1) pt = .15;
    h.pitch = lerp(h.pitch, pt, damp(2.2, dt));
    h.bank = lerp(h.bank, -h.yawRate * .6, damp(2.8, dt));
    const diving = h.pitch < -.25, climbing = h.pitch > .12;
    h.speed = lerp(h.speed, diving ? c.dive : climbing ? c.climb : c.level, damp(1.1, dt));
    const f = fwdOf(h);
    h.x += f.x * h.speed * dt; h.y += f.y * h.speed * dt; h.z += f.z * h.speed * dt;
    if (pushOutOfIslands(h, Math.max(3, h.len * .55), dt) > .5 && h.bumpT <= 0) { h.bumpT = 1; S.events.push({ type: 'bump', x: h.x, y: h.y, z: h.z }); h.speed *= .75; }
    if (plunging && h.y < sea0) {
      h.medium = 'water'; h.crossT = 0; h.crossMax = c.waterTime; h.warned = false; h.speed *= .6;
      S.events.push({ type: 'enterWater', x: h.x, z: h.z, speed: h.speed });
    } else if (!plunging) h.y = Math.max(h.y, sea0 + (wantDive ? 2 : 5));
    else h.y = Math.max(h.y, sea0 - .5);
    if (h.y < sea0 + 7 && h.medium === 'air' && S.t % .25 < dt) S.events.push({ type: 'splash', x: h.x, z: h.z, size: .4 });
    // 扇翅：扇 3 秒、滑 2.5 秒；爬升一直扇；俯冲收翅（原型）
    h.flapT -= dt; if (h.flapT < 0) { h.flapping = !h.flapping; h.flapT = h.flapping ? 3 : 2.5; }
    const wantFly = diving ? 0 : (climbing || h.flapping || h.forceFlap > 0) ? 1 : 0;
    h.flyW = lerp(h.flyW, wantFly, damp(2.5, dt));
    h.tuck = lerp(h.tuck, diving ? 1 : 0, damp(3, dt));
    h.forceFlap = Math.max(0, h.forceFlap - dt);
    h.climbing = climbing;
  } else {
    // 水下：转向 60%，速度先降到 60% 再慢慢降；过半自动抬头，时间到强制冲出水面
    h.crossT += dt;
    const late = h.crossT > h.crossMax * .5, over = h.crossT >= h.crossMax;
    let pt = clamp(steerPitch(-inp.jy * c.pitchK, as), -.6, .3);
    if (late) pt = Math.max(pt, .45);
    if (over) pt = .75;
    if (h.y < -c.plungeDepth) pt = Math.max(pt, .5);
    h.pitch = lerp(h.pitch, pt, damp(over ? 6 : 3, dt));
    h.bank = lerp(h.bank, -h.yawRate * .4, damp(2.8, dt));
    h.speed = lerp(h.speed, over ? Math.max(c.level, 22) : c.level * .75, damp(over ? 4 : 1.5, dt));
    const f = fwdOf(h);
    h.x += f.x * h.speed * dt; h.y += f.y * h.speed * dt; h.z += f.z * h.speed * dt;
    pushOutOfIslands(h, Math.max(2, h.len * .4), dt);
    h.y = Math.max(h.y, seabedY(h.x, h.z) + 2);
    h.tuck = lerp(h.tuck, 1, damp(4, dt)); h.flyW = lerp(h.flyW, 0, damp(4, dt));
    if (!h.warned && h.crossT > h.crossMax - .7) { h.warned = true; S.events.push({ type: 'crossWarn' }); }
    if (h.y > sea0 && h.pitch > 0) {
      h.medium = 'air'; h.crossMax = 0; h.crossT = 0; h.forceFlap = 1; h.speed = Math.max(h.speed, c.level);
      S.events.push({ type: 'exitWater', x: h.x, z: h.z, speed: h.speed });
    }
  }
  // 扇翅音效：Fly 动作 3 秒扇 3 下 → 每秒一次下扇（权重够大时才发）
  const ph = Math.floor(t * (c.flapHz || 1) * (h.climbing ? 1.35 : 1));   // 幼龙的 Fly 一秒扇 1.33 下
  if (ph !== h.lastFlapPh) { h.lastFlapPh = ph; if (h.flyW > .5 && h.medium === 'air') S.events.push({ type: 'flap' }); }
  // 喷火：按住 / 自动辅助；水下没效果
  if (h.autoFire > 0) h.autoFire -= dt;
  h.firing = h.medium === 'air' && (inp.act || h.autoFire > 0);
}

// ---------- 海龙 ----------
export function stepSea(S, inp, dt, as) {
  const h = S.hero, c = S.cfg, t = S.t;
  const sea0 = waveH(h.x, h.z, t);
  h.blockedT = Math.max(0, h.blockedT - dt);
  h.dashCdMax = (c.dashT || 1.2) + 2.5;
  if (inp.actTap && h.dashCd <= 0 && h.medium === 'water') { h.dashT = c.dashT || 1.2; h.dashCd = h.dashCdMax; S.events.push({ type: 'dash' }); }
  h.dashT = Math.max(0, h.dashT - dt); h.dashCd = Math.max(0, h.dashCd - dt);
  const turnK = (h.slowT > 0 ? .5 : 1) * (h.medium === 'air' ? .5 : 1);
  h.yawRate = lerp(h.yawRate, steerYaw(inp, c, as) * turnK, damp(3.5, dt));
  h.yaw += h.yawRate * dt;

  if (h.medium === 'water') {
    let pt = clamp(steerPitch(-inp.jy * c.pitchK, as), -.9, .9);
    const floor = Math.max(c.maxDepth, seabedY(h.x, h.z) + 3);
    if (h.y < floor + 4 && pt < 0) pt = lerp(pt, .3, clamp((floor + 4 - h.y) / 4, 0, 1));
    h.pitch = lerp(h.pitch, pt, damp(2.4, dt));
    h.bank = lerp(h.bank, -h.yawRate * .45, damp(2.8, dt));
    const want = h.dashT > 0 ? c.dash : c.cruise;
    h.speed = lerp(h.speed, want, damp(h.dashT > 0 ? 6 : 1.4, dt));
    const f = fwdOf(h);
    h.x += f.x * h.speed * dt; h.z += f.z * h.speed * dt;
    let vy = f.y * h.speed;
    // 贴水面巡游：靠近水面、上浮不够快时，锁在水面下 0~1.5
    const nearTop = h.y > sea0 - 2.2;
    // 在水面往上拖（或辅助瞄着水面上的猎物）= 想跃出：学会了就直接蹦出去，不用先潜下去加速
    const wantBreach = inp.jy < -.55 || (as && as.pitch > .25 && as.wp > .3 && !h.lockUnder);
    if (nearTop && wantBreach && !c.canCross) blocked(S, 'breach');
    if (nearTop && wantBreach && c.canCross) vy = Math.max(vy, c.breachVy * (h.dashT > 0 ? 1 : .8));
    if (nearTop && vy < 8) {
      h.surf = lerp(h.surf, 1, damp(4, dt));
      if (vy > 0) vy *= .2;
      h.y = Math.min(h.y + vy * dt, sea0 - .6);
      if (h.pitch > .05 && vy < 8) h.pitch = lerp(h.pitch, 0, damp(3, dt));
    } else {
      h.surf = lerp(h.surf, 0, damp(3, dt));
      h.y += vy * dt;
    }
    if (h.y < floor) h.y = lerp(h.y, floor, damp(4, dt));
    pushOutOfIslands(h, Math.max(2, h.len * .3), dt);
    // 跃出：往上穿过水面且上浮速度 ≥ 8
    if (h.y >= sea0 - .3 && vy >= 8 && !c.canCross) { h.y = sea0 - .6; vy = 0; blocked(S, 'breach'); }
    if (h.y >= sea0 - .3 && vy >= 8 && c.canCross) {
      h.medium = 'air'; h.vy = Math.min(vy * 1.15, c.breachVy); h.crossT = 0; h.crossMax = 2 * h.vy / G; h.warned = false;
      h.hs = Math.max(6, h.speed * Math.cos(h.pitch));
      S.events.push({ type: 'exitWater', x: h.x, z: h.z, speed: h.speed });
    }
  } else {
    // 空中抛物线：不能控制俯仰，身体朝着速度方向
    h.crossT += dt;
    const slow = h.vy > -4 && h.vy < 4 ? .7 : 1;        // 最高点前后慢放（主循环读 S.slowmo）
    S.slowmo = Math.min(S.slowmo, slow);
    h.vy -= G * dt;
    const hs = h.hs || h.speed;
    h.x += Math.sin(h.yaw) * hs * dt; h.z += Math.cos(h.yaw) * hs * dt; h.y += h.vy * dt;
    h.pitch = lerp(h.pitch, Math.atan2(h.vy, Math.max(4, hs)), damp(6, dt));
    h.bank = lerp(h.bank, -h.yawRate * .3, damp(2.8, dt));
    if (pushOutOfIslands(h, Math.max(2, h.len * .3), dt) > .3) { h.vy = Math.min(h.vy, -2); }
    if (!h.warned && h.crossT > h.crossMax - .7) { h.warned = true; S.events.push({ type: 'crossWarn' }); }
    if (h.y < sea0 && h.vy < 0) {
      h.medium = 'water'; h.crossMax = 0; h.crossT = 0;
      h.speed = Math.max(c.cruise, Math.hypot(hs, h.vy) * .6);
      S.events.push({ type: 'enterWater', x: h.x, z: h.z, speed: Math.abs(h.vy) });
    }
  }
  h.firing = false;
}

export function heroMouth(h) {
  const f = fwdOf(h), k = h.len * (h.mouthK || .47);   // mouthK：主程序按模型清单设的嘴的位置
  h.mouth.x = h.x + f.x * k; h.mouth.y = h.y + f.y * k; h.mouth.z = h.z + f.z * k;
  return h.mouth;
}
