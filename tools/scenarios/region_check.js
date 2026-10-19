// 区域名：从翠岛海瞬移到熔岩海 / 外海，飞几秒，截图（--dom 带界面）
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__env);
window.__pause = true;
const D = window.__dg; D.S.hunt = null; D.S.huntNext = 1e9;
const fly = async (n, shotAt) => { for (let i = 0; i < n; i++) { D.input.jx = 0; D.input.jy = 0; D.frame(1 / 30); if (shotAt.includes(i)) await __shot('r' + String(++k).padStart(2, '0')); await new Promise(r => setTimeout(r, 33)); } };
let k = 0;
await fly(30, []);
D.teleport(-900, 40, 900); D.S.hero.yaw = 0;
await fly(150, [95, 120]);
D.teleport(-840, 40, -960);
await fly(150, [95, 140]);
await __done();
