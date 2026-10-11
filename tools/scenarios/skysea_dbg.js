// 调试：把岸线距离场（sea-shore.js 的渲染目标，R = 窄、G = 宽）存成图看，再拍一张当前画面
//   python tools/rec3d.py --page index.html --director tools/scenarios/skysea_dbg.js --query "autostart&kind=fire" --out .cache/rec/skysea_dbg
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__shore);
window.__pause = true;
const D = window.__dg;
D.teleport(0, 70, 90);
for (let i = 0; i < 8; i++) { Object.assign(D.S.hero, { x: 0, y: 70, z: 90, px: 0, py: 70, pz: 90, yaw: .2, pitch: 0 }); if (i === 7) window.__shore.lastT = -1e9; D.frame(1 / 30); }
const sh = window.__shore, R = 512, buf = new Uint8Array(R * R * 4);
D.renderer.readRenderTargetPixels(sh.rt, 0, 0, R, R, buf);
const cv = document.createElement('canvas'); cv.width = cv.height = R; const g = cv.getContext('2d'); const im = g.createImageData(R, R);
for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) { const s = ((R - 1 - y) * R + x) * 4, d = (y * R + x) * 4; im.data[d] = buf[s]; im.data[d + 1] = buf[s + 1]; im.data[d + 2] = 0; im.data[d + 3] = 255; }
g.putImageData(im, 0, 0);
__log('region ' + sh.region.toArray().map(v => v.toFixed(0)).join(',') + ' meshes=' + sh.count);
const b = await new Promise(r => cv.toBlob(r, 'image/png'));
await fetch('/__shot?name=shoremap', { method: 'POST', body: b });
await __shot('view');
await __done();
