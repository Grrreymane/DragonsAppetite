// 界面小工具：建元素、按钮、按下处理
import { icon } from './icons.js';

export const h = (tag, cls = '', html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
};

// 按下就拦住（preventDefault + stopPropagation，主程序不会在按钮下面出摇杆）；
// 抬起时手指还在按钮上才算点一下。只拦自己按下的那根手指，别的手指（摇杆）的抬起照常往上传
export function tap(el, fn) {
  let id = null;
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  el.addEventListener('pointerdown', e => { stop(e); if (id !== null) return; id = e.pointerId; el.classList.add('down'); });
  el.addEventListener('pointerup', e => {
    if (e.pointerId !== id) return; stop(e); id = null; el.classList.remove('down');
    const r = el.getBoundingClientRect(), m = 12;
    if (e.clientX >= r.left - m && e.clientX <= r.right + m && e.clientY >= r.top - m && e.clientY <= r.bottom + m) fn(e);
  });
  const cancel = e => { if (e.pointerId === id) { id = null; el.classList.remove('down'); } };
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') cancel(e); });
  el.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  el.addEventListener('contextmenu', e => e.preventDefault());
  return el;
}

// 按钮：图标 + 两个字。cls 决定样式（d-sbtn 角落小按钮 / d-btn 面板按钮 / d-big 大按钮）
export function button(ic, label, cls, fn) {
  const b = h('button', cls, `${icon(ic)}<span>${label}</span>`);
  b.type = 'button';
  return tap(b, fn);
}
export const setIcon = (b, ic) => { const s = b.querySelector('svg'); if (s) s.outerHTML = icon(ic); };

// 整块遮罩（面板）：按下不往下传，免得主程序出摇杆
export function blocker(el) {
  const stop = e => e.stopPropagation();
  el.addEventListener('pointerdown', e => { e.preventDefault(); stop(e); });
  el.addEventListener('touchstart', stop, { passive: true });
  el.addEventListener('contextmenu', e => e.preventDefault());
  return el;
}

// 显示 / 隐藏（带淡入淡出，CSS 里 .d-show 控制）
export function show(el, on) {
  if (on) { el.hidden = false; requestAnimationFrame(() => el.classList.add('d-show')); }
  else {
    el.classList.remove('d-show');
    clearTimeout(el._hideT); el._hideT = setTimeout(() => { if (!el.classList.contains('d-show')) el.hidden = true; }, 260);
  }
}

// 小动画（Web Animations，不用强制重排）
export const pop = (el, s = 1.25, ms = 260) => el.animate && el.animate(
  [{ transform: `scale(${s})` }, { transform: 'scale(1)' }], { duration: ms, easing: 'cubic-bezier(.3,1.6,.5,1)' });
