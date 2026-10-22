// 这轮界面：HUD（地图按钮）、首次喷火提示（×2）、地图面板、点图鉴进度条打开图鉴（成龙）
const Q = new URLSearchParams(location.search);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, S = D.S, bot = makeBot(TIERS[0], 7);
D.save.tut.drag = 1;
const press = el => { const r = el.getBoundingClientRect(), o = { bubbles: true, pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); };
const run = async n => { for (let i = 0; i < n; i++) { const o = bot(S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; D.frame(1 / 30); await new Promise(r => setTimeout(r, 25)); } };
await run(60);
D.ui.hint(S.kind === 'fire' ? 'fire' : 'dash'); await run(10);
await __shot('a_hud_hint');
press(document.querySelector('.d-mapb'));
await new Promise(r => setTimeout(r, 600));
await __shot('b_map');
if (Q.has('adult')) {
  press(document.querySelector('.d-mapbot .d-btn')); await new Promise(r => setTimeout(r, 300));
  await D.setStage(2); await run(30);
  document.querySelector('.d-cbar').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise(r => setTimeout(r, 600));
  await __shot('c_codex');
}
await __done();
