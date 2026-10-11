// 生物：成群、盘旋、漂、巡逻追击、跃出……以及按玩家位置分圈生成 / 回收、觅食点、保底刷新。纯逻辑。
import { SPECIES } from '../config/species.js';
import { lerp, clamp, damp, wrapAngle } from './rng.js';
import { waveH, seabedY, groundAt, islands, islandPos, zoneAt, wrapP } from './world.js';

const TAU = Math.PI * 2;
const AIR_FAR = 470, WATER_FAR = 210;

// ---------- 小工具 ----------
function steer(c, tx, ty, tz, maxV, acc, dt) {
  let dx = tx - c.x, dy = ty - c.y, dz = tz - c.z;
  const d = Math.hypot(dx, dy, dz) || 1, v = Math.min(maxV, d * 2.2);
  const k = damp(acc, dt);
  c.vx += (dx / d * v - c.vx) * k; c.vy += (dy / d * v - c.vy) * k; c.vz += (dz / d * v - c.vz) * k;
}
function face(c, dt, rollK = .5) {
  const hs = Math.hypot(c.vx, c.vz);
  if (hs > .3) {
    const ny = Math.atan2(c.vx, c.vz), dyaw = wrapAngle(ny - c.yaw);
    c.yaw += dyaw * damp(6, dt);
    c.roll = lerp(c.roll, clamp(-dyaw * 2, -.8, .8) * rollK, damp(4, dt));
  }
  c.pitch = lerp(c.pitch, clamp(Math.atan2(c.vy, Math.max(.5, hs)), -1.2, 1.2), damp(5, dt));
}
function move(c, dt) { c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; }
const sp_ = c => SPECIES[c.sp];

// 天上的东西别钻进山；水里的别钻进海底 / 冲出水面（会跃出的除外）
function keepAir(c, lo) {
  const g = groundAt(c.x, c.z);
  if (c.y < g + 8) { c.y = lerp(c.y, g + 8, .2); c.vy = Math.max(c.vy, 2); }
  if (c.y < lo) c.vy += (lo - c.y) * .05;
}
function keepWater(c, t, top = -1) {
  const s = waveH(c.x, c.z, t) + top, b = seabedY(c.x, c.z) + 1.5;
  if (c.y > s) { c.y = lerp(c.y, s, .3); c.vy = Math.min(c.vy, 0); }
  if (c.y < b) { c.y = lerp(c.y, b, .3); c.vy = Math.max(c.vy, 0); }
}

// ---------- 生成 ----------
export function makeCreature(S, g, sp, x, y, z) {
  const d = SPECIES[sp], r = S.rng;
  const c = {
    id: ++S.nextId, sp, g, x, y, z, px: x, py: y, pz: z, vx: 0, vy: 0, vz: 0,
    yaw: g.yaw || 0, pitch: 0, roll: 0,
    baseSize: d.len * r.range(.85, 1.15), size: 0, age: 0, dying: 0,
    phase: r.range(0, TAU), flap: 1,
    gold: false, cooked: 0, cookT: 0, stun: 0, roast: 0, alert: 0, chasing: false, flee: false,
    edible: false, edibleCooked: false,
    off: { a: r.range(0, TAU), r: r.range(.4, 1), h: r.range(-1, 1), s: r.range(.8, 1.2) },
    st: 'idle', stT: r.range(0, 6), hit: 0,
  };
  S.creatures.push(c);
  return c;
}

export function makeGroup(S, sp, x, y, z, n, extra = {}) {
  const d = SPECIES[sp], r = S.rng;
  const g = { id: ++S.nextId, sp, beh: d.beh, x, y, z, yaw: r.range(0, TAU), vx: 0, vy: 0, vz: 0, t: 0, scatter: 0, members: 0, ...extra };
  S.groups.push(g);
  const goldOk = !S.creatures.some(c => c.gold);
  for (let i = 0; i < n; i++) {
    const c = makeCreature(S, g, sp, x + r.range(-3, 3), y + r.range(-1.5, 1.5), z + r.range(-3, 3));
    if (goldOk && i === 0 && r() < .02 * n) c.gold = true;
    g.members++;
  }
  return g;
}

