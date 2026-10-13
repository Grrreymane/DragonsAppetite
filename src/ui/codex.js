// 图鉴：12 格。吃过 = 彩色 + 次数（吃到过金色个体加金星）；没吃过 = 剪影 + 需要的阶段 + 哪条龙能吃
import { SPECIES, SPECIES_IDS } from '../config/species.js';
import { icon } from './icons.js';
import { h, button, blocker, show } from './dom.js';
import { STAGE_CH } from './hud.js';

export function createCodex(root, api, pic) {
  const el = blocker(h('div', 'd-codex d-full d-dim'));
  el.hidden = true;
  el.innerHTML = `<div class="d-panel d-cxin">
    <div class="d-ribbon">${icon('book')}<span>图鉴</span><b class="d-cxn">0/12</b></div>
    <div class="d-cxscroll"><div class="d-grid"></div><div class="d-explore-title">发现的猎场</div><div class="d-explore"></div></div><div class="d-cxbot"></div></div>`;
  const grid = el.querySelector('.d-grid'), num = el.querySelector('.d-cxn'), explore = el.querySelector('.d-explore');
  el.querySelector('.d-cxbot').appendChild(button('back', '返回', 'd-btn', () => show(el, false)));
  root.appendChild(el);
  // 游戏根节点禁用了原生触摸滚动；图鉴内容用自己的拖动，不触发背后的摇杆。
  const scroll = el.querySelector('.d-cxscroll');
  let drag = null;
  scroll.addEventListener('pointerdown', e => {
    if (drag || e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    drag = { id: e.pointerId, y: e.clientY, top: scroll.scrollTop };
    try { scroll.setPointerCapture(e.pointerId); } catch (_) { }
  });
  scroll.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    e.preventDefault(); e.stopPropagation(); scroll.scrollTop = drag.top + drag.y - e.clientY;
  });
  const endDrag = e => { if (drag && drag.id === e.pointerId) { e.stopPropagation(); drag = null; } };
  scroll.addEventListener('pointerup', endDrag); scroll.addEventListener('pointercancel', endDrag); scroll.addEventListener('lostpointercapture', endDrag);
  let retry = 0;
  const fill = save => {
    const cx = (save && save.codex) || {}; let n = 0; pic.miss = false;
    grid.innerHTML = SPECIES_IDS.map(id => {
      const d = SPECIES[id], e = cx[id] || {}, got = (e.n | 0) > 0; if (got) n++;
      const who = d.who.map(k => icon(k === 'fire' ? 'head_fire0' : 'head_sea0', 'w-' + k)).join('');   // 哪条龙能吃：画的幼龙头像
      return got
        ? `<div class="d-cell got"><div class="d-cpic">${pic(id)}</div><div class="d-cnm">${d.zh}</div><b class="d-ccnt">×${e.n}</b>${e.gold ? icon('star', 'gold') : ''}</div>`
        : `<div class="d-cell"><div class="d-cpic sil">${pic(id)}</div><div class="d-cneed"><i class="d-chip">${STAGE_CH[d.tier - 1]}</i>${who}</div></div>`;
    }).join('');
    num.textContent = n + '/' + SPECIES_IDS.length;
    const discoveries = (save && save.discoveries) || {};
    explore.innerHTML = [['cloud', '云海追猎', 'bird'], ['tide', '浅海鱼潮', 'fish']].map(([id, name, ic]) => {
      const entry = discoveries[id] || {}, found = !!entry.found;
      const best = Math.min(1000000, Math.max(0, Math.floor(Number(entry.best) || 0)));
      return `<div class="d-explore-entry ${id}${found ? ' found' : ''}"><span class="d-explore-stamp">${icon(found ? ic : 'lock')}</span><div><b>${name}</b><span>${found ? '最好 ×' + best : '尚未发现'}</span></div>${found ? icon('check', 'd-explore-check') : ''}</div>`;
    }).join('');
    // 生物小图还没准备好（creatures 模块还没渲染）→ 1 秒后再试一次
    clearTimeout(retry); if (pic.miss) retry = setTimeout(() => { if (!el.hidden) fill(save); }, 1000);
  };
  return {
    el,
    show(save) { drag = null; fill(save || (api.getSave && api.getSave())); show(el, true); },
    hide() { drag = null; show(el, false); },
  };
}
