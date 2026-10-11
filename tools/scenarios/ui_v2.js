// 界面 v2 实机截图（带 DOM 界面）：HUD（各阶段）、技能键冷却、锁定圈、新能力卡、长大后学会、暂停、图鉴、结算、标题。
//   python tools/rec3d.py --dom --page index.html --director tools/scenarios/ui_v2.js --query "kind=fire&stage=2" --size 540x960 --out .cache/rec/ui_v2/fire2
// URL：kind=fire|sea，stage=0..2，menus=1 再截暂停 / 图鉴 / 结算 / 标题
const Q = new URLSearchParams(location.search);
const kind = Q.get('kind') || 'fire', stage = +(Q.get('stage') || 0), MENUS = Q.has('menus');
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const { ABILITIES } = await import('/src/config/dragons.js');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await wait(() => window.__dg && window.__dg.ready);
await document.fonts.ready;
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 99), fps = 30;
D.save.tut = Object.assign(D.save.tut || {}, { drag: 1 });   // 不要「按住拖动」挡画面
async function play(secs, ctl) {
  for (let i = 0; i < secs * fps; i++) {
    const o = bot(D.S);
    if (ctl) Object.assign(o, ctl(i / fps, o) || {});
    D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = !!o.act; if (o.actTap) D.input.actTap = true; if (o.skillTap) D.input.skillTap = true;
    D.frame(1 / fps);
  }
}
const tag = kind + stage;
await play(4, () => ({ skillTap: false }));
__log(`${tag} lock=${D.S.hero.lock} skill=${JSON.stringify(D.S.hero.skill)} next=${D.S.nextAbilities} goal=${D.S.goal && D.S.goal.type}`);
await __shot('hud_' + tag);
// 找一只能锁定的：等锁定圈出现
for (let i = 0; i < 12 && !D.S.hero.lock; i++) await play(.5, () => ({ skillTap: false }));
await sleep(250); await __shot('lock_' + tag);
if (stage === 2) {
  await play(.2, () => ({ skillTap: true })); await play(.6);
  __log('skill after tap ' + JSON.stringify(D.S.hero.skill));
  await sleep(150); await __shot('skill_on_' + tag);
  await play(3); await __shot('skill_cd_' + tag);
}
if (stage === 0) {
  D.ui.hint('blocked_' + (kind === 'fire' ? 'plunge' : 'breach')); await play(.3); await sleep(300);
  await __shot('blocked_' + tag); D.ui.hint(null);
}
// 新能力卡（进化时主程序会调；这里直接调）
const unlock = (kind === 'fire' ? [['bite', 'flame'], ['plunge'], ['roar', 'gulp']] : [['bite', 'dash'], ['breach'], ['vortex', 'gulp']])[stage];
D.ui.showAbility(unlock.map(id => ({ id, ...ABILITIES[id] })));
await play(.3); await sleep(700); await __shot('ability_' + tag);
await sleep(2600);
if (MENUS) {
  D.ui.showPause(); await sleep(450); await __shot('pause_' + tag);
  D.ui.showCodex(D.save); await sleep(450); await __shot('codex_' + tag); D.ui.hideCodex(); D.ui.hidePause();
  D.ui.showResult({ kind, timeSec: 431, eaten: 158, codexN: 9, codexMax: 12, stageName: '成龙' }, () => {}); await sleep(450); await __shot('result_' + tag); D.ui.hideResult();
  D.ui.hideHUD(); D.ui.showTitle(D.save); await sleep(600); await __shot('title_' + tag);
}
await __done();
