// 声音模块自检（_lab/audio.html）：离线渲染每个音效 / 8 秒音乐 → 峰值 / RMS 表 → 存 WAV；再跑一遍真 AudioContext 的压力测试
//   python tools/rec3d.py --page _lab/audio.html --director tools/scenarios/audio_test.js --out .cache/audio
//   WAV 经 __shot 的通道存成 <名字>.wav.png，跑完把 .wav.png 改名成 .wav
const sleep = ms => new Promise(r => setTimeout(r, ms));
while (!window.__audioLab) await sleep(50);
const L = window.__audioLab, A = window.__A;
const t0 = performance.now();
const R = await L.runTests();
__log(`offline ${R.length} renders in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
__log('     name           dur    peak    rms   rms50ms  fHz  maxV drop  phone(dB)');
for (const r of R) __log(`${r.bad.length ? 'ERR ' : 'ok  '} ${r.name.padEnd(13)} ${r.dur.toFixed(1).padStart(5)} ${r.peak.toFixed(3)} ${r.rms.toFixed(4)} ${r.st.toFixed(4)} ${String(Math.round(r.fr)).padStart(5)} ${String(r.maxV).padStart(4)} ${String(r.dropped).padStart(4)} ${r.loss.toFixed(1).padStart(6)}${r.over != null ? ' over-bg ' + r.over.toFixed(1) : ''}${r.vsRoar != null ? ' vs-roar(phone) ' + r.vsRoar.toFixed(1) : ''}${r.gap != null ? ' gap-to-bg(phone) ' + r.gap.toFixed(1) : ''}${r.hiDrop != null ? ' >1.5k ' + r.hiDrop.toFixed(1) + ' dB' : ''} phRms ${(20 * Math.log10(r.phRms + 1e-9)).toFixed(1)}${r.steps ? ' steps ' + r.steps.join('-') : ''} played ${r.played} ${r.bad.join(' ')}`);
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
  S.t += 1 / 60;   // sim 在走（audio 看 S.t 判断暂停）
  const evs = [];
  if (f % 7 === 0) evs.push({ type: 'locked', id: 7 }, { type: 'lunge', id: 7 });
  if (f === 60) evs.push({ type: 'skill', id: 'roar' }, { type: 'blocked', ability: 'plunge' });
  if (f === 200) evs.push({ type: 'skill', id: 'vortex' }, { type: 'unlock', abilities: ['roar'] });
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
for (let f = 0; f < 150; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 0); await sleep(16); }
// 暂停（S.t 不走）时按着喷火：0.15 秒后风和火都该停
S.hero.firing = true; S.hero.speed = 45;
for (let f = 0; f < 20; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 0); await sleep(16); }
const lvOn = A.engine.levels();
for (let f = 0; f < 40; f++) { A.update(S, 1 / 60, [], 0); await sleep(16); }
const lvOff = A.engine.levels();
__log(`freeze: firing fire=${lvOn.fire.toFixed(3)} wind=${lvOn.wind.toFixed(3)} -> frozen fire=${lvOff.fire.toFixed(3)} wind=${lvOff.wind.toFixed(3)}`);
if (!(lvOn.fire > .1) || lvOff.fire > .02 || lvOff.wind > .02) __log('ERR loops keep playing while sim is frozen');
S.hero.firing = false; S.hero.speed = 22;
// 换曲迟滞：在水下 0.6 秒又出来 → 不换曲；待 1.3 秒 → 换
const mixW = () => A.engine.tracks.sea.w;
for (let f = 0; f < 36; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 1); await sleep(16); }
for (let f = 0; f < 30; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 0); await sleep(16); }
const wShort = mixW();
for (let f = 0; f < 80; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 1); await sleep(16); }
const wLong = mixW();
__log(`music hysteresis: sea weight after 0.6 s plunge=${wShort.toFixed(2)}, after 1.3 s under=${wLong.toFixed(2)}`);
if (wShort > .05 || wLong < .1) __log('ERR music hysteresis');
for (let f = 0; f < 120; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 0); await sleep(16); }
// 锁定的「嘀」：空着 0.5 秒以上再锁上才响；从一只直接换到另一只不响；跟「咔」同一帧的不响
const lockStep = async (lock, evs) => { const p = A.engine.played; S.hero.lock = lock; S.t += 1 / 60; A.update(S, 1 / 60, evs, 0); await sleep(16); return A.engine.played - p; };
const idle = async (n, lock) => { for (let f = 0; f < n; f++) await lockStep(lock, []); };
await idle(40, 0); const lk1 = await lockStep(7, [{ type: 'locked', id: 7 }]);
await idle(40, 7); const lk2 = await lockStep(8, [{ type: 'locked', id: 8 }]);
await idle(40, 0); const lk3 = await lockStep(8, [{ type: 'eat', combo: 1 }, { type: 'locked', id: 8 }]);
await idle(10, 0); const lk4 = await lockStep(9, [{ type: 'locked', id: 9 }]);
__log(`locked ticks: fresh=${lk1} (want 1) switch=${lk2} (want 0) with-eat=${lk3 - 1} (want 0) re-lock-after-0.17s=${lk4} (want 0)`);
if (lk1 !== 1 || lk2 !== 0 || lk3 !== 1 || lk4 !== 0) __log('ERR locked tick filter');
S.hero.lock = 0;
// 一口吞 4 只（同一帧 4 个 eat）→ 一个主口 + 叠上去的，不排队、音阶只爬一级
{ const e0 = A.engine.dropped; S.t += 1 / 60; S.stage = 2;
  A.update(S, 1 / 60, [1, 2, 3, 4].map(i => ({ type: 'eat', combo: 20 + i, extra: i > 1 })), 0); await sleep(16);
  const inf = A.engine.eatInfo(); __log(`gulp4 live: step=${inf.step} extras=${inf.n} dropped=${A.engine.dropped - e0}`);
  if (inf.n !== 3 || A.engine.dropped !== e0) __log('ERR gulp extras not folded'); }
// 技能冷却好了 → 一声「叮」（只一次）
const p0 = A.engine.played; S.hero.skill = { id: 'roar', cd: .1, cdMax: 10, t: 0 };
for (let f = 0; f < 30; f++) { S.t += 1 / 60; S.hero.skill.cd = Math.max(0, S.hero.skill.cd - 1 / 60); A.update(S, 1 / 60, [], 0); await sleep(16); }
__log('skill ready cue played ' + (A.engine.played - p0) + ' time(s)'); if (A.engine.played - p0 !== 1) __log('ERR skill ready cue count');
S.hero.skill = null;
for (let f = 0; f < 90; f++) { S.t += 1 / 60; A.update(S, 1 / 60, [], 0); await sleep(16); }
__log('live: voices after 2.5 s idle = ' + A.engine.voices + ', sky on=' + A.engine.tracks.sky.on + ' sea on=' + A.engine.tracks.sea.on + ' mixW sky=' + A.engine.tracks.sky.w.toFixed(2));
if (A.engine.voices > 3) __log('ERR voices not released: ' + A.engine.voices);
// 曲子的编配跟着年纪走：S.stage → E.stage；标题页（S = null）= 1
const stg = []; for (const k of [0, 2]) { S.stage = k; S.t += 1 / 60; A.update(S, 1 / 60, [], 0); stg.push(A.engine.stage); await sleep(16); }
for (let f = 0; f < 30; f++) { A.update(null, 1 / 60, [], 0); await sleep(16); }   // 标题页：S = null 只放音乐
stg.push(A.engine.stage); S.stage = 2;
__log('title (S=null) ok, voices=' + A.engine.voices + ', music stage follows S.stage: ' + stg.join(','));
if (stg.join() !== '0,2,1') __log('ERR music stage not following S.stage');
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
