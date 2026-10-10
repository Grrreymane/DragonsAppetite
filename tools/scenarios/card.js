// 主角卡片图：等模型加载好、渲染一帧、存图
const wait = () => new Promise(r => { const k = () => window.__cardReady ? r() : setTimeout(k, 100); k(); });
await wait();
window.__render();
await __shot(new URLSearchParams(location.search).get('name') || 'card');
await __done();
