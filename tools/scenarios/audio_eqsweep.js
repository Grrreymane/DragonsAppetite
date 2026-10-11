// 手机上「大技能 vs 背景」的扫参：曲子总线的均衡（E.musEq）。
//   python tools/rec3d.py --page _lab/audio.html --director tools/scenarios/audio_eqsweep.js --query "nogesture&v=<JSON>" --out <目录>
//   v = [[均衡 dB, 中心 Hz, Q], ...]；打出龙吼 / 漩涡 / 巡航 / 水下的耳机响度和手机模型响度，GAP = 手机上技能比背景高多少
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (!window.__audioLab) await sleep(50);
const { renderOffline } = await import('../src/sys/audio.js');
const L = window.__audioLab, db = x => 20 * Math.log10(x + 1e-9), f1 = x => db(x).toFixed(1);
const scenes = {
  roar: [3, E => E.play('roar', {}, .05)],
  vortex: [3, E => E.play('vortex', {}, .05)],
  cruise: [10, E => { E.setMix(0, 0, 0); E.musicTick(10); for (let t = 0; t <= 10; t += .05) E.setLoops({ wind: .39, windK: 1, gust: .5 + .5 * Math.sin(t * .63) * Math.sin(t * 1.37 + 1) }, t); for (let t = .5; t < 10; t += 1) E.play('flap', { pitch: .92 }, t); }],
  seaU: [10, E => { E.setUnder(1, 0); E.setMix(1, 1, 0); E.musicTick(10); for (let t = 0; t <= 10; t += .05) E.setLoops({ amb: 1 }, t); }],
};
const V = JSON.parse(new URLSearchParams(location.search).get('v') || '[[0,1000,0.7],[7,1000,0.7]]');
for (const [g, f, q] of V) {
  const r = {};
  for (const [n, [dur, fn]] of Object.entries(scenes)) {
    const { buf } = await renderOffline(dur, E => { E.musEq.gain.value = g; E.musEq.frequency.value = f; E.musEq.Q.value = q; fn(E); });
    r[n] = L.stats(buf);
  }
  __log(`eq+${g}@${f}Q${q}: roar st ${f1(r.roar.st)} ph ${f1(r.roar.ph)} | vortex st ${f1(r.vortex.st)} ph ${f1(r.vortex.ph)} | cruise ${f1(r.cruise.rms)} ph ${f1(r.cruise.phRms)} | seaU ${f1(r.seaU.rms)} ph ${f1(r.seaU.phRms)} || GAP roar ${(db(r.roar.ph) - db(r.cruise.phRms)).toFixed(1)} vortex ${(db(r.vortex.ph) - db(r.seaU.phRms)).toFixed(1)} vs ${(db(r.vortex.ph) - db(r.roar.ph)).toFixed(1)} | hp gap roar ${(db(r.roar.st) - db(r.cruise.rms)).toFixed(1)} vortex ${(db(r.vortex.st) - db(r.seaU.rms)).toFixed(1)}`);
}
await __done();
