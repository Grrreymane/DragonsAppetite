// 瘦身后的 glb 走游戏的 dragon.js（配 _lab/pipedoc_game_slim.html）：几种状态各拍一张，有报错 rec3d 会打印 ERR
//   python tools/rec3d.py --page _lab/pipedoc_game_slim.html --director tools/scenarios/pipedoc_game_slim.js --query "m=fire_baby" --size 540x540 --out .cache/check/pipedoc/game_fire_baby
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 50); k(); });
await wait(() => window.__lab && window.__lab.ready);
const L = window.__lab, fire = L.man.kind === 'fire';
__log(`file ${L.file}  clips ${Object.keys(L.D.act).join(',')}`);
const states = fire
  ? [['fly', { flyW: 1, tuck: 0, yawRate: 0 }], ['glide_tuck', { flyW: 0, tuck: .9 }], ['turn', { flyW: 1, tuck: 0, yawRate: .9 }]]
  : [['swim', { dashT: 0, medium: 'water', yawRate: 0 }], ['dash', { dashT: 1 }], ['air_glide', { dashT: 0, medium: 'air' }], ['turn', { medium: 'water', yawRate: .9 }]];
for (const [name, st] of states) {
  for (let i = 0; i < 40; i++) L.tick(1 / 30, st);
  L.shot(2.2); await __shot(name);
}
for (let i = 0; i < 60; i++) L.tick(1 / 30, { yawRate: 0 });
L.shot(-1.2); await __shot('back_view');
await __done();
