// 界面实机：机器人玩 60 秒（ui.update 耗时、「长大后学会」次数），技能提示，再隔一会儿截一张（贴边箭头 / 锁定圈 / 小目标卡）。
// 锁定圈：记录锁定的猎物离嘴多远、圈的透明度（离嘴不到 2 个 mouthR 应该淡掉）
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/ui_misc.js --query "autostart&kind=sea&stage=0" --size 382x738 --out .cache/rec/uiv4/misc_sea0
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'fire', stage = +(Q.get('stage') || 0);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await wait(() => window.__dg && window.__dg.ready);
await document.fonts.ready;
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[2], 11), fps = 30;
D.save.tut = Object.assign(D.save.tut || {}, { drag: 1 });
const blocked = []; let ut = 0, un = 0, umax = 0;
const lk = { all: 0, allOn: 0, near: 0, nearOn: 0, far: 0, farOn: 0 };
const lockEl = document.querySelector('.d-lock');
const u0 = D.ui.update.bind(D.ui);
D.ui.update = (S, dt, ev) => {
  const t = performance.now(); u0(S, dt, ev); const d = performance.now() - t; ut += d; un++; if (d > umax) umax = d;
  if (ev) for (const e of ev) if (e.type === 'blocked') blocked.push([+S.t.toFixed(1), e.ability]);
  const h = S.hero, c = h.lock && S.creatures.find(o => o.id === h.lock);
  if (c && h.mouth) {
    const dm = Math.hypot(c.x - h.mouth.x, c.y - h.mouth.y, c.z - h.mouth.z), mR = S.cfg.mouthR * (h.sizeK || 1), op = +lockEl.style.opacity || 0;
    lk.all++; if (op > .3) lk.allOn++;
    if (dm < 2 * mR) { lk.near++; if (op > .3) lk.nearOn++; } else if (dm > 4 * mR) { lk.far++; if (op > .3) lk.farOn++; }
  }
};
async function play(secs, real) {
  for (let i = 0; i < secs * fps; i++) {
    const o = bot(D.S);
    D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
    D.frame(1 / fps); if (real) await sleep(25);
  }
}
const tag = kind + stage + (Q.has('left') ? '_L' : '');
await play(60, false);
__log(`${tag} blocked in 60s: ${JSON.stringify(blocked)}  ui.update avg ${(ut / un).toFixed(3)}ms max ${umax.toFixed(2)}ms`);
__log(`${tag} lock ring: locked frames ${lk.all} (ring visible ${lk.allOn}); near-mouth ${lk.near} (visible ${lk.nearOn}); far >4 mouthR ${lk.far} (visible ${lk.farOn})`);
if (Q.has('left')) D.ui.setLeft(true);
if (stage === 2) { D.ui.hint('skill'); await play(1.2, true); await __shot('skillhint_' + tag); D.ui.hint(null); }
for (let i = 0; i < 6; i++) { await play(2.5, false); await play(.4, true); await __shot('t' + i + '_' + tag); }
await __done();
