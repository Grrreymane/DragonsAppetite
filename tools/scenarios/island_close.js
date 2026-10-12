// 贴近绿岛看树和草（查白缝）
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg, S = D.S;
const { islands } = await import('/src/sim/world.js');
const is = islands.find(i => i.kind === 'green');
const ang = .6, r = (is.r || 40) * 1.3;
D.teleport(is.x - Math.sin(ang) * r, 22, is.z - Math.cos(ang) * r); S.hero.yaw = ang; S.hero.pitch = -.15;
for (let i = 0; i < 40; i++) D.frame(1 / 30);
await __shot('a');
for (let i = 0; i < 25; i++) D.frame(1 / 30);
await __shot('b');
await __done();
