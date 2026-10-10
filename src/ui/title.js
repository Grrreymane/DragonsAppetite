// 加载页 + 标题页
import { SPECIES_IDS } from '../config/species.js';
import { icon, DRAGON_ART } from './icons.js';
import { h, button, setIcon, blocker, show } from './dom.js';

// 卡通背景：天、太阳、云、岛、海（加载页和标题页共用）
export const BACKDROP = `<svg class="d-bg" viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
<defs>
  <linearGradient id="dgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f9fd8"/><stop offset=".55" stop-color="#a9d3ef"/><stop offset="1" stop-color="#e4f2f6"/></linearGradient>
  <linearGradient id="dgSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fb0c0"/><stop offset=".4" stop-color="#22809e"/><stop offset="1" stop-color="#123f66"/></linearGradient>
  <radialGradient id="dgSun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff6d8"/><stop offset=".35" stop-color="#fff0c0" stop-opacity=".8"/><stop offset="1" stop-color="#fff0c0" stop-opacity="0"/></radialGradient>
</defs>
<rect width="360" height="640" fill="url(#dgSky)"/>
<circle cx="268" cy="150" r="90" fill="url(#dgSun)"/>
<g fill="#fff" stroke="#3a5f8c" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke">
  <path d="M20 250c-14 0-20-16-6-22 0-16 22-22 32-10 8-10 30-6 30 10 14 2 14 22-2 22z"/>
  <path d="M250 300c-12 0-16-14-4-18 2-14 20-18 28-8 8-8 26-4 26 8 12 2 12 18-2 18z"/>
  <path d="M120 120c-10 0-14-12-4-15 1-12 17-15 24-7 7-7 22-3 22 7 10 2 10 15-2 15z" opacity=".85"/>
</g>
<g stroke="#24425e" stroke-width="2.5" stroke-linejoin="round" paint-order="stroke">
  <path d="M232 396 L262 330 L274 326 L304 396z" fill="#7a5a52"/>
  <path d="M262 330 L274 326 L280 340 L266 344z" fill="#ff8a3a"/>
  <path d="M30 398 C44 368 70 360 92 372 C108 362 128 374 136 398z" fill="#5fae6a"/>
  <path d="M150 398 L156 352 L170 350 L174 398z" fill="#8a8f9e"/>
</g>
<path d="M266 322c-6-14 8-22 4-36 10 8 14 22 6 36z" fill="#d9dde6" opacity=".7"/>
<rect y="396" width="360" height="244" fill="url(#dgSea)"/>
<g fill="none" stroke="#bff1f0" stroke-width="2.5" stroke-linecap="round" opacity=".55">
  <path d="M30 430q10-6 20 0t20 0"/><path d="M220 450q10-6 20 0t20 0"/><path d="M120 500q12-7 24 0t24 0"/><path d="M270 540q12-7 24 0t24 0"/><path d="M40 580q12-7 24 0t24 0"/>
</g>
<rect y="394" width="360" height="4" fill="#e8fbff" opacity=".7"/>
</svg>`;

const IMG = { fire: new URL('../../img/card_fire.webp', import.meta.url).href, sea: new URL('../../img/card_sea.webp', import.meta.url).href };

