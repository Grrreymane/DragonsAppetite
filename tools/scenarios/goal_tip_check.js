// 小目标卡：缩小后的样子 + 点开的说明
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg; D.S.hunt = null; D.S.huntNext = 1e9;
if (new URLSearchParams(location.search).has('stage2')) await D.setStage(2);
for (let i = 0; i < 40; i++) { D.frame(1 / 30); await new Promise(r => setTimeout(r, 30)); }
await __shot('a_card');
const g = document.querySelector('.d-goal'); g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
for (let i = 0; i < 6; i++) { D.frame(1 / 30); await new Promise(r => setTimeout(r, 30)); }
await __shot('b_tip');
await __done();
