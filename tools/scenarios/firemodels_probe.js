// firemodels 自查：等 _lab/firemodels.html 画完，存一张图（shot=名字），再把 &probe= 骨头的顶点投影（每格）打到日志里（PROBE {...}）
const Q = new URLSearchParams(location.search);
await new Promise(r => { const k = () => (window.__fm && window.__fm.ready) ? r() : setTimeout(k, 100); k(); });
await new Promise(r => setTimeout(r, 300));
__log(JSON.stringify(window.__fm.info));
await __shot(Q.get('shot') || 'cmp');
__log('PROBE ' + JSON.stringify(window.__fm.probe || {}));
await __done();
