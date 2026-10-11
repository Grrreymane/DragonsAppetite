// 游戏中的 HUD：成长条（阶段头像）、下一阶段能力 + 能吃什么、连吃、小目标卡、边缘箭头、天敌「!」、锁定圈、跨界计时圈、
// 动作键、成龙的第二技能键（龙吼 / 漩涡）、菜单 / 声音
// update 每帧调用：只在数值变了时写 DOM；箭头 / 标记只改 transform 和 opacity；不读布局（屏幕尺寸由 ui.js 缓存在 G 里）
import { SPECIES, SPECIES_IDS } from '../config/species.js';
import { STAGE_PTS, DRAGONS, ABILITIES } from '../config/dragons.js';
import { icon, painted } from './icons.js';
import { h, button, setIcon, pop } from './dom.js';

export const STAGE_CH = ['幼', '少', '成'];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
// 锁定圈：半径 36 的四段弧（每段 62°），弧之间的缺口里四个朝里的小三角
const ARC = 'M-18.5-30.9A36 36 0 0 1 18.5-30.9';
const ARCS = `<g class="arcs">${[0, 90, 180, 270].map(a => `<path d="${ARC}" transform="rotate(${a})"/>`).join('')}</g>`;
const TIPS = `<g class="tips">${[45, 135, 225, 315].map(a => `<path d="M0-26l-4.5-8.5h9z" transform="rotate(${a})"/>`).join('')}</g>`;
const RING_C = 2 * Math.PI * 36, ACT_C = 2 * Math.PI * 48, SK_C = 2 * Math.PI * 38;

// p = api.project 的结果，是否在屏幕里
const onScreen = (p, G) => p && p.visible !== false && p.x >= 0 && p.x <= G.W && p.y >= 0 && p.y <= G.H;
// 能力 id → 图标名 / 名字
export const abIcon = (id, kind) => {
  const ic = (ABILITIES[id] && ABILITIES[id].icon) || id;
  return kind === 'sea' && painted(ic + '_sea') ? ic + '_sea' : ic;   // 海龙用海龙版的「咬 / 大口吞」
};
export const abName = id => (ABILITIES[id] && ABILITIES[id].zh) || '';
// 下一阶段会学会的能力：sim 给了 S.nextAbilities 就用；没给就按配置推
const nextAbs = S => S.nextAbilities || (S.stage < 2 ? (DRAGONS[S.kind].stages[S.stage + 1].unlock || []) : []);

