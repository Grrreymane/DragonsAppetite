// 进化时声音和「新能力」卡对不对得上：给分触发进化，量卡片弹出的时刻 vs 新能力号角第一声的时刻（都从进化那一刻算）。
//   python tools/rec3d.py --page index.html --director tools/scenarios/audio_evo.js --query "autostart&kind=fire&stage=1" --out .cache/audio/evo_fire
// 号角的振荡器 detune = -6（曲子的铺底是 -7 / +6），靠这个认出来。只看声音和 DOM，不录画面。
try { Object.defineProperty(navigator, 'userActivation', { configurable: true, get: () => ({ isActive: true, hasBeenActive: true }) }); } catch (e) {}
let ctx = null;
const conn = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (dst, ...r) { if (dst instanceof AudioDestinationNode && this.context.constructor.name !== 'OfflineAudioContext') ctx = this.context; return conn.call(this, dst, ...r); };
const horns = [], sp = OscillatorNode.prototype.start;
OscillatorNode.prototype.start = function (t, ...r) { if (this.detune.value === -6) horns.push(t); return sp.call(this, t, ...r); };
const wait = () => new Promise(r => { const k = () => (window.__dg && window.__dg.ready) ? r() : setTimeout(k, 100); k(); });
await wait();
dispatchEvent(new Event('pointerup'));
await new Promise(r => setTimeout(r, 300));
if (!ctx) __log('ERR audio context was not created');
const D = window.__dg, S = D.S, st0 = S.stage;
window.__pause = true;
const fps = 30, t0 = performance.now();
let evoAt = -1, evoCtx = -1, cardAt = -1;
for (let i = 0; i < 6 * fps; i++) {
  if (i === fps) D.give(S.stage === 0 ? 45 : 230 - S.pts);
  D.frame(1 / fps);
  const now = (performance.now() - t0) / 1000;
  if (evoAt < 0 && S.stage > st0) { evoAt = now; evoCtx = ctx.currentTime; }
  const ab = document.querySelector('.d-abil'), vis = ab && !ab.hidden && getComputedStyle(ab).display !== 'none';
  if (vis && cardAt < 0) cardAt = now;
  const due = t0 + (i + 1) * 1000 / fps; while (performance.now() < due) await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
}
const h = horns.filter(t => t > evoCtx).map(t => t - evoCtx);
const card = cardAt - evoAt, horn = h.length ? h[0] : NaN;
__log(`kind=${S.kind} stage ${st0}->${S.stage}: card at +${card.toFixed(2)} s, first horn note at +${horn.toFixed(2)} s (diff ${(horn - card).toFixed(2)} s), horn notes: ${[...new Set(h.map(x => x.toFixed(2)))].join(' ')}`);
if (!(Math.abs(horn - card) < .2)) __log('ERR unlock fanfare not in sync with the ability card');
await __done();
