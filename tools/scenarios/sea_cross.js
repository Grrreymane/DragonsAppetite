// 入水 / 出水：镜头从 +8 沉到 -8 再浮上来，逐帧存图（看有没有闪白）+ 打印三角面
const wait = () => new Promise(r => { const k = () => window.__labReady ? r() : setTimeout(k, 50); k(); });
await wait();
const L = window.__lab;
L.view('掠水');
for (let f = 0; f < 20; f++) L.tick(1 / 60);
const ys = [];
for (let i = 0; i < 40; i++) ys.push(8 - i * 0.4);
for (let i = 0; i < 25; i++) ys.push(-8);
for (let i = 0; i < 40; i++) ys.push(-8 + i * 0.4);
for (let i = 0; i < 15; i++) ys.push(8);
for (const y of ys) {
  L.setCam([0, y, 60 + L.S.t * 0], [0, y - 8, 110]);
  L.tick(1 / 30); L.render();
  __log('y=' + y.toFixed(1) + ' under=' + L.sea.underwater.toFixed(2) + ' fog=' + L.scene.fog.near.toFixed(0) + '..' + L.scene.fog.far.toFixed(0));
  await __frame();
}
await __done();
