// 封面：等场景准备好，再合成标题字（DOM 上的字不在画布里，所以这里把字画到画布上再存）
const wait = () => new Promise(r => { const k = () => window.__coverReady ? r() : setTimeout(k, 100); k(); });
await wait();
await document.fonts.ready;
window.__render();
const cv = document.querySelector('canvas'), c2 = document.createElement('canvas');
c2.width = cv.width; c2.height = cv.height;
const g = c2.getContext('2d'); g.drawImage(cv, 0, 0);
for (const id of ['t', 's']) {
  const el = document.getElementById(id), cs = getComputedStyle(el), r = el.getBoundingClientRect();
  g.font = cs.font; g.textAlign = 'center'; g.textBaseline = 'top';
  const big = id === 't', x = c2.width / 2, y = r.top;
  g.fillStyle = '#1c3a66'; g.fillText(el.textContent, x, y + (big ? 6 : 3));
  g.fillStyle = '#fff'; g.fillText(el.textContent, x, y);
}
document.body.innerHTML = ''; document.body.appendChild(c2);
await __shot('cover');
await __done();
