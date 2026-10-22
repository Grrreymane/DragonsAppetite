// 猎场横幅：一眼看出「这里有什么好处」——
//   线索：每只 +1 · 满 N 只 +10；追猎：已抓 / 目标（满了打勾）；每抓一只在猎物位置飘「+1」；达成时横幅亮一下「达成 +10」
// 没有倒数警报，不占用操作按钮。
import { h } from './dom.js';
import { icon } from './icons.js';
import { TRAITS, LEADER_PTS } from '../sim/leaders.js';

export function createHuntHUD(parent) {
  const el = h('div', 'd-hunt', '<div class="d-hunt-row"><span class="d-hunt-icon"></span><b></b><span class="d-hunt-count"></span></div><span class="d-hunt-hint"></span><i class="d-hunt-progress"><u></u></i>');
  el.hidden = true; parent.appendChild(el);
  const title = el.querySelector('b'), symbol = el.querySelector('.d-hunt-icon'), count = el.querySelector('.d-hunt-count');
  const hint = el.querySelector('.d-hunt-hint'), fill = el.querySelector('u');
  // 飘字池（+1 / +10）
  const floats = Array.from({ length: 10 }, () => { const f = h('div', 'd-hfloat'); f.hidden = true; parent.appendChild(f); return f; });
  let fi = 0;
  const floatAt = (x, y, text, big, cls) => {
    const f = floats[fi++ % floats.length];
    f.textContent = text; f.className = 'd-hfloat' + (big ? ' big' : '') + (cls ? ' ' + cls : ''); f.hidden = false;
    f.style.left = x + 'px'; f.style.top = y + 'px';
    if (f.animate) f.animate([{ opacity: 0, transform: 'translate(-50%,-30%) scale(.7)' }, { opacity: 1, transform: 'translate(-50%,-80%) scale(1.1)', offset: .2 },
      { opacity: 1, transform: 'translate(-50%,-120%) scale(1)', offset: .7 }, { opacity: 0, transform: 'translate(-50%,-170%) scale(1)' }], { duration: big ? 1500 : 900, easing: 'ease-out' }).onfinish = () => { f.hidden = true; };
    else setTimeout(() => { f.hidden = true; }, 900);
  };
  let lastX2 = 0;
  let key = '', lastCount = '', progress = -1, tutorial = null, goalFlash = 0;
  const actions = { cloud: '龙吼', tide: '漩涡' };
  return {
    el,
    update(S, events, project) {
      const hu = S.hunt, root = parent.parentNode;
      // 事件：每抓一只飘「+1」，达成时飘大字「+10」
      if (events && project) for (const e of events) {
        if (e.type === 'huntCatch') { const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y, `+${e.bonus}`); }
        else if (e.type === 'archPass') { const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y, `穿过拱门 +${e.pts}`, true); }
        else if (e.type === 'rivalEat') { const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y, '被抢！', false, 'bad'); }   // 天敌抢走一只
        else if (e.type === 'huntRivalEaten') { const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y, `吃掉${e.sp === 'roc' ? '大鹏' : '鲨鱼'} +${e.pts}`, true); }
        else if (e.type === 'eat' && e.cooked && performance.now() - lastX2 > 350) { lastX2 = performance.now(); const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y - 18, '×2', false, 'x2'); }   // 烤熟 / 撞晕的分数翻倍：吃到时飘一下
        else if (e.type === 'star') { const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y, `+${e.pts}`); }   // 流星雨的星星
        else if (e.type === 'zap' && e.n > 0) { const p = project(e.x, e.y, e.z); if (p && p.visible) floatAt(p.x, p.y, S.kind === 'sea' ? `电晕 ${e.n} 只` : `烤熟 ${e.n} 只`, true); }   // 雷劈
        else if (e.type === 'huntGoal') {
          goalFlash = performance.now() + 2200; key = '';
          const r = el.getBoundingClientRect(), pr = parent.getBoundingClientRect();
          floatAt(r.left - pr.left + r.width / 2, r.bottom - pr.top + 26, `达成 · 成长 +${e.bonus}`, true);
          if (el.animate) el.animate([{ transform: 'translateX(-50%) scale(1)' }, { transform: 'translateX(-50%) scale(1.12)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 420, easing: 'ease-out' });
        }
      }
      tutorial ||= root.querySelector('.d-hint');
      // 金色领头（没有猎场时才有）：同一个横幅，写清楚抓到它有什么
      if (!S.hunt && S.leader) {
        const L = S.leader, T = TRAITS[L.trait], cue = L.phase === 'cue';
        el.hidden = false;
        const nextKey = `lead|${L.trait}|${L.phase}|${L.tired}|${L.first}`;
        if (nextKey !== key) {
          key = nextKey; lastCount = ''; count.textContent = '';
          el.classList.toggle('sea', S.kind === 'sea'); el.classList.add('lead'); el.classList.toggle('cue', cue); el.classList.remove('finale', 'won');
          symbol.innerHTML = icon(T.icon); title.textContent = T.leader;
          const prize = L.first ? `学会「${T.zh}」` : `成长 +${LEADER_PTS}`;
          hint.textContent = cue ? `抓到它 · ${prize}` : L.tired ? '它累了 · 快追！' : `追上它 · ${prize}`;
        }
        const p = cue ? 0 : Math.round(Math.min(1, L.t / 45) * 100);
        if (p !== progress) { progress = p; fill.style.transform = `scaleX(${p / 100})`; }
        return;
      }
      el.classList.remove('lead');
      const teaching = root.classList.contains('d-short') && tutorial && !tutorial.hidden && tutorial.classList.contains('d-hc');
      el.hidden = !hu || teaching;
      if (!hu || teaching) return;
      const sea = hu.kind === 'tide', cue = hu.phase === 'cue', finale = hu.phase === 'finale';
      const skill = S.hero && S.hero.skill, ready = skill && skill.cd <= 0 && !(skill.t > 0);
      const action = ready ? actions[hu.kind] : sea ? '冲刺' : '喷火';
      const waiting = !cue && !finale && !(S.creatures || []).some(c => c.huntId === hu.id && !c.dying);
      const flashing = goalFlash > performance.now();
      // 天敌抢食：天敌在场时提示换成「怎么对付它」（幼：抢着吃、小心被咬；少：先撞晕 / 烤熟；成：直接吃掉 +10）
      const rv = hu.rival && hu.rival.id > 0 ? (S.creatures || []).find(c => c.id === hu.rival.id && !c.dying) : null, rvName = sea ? '鲨鱼' : '大鹏';
      const rvHint = rv ? (S.stage === 0 ? `${rvName}来抢食 · 快吃，别被咬` : S.stage === 1 ? `${rvName}来抢食 · ${sea ? '撞晕' : '烤熟'}它再吃 +10` : `${rvName}来抢食 · 吃掉它 +10`) : '';
      const nextKey = `${hu.kind}|${hu.phase}|${action}|${waiting}|${flashing}|${hu.goalHit}|${rvHint}`;
      if (nextKey !== key) {
        key = nextKey; el.classList.toggle('sea', sea); el.classList.toggle('cue', cue); el.classList.toggle('finale', finale); el.classList.toggle('won', !!hu.goalHit);
        symbol.innerHTML = icon(sea ? 'fish' : 'bird');
        title.textContent = cue ? (sea ? '海面翻涌' : '云隙金光') : sea ? '浅海鱼潮' : '云海追猎';
        const goal = hu.goal || 5;
        el.classList.toggle('rival', !!rv);
        hint.textContent = rvHint && !cue && !flashing ? rvHint : cue ? `每只 +1 · 吃满 ${goal} 只再 +10`
          : flashing ? `达成！成长 +10`
          : waiting ? (sea ? '鱼群正在靠近' : '鸟群正在靠近')
          : finale ? `金色猎物出现 · ${action}`
          : hu.goalHit ? `已达成 · 继续吃，每只 +1` : `吃满 ${goal} 只再 +10`;
      }
      const nextCount = cue ? '' : hu.goalHit ? `★${hu.caught || 0}` : `${hu.caught || 0}/${hu.goal || 5}`;
      if (nextCount !== lastCount) { lastCount = nextCount; count.textContent = nextCount; }
      const p = cue ? 0 : Math.round(Math.min(1, (hu.elapsed || 0) / (hu.duration || 26)) * 100);
      if (p !== progress) { progress = p; fill.style.transform = `scaleX(${p / 100})`; }
    },
  };
}
