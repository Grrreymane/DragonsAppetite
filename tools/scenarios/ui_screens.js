// 界面试验页 _lab/ui.html：挨个打开所有画面 + 跑一段动起来的 HUD，看有没有报错（ERR）
//   python tools/rec3d.py --page _lab/ui.html --director tools/scenarios/ui_screens.js --size 540x960 --out .cache/rec/ui
// 注意：__shot 只截画布（界面是 DOM，截不到），整页截图用无头 Chrome 的 CDP（见 ui.js 汇报）
const wait = () => new Promise(r => { const k = () => window.__labReady ? r() : setTimeout(k, 100); k(); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await wait();
for (const n of ['load', 'title', 'title-new', 'hud', 'hud-cross', 'hud-sea', 'hud-adult', 'hud-left', 'pause', 'codex', 'result', 'result-sea', 'toast']) {
  LAB.go(n); await sleep(300); __log('screen ' + n + ' ok');
}
await LAB.drawCard(); __log('share card ok');
// 动起来：真实帧循环跑 6 秒（箭头、天敌、跨界圈、连吃、小目标都会轮一遍）
LAB.go('live'); await sleep(6000);
const S = LAB.S; __log('live t=' + S.t.toFixed(1) + ' pts=' + S.pts + ' goal=' + S.goal.have + '/' + S.goal.n);
// 手动塞一串事件
LAB.ui.update(S, 1 / 60, [{ type: 'codex', sp: 'gull' }, { type: 'bite', lost: 3 }, { type: 'goal', idx: 0 }, { type: 'eat', sp: 'sparrow', combo: 3 }]);
LAB.ui.toast('成龙'); LAB.ui.hint('breach'); await sleep(800); LAB.ui.hint(null);
LAB.ui.setMute(true); LAB.ui.setLeft(true); LAB.ui.dragging(true); await sleep(200); LAB.ui.dragging(false); LAB.ui.setLeft(false);
LAB.ui.setLoading(.3, '加载中'); LAB.ui.setLoading(1);
LAB.ui.hideHUD(); LAB.ui.update(S, 1 / 60, []);   // 隐藏时 update 不该干活
await __shot('ui_end');
__log('done ok');
await __done();