export function createHUD(root, api, G, pic) {
  const el = h('div', 'd-hud'); el.hidden = true; root.appendChild(el);

  // ---------- 顶部：菜单 / 声音 ----------
  const bMenu = button('menu', '菜单', 'd-sbtn d-menu', () => api.onPause && api.onPause());
  const bSound = button('sound', '声音', 'd-sbtn d-sound', () => api.onToggleMute && api.onToggleMute());

  // ---------- 成长条（三个阶段头像 + 两段进度）；成龙以后换成图鉴进度条 ----------
  const node = i => `<i class="d-node" data-i="${i}"><span class="d-nh"></span><em>${STAGE_CH[i]}</em></i>`;
  const grow = h('div', 'd-grow', `
    <div class="d-gbar">${node(0)}<b class="d-seg"><u></u></b>${node(1)}<b class="d-seg"><u></u></b>${node(2)}<em class="d-hurt"></em></div>
    <div class="d-cbar"><span class="d-cbic">${icon('book')}</span><b class="d-seg"><u></u></b><span class="d-ctxt">0/12</span><em class="d-hurt"></em></div>
    <div class="d-next"><span class="d-nab"></span><span class="d-nsp"></span></div>`);
  const gbar = grow.querySelector('.d-gbar'), cbar = grow.querySelector('.d-cbar');
  const nodes = [...grow.querySelectorAll('.d-gbar .d-node')], heads = nodes.map(n => n.querySelector('.d-nh'));
  const fills = [...grow.querySelectorAll('.d-gbar u')];
  const cFill = grow.querySelector('.d-cbar u'), cTxt = grow.querySelector('.d-ctxt');
  const next = grow.querySelector('.d-next'), nAb = grow.querySelector('.d-nab'), nSp = grow.querySelector('.d-nsp');
  const hurts = [...grow.querySelectorAll('.d-hurt')];

  // ---------- 连吃 ×N ----------
  const combo = h('div', 'd-combo', '<i>×</i><b>2</b>'); const comboN = combo.querySelector('b');

  // ---------- 小目标卡 ----------
  const goal = h('div', 'd-goal', `<div class="d-gpic"></div><div class="d-gnum"><b>0</b><i>/0</i></div><div class="d-gchk">${icon('check')}</div>`);
  const gPic = goal.querySelector('.d-gpic'), gHave = goal.querySelector('.d-gnum b'), gN = goal.querySelector('.d-gnum i'), gChk = goal.querySelector('.d-gchk');
  // 小目标卡的宽度（屏幕边上的箭头 / 「!」要躲开它）：ResizeObserver 在排版之后给，update 里不用读布局
  let goalW = 0;
  if (typeof ResizeObserver === 'function') new ResizeObserver(es => { const e = es[es.length - 1]; goalW = e.borderBoxSize && e.borderBoxSize[0] ? e.borderBoxSize[0].inlineSize : e.contentRect.width + 22; }).observe(goal);
  const goalWidth = () => goalW || (G.s || 1) * 60 + 70;   // 没有 ResizeObserver：图片框 + 「0/3」大约这么宽

  // ---------- 屏幕上的标记：锁定圈、箭头 ×2、天敌「!」×3、提示牌 ×3、跨界圈 ----------
  const marks = h('div', 'd-marks');
  const mk = (cls, html) => { const m = h('div', cls, html); m.style.opacity = 0; marks.appendChild(m); return m; };
  // 锁定圈：四段圆弧 + 底下一圈淡色，慢慢转、轻轻呼吸（不闪）。转的是外面一层 div（合成层上转，不重画 SVG）
  const lockEl = mk('d-lock', `<div class="d-lkin"><div class="d-lksp"><svg viewBox="-50 -50 100 100">
    <circle class="bg" r="36"/>
    ${ARCS.replace('arcs', 'arcs ol')}${ARCS}${TIPS}</svg></div></div>`);
  const LK = { id: 0, a: 0, s: 1, k: 0 };
  const arrows = [mk('d-arw gold', `<div>${icon('arrow')}</div>`), mk('d-arw', `<div>${icon('arrow')}</div>`)]
    .map(e => ({ e, id: null, onT: 0, offT: 0, a: 0, x: -1, y: -1, r: 0 }));
  const bangs = [0, 1, 2].map(() => ({ e: mk('d-bang', `<div>${icon('bang')}</div>`), a: 0, chase: false, k: '' }));
  const tags = [0, 1, 2].map(() => ({ e: mk('d-tag', ''), a: 0, k: '' }));
  const ring = mk('d-ring', `<svg viewBox="0 0 84 84"><circle class="tr" cx="42" cy="42" r="36"/><circle class="pr" cx="42" cy="42" r="36" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg><div class="d-rbang">${icon('bang')}</div>`);
  const ringPr = ring.querySelector('.pr');

  // ---------- 动作键（右下 88px；外圈 = 冷却） ----------
  const act = h('div', 'd-act', `<svg class="d-acr" viewBox="0 0 104 104"><circle class="tr" cx="52" cy="52" r="48"/><circle class="pr" cx="52" cy="52" r="48" stroke-dasharray="${ACT_C}" stroke-dashoffset="0"/></svg><div class="d-actin"></div><i class="d-wipe"></i>`);
  const actIn = act.querySelector('.d-actin'), actPr = act.querySelector('.d-acr .pr'), actWipe = act.querySelector('.d-wipe');
  let actId = null, actOn = false;
  const setAct = on => { if (on === actOn) return; actOn = on; act.classList.toggle('on', on); api.onAction && api.onAction(on); };
  act.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); if (actId !== null) return;
    actId = e.pointerId; try { act.setPointerCapture(e.pointerId); } catch (_) { /* 没有就算了 */ }
    setAct(true);
  });
  const actEnd = e => { if (e.pointerId !== actId) return; e.stopPropagation(); actId = null; setAct(false); };
  act.addEventListener('pointerup', actEnd); act.addEventListener('pointercancel', actEnd); act.addEventListener('lostpointercapture', actEnd);
  noJoy(act);

  // ---------- 第二技能键（成龙：火龙「龙吼」/ 海龙「漩涡」）：动作键上方，外圈 = 冷却 ----------
  const skill = h('div', 'd-skill', `<svg class="d-skr" viewBox="0 0 84 84"><circle class="tr" cx="42" cy="42" r="38"/><circle class="pr" cx="42" cy="42" r="38" stroke-dasharray="${SK_C}" stroke-dashoffset="0"/></svg><div class="d-skin"></div><i class="d-wipe"></i>`);
  skill.hidden = true;
  const skIn = skill.querySelector('.d-skin'), skPr = skill.querySelector('.d-skr .pr'), skWipe = skill.querySelector('.d-wipe');
  // 冷却：按钮上盖一块顺时针退去的暗色扇形（--cd = 还剩几成，0 = 好了）。只在变了 1% 以上时写
  const setWipe = (w, f) => { f = Math.round(f * 100) / 100; if (w._f === f) return; w._f = f; w.style.setProperty('--cd', f); };
  skill.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    skill.classList.add('down'); api.onSkill && api.onSkill();
    if (C.skCool) pop(skill, .9, 220);   // 还在冷却：轻轻缩一下表示「还不行」
  });
  const skUp = e => { e.stopPropagation(); skill.classList.remove('down'); };
  skill.addEventListener('pointerup', skUp); skill.addEventListener('pointercancel', skUp); skill.addEventListener('pointerleave', skUp);
  noJoy(skill);

  // ---------- 第一次吃到的新物种：角落小卡（剪影填上颜色，1.2 秒，不写字） ----------
  const newsp = h('div', 'd-newsp', '<div class="d-gpic"></div>'); const newPic = newsp.firstChild;
  const newQ = []; let newBusy = false;
  const showNew = () => {
    if (newBusy || !newQ.length || !newsp.animate) return;
    newBusy = true; newPic.innerHTML = pic(newQ.shift());
    const img = newPic.firstChild;
    newsp.animate([{ opacity: 0, transform: 'translateY(16px) scale(.8)' }, { opacity: 1, transform: 'none', offset: .15 }, { opacity: 1, transform: 'none', offset: .8 }, { opacity: 0, transform: 'translateY(-8px)' }],
      { duration: 1500, easing: 'ease-out' }).onfinish = () => { newBusy = false; showNew(); };
    img && img.animate && img.animate([{ filter: 'brightness(0)' }, { filter: 'brightness(0)', offset: .25 }, { filter: 'none', offset: .55 }, { filter: 'none' }], { duration: 1500 });
  };

  const temp = h('div', 'd-temp', '临时'); temp.hidden = true;

  el.append(marks, grow, combo, goal, newsp, temp, skill, act, bMenu, bSound);

  // ---------- 缓存（只写变了的值） ----------
  let C = {};
  const reset = () => { C = { op: {} }; arrows.forEach(a => { a.id = null; a.onT = 0; a.a = -1; }); LK.id = 0; LK.a = 0; LK.e = null; };
  reset();
  // 透明度：看不见（0）时顺便把里面一直在转 / 跳的 CSS 动画停掉（.d-off），省得每帧白算
  const setOp = (m, a) => {
    a = Math.round(a * 20) / 20; if (m._a === a) return;
    const was = m._a > 0; m._a = a; m.style.opacity = a; m.style.visibility = a > 0 ? 'visible' : 'hidden';
    if (was !== a > 0) m.classList.toggle('d-off', !(a > 0));
  };
  const setTf = (m, x, y, rot = 0, sc = 1) => {
    x = Math.round(x); y = Math.round(y); rot = Math.round(rot); sc = Math.round(sc * 50) / 50;
    if (m._x !== x || m._y !== y || m._r !== rot || m._s !== sc) { m._x = x; m._y = y; m._r = rot; m._s = sc; m.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)` + (sc !== 1 ? ` scale(${sc})` : ''); }
  };

  // 画面外的点：沿「屏幕中心 → 投影点」方向贴到边框上（背后的点方向反过来）。
  // 动作键 / 技能键那一列（右下；左手模式在左下）不放：落在那一块里就沿边挪出去（竖边往上挪，底边往里挪）
  function pin(p, behind, inset) {
    const cx = G.W / 2, cy = G.H / 2;
    let dx = p.x - cx, dy = p.y - cy;
    if (behind) { dx = -dx; dy = -dy; }
    if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1;
    const L = G.sl + inset, R = G.W - G.sr - inset, T = Math.max(G.st + 150, topZ() + 16), B = G.H - G.sb - inset;
    const sx = dx > 0 ? (R - cx) / dx : dx < 0 ? (L - cx) / dx : 1e9, sy = dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : 1e9;
    const s = Math.min(sx, sy);
    let x = cx + dx * s, y = cy + dy * s;
    const s1 = G.s || 1, colW = 18 + 90 * s1 + 20 + inset * .5, colH = 26 + (C.skId ? 196 : 116) * s1 + inset * .5;
    const top = G.H - G.sb - colH;
    if (y > top) {
      if (!G.left && x > G.W - G.sr - colW) { if (sx <= sy) y = top; else x = G.W - G.sr - colW; }
      else if (G.left && x < G.sl + colW) { if (sx <= sy) y = top; else x = G.sl + colW; }
    }
    y = belowCards(x, y, inset);
    return { x, y, deg: Math.atan2(dy, dx) * 57.2958 + 90 };
  }
  // 顶栏两边伸下来的两块：小目标卡（右上；左手模式在左上）和连吃 ×N（另一边）。标记落在它们上面就挪到它们下沿以下
  function belowCards(x, y, pad) {
    const s1 = G.s || 1, st = Math.max(6, G.st);                       // CSS 的 --st 至少 6px
    if (!goal.hidden && !root.classList.contains('d-abon')) {   // 新能力卡在的时候小目标卡滑走了
      const w = goalWidth() + pad, bot = st + 172 * s1 + 4 + pad;        // 卡的下沿 + 3px 厚度
      if (y < bot && (G.left ? x < G.sl + 8 + w : x > G.W - G.sr - 8 - w)) y = bot;
    }
    if (combo._a > 0) {                                                // 连吃「×12」约 62×46px + 描边阴影
      const w = 70 + pad, bot = st + 116 * s1 + 52 + pad;
      if (y < bot && (G.left ? x > G.W - G.sr - 14 - w : x < G.sl + 14 + w)) y = bot;
    }
    return y;
  }
  // 屏幕里的点（头顶箭头、大家伙的小牌）会不会压在顶栏 / 小目标卡 / 连吃上
  const underTop = (x, y, pad) => y < topZ() || belowCards(x, y, pad) !== y;
  // 顶栏（菜单 / 成长条 / 下一阶段 / 小目标卡）的下沿：屏幕上的小标记别画到它后面去
  const topZ = () => G.st + 6 + 128 * (G.s || 1);
  // 背后判定：project 给了 behind 就用；没给就按龙的朝向估（追尾镜头，在龙后方十几米以外的算背后）
  const isBehind = (p, c, H0) => {
    if (p.behind != null) return !!p.behind;
    if (p.visible === false && p.x >= 0 && p.x <= G.W && p.y >= 0 && p.y <= G.H) return true;
    return (c.x - H0.x) * Math.sin(H0.yaw) + (c.z - H0.z) * Math.cos(H0.yaw) < -14;
  };

  // ---------- 小目标指向的猎物（和 sim 的 goalTarget 同一个规则） ----------
  function goalOk(g, c, kind) {
    if (g.type === 'eat' || g.type === 'depth') return c.sp === g.sp && (c.edible || c.edibleCooked);
    if (g.type === 'cooked') return !c.edible && c.edibleCooked || (c.cooked >= 1 && c.edibleCooked);
    if (g.type === 'cross') return kind === 'fire' ? SPECIES[c.sp].hab !== 'air' && c.edible && c.y > -10 : (c.sp === 'gull' || c.sp === 'flyfish') && c.edible;
    return c.edible;
  }

  // ---------- 每帧 ----------
  function update(S, dt, events) {
    if (el.hidden || !S || !S.hero || !api.project) return;
    const H0 = S.hero, kind = S.kind;
    if (events) for (const e of events) {
      if (e.type === 'eat') { if (S.t - (C.bumpT || -9) > .15) { C.bumpT = S.t; pop(S.stage >= 2 ? cbar : gbar, 1.06, 200); } }
      else if (e.type === 'codex') { newQ.push(e.sp); showNew(); }
      else if (e.type === 'bite') hurts.forEach(x => x.animate && x.animate([{ opacity: 0 }, { opacity: .7, offset: .3 }, { opacity: 0 }], { duration: 600 }));
      else if (e.type === 'skill') pop(skill, 1.18, 320);
    }
    if (kind !== C.kind) { C.kind = kind; setKind(kind); C.nextKey = null; C.st = -1; }

    // 成长条
    const st = S.stage, pts = S.pts;
    if (st !== C.st || pts !== C.pts) {
      if (st !== C.st) { grow.classList.toggle('adult', st >= 2); nodes.forEach((n, i) => { n.classList.toggle('on', i <= st); n.classList.toggle('cur', i === st); }); }
      if (st < 2) {
        for (let i = 0; i < 2; i++) fills[i].style.transform = `scaleX(${clamp01((pts - STAGE_PTS[i]) / (STAGE_PTS[i + 1] - STAGE_PTS[i])).toFixed(3)})`;
        grow.classList.toggle('ready', pts >= STAGE_PTS[st + 1]);
      } else {
        let n = 0; for (const id of SPECIES_IDS) if (S.codex && S.codex[id] && S.codex[id].n > 0) n++;
        if (n !== C.cn) { C.cn = n; cFill.style.transform = `scaleX(${(n / SPECIES_IDS.length).toFixed(3)})`; cTxt.textContent = n + '/' + SPECIES_IDS.length; C.nextKey = null; }
        grow.classList.remove('ready');
      }
      C.st = st; C.pts = pts;
    }
    // 下一阶段：会学会的能力（淡一点、保留颜色 + 小锁，龙吼 / 大口吞要分得清）+ 能吃什么（剪影）；成龙后 = 这条龙还没吃过的图鉴
    const na = nextAbs(S);
    let nk = kind + st + '|' + na.join(',');
    if (st >= 2) nk += '|' + C.cn;
    if (C.picRetry > 0 && (C.picRetry -= dt) <= 0) C.nextKey = null;
    if (nk !== C.nextKey) {
      C.nextKey = nk; pic.miss = false;
      const list = SPECIES_IDS.filter(id => SPECIES[id].who.includes(kind) &&
        (st < 2 ? SPECIES[id].tier === st + 2 : !(S.codex && S.codex[id] && S.codex[id].n > 0))).slice(0, st < 2 ? 3 : 4);
      nAb.innerHTML = na.map(id => `<span class="d-abl">${icon(abIcon(id, kind))}<i>${icon('lock')}</i></span>`).join('');
      nAb.hidden = !na.length;
      nSp.innerHTML = list.map(id => `<span class="d-sil">${pic(id)}</span>`).join('');
      nSp.hidden = !list.length;
      next.hidden = !list.length && !na.length;
      C.picRetry = pic.miss ? .4 : 0;
    }

    // 连吃
    const cn = S.combo ? S.combo.n : 0, ct = S.combo ? S.combo.t : 0;
    if (cn !== C.combo) { if (cn >= 2) { comboN.textContent = cn; if (cn > C.combo) pop(combo, 1.4, 300); } C.combo = cn; }
    setOp(combo, cn >= 2 && ct > 0 ? Math.min(1, ct / .4) : 0);

    // 小目标卡
    const g = S.goal;
    if (!g) { if (!goal.hidden) goal.hidden = true; }
    else {
      if (goal.hidden) goal.hidden = false;
      const key = g.type + '|' + (g.sp || '') + '|' + g.n + '|' + g.icon + '|' + kind;
      if (key !== C.gkey || C.gRetry > 0 && (C.gRetry -= dt) <= 0) {
        const fresh = key !== C.gkey; C.gkey = key; pic.miss = false;
        gPic.innerHTML = goalPic(g, kind); C.gRetry = pic.miss ? .4 : 0;
        gN.textContent = '/' + g.n; C.ghave = -1;
        if (fresh && C.gShown && goal.animate) goal.animate([{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
        C.gShown = true;
      }
      if (g.have !== C.ghave) { if (C.ghave >= 0 && g.have > C.ghave) pop(gHave, 1.5, 260); C.ghave = g.have; gHave.textContent = Math.min(g.have, g.n); }
      const done = !!g.done;
      if (done !== C.gdone) { C.gdone = done; goal.classList.toggle('done', done); if (done) { pop(gChk, 1.8, 420); pop(goal, 1.12, 360); } }
    }

    // 箭头：①小目标的猎物 ②最近能吃的；顺便找锁定的那只
    let tg = null, ne = null, tgD = 400 * 400, neD = 300 * 300, lc = null;
    const lockId = H0.lock || 0;
    bang3.length = 0; tag3.length = 0;
    const gOn = g && !g.done;
    for (const c of S.creatures || []) {
      if (c.dying) continue;
      if (lockId && c.id === lockId) lc = c;
      const dx = c.x - H0.x, dy = c.y - H0.y, dz = c.z - H0.z, d2 = dx * dx + dy * dy + dz * dz;
      if (gOn && d2 < tgD && goalOk(g, c, kind)) { tgD = d2; tg = c; }
      if (d2 < neD && (c.edible || c.cooked >= 1 && c.edibleCooked)) { neD = d2; ne = c; }
      if (c.alert > 0) insert(bang3, c, d2, 3);
      else if (d2 < 60 * 60 && !c.edible && SPECIES[c.sp] && SPECIES[c.sp].who.includes(kind)) insert(tag3, c, d2, 3);
    }
    if (ne && tg && ne.id === tg.id) ne = null;
    if (lc && ne && ne.id === lc.id) ne = null;          // 已经锁定了，就不用再指「最近能吃的」
    placeArrow(arrows[0], tg, dt, H0, lc); placeArrow(arrows[1], ne, dt, H0, lc);
    placeLock(lc, dt);

    // 天敌「!」：头顶；在画面外时贴屏幕边
    for (let i = 0; i < 3; i++) {
      const b = bangs[i], c = bang3[i] && bang3[i].c;
      if (!c) { setOp(b.e, 0); continue; }
      const p = api.project(c.x, c.y + c.size * .7, c.z);
      if (onScreen(p, G)) { const y = Math.max(p.y - 22, topZ()); setTf(b.e, p.x, belowCards(p.x, y, 17)); }   // 天敌「!」不能藏到顶栏 / 小目标卡后面
      else { const q = pin(p, isBehind(p, c, H0), 22); setTf(b.e, q.x, q.y); }
      setOp(b.e, Math.min(1, c.alert * 1.6));
      if (b.chase !== !!c.chasing) { b.chase = !!c.chasing; b.e.classList.toggle('chase', b.chase); }
    }
    // 吃不了的大家伙：头顶小牌（锁 + 需要的阶段 / 烤熟后能吃：火焰或星星）
    for (let i = 0; i < 3; i++) {
      const t = tags[i], c = tag3[i] && tag3[i].c;
      const p = c && api.project(c.x, c.y + c.size * .7, c.z);
      if (!c || !onScreen(p, G) || underTop(p.x, p.y - 30, 14) || c.id === arrows[0].id && arrows[0].a > .1) { setOp(t.e, 0); continue; }
      const k = c.edibleCooked ? (kind === 'fire' ? 'f' : 's') : 'l' + SPECIES[c.sp].tier;
      if (k !== t.k) { t.k = k; t.e.innerHTML = k === 'f' ? icon('fire') : k === 's' ? icon('star', 'stun') : icon('lock') + `<i>${STAGE_CH[SPECIES[c.sp].tier - 1]}</i>`; t.e.classList.toggle('lk', k[0] === 'l'); }
      setTf(t.e, p.x, p.y - 16); setOp(t.e, .95);
    }

    // 跨界计时圈：围着龙，最后 0.7 秒变红 + 「!」
    if (H0.crossMax > 0) {
      const p = api.project(H0.x, H0.y, H0.z);
      const left = H0.crossMax - H0.crossT, f = clamp01(left / H0.crossMax);
      setTf(ring, p.x, p.y); setOp(ring, 1);
      const off = (RING_C * (1 - f)).toFixed(1); if (ring._o !== off) { ring._o = off; ringPr.setAttribute('stroke-dashoffset', off); }
      const warn = left < .7; if (warn !== C.warn) { C.warn = warn; ring.classList.toggle('warn', warn); if (warn) pop(ring.querySelector('.d-rbang'), 1.5, 300); }
      const air = H0.medium === 'air'; if (air !== C.rAir) { C.rAir = air; ring.classList.toggle('air', air); }
    } else setOp(ring, 0);

    // 动作键：海龙 = 冲刺冷却；火龙 = 正在喷火时发亮
    if (kind === 'sea') {
      const f = H0.dashCdMax > 0 ? clamp01(1 - H0.dashCd / H0.dashCdMax) : 1;
      const off = (ACT_C * (1 - f)).toFixed(1); if (C.aOff !== off) { C.aOff = off; actPr.setAttribute('stroke-dashoffset', off); }
      setWipe(actWipe, 1 - f);
      const cool = H0.dashCd > 0; if (cool !== C.cool) { C.cool = cool; act.classList.toggle('cool', cool); if (!cool && C.coolSeen) pop(act, 1.1, 260); C.coolSeen = true; }
      const off2 = H0.medium !== 'water'; if (off2 !== C.aDim) { C.aDim = off2; act.classList.toggle('dim', off2); }
    } else {
      setWipe(actWipe, 0);
      const fi = !!H0.firing; if (fi !== C.firing) { C.firing = fi; act.classList.toggle('firing', fi); }
      const off2 = H0.medium === 'water'; if (off2 !== C.aDim) { C.aDim = off2; act.classList.toggle('dim', off2); }
    }

    // 第二技能键（只有成龙有 S.hero.skill）
    const sk = H0.skill;
    const skId = sk && sk.id || '';
    if (skId !== C.skId) {
      C.skId = skId; skill.hidden = !skId; root.classList.toggle('d-hasskill', !!skId);
      if (skId) { skIn.innerHTML = `${icon(abIcon(skId, kind))}<span>${abName(skId) || '技能'}</span>`; skill.classList.toggle('sea', kind === 'sea'); C.skOff = null; C.skCool = null; }
    }
    if (skId) {
      const max = sk.cdMax > 0 ? sk.cdMax : 1, f = clamp01(1 - (sk.cd || 0) / max);
      const off = (SK_C * (1 - f)).toFixed(1); if (C.skOff !== off) { C.skOff = off; skPr.setAttribute('stroke-dashoffset', off); }
      setWipe(skWipe, 1 - f);
      const cool = (sk.cd || 0) > 0; if (cool !== C.skCool) { const was = C.skCool; C.skCool = cool; skill.classList.toggle('cool', cool); skill.classList.toggle('ready', !cool); if (!cool && was) pop(skill, 1.15, 300); }
      const on = (sk.t || 0) > 0; if (on !== C.skOn) { C.skOn = on; skill.classList.toggle('active', on); }
    }
  }

  const bang3 = [], tag3 = [];
  // 最近的 n 个（插入排序，n 很小）
  function insert(arr, c, d2, n) {
    if (arr.length >= n && d2 >= arr[n - 1].d) return;
    let i = Math.min(arr.length, n - 1); arr[i] = { c, d: d2 };
    while (i > 0 && arr[i - 1].d > d2) { const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; i--; }
  }

  // 锁定圈：跟着锁定的猎物，略大于它在屏幕上的大小（半径 14~32px）；换目标时从大圈收拢一下。
  // 猎物贴近屏幕边（离边不到一个半径）时淡掉，不画半个圈。线宽按缩放反算，大圈小圈看起来一样粗（约 4 / 7.5px）
  function placeLock(c, dt) {
    let p = null, edge = 1;
    if (c) { p = api.project(c.x, c.y, c.z); if (!onScreen(p, G)) p = null; }
    if (p) {
      if (c.id !== LK.id) { LK.id = c.id; LK.s = 1.6; if (LK.a < .05) LK.a = .05; }
      const q = api.project(c.x, c.y + c.size * .5, c.z);
      const rpx = Math.hypot(q.x - p.x, q.y - p.y);
      const r = Math.max(14, Math.min(32, rpx * 1.15 + 8));
      LK.s += (1 - LK.s) * Math.min(1, dt * 9);
      const sc = r / 36 * LK.s;
      setTf(lockEl, p.x, p.y, 0, sc);
      const k = Math.round(10 / sc) / 10; if (k !== LK.k) { LK.k = k; lockEl.style.setProperty('--lkw', k); }
      const d = Math.min(p.x - G.sl, G.W - G.sr - p.x, p.y - G.st, G.H - G.sb - p.y);
      edge = clamp01((d - r * .4) / (r * .8));
      LK.a = Math.min(1, LK.a + dt * 6);
    } else {
      LK.a = Math.max(0, LK.a - dt * 5);
      if (LK.a <= 0) LK.id = 0;
    }
    if (p) LK.e = LK.e == null ? edge : LK.e + (edge - LK.e) * Math.min(1, dt * 12);   // 没目标时保持原值，跟着 LK.a 淡出
    setOp(lockEl, LK.a * (LK.e == null ? 1 : LK.e));
  }

  // 箭头：猎物在画面外 → 贴边指过去；进了画面 → 头顶向下的小箭头，1 秒后淡出（被锁定的那只有锁定圈，不再画头顶箭头）
  function placeArrow(A, c, dt, H0, lc) {
    if (!c) { A.id = null; A.a = Math.max(0, A.a - dt * 4); setOp(A.e, A.a); return; }
    if (c.id !== A.id) { A.id = c.id; A.onT = 0; A.offT = 0; }
    const p = api.project(c.x, c.y + c.size * .5, c.z);
    let target;
    if (onScreen(p, G)) {
      A.onT += dt; A.offT = 0; setTf(A.e, p.x, p.y - 30, 180);
      target = lc && lc.id === c.id ? 0 : A.onT < 1 ? 1 : Math.max(0, 1 - (A.onT - 1) / .3);
      if (underTop(p.x, p.y - 46, 16)) { A.a = 0; target = 0; }   // 猎物在顶栏后面：头顶箭头会压在成长条 / 小目标卡 / 连吃上，直接不画（不淡出）
    } else {
      A.offT += dt; if (A.offT > .5) A.onT = 0;
      const q = pin(p, isBehind(p, c, H0), 20); setTf(A.e, q.x, q.y, q.deg);
      target = A.onT > 1 ? 0 : 1;
    }
    A.a += (target - A.a) * Math.min(1, dt * 10);
    setOp(A.e, A.a);
  }

  function goalPic(g, kind) {
    const ic = g.icon || g.sp || g.type;
    if (SPECIES[ic]) return pic(ic);
    if (ic === 'cooked') return kind === 'fire' ? icon('fire') : `<span class="d-gstun">${icon('dash')}<i>${icon('star', 'stun')}</i></span>`;   // 海龙：撞晕（冲刺 + 星星）
    if (ic === 'cross') return icon(kind === 'fire' ? 'plunge' : 'breach');
    if (ic === 'skill') return icon(kind === 'fire' ? 'roar' : 'vortex');
    if (ic === 'combo') return '<b class="d-x">×</b>';
    if (ic === 'grow') return icon('grow');
    if (ic === 'depth') return icon('down');
    if (ABILITIES[ic]) return icon(abIcon(ic, kind));
    return icon('star');
  }

  function setKind(kind) {
    el.classList.toggle('sea', kind === 'sea'); el.classList.toggle('fire', kind !== 'sea');
    act.classList.toggle('sea', kind === 'sea'); skill.classList.toggle('sea', kind === 'sea');
    actIn.innerHTML = kind === 'sea' ? `${icon('dash')}<span>冲刺</span>` : `${icon('fire')}<span>喷火</span>`;
    heads.forEach((n, i) => { n.innerHTML = icon(`head_${kind === 'sea' ? 'sea' : 'fire'}${i}`); });
  }

  return {
    el,
    show(kind) { reset(); setKind(kind); C.kind = kind; el.hidden = false; },
    hide() { el.hidden = true; if (actOn) { actId = null; setAct(false); } skill.classList.remove('down'); root.classList.remove('d-hasskill'); },
    update,
    setMute(b) { setIcon(bSound, b ? 'mute' : 'sound'); bSound.classList.toggle('off', !!b); },
    setTemp(on) { temp.hidden = !on; },
  };
}

// 按钮按下不往下传（主程序不会在按钮下面出摇杆）
function noJoy(b) {
  b.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  b.addEventListener('contextmenu', e => e.preventDefault());
}
