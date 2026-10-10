// 声音：全部 WebAudio 现场合成，没有音频文件（GDD §13 / ARCH「audio 接口」）
//   createAudio() → { unlock(), setMute(b), muted, update(S, dt, events, under), play(name, o), setMusic(on) }
//   搭图的 buildEngine(ac) 不碰 DOM，也能接 OfflineAudioContext：_lab/audio.html 用 renderOffline() 离线渲染，
//   量峰值 / 响度、存 WAV，不用听也能检查。
// 信号流：一次性音效 → sfx ┐
//         提示音（目标 / 图鉴 / 预警）→ cue ┼→ 水下低通 → 总音量 → 压限器 → 软削波（|x| < 0.91）→ 扬声器
//         两首曲子 → music ┘            ↖ 混响（音乐和部分音效的送出）
// 水下：世界声（音效 + 音乐 + 混响）过 900 Hz 低通；提示音只降到 2500 Hz，免得目标完成的铃声被闷没了。

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const VOL = { master: .9, sfx: .85, cue: .8, music: .36 };   // 默认音量：音乐比音效小
const MAXV = 24;                                                   // 同时发声的一次性音效上限

// 同名音效的最小间隔（秒）：一帧里来好几个就往后错开一点，排太远就丢
const GAP = { flap: .1, eat: .045, splash: .07, orb: .045, bump: .25, alert: .45, crossWarn: .14, enterWater: .25, exitWater: .25,
  bite: .3, cook: .08, stun: .08, dash: .2, goal: .5, codex: .3, evolve: 2, shield: .5, bubble: .05, tap: .04 };
const PRIO = { evolve: 1, goal: 1, codex: 1, bite: 1, alert: 1 };  // 满员也照样响

// ---------- 曲子 ----------
// 和弦：每两小节一个；pad = 铺底长音，arp = 琶音能用的音（低 → 高）。全在 C 五声音阶（C D E G A）里，怎么叠都不打架
const CH = [
  { pad: [48, 55, 62, 64], arp: [60, 64, 67, 72, 74, 76] },   // C add9
  { pad: [45, 52, 60, 67], arp: [57, 60, 64, 69, 72, 76] },   // Am7
  { pad: [50, 57, 60, 64], arp: [62, 69, 72, 74, 76, 81] },   // D9sus
  { pad: [43, 50, 57, 60], arp: [55, 62, 67, 69, 74, 79] },   // G6sus
  { pad: [48, 55, 64, 67], arp: [60, 67, 72, 76, 79, 84] },   // C
  { pad: [52, 55, 62, 69], arp: [64, 67, 69, 74, 76, 79] },   // Em7sus
  { pad: [45, 52, 60, 64], arp: [57, 64, 69, 72, 76, 81] },   // Am
  { pad: [43, 55, 62, 69], arp: [55, 62, 67, 74, 76, 79] },   // G sus → 回到 C
];
const ARP_A = [0, 2, 4, 3, 1, 3, 5, 2], ARP_B = [0, 3, 2, 4, -1, 5, 3, 1];   // 每小节 8 个八分音符，-1 = 空一拍
// 鲸歌滑音：[MIDI, 滑过去用的秒数]
const WH = [
  [[57, 0], [62, 1.2], [60, 1], [55, 1.4]],
  [[64, 0], [69, 1], [67, 1.3], [62, 1.2]],
  [[55, 0], [60, 1.4], [64, .8], [57, 1.5]],
  [[62, 0], [67, 1.1], [64, 1], [60, 1.6]],
];
export const TRACKS = {
  sky: { bpm: 84, steps: 128 },   // 16 小节 × 8 个八分音符
  sea: { bpm: 70, steps: 128 },
};

// 最后一道保险：|x| ≤ 0.7 原样通过，往上用 tanh 软压，输出永远 < 0.91
function softClip() {
  const n = 2049, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a < .7 ? a : .7 + .24 * Math.tanh((a - .7) / .24)); }
  return c;
}
// 平滑地改一个参数；值没变就不再排自动化事件
const set = (p, v, t, tau) => { if (p._v !== undefined && Math.abs(p._v - v) < 1e-4 * (1 + Math.abs(v))) return; p._v = v; p.setTargetAtTime(v, t, tau); };

