// 把 models/landmarks/<id>.json 里的碰撞胶囊 / 拱门洞写进 src/config/landmarks.js（LANDMARK_CAPS / LANDMARK_OPENING 两行）
// 用法：node tools/landmark_caps.mjs   （重建模型 python blender/landmark_build.py 以后跑一次）
import fs from 'fs';
const r1 = v => Math.round(v * 10) / 10;
const caps = {}, open = {};
for (const f of fs.readdirSync('models/landmarks').filter(f => f.endsWith('.json'))) {
  const d = JSON.parse(fs.readFileSync('models/landmarks/' + f, 'utf8')), id = d.key || f.replace('.json', '');
  caps[id] = (d.capsules || []).map(c => ({ a: c.a.map(r1), b: c.b.map(r1), r: r1(c.r) }));
  if (d.opening) open[id] = { c: d.opening.c.map(r1), hw: r1(d.opening.hw), hh: r1(d.opening.hh), peak: r1(d.opening.peak || d.opening.hh * 2) };
}
const p = 'src/config/landmarks.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/export const LANDMARK_CAPS = .*;\n/, `export const LANDMARK_CAPS = ${JSON.stringify(caps)};\n`);
s = s.replace(/export const LANDMARK_OPENING = .*;\n/, `export const LANDMARK_OPENING = ${JSON.stringify(open)};\n`);
fs.writeFileSync(p, s);
console.log(Object.entries(caps).map(([k, v]) => `${k}: ${v.length} caps`).join(', '), JSON.stringify(open));
