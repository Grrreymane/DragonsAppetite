// 界面第四轮实机检查（带 DOM 界面）：机器人玩 N 秒，每 0.25 秒看一次屏幕上的标记（边缘箭头 / 头顶箭头 / 天敌「!」/ 大家伙小牌）
// 有没有压在顶栏、小目标卡、连吃上；海龙幼龙时「跃出」教学提示该不该出；最后截 HUD / 冷却 / 新能力卡。
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/ui_v4.js --query "kind=sea&stage=0&secs=60" --size 562x1058 --out .cache/rec/uiv4/sea0
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'fire', stage = +(Q.get('stage') || 0), SECS = +(Q.get('secs') || 40);
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await wait(() => window.__dg && window.__dg.ready);
await document.fonts.ready;
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 7), fps = 30;
D.save.tut = Object.assign(D.save.tut || {}, { drag: 1 });
const tag = kind + stage;
const ui = document.querySelector('.dui');
const box = sel => { const e = ui.querySelector(sel); if (!e || e.hidden || e.offsetParent === null) return null; const cs = getComputedStyle(e); if (+cs.opacity < .05) return null;
  let x = e.offsetLeft, y = e.offsetTop; for (let p = e.offsetParent; p && p !== ui; p = p.offsetParent) { x += p.offsetLeft; y += p.offsetTop; }
  return { x, y, w: e.offsetWidth, h: e.offsetHeight + 3, sel }; };
const marks = () => [...ui.querySelectorAll('.d-marks > .d-arw, .d-marks > .d-bang, .d-marks > .d-tag')].filter(e => +e.style.opacity > .05).map(e => {
  const m = /translate\((-?[\d.]+)px, ?(-?[\d.]+)px\)/.exec(e.style.transform); return m && { cls: e.className, x: +m[1], y: +m[2], r: e.classList.contains('d-tag') ? 13 : 16 };
}).filter(Boolean);
let checks = 0, hits = 0, shots = 0, hintBad = 0;
const hitList = [];
async function play(secs, ctl) {
  for (let i = 0; i < secs * fps; i++) {
    const o = bot(D.S);
    if (ctl) Object.assign(o, ctl(i / fps, o) || {});
    D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
    D.frame(1 / fps);
    if (i % 8 === 0) await inspect();
  }
}
async function inspect() {
  checks++;
  const zones = ['.d-goal', '.d-combo', '.d-next', '.d-gbar', '.d-cbar'].map(box).filter(Boolean);
  for (const m of marks()) for (const z of zones) {
    if (m.x + m.r > z.x && m.x - m.r < z.x + z.w && m.y + m.r > z.y && m.y - m.r < z.y + z.h) {
      hits++; hitList.push(`${D.S.t.toFixed(1)}s ${m.cls}@${Math.round(m.x)},${Math.round(m.y)} on ${z.sel}`);
      if (shots < 3) { shots++; await __shot(`hit_${tag}_${shots}`); }
    }
  }
  // 海龙 / 火龙幼龙：还没学会跃出 / 扎水，教学提示不该出（「长大后学会」除外）
  const h = ui.querySelector('.d-hint');
  if (h && !h.hidden && /h-(breach|plunge)\b/.test(h.className) && D.S.abilities && !D.S.abilities.includes(/h-breach/.test(h.className) ? 'breach' : 'plunge')) hintBad++;
}
await play(3);
await __shot('hud_' + tag);
await play(SECS - 3);
__log(`${tag} checks=${checks} markerHits=${hits} badTutorialHint=${hintBad}`);
for (const l of hitList.slice(0, 12)) __log('  ' + l);
// 冷却：海龙冲刺 / 成龙技能
if (kind === 'sea') { await play(.2, () => ({ actTap: true })); await play(.9); await sleep(250); await __shot('dash_cd_' + tag); }
if (stage === 2) { await play(.2, () => ({ skillTap: true })); await play(4); await sleep(250); await __shot('skill_cd_' + tag); __log('skill ' + JSON.stringify(D.S.hero.skill)); }
// 进化：给够分数升一级，看阶段名大字 → 新能力卡（真正的 unlock 事件）
if (stage < 2) {
  D.give(400); await play(.2);
  for (let i = 0; i < 8; i++) { await play(.5); await sleep(60); await __shot(`evo_${tag}_${i}`); }
}
await __done();
