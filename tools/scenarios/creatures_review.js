// 审查用（生物模块）：真游戏里检查生物（撞晕翻转、出生尺寸、实际三角面）。撞晕检查挑画面里最近的一只（画面外的不画）
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 30);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 1234);
const root = D.scene.getObjectByName('creatures');
__log('creatures root found: ' + !!root + ' children ' + (root ? root.children.length : 0));
const fps = 30;
let zeroSize = 0, maxTris = 0, maxCalls = 0, sumTris = 0, nS = 0, overCap = {};
function crInfo() {
  // 只画生物：把其他东西藏起来
  const vis = [];
  for (const o of D.scene.children) if (o !== root) { vis.push([o, o.visible]); o.visible = false; }
  D.renderer.render(D.scene, D.camera);
  const i = { calls: D.renderer.info.render.calls, tris: D.renderer.info.render.triangles };
  for (const [o, v] of vis) o.visible = v;
  return i;
}
const up = new (D.camera.up.constructor)();
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true;
  D.frame(1 / fps);
  for (const c of D.S.creatures) if (!(c.size > 0)) zeroSize++;
  const cnt = {}; for (const c of D.S.creatures) cnt[c.sp] = (cnt[c.sp] || 0) + 1;
  for (const sp in cnt) if (cnt[sp] > (overCap[sp] || 0)) overCap[sp] = cnt[sp];
  if (i % 15 === 0) { const ci = crInfo(); maxTris = Math.max(maxTris, ci.tris); maxCalls = Math.max(maxCalls, ci.calls); sumTris += ci.tris; nS++; }
  if (i % (fps * 5) === 0) { D.render(); } if (i % (fps * 5) === 0) await __shot('g' + String(i / fps).padStart(3, '0'));
}
__log(`zeroSize renders ${zeroSize}; creature-only tris max ${maxTris} avg ${(sumTris / nS) | 0}, calls max ${maxCalls}; max per-species counts ${JSON.stringify(overCap)}`);

// 撞晕：把离主角最近的一只设成撞晕，跑 1 秒，看它在画面里的「上」方向
const h = D.S.hero;
let best = null, bd = 1e9;
const pp = new (D.camera.position.constructor)();
for (const c of D.S.creatures) { pp.set(c.x, c.y, c.z).project(D.camera); if (pp.z > 1 || Math.abs(pp.x) > .8 || Math.abs(pp.y) > .8) continue; const d = Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z); if (d < bd && !c.dying && c.size > .1) { bd = d; best = c; } }
if (best) {
  best.stun = 3; best.cooked = 1;
  for (let k = 0; k < 30; k++) { D.input.jx = 0; D.input.jy = 0; D.frame(1 / fps); }
  const m = root.getObjectByName('cr_' + best.sp);
  __log('DBG mesh ' + (m && m.name) + ' count ' + (m && m.count) + ' visible ' + (m && m.visible) + ' alive ' + D.S.creatures.includes(best) + ' size ' + best.size + ' xyz ' + [best.x, best.y, best.z].map(v => v.toFixed(1)) + ' cam ' + D.camera.position.toArray().map(v => v.toFixed(1)));
  const M = new (D.camera.matrix.constructor)(), P = new (D.camera.position.constructor)(), Qt = new (D.camera.quaternion.constructor)(), Sc = new (D.camera.position.constructor)();
  let bk = -1, bdd = 1e9;
  for (let k = 0; k < m.count; k++) { M.fromArray(m.instanceMatrix.array, k * 16); M.decompose(P, Qt, Sc); const d = Math.hypot(P.x - best.x, P.y - best.y, P.z - best.z); if (d < bdd) { bdd = d; bk = k; } }
  M.fromArray(m.instanceMatrix.array, bk * 16); M.decompose(P, Qt, Sc); up.set(0, 1, 0).applyQuaternion(Qt);
  __log(`STUN ${best.sp} id ${best.id} match dist ${bdd.toFixed(3)} stun ${best.stun.toFixed(2)} sim roll ${best.roll.toFixed(3)} pitch ${best.pitch.toFixed(2)} -> rendered up.y ${up.y.toFixed(3)} (belly-up wants < 0)`);
  await __shot('stun');
}
__log('done ok');
await __done();
