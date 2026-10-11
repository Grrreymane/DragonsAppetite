// 界面总入口（DOM）：createUI(root, api) → 各界面的开关 + 每帧 update。接口见 docs/ARCH.md「ui 接口」「v2 新增」
// root = #ui（在 #wrap 里，和画布一样大）。样式在 ui/style.css（index.html 引入）
import { SPECIES } from '../config/species.js';
import { ABILITIES } from '../config/dragons.js';
import { icon, onSheet, SHEET } from './icons.js';
import { h } from './dom.js';
import { createHUD, abIcon } from './hud.js';
import { createTitle, createLoading } from './title.js';
import { createMenu } from './menu.js';
import { createCodex } from './codex.js';
import { createResult } from './result.js';

export function createUI(root, api = {}) {
  root.classList.add('dui');
  root.addEventListener('contextmenu', e => e.preventDefault());
  // 画的图标图集好了才切过去（没好之前 / 失败就用内联 SVG；网慢、3 秒以后才到也照样切过去）。
  // 图集网址（带版本号）只写在 icons.js 里，CSS 用变量 --pi-sheet
  root.style.setProperty('--pi-sheet', `url("${SHEET.src}")`);
  onSheet(() => root.classList.add('pi-ok'));

  // 屏幕尺寸 + 安全区：只在尺寸变化时读一次布局（update 里不读）。宽屏（≥ 480px）整体放大一档；矮屏（< 760 / < 600px）标题页收紧
  // s = 整体缩放（和 CSS 的 --s 一致），left = 左手模式（hud.js 的边缘箭头据此躲开按钮那一列）
  const G = { W: 360, H: 640, st: 0, sb: 0, sl: 0, sr: 0, s: 1, left: false };
  const probe = h('div', 'd-probe'); root.appendChild(probe);
  const measure = () => {
    G.W = root.clientWidth || G.W; G.H = root.clientHeight || G.H;
    const cs = getComputedStyle(probe);
    G.st = parseFloat(cs.paddingTop) || 0; G.sb = parseFloat(cs.paddingBottom) || 0;
    G.sl = parseFloat(cs.paddingLeft) || 0; G.sr = parseFloat(cs.paddingRight) || 0;
    root.classList.toggle('d-wide', G.W >= 480);
    root.classList.toggle('d-narrow', G.W < 340);
    G.s = G.W >= 480 ? 1.2 : G.W < 340 ? .9 : 1;
    root.classList.toggle('d-mid', G.H < 760);
    root.classList.toggle('d-short', G.H < 600);
  };
  measure();
  if (typeof ResizeObserver === 'function') new ResizeObserver(measure).observe(root); else addEventListener('resize', measure);

  // 生物小图：api.portrait(sp) → dataURL，缓存；还没好时用通用图标顶上（pic.miss = true，调用方过一会儿再试）
  // 拿到以后在后台裁掉透明边、补成正方形（小目标卡 / 剪影里生物才够大），裁好之前先用原图，也算 miss 让调用方再刷一次
  const pcache = {}, trimmed = {};
  const trim = (sp, u) => {
    if (sp in trimmed) return; trimmed[sp] = null;
    const im = new Image();
    im.onload = () => {
      try {
        const w = im.naturalWidth, hh = im.naturalHeight; if (!w || !hh) { trimmed[sp] = u; return; }
        const c = document.createElement('canvas'); c.width = w; c.height = hh; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, w, hh).data; let x0 = w, y0 = hh, x1 = -1, y1 = -1;
        for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        if (x1 < 0) { trimmed[sp] = u; return; }
        const pad = 2, bw = x1 - x0 + 1 + pad * 2, bh = y1 - y0 + 1 + pad * 2, S2 = Math.max(bw, bh);
        const o = document.createElement('canvas'); o.width = o.height = S2;
        o.getContext('2d').drawImage(c, x0 - pad, y0 - pad, bw, bh, (S2 - bw) / 2, (S2 - bh) / 2, bw, bh);
        trimmed[sp] = o.toDataURL();
      } catch (e) { trimmed[sp] = u; }
    };
    im.onerror = () => { trimmed[sp] = u; };
    im.src = u;
  };
  const pic = sp => {
    if (trimmed[sp]) return `<img src="${trimmed[sp]}" alt="" draggable="false">`;
    let u = pcache[sp];
    if (!u && api.portrait) { try { u = api.portrait(sp); } catch (e) { console.warn('portrait', sp, e); } if (u) pcache[sp] = u; }
    if (u) { trim(sp, u); pic.miss = true; return `<img src="${u}" alt="" draggable="false">`; }
    pic.miss = true;
    const hab = SPECIES[sp] && SPECIES[sp].hab;
    return icon(/jelly/.test(sp) ? 'jelly' : hab === 'air' ? 'bird' : 'fish', 'fb');
  };

  const hud = createHUD(root, api, G, pic);
  const hintEl = h('div', 'd-hint'); hintEl.hidden = true; root.appendChild(hintEl);
  const toastEl = h('div', 'd-toast'); root.appendChild(toastEl);
  const abEl = h('div', 'd-abil'); abEl.hidden = true; root.appendChild(abEl);
  const menu = createMenu(root, api);
  const title = createTitle(root, api);
  const codex = createCodex(root, api, pic);
  const result = createResult(root, api);
  const loading = createLoading(root);
  let kind = 'fire', mute = false, left = false;

  // ---------- 首次提示：小手 / 箭头 + 不超过 5 个字 ----------
  // 'blocked_plunge' / 'blocked_breach'：想扎水 / 跃出但还没学会 →「长大后学会」，2.4 秒后自己消失，回到原来的提示
  const ab = (id, txt) => `<span class="d-pab">${icon(abIcon(id))}</span><span>${txt}</span>`;
  const HINTS = {
    drag: ['d-hc', icon('point'), '按住拖动'],
    plunge: ['d-hc', icon('down'), ab('plunge', '扎水')],
    breach: ['d-hc', icon('up'), ab('breach', '跃出')],
    fire: ['d-ha', icon('point'), '按住喷火'],
    dash: ['d-ha', icon('point'), '点击冲刺'],
    skill: ['d-ha d-hs', icon('point'), '点一下'],
    // 能力图标垫奶油色圆片（直接放在海面上会像场景里的东西）+ 右下角小锁
    blocked_plunge: ['d-hc d-hb', `<span class="d-hdisc">${icon('plunge')}</span><i class="d-hlk">${icon('lock')}</i>`, '长大后学会'],
    blocked_breach: ['d-hc d-hb', `<span class="d-hdisc">${icon('breach')}</span><i class="d-hlk">${icon('lock')}</i>`, '长大后学会'],
  };
  let shownHint = null, baseHint = null, tempT = 0, blockedAt = {}, hideT = 0, shownAt = 0, fadeA = null;
  // fast = 立刻藏（关 HUD 时）；否则淡出 0.18 秒
  const render = (name, fast) => {
    if (name === shownHint) return; shownHint = name;
    if (fadeA) { fadeA.onfinish = null; fadeA.cancel(); fadeA = null; }
    const d = name && HINTS[name];
    if (!d) {
      if (fast || hintEl.hidden || !hintEl.animate) { hintEl.hidden = true; hintEl.innerHTML = ''; return; }
      const a = fadeA = hintEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
      a.onfinish = () => { if (fadeA === a) fadeA = null; if (!shownHint) { hintEl.hidden = true; hintEl.innerHTML = ''; } a.cancel(); };   // cancel：别让 forwards 的 0 透明度留到下次
      return;
    }
    hintEl.className = `d-hint ${d[0]} h-${name}`;
    hintEl.innerHTML = `<div class="d-hic">${d[1]}</div><div class="d-pill">${d[2]}</div>`;
    hintEl.hidden = false; shownAt = performance.now();
    if (hintEl.animate) hintEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
  };
  // 主程序的提示条件会在边界上来回跳（例如猎物刚进 35 米又出去，一帧出一帧收）：
  // 收起来要等 0.4 秒、而且至少露 1.2 秒，这期间又要同一个提示就接着显示，不会一闪一闪
  const showBase = () => {
    clearTimeout(hideT); hideT = 0;
    if (baseHint || !shownHint) { render(baseHint); return; }
    const wait = Math.max(400, 1200 - (performance.now() - shownAt));
    hideT = setTimeout(() => { hideT = 0; if (!baseHint && !tempT) render(null); }, wait);
  };
  // 「扎水 / 跃出」的教学提示：这条龙还没学会（S.abilities 里没有）就先不显示，学会了再出来
  let wantHint = null, abil = null;
  const usable = name => !(name === 'plunge' || name === 'breach') || !Array.isArray(abil) || abil.includes(name);
  const hint = name => {
    if (name && /^blocked_/.test(name)) {
      if (!HINTS[name]) return;
      clearTimeout(tempT); clearTimeout(hideT); hideT = 0; render(name);
      tempT = setTimeout(() => { tempT = 0; render(baseHint); }, 2400);
      return;
    }
    wantHint = name && HINTS[name] ? name : null;
    baseHint = wantHint && usable(wantHint) ? wantHint : null;
    if (!tempT) showBase();
  };

  // ---------- 大字（阶段名）：放大淡入，停 1.2 秒，淡出。不闪 ----------
  let toastEnd = 0;
  const toast = text => {
    toastEl.textContent = text || '';
    toastEl.classList.toggle('sea', kind === 'sea');
    toastEnd = performance.now() + 1600;
    if (toastEl.animate) {
      toastEl.getAnimations && toastEl.getAnimations().forEach(a => a.cancel());
      toastEl.animate([{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1.05)', offset: .14 }, { opacity: 1, transform: 'scale(1)', offset: .22 },
        { opacity: 1, transform: 'scale(1)', offset: .75 }, { opacity: 0, transform: 'scale(1)' }], { duration: 1600, easing: 'ease-out', fill: 'forwards' });
    }
  };

  // ---------- 「新能力」卡：图标 + 名字 + 一句话，约 2.5 秒，不挡操作（pointer-events: none）----------
  // 位置：成长条下面（屏幕上部），不挡刚换好模型的龙；两个能力并排（卡片矮一半）。
  // 阶段名大字还在的话等它放完再出；同一组能力 8 秒内只弹一次（主程序调 showAbility 和 'unlock' 事件谁先到都行）。
  // HUD 没开（标题页）就不弹；结算卡开着时排队，点「继续」后再弹（被结算卡打断的那张也重放）
  const abQ = []; let abBusy = false, abLast = { key: '', t: -1e9 }, abTimer = 0, abCur = null, abEnd = 0, resOpen = false;
  const norm = list => (Array.isArray(list) ? list : [list]).map(a => {
    if (typeof a === 'string') a = { id: a };
    const d = ABILITIES[a.id] || {};
    return { id: a.id, zh: a.zh || d.zh || '', desc: a.desc || d.desc || '', icon: abIcon(a.id, kind) || a.icon || a.id };
  }).filter(a => a.id);
  const abDur = L => 2500 + 500 * (L.length - 1);
  function showAbility(list) {
    if (hud.el.hidden) return;
    const L = norm(list || []); if (!L.length) return;
    const key = L.map(a => a.id).sort().join(',');
    const now = performance.now();
    if (key === abLast.key && now - abLast.t < 8000) return;
    if (abQ.some(q => q.key === key)) return;
    abLast = { key, t: now };
    abQ.push({ key, L }); nextAbility();
  }
  function stopAbility() {
    clearTimeout(abTimer);
    if (abBusy) { abEl.getAnimations && abEl.getAnimations().forEach(a => { a.onfinish = null; a.cancel(); }); clearTimeout(abEl._t); }
    abEl.hidden = true; abEl.innerHTML = ''; abBusy = false; abCur = null; root.classList.remove('d-abon');
  }
  function nextAbility() {
    if (abBusy || !abQ.length || resOpen || hud.el.hidden) return;
    const wait = Math.max(0, toastEnd - performance.now() - 150);
    if (wait > 0) { clearTimeout(abTimer); abTimer = setTimeout(nextAbility, wait); return; }
    abCur = abQ.shift(); const { L } = abCur; abBusy = true;
    abEl.className = 'd-abil ' + (kind === 'sea' ? 'sea' : 'fire') + (L.length > 1 ? ' two' : '');
    abEl.innerHTML = `<div class="d-abrib"><span>新能力</span></div><div class="d-abrows">${L.map(a =>
      `<div class="d-abrow"><div class="d-abic"><i class="d-rays"></i>${icon(a.icon)}</div><div class="d-abtx"><b>${a.zh}</b><span>${a.desc}</span></div></div>`).join('')}</div>`;
    abEl.hidden = false; root.classList.add('d-abon');   // 卡片在的时候小目标卡和连吃先让开（不叠在一起），放完再滑回来
    const dur = abDur(L); abEnd = performance.now() + dur;
    const done = () => { abEl.hidden = true; abEl.innerHTML = ''; abBusy = false; abCur = null; root.classList.remove('d-abon'); nextAbility(); };
    if (abEl.animate) {
      abEl.animate([{ opacity: 0, transform: 'translateY(-14px) scale(.7)' }, { opacity: 1, transform: 'translateY(0) scale(1.06)', offset: .1 },
        { opacity: 1, transform: 'scale(1)', offset: .16 }, { opacity: 1, transform: 'scale(1)', offset: .88 }, { opacity: 0, transform: 'translateY(-10px) scale(.96)' }],
        { duration: dur, easing: 'ease-out', fill: 'forwards' }).onfinish = done;
      abEl.querySelectorAll('.d-abrow').forEach((r, i) => r.animate && r.animate([{ opacity: 0, transform: 'translateY(10px) scale(.9)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, delay: 160 + i * 200, easing: 'ease-out', fill: 'backwards' }));
    } else abEl._t = setTimeout(done, dur);
  }
  // 新能力卡还要多久放完（秒；排队没开始的也算上，阶段名大字没放完的那段也算）。主程序可以据此推迟结算卡
  const abilityLeft = () => {
    const now = performance.now();
    let t = abBusy ? Math.max(0, abEnd - now) : 0;
    if (abQ.length) t += (abBusy ? 0 : Math.max(0, toastEnd - now - 150)) + abQ.reduce((s, q) => s + abDur(q.L), 0);
    return t / 1000;
  };

  // ---------- 结算卡：新能力卡还在放的话等它放完（最多 1.5 秒）；还是被打断的话，点「继续」后重放 ----------
  let resT = 0;
  function showResult(info, onContinue) {
    clearTimeout(resT);
    const open = () => {
      resT = 0; resOpen = true;
      if (abBusy) { const cur = abCur; stopAbility(); if (cur) { abQ.unshift(cur); abLast.t = -1e9; } }
      clearTimeout(abTimer);
      result.show(info, () => { resOpen = false; onContinue && onContinue(); setTimeout(nextAbility, 350); });
    };
    const left = abBusy ? abEnd - performance.now() : 0;
    if (left > 0) resT = setTimeout(open, Math.min(1500, left + 120)); else open();
  }

  // 主程序没转发的话，ui 自己看事件：进化解锁 → 新能力卡；想扎水 / 跃出但还没学会 → 提示（同一个能力 6 秒内只提示一次）
  function watch(S, events) {
    const got = S.abilities || null;
    if (got !== abil) { const ch = !abil || !got || got.length !== abil.length; abil = got; if (ch && wantHint) hint(wantHint); }
    if (!events) return;
    for (const e of events) {
      if (e.type === 'unlock' && e.abilities && e.abilities.length) showAbility(e.abilities);
      else if (e.type === 'blocked' && e.ability) {
        const t = performance.now(), k = e.ability;
        if (!(t - (blockedAt[k] || -1e9) < 6000)) { blockedAt[k] = t; hint('blocked_' + k); }
      }
    }
  }

  return {
    showTitle(save) { save = save || (api.getSave && api.getSave()) || {}; if (save.mute != null) this.setMute(!!save.mute); if (save.left != null) this.setLeft(!!save.left); loading.set(1); title.show(save); },
    hideTitle() { title.hide(); },
    showHUD(k) { kind = k === 'sea' ? 'sea' : 'fire'; root.classList.toggle('d-sea', kind === 'sea'); hud.show(kind); },
    hideHUD() { hud.hide(); baseHint = null; wantHint = null; abil = null; clearTimeout(tempT); tempT = 0; clearTimeout(hideT); hideT = 0; render(null, true); abQ.length = 0; stopAbility(); },
    update(S, dt, events) { hud.update(S, dt, events); if (S && !hud.el.hidden) watch(S, events); },
    showPause() { menu.show(kind); },
    hidePause() { menu.hide(); },
    showCodex(save) { codex.show(save); },
    hideCodex() { codex.hide(); },
    showResult,
    hideResult() { clearTimeout(resT); resT = 0; result.hide(); if (resOpen) { resOpen = false; setTimeout(nextAbility, 350); } },
    showAbility,
    get abilityLeft() { return abilityLeft(); },
    toast,
    hint,
    setLoading(p, text) { loading.set(p, text); },
    setTemp(on) { hud.setTemp(!!on); },
    setMute(b) { mute = !!b; hud.setMute(mute); title.setMute(mute); menu.setMute(mute); },
    setLeft(b) { left = !!b; G.left = left; root.classList.toggle('d-left', left); menu.setLeft(left); },
    dragging(b) { root.classList.toggle('d-drag', !!b); },
    get mute() { return mute; }, get left() { return left; },
    _result: result,   // 测试页用（画分享卡）
  };
}
