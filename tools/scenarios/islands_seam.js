const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready);
window.__pause = true;
const D = window.__dg;
const { islands, islandPos } = await import('/src/sim/world.js');
async function run(n) { for (let i = 0; i < n; i++) { D.input.jx = 0; D.input.jy = 0; D.input.btn = false; D.frame(1 / 30); } }
for (const id of (Q.get('ids') || '19,6,2').split(',').map(Number)) {
  const is = islands[id];
  for (const [tag, y, dk] of [['s', -3, 1.6], ['m', -8, 1.4]]) {
    const h0 = D.S.hero, p = islandPos(is, h0.x, h0.z), ang = id * 1.3;
    const dist = is.r * dk + 18, x = p.x + Math.sin(ang) * dist, z = p.z + Math.cos(ang) * dist;
    D.teleport(x, y, z); const h = D.S.hero; h.yaw = Math.atan2(p.x - x, p.z - z); h.pitch = 0;
    await run(30); window.__pause = true;
    await __shot(`seam${id}_${tag}_a`);
    const hulls = []; D.scene.traverse(o => { if (o.isMesh && o.material && o.material.customProgramCacheKey && /outline.*isl|isl.*outline/i.test(o.material.customProgramCacheKey()) ) hulls.push(o); });
    if (!hulls.length) D.scene.traverse(o => { if (o.isMesh && o.parent && o.parent.isMesh && o.material && o.material.side === 1) hulls.push(o); });
    hulls.forEach(o => o.visible = false); D.render(); await __shot(`seam${id}_${tag}_b_nohull`); hulls.forEach(o => o.visible = true);
    __log(`id ${id} ${is.shape} tag ${tag} hulls ${hulls.length} hero y ${h.y.toFixed(1)}`);
  }
}
await __done();
