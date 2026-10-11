// 界面实机：进化流程（真实时间节奏，界面的计时用 performance.now）。大字 → 新能力卡 → 提示的先后、卡片上有没有压着标记、结算卡、继续后重放。
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/ui_evo.js --query "autostart&kind=fire&stage=0" --size 562x1058 --out .cache/rec/uiv4/evo_fire0
// （--size 562x1058 实际是 540×960 的页面；382x738 → 500×640 的页面，中间 360×640 是游戏）
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'fire', stage = +(Q.get('stage') || 0);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const { STAGE_PTS } = await import('/src/config/dragons.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await wait(() => window.__dg && window.__dg.ready);
await document.fonts.ready;
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 5), fps = 30;
D.save.tut = Object.assign(D.save.tut || {}, { drag: 1 });
const hints = [], over = [];
const h0 = D.ui.hint.bind(D.ui); D.ui.hint = n => { hints.push([+D.S.t.toFixed(1), n]); return h0(n); };
const root = document.querySelector('.dui');
const vis = e => !e.hidden && +getComputedStyle(e).opacity > .05 && getComputedStyle(e).visibility !== 'hidden';
// 新能力卡在的时候：屏幕标记（箭头 / 「!」/ 小牌）有没有压在卡片上；提示有没有和大字 / 卡片同时出
function check(t) {
  const ab = document.querySelector('.d-abil'), toast = document.querySelector('.d-toast'), hint = document.querySelector('.d-hint');
  const abOn = ab && vis(ab), toastOn = +getComputedStyle(toast).opacity > .05, hintOn = vis(hint);
  if (hintOn && (abOn || toastOn)) over.push(`${t}: hint ${hint.className} with ${abOn ? 'card' : 'toast'}`);
  if (!abOn) return;
  const r = ab.getBoundingClientRect();
  for (const m of document.querySelectorAll('.d-marks > div')) {
    if (+m.style.opacity < .05 || m.classList.contains('d-lock') || m.classList.contains('d-ring')) continue;
    const q = m.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2;
    if (x > r.left && x < r.right && y > r.top - 10 && y < r.bottom + 10) over.push(`${t}: ${m.className} at ${Math.round(x)},${Math.round(y)} over card ${Math.round(r.top)}-${Math.round(r.bottom)}`);
  }
}
async function play(secs, real = true) {
  for (let i = 0; i < secs * fps; i++) {
    const o = bot(D.S);
    D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
    D.frame(1 / fps);
    if (real) { check(Math.round(performance.now() - (window.__t0 || 0))); await sleep(1000 / fps - 8); }
  }
}
const tag = kind + stage;
await play(5, false);
await play(.5);
await __shot('a_hud_' + tag);
D.give(STAGE_PTS[stage + 1] - D.S.pts + 1);
const t0 = window.__t0 = performance.now();
const marks = [400, 1200, 1900, 2600, 3300, 4100, 5000, 6000];
let mi = 0, resAt = 0;
while (mi < marks.length) {
  await play(1 / fps * 3);
  const el = performance.now() - t0;
  const rs = document.querySelector('.d-result');
  if (!resAt && rs && !rs.hidden) resAt = Math.round(el);
  if (el >= marks[mi]) {
    const ab = document.querySelector('.d-abil'); const r = ab && !ab.hidden ? ab.getBoundingClientRect() : null;
    __log(`t=${Math.round(el)} stage=${D.S.stage} state=${D.state} abil=${r ? Math.round(r.top) + '-' + Math.round(r.bottom) : 'none'} abilityLeft=${D.ui.abilityLeft.toFixed(2)} result=${rs && !rs.hidden} hint=${document.querySelector('.d-hint').hidden ? '-' : document.querySelector('.d-hint').className}`);
    await __shot(`b_evo_${tag}_${marks[mi]}`); mi++;
  }
}
if (resAt) __log(`result card opened at ${resAt} ms (state pause from main)`);
const rs = document.querySelector('.d-result');
if (rs && !rs.hidden) {
  const b = rs.querySelector('.d-main'); const r = b.getBoundingClientRect();
  const o = { pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true };
  b.dispatchEvent(new PointerEvent('pointerdown', o)); b.dispatchEvent(new PointerEvent('pointerup', o));
  const t1 = performance.now(); let k = 0;
  while (performance.now() - t1 < 3600) { await play(1 / fps * 3); if (k < 3 && performance.now() - t1 > [600, 1500, 2600][k]) { await __shot('c_after_continue_' + tag + '_' + k); k++; } }
}
await play(20, false);
await play(.6); await __shot('d_late_' + tag);
__log('hints ' + JSON.stringify(hints));
__log('overlaps ' + (over.length ? over.slice(0, 12).join(' | ') + (over.length > 12 ? ` (+${over.length - 12})` : '') : 'none'));
await __done();
