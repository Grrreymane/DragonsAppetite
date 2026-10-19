// 远处的生命：定住镜头近看一种（截图）。?what=surface|breach|dolphins|birds|glide|manta|turtle|jelly &d=距离 &y=主角高度 &t=截图时刻（逗号分隔，秒）
//   python tools/rec3d.py --director tools/scenarios/ambient_probe.js --query "kind=fire&what=surface&d=70&y=30&t=1,3,6" --out .cache/amb/probe
const Q = new URLSearchParams(location.search), fps = 30;
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__amb);
window.__pause = true;
const D = window.__dg, A = window.__amb, S = D.S;
if (Q.has('tod') && window.__env) { window.__env.fixed = true; window.__env.f = +Q.get('tod'); }
const x0 = +(Q.get('x') || -840), z0 = +(Q.get('z') || -960), y0 = +(Q.get('y') || 30);
const hold = () => { Object.assign(S.hero, { x: x0, y: y0, z: z0, px: x0, py: y0, pz: z0, yaw: 0, pitch: 0 }); };
hold(); D.teleport(x0, y0, z0); A.auto = false; A.clear();
for (let i = 0; i < 30; i++) { hold(); D.frame(1 / fps); }
const what = Q.get('what') || 'surface', d = +(Q.get('d') || 80), a = +(Q.get('a') || 0);
const o = { d, a, force: true }; if (Q.has('style')) o.style = Q.get('style'); if (Q.has('dark')) o.dark = Q.get('dark') === '1'; if (Q.has('by')) o.y = +Q.get('by');
if (what === 'jelly') for (let i = 0; i < 16; i++) A.spawn('jelly', { force: true }); else A.spawn(what, o);
const ts = (Q.get('t') || '1,3,6').split(',').map(Number);
let t = 0;
for (const T of ts) { while (t < T) { hold(); D.frame(1 / fps); t += 1 / fps; } await __shot(what + '_' + T); if (Q.has('cmp')) { const am = D.scene.getObjectByName('ambient'); am.visible = false; D.render(); await __shot(what + '_' + T + '_off'); am.visible = true; } __log(T + ' ' + JSON.stringify(A.stats())); }
await __done();
