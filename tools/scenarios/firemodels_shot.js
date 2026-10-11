// firemodels 自查：等 _lab/firemodels.html 画完，存一张图（名字用 URL 参数 shot=，默认 cmp）
const Q = new URLSearchParams(location.search);
await new Promise(r => { const k = () => (window.__fm && window.__fm.ready) ? r() : setTimeout(k, 100); k(); });
await new Promise(r => setTimeout(r, 300));
__log(JSON.stringify(window.__fm.info));
await __shot(Q.get('shot') || 'cmp');
await __done();
