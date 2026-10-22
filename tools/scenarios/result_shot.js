const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
for (let i = 0; i < 60; i++) D.frame(1 / 30);
D.ui.showResult({ kind: new URLSearchParams(location.search).get('kind') || 'fire', timeSec: 312, eaten: 187, codexN: 14, codexMax: 20, stageName: '大胃王' }, () => {});
await new Promise(r => setTimeout(r, 2200));
await __shot('result');
// 分享卡
const cv = await D.ui._result.drawCard(); const img = new Image(); img.src = cv.toDataURL('image/jpeg', .9);
Object.assign(img.style, { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: 999, background: '#000' }); document.body.appendChild(img);
await new Promise(r => setTimeout(r, 400));
await __shot('card');
await __done();