// 在玩家前方某个距离、某个高度范围里找个不被岛挡住的位置
function placeAhead(S, dMin, dMax, yLo, yHi, spread = 1.8, water = false) {
  const h = S.hero, r = S.rng;
  for (let k = 0; k < 12; k++) {
    const a = h.yaw + r.range(-spread, spread), d = r.range(dMin, dMax);
    const x = h.x + Math.sin(a) * d, z = h.z + Math.cos(a) * d;
    let y = r.range(yLo, yHi);
    if (water) { const b = seabedY(x, z) + 3; if (b > yHi) continue; y = Math.max(y, b); }
    else if (groundAt(x, z) > y - 12) continue;
    return { x, y, z };
  }
  return null;
}

// ---------- 觅食点：海面翻白 + 沙丁鱼球 + 海鸥盘旋 + 飞鱼 ----------
function makeSpot(S, x, z) {
  const r = S.rng;
  if (seabedY(x, z) > -10 || groundAt(x, z) > -5) return null;
  const spot = { id: ++S.nextId, x, z, r: 6, t: 0, empty: 0 };
  S.spots.push(spot);
  makeGroup(S, 'sardine', x, -2.2, z, r.int(10, 15), { spot: spot.id, home: { x, y: -2.2, z } });
  makeGroup(S, 'gull', x, 14, z, r.int(4, 6), { spot: spot.id, home: { x, y: 13, z } });
  makeGroup(S, 'flyfish', x + r.range(-8, 8), -1, z + r.range(-8, 8), r.int(3, 5), { spot: spot.id, home: { x, y: -1, z } });
  if (r() < .5) makeGroup(S, 'squid', x + r.range(-6, 6), -7, z + r.range(-6, 6), r.int(1, 3), { spot: spot.id, home: { x, y: -7, z } });
  return spot;
}

// 每种生物想保持几群（离玩家多远）
function wants(S) {
  const h = S.hero, zn = zoneAt(h.x, h.z), fire = S.kind === 'fire';
  const w = [];
  if (fire) {
    w.push(['sparrow', zn === 'open' ? 3 : 5, 120, 340, 'air']);
    w.push(['cloudjelly', 2, 140, 340, 'air']);
    if (S.stage >= 1) w.push(['lavafinch', 1, 120, 300, 'air']);
    w.push(['roc', 1, 220, 380, 'air']);
    w.push(['manta', zn === 'open' ? 2 : 1, 90, 260, 'water']);
    w.push(['jelly', 1, 40, 120, 'water']);
  } else {
    w.push(['sardine', 2, 55, 130, 'water']);
    w.push(['jelly', 2, 40, 120, 'water']);
    w.push(['squid', 2, 50, 130, 'water']);
    w.push(['turtle', S.stage >= 1 ? 2 : 1, 50, 140, 'water']);
    w.push(['shark', 1, 90, 160, 'water']);
    w.push(['manta', zn === 'open' ? 2 : 1, 70, 160, 'water']);
    w.push(['sparrow', 1, 150, 300, 'air']);
  }
  return w;
}

export function spawnInitial(S) {
  const h = S.hero, r = S.rng, fx = Math.sin(h.yaw), fz = Math.cos(h.yaw);
  if (S.kind === 'fire') {
    makeGroup(S, 'sparrow', h.x + fx * 32, h.y + 1, h.z + fz * 32, 9);           // 5 秒内保证吃到第一口
    makeSpot(S, h.x + fx * 150 + fz * 25, h.z + fz * 150 - fx * 25);
  } else {
    makeGroup(S, 'sardine', h.x + fx * 26, h.y, h.z + fz * 26, 18, { home: null });
    makeSpot(S, h.x + fx * 80 - fz * 20, h.z + fz * 80 + fx * 20);
  }
  manageSpawns(S, true);
}

