// 排查：主程序调 ui.hint 的频率（提示会不会一会儿出一会儿收）
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 7), fps = 30;
D.save.tut = Object.assign(D.save.tut || {}, { drag: 1 });
const calls = []; const h0 = D.ui.hint.bind(D.ui); D.ui.hint = n => { calls.push([+D.S.t.toFixed(2), n]); return h0(n); };
for (let i = 0; i < 40 * fps; i++) { const o = bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true; D.frame(1 / fps); }
__log('hint calls ' + calls.length + ': ' + JSON.stringify(calls.slice(0, 60)));
await __done();
