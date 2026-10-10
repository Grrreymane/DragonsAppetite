// 声音模块自检（_lab/audio.html）：离线渲染每个音效 / 8 秒音乐 → 峰值 / RMS 表 → 存 WAV；再跑一遍真 AudioContext 的压力测试
//   python tools/rec3d.py --page _lab/audio.html --director tools/scenarios/audio_test.js --out .cache/audio
//   WAV 经 __shot 的通道存成 <名字>.wav.png，跑完把 .wav.png 改名成 .wav
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (!window.__audioLab) await sleep(50);
const L = window.__audioLab, A = window.__A;
const t0 = performance.now();
const R = await L.runTests();
__log(`offline ${R.length} renders in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
__log('     name          dur    peak    rms   rms50ms  fHz  maxV drop');
for (const r of R) __log(`${r.bad.length ? 'ERR ' : 'ok  '} ${r.name.padEnd(12)} ${r.dur.toFixed(1).padStart(5)} ${r.peak.toFixed(3)} ${r.rms.toFixed(4)} ${r.st.toFixed(4)} ${String(Math.round(r.fr)).padStart(5)} ${String(r.maxV).padStart(4)} ${String(r.dropped).padStart(4)} ${r.bad.join(' ')}`);
await __shot('audio_results');
for (const r of R) await fetch('/__shot?name=' + encodeURIComponent(r.name + '.wav'), { method: 'POST', body: L.wav(r.buf) });

// ---- 真 AudioContext：解锁、一大堆事件、喷火、入水交叉淡入、静音挂起 ----
window.__labPause = true;
A.unlock(); await sleep(400);
__log('live ctx state after unlock: ' + A.ctx.state + ' sr=' + A.ctx.sampleRate);
const S = L.S; let maxV = 0, tUp = 0, tMax = 0;
for (let f = 0; f < 300; f++) {
  S.hero.speed = 25 + 22 * Math.sin(f / 30); S.hero.pitch = Math.sin(f / 50) * .5; S.hero.firing = f > 40 && f < 140;
  const under = f > 170 ? 1 : 0; S.hero.medium = under ? 'water' : 'air';
  const evs = [];
  if (f % 2 === 0) evs.push({ type: 'eat', combo: (f >> 1) % 12 + 1 }, { type: 'splash', x: 30, z: 10, size: 2 });
  if (f % 15 === 0) evs.push({ type: 'flap' }, { type: 'orb' }, { type: 'bump' });
  if (f === 100) evs.push({ type: 'evolve', stage: 1 }, { type: 'goal' }, { type: 'codex', sp: 'gull' }, { type: 'alert', id: 7 });
  if (f === 170) evs.push({ type: 'enterWater', speed: 40 });
  const a = performance.now(); A.update(S, 1 / 60, evs, under); const d = performance.now() - a; tUp += d; tMax = Math.max(tMax, d);
  maxV = Math.max(maxV, A.engine.voices);
  await sleep(16);
}
__log(`live: maxVoices=${maxV} dropped=${A.engine.dropped} played=${A.engine.played} update avg=${(tUp / 300 * 1000).toFixed(0)}us max=${(tMax * 1000).toFixed(0)}us`);
if (maxV > 24 + 4) __log('ERR live voices over cap: ' + maxV);
S.hero.firing = false;
for (let f = 0; f < 150; f++) { A.update(S, 1 / 60, [], 0); await sleep(16); }
__log('live: voices after 2.5 s idle = ' + A.engine.voices + ', sky on=' + A.engine.tracks.sky.on + ' sea on=' + A.engine.tracks.sea.on + ' mixW sky=' + A.engine.tracks.sky.w.toFixed(2));
if (A.engine.voices > 3) __log('ERR voices not released: ' + A.engine.voices);
for (let f = 0; f < 30; f++) { A.update(null, 1 / 60, [], 0); await sleep(16); }   // 标题页：S = null 只放音乐
__log('title (S=null) ok, voices=' + A.engine.voices);
// 切后台：假装 document.hidden = true 并发 visibilitychange
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); await sleep(300);
__log('hidden -> ctx ' + A.ctx.state); if (A.ctx.state !== 'suspended') __log('ERR hidden did not suspend');
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); await sleep(300);
__log('visible -> ctx ' + A.ctx.state); if (A.ctx.state !== 'running') __log('ERR visible did not resume');
A.setMute(true); await sleep(700);
__log('muted -> ctx ' + A.ctx.state + ' muted=' + A.muted);
if (A.ctx.state !== 'suspended') __log('ERR mute did not suspend');
A.setMute(false); await sleep(400);
// 静音时切后台再回来：不该自己恢复
A.setMute(true); await sleep(500);
Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); await sleep(100);
Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); await sleep(300);
__log('muted+visible -> ctx ' + A.ctx.state); if (A.ctx.state !== 'suspended') __log('ERR resumed while muted');
A.setMute(false); await sleep(400);
__log('unmuted -> ctx ' + A.ctx.state + ' muted=' + A.muted);
if (A.ctx.state !== 'running') __log('ERR unmute did not resume');
await __done();