export function manageSpawns(S, force = false) {
  const h = S.hero, r = S.rng;
  // 回收太远的群
  for (let i = S.groups.length - 1; i >= 0; i--) {
    const g = S.groups[i], d = Math.hypot(g.x - h.x, g.z - h.z);
    const far = SPECIES[g.sp].hab === 'air' ? AIR_FAR : WATER_FAR;
    if (g.members <= 0 || d > far + (g.spot ? 300 : 0)) { g.dead = true; S.groups.splice(i, 1); }
  }
  for (const c of S.creatures) if (c.g.dead && !c.dying) c.dying = .001;
  // 觅食点：保持 4~6 个在 400 以内；吃空 20 秒后换地方
  for (let i = S.spots.length - 1; i >= 0; i--) {
    const s = S.spots[i], d = Math.hypot(s.x - h.x, s.z - h.z);
    const sard = S.groups.some(g => g.spot === s.id && g.sp === 'sardine' && g.members > 0);
    if (!sard) s.empty += .5; else s.empty = 0;
    if (d > 650 || s.empty > 20) { S.spots.splice(i, 1); for (const g of S.groups) if (g.spot === s.id) g.spot = null; }
  }
  const near = S.spots.filter(s => Math.hypot(s.x - h.x, s.z - h.z) < 400).length;
  if (near < 4 || (force && near < 5)) {
    const p = placeAhead(S, 140, 380, 0, 0, 2.6, false);
    if (p) makeSpot(S, p.x, p.z);
  }
  // 各种生物的群数
  for (const [sp, n, dMin, dMax, hab] of wants(S)) {
    const have = S.groups.filter(g => g.sp === sp && !g.spot && Math.hypot(g.x - h.x, g.z - h.z) < dMax * 1.4).length;
    if (have >= n) continue;
    const d = SPECIES[sp];
    if (sp === 'turtle' && zoneAt(h.x, h.z) === 'volcano' && r() < .5) continue;
    const p = hab === 'air' ? placeAhead(S, dMin, dMax, d.alt[0], d.alt[1]) : placeAhead(S, dMin, dMax, d.depth[1], d.depth[0], 2.4, true);
    if (!p) continue;
    makeGroup(S, sp, p.x, p.y, p.z, r.int(d.group[0], d.group[1]));
  }
  // 熔岩雀：附近有火山就绕着烟柱飞
  for (const is of islands) {
    if (is.kind !== 'volcano') continue;
    const ip = islandPos(is, h.x, h.z), d = Math.hypot(ip.x - h.x, ip.z - h.z);
    if (d > 520 || S.kind !== 'fire') continue;
    if (S.groups.some(g => g.sp === 'lavafinch' && g.isle === is.id)) continue;
    makeGroup(S, 'lavafinch', ip.x + is.r * .6, is.h * .9, ip.z, r.int(4, 7), { isle: is.id, home: { x: ip.x, y: is.h, z: ip.z } });
  }
}

// 保底：12 秒没吃到 / 小目标的猎物不在附近 → 在前方侧面刷一小群，让它们飞进画面
export function rescueSpawn(S, sp) {
  const d = SPECIES[sp], h = S.hero;
  if (!d) return;
  const air = d.hab === 'air';
  const yLo = air ? Math.max(d.alt[0], h.y - 25) : Math.max(d.depth[1], h.y - 8);
  const yHi = air ? Math.min(d.alt[1], h.y + 25) : Math.min(d.depth[0], h.y + 8);
  const p = air ? placeAhead(S, 60, 90, Math.min(yLo, yHi), Math.max(yLo, yHi), 1.1)
    : placeAhead(S, 35, 55, Math.min(yLo, yHi), Math.max(yLo, yHi), 1.1, true);
  if (!p) return;
  const n = sp === 'roc' || sp === 'shark' || sp === 'manta' || sp === 'turtle' ? 1 : Math.max(3, d.group[0] - 1);
  const g = makeGroup(S, sp, p.x, p.y, p.z, n);
  g.yaw = Math.atan2(h.x - p.x, h.z - p.z) + S.rng.range(-.6, .6);   // 朝玩家这边飞过来
  return g;
}

