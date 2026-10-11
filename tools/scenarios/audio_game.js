// 声音在真游戏里的冒烟测试：假装有一次真手势（解锁声音），机器人玩一段，每秒量一次总输出的峰值 / RMS，统计各种事件。
//   python tools/rec3d.py --page index.html --director tools/scenarios/audio_game.js --query "autostart&kind=fire&stage=2&secs=25" --out .cache/audio/game_fire
// 总输出量法：拦住「接到扬声器」的那一下，中间塞一个 AnalyserNode。只看声音，不录画面。
const Q = new URLSearchParams(location.search);
const SECS = +(Q.get('secs') || 20);
// 1) 真手势：headless 里没有，假装 userActivation 一直有效
try { Object.defineProperty(navigator, 'userActivation', { configurable: true, get: () => ({ isActive: true, hasBeenActive: true }) }); } catch (e) { __log('WARN userActivation patch ' + e.message); }
// 2) 在扬声器前面插一个分析器
let an = null, ctx = null, nOsc = 0;
const conn = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (dst, ...r) {
  if (dst instanceof AudioDestinationNode && !(this instanceof AnalyserNode) && this.context.constructor.name !== 'OfflineAudioContext') {
    ctx = this.context; an = an || ctx.createAnalyser(); an.fftSize = 2048; conn.call(an, dst); return conn.call(this, an, ...r);
  }
  return conn.call(this, dst, ...r);
};
const co = BaseAudioContext.prototype.createOscillator;
BaseAudioContext.prototype.createOscillator = function () { nOsc++; return co.call(this); };
// 锁定的「嘀」有一个 2640 Hz 的泛音（别的声音没有这个频率）：数它就是真正响了几次
let nTick = 0, nLockEv = 0, nEat = 0;
const sv = AudioParam.prototype.setValueAtTime;
AudioParam.prototype.setValueAtTime = function (v, t) { if (v === 2640) nTick++; return sv.call(this, v, t); };
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
dispatchEvent(new Event('pointerup'));   // audio.js 的自动解锁听的是 pointerup / touchend / click / keydown
await new Promise(r => setTimeout(r, 300));
__log('audio ctx: ' + (ctx ? ctx.state + ' sr=' + ctx.sampleRate : 'NOT CREATED'));
if (!ctx) __log('ERR audio context was not created by the gesture');
const { makeBot, TIERS } = await import('/src/sim/bot.js');
window.__pause = true;
const D = window.__dg, bot = makeBot(TIERS[1], 1234), fps = 30, buf = new Float32Array(2048), seen = {};
let pk = 0, ss = 0, n = 0, worst = 0;
const t0 = performance.now();
for (let i = 0; i < SECS * fps; i++) {
  const o = bot(D.S);
  D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true;
  if (i % (fps * 6) === fps * 3 && D.S.hero.skill) D.input.skillTap = true;   // 成龙：每 6 秒按一下技能
  const ep = D.S.events.push;   // 一帧里可能走好几步 sim：拦 push 才数得全
  D.S.events.push = function (...a) { for (const e of a) { seen[e.type] = (seen[e.type] || 0) + 1; if (e.type === 'locked') nLockEv++; if (e.type === 'eat') nEat++; } return ep.apply(this, a); };
  D.frame(1 / fps);
  delete D.S.events.push;
  // 让真时间也走 1/30 秒（声音是按真时间排的）
  const due = t0 + (i + 1) * 1000 / fps; while (performance.now() < due) await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
  if (an) { an.getFloatTimeDomainData(buf); for (const x of buf) { const a = Math.abs(x); if (a > pk) pk = a; ss += x * x; } n += buf.length; }
  if (i % fps === fps - 1) {
    const rms = Math.sqrt(ss / Math.max(1, n)); worst = Math.max(worst, pk);
    __log(`t=${((i + 1) / fps).toFixed(0).padStart(2)} peak=${pk.toFixed(3)} rms=${rms.toFixed(4)} osc=${nOsc} stage=${D.S.stage} ${D.S.hero.medium} skill=${D.S.hero.skill ? D.S.hero.skill.id + ' cd ' + D.S.hero.skill.cd.toFixed(1) : '-'}`);
    pk = 0; ss = 0; n = 0;
  }
}
__log('events seen: ' + JSON.stringify(seen));
__log(`locked: ${nLockEv} events -> ${nTick} ticks played (${(nTick / SECS * 60).toFixed(0)}/min), eats ${nEat}`);
__log(`worst 1-s peak ${worst.toFixed(3)}`);
if (worst >= .95) __log('ERR output peak >= 0.95');
if (nOsc < 20) __log('ERR almost no sound was made (' + nOsc + ' oscillators)');
await __done();