export function createTitle(root, api) {
  const el = blocker(h('div', 'd-title d-full'));
  el.hidden = true;
  el.innerHTML = `${BACKDROP}<div class="d-tin">
    <h1 class="d-logo"><span>龙游</span><span>天海</span></h1>
    <div class="d-cards"></div>
    <div class="d-tbot"></div>
  </div>`;
  const cards = el.querySelector('.d-cards'), bot = el.querySelector('.d-tbot');
  const mk = (kind, name, ic) => {
    const c = h('div', 'd-card ' + kind, `<div class="d-cart">${DRAGON_ART[kind]}</div><div class="d-cname">${icon(ic)}<span>${name}</span></div>`);
    const art = c.firstChild, img = new Image();
    img.className = 'd-cimg'; img.alt = ''; img.draggable = false;
    img.onload = () => { art.appendChild(img); c.classList.add('img'); };
    img.src = IMG[kind];   // 没有图（404）就保留剪影
    const w = h('div', 'd-cwrap'); w.append(c, h('div', 'd-dots', '<i></i><i></i><i></i>'));
    tapCard(c, () => api.onPick && api.onPick(kind));
    cards.appendChild(w); return w;
  };
  const wf = mk('fire', '火龙', 'fire'), ws = mk('sea', '海龙', 'wave');
  let pick = 'fire';
  const bStart = button('play', '开始', 'd-big', () => api.onPick && api.onPick(pick));
  const bCodex = button('book', '图鉴', 'd-btn d-tcodex', () => api.onCodex && api.onCodex());
  bCodex.insertAdjacentHTML('beforeend', '<b class="d-cnt">0/12</b>');
  const bSound = button('sound', '声音', 'd-sbtn d-sound', () => api.onToggleMute && api.onToggleMute());
  bot.append(bStart, bCodex);
  el.appendChild(bSound);
  root.appendChild(el);

  return {
    el,
    show(save) {
      save = save || {};
      pick = save.pick === 'sea' ? 'sea' : 'fire';
      for (const [w, k] of [[wf, 'fire'], [ws, 'sea']]) {
        const d = save[k] || {}, st = Math.max(0, Math.min(2, d.stage | 0)), played = (d.pts | 0) > 0 || (d.eaten | 0) > 0 || st > 0;
        w.querySelectorAll('.d-dots i').forEach((dot, i) => dot.classList.toggle('on', played && i <= st));
        w.classList.toggle('pick', k === pick);
      }
      bStart.classList.toggle('sea', pick === 'sea');
      const cx = save.codex || {}; let n = 0; for (const id of SPECIES_IDS) if (cx[id] && cx[id].n > 0) n++;
      bCodex.querySelector('.d-cnt').textContent = n + '/' + SPECIES_IDS.length;
      if (save.mute != null) this.setMute(save.mute);
      show(el, true);
    },
    hide() { show(el, false); },
    setMute(b) { setIcon(bSound, b ? 'mute' : 'sound'); bSound.classList.toggle('off', !!b); },
  };
}

// 卡片：按下缩一下，抬起时还在卡上就开局
function tapCard(c, fn) {
  let id = null;
  c.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); id = e.pointerId; c.classList.add('down'); });
  c.addEventListener('pointerup', e => {
    if (e.pointerId !== id) return; e.stopPropagation(); id = null; c.classList.remove('down');
    const r = c.getBoundingClientRect(); if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) fn();
  });
  c.addEventListener('pointercancel', () => { id = null; c.classList.remove('down'); });
  c.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { id = null; c.classList.remove('down'); } });
}

// 加载页：进度条；8 秒还没好 → 「网络慢」+ 重试
export function createLoading(root) {
  const el = blocker(h('div', 'd-load d-full'));
  el.hidden = true;
  el.innerHTML = `${BACKDROP}<div class="d-lin"><h1 class="d-logo sm"><span>龙游</span><span>天海</span></h1>
    <div class="d-lbar"><u></u></div><div class="d-ltxt">加载中</div><div class="d-lslow" hidden><span>网络慢</span></div></div>`;
  const bar = el.querySelector('.d-lbar u'), txt = el.querySelector('.d-ltxt'), slow = el.querySelector('.d-lslow');
  slow.appendChild(button('retry', '重试', 'd-btn', () => location.reload()));
  root.appendChild(el);
  let timer = 0, done = false, started = false;
  return {
    el,
    set(p, text) {
      p = Math.max(0, Math.min(1, +p || 0));
      if (p >= 1) { done = true; clearTimeout(timer); show(el, false); return; }
      done = false;
      if (!started) { started = true; timer = setTimeout(() => { if (!done) slow.hidden = false; }, 8000); }
      if (el.hidden) show(el, true);
      bar.style.transform = `scaleX(${p.toFixed(3)})`;
      if (text) txt.textContent = text;
    },
  };
}