// ---------- 每步更新 ----------
export function stepCreatures(S, dt) {
  const h = S.hero, t = S.t, r = S.rng;
  // 群的锚点
  for (const g of S.groups) {
    g.t += dt; g.scatter = Math.max(0, g.scatter - dt); g.scd = Math.max(0, (g.scd || 0) - dt);
    const d = SPECIES[g.sp];
    if (g.home && g.spot) { g.x = lerp(g.x, g.home.x, damp(.5, dt)); g.z = lerp(g.z, g.home.z, damp(.5, dt)); continue; }
    if (g.beh === 'orbit' && g.home) continue;
    // 慢慢转向的游荡（安排来的天敌：锚点朝玩家飘过来，30 秒后恢复游荡）
    if (g.encounter && g.t < 30) g.yaw = Math.atan2(h.x - g.x, h.z - g.z);
    else g.yaw += Math.sin(g.t * .23 + g.id) * .25 * dt;
    const v = d.speed * (g.beh === 'drift' ? 1 : .8);
    g.x += Math.sin(g.yaw) * v * dt; g.z += Math.cos(g.yaw) * v * dt;
    if (d.hab === 'air') {
      const lo = d.alt[0], hi = d.alt[1];
      g.y = clamp(g.y + Math.sin(g.t * .3 + g.id) * 2 * dt, lo, hi);
      const gr = groundAt(g.x, g.z);
      if (g.y < gr + 18) { g.y = Math.min(hi + 20, lerp(g.y, gr + 22, damp(2, dt))); g.yaw += 1.2 * dt; }
    } else {
      const top = Math.min(d.depth[0], -1), bot = Math.max(d.depth[1], seabedY(g.x, g.z) + 3);
      g.y = clamp(g.y + Math.sin(g.t * .25 + g.id) * dt, Math.min(bot, top), top);
      if (bot > top - 1) g.yaw += 1.5 * dt;          // 太浅了，掉头
    }
  }

  const fire = S.kind === 'fire';
  for (const c of S.creatures) {
    c.px = c.x; c.py = c.y; c.pz = c.z;
    const d = sp_(c), g = c.g;
    c.age += dt;
    // 体型：出生 1 秒内从 0 长到原大小；回收时缩回 0
    if (c.dying) { c.dying += dt; c.size = c.baseSize * Math.max(0, 1 - c.dying); }
    else c.size = c.baseSize * Math.min(1, c.age);
    c.edible = d.who.includes(S.kind) && d.tier <= S.cfg.eatTier;
    c.edibleCooked = d.who.includes(S.kind) && d.tier <= S.cfg.cookTier;
    const hx = c.x - h.x, hy = c.y - h.y, hz = c.z - h.z, hd = Math.hypot(hx, hy, hz);
    // 威压（v2：少年龙起有，成龙更大）：半径内能吃的猎物吓呆，不逃、只剩 30% 速度
    const fearR = S.cfg.fear || 0;
    c.feared = fearR > 0 && c.edible && hd < fearR + h.len * .5;
    const threat = !c.feared && c.edible && hd < 9 + h.len * .8 && h.medium === (d.hab === 'water' ? 'water' : 'air');

    // 烤熟：往下掉 4 秒；撞晕：翻肚皮 4 秒（都还能吃，多吃一档）
    if (c.roast > 0) {
      c.roast -= dt; c.vy = lerp(c.vy, -4, damp(2, dt)); c.vx *= .98; c.vz *= .98; move(c, dt);
      c.phase += dt * 2; c.flap = .1; c.roll = lerp(c.roll, .6, damp(2, dt));
      if (c.roast <= 0) { c.cooked = 0; c.cookT = 0; }
      if (d.hab === 'air' && c.y < waveH(c.x, c.z, t) + .5) c.dying = c.dying || .001;
      continue;
    }
    if (c.stun > 0) {
      c.stun -= dt; c.vx *= .96; c.vy = lerp(c.vy, .6, damp(1, dt)); c.vz *= .96; move(c, dt);
      c.roll = lerp(c.roll, Math.PI, damp(5, dt)); c.flap = .1; c.phase += dt;
      keepWater(c, t);
      if (c.stun <= 0) { c.cooked = 0; c.cookT = 0; }
      continue;
    }
    // 被龙吼吼晕 / 被漩涡卷住：原地打晃（漩涡的吸力在 sim.js 里加）
    if (c.daze > 0) {
      c.daze -= dt; c.vx *= .9; c.vy *= .9; c.vz *= .9; move(c, dt);
      c.roll = Math.sin(t * 7 + c.id) * .45; c.flap = .15; c.phase += dt * 2;
      if (d.hab === 'air') keepAir(c, 2); else keepWater(c, t, -.4);
      if (c.daze <= 0) { if (!c.roast && !c.stun) { c.cooked = 0; c.cookT = 0; } c.skillHit = 0; }
      continue;
    }
    c.roll = c.st === 'flip' ? c.roll : lerp(c.roll, 0, damp(3, dt));
    c.flee = false;

    switch (d.beh) {
      case 'flock': {          // 小雀：队形绕锚点；龙靠近就四散，1 秒后回来
        if (threat && g.scatter <= 0 && g.scd <= 0) { g.scatter = 1; g.scd = 4; g.sx = hx / (hd || 1); g.sz = hz / (hd || 1); }
        if (g.scatter > 0) {
          c.flee = true;
          const a = c.off.a + g.scatter * 2, sx = (g.sx || 0) + Math.cos(a) * .9, sz = (g.sz || 0) + Math.sin(a) * .9;
          steer(c, c.x + sx * 20, c.y + c.off.h * 5, c.z + sz * 20, d.speed * 1.1, 4, dt);
        } else {
          const a = c.off.a + g.t * .5, rr = 2 + c.off.r * 3.5;
          steer(c, g.x + Math.cos(a) * rr, g.y + c.off.h * 2.5, g.z + Math.sin(a) * rr, d.speed * 1.4, 2.5, dt);
        }
        move(c, dt); keepAir(c, d.alt[0] - 10); face(c, dt);
        c.flap = .55 + .45 * Math.max(0, Math.sin(t * 1.3 + c.off.a * 3)); c.phase += dt * (10 + 8 * c.flap);
        break;
      }
      case 'circle': {         // 海鸥：在觅食点上空盘旋；偶尔一只俯冲到水面
        c.stT -= dt;
        if (c.st === 'idle' && c.stT <= 0) { c.st = 'dive'; c.stT = 3.2; }
        if (c.st === 'dive' && c.stT <= 0) { c.st = 'idle'; c.stT = r.range(6, 10); }
        const a = c.off.a + t * (d.speed / (10 + c.off.r * 8)), rr = 10 + c.off.r * 8;
        let ty = g.y + c.off.h * 5;
        if (c.st === 'dive') ty = c.stT > 1.7 ? waveH(c.x, c.z, t) + 1.6 : c.stT > .6 ? waveH(c.x, c.z, t) + 1.8 : g.y;
        if (threat) { c.flee = true; ty += 8; }
        steer(c, g.x + Math.cos(a) * rr, ty, g.z + Math.sin(a) * rr, d.speed * 1.3, 2, dt);
        move(c, dt); c.y = Math.max(c.y, waveH(c.x, c.z, t) + 1.2); face(c, dt, .9);
        c.flap = c.st === 'dive' && c.stT > 1.7 ? .2 : .35 + .3 * Math.max(0, Math.sin(t * .9 + c.off.a * 2)); c.phase += dt * (6 + 6 * c.flap);
        break;
      }
      case 'orbit': {          // 熔岩雀：绕着火山烟柱转圈
        const a = c.off.a + t * (d.speed / (22 + c.off.r * 14)) * (c.id % 2 ? 1 : -1), rr = 22 + c.off.r * 14;
        const hm = g.home || g, ty = clamp(hm.y * (.7 + c.off.h * .25) + Math.sin(t * .4 + c.off.a) * 6, d.alt[0], d.alt[1]);
        if (threat) c.flee = true;
        steer(c, hm.x + Math.cos(a) * rr + (threat ? hx / hd * 15 : 0), ty, hm.z + Math.sin(a) * rr + (threat ? hz / hd * 15 : 0), d.speed * (threat ? 1.1 : 1), 2, dt);
        move(c, dt); keepAir(c, d.alt[0]); face(c, dt, .8);
        c.flap = .7; c.phase += dt * 14;
        break;
      }
      case 'drift': {          // 云水母 / 水母：慢慢漂，一张一合，不逃
        const a = c.off.a + t * .15, rr = 3 + c.off.r * 6;
        steer(c, g.x + Math.cos(a) * rr, g.y + c.off.h * 4 + Math.sin(t * .6 + c.off.a) * 1.2, g.z + Math.sin(a) * rr, d.speed * 1.5, 1, dt);
        move(c, dt); if (d.hab === 'water') keepWater(c, t, -2);
        c.pitch = lerp(c.pitch, 0, damp(2, dt)); c.phase += dt * (sp_(c).hab === 'air' ? 1.6 : 2.2); c.flap = .5 + .5 * Math.sin(c.phase);
        break;
      }
      case 'school': {         // 沙丁鱼：鱼球打转；受惊炸开 1 秒后聚拢
        // 只躲海龙（火龙扎下来那一下鱼球被吓呆了，躲不开 —— 保证「扎水抓鱼」写了就做得到）
        if (threat && S.kind === 'sea' && hd < 6 + h.len * .5 && g.scatter <= 0 && g.scd <= 0) { g.scatter = .8; g.scd = 3; }
        const a = c.off.a + t * (1.2 + c.off.s * .6), rr = 2.2 + c.off.r * 2.8;
        let tx = g.x + Math.cos(a) * rr, ty = g.y + c.off.h * 1.6, tz = g.z + Math.sin(a) * rr;
        if (g.scatter > 0) { c.flee = true; tx = c.x + (hx / (hd || 1)) * 8 + Math.cos(c.off.a) * 4; ty = c.y + c.off.h * 2; tz = c.z + (hz / (hd || 1)) * 8 + Math.sin(c.off.a) * 4; }
        steer(c, tx, ty, tz, d.speed * (g.scatter > 0 ? 1.3 : 1.2), 3.5, dt);
        move(c, dt); keepWater(c, t, -.6); face(c, dt, .3);
        c.flap = .8; c.phase += dt * 14;
        break;
      }
      case 'jet': {            // 鱿鱼：一下一下喷射前进
        c.stT -= dt; if (c.stT <= 0) { c.stT = 1.5; const a = g.yaw + c.off.a * .3 + (threat ? Math.PI : 0); c.vx += Math.sin(a) * d.speed * (threat ? 1.4 : 1); c.vz += Math.cos(a) * d.speed * (threat ? 1.4 : 1); }
        const pull = 1 - Math.min(1, Math.hypot(g.x - c.x, g.z - c.z) / 12);
        c.vx += (g.x - c.x) * .05 * (1 - pull) * dt * 10; c.vz += (g.z - c.z) * .05 * (1 - pull) * dt * 10;
        c.vy += (g.y + c.off.h * 2 - c.y) * dt;
        c.vx *= Math.exp(-1.6 * dt); c.vy *= Math.exp(-1.6 * dt); c.vz *= Math.exp(-1.6 * dt);
        if (threat) c.flee = true;
        move(c, dt); keepWater(c, t, -2); face(c, dt, .2);
        c.flap = clamp(1.2 - (1.5 - c.stT) * 1.5, 0, 1); c.phase = c.stT * TAU / 1.5;
        break;
      }
      case 'turtle': {         // 海龟：慢慢游；被追就往下潜
        const ty = threat ? Math.max(g.y - 15, seabedY(c.x, c.z) + 2) : g.y + c.off.h * 2;
        if (threat) c.flee = true;
        steer(c, g.x + Math.cos(c.off.a) * 4 + (threat ? hx / hd * 10 : 0), ty, g.z + Math.sin(c.off.a) * 4 + (threat ? hz / hd * 10 : 0), d.speed * (threat ? 1.6 : 1), 1, dt);
        move(c, dt); keepWater(c, t, -3); face(c, dt, .4);
        c.flap = threat ? 1 : .6; c.phase += dt * (2.5 + 2 * c.flap);
        break;
      }
      case 'leap': {           // 飞鱼：在水面下游，时不时跃出滑翔 1~1.5 秒
        c.stT -= dt;
        if (c.st !== 'air') {
          const a = c.off.a + t * .4, rr = 4 + c.off.r * 6;
          steer(c, g.x + Math.cos(a) * rr, -1.2, g.z + Math.sin(a) * rr, d.speed * .7, 2, dt);
          move(c, dt); keepWater(c, t, -.5); face(c, dt, .3);
          if (c.stT <= 0 || (threat && c.stT < 3)) {
            c.st = 'air'; const a2 = c.yaw; c.vx = Math.sin(a2) * d.speed; c.vz = Math.cos(a2) * d.speed; c.vy = r.range(6, 8.5);
            c.y = waveH(c.x, c.z, t) + .2; S.events.push({ type: 'splash', x: c.x, z: c.z, size: .3 });
          }
          c.flap = .8; c.phase += dt * 12;
        } else {
          c.vy -= 11 * dt; move(c, dt); face(c, dt, .2); c.flap = .15; c.phase += dt * 3;
          if (c.y < waveH(c.x, c.z, t) && c.vy < 0) { c.st = 'swim'; c.stT = r.range(3, 7); S.events.push({ type: 'splash', x: c.x, z: c.z, size: .3 }); }
        }
        break;
      }
      case 'ray': {            // 蝠鲼：慢慢滑行；每 15~25 秒冲出水面一次
        c.stT -= dt;
        if (c.st === 'air') {
          c.vy -= 20 * dt; move(c, dt); face(c, dt, .3); c.flap = .2; c.phase += dt * 1.5;
          if (c.y < waveH(c.x, c.z, t) && c.vy < 0) { c.st = 'idle'; c.stT = r.range(15, 25); S.events.push({ type: 'splash', x: c.x, z: c.z, size: 1 }); }
          break;
        }
        const rising = c.stT < 3;
        const ty = rising ? 2 : g.y;
        const fleeing = threat;
        steer(c, g.x + Math.sin(g.yaw) * 20 + (fleeing ? hx / hd * 25 : 0), ty, g.z + Math.cos(g.yaw) * 20 + (fleeing ? hz / hd * 25 : 0), d.speed * (rising ? 1.6 : fleeing ? 1.4 : 1), .8, dt);
        move(c, dt); face(c, dt, 1);
        if (rising && c.y > waveH(c.x, c.z, t) - .3) { c.st = 'air'; c.vy = 9; S.events.push({ type: 'splash', x: c.x, z: c.z, size: 1 }); }
        else keepWater(c, t, rising ? 3 : -2);
        c.flee = fleeing; c.flap = .6; c.phase += dt * 2.2;
        break;
      }
      case 'patrol': stepPredator(S, c, g, d, hx, hy, hz, hd, dt); break;
    }
    if (c.feared) { c.x = c.px + (c.x - c.px) * .3; c.y = c.py + (c.y - c.py) * .3; c.z = c.pz + (c.z - c.pz) * .3; c.flee = false; }
  }
  // 删掉回收完的
  for (let i = S.creatures.length - 1; i >= 0; i--) {
    const c = S.creatures[i];
    if (c.dying && c.dying >= 1) { S.creatures[i] = S.creatures[S.creatures.length - 1]; S.creatures.pop(); c.g.members--; }
  }
}

