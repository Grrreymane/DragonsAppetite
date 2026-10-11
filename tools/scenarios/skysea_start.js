// 开局头几帧（海龙出生在水下）：不该出现水上的灰白雾
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 50); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
for (let i = 0; i < 4; i++) { D.frame(1 / 30); await __shot('start' + i); }
await __done();
