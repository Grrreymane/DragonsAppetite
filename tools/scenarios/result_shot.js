const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
for (let i = 0; i < 60; i++) D.frame(1 / 30);
D.ui.showResult({ kind: new URLSearchParams(location.search).get('kind') || 'fire', timeSec: 312, eaten: 187, codexN: 9, codexMax: 12, stageName: '大胃王' }, () => {});
await new Promise(r => setTimeout(r, 800));
await __shot('result');
await __done();