// 天敌：巡逻 → 发现（「!」1.5 秒）→ 追（最多 8 秒）→ 扑空 / 咬到后退开 6 秒。成龙以后见你就逃（能吃）
function stepPredator(S, c, g, d, hx, hy, hz, hd, dt) {
  const h = S.hero, t = S.t, mine = d.predator === S.kind;
  const sameMedium = h.medium === (d.hab === 'water' ? 'water' : 'air');
  const canHunt = mine && S.stage === 0 && sameMedium && h.shield <= 0 && h.medium !== 'cross';
  c.stT -= dt;
  if (c.edible && hd < 60 && sameMedium) c.st = 'flee';
  else if (c.st === 'flee' && hd > 90) c.st = 'idle';
  if (c.st === 'idle' && canHunt && hd < 70 && c.stT <= 0) { c.st = 'alert'; c.stT = 1.5; S.events.push({ type: 'alert', id: c.id, sp: c.sp }); }
  if (c.st === 'alert' && !canHunt) { c.st = 'idle'; c.stT = 3; }
  if (c.st === 'alert' && c.stT <= 0) { c.st = 'chase'; c.stT = 8; }
  if (c.st === 'chase' && (c.stT <= 0 || !canHunt || h.invuln > 0)) { c.st = 'retreat'; c.stT = 6; }
  if (c.st === 'retreat' && c.stT <= 0) { c.st = 'idle'; c.stT = 4; }
  c.alert = c.st === 'alert' ? 1 : c.st === 'chase' ? .6 : Math.max(0, c.alert - dt * 2);
  c.chasing = c.st === 'chase';
  const chaseV = S.cfg.level ? S.cfg.level * 1.08 : S.cfg.cruise * 1.08;
  let tx, ty, tz, v = d.speed * .7;
  if (c.st === 'chase') { tx = h.x + Math.sin(h.yaw) * 4; ty = h.y; tz = h.z + Math.cos(h.yaw) * 4; v = chaseV; }
  else if (c.st === 'alert') { tx = c.x - hx * .1; ty = c.y; tz = c.z - hz * .1; v = d.speed * .3; }
  else if (c.st === 'retreat' || c.st === 'flee') {
    // 逃：速度比玩家平飞慢一截，高度不超出自己的活动范围（不然成龙追不上，「吃掉大鹏」就做不到）
    const lv = S.cfg.level || S.cfg.cruise;
    tx = c.x + hx / (hd || 1) * 30; tz = c.z + hz / (hd || 1) * 30;
    ty = d.hab === 'air' ? Math.min(d.alt[1], c.y + 3) : Math.max(d.depth[1], c.y - 3);
    v = c.st === 'flee' ? Math.min(d.speed, lv * .82) : d.speed; c.flee = c.st === 'flee';
  }
  else { const a = c.off.a + t * (d.speed * .7 / 35); tx = g.x + Math.cos(a) * 35; ty = g.y + Math.sin(t * .2) * 6; tz = g.z + Math.sin(a) * 35; }
  steer(c, tx, ty, tz, v, c.st === 'chase' ? 2.2 : 1.2, dt);
  move(c, dt);
  if (d.hab === 'air') keepAir(c, d.alt[0] * (c.st === 'chase' ? .2 : 1)); else keepWater(c, t, c.st === 'chase' ? -1 : -4);
  face(c, dt, .7);
  c.flap = d.hab === 'air' ? (c.st === 'chase' ? 1 : .5) : (c.st === 'chase' ? 1 : .55);
  c.phase += dt * (d.hab === 'air' ? 4 + 4 * c.flap : 3 + 4 * c.flap);
  // 咬
  if (c.st === 'chase' && hd < h.len * .5 + c.size * .55 && h.invuln <= 0) {
    S.bite(c);
    c.st = 'retreat'; c.stT = 6;
  }
}
