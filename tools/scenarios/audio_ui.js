// 声音试验页的界面截图（结果表是画布，导演脚本先跑离线检测再截）
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (!window.__audioLab) await sleep(50);
__log('inner ' + innerWidth + 'x' + innerHeight + ' doc ' + document.documentElement.scrollWidth);
await window.__audioLab.runTests(['flap', 'eat', 'eat_combo9', 'splash', 'splash_under', 'evolve', 'fire_loop', 'music_sky', 'music_sea']);
await __shot('ui_results_' + innerWidth);
await __done();
