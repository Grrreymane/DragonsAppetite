// 暂停菜单：继续 / 换龙 / 图鉴 / 声音 / 左手
import { h, button, setIcon, blocker, show } from './dom.js';

export function createMenu(root, api) {
  const el = blocker(h('div', 'd-pause d-full d-dim'));
  el.hidden = true;
  const panel = h('div', 'd-panel d-plist');
  const call = k => () => api[k] && api[k]();
  const bGo = button('play', '继续', 'd-btn d-main', () => { show(el, false); api.onResume && api.onResume(); });
  const bSw = button('dragon', '换龙', 'd-btn', call('onSwitch'));
  const bCx = button('book', '图鉴', 'd-btn', call('onCodex'));
  const bSnd = button('sound', '声音', 'd-btn d-tog', call('onToggleMute'));
  const bLeft = button('hand', '左手', 'd-btn d-tog', call('onToggleLeft'));
  bSnd.insertAdjacentHTML('beforeend', `<i class="d-sw"></i>`);
  bLeft.insertAdjacentHTML('beforeend', `<i class="d-sw"></i>`);
  panel.append(bGo, bSw, bCx, bSnd, bLeft);
  el.appendChild(panel); root.appendChild(el);
  return {
    el,
    show(kind) { bGo.classList.toggle('sea', kind === 'sea'); show(el, true); },
    hide() { show(el, false); },
    setMute(b) { setIcon(bSnd, b ? 'mute' : 'sound'); bSnd.classList.toggle('on', !b); },
    setLeft(b) { bLeft.classList.toggle('on', !!b); },
  };
}
