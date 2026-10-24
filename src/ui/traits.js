// 特性面板（暂停菜单「特性」）：这条龙的 3 个特性——学会的可以点「带上 / 取下」（最多带 2 个），没学会的写怎么得到。
import { h, button, blocker, show } from './dom.js';
import { icon } from './icons.js';
import { TRAITS, TRAIT_LIST, EQUIP_MAX } from '../sim/leaders.js';

const STAGE = ['幼龙', '少年龙', '成龙'];

export function createTraits(root, api) {
  const el = blocker(h('div', 'd-traits d-full d-dim'));
  el.hidden = true;
  el.innerHTML = `<div class="d-panel d-trbox"><div class="d-ribbon">${icon('star')}<span>特性</span></div><div class="d-trtip"></div><div class="d-trlist"></div><div class="d-trbot"></div></div>`;
  const list = el.querySelector('.d-trlist'), tip = el.querySelector('.d-trtip');
  let S = null, onClose = null;
  el.querySelector('.d-trbot').appendChild(button('back', '返回', 'd-btn', () => { show(el, false); const f = onClose; onClose = null; f && f(); }));
  root.appendChild(el);

  function fill() {
    const ids = TRAIT_LIST[S.kind] || [];
    tip.textContent = `最多同时带 ${EQUIP_MAX} 个 · 点一下带上 / 取下`;
    list.innerHTML = ids.map(id => {
      const T = TRAITS[id], got = !!S.traits[id], on = got && S.equip.includes(id);
      const how = got ? T.desc : `抓到金色领头「${T.leader}」学会${T.stage ? ` · ${STAGE[T.stage]}起出现` : ''}`;
      return `<div class="d-tr${got ? ' got' : ''}${on ? ' on' : ''}" data-id="${id}">
        <span class="d-tric">${icon(got ? T.icon : 'lock')}</span>
        <div class="d-trtx"><b>${got ? T.zh : '？？？'}</b><span>${how}</span></div>
        ${got ? `<i class="d-trsw">${on ? '带着' : '没带'}</i>` : ''}</div>`;
    }).join('');
    list.querySelectorAll('.d-tr.got').forEach(row => row.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const id = row.dataset.id, on = S.equip.includes(id);
      if (!on && S.equip.length >= EQUIP_MAX) { tip.textContent = `已经带了 ${EQUIP_MAX} 个，先取下一个`; if (tip.animate) tip.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 240 }); return; }
      if (api.onEquip) api.onEquip(id, !on);
      fill();
    }));
  }
  return {
    el,
    show(sim, close) { S = sim; onClose = close || null; fill(); show(el, true); },
    hide() { show(el, false); },
  };
}
