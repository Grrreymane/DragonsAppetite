// 生物：真游戏里用技能（龙吼 / 漩涡）和威压时的样子 + 生物的绘制预算（机器人玩，技能放出后第 8 / 40 / 90 帧各拍一张；吓呆的拍 3 张）
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 40);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 77), fps = 30;
const root = D.scene.getObjectByName('creatures'), api = root.userData.api;
const cam = D.camera, V = cam.position.constructor;
const W = D.renderer.domElement.clientWidth, H = D.renderer.domElement.clientHeight;
function crOnly() { const vis = []; for (const o of D.scene.children) if (o !== root) { vis.push([o, o.visible]); o.visible = false; } D.renderer.render(D.scene, D.camera); const i = D.renderer.info.render, r = { calls: i.calls, tris: i.triangles }; for (const [o, v] of vis) o.visible = v; D.renderer.render(D.scene, D.camera); return r; }
function onScreen(filter, n = 8) { const out = [], p = new V(); for (const c of D.S.creatures) { if (filter && !filter(c)) continue; p.set(c.x, c.y, c.z).project(cam); if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue; const d = cam.position.distanceTo(new V(c.x, c.y, c.z)); out.push({ id: c.id, sp: c.sp, sx: Math.round((p.x * .5 + .5) * W), sy: Math.round((-p.y * .5 + .5) * H), d: Math.round(d), f: c.feared ? 1 : 0, sk: c.skillHit ? 1 : 0 }); } out.sort((a, b) => a.d - b.d); return out.slice(0, n); }
let skillShots = 0, fearShots = 0, maxCr = { calls: 0, tris: 0 }, lastSkT = 0, nFrames = 0, skN = 0;
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
  D.frame(1 / fps);
  const sk = D.S.hero.skill;
  if (i % 6 === 0) { const r = crOnly(); if (r.tris > maxCr.tris) maxCr = r; }
  if (sk && sk.t > 0 && lastSkT <= 0) { __log('SKILL fired at ' + D.S.t.toFixed(1) + ' id ' + sk.id); skillShots = 1; nFrames = 0; skN++; }
  lastSkT = sk ? sk.t : 0;
  if (skillShots && skillShots < 4) { nFrames++; if (nFrames === 8 || nFrames === 40 || nFrames === 90) { const nm = 'skill' + skN + '_' + (skillShots++); await __shot(nm); __log('SHOT ' + nm + ' ' + JSON.stringify(onScreen(c => c.skillHit)) + ' stars ' + api.fx.stars.count + ' glints ' + api.fx.glints.count + ' cr ' + JSON.stringify(crOnly()) + ' all calls ' + D.renderer.info.render.calls); } }
  if (fearShots < 3 && i % 45 === 0) { const f = onScreen(c => c.feared); if (f.length >= 2) { const nm = 'fear' + (fearShots++); await __shot(nm); __log('SHOT ' + nm + ' ' + JSON.stringify(f)); } }
}
__log('CR max ' + JSON.stringify(maxCr));
__log('done ok');
await __done();
