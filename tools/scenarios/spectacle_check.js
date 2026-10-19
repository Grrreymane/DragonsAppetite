// 大场面：下雨打雷（劈在前方猎物上）→ 夜里流星雨（星星落下来，机器人去吃）。录视频 + 联系表
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg, E = window.__env, bot = makeBot(TIERS[0], 9);
D.S.hunt = null; D.S.huntNext = 1e9;
E.fixed = true; E.f = .2; E.setWeather('rain', 1e9); E.flashT = 2;
let shotIn = -1, sn = 0;
const ol = E.onLightning; E.onLightning = e => { ol(e); shotIn = 2; };
const run = async (sec, fn) => { for (let i = 0; i < sec * 30; i++) { const o = bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; fn && fn(i); D.frame(1 / 30); if (!Q.has('noframes')) await __frame(); if (shotIn-- === 0 || (Q.has('shots') && i % 60 === 59)) await __shot('s' + String(sn++).padStart(2, '0')); } };
await run(+(Q.get('rain') || 14));
E.setWeather('clear', 1e9); E.f = .74; E.meteorDay = -1;
const p0 = D.S.pts;
await run(+(Q.get('night') || 22));
__log('stars eaten ' + (D.S.stats.stars || 0) + ' pts +' + Math.round(D.S.pts - p0));
await __done();