// ======================================================================
// 引擎：在一个 AudioContext / OfflineAudioContext 上搭好全部的图
// ======================================================================
export function buildEngine(ac) {
  const SR = ac.sampleRate;
  const E = { ac, voices: 0, maxVoices: 0, dropped: 0, played: 0 };
  let sd = 20240611;
  const rnd = () => ((sd = Math.imul(sd ^ (sd >>> 15), 2246822507) + 0x6d2b79f5 | 0) >>> 0) / 4294967296;
  const rr = (a, b) => a + (b - a) * rnd();
  const G = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const BQ = (type, f, q, to) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; if (to) b.connect(to); return b; };

  // ---- 缓冲：白噪声 / 棕噪声（首尾接平，循环不咔）/ 噼啪 / 混响冲激 ----
  const mkBuf = (sec, ch, fill) => { const b = ac.createBuffer(ch, Math.ceil(sec * SR), SR); for (let c = 0; c < ch; c++) fill(b.getChannelData(c), c); return b; };
  const WHITE = mkBuf(2, 1, d => { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
  const BROWN = mkBuf(4, 1, d => {
    let v = 0, m = 0, mean = 0; for (let i = 0; i < d.length; i++) { v = (v + (rnd() * 2 - 1) * .05) * .99; d[i] = v; }   // 漏积分：70 Hz 以下不再往上堆，没有直流
    const n = d.length, e = d[n - 1] - d[0]; for (let i = 0; i < n; i++) { d[i] -= e * i / n; mean += d[i] / n; }
    for (let i = 0; i < n; i++) { d[i] -= mean; m = Math.max(m, Math.abs(d[i])); }
    for (let i = 0; i < n; i++) d[i] *= .9 / m;
  });
  const CRACK = mkBuf(2, 1, d => {
    for (let k = 0; k < 60; k++) {
      const n = rr(30, 220) | 0, p = rnd() * (d.length - n) | 0, a = rr(.25, 1);
      for (let i = 0; i < n; i++) d[p + i] += (rnd() * 2 - 1) * a * Math.exp(-i / (n * .22)) * Math.min(1, i / (SR * .001));   // 1 毫秒起音，不扎耳
    }
  });
  const IR = mkBuf(2.2, 2, d => {
    let lp = 0;
    for (let i = 0; i < d.length; i++) { const t = i / SR; lp += ((rnd() * 2 - 1) - lp) * (.08 + .55 * Math.exp(-t * 1.5)); d[i] = lp * Math.exp(-t * 2.8) * Math.min(1, t / .01); }
  });
  const WARM = ac.createPeriodicWave(new Float32Array(8), new Float32Array([0, 1, .45, .22, .1, .05, .025, .01]));

  // ---- 总线 ----
  const master = G(VOL.master);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -9; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = .002; comp.release.value = .18;
  const clip = ac.createWaveShaper(); clip.curve = softClip();
  master.connect(comp); comp.connect(clip); clip.connect(ac.destination);
  const lp = BQ('lowpass', 20000, 0, master), lpCue = BQ('lowpass', 20000, 0, master);   // 水下低通（世界 / 提示音）
  const sfx = G(VOL.sfx, lp), cue = G(VOL.cue, lpCue), music = G(VOL.music, lp);
  const verb = ac.createConvolver(); verb.buffer = IR; verb.connect(G(.55, lp));
  const sfxVerb = G(VOL.sfx, verb), musVerb = G(VOL.music, verb);
  const canPan = typeof ac.createStereoPanner === 'function';
  E.setMaster = (k, t) => set(master.gain, VOL.master * k, t, .05);
  E.setUnder = (u, t) => { u = clamp(u, 0, 1); set(lp.frequency, 20000 * Math.pow(900 / 20000, u), t, .08); set(lpCue.frequency, 20000 * Math.pow(2500 / 20000, u), t, .08); };

  // ---- 一次性音效的「声部」：一组节点挂在 v.g 上，最晚结束的那个源停了就整体断开 ----
  function V(t, vol = 1, send = 0, bus = sfx, pan = 0) {
    E.voices++; E.played++; E.maxVoices = Math.max(E.maxVoices, E.voices);
    const g = G(vol);
    if (pan && canPan) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(bus); } else g.connect(bus);
    if (send) g.connect(G(send, sfxVerb));
    return { g, t, end: -1, src: null };
  }
  const track = (v, s, e) => { if (e > v.end) { v.end = e; v.src = s; } };
  const fin = v => { if (!v.src) { E.voices--; return; } v.src.onended = () => { E.voices--; try { v.g.disconnect(); } catch (e) {} }; };
  // 包络：a 秒起音到 amp，再按 d 秒指数衰减（d 秒后剩 0.7%）
  const env = (p, t, a, d, amp) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(amp, t + a); p.setTargetAtTime(0, t + a, d / 5); };
  // 振荡器：f0 → f1 指数滑音（gd 秒内）
  function tone(v, type, f0, f1, t, a, d, amp, gd, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + (gd || a + d * .5));
    env(g.gain, t, a, d, amp); o.connect(g); g.connect(dest || v.g);
    const e = t + a + d + .03; o.start(t); o.stop(e); track(v, o, e); return o;
  }
  // 噪声段：过一个滤波器，频率 f0 → f1（gd 秒内）
  function noise(v, t, a, d, amp, ft, f0, f1, q, buf, gd, dest) {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf || WHITE; s.loop = true; f.type = ft; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + (gd || a + d * .6));
    env(g.gain, t, a, d, amp); s.connect(f); f.connect(g); g.connect(dest || v.g);
    const e = t + a + d + .03; s.start(t, rnd() * 1.5); s.stop(e); track(v, s, e);
  }
  // 铃：正弦 + 2.76 倍频泛音
  const bell = (v, f, t, d, amp) => { tone(v, 'sine', f, 0, t, .004, d, amp); tone(v, 'sine', f * 2.76, 0, t, .002, d * .4, amp * .32); };
  // 龙吼：三只略走调的锯齿波，音高先扬后落，低通扫上去再回来，再加一点 28 Hz 的颤（喉音）
  function roar(v, t, amp) {
    const f = BQ('lowpass', 220, 5), g = ac.createGain(), am = G(.7), lfo = ac.createOscillator(), ld = G(.3);
    f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(1500, t + .35); f.frequency.exponentialRampToValueAtTime(260, t + 1.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .22); g.gain.setValueAtTime(amp, t + .8); g.gain.linearRampToValueAtTime(0, t + 1.65);
    lfo.frequency.value = 28; lfo.connect(ld); ld.connect(am.gain);
    f.connect(am); am.connect(g); g.connect(v.g);
    for (const dt of [-14, 0, 12]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.detune.value = dt;
      o.frequency.setValueAtTime(80, t); o.frequency.exponentialRampToValueAtTime(128, t + .3); o.frequency.exponentialRampToValueAtTime(66, t + 1.6);
      o.connect(f); o.start(t); o.stop(t + 1.7); track(v, o, t + 1.7);
    }
    lfo.start(t); lfo.stop(t + 1.7);
    noise(v, t + .05, .25, 1.1, amp * .5, 'bandpass', 450, 900, 1.2, null, .5);   // 气声
  }

  // ---- 音效表：每个 f(t, o) 在时间 t 排好一组节点 ----
  const SND = {
    flap(t, o) {   // 扇翅：低通噪声「呼」+ 一点低频（体型大音高低）
      const p = o.pitch || 1, v = V(t, o.k ?? 1, .05);
      noise(v, t, .05, .26, .5, 'lowpass', 1000 * p, 230 * p, 1.5);
      tone(v, 'sine', 120 * p, 62 * p, t + .02, .03, .18, .22);
      fin(v);
    },
    dash(t) {      // 冲刺：低通噪声往上扫
      const v = V(t, 1, .12);
      noise(v, t, .1, .5, .45, 'lowpass', 300, 3200, 4, null, .3);
      noise(v, t, .08, .35, .18, 'bandpass', 700, 2600, 2, null, .3);
      tone(v, 'sine', 90, 160, t, .06, .3, .18);
      fin(v);
    },
    eat(t, o) {    // 咬「咔」+ 往下滑的「咕」；连吃每口升 2 个半音，最多升 12 个
      const c = clamp((o.combo || 1) - 1, 0, 6), p = Math.pow(2, 2 * c / 12), v = V(t, 1, .06);
      for (let i = 0; i < 3; i++) noise(v, t + i * .026, .002, .05, .32 - i * .08, 'bandpass', 2400 * p, 1700 * p, 2.5);
      tone(v, 'triangle', 520 * p, 230 * p, t + .07, .012, .2, .26, .14);
      tone(v, 'sine', 260 * p, 120 * p, t + .07, .012, .22, .28, .14);
      if (o.gold) { bell(v, mtof(91), t + .14, .5, .1); bell(v, mtof(96), t + .2, .5, .07); }
      fin(v);
    },
    cook(t) {      // 烤熟：「滋」+ 一串上行小铃
      const v = V(t, 1, .2);
      noise(v, t, .02, .4, .1, 'bandpass', 3600, 4800, .7);
      noise(v, t, .01, .45, .45, 'highpass', 1800, 2400, 0, CRACK);
      [76, 79, 84].forEach((m, i) => bell(v, mtof(m), t + .14 + i * .08, .55, .13));
      fin(v);
    },
    stun(t) {      // 撞晕：「咚」+ 一串上行小铃
      const v = V(t, 1, .2);
      tone(v, 'sine', 300, 130, t, .004, .28, .45, .12); tone(v, 'triangle', 600, 260, t, .004, .12, .12, .1);
      [79, 81, 86].forEach((m, i) => bell(v, mtof(m), t + .14 + i * .08, .55, .12));
      fin(v);
    },
    enterWater(t, o) {   // 入水：噪声爆一下，带通从高往低扫；thick = 海龙落水（更厚）
      const th = !!o.thick, k = clamp((o.speed || 20) / 36, .55, 1.1), v = V(t, k, .12);
      noise(v, t, .008, th ? .7 : .45, .5, 'bandpass', th ? 2200 : 3200, th ? 240 : 420, th ? 1 : 1.4);
      noise(v, t, .01, th ? .55 : .3, th ? .4 : .22, 'lowpass', 900, 140, 1);
      tone(v, 'sine', th ? 150 : 200, 55, t, .005, th ? .38 : .22, th ? .4 : .26);
      fin(v);
    },
    exitWater(t) {       // 出水：轻一点的扫频 + 几颗水珠「叮」
      const v = V(t, 1, .12);
      noise(v, t, .015, .32, .4, 'bandpass', 2800, 700, 1.2);
      for (let i = 0; i < 3; i++) { const tt = t + .12 + i * rr(.06, .12), f = rr(700, 1000); tone(v, 'sine', f, f * rr(1.6, 2), tt, .003, .07, .1, .05); }
      fin(v);
    },
    splash(t, o) {       // 水花：大小 size，远的小声、偏到一边
      const s = clamp(o.size || 1, .3, 3), v = V(t, (o.k ?? 1) * (.45 + .2 * s), .1, sfx, o.pan || 0);
      noise(v, t, .006, .16 + .1 * s, .45, 'bandpass', 2400, 650 / Math.sqrt(s), 1.3);
      fin(v);
    },
    alert(t, o) {        // 天敌「!」：两声柔和的低音「嘟-嘟」，第二声低一点
      const v = V(t, 1, .1, cue, o.pan || 0);
      tone(v, 'sine', 262, 0, t, .015, .16, .27); tone(v, 'triangle', 262, 0, t, .015, .1, .06);
      tone(v, 'sine', 196, 0, t + .19, .015, .2, .27); tone(v, 'triangle', 196, 0, t + .19, .015, .12, .06);
      fin(v);
    },
    bite(t, o) {         // 被咬：软软的「噗」，掉光点时加几粒往下走的小音
      const v = V(t, 1, .05);
      tone(v, 'sine', 150, 50, t, .006, .3, .5, .2); noise(v, t, .004, .12, .25, 'lowpass', 500, 200, 0);
      for (let i = 0; i < Math.min(o.lost || 0, 4); i++) tone(v, 'sine', mtof(84 - i * 3), 0, t + .1 + i * .06, .003, .14, .06);
      fin(v);
    },
    orb(t, o) {          // 捡光点：小闪光，连着捡音调往上走
      const f = mtof(84 + [0, 2, 4, 7, 9, 12, 14, 16][(o.n || 0) % 8]), v = V(t, 1, .2);
      tone(v, 'sine', f, 0, t, .003, .16, .13); tone(v, 'sine', f * 1.5, 0, t + .035, .003, .14, .08);
      fin(v);
    },
    goal(t) {            // 小目标完成：四声上行的铃
      const v = V(t, 1, .35, cue);
      [79, 84, 88, 91].forEach((m, i) => bell(v, mtof(m), t + i * .09, 1.1, .17));
      fin(v);
    },
    codex(t) {           // 图鉴新种：一声铃 + 高一点的回响
      const v = V(t, 1, .35, cue);
      bell(v, mtof(86), t, 1.2, .2); bell(v, mtof(93), t + .1, 1, .11);
      fin(v);
    },
    evolve(t) {          // 进化：五声音阶上行琶音 + 龙吼 + 收尾一个大和弦
      const v = V(t, 1, .3);
      [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84].forEach((m, i) => tone(v, 'triangle', mtof(m), 0, t + i * .07, .005, .5, .11));
      roar(v, t + .6, .3);
      [60, 67, 76, 79].forEach(m => tone(v, 'sine', mtof(m), 0, t + 1.5, .5, 1.8, .06));
      fin(v);
    },
    bump(t) {            // 撞岛：软「咚」
      const v = V(t, 1, .03);
      tone(v, 'sine', 170, 70, t, .004, .2, .45, .12); noise(v, t, .003, .08, .22, 'lowpass', 600, 250, 0);
      fin(v);
    },
    crossWarn(t) {       // 跨界快到时间：轻轻的木鱼「嗒」（音高放低，水下也听得见）
      const v = V(t, 1, 0, cue);
      tone(v, 'sine', 784, 0, t, .002, .06, .2); tone(v, 'triangle', 392, 0, t, .002, .05, .1);
      fin(v);
    },
    shield(t) {          // 护盾：两声往上滑的柔和正弦
      const v = V(t, 1, .3);
      tone(v, 'sine', mtof(72), mtof(79), t, .05, .6, .12, .3); tone(v, 'sine', mtof(76), mtof(84), t + .06, .05, .6, .09, .3);
      fin(v);
    },
    bubble(t, o) {       // 水下的小气泡「啵」
      const f = rr(240, 480), v = V(t, o.k ?? 1, .15);
      tone(v, 'sine', f, f * 2.2, t, .004, .07, .12, .05);
      fin(v);
    },
    tap(t) {             // 界面按钮
      const v = V(t, 1, 0, cue);
      tone(v, 'sine', 660, 520, t, .002, .06, .12, .05);
      fin(v);
    },
  };
  E.names = Object.keys(SND);
  const last = {};
  // 放一个音效。t 省略 = 马上；同名太密就往后排（最多排 0.2 秒），满员时丢掉不重要的
  E.play = (name, o = {}, t) => {
    const f = SND[name]; if (!f) return false;
    const now = ac.currentTime; t = t == null ? now + .01 : t;
    const gap = GAP[name] || .03, l = last[name] ?? -9;
    if (t < l + gap) { if (l + gap - t > .2) { E.dropped++; return false; } t = l + gap; }
    if (E.voices >= MAXV && !PRIO[name]) { E.dropped++; return false; }
    last[name] = t; f(t, o); return true;
  };

  // ---- 循环声：风 / 喷火 / 水下底噪（一直开着，只调增益，不再新建节点）----
  const loop = (buf, to) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(to); s.start(0, rnd() * buf.duration); return s; };
  const windG = G(0, sfx), windG2 = G(0, sfx), windB1 = BQ('bandpass', 400, .9, windG), windB2 = BQ('bandpass', 1200, 3, windG2);
  const wsrc = loop(WHITE, windB1); wsrc.connect(windB2);
  const fireG = G(0, sfx); fireG.connect(G(.25, sfxVerb));
  const fireLp = BQ('lowpass', 900, 1, G(.55, fireG)), fireRum = BQ('bandpass', 150, .5, G(.7, fireG)), fireHp = BQ('highpass', 1600, 0, G(.45, fireG));
  loop(WHITE, fireLp); loop(BROWN, fireRum); loop(CRACK, fireHp);
  const ambG = G(0, sfx), ambMod = G(.7, ambG), ambLp = BQ('lowpass', 380, 2, ambMod);
  loop(BROWN, ambLp);
  const ambLfo = ac.createOscillator(); ambLfo.frequency.value = .12; ambLfo.connect(G(.3, ambMod.gain)); ambLfo.start(0);
  // L = { wind 0..1, windK 音量系数（0 = 没有风声）, water 在水里（风换成水流）, gust 阵风 0..1, fire 0/1, fireK 火大小, flick 闪烁 0..1, amb 水下底噪 0..1 }
  E.setLoops = (L, t) => {
    const w = clamp(L.wind || 0, 0, 1), k = (L.windK || 0) * (.8 + .4 * (L.gust ?? .5)), wat = L.water ? .55 : 1;
    set(windG.gain, (.015 + .32 * Math.pow(w, 1.5)) * k, t, .12);
    set(windB1.frequency, (260 + 520 * w) * wat, t, .15);
    set(windG2.gain, .1 * w * w * k * (L.water ? .3 : 1), t, .12);
    set(windB2.frequency, (800 + 1500 * w + 250 * (L.gust ?? .5)) * wat, t, .15);
    const fk = L.fire ? (L.fireK ?? 1) : 0;
    set(fireG.gain, .4 * fk, t, fk ? .05 : .12);
    set(fireLp.frequency, 650 + 550 * (L.flick ?? .5), t, .04);
    set(ambG.gain, .2 * clamp(L.amb || 0, 0, 1), t, .3);
  };

  // ---- 音乐：前瞻排程，两首曲子各走各的拍子，只在「开着」时才建节点 ----
  // 一个乐器 = 一个增益，干声进曲子的 out，按比例送混响
  function ins(tr, dry, wet) { const g = ac.createGain(); g.connect(G(dry, tr.out)); if (wet) g.connect(G(wet, tr.wet)); return g; }
  function mkTrack(name) {
    const tr = { name, def: TRACKS[name], next: 0, step: 0, on: false, need: false, w: 0, out: G(0, music), wet: G(0, musVerb) };
    tr.pad = ins(tr, .8, .9); tr.pluck = ins(tr, .9, .45); tr.bass = ins(tr, .9, 0); tr.bell = ins(tr, .6, .9); tr.whale = ins(tr, .75, 1.1);
    return tr;
  }
  const T = { sky: mkTrack('sky'), sea: mkTrack('sea') };
  E.tracks = T;
  // 铺底：每个音两只略微走调的振荡器，共用一个慢慢开合的低通
  function pad(dest, notes, t, len, amp, cut) {
    const f = BQ('lowpass', cut * .6, 0), g = ac.createGain(), end = t + len + 2;
    f.frequency.setValueAtTime(cut * .55, t); f.frequency.linearRampToValueAtTime(cut, t + len * .5); f.frequency.linearRampToValueAtTime(cut * .6, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + Math.min(1.4, len * .4)); g.gain.setValueAtTime(amp, t + len); g.gain.linearRampToValueAtTime(0, end - .05);
    f.connect(g); g.connect(dest);
    let o;
    for (const m of notes) for (const dt of [-7, 6]) { o = ac.createOscillator(); o.setPeriodicWave(WARM); o.frequency.value = mtof(m); o.detune.value = dt; o.connect(f); o.start(t); o.stop(end); }
    o.onended = () => g.disconnect();
  }
  // 拇指琴一样的拨弦：基音 + 3 倍、5.4 倍的短泛音
  function pluck(dest, m, t, amp, dec) {
    const f0 = mtof(m), g = ac.createGain();
    g.connect(dest);
    const part = (r, a, d) => { const o = ac.createOscillator(), e = ac.createGain(); o.frequency.value = f0 * r; env(e.gain, t, .004, d, a); o.connect(e); e.connect(g); o.start(t); o.stop(t + d + .05); return o; };
    part(5.4, amp * .06, dec * .06); part(3.01, amp * .2, dec * .15);
    part(1, amp, dec).onended = () => g.disconnect();
  }
  // 海里的拨弦：三角波过低通，更软更长
  function softPluck(dest, m, t, amp, dec) {
    const o = ac.createOscillator(), f = BQ('lowpass', 1100, 1), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(m);
    f.frequency.setValueAtTime(1300, t); f.frequency.exponentialRampToValueAtTime(380, t + dec * .5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .02); g.gain.setTargetAtTime(0, t + .02, dec / 5);
    o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + dec + .05); o.onended = () => g.disconnect();
  }
  function bass(dest, m, t, len, amp) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = mtof(m); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .08); g.gain.setTargetAtTime(0, t + .1, len / 4);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + len + .1); o.onended = () => g.disconnect();
  }
  function mbell(dest, m, t, d, amp) {
    const g = G(1, dest), part = (r, a, dd) => { const o = ac.createOscillator(), e = ac.createGain(); o.frequency.value = mtof(m) * r; env(e.gain, t, .004, dd, a); o.connect(e); e.connect(g); o.start(t); o.stop(t + dd + .05); return o; };
    part(2.76, amp * .3, d * .4); part(1, amp, d).onended = () => g.disconnect();
  }
  // 鲸歌：正弦 + 三角波沿路径慢慢滑，4.5 Hz 的颤音，带通
  function whale(dest, path, t, amp) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), lfo = ac.createOscillator(), ld = G(14), f = BQ('bandpass', 520, .7), g = ac.createGain(), m2 = G(.25, f);
    o.type = 'sine'; o2.type = 'triangle'; lfo.frequency.value = 4.5;
    lfo.connect(ld); ld.connect(o.detune); ld.connect(o2.detune);
    let tt = t;
    for (const x of [o, o2]) x.frequency.setValueAtTime(mtof(path[0][0]), t);
    for (let i = 1; i < path.length; i++) { tt += path[i][1]; for (const x of [o, o2]) x.frequency.exponentialRampToValueAtTime(mtof(path[i][0]), tt); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .9); g.gain.setValueAtTime(amp, tt - 1); g.gain.linearRampToValueAtTime(0, tt + .4);
    o.connect(f); o2.connect(m2); f.connect(g); g.connect(dest);
    for (const x of [o, o2, lfo]) { x.start(t); x.stop(tt + .5); }
    o.onended = () => g.disconnect();
  }
  // 一个八分音符的格子：天空曲 / 海洋曲
  const PLAY = {
    sky(tr, s, t, sp, from) {
      const bar = s >> 3, st = s & 7, ch = CH[bar >> 1], two = bar & 1;
      if (s % 16 === from) { const len = sp * (16 - from); pad(tr.pad, ch.pad, t, len, .055, 1500); bass(tr.bass, ch.pad[0] - 12, t, len * .8, .055); }
      if (from) return;
      if (st === 0 && two) bass(tr.bass, ch.pad[0] - 12, t, sp * 6, .04);
      const i = (two ? ARP_B : ARP_A)[st];
      if (i >= 0) pluck(tr.pluck, ch.arp[i], t + (st & 1) * .012, (st % 4 === 0 ? 1 : .72) * .12, 1.3);
      if ((bar & 3) === 2 && st === 6) mbell(tr.bell, ch.arp[5] + 12, t, 1.6, .05);
    },
    sea(tr, s, t, sp, from) {
      const bar = s >> 3, st = s & 7, ch = CH[bar >> 1], two = bar & 1;
      if (s % 16 === from) pad(tr.pad, ch.pad.map((m, i) => i < 2 ? m - 12 : m), t, sp * (16 - from), .065, 800);   // 低两个音降八度，上面留着：手机喇叭也听得见
      if (from) return;
      if (!(st & 1)) softPluck(tr.pluck, ch.arp[[0, 2, 3, 1][st >> 1] + two] - 12, t, .13, 2.2);
      if ((bar & 3) === 0 && st === 2) whale(tr.whale, WH[(bar >> 2) & 3], t, .08);
      if ((bar & 3) === 2 && st === 4) mbell(tr.bell, ch.arp[4], t, 2.2, .035);
    },
  };
  // 排程到 until 为止。中途被打开的曲子（need）先补一段铺底，不用等到下一个和弦
  function tick(tr, until) {
    const sp = 60 / tr.def.bpm / 2, now = ac.currentTime;
    if (tr.next < now) { const k = Math.ceil((now - tr.next) / sp); tr.next += k * sp; tr.step = (tr.step + k) % tr.def.steps; }   // 卡顿 / 挂起回来：跳过错过的格子
    if (tr.need && tr.on) { tr.need = false; const r = tr.step % 16; if (r) PLAY[tr.name](tr, tr.step, Math.max(now, tr.next - sp * r) + .02, sp, r); }
    while (tr.next < until) {
      if (tr.on) PLAY[tr.name](tr, tr.step, tr.next, sp, 0);
      tr.step = (tr.step + 1) % tr.def.steps; tr.next += sp;
    }
  }
  E.musicOn = true;
  E.musicTick = until => { tick(T.sky, until); tick(T.sea, until); };
  // m：0 = 天空曲，1 = 海洋曲（等功率交叉）；tgt：正在往哪边走
  E.setMix = (m, tgt, t) => {
    const on = E.musicOn ? 1 : 0, ws = Math.cos(m * Math.PI / 2) * on, wa = Math.sin(m * Math.PI / 2) * on;
    for (const [tr, w, want] of [[T.sky, ws, tgt < 1], [T.sea, wa, tgt > 0]]) {
      const was = tr.on; tr.on = !!on && (w > .002 || want); if (tr.on && !was) tr.need = true;
      tr.w = w; set(tr.out.gain, w, t, .06); set(tr.wet.gain, w, t, .06);
    }
  };
  E.startMusic = t => { for (const tr of [T.sky, T.sea]) { tr.next = t; tr.step = 0; } };
  return E;
}

