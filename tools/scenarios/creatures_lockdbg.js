// 生物模块调试：锁定的猎物有没有被画出来（水面剔除 / 画面外剔除是否误伤）
const { makeBot, TIERS } = await import('/src/sim/bot.js');
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 1234), fps = 30;
const root = D.scene.getObjectByName('creatures');
for (let i = 0; i < 12 * fps; i++) {
  const o = bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true;
  D.frame(1 / fps);
  if (i % 5 === 0 && D.S.hero.lock) {
    const c = D.S.creatures.find(c => c.id === D.S.hero.lock); if (!c) continue;
    const m = root.getObjectByName('cr_' + c.sp); let found = false;
    for (let k = 0; k < m.count; k++) { const a = m.instanceMatrix.array; if (Math.hypot(a[k * 16 + 12] - c.x, a[k * 16 + 13] - c.y, a[k * 16 + 14] - c.z) < 2) found = true; }
    __log(`t=${(i / fps).toFixed(1)} lock ${c.sp} y=${c.y.toFixed(1)} size=${c.size.toFixed(2)} drawn=${found} cam.y=${D.camera.position.y.toFixed(1)} hero ${D.S.hero.medium} y=${D.S.hero.y.toFixed(1)} uw=${root.userData.api.underwater.toFixed(2)}`);
  }
}
await __done();
