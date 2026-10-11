// 生物：试验页鸟群（60 小雀 + 120 沙丁鱼）的三角面明细：每种画了几只本体 / 几只描边。URL：cull（按海面剔除，和游戏一样）
const wait = () => new Promise(r => { const k = () => window.__cr && window.__cr.ready ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const C = window.__cr, Q = new URLSearchParams(location.search);
C.cr.cullMedium = Q.has('cull');
C.set('flock', 'sky'); C.step(30, 1 / 30);
C.hideSky(true); const i = C.info(); C.hideSky(false);
const per = Object.fromEntries(Object.entries(C.cr.species).filter(([k, b]) => b.n).map(([k, b]) => [k, b.n + '/' + b.nNear + ' = ' + b.m.tris * (b.n + b.nNear)]));
__log('FLOCK ' + C.renderer.domElement.clientWidth + 'x' + C.renderer.domElement.clientHeight + ' cull ' + C.cr.cullMedium + ' calls ' + i.calls + ' tris ' + i.tris + ' ' + JSON.stringify(per));
await __shot('flock');
await __done();
