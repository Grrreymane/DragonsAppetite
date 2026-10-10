// 游戏中的 HUD：成长条、下一阶段剪影、连吃、小目标卡、边缘箭头、天敌「!」、跨界计时圈、动作键、菜单 / 声音
// update 每帧调用：只在数值变了时写 DOM；箭头 / 标记只改 transform 和 opacity；不读布局（屏幕尺寸由 ui.js 缓存在 G 里）
import { SPECIES, SPECIES_IDS } from '../config/species.js';
import { STAGE_PTS } from '../config/dragons.js';
import { icon } from './icons.js';
import { h, button, setIcon, pop } from './dom.js';

export const STAGE_CH = ['幼', '少', '成'];
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const RING_C = 2 * Math.PI * 36, ACT_C = 2 * Math.PI * 48;

// p = api.project 的结果，是否在屏幕里
const onScreen = (p, G) => p && p.visible !== false && p.x >= 0 && p.x <= G.W && p.y >= 0 && p.y <= G.H;

export function createHUD(root, api, G, pic) {
  const el = h('div', 'd-hud'); el.hidden = true; root.appendChild(el);

  // ---------- 顶部：菜单 / 声音 ----------
  const bMenu = button('menu', '菜单', 'd-sbtn d-menu', () => api.onPause && api.onPause());
  const bSound = button('sound', '声音', 'd-sbtn d-sound', () => api.onToggleMute && api.onToggleMute());

  // ---------- 成长条（幼 → 少 → 成）；成龙以后换成图鉴进度条 ----------
  const grow = h('div', 'd-grow', `
    <div class="d-gbar"><i class="d-node">${STAGE_CH[0]}</i><b class="d-seg"><u></u></b><i class="d-node">${STAGE_CH[1]}</i><b class="d-seg"><u></u></b><i class="d-node">${STAGE_CH[2]}</i><em class="d-hurt"></em></div>
    <div class="d-cbar">${icon('book')}<b class="d-seg"><u></u></b><span class="d-ctxt">0/12</span><em class="d-hurt"></em></div>
    <div class="d-next"></div>`);
  const gbar = grow.querySelector('.d-gbar'), cbar = grow.querySelector('.d-cbar');
  const nodes = [...grow.querySelectorAll('.d-gbar .d-node')], fills = [...grow.querySelectorAll('.d-gbar u')];
  const cFill = grow.querySelector('.d-cbar u'), cTxt = grow.querySelector('.d-ctxt'), next = grow.querySelector('.d-next');
  const hurts = [...grow.querySelectorAll('.d-hurt')];

  // ---------- 连吃 ×N ----------
  const combo = h('div', 'd-combo', '<i>×</i><b>2</b>'); const comboN = combo.querySelector('b');

  // ---------- 小目标卡 ----------
  const goal = h('div', 'd-goal', `<div class="d-gpic"></div><div class="d-gnum"><b>0</b><i>/0</i></div><div class="d-gchk">${icon('check')}</div>`);
  const gPic = goal.querySelector('.d-gpic'), gHave = goal.querySelector('.d-gnum b'), gN = goal.querySelector('.d-gnum i'), gChk = goal.querySelector('.d-gchk');

  // ---------- 屏幕上的标记：箭头 ×2、天敌「!」×3、提示牌 ×3、跨界圈 ----------
  const marks = h('div', 'd-marks');
  const mk = (cls, html) => { const m = h('div', cls, html); m.style.opacity = 0; marks.appendChild(m); return m; };
  const arrows = [mk('d-arw gold', `<div>${icon('arrow')}</div>`), mk('d-arw', `<div>${icon('arrow')}</div>`)]
    .map(e => ({ e, id: null, onT: 0, offT: 0, a: 0, x: -1, y: -1, r: 0 }));
  const bangs = [0, 1, 2].map(() => ({ e: mk('d-bang', `<div>${icon('bang')}</div>`), a: 0, chase: false, k: '' }));
  const tags = [0, 1, 2].map(() => ({ e: mk('d-tag', ''), a: 0, k: '' }));
  const ring = mk('d-ring', `<svg viewBox="0 0 84 84"><circle class="tr" cx="42" cy="42" r="36"/><circle class="pr" cx="42" cy="42" r="36" stroke-dasharray="${RING_C}" stroke-dashoffset="0"/></svg><div class="d-rbang">${icon('bang')}</div>`);
  const ringPr = ring.querySelector('.pr');

  // ---------- 动作键（右下 88px；外圈 = 冷却） ----------
  const act = h('div', 'd-act', `<svg class="d-acr" viewBox="0 0 104 104"><circle class="tr" cx="52" cy="52" r="48"/><circle class="pr" cx="52" cy="52" r="48" stroke-dasharray="${ACT_C}" stroke-dashoffset="0"/></svg><div class="d-actin"></div>`);
  const actIn = act.querySelector('.d-actin'), actPr = act.querySelector('.d-acr .pr');
  let actId = null, actOn = false;
  const setAct = on => { if (on === actOn) return; actOn = on; act.classList.toggle('on', on); api.onAction && api.onAction(on); };
  act.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation(); if (actId !== null) return;
    actId = e.pointerId; try { act.setPointerCapture(e.pointerId); } catch (_) { /* 没有就算了 */ }
    setAct(true);
  });
  const actEnd = e => { if (e.pointerId !== actId) return; e.stopPropagation(); actId = null; setAct(false); };
  act.addEventListener('pointerup', actEnd); act.addEventListener('pointercancel', actEnd); act.addEventListener('lostpointercapture', actEnd);
  act.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  act.addEventListener('contextmenu', e => e.preventDefault());

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

  el.append(marks, grow, combo, goal, newsp, temp, act, bMenu, bSound);

  // ---------- 缓存（只写变了的值） ----------
  let C = {};
  const reset = () => { C = { op: {} }; arrows.forEach(a => { a.id = null; a.onT = 0; a.a = -1; }); };
  reset();
  const setOp = (m, a) => { a = Math.round(a * 20) / 20; if (m._a !== a) { m._a = a; m.style.opacity = a; m.style.visibility = a > 0 ? 'visible' : 'hidden'; } };
  const setTf = (m, x, y, rot = 0) => {
    x = Math.round(x); y = Math.round(y); rot = Math.round(rot);
    if (m._x !== x || m._y !== y || m._r !== rot) { m._x = x; m._y = y; m._r = rot; m.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg)`; }
  };

  // 画面外的点：沿「屏幕中心 → 投影点」方向贴到边框上（背后的点方向反过来）
  function pin(p, behind, inset) {
    const cx = G.W / 2, cy = G.H / 2;
    let dx = p.x - cx, dy = p.y - cy;
    if (behind) { dx = -dx; dy = -dy; }
    if (Math.abs(dx) + Math.abs(dy) < 1) dy = 1;
    const L = G.sl + inset, R = G.W - G.sr - inset, T = G.st + 112, B = G.H - G.sb - inset;
    const sx = dx > 0 ? (R - cx) / dx : dx < 0 ? (L - cx) / dx : 1e9, sy = dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : 1e9;
    const s = Math.min(sx, sy);
    return { x: cx + dx * s, y: cy + dy * s, deg: Math.atan2(dy, dx) * 57.2958 + 90 };
  }
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
    if (el.hidden || !S || !S.hero) return;
    const H0 = S.hero, kind = S.kind;
    if (events) for (const e of events) {
      if (e.type === 'eat') { if (S.t - (C.bumpT || -9) > .15) { C.bumpT = S.t; pop(S.stage >= 2 ? cbar : gbar, 1.06, 200); } }
      else if (e.type === 'codex') { newQ.push(e.sp); showNew(); }
      else if (e.type === 'bite') hurts.forEach(x => x.animate && x.animate([{ opacity: 0 }, { opacity: .7, offset: .3 }, { opacity: 0 }], { duration: 600 }));
      else if (e.type === 'goal') C.goalPop = true;
    }

    // 成长条
    const st = S.stage, pts = S.pts;
    if (st !== C.st || pts !== C.pts || kind !== C.kind) {
      if (st !== C.st || kind !== C.kind) { grow.classList.toggle('adult', st >= 2); nodes.forEach((n, i) => { n.classList.toggle('on', i <= st); n.classList.toggle('cur', i === st); }); }
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
    // 下一阶段能吃什么（剪影）；成龙后 = 这条龙还没吃过的图鉴
    let nk = kind + st;
    if (st >= 2) nk += '|' + C.cn;
    if (C.picRetry > 0 && (C.picRetry -= dt) <= 0) C.nextKey = null;
    if (nk !== C.nextKey) {
      C.nextKey = nk; pic.miss = false;
      const list = SPECIES_IDS.filter(id => SPECIES[id].who.includes(kind) &&
        (st < 2 ? SPECIES[id].tier === st + 2 : !(S.codex && S.codex[id] && S.codex[id].n > 0))).slice(0, 4);
      next.innerHTML = list.length ? (st < 2 ? `<i class="d-node sm on">${STAGE_CH[st + 1]}</i>` : '') + list.map(id => `<span class="d-sil">${pic(id)}</span>`).join('') : '';
      next.hidden = !list.length;
      if (pic.miss) C.picRetry = 1; else C.picRetry = 0;
    }
    if (kind !== C.kind) { C.kind = kind; setKind(kind); }

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
        gPic.innerHTML = goalPic(g, kind); C.gRetry = pic.miss ? 1 : 0;
        gN.textContent = '/' + g.n; C.ghave = -1;
        if (fresh && C.gShown && goal.animate) goal.animate([{ transform: 'translateX(40px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'ease-out' });
        C.gShown = true;
      }
      if (g.have !== C.ghave) { if (C.ghave >= 0 && g.have > C.ghave) pop(gHave, 1.5, 260); C.ghave = g.have; gHave.textContent = g.have; }
      const done = !!g.done;
      if (done !== C.gdone) { C.gdone = done; goal.classList.toggle('done', done); if (done) { pop(gChk, 1.8, 420); pop(goal, 1.12, 360); } }
    }

    // 箭头：①小目标的猎物 ②最近能吃的
    let tg = null, ne = null, tgD = 400 * 400, neD = 300 * 300;
    bang3.length = 0; tag3.length = 0;
    const gOn = g && !g.done;
    for (const c of S.creatures || []) {
      if (c.dying) continue;
      const dx = c.x - H0.x, dy = c.y - H0.y, dz = c.z - H0.z, d2 = dx * dx + dy * dy + dz * dz;
      if (gOn && d2 < tgD && goalOk(g, c, kind)) { tgD = d2; tg = c; }
      if (d2 < neD && (c.edible || c.cooked >= 1 && c.edibleCooked)) { neD = d2; ne = c; }
      if (c.alert > 0) insert(bang3, c, d2, 3);
      else if (d2 < 60 * 60 && !c.edible && SPECIES[c.sp] && SPECIES[c.sp].who.includes(kind)) insert(tag3, c, d2, 3);
    }
    if (ne && tg && ne.id === tg.id) ne = null;
    placeArrow(arrows[0], tg, dt, H0); placeArrow(arrows[1], ne, dt, H0);

    // 天敌「!」：头顶；在画面外时贴屏幕边
    for (let i = 0; i < 3; i++) {
      const b = bangs[i], c = bang3[i] && bang3[i].c;
      if (!c) { setOp(b.e, 0); continue; }
      const p = api.project(c.x, c.y + c.size * .7, c.z);
      if (onScreen(p, G)) setTf(b.e, p.x, p.y - 22);
      else { const q = pin(p, isBehind(p, c, H0), 22); setTf(b.e, q.x, q.y); }
      setOp(b.e, Math.min(1, c.alert * 1.6));
      if (b.chase !== !!c.chasing) { b.chase = !!c.chasing; b.e.classList.toggle('chase', b.chase); }
    }
    // 吃不了的大家伙：头顶小牌（锁 + 需要的阶段 / 烤熟后能吃：火焰或星星）
    for (let i = 0; i < 3; i++) {
      const t = tags[i], c = tag3[i] && tag3[i].c;
      const p = c && api.project(c.x, c.y + c.size * .7, c.z);
      if (!c || !onScreen(p, G)) { setOp(t.e, 0); continue; }
      const k = c.edibleCooked ? (kind === 'fire' ? 'f' : 's') : 'l' + SPECIES[c.sp].tier;
      if (k !== t.k) { t.k = k; t.e.innerHTML = k === 'f' ? icon('fire') : k === 's' ? icon('star', 'stun') : icon('lock') + `<i>${STAGE_CH[SPECIES[c.sp].tier - 1]}</i>`; t.e.classList.toggle('lk', k[0] === 'l'); }
      setTf(t.e, p.x, p.y - 16); setOp(t.e, .9);
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
      const cool = H0.dashCd > 0; if (cool !== C.cool) { C.cool = cool; act.classList.toggle('cool', cool); if (!cool && C.coolSeen) pop(act, 1.1, 260); C.coolSeen = true; }
      const off2 = H0.medium !== 'water'; if (off2 !== C.aDim) { C.aDim = off2; act.classList.toggle('dim', off2); }
    } else {
      const fi = !!H0.firing; if (fi !== C.firing) { C.firing = fi; act.classList.toggle('firing', fi); }
      const off2 = H0.medium === 'water'; if (off2 !== C.aDim) { C.aDim = off2; act.classList.toggle('dim', off2); }
    }
  }

  const bang3 = [], tag3 = [];
  // 最近的 n 个（插入排序，n 很小）
  function insert(arr, c, d2, n) {
    if (arr.length >= n && d2 >= arr[n - 1].d) return;
    let i = Math.min(arr.length, n - 1); arr[i] = { c, d: d2 };
    while (i > 0 && arr[i - 1].d > d2) { const t = arr[i - 1]; arr[i - 1] = arr[i]; arr[i] = t; i--; }
  }

  // 箭头：猎物在画面外 → 贴边指过去；进了画面 → 头顶向下的小箭头，1 秒后淡出
  function placeArrow(A, c, dt, H0) {
    if (!c) { A.id = null; A.a = Math.max(0, A.a - dt * 4); setOp(A.e, A.a); return; }
    if (c.id !== A.id) { A.id = c.id; A.onT = 0; A.offT = 0; }
    const p = api.project(c.x, c.y + c.size * .5, c.z);
    let target;
    if (onScreen(p, G)) {
      A.onT += dt; A.offT = 0; setTf(A.e, p.x, p.y - 30, 180);
      target = A.onT < 1 ? 1 : Math.max(0, 1 - (A.onT - 1) / .3);
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
    if (ic === 'cooked') return kind === 'fire' ? icon('fire') : icon('star', 'stun');
    if (ic === 'cross') return icon(kind === 'fire' ? 'down' : 'up');
    if (ic === 'combo') return '<b class="d-x">×</b>';
    if (ic === 'grow') return icon('grow');
    if (ic === 'depth') return icon('down');
    return icon('star');
  }

  function setKind(kind) {
    el.classList.toggle('sea', kind === 'sea'); el.classList.toggle('fire', kind !== 'sea');
    act.classList.toggle('sea', kind === 'sea');
    actIn.innerHTML = kind === 'sea' ? `${icon('dash')}<span>冲刺</span>` : `${icon('fire')}<span>喷火</span>`;
  }

  return {
    el,
    show(kind) { reset(); setKind(kind); C.kind = kind; el.hidden = false; },
    hide() { el.hidden = true; if (actOn) { actId = null; setAct(false); } },
    update,
    setMute(b) { setIcon(bSound, b ? 'mute' : 'sound'); bSound.classList.toggle('off', !!b); },
    setTemp(on) { temp.hidden = !on; },
  };
}
