// 界面总入口（DOM）：createUI(root, api) → 各界面的开关 + 每帧 update。接口见 docs/ARCH.md「ui 接口」
// root = #ui（在 #wrap 里，和画布一样大）。样式在 ui/style.css（index.html 引入）
import { SPECIES } from '../config/species.js';
import { icon } from './icons.js';
import { h } from './dom.js';
import { createHUD } from './hud.js';
import { createTitle, createLoading } from './title.js';
import { createMenu } from './menu.js';
import { createCodex } from './codex.js';
import { createResult } from './result.js';

export function createUI(root, api = {}) {
  root.classList.add('dui');
  root.addEventListener('contextmenu', e => e.preventDefault());

  // 屏幕尺寸 + 安全区：只在尺寸变化时读一次布局（update 里不读）
  const G = { W: 360, H: 640, st: 0, sb: 0, sl: 0, sr: 0 };
  const probe = h('div', 'd-probe'); root.appendChild(probe);
  const measure = () => {
    G.W = root.clientWidth || G.W; G.H = root.clientHeight || G.H;
    const cs = getComputedStyle(probe);
    G.st = parseFloat(cs.paddingTop) || 0; G.sb = parseFloat(cs.paddingBottom) || 0;
    G.sl = parseFloat(cs.paddingLeft) || 0; G.sr = parseFloat(cs.paddingRight) || 0;
  };
  measure();
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(root); else addEventListener('resize', measure);

  // 生物小图：api.portrait(sp) → dataURL，缓存；还没好时用通用图标顶上（pic.miss = true，调用方过一会儿再试）
  const pcache = {};
  const pic = sp => {
    let u = pcache[sp];
    if (!u && api.portrait) { try { u = api.portrait(sp); } catch (e) { console.warn('portrait', sp, e); } if (u) pcache[sp] = u; }
    if (u) return `<img src="${u}" alt="" draggable="false">`;
    pic.miss = true;
    const hab = SPECIES[sp] && SPECIES[sp].hab;
    return icon(/jelly/.test(sp) ? 'jelly' : hab === 'air' ? 'bird' : 'fish', 'fb');
  };

  const hud = createHUD(root, api, G, pic);
  const hintEl = h('div', 'd-hint'); hintEl.hidden = true; root.appendChild(hintEl);
  const toastEl = h('div', 'd-toast'); root.appendChild(toastEl);
  const menu = createMenu(root, api);
  const title = createTitle(root, api);
  const codex = createCodex(root, api, pic);
  const result = createResult(root, api);
  const loading = createLoading(root);
  let kind = 'fire', mute = false, left = false;

  // 首次提示：小手 / 箭头 + 不超过 4 个字
  const HINTS = {
    drag: ['d-hc', 'point', '按住拖动'], plunge: ['d-hc', 'down', '扎水'], breach: ['d-hc', 'up', '跃出'],
    fire: ['d-ha', 'point', '按住喷火'], dash: ['d-ha', 'point', '点击冲刺'],
  };
  let hintName = null;
  const hint = name => {
    if (name === hintName) return; hintName = name;
    const d = name && HINTS[name];
    if (!d) { hintEl.hidden = true; hintEl.innerHTML = ''; return; }
    hintEl.className = `d-hint ${d[0]} h-${name}`;
    hintEl.innerHTML = `<div class="d-hic">${icon(d[1])}</div><div class="d-pill">${d[2]}</div>`;
    hintEl.hidden = false;
  };

  // 大字提示（阶段名）：放大淡入，停 1.2 秒，淡出。不闪
  const toast = text => {
    toastEl.textContent = text || '';
    toastEl.classList.toggle('sea', kind === 'sea');
    if (toastEl.animate) {
      toastEl.getAnimations && toastEl.getAnimations().forEach(a => a.cancel());
      toastEl.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.05)', offset: .14 }, { opacity: 1, transform: 'scale(1)', offset: .22 },
        { opacity: 1, transform: 'scale(1)', offset: .75 }, { opacity: 0, transform: 'scale(1)' }], { duration: 1600, easing: 'ease-out', fill: 'forwards' });
    }
  };

  return {
    showTitle(save) { save = save || (api.getSave && api.getSave()) || {}; if (save.mute != null) this.setMute(!!save.mute); if (save.left != null) this.setLeft(!!save.left); loading.set(1); title.show(save); },
    hideTitle() { title.hide(); },
    showHUD(k) { kind = k === 'sea' ? 'sea' : 'fire'; root.classList.toggle('d-sea', kind === 'sea'); hud.show(kind); },
    hideHUD() { hud.hide(); hint(null); },
    update(S, dt, events) { hud.update(S, dt, events); },
    showPause() { menu.show(kind); },
    hidePause() { menu.hide(); },
    showCodex(save) { codex.show(save); },
    hideCodex() { codex.hide(); },
    showResult(info, onContinue) { result.show(info, onContinue); },
    hideResult() { result.hide(); },
    toast,
    hint,
    setLoading(p, text) { loading.set(p, text); },
    setTemp(on) { hud.setTemp(!!on); },
    setMute(b) { mute = !!b; hud.setMute(mute); title.setMute(mute); menu.setMute(mute); },
    setLeft(b) { left = !!b; root.classList.toggle('d-left', left); menu.setLeft(left); },
    dragging(b) { root.classList.toggle('d-drag', !!b); },
    get mute() { return mute; }, get left() { return left; },
    _result: result,   // 测试页用（画分享卡）
  };
}
