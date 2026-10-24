// 地标的玩法：碰撞（胶囊）、第一次靠近 = 发现（成长 +10，存档）、穿过拱门（+3）。纯逻辑。
import { LANDMARKS, LANDMARK_CAPS, LANDMARK_OPENING, LANDMARK_PTS, ARCH_PTS } from '../config/landmarks.js';
import { wrapP } from './world.js';

// 地标 L 在 (x,z) 附近那一份的中心（世界坐标）
export function landmarkPos(L, x, z) { return { x: x + wrapP(L.x - x), y: L.y, z: z + wrapP(L.z - z) }; }

// 世界点 → 地标的模型坐标（米，未缩放前）
function toLocal(L, c, px, py, pz) {
  const dx = (px - c.x) / L.scale, dy = (py - c.y) / L.scale, dz = (pz - c.z) / L.scale, cs = Math.cos(L.yaw), sn = Math.sin(L.yaw);
  return [dx * cs - dz * sn, dy, dx * sn + dz * cs];
}
function toWorldDir(L, x, y, z) { const cs = Math.cos(L.yaw), sn = Math.sin(L.yaw); return [x * cs + z * sn, y, -x * sn + z * cs]; }

// 最近一次推出去的方向（世界坐标，单位向量）：主程序拿来让龙顺着滑开
export const pushN = { x: 0, y: 0, z: 0 };
// 把球（p，半径 rad）推出地标的胶囊；返回推了多少
export function pushOutOfLandmarks(p, rad) {
  let hit = 0; pushN.x = pushN.y = pushN.z = 0;
  for (const L of LANDMARKS) {
    const caps = LANDMARK_CAPS[L.id]; if (!caps) continue;
    const c = landmarkPos(L, p.x, p.z);
    if (Math.abs(p.x - c.x) > L.r * 1.6 || Math.abs(p.z - c.z) > L.r * 1.6) continue;
    for (const cp of caps) {
      const [lx, ly, lz] = toLocal(L, c, p.x, p.y, p.z), r = cp.r + rad / L.scale;
      const [ax, ay, az] = cp.a, bx = cp.b[0] - ax, by = cp.b[1] - ay, bz = cp.b[2] - az;
      const t = Math.max(0, Math.min(1, ((lx - ax) * bx + (ly - ay) * by + (lz - az) * bz) / (bx * bx + by * by + bz * bz || 1)));
      const qx = lx - (ax + bx * t), qy = ly - (ay + by * t), qz = lz - (az + bz * t), d = Math.hypot(qx, qy, qz);
      if (d >= r) continue;
      const pen = (r - d) * L.scale, n = d > 1e-4 ? toWorldDir(L, qx / d, qy / d, qz / d) : [0, 1, 0];
      p.x += n[0] * pen; p.y += n[1] * pen; p.z += n[2] * pen;
      if (pen > hit) { hit = pen; pushN.x = n[0]; pushN.y = n[1]; pushN.z = n[2]; }
    }
  }
  return hit;
}

// 每步：发现、穿拱门
export function stepLandmarks(S, dt) {
  const h = S.hero;
  S.lmSeen ||= {};
  for (const L of LANDMARKS) {
    const c = landmarkPos(L, h.x, h.z), dh = Math.hypot(h.x - c.x, h.z - c.z);
    if (dh < L.r && !S.lmSeen[L.id] && Math.abs(h.y - c.y) < L.r * 1.2) {
      S.lmSeen[L.id] = 1;
      const first = !S.landmarks[L.id];
      if (first) { S.landmarks[L.id] = 1; S.pts += LANDMARK_PTS; }
      S.events.push({ type: 'landmark', id: L.id, zh: L.zh, en: L.en, first, pts: first ? LANDMARK_PTS : 0, x: c.x, y: c.y, z: c.z });
    } else if (dh > L.r * 2.5) S.lmSeen[L.id] = 0;   // 走远了再回来：再报一次名字（不再给分）
    const op = LANDMARK_OPENING[L.id];
    if (op && dh < L.r) {
      // 洞的平面 = 模型的 z = op.c[2]；上一步和这一步在平面两边、且穿过点在洞里 → 穿过
      const a = toLocal(L, c, h.px, h.py, h.pz), b = toLocal(L, c, h.x, h.y, h.z), z0 = op.c[2];
      if ((a[2] - z0) * (b[2] - z0) < 0) {
        const f = (z0 - a[2]) / (b[2] - a[2]), x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
        const ph = (op.peak || op.hh * 2) / 2;   // 洞是圆拱：按椭圆（宽 hw，高到拱顶）判断
        if (((x - op.c[0]) / op.hw) ** 2 + ((y - ph) / ph) ** 2 < 1.15 && y > -2 && S.t - (S.archT || -99) > 6) {
          S.archT = S.t; S.pts += ARCH_PTS;
          S.events.push({ type: 'archPass', id: L.id, x: h.x, y: h.y, z: h.z, pts: ARCH_PTS });
        }
      }
    }
  }
}
