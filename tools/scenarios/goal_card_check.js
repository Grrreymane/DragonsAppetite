// 小目标卡（写了奖励）+ 猎场结束的小一号大字 + 阴天时的主角亮度（带界面截图）
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg, E = window.__env;
D.S.hunt = null; D.S.huntNext = 1e9; D.S.leaderNext = 1e9;
E.fixed = true; E.f = .2; E.setWeather(Q.get('w') || 'rain', 1e9);
const fly = async n => { for (let i = 0; i < n; i++) { D.input.jx = 0; D.input.jy = 0; D.frame(1 / 30); await new Promise(r => setTimeout(r, 30)); } };
await fly(90);
await __shot('a_card');
D.ui.toast('吃到 5 只\n成长 +15', true);
await fly(12);
await __shot('b_toast');
if (Q.has('stage2')) { await D.setStage(2); await fly(40); await __shot('c_adult'); }
await __done();