// 离线渲染：setup(E, ac) 里排好要放的声音，返回 AudioBuffer（试验页用来量峰值 / 响度、存 WAV）
export async function renderOffline(dur, setup, sr = 44100) {
  const ac = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const E = buildEngine(ac);
  setup(E, ac);
  const buf = await ac.startRendering();
  return { buf, E };
}

// ======================================================================
// 游戏里用的外壳：第一次触摸时建 AudioContext，按 S 和事件出声
// ======================================================================
export function createAudio(opt = {}) {
  let ac = null, E = null, muted = !!opt.muted, unlocked = false, timer = 0, muteT = 0;
  const st = { mix: 0, tgt: 0, time: 0, orbN: 0, orbT: -9, bubT: 1 };
  const PITCH = [1.3, 1.1, .92];   // 扇翅音高：幼龙尖一点，成龙低沉
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const resume = () => { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }, suspend = () => { const p = ac.suspend(); if (p && p.catch) p.catch(() => {}); };   // 老 webkit 不一定返回 Promise

  function ensure() {
    if (ac) return true;
    const A = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!A) return false;
    try { ac = new A({ latencyHint: 'interactive' }); } catch (e) { try { ac = new A(); } catch (e2) { return false; } }
    E = buildEngine(ac);
    E.setMaster(muted ? 0 : 1, 0);
    E.startMusic(ac.currentTime + .15);
    return true;
  }
  // 音乐的前瞻排程放在定时器里：主循环暂停时曲子也不断
  const tick = () => { if (ac && ac.state === 'running') { E.setMix(st.mix, st.tgt, ac.currentTime); E.musicTick(ac.currentTime + .6); } };
  function unlock() {
    if (!ensure()) return;
    if (!unlocked) {
      unlocked = true;
      try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch (e) {}   // 老 iOS 要在手势里真放一下
      timer = setInterval(tick, 150);
    }
    if (muted) { if (ac.state === 'running') suspend(); }   // 静音状态下在手势里建出来的会直接是 running，挂起省电
    else if (!hidden() && ac.state !== 'running') resume();
  }
  function setMute(b) {
    muted = !!b;
    if (!ac) return;
    clearTimeout(muteT);
    E.setMaster(muted ? 0 : 1, ac.currentTime);
    if (muted) muteT = setTimeout(() => { if (muted && ac) suspend(); }, 350);   // 淡出完再挂起，省电
    else if (unlocked && !hidden()) resume();
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (!ac) return;
      if (document.hidden) suspend();
      else if (unlocked && !muted) resume();
    });
    addEventListener('pagehide', () => { if (ac) suspend(); });
    addEventListener('pageshow', () => { if (ac && unlocked && !muted && !hidden()) resume(); });
    // 兜底：任何一次手势都试着解锁 / 恢复（iOS 被电话打断后 state = 'interrupted'）
    if (opt.autoUnlock !== false) for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
  }

  // 声源方位：相对龙头朝向的左右（-1..1）和远近衰减
  function where(e, h) {
    if (!h || e.x == null) return { k: 1, pan: 0 };
    const dx = e.x - h.x, dz = e.z - h.z, dy = (e.y ?? 0) - h.y, d = Math.hypot(dx, dy, dz) || 1;
    return { k: clamp(1.15 - d / 110, .15, 1), pan: clamp((-dx * Math.cos(h.yaw) + dz * Math.sin(h.yaw)) / d, -1, 1) * .6 };
  }
  function onEvent(e, S, under) {
    const h = S && S.hero, t = ac.currentTime;
    switch (e.type) {
      case 'flap': E.play('flap', { pitch: PITCH[S ? S.stage : 2] || 1, k: h && h.tuck ? 1 - .6 * h.tuck : 1 }); break;
      case 'enterWater': E.play('enterWater', { speed: e.speed, thick: !!S && S.kind === 'sea' }); break;
      case 'splash': { const w = where(e, h); if (w.k > .16) E.play('splash', { size: e.size, k: w.k, pan: w.pan }); break; }
      case 'alert': { const c = S && S.creatures.find(c => c.id === e.id); E.play('alert', { pan: c ? where(c, h).pan : 0 }); break; }
      case 'orb': st.orbN = t - st.orbT < .7 ? st.orbN + 1 : 0; st.orbT = t; E.play('orb', { n: st.orbN }); break;
      case 'goal': case 'codex': E.play(e.type, e, t + .14); break;   // 晚一点，别和「咔」叠在一起
      default: E.play(e.type, e);
    }
  }

  // 每帧调用：S 可以是 null（标题页，只放音乐）；events = 这一帧攒下的事件；under = 镜头在水下的程度
  function update(S, dt, events, under = 0) {
    if (!E || ac.state !== 'running') return;   // 没解锁 / 静音 / 后台：事件直接丢掉，不攒
    dt = clamp(dt || 0, 0, .1); st.time += dt;
    const now = ac.currentTime, u = clamp(under || 0, 0, 1);
    E.setUnder(u, now);
    const tgt = st.tgt = u > .5 ? 1 : 0; st.mix += clamp(tgt - st.mix, -dt / 1.5, dt / 1.5);   // 两首曲子 1.5 秒交叉
    E.setMix(st.mix, tgt, now);
    const h = S && S.hero, c = S && S.cfg || {};
    const L = { wind: 0, fire: 0, amb: u };
    if (h) {
      const base = c.level || c.cruise || 20, top = c.dive || c.dash || 45;
      const tm = st.time;
      L.wind = clamp((h.speed - base * .5) / (top - base * .5), 0, 1) + Math.max(0, -(h.pitch || 0)) * .25 * clamp(h.speed / base, 0, 1);
      L.windK = (h.medium === 'water' ? .6 : 1) * (1 - .45 * u);
      L.water = h.medium === 'water';
      L.gust = .5 + .5 * Math.sin(tm * .63) * Math.sin(tm * 1.37 + 1);
      L.fire = h.firing ? 1 : 0; L.fireK = .8 + .1 * (S.stage || 0); L.flick = .5 + .5 * Math.sin(tm * 13.1) * Math.sin(tm * 7.3 + 2);
    }
    E.setLoops(L, now);
    if (u > .5 && (st.bubT -= dt) < 0) { st.bubT = .4 + Math.random() * 1.6; E.play('bubble', { k: .5 + .5 * Math.random() }); }   // 水下偶尔冒泡
    if (events) for (const e of events) onEvent(e, S, u);
  }

  return {
    unlock, setMute, update,
    get muted() { return muted; },
    play(name, o) { if (E && ac.state === 'running') E.play(name, o || {}); },     // 额外：界面音效等（'tap'）
    setMusic(on) { if (E) E.musicOn = !!on; },
    get ctx() { return ac; }, get engine() { return E; },
  };
}
