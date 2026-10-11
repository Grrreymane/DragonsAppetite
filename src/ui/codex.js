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
    <div class="d-grid"></div><div class="d-cxbot"></div></div>`;
  const grid = el.querySelector('.d-grid'), num = el.querySelector('.d-cxn');
  el.querySelector('.d-cxbot').appendChild(button('back', '返回', 'd-btn', () => show(el, false)));
  root.appendChild(el);
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
    // 生物小图还没准备好（creatures 模块还没渲染）→ 1 秒后再试一次
    clearTimeout(retry); if (pic.miss) retry = setTimeout(() => { if (!el.hidden) fill(save); }, 1000);
  };
  return {
    el,
    show(save) { fill(save || (api.getSave && api.getSave())); show(el, true); },
    hide() { show(el, false); },
  };
}
