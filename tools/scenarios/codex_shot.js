// 图鉴：把所有物种都算吃过一次（看 20 格的排版），截图；再在游戏里截一张
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
const D = window.__dg, { SPECIES_IDS } = await import('/src/config/species.js');
for (let i = 0; i < 40; i++) D.frame(1 / 30);
await __shot('play');
SPECIES_IDS.forEach((id, i) => { if (i % 3) D.save.codex[id] = { n: i + 1, gold: i % 5 === 0 ? 1 : 0 }; });
D.ui.showCodex(D.save);
for (let i = 0; i < 20; i++) { D.frame(1 / 30); await new Promise(r => setTimeout(r, 60)); }
await __shot('codex');
await __done();
