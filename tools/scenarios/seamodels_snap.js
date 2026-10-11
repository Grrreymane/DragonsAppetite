// 海龙模型对比页截图（_lab/seamodels.html）：等模型加载完，存一张（名字 = ?shot=，默认 sea），打印面数 / 动作时长
const Q = new URLSearchParams(location.search);
const wait = () => new Promise(r => { const k = () => (window.__sm && window.__sm.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
__log(JSON.stringify(window.__sm.info));
await new Promise(r => setTimeout(r, 300));
window.__sm.render();
await __shot(Q.get('shot') || 'sea');
await __done();
