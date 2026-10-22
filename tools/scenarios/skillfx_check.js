// 技能特效：海龙放漩涡（没鱼也看得到）、冲刺；连续跃出水面（看镜头晕不晕）；火龙龙吼。?part=sea|breach|fire
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, S = D.S, part = Q.get('part') || 'sea';
S.hunt = null; S.huntNext = 1e9; S.leaderNext = 1e9;
if (window.__env) { window.__env.fixed = true; window.__env.f = .2; }
const run = async (n, fn, shots = []) => { for (let i = 0; i < n; i++) { D.input.jx = 0; D.input.jy = 0; fn && fn(i); D.frame(1 / 30); if (!Q.has('noframes')) await __frame(); if (shots.includes(i)) await __shot(part + '_' + String(i).padStart(3, '0')); } };
if (part === 'sea') {
  S.creatures.length = 0;   // 没有鱼：看漩涡本身的反馈
  await run(20);
  await run(80, i => { if (i === 2) D.input.skillTap = true; }, [8, 25, 50]);
  await run(60, i => { if (i === 5) D.input.actTap = true; }, [8, 20, 40]);
} else if (part === 'breach') {
  // 连续跃出：贴着水面，一直往上拉
  D.teleport(S.hero.x, -3, S.hero.z);
  await run(300, i => { D.input.jy = (i % 50) < 22 ? -1 : .6; if (i % 50 === 0) D.input.actTap = true; }, [30, 60, 90, 120, 150, 180]);
} else {
  await run(20);
  await run(50, i => { if (i === 2) D.input.skillTap = true; }, [6, 14, 24]);
}
await __done();
