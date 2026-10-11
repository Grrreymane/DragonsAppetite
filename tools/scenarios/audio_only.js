// 只重渲几项离线声音测试（改了一个音效时比整套 audio_test.js 快）：?only=名字,名字（_lab/audio.html 的 TESTS 里的名字）
//   python tools/rec3d.py --page _lab/audio.html --director tools/scenarios/audio_only.js --query "nogesture&only=music_sea,blocked" --out .cache/audio/only
//   WAV 存成 <名字>.wav.png，跑完改名成 .wav
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (!window.__audioLab) await sleep(50);
const L = window.__audioLab, only = (new URLSearchParams(location.search).get('only') || '').split(',').filter(Boolean);
const R = await L.runTests(only.length ? only : undefined);
for (const r of R) {
  __log(`${r.bad.length ? 'ERR ' : 'ok  '} ${r.name.padEnd(13)} peak ${r.peak.toFixed(3)} rms ${r.rms.toFixed(4)} rms50ms ${r.st.toFixed(4)} phone ${r.loss.toFixed(1)} dB phRms ${(20 * Math.log10(r.phRms + 1e-9)).toFixed(1)} dBFS${r.gap != null ? ' gap-to-bg ' + r.gap.toFixed(1) : ''}${r.hiDrop != null ? ' >1.5k ' + r.hiDrop.toFixed(1) + ' dB' : ''}${r.vsRoar != null ? ' vs-roar ' + r.vsRoar.toFixed(1) : ''}${r.over != null ? ' over-bg ' + r.over.toFixed(1) : ''} ${r.bad.join(' ')}`);
  await fetch('/__shot?name=' + encodeURIComponent(r.name + '.wav'), { method: 'POST', body: L.wav(r.buf) });
}
await __done();
