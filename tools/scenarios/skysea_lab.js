// _lab/skysea.html 的定点截图（固定时间、固定镜头，改海面 / 天空前后好对比）：
//   python tools/rec3d.py --page _lab/skysea.html --director tools/scenarios/skysea_lab.js --query "still" --out .cache/rec/sslab
//   --query "still&views=mid,skim&time=12" 只拍这几张、换时间
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__labReady);
const L = window.__lab, t = +(Q.get('time') || 20);   // rec3d 自己会加 t=时间戳，这里用 time
const views = Q.get('views') ? Q.get('views').split(',') : Object.keys(L.VIEWS);
for (const v of views) {
  L.setView(v, t); L.render(30);
  const r = L.renderer.info.render;
  __log(`${v}: calls=${r.calls} tris=${(r.triangles / 1000).toFixed(1)}k under=${L.sea.underwater.toFixed(2)}`);
  await __shot(v);
}
await __done();
