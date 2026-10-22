// 大地图（用户：想看的时候能知道自己在哪）：整屏面板，打开时游戏暂停。
// 以主角为中心铺开一整份世界（世界按 PERIOD 循环，四周接着画）；三片海域不同底色，岛按种类画，
// 地标（发现过的写名字，没发现的是「？」），正在进行的猎场 / 金色领头标出来，主角是中间的箭头（朝向 = 屏幕上方为 +z）。
import { h, button, blocker, show } from './dom.js';
import { islands, zoneValue, wrapP, PERIOD } from '../sim/world.js';
import { LANDMARKS } from '../config/landmarks.js';

const ZC = { green: [64, 168, 176], volcano: [118, 70, 66], open: [30, 78, 140] };   // 海域底色
const ZN = { green: '翠岛海', volcano: '熔岩海', open: '深蓝外海' };
const zoneOf = (x, z) => {
  if (Math.hypot(wrapP(x), wrapP(z - 120)) < 330) return 'green';
  const f = zoneValue(x, z); return f > .38 ? 'volcano' : f < -.42 ? 'open' : 'green';
};

export function createMap(root, api) {
  const el = blocker(h('div', 'd-map d-full d-dim'));
  el.hidden = true;
  el.innerHTML = `<div class="d-mapbox"><div class="d-ribbon"><span>地图</span></div><canvas></canvas><div class="d-maphere"></div><div class="d-maplegend"><i style="background:rgb(64,168,176)"></i>翠岛海<i style="background:rgb(118,70,66)"></i>熔岩海<i style="background:rgb(30,78,140)"></i>深蓝外海<b>★</b>地标</div><div class="d-mapbot"></div></div>`;
  const cv = el.querySelector('canvas'), here = el.querySelector('.d-maphere');
  let onClose = null;
  el.querySelector('.d-mapbot').appendChild(button('back', '返回', 'd-btn', () => { show(el, false); const f = onClose; onClose = null; f && f(); }));
  root.appendChild(el);

  // 海域底图：一整份世界 96×96 格采样一次（循环的，画的时候平移）
  const N = 192, base = document.createElement('canvas'); base.width = base.height = N;
  {
    const g = base.getContext('2d'), img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - .5) * PERIOD, z = (.5 - j / N) * PERIOD, c = ZC[zoneOf(x, z)], o = (j * N + i) * 4;
      img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function draw(S, save) {
    const W = cv.clientWidth || 320, H = cv.clientHeight || 320, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hero = S.hero, cx = W / 2, cy = H / 2, k = Math.min(W, H) / PERIOD * 1.02;   // 一份世界铺满短边
    const sx = x => cx + wrapP(x - hero.x) * k, sy = z => cy - wrapP(z - hero.z) * k;   // 屏幕上方 = +z
    // 底色：底图按主角位置平移，四周再贴一份（循环）
    g.imageSmoothingEnabled = true;
    const tw = PERIOD * k, ox = cx - (wrapP(hero.x) + PERIOD / 2) * k, oy = cy - (PERIOD / 2 - wrapP(hero.z)) * k;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) g.drawImage(base, ox + a * tw, oy + b * tw, tw, tw);
    // 浪纹（一点质感）
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1;
    for (let y = 8; y < H; y += 14) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin((x + y) * .12) * 1.5); g.stroke(); }
    // 岛
    for (const is of islands) {
      const x = sx(is.x), y = sy(is.z), r = Math.max(3, is.r * k * (is.kind === 'spire' ? 1.4 : 1));
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x, y, r + 2.5, 0, 6.283); g.fill();
      g.fillStyle = is.kind === 'volcano' ? '#5a4a48' : is.kind === 'spire' ? '#9a948a' : '#6aa64e';
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      if (is.kind === 'volcano') { g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(x, y, Math.max(1.5, r * .3), 0, 6.283); g.fill(); }
      if (is.kind === 'green') { g.fillStyle = '#f0dca0'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.lineWidth = 1.5; g.strokeStyle = '#f0dca0'; g.stroke(); }
    }
    // 地标：发现过（哪条龙都算）写名字，没发现是「？」
    const found = id => !!(((save.fire || {}).landmarks || {})[id] || ((save.sea || {}).landmarks || {})[id] || (S.landmarks || {})[id]);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const L of LANDMARKS) {
      const x = sx(L.x), y = sy(L.z), f = found(L.id);
      g.fillStyle = f ? '#ffd24a' : 'rgba(255,255,255,.85)'; g.strokeStyle = '#2a1a14'; g.lineWidth = 2;
      star(g, x, y, f ? 7 : 6); g.fill(); g.stroke();
      if (!f) { g.fillStyle = '#2a1a14'; g.font = '800 9px sans-serif'; g.fillText('?', x, y + .5); }
      g.font = '800 11px "Source Han Sans SC", sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(20,14,10,.75)';
      const t = f ? L.zh : '？？？'; g.strokeText(t, x, y + 14); g.fillStyle = '#fff'; g.fillText(t, x, y + 14);
    }
    // 正在进行的猎场 / 领头
    const ring = (x, z, col, label) => {
      const X = sx(x), Y = sy(z); g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); g.arc(X, Y, 8, 0, 6.283); g.stroke();
      g.fillStyle = col; g.beginPath(); g.arc(X, Y, 3, 0, 6.283); g.fill();
      g.font = '800 10px "Source Han Sans SC", sans-serif'; g.lineWidth = 3; g.strokeStyle = 'rgba(20,14,10,.75)'; g.strokeText(label, X, Y - 15); g.fillStyle = '#fff'; g.fillText(label, X, Y - 15);
    };
    if (S.hunt) ring(S.hunt.x, S.hunt.z, '#ffd36a', S.hunt.kind === 'tide' ? '鱼潮' : '追猎');
    if (S.leader) ring(S.leader.x, S.leader.z, S.kind === 'sea' ? '#5ff4ff' : '#ff8a3a', '领头');
    // 主角：箭头
    g.save(); g.translate(cx, cy); g.rotate(hero.yaw);
    g.fillStyle = S.kind === 'sea' ? '#7ff0f0' : '#ff8a4a'; g.strokeStyle = '#2a1a14'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    here.textContent = `你在：${ZN[zoneOf(hero.x, hero.z)]}`;
  }
  function star(g, x, y, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, q = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    g.closePath();
  }
  return {
    el,
    show(S, save, close) { onClose = close || null; show(el, true); requestAnimationFrame(() => draw(S, save || {})); },
    hide() { show(el, false); },
  };
}
