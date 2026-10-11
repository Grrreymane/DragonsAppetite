// 生物试验页的截图：图鉴（天空 / 水下）、转台、动作相位、小图、鸟群性能
const wait = () => new Promise(r => { const k = () => window.__cr && window.__cr.ready ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const C = window.__cr;
const only = new URLSearchParams(location.search).get('only') || '';
const want = k => !only || only.split(',').includes(k);
{ let tot = 0; const rows = []; for (const sp in C.cr.species) { const b = C.cr.species[sp]; rows.push(sp + ' ' + b.m.tris + '/' + b.cap); tot += b.m.tris * 2 * b.cfg.max; } __log('TRIS ' + rows.join(', ') + ' | worst-case all max (body+outline) ' + tot); }
if (want('gallery')) for (const bg of ['sky', 'sea']) for (const page of ['0', '1']) {
  C.set('gallery', bg, page); C.step(8, 1 / 30); await __shot(`gallery_${bg}_${page}`);
}
if (want('states')) for (const bg of ['sky', 'sea']) for (const page of ['0', '1']) {
  C.set('states', bg, page); C.step(8, 1 / 30); await __shot(`states_${bg}_${page}`);
}
if (want('all')) { C.set('gallery', 'sky', 'all'); C.step(5, 1 / 30); await __shot('gallery_sky_all'); C.set('gallery', 'sea', 'all'); C.step(5, 1 / 30); await __shot('gallery_sea_all'); }
if (want('zoo')) for (const bg of ['sky', 'sea']) {
  C.set('zoo', bg); for (let i = 0; i < 3; i++) { C.step(i ? 40 : 2, 1 / 30); await __shot(`zoo_${bg}_${i}`); }
}
if (want('phases')) for (const sp of (new URLSearchParams(location.search).get('sp') || 'gull').split(',')) {
  C.set('phases', ['manta', 'sardine', 'jelly', 'squid', 'turtle', 'shark', 'flyfish'].includes(sp) ? 'sea' : 'sky', sp); C.step(1, 0); await __shot('phases_' + sp);
}
if (want('portrait')) { await C.set('portrait', 'sky'); await new Promise(r => setTimeout(r, 300)); await __shot('portraits'); }
if (want('flock')) {
  C.set('flock', 'sky'); C.step(30, 1 / 30); await __shot('flock');
  C.hideSky(true); const i = C.info(); C.hideSky(false);
  __log('FLOCK creatures-only render: calls ' + i.calls + ' tris ' + i.tris + ' | cr.stats ' + JSON.stringify(i.cr) + ' | update ' + i.updMs.toFixed(3) + 'ms');
  const t0 = performance.now(); for (let k = 0; k < 200; k++) C.cr.update(C.S, 1, 1 / 60, k / 60); __log('update x200 avg ' + ((performance.now() - t0) / 200).toFixed(3) + 'ms');
}
if (want('game')) for (const bg of ['sky', 'sea']) { C.set('game', bg); C.step(20, 1 / 30); await __shot('game_' + bg); C.step(25, 1 / 30); await __shot('game_' + bg + '_2'); }
__log('done ok');
await __done();
