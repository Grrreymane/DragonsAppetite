const wait = () => new Promise(r => { const k = () => window.__flReady ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
window.__fl.step(30, 1/30);
await __shot('smoke');
for (let i = 0; i < 10; i++) { window.__fl.step(1, 1/30); await __frame(); }
__log('done ok');
await __done();
