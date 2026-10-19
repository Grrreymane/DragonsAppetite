// 远处的生命（view/ambient.js）检查：强制安排鲸 / 海豚 / 鸟群 / 魔鬼鱼 / 海龟 / 水母，逐个录下来，并量绘制调用 / 三角面。
// part=fire  火龙 60 米高平飞：跃身击浪、换气举尾、海豚群、鸟群（人字 + 松散）
// part=sea   海龙水下：鲸滑过、魔鬼鱼、海龟、海豚从头顶过；再浮到水面看跃身
// part=night 海龙水下夜里（加 ?tod=0.75）：发光水母、荧光
// part=auto  不强制，导演自己安排（看频率）
//   python tools/rec3d.py --director tools/scenarios/ambient_check.js --query "kind=fire&part=fire" --sheet 1 --out .cache/amb/fire.mp4
const Q = new URLSearchParams(location.search), part = Q.get('part') || 'fire', fps = 30, VID = !Q.has('shots');
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__amb);
window.__pause = true;
if (Q.has('tod') && window.__env) { window.__env.fixed = true; window.__env.f = +Q.get('tod'); }
const D = window.__dg, A = window.__amb, S = D.S;
const { groundAt, seabedY } = await import('/src/sim/world.js');
const info = () => { const i = D.renderer.info.render; return { calls: i.calls, tris: i.triangles }; };

// 找一片开阔的海：沿 +z 800 米都没有岛、水够深
function openSea(y) {
  for (let k = 0; k < 400; k++) {
    const x = (k % 20) * 120 - 1200, z = Math.floor(k / 20) * 120 - 1200;
    let ok = true;
    for (let d = -60; d < 900 && ok; d += 15) for (const o of [-120, -60, 0, 60, 120]) if (groundAt(x + o, z + d) > Math.min(y, 0) - 30 || seabedY(x + o, z + d) > -26) { ok = false; break; }
    if (ok) return [x, z];
  }
  return [0, 0];
}
const y0 = part === 'fire' ? 60 : part === 'surf' ? 4 : -14;
const [x0, z0] = Q.has('x') ? [+Q.get('x'), +Q.get('z')] : openSea(0);
__log(`start at ${x0}, ${z0}`);
D.teleport(x0, y0, z0); S.hero.yaw = 0; S.hero.pitch = 0;
A.auto = part === 'auto'; A.clear();
D.input.jx = 0; D.input.jy = 0;
const hold = () => { if (part === 'fire') { S.hero.y += (y0 - S.hero.y) * .1; } else if (part === 'surf') { S.hero.y = 4; S.hero.py = 4; } else { S.hero.y += (y0 - S.hero.y) * .1; } S.hero.yaw *= .9; S.hero.pitch *= .9; };
async function play(secs, tag) {
  for (let i = 0; i < secs * fps; i++) {
    hold(); D.frame(1 / fps);
    if (Q.has('where') && i % 15 === 0) { const W = A.where(), V3 = D.camera.position.constructor, pr = p => { const v = new V3(...p).project(D.camera); return [+v.x.toFixed(2), +v.y.toFixed(2), Math.round(D.camera.position.distanceTo(new V3(...p)))]; }; __log(tag + ' ' + (i / fps).toFixed(1) + ' w ' + JSON.stringify(W.whales.map(pr)) + ' p ' + JSON.stringify(W.pods.map(pr))); }
    if (VID) await __frame(); else if (i % 15 === 0) await __shot(tag + '_' + String(i).padStart(4, '0'));
  }
  // 同一帧：开 / 关本模块各画一次，差值 = 本模块的绘制调用 / 三角面
  const on = info(), amb = D.scene.getObjectByName('ambient'); amb.visible = false; D.render(); const offI = info(); amb.visible = true; D.render();
  const st = A.stats();
  __log(`${tag}: +calls ${on.calls - offI.calls} +tris ${on.tris - offI.tris} (total ${on.calls}/${on.tris}) ${JSON.stringify({ w: st.whales, pods: st.pods, fl: st.flocks, sc: st.schools, j: st.jellies, sp: st.splash, gl: st.glow })}`);
}
for (let i = 0; i < 20; i++) { hold(); D.frame(1 / fps); }
// 量：关掉 / 打开
A.off = true; D.frame(1 / fps); const base = info(); A.off = false; D.frame(1 / fps);
__log(`baseline (ambient off): ${JSON.stringify(base)}`);

if (part === 'fire') {
  A.spawn('breach', { a: .06, force: true }); await play(6.5, 'breach');
  A.clear(); A.spawn('surface', { a: -.06, force: true }); await play(11, 'surface');
  A.clear(); A.spawn('dolphins', { a: .05, force: true }); await play(8, 'dolphins');
  A.clear(); A.spawn('birds', { d: 120, a: .15, style: 'v', n: 30, dark: true, y: S.hero.y + 14, force: true }); await play(6, 'birdsV');
  A.clear(); A.spawn('birds', { d: 120, a: -.15, style: 'loose', n: 40, dark: false, y: S.hero.y + 10, force: true }); await play(6, 'birdsLoose');
  // 全开：量最坏的绘制调用
  A.clear(); A.spawn('breach', { d: 170, force: true }); A.spawn('surface', { d: 120, force: true }); A.spawn('dolphins', { d: 75, force: true }); A.spawn('dolphins', { d: 90, force: true });
  A.spawn('birds', { d: 120, n: 50, y: S.hero.y + 10, force: true }); A.spawn('birds', { d: 140, n: 50, y: S.hero.y + 20, force: true });
  await play(2, 'all-fire');
} else if (part === 'sea') {
  A.spawn('glide', { a: .22, force: true }); await play(10, 'glide');
  A.clear(); A.spawn('manta', { a: -.22, force: true }); await play(8, 'manta');
  A.clear(); A.spawn('turtle', { a: .12, force: true }); await play(7, 'turtle');
  A.clear(); A.spawn('dolphins', { a: .05, force: true }); await play(7, 'dolphinsUnder');
  A.clear(); A.spawn('glide', { force: true }); A.spawn('manta', { d: 45, force: true }); A.spawn('turtle', { d: 35, force: true }); A.spawn('dolphins', { force: true });
  for (let i = 0; i < 18; i++) A.spawn('jelly', { force: true });
  await play(2, 'all-sea');
} else if (part === 'night') {
  await play(12, 'jellies');
} else if (part === 'surf') {
  // 海龙浮在水面：看跃身和海豚
  S.hero.y = 0.5;
  A.spawn('breach', { d: 150, a: .22, force: true }); await play(6, 'surfBreach');
  A.clear(); A.spawn('dolphins', { d: 60, a: -.2, force: true }); await play(6, 'surfDolphins');
} else {
  await play(90, 'auto');
  __log(JSON.stringify(A.stats().log));
}
await __done();
