// 一条轻量猎场提示；没有倒数警报，不占用操作按钮。
import { h } from './dom.js';
import { icon } from './icons.js';

export function createHuntHUD(parent) {
  const el = h('div', 'd-hunt', '<div class="d-hunt-row"><span class="d-hunt-icon"></span><b></b><span class="d-hunt-count"></span></div><span class="d-hunt-hint"></span><i class="d-hunt-progress"><u></u></i>');
  el.hidden = true; parent.appendChild(el);
  const title = el.querySelector('b'), symbol = el.querySelector('.d-hunt-icon'), count = el.querySelector('.d-hunt-count');
  const hint = el.querySelector('.d-hunt-hint'), fill = el.querySelector('u');
  let key = '', lastCount = '', progress = -1, tutorial = null;
  const actions = { cloud: '龙吼', tide: '漩涡' };
  return {
    el,
    update(S) {
      const h = S.hunt, root = parent.parentNode;
      tutorial ||= root.querySelector('.d-hint');
      const teaching = root.classList.contains('d-short') && tutorial && !tutorial.hidden && tutorial.classList.contains('d-hc');
      el.hidden = !h || teaching;
      if (!h || teaching) return;
      const sea = h.kind === 'tide', cue = h.phase === 'cue', finale = h.phase === 'finale';
      const skill = S.hero && S.hero.skill, ready = skill && skill.cd <= 0 && !(skill.t > 0);
      const action = ready ? actions[h.kind] : sea ? '冲刺' : '喷火';
      const waiting = !cue && !finale && !(S.creatures || []).some(c => c.huntId === h.id && !c.dying);
      const nextKey = `${h.kind}|${h.phase}|${action}|${waiting}`;
      if (nextKey !== key) {
        key = nextKey; el.classList.toggle('sea', sea); el.classList.toggle('cue', cue); el.classList.toggle('finale', finale);
        symbol.innerHTML = icon(sea ? 'fish' : 'bird');
        title.textContent = cue ? (sea ? '海面翻涌' : '云隙金光') : sea ? '浅海鱼潮' : '云海追猎';
        hint.textContent = cue ? '靠近看看' : waiting ? (sea ? '鱼群正在靠近' : '鸟群正在靠近') : finale ? `聚拢了 · ${action}` : sea ? '冲过鱼带' : '跟着鸟群';
      }
      const nextCount = cue ? '' : `×${h.caught || 0}`;
      if (nextCount !== lastCount) { lastCount = nextCount; count.textContent = nextCount; }
      const p = cue ? 0 : Math.round(Math.min(1, (h.elapsed || 0) / (h.duration || 26)) * 100);
      if (p !== progress) { progress = p; fill.style.transform = `scaleX(${p / 100})`; }
    },
  };
}