// 声音：全部 WebAudio 现场合成，没有音频文件（GDD §13 / ARCH「audio 接口」+「v2 新增」）
//   createAudio() → { unlock(), setMute(b), muted, update(S, dt, events, under), play(name, o), setMusic(on) }
//   搭图的 buildEngine(ac) 不碰 DOM，也能接 OfflineAudioContext：_lab/audio.html 用 renderOffline() 离线渲染，
//   量峰值 / 响度、存 WAV，不用听也能检查。
//   v2 事件：unlock（新能力小号角，进化后 UNLOCK_AT = 1.64 秒，跟「新能力」卡一起出来）、skill {id:'roar'|'vortex'}（龙吼 / 漩涡，音乐让开一点）、
//   lunge（扑咬的轻「嗒」）、locked（锁定的极轻「嘀」：只在空了 0.5 秒后锁到新猎物时响，吃 / 扑咬后 0.35 秒内不响）、
//   blocked（还没学会的「啵-呜」）；另外 S.hero.skill 冷却好了自己放一声元素味的小「亮起来」（火苗 / 泡泡）。
//   eat：一口吞几只时 sim 每只发一个 eat（多的带 extra）——只有主口爬连吃音阶，多的叠成一声更大的「咕嘟」；咕的大小跟着 S.stage 变。
// 信号流：世界的一次性音效（水花 / 扇翅 / 入水…）→ sfx ┐
//         龙自己的嘴和身体（咬吞 / 扑咬 / 撞晕 / 冲刺 / 被咬 / 撞岛 / 龙吼 / 进化的吼）→ near ┤
//         提示音（目标 / 图鉴 / 预警 / 新能力 / 漩涡 / 进化的琶音）→ cue ┼→ 水下低通 → 总音量 → 压限器（-9 dB，12:1，2 毫秒）→ 软削波（|x| < 0.91）→ 扬声器
//         两首曲子 → music（技能时让开）→ 1 kHz +7 dB ┘   ↖ 混响（音乐和部分音效的送出）
// 水下：世界声（音效 + 音乐 + 混响）过 900 Hz 低通；龙自己的声音只降到 3000 Hz（海龙大半时间在水下，「咔」不能闷没了）；
//       提示音降到 2500 Hz，免得目标完成的铃声被闷没了。
// 手机喇叭 700 Hz 以下基本出不来：低频的「咚」都要带一层 300~900 Hz 的中频身体（_lab/audio.html 用 700 Hz 高通模拟手机检查）；
//   曲子总线上 1 kHz 抬 7 dB（铺底也亮一点）：耳机里只响 1.5 dB，手机上背景响 3.4~5 dB；龙吼 / 漩涡的中频收一点。
//   手机上大技能比背景（整段 RMS）高 10 dB 以内：玩家为了听清曲子调大音量，吼一声不会吓一跳。
// 三个年纪的编配不一样（E.stage，update 里跟着 S.stage 走）：幼龙只在拍点上拨，少年龙全琶音，成龙再多一条低音号角。
// 跟着年纪变的音效：咬吞 / 扑咬 / 冲刺（音高、长短）、进化、新能力号角（成龙更大）、海龙出水（少年起是「跃出」，更大）。

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
export const VOL = { master: 1.1, sfx: .85, cue: .8, music: .5 };   // 默认音量：音乐比音效小
export const UNDER = { world: 900, near: 3000, cue: 2500 };   // 镜头完全在水下时各总线的低通（Hz）：世界（音效 + 曲子 + 混响）/ 龙自己 / 提示音
// 「新能力」卡什么时候弹：ui.js 等阶段名大字放完（1.6 秒）+ 50 毫秒才出，实测进化后 1.67~1.70 秒。号角第一声比它早一点点（0.03~0.06 秒）
export const UNLOCK_AT = 1.64;
const MAXV = 24, MAXV_LOW = 16;                                     // 同时发声的一次性音效上限；水花 / 气泡 / 扇翅 / 光点只能占 16 个

// 同名音效的最小间隔（秒）：一帧里来好几个就往后错开一点，排太远就丢
const GAP = { flap: .1, eat: .045, splash: .07, orb: .045, bump: .25, alert: .45, crossWarn: .14, enterWater: .25, exitWater: .25,
  bite: .3, cook: .08, stun: .08, dash: .2, goal: .5, codex: .3, evolve: 2, shield: .5, bubble: .05, tap: .04,
  unlock: 1.5, roar: 1, vortex: 1, lunge: .12, locked: .4, blocked: 6, ready: 1 };   // blocked 6 秒 = 界面「长大后学会」的间隔：有声就有字
const DROP = { lunge: 1, locked: 1, blocked: 1, ready: 1 };   // 太密就直接丢，不往后排（晚了的「嘀」没有意义）
const AFTER = { locked: .35 };                                // 吃 / 扑咬后这么多秒内直接丢：吃完马上锁下一只，「嘀」叠在「咔」上没意义
const PRIO = { evolve: 1, goal: 1, codex: 1, bite: 1, alert: 1, eat: 1, cook: 1, stun: 1, unlock: 1, roar: 1, vortex: 1 };   // 满员也照样响（「吃得脆」是核心手感）
const LOW = { splash: 1, bubble: 1, flap: 1, orb: 1, locked: 1 };                                                          // 背景性的小声音：先让位

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
const HL = [55, 57, 60, 57, 55, 52, 48, 50];   // 成龙的低音号角：每个和弦一个长音（G A C A G E C D），都是和弦里的音
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
  const IR = mkBuf(1.4, 2, d => {   // 1.4 秒的尾巴（低端手机卷积省一点），最后 0.3 秒淡到 0
    let lp = 0; const n = d.length;
    for (let i = 0; i < n; i++) { const t = i / SR; lp += ((rnd() * 2 - 1) - lp) * (.08 + .55 * Math.exp(-t * 1.5)); d[i] = lp * Math.exp(-t * 3) * Math.min(1, t / .01, (1.4 - t) / .3); }
  });
  const WARM = ac.createPeriodicWave(new Float32Array(8), new Float32Array([0, 1, .45, .22, .1, .05, .025, .01]));

  // ---- 总线 ----
  const master = G(VOL.master);
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -9; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = .002; comp.release.value = .18;
  const clip = ac.createWaveShaper(); clip.curve = softClip();
  master.connect(comp); comp.connect(clip); clip.connect(ac.destination);
  const lp = BQ('lowpass', 20000, 0, master), lpCue = BQ('lowpass', 20000, 0, master), lpNear = BQ('lowpass', 20000, 0, master);   // 水下低通（世界 / 提示音 / 龙自己）
  const musEq = E.musEq = BQ('peaking', 1000, .7, lp); musEq.gain.value = 7;   // 曲子的中频抬 7 dB：手机喇叭靠它（耳机里整体只响 1.5 dB）
  const sfx = G(VOL.sfx, lp), near = G(VOL.sfx, lpNear), cue = G(VOL.cue, lpCue), music = G(VOL.music, musEq);
  const verb = ac.createConvolver(); verb.buffer = IR; verb.connect(G(.55, lp));
  const sfxVerb = G(VOL.sfx, verb), musVerb = G(VOL.music, verb);
  const canPan = typeof ac.createStereoPanner === 'function';
  E.setMaster = (k, t) => set(master.gain, VOL.master * k, t, .05);
  E.setUnder = (u, t) => {
    u = clamp(u, 0, 1);
    const f = (p, hz) => set(p.frequency, 20000 * Math.pow(hz / 20000, u), t, .08);
    f(lp, UNDER.world); f(lpCue, UNDER.cue); f(lpNear, UNDER.near);
  };
  E.stage = 1;   // 曲子按哪个年纪编配（0 幼龙 / 1 少年 / 2 成龙）；标题页 = 1
  // 音乐让路：k 倍音量保持 dur 秒，再慢慢回来（龙吼 / 漩涡 / 新能力，大声音不跟曲子挤）
  E.duck = (k, t, dur) => { for (const p of [music.gain, musVerb.gain]) { p.cancelScheduledValues(t); p.setTargetAtTime(VOL.music * k, t, .08); p.setTargetAtTime(VOL.music, t + dur, .45); } };

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
  // 起 a 秒 → 平 hold 秒 → 落 r 秒（持续的声音用；env 是打击乐那种一下就衰减的）
  const swell = (p, t, a, hold, r, amp) => { p.setValueAtTime(0, t); p.linearRampToValueAtTime(amp, t + a); p.setValueAtTime(amp, t + a + hold); p.linearRampToValueAtTime(0, t + a + hold + r); };
  // 龙吼：三只略走调的锯齿波（+ 一点白噪声气声）→ 27 Hz 喉音颤 → 三个「共振峰」带通（张嘴「啊——」滑到「哦」）+ 一路低通的胸腔声
  //       → 2.4 kHz 低通收掉刺耳的高频。音高先扬后落。p = 音高（少年龙高一点），len = 长度（秒）
  //       共振峰在 500~1300 Hz：手机喇叭也吼得出来，耳机里还有胸腔的低音（共振峰别太响：手机上会比背景高太多）
  function growl(v, t, amp, p = 1, len = 1.7) {
    const end = t + len + .05, top = BQ('lowpass', 2400, .5, v.g), g = G(0, top), am = G(.72), src = G(1, am), lfo = ac.createOscillator();
    swell(g.gain, t, Math.min(.16, len * .1), len * .45, len * .45, amp);
    lfo.frequency.value = 27; lfo.connect(G(.28, am.gain));
    const sweep = (prm, f0, f1, f2) => { prm.setValueAtTime(f0, t); prm.exponentialRampToValueAtTime(f1, t + len * .28); prm.exponentialRampToValueAtTime(f2, t + len); };
    for (const [f0, f1, f2, q, k] of [[480, 780, 520, 3.5, 1.43], [1000, 1300, 850, 5, .98], [2250, 2600, 2100, 7, .29]]) {
      const b = BQ('bandpass', f0 * p, q); sweep(b.frequency, f0 * p, f1 * p, f2 * p); am.connect(b); b.connect(G(k, g));
    }
    const chest = BQ('lowpass', 320 * p, .7); am.connect(chest); chest.connect(G(.35, g));
    for (const d of [-15, 0, 12]) {
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.detune.value = d;
      sweep(o.frequency, 78 * p, 118 * p, 64 * p); o.connect(src); o.start(t); o.stop(end); track(v, o, end);
    }
    const n = ac.createBufferSource(); n.buffer = WHITE; n.loop = true; n.connect(G(.2, src)); n.start(t, rnd() * 1.5); n.stop(end);
    lfo.start(t); lfo.stop(end);
  }
  // 暖号角：两只略走调的「暖」波形（谐波逐个变小，不是锯齿那么冲），低通先张开再合上一点 → 「哇」的一下
  function horn(v, m, t, len, amp, dt = 6) {   // dt = 两只振荡器走调多少音分（低音小一点：C3 上 ±6 音分会 1 Hz 地「哇哇」）
    const f = BQ('lowpass', 700, 1.1, v.g), g = G(0, f), end = t + len + .3;
    f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(2600, t + .05); f.frequency.exponentialRampToValueAtTime(1300, t + len + .2);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .025); g.gain.linearRampToValueAtTime(amp * .75, t + len); g.gain.linearRampToValueAtTime(0, t + len + .25);
    for (const d of [-dt, dt]) { const o = ac.createOscillator(); o.setPeriodicWave(WARM); o.frequency.value = mtof(m); o.detune.value = d; o.connect(g); o.start(t); o.stop(end); track(v, o, end); }
  }

  // ---- 一口吞好几只：多的每只在主口上叠半音量的「咔」（同音高、略走一点），再给「咕」加一层更低更长的身体 → 一声大「咕嘟」 ----
  const eatSt = { t: -9, cp: 1, bp: 1, n: 0, ex: 0, combo: 0, step: 1 };
  function gulpMore() {
    const k = ++eatSt.n; if (k > 4) return;
    const t = eatSt.t, v = V(t, 1, .06, near), j = Math.pow(2, rr(-.8, .8) / 12), f = eatSt.cp * j, b = eatSt.bp * Math.pow(.92, k);
    for (let i = 0; i < 2; i++) noise(v, t + .032 * k + i * .024, .002, .045, .16 - i * .05, 'bandpass', 2350 * f, 1650 * f, 2.5);
    tone(v, 'sine', 250 * b, 105 * b, t + .07 + .012 * k, .015, .24 + .05 * k, .09, .17);
    tone(v, 'triangle', 600 * b, 300 * b, t + .07 + .012 * k, .012, .16 + .03 * k, .06, .15);
    fin(v);
  }

  // ---- 音效表：每个 f(t, o) 在时间 t 排好一组节点 ----
  const SND = {
    flap(t, o) {   // 扇翅：低通噪声「呼」+ 一点低频（体型大音高低）
      const p = o.pitch || 1, v = V(t, o.k ?? 1, .05);
      noise(v, t, .05, .26, .5, 'lowpass', 1200 * p, 250 * p, 1.5);
      tone(v, 'sine', 120 * p, 62 * p, t + .02, .03, .18, .17);
      fin(v);
    },
    // 冲刺（海龙）：低通噪声 0.3 秒扫上去，在冲刺的这段时间里慢慢落（水从身边冲过去）+ 身后一串气泡。
    //   跟着年纪变：o.len = 这一阶冲多久（0.8 / 1.2 / 1.4 秒），声音长度跟它的 0.6；幼龙尖一点、2 颗泡；成龙低 2.6 个半音、4 颗泡
    dash(t, o) {
      const s = clamp(o.stage ?? 1, 0, 2), p = [1.15, 1, .86][s], L = clamp((o.len || 1.2) * .6, .4, .9), v = V(t, [.9, 1, 1.08][s], .12, near);
      const rush = (ft, f0, f1, f2, q, amp) => {
        const n = ac.createBufferSource(), f = BQ(ft, f0, q), g = G(0, v.g), e = t + L + .15;
        n.buffer = WHITE; n.loop = true; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + .3); f.frequency.exponentialRampToValueAtTime(f2, e);
        swell(g.gain, t, .09, L * .25, L * .75 + .06, amp); n.connect(f); f.connect(g); n.start(t, rnd() * 1.5); n.stop(e); track(v, n, e);
      };
      rush('lowpass', 300 * p, 3200 * p, 900 * p, 4, .17);
      rush('bandpass', 700 * p, 2600 * p, 1200 * p, 2, .08);   // 中频一层：手机喇叭靠它（长了以后要小：每 3~4 秒冲一次，不能累耳朵）
      tone(v, 'sine', 90 * p, 160 * p, t, .06, L * .6, .22);
      for (let i = 0; i <= s + 1; i++) { const tt = t + .12 + i * L * .22, f = rr(380, 620) * p; tone(v, 'sine', f, f * 2.1, tt, .004, .07, .08, .05); }
      fin(v);
    },
    // 咬「咔」+ 往下滑的「咕」。连吃每口升 2 个半音（最多 12 个）——只算主口：o.combo 是 sim 的连吃数（一口吞的额外猎物也算），
    // 减掉这串连吃里见过的 extra 才是第几口。o.extra = 同一口里多吞的一只：不另起一声，叠到主口上（见 gulpMore）。
    // o.stage：幼龙小小的高一点的「嗯」，成龙低 4 个多半音、更厚更长（+1.6 dB）
    eat(t, o) {
      const cb = o.combo || 1;
      if (cb <= 1 || cb <= eatSt.combo) eatSt.ex = 0;   // 连吃断了：sim 的连吃数从 1 重新数
      eatSt.combo = cb;
      if (o.extra) { eatSt.ex++; if (Math.abs(t - eatSt.t) < .3) { gulpMore(); return; } }
      const s = clamp(o.stage ?? 1, 0, 2), c = clamp(cb - eatSt.ex - 1, 0, 6), p = Math.pow(2, 2 * c / 12);
      const cp = p * [1.06, 1, .92][s], bp = p * [1.14, 1, .78][s], ba = [.8, 1, 1.2][s], bd = [.15, .2, .26][s], v = V(t, 1, .06, near);
      Object.assign(eatSt, { t, cp, bp, n: 0, step: c + 1 });
      for (let i = 0; i < 3; i++) noise(v, t + i * .026, .002, .05, (.32 - i * .08) * 1.3, 'bandpass', 2400 * cp, 1700 * cp, 2.5);
      tone(v, 'triangle', 520 * bp, 230 * bp, t + .07, .012, bd, .26 * ba, .14);
      tone(v, 'sine', 260 * bp, 120 * bp, t + .07, .012, bd + .02, .28 * ba, .14);
      // 「咕」的中频一层（不跟着降调）：手机喇叭靠它和「咔」，曲子的中频抬了以后吃东西在手机上也要比背景高 6 dB 上下
      tone(v, 'triangle', 950 * p * [1.12, 1, 1][s], 560 * p * [1.12, 1, 1][s], t + .07, .01, .17, [.13, .13, .16][s], .12);
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
      const v = V(t, 1, .2, near);
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
    // 出水：轻一点的扫频 + 几颗水珠「叮」（火龙扎完水出来）。
    // 海龙的「跃出」（少年龙学会的新能力）要大得多：往上冲的厚「呼——」+ 一大片水帘「哗」+ 往上带的中频身体 + 更多水珠；
    //   跟着速度和年纪变大，但比落回水里的「哗啦」（landWater）小
    exitWater(t, o) {
      const s = clamp(o.stage ?? 1, 0, 2);
      if (o.kind === 'sea' && s >= 1) {
        const k = clamp((o.speed || 24) / 34, .85, 1.15) * (s === 2 ? 1 : .9), p = s === 2 ? .9 : 1, v = V(t, k, .14);
        // 往上冲：低通噪声 400 → 2000 Hz，0.4 秒鼓起来再落
        const s1 = ac.createBufferSource(), f1 = BQ('lowpass', 400 * p, 1.2), g1 = G(0);
        s1.buffer = WHITE; s1.loop = true; f1.frequency.setValueAtTime(400 * p, t); f1.frequency.exponentialRampToValueAtTime(2000 * p, t + .4);
        swell(g1.gain, t, .16, .08, .3, .42); s1.connect(f1); f1.connect(g1); g1.connect(v.g);
        s1.start(t, rnd() * 1.5); s1.stop(t + .6); track(v, s1, t + .6);
        noise(v, t + .02, .03, .55, .3, 'bandpass', 1800, 700, 1.1);                                // 水帘「哗」：比火龙出水宽、长
        noise(v, t + .1, .02, .4, .12, 'highpass', 2600, 3600, 0, CRACK);                          // 水沫的细碎声
        tone(v, 'triangle', 330 * p, 620 * p, t, .05, .3, .12, .3); tone(v, 'sine', 140 * p, 240 * p, t, .05, .3, .14, .3);   // 往上带的身体（中频那层手机也听得见）
        for (let i = 0; i < 3 + 2 * s; i++) { const tt = t + .2 + i * rr(.06, .1), f = rr(650, 1050); tone(v, 'sine', f, f * rr(1.6, 2), tt, .003, .07, .09, .05); }
        fin(v); return;
      }
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
    alert(t, o) {        // 天敌「!」：两声柔和的「嘟-嘟」（C5 → G4），2 倍泛音要够：手机喇叭靠它（曲子的中频抬了以后也要比背景高 6 dB 以上）
      const v = V(t, 1.1, .1, cue, o.pan || 0);
      for (const [f, tt, d] of [[523.25, t, .16], [392, t + .19, .2]]) {
        tone(v, 'sine', f, f * .985, tt, .015, d, .16, d); tone(v, 'sine', f * 2, 0, tt, .012, d, .3); tone(v, 'sine', f * 3, 0, tt, .01, d * .6, .07); tone(v, 'triangle', f, 0, tt, .015, d * .7, .12);
      }
      fin(v);
    },
    bite(t, o) {         // 被咬：软软的「噗」（低频 + 中频身体，手机上也有），掉光点时加几粒往下走的小音
      const v = V(t, 1, .05, near);
      tone(v, 'sine', 150, 55, t, .006, .28, .26, .2); tone(v, 'triangle', 480, 210, t, .005, .2, .24, .12);
      tone(v, 'sine', 720, 430, t, .004, .11, .15, .08);
      noise(v, t, .004, .16, .42, 'bandpass', 1100, 560, 1.1);
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
    // 进化：五声音阶上行琶音 + 龙吼（变成少年龙吼得高一点、短一点；成龙低沉）。吼在 1.5 秒前收住：
    // 收尾交给 UNLOCK_AT 秒后跟「新能力」卡一起出来的号角（v2 每次进化后都有 unlock）。
    // 琶音走提示音总线、龙吼走龙自己的总线：海龙在水里进化，不能闷成远处的声音（接着的号角在 cue 上是亮的）
    evolve(t, o) {
      const v = V(t, 1.06, .3, cue), adult = o.stage !== 1;
      [60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84].forEach((m, i) => tone(v, 'triangle', mtof(m), 0, t + i * .07, .005, .5, .11));
      fin(v);
      const w = V(t + .5, 1, .3, near);
      growl(w, t + .5, adult ? .3 : .26, adult ? .95 : 1.3, adult ? 1 : .85);
      fin(w);
    },
    // ---- v2：能力 / 技能 / 自动瞄准 ----
    // 学会新能力：「嗒-嗒-嗒——」上行的暖号角 + 一个大三和弦亮起来 + 几颗高音铃（全在 C 五声音阶里，跟曲子不打架）。
    //   o.stage = 2（成龙：龙吼 / 漩涡 + 一口吞 4 只，最后也最大的一次）：号角多一声到 C6、和弦下面垫一只 C3 低音号角、多撑 0.3 秒、铃从 E6 起多一颗
    //   o.kind：一点元素味（火龙 = 一口小火苗「呼」；海龙 = 三颗往上冒的泡泡，落在 C6 / E6 / G6 上）
    unlock(t, o) {
      const big = o.stage === 2, v = V(t, 1, .3, cue), run = big ? [67, 72, 76, 84] : [67, 72, 76], c0 = t + run.length * .1 + .02, hold = big ? .3 : 0;
      run.forEach((m, i) => horn(v, m, t + i * .1, .1, .1));
      [72, 76, 79, 84].forEach(m => horn(v, m, c0, .9 + hold, big ? .056 : .062));
      if (big) horn(v, 48, c0, 1 + hold, .06, 2.5);
      tone(v, 'sine', mtof(60), 0, c0, .02, 1.3 + hold, .1);
      (big ? [88, 91, 96, 100, 103] : [91, 96, 100, 103]).forEach((m, i) => bell(v, mtof(m), c0 + .04 + i * .07, .7, .045));
      if (o.kind === 'sea') [[500, 84], [620, 88], [760, 91]].forEach(([a, m], i) => tone(v, 'sine', a, mtof(m), c0 + .12 + i * .09, .004, .1, .1, .06));
      else if (o.kind === 'fire') { noise(v, c0 - .02, .08, .3, .2, 'bandpass', 600, 1700, 2.5, null, .22); noise(v, c0, .01, .22, .06, 'highpass', 1800, 2200, 0, CRACK); }
      fin(v);
    },
    roar(t) {            // 龙吼（成年火龙的技能）：大而圆的「吼——」，不刺耳；下面一层地面似的隆隆，音乐让开。走龙自己的总线：扎水时吼也不闷
      const v = V(t, 1, .32, near);
      growl(v, t, .5, 1, 1.9);
      noise(v, t + .05, .25, 1.5, .16, 'lowpass', 380, 150, .7, BROWN);
      fin(v);
      E.duck(.45, t, 1.7);
    },
    vortex(t) {          // 漩涡（成年海龙的技能）：水声「呼——」在左右之间绕圈、越转越快，一串往上冒的气泡，底下慢慢鼓起的「嗡」
      const D = 2.3, v = V(t, 1, .25, cue), end = t + D + .05, lfo = ac.createOscillator();
      lfo.frequency.setValueAtTime(1.4, t); lfo.frequency.exponentialRampToValueAtTime(5.5, t + D * .7); lfo.frequency.exponentialRampToValueAtTime(3, t + D);
      // 两股水流：白噪声 → 窄一点的带通（中心跟着转圈的 LFO 上下走）→ 1.9 kHz 低通（不沙）→ 左右绕；第二股高一点、反着转
      for (const [k, dir, amp] of [[1, 1, .6], [1.9, -1, .42]]) {
        const s = ac.createBufferSource(), bp = BQ('bandpass', 520 * k, 3.5), lp2 = BQ('lowpass', 1900, .5), g = G(0);
        s.buffer = WHITE; s.loop = true;
        bp.frequency.setValueAtTime(520 * k, t); bp.frequency.exponentialRampToValueAtTime(1050 * k, t + D * .6); bp.frequency.exponentialRampToValueAtTime(560 * k, t + D);
        lfo.connect(G(320 * k * dir, bp.frequency));   // 绕到一边时亮一点：像水流转过耳边
        swell(g.gain, t, .45, D - 1.05, .6, amp);
        s.connect(bp); bp.connect(lp2); lp2.connect(g);
        if (canPan) { const pn = ac.createStereoPanner(); lfo.connect(G(.7 * dir, pn.pan)); g.connect(pn); pn.connect(v.g); } else g.connect(v.g);
        s.start(t, rnd() * 1.5); s.stop(end); track(v, s, end);
      }
      lfo.start(t); lfo.stop(end);
      noise(v, t + .1, .5, D - .6, .16, 'lowpass', 300, 650, 1, BROWN, D * .6);                                     // 水的身体
      tone(v, 'sine', 72, 135, t, .6, 1.4, .12, D * .55); tone(v, 'triangle', 580, 1080, t + .1, .6, 1.1, .1, D * .55);   // 「嗡」往上鼓（三角波高一个八度：手机上也鼓得起来）
      for (let i = 0; i < 12; i++) {   // 气泡越冒越密，绕着转
        const tt = t + .15 + D * .78 * Math.pow(i / 12, .75), f = rr(360, 680);
        if (canPan) { const pn = ac.createStereoPanner(); pn.pan.value = Math.sin(i * 1.7) * .7; pn.connect(v.g); tone(v, 'sine', f, f * 2.1, tt, .004, .07, .1, .05, pn); }
        else tone(v, 'sine', f, f * 2.1, tt, .004, .07, .1, .05);
      }
      bell(v, mtof(81), t + D * .55, .9, .04); bell(v, mtof(88), t + D * .55 + .09, .9, .03);   // 一点亮晶晶：魔法感
      // 手机喇叭 700 Hz 以下出不来：再加一股 800~1200 Hz 的水流跟着绕（全在 2 kHz 以下，不沙）
      const s = ac.createBufferSource(), bp = BQ('bandpass', 800, 2.5), g = G(0);
      s.buffer = WHITE; s.loop = true;
      bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(1200, t + D * .6); bp.frequency.exponentialRampToValueAtTime(900, t + D);
      lfo.connect(G(180, bp.frequency));
      swell(g.gain, t + .1, .4, D - 1.1, .6, .7);
      s.connect(bp); bp.connect(BQ('lowpass', 1900, .5, g));
      if (canPan) { const pn = ac.createStereoPanner(); lfo.connect(G(-.5, pn.pan)); g.connect(pn); pn.connect(v.g); } else g.connect(v.g);
      s.start(t, rnd() * 1.5); s.stop(end); track(v, s, end);
      fin(v);
      E.duck(.55, t, D - .3);
    },
    lunge(t, o) {        // 扑咬：头往前一探——很短的「嗖」+ 一下轻轻的「嗒」（后面 0.15 秒就是「咔」，所以要小）；幼龙尖一点轻一点，成龙低一点
      const s = clamp(o.stage ?? 1, 0, 2), p = [1.15, 1, .86][s], v = V(t, [.85, 1, 1.1][s], .03, near);
      noise(v, t, .012, .07, .16, 'bandpass', 1300 * p, 2600 * p, 1.4);
      tone(v, 'triangle', 1250 * p, 700 * p, t + .035, .002, .035, .09, .03);
      fin(v);
    },
    locked(t, o) {       // 锁定一只新猎物：极轻的「嘀」，往猎物那边偏
      const v = V(t, 1.25, .04, cue, o.pan || 0);   // 曲子的中频抬了以后响一点点：在 1.5~3 kHz 里还要比背景高 ~7 dB
      tone(v, 'sine', 1760, 0, t, .002, .05, .05); tone(v, 'sine', 2640, 0, t, .002, .025, .012);
      fin(v);
    },
    blocked(t) {         // 还没学会（扎水 / 跃出）：软软的两声往下「啵-呜」，不是报错的「哔」；落在 G 上（在调里，不走音）
      const v = V(t, 1, .12, cue);
      tone(v, 'sine', mtof(76), mtof(74), t, .01, .12, .15, .1); tone(v, 'sine', mtof(88), 0, t, .008, .05, .035);
      tone(v, 'sine', mtof(69), mtof(67), t + .13, .015, .3, .15, .25); tone(v, 'triangle', mtof(69), mtof(67), t + .13, .015, .2, .07, .25);
      fin(v);
    },
    // 技能冷却好了：一下元素味的「亮起来」，跟曲子里的铃（正弦 + 2.76 倍泛音、不滑音）分得开：
    //   火龙 = 往上窜的小火苗「呼」+ 两声往上勾的三角波；海龙 = 三颗往上冒的泡泡 + 一声往上勾的三角波
    ready(t, o) {
      const v = V(t, o.kind === 'sea' ? .8 : 1.1, .15, cue);   // 在背景上突出约 5 dB（手机模型）：听得出来，不吵
      if (o.kind === 'sea') {
        [[480, 1050], [620, 1350], [780, 1700]].forEach(([a, b], i) => tone(v, 'sine', a, b, t + i * .065, .004, .11, .2, .09));
        tone(v, 'triangle', mtof(80), mtof(81), t + .2, .008, .5, .16, .05); tone(v, 'sine', mtof(93), 0, t + .2, .004, .2, .03);
      } else {
        noise(v, t, .1, .2, .3, 'bandpass', 650, 1900, 3, null, .2);
        noise(v, t + .03, .01, .18, .12, 'highpass', 1800, 2200, 0, CRACK);
        tone(v, 'triangle', mtof(78), mtof(79), t + .1, .006, .28, .15, .04); tone(v, 'triangle', mtof(85), mtof(86), t + .19, .006, .45, .14, .04);
      }
      fin(v);
    },
    bump(t) {            // 撞岛：软「咚」（低频 + 中频身体）
      const v = V(t, 1, .03, near);
      tone(v, 'sine', 170, 70, t, .004, .2, .2, .12); tone(v, 'triangle', 480, 210, t, .004, .16, .24, .1);
      tone(v, 'sine', 680, 400, t, .003, .09, .13, .07);
      noise(v, t, .003, .12, .42, 'bandpass', 1000, 500, 1.1);
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
  E.eatInfo = () => ({ step: eatSt.step, n: eatSt.n });   // 测试用：上一口在连吃音阶的第几级、叠了几只
  const last = {};
  // 放一个音效。t 省略 = 马上；同名太密就往后排（最多排 0.2 秒），满员时丢掉不重要的
  E.play = (name, o = {}, t) => {
    const f = SND[name]; if (!f) return false;
    const now = ac.currentTime; t = t == null ? now + .01 : t;
    if (o.extra && name === 'eat' && Math.abs(t - (last.eat ?? -9)) < .3) { f(t, o); return true; }   // 一口吞的额外猎物：叠在主口上，不排队
    if (AFTER[name] && t - Math.max(last.eat ?? -9, last.lunge ?? -9) < AFTER[name]) { E.dropped++; return false; }
    const gap = GAP[name] || .03, l = last[name] ?? -9;
    if (t < l + gap) { if (DROP[name] || l + gap - t > .2) { E.dropped++; return false; } t = l + gap; }
    if (!PRIO[name] && E.voices >= (LOW[name] ? MAXV_LOW : MAXV)) { E.dropped++; return false; }
    last[name] = t; f(t, o); return true;
  };

  // ---- 循环声：风 / 水下底噪一直开着，只调增益；喷火那一串（3 个循环噪声 + 3 个滤波）按下才搭，停了 2 秒拆掉 ----
  const loop = (buf, to, t = 0) => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(to); s.start(t, rnd() * buf.duration); return s; };
  const windG = G(0, sfx), windG2 = G(0, sfx), windB1 = BQ('bandpass', 400, .9, windG), windB2 = BQ('bandpass', 1200, 3, windG2);
  const wsrc = loop(WHITE, windB1); wsrc.connect(windB2);
  const fireG = G(0, sfx); fireG.connect(G(.25, sfxVerb));
  let fire = null;   // { lp, parts, off: 停火的时刻（-1 = 正在喷）}
  const fireUp = t => {
    const part = (buf, f, k) => { const g = G(k, fireG); f.connect(g); return [loop(buf, f, t), f, g]; };   // 噪声 → 滤波 → 比例
    const lp = BQ('lowpass', 900, 1);
    return { lp, off: -1, parts: [part(WHITE, lp, .55), part(BROWN, BQ('bandpass', 150, .5), .7), part(CRACK, BQ('highpass', 1600, 0), .45)] };
  };
  const fireDown = (f, t) => { for (const p of f.parts) { p[0].onended = () => { for (const n of p) try { n.disconnect(); } catch (e) {} }; p[0].stop(t); } };
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
    if (fk) { if (!fire) fire = fireUp(t); fire.off = -1; set(fire.lp.frequency, 650 + 550 * (L.flick ?? .5), t, .04); }   // 不喷火时不再每帧排闪烁
    else if (fire) { if (fire.off < 0) fire.off = t; else if (t - fire.off > 2) { fireDown(fire, t); fire = null; } }
    set(fireG.gain, .4 * fk, t, fk ? .05 : .12);
    set(ambG.gain, .2 * clamp(L.amb || 0, 0, 1), t, .3);
  };
  E.fireOn = () => !!fire;                                                          // 测试用：喷火那串节点在不在
  E.levels = () => ({ wind: windG.gain.value + windG2.gain.value, fire: fireG.gain.value, amb: ambG.gain.value });   // 测试用：循环声现在的增益

  // ---- 音乐：前瞻排程，两首曲子各走各的拍子，只在「开着」时才建节点 ----
  // 一个乐器 = 一个增益，干声进曲子的 out，按比例送混响
  function ins(tr, dry, wet) { const g = ac.createGain(); g.connect(G(dry, tr.out)); if (wet) g.connect(G(wet, tr.wet)); return g; }
  function mkTrack(name) {
    const tr = { name, def: TRACKS[name], next: 0, step: 0, on: false, need: false, w: 0, out: G(0, music), wet: G(0, musVerb) };
    tr.pad = ins(tr, .8, .9); tr.pluck = ins(tr, .9, .45); tr.bass = ins(tr, .9, 0); tr.bell = ins(tr, .6, .9); tr.whale = ins(tr, .75, 1.1); tr.horn = ins(tr, .85, .8);
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
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(700, t + dec * .5);   // 留住 500~900 Hz：海龙大半时间在 900 Hz 低通下面，手机上也要听得见
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .02); g.gain.setTargetAtTime(0, t + .02, dec / 5);
    o.connect(f); f.connect(g); g.connect(dest); o.start(t); o.stop(t + dec + .05); o.onended = () => g.disconnect();
    // 3 倍频的短正弦泛音（像木琴的「叮」）：低音 98~392 Hz 的 3 倍 = 294~1176 Hz，落在手机喇叭（700 Hz 以下出不来）和水下 900 Hz 低通之间。
    // 高八度不够：2 倍还大半在 700 Hz 以下
    const o2 = ac.createOscillator(), g2 = ac.createGain(), d2 = dec * .35;
    o2.frequency.value = mtof(m) * 3;
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(amp * .5, t + .012); g2.gain.setTargetAtTime(0, t + .012, d2 / 5);
    o2.connect(g2); g2.connect(dest); o2.start(t); o2.stop(t + d2 + .05); o2.onended = () => g2.disconnect();
  }
  // 曲子里的低音号角：跟新能力的号角一样的「暖」波形，但慢慢鼓起来、慢慢落下（铺在后面，不抢）
  function mhorn(dest, m, t, len, amp) {
    const f = BQ('lowpass', 500, .7), g = ac.createGain(), end = t + len + .1;
    f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(1500, t + len * .35); f.frequency.exponentialRampToValueAtTime(700, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + len * .3); g.gain.setValueAtTime(amp, t + len * .55); g.gain.linearRampToValueAtTime(0, t + len);
    f.connect(g); g.connect(dest);
    let o;
    for (const d of [-5, 5]) { o = ac.createOscillator(); o.setPeriodicWave(WARM); o.frequency.value = mtof(m); o.detune.value = d; o.connect(f); o.start(t); o.stop(end); }
    o.onended = () => g.disconnect();
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
  // 鲸歌：正弦 + 三角波 + 高八度的正弦（手机喇叭靠它）沿路径慢慢滑，4.5 Hz 的颤音，带通
  function whale(dest, path, t, amp) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), o3 = ac.createOscillator(), lfo = ac.createOscillator(), ld = G(14), f = BQ('bandpass', 560, .7), g = ac.createGain(), m2 = G(.25, f), m3 = G(.35, f);
    o.type = 'sine'; o2.type = 'triangle'; o3.type = 'sine'; lfo.frequency.value = 4.5;
    lfo.connect(ld); ld.connect(o.detune); ld.connect(o2.detune); ld.connect(o3.detune);
    let tt = t;
    const at = (i, f0, x) => x.frequency[i ? 'exponentialRampToValueAtTime' : 'setValueAtTime'](f0 * (x === o3 ? 2 : 1), i ? tt : t);
    for (const x of [o, o2, o3]) at(0, mtof(path[0][0]), x);
    for (let i = 1; i < path.length; i++) { tt += path[i][1]; for (const x of [o, o2, o3]) at(i, mtof(path[i][0]), x); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + .9); g.gain.setValueAtTime(amp, tt - 1); g.gain.linearRampToValueAtTime(0, tt + .4);
    o.connect(f); o2.connect(m2); o3.connect(m3); f.connect(g); g.connect(dest);
    for (const x of [o, o2, o3, lfo]) { x.start(t); x.stop(tt + .5); }
    o.onended = () => g.disconnect();
  }
  // 一个八分音符的格子：天空曲 / 海洋曲
  const PLAY = {
    sky(tr, s, t, sp, from) {
      const bar = s >> 3, st = s & 7, ch = CH[bar >> 1], two = bar & 1;
      if (s % 16 === from) { const len = sp * (16 - from); pad(tr.pad, ch.pad, t, len, .055, 1950); bass(tr.bass, ch.pad[0] - 12, t, len * .8, .055); }
      if (from) return;
      if (st === 0 && two) bass(tr.bass, ch.pad[0] - 12, t, sp * 6, .04);
      const i = (two ? ARP_B : ARP_A)[st];
      if (s % 16 === 0 && E.stage > 1) mhorn(tr.horn, HL[bar >> 1], t + sp, sp * 12, .03);
      if (i >= 0 && (E.stage > 0 || !(st & 1))) pluck(tr.pluck, ch.arp[i], t + (st & 1) * .012, (st % 4 === 0 ? 1 : .72) * .12, 1.3);
      if ((bar & 3) === 2 && st === 6) mbell(tr.bell, ch.arp[5] + 12, t, 1.6, .05);
    },
    sea(tr, s, t, sp, from) {
      const bar = s >> 3, st = s & 7, ch = CH[bar >> 1], two = bar & 1;
      if (s % 16 === from) pad(tr.pad, ch.pad.map((m, i) => i < 2 ? m - 12 : m), t, sp * (16 - from), .065, 1050);   // 低两个音降八度，上面留着：手机喇叭也听得见
      if (from) return;
      if (s % 16 === 0 && E.stage > 1) mhorn(tr.horn, HL[bar >> 1], t + sp, sp * 12, .03);
      if (!(st & (E.stage > 0 ? 1 : 3))) softPluck(tr.pluck, ch.arp[[0, 2, 3, 1][st >> 1] + two] - 12, t, .13, 2.2);
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
  const mixOne = (tr, w, want, t) => {
    const was = tr.on; tr.on = E.musicOn && (w > .002 || want); if (tr.on && !was) tr.need = true;
    tr.w = w; set(tr.out.gain, w, t, .06); set(tr.wet.gain, w, t, .06);
  };
  E.setMix = (m, tgt, t) => {   // 每帧 + 定时器都会调：不建数组
    const on = E.musicOn ? 1 : 0;
    mixOne(T.sky, Math.cos(m * Math.PI / 2) * on, tgt < 1, t); mixOne(T.sea, Math.sin(m * Math.PI / 2) * on, tgt > 0, t);
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
  let ac = null, E = null, muted = !!opt.muted, unlocked = false, timer = 0, muteT = 0, musicOn = opt.music !== false;
  const st = { mix: 0, tgt: 0, hold: 0, time: 0, orbN: 0, orbT: -9, cueT: -9, evoT: -9, skCd: 0, bubT: 1, S: undefined, simT: 0, idle: 0, lockFree: 9,
    L: { wind: 0, windK: 0, water: false, gust: .5, fire: 0, fireK: 1, flick: .5, amb: 0 } };
  const PITCH = [1.3, 1.1, .92];   // 扇翅音高：幼龙尖一点，成龙低沉
  const hidden = () => typeof document !== 'undefined' && document.hidden;
  const resume = () => { const p = ac.resume(); if (p && p.catch) p.catch(() => {}); }, suspend = () => { const p = ac.suspend(); if (p && p.catch) p.catch(() => {}); };   // 老 webkit 不一定返回 Promise
  // 只在「真手势」里建 / 恢复：触屏的 pointerdown 不算用户手势（Chrome 会报 not allowed to start），等紧跟着的 pointerup / touchend / click
  // 没有 navigator.userActivation 的老浏览器照旧（靠每次 unlock 时放一下空缓冲兜底）；opt.gesture = false 关掉这道检查（无头测试用）
  const noGesture = () => opt.gesture !== false && typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.isActive;
  const kick = () => { try { const s = ac.createBufferSource(); s.buffer = ac.createBuffer(1, 1, 22050); s.connect(ac.destination); s.start(0); } catch (e) {} };   // 老 iOS 要在手势里真放一下

  function ensure() {
    if (ac) return true;
    const A = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext); if (!A) return false;
    try { ac = new A({ latencyHint: 'interactive' }); } catch (e) { try { ac = new A(); } catch (e2) { return false; } }
    E = buildEngine(ac);
    E.musicOn = musicOn;   // 解锁前调过 setMusic 的也记得
    E.setMaster(muted ? 0 : 1, 0);
    E.startMusic(ac.currentTime + .15);
    return true;
  }
  // 音乐的前瞻排程放在定时器里：主循环暂停时曲子也不断
  const tick = () => { if (ac && ac.state === 'running') { E.setMix(st.mix, st.tgt, ac.currentTime); E.musicTick(ac.currentTime + .6); } };
  function unlock() {
    if (noGesture() || !ensure()) return;
    if (!unlocked) { unlocked = true; kick(); timer = setInterval(tick, 150); }
    if (muted) { if (ac.state === 'running') suspend(); }   // 静音状态下在手势里建出来的会直接是 running，挂起省电
    else if (!hidden() && ac.state !== 'running') { kick(); resume(); }
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
    // 兜底：任何一次真手势都试着解锁 / 恢复（iOS 被电话打断后 state = 'interrupted'）。不听 pointerdown：触屏按下不算手势
    if (opt.autoUnlock !== false) for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
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
      case 'goal': case 'codex': { const at = Math.max(t + .14, st.cueT + .4); st.cueT = at; E.play(e.type, e, at); break; }   // 晚一点，别和「咔」叠在一起；同一口里两个铃错开 0.4 秒
      case 'huntDiscover': if (e.first) E.play('codex', {}, t + .18); break;
      case 'huntPhase': if (e.phase === 'finale') E.play('ready', { kind: S && S.kind }); break;
      case 'evolve': st.evoT = t; E.play('evolve', { stage: e.stage }); break;
      // 新能力：跟着进化来的话等进化的龙吼收住、卡片弹出来（进化后 UNLOCK_AT 秒）再响；开局头 1 秒的（初始能力）不响
      case 'unlock': if (!S || S.t >= 1) E.play('unlock', { stage: S ? S.stage : 1, kind: S && S.kind }, Math.max(t + .03, st.evoT + UNLOCK_AT)); break;
      // 冲刺跟着年纪变长变低；海龙的出水 = 跃出（新能力），要比火龙扎完水出来大
      case 'dash': E.play('dash', { stage: S ? S.stage : 1, len: S && S.cfg && S.cfg.dashT }); break;
      case 'exitWater': E.play('exitWater', { speed: e.speed, kind: S && S.kind, stage: S ? S.stage : 1 }); break;
      case 'skill': E.play(e.id === 'vortex' || e.id !== 'roar' && S && S.kind === 'sea' ? 'vortex' : 'roar'); break;
      case 'eat': E.play('eat', { combo: e.combo, extra: e.extra, gold: e.gold, stage: S ? S.stage : 1 }); break;
      case 'lunge': E.play('lunge', { stage: S ? S.stage : 1 }); break;
      // 锁定：只在「空着找了 0.5 秒以上、锁到一只新的」时轻轻「嘀」；从一只直接换到另一只（吃完接着锁）不响，界面的锁定圈已经说了
      case 'locked': {
        if (st.lockFree < .5) break;
        const c = S && S.creatures.find(c => c.id === e.id); E.play('locked', { pan: c ? where(c, h).pan : 0 }); break;
      }
      default: E.play(e.type, e);
    }
  }

  // 每帧调用：S 可以是 null（标题页，只放音乐）；events = 这一帧攒下的事件；under = 镜头在水下的程度
  function update(S, dt, events, under = 0) {
    if (!E || ac.state !== 'running') return;   // 没解锁 / 静音 / 后台：事件直接丢掉，不攒
    dt = clamp(dt || 0, 0, .1); st.time += dt;
    const now = ac.currentTime, u = clamp(under || 0, 0, 1);
    E.setUnder(u, now);
    // sim 还在走吗：S.t 在最近 0.15 秒（真时间）里变过才算。暂停 / 结算 / 换龙回标题时 S 还在但冻住了 → 风和火停掉
    // （不能逐帧比：90 / 120 Hz 屏上有的帧本来就没走 sim）
    if (S !== st.S) { st.S = S; st.simT = S ? S.t : 0; st.idle = 0; }
    else if (S && S.t !== st.simT) { st.simT = S.t; st.idle = 0; }
    else st.idle += dt;
    const live = !!S && st.idle < .15;
    // 换曲有迟滞：在水下待满 1 秒才换海洋曲，出水 0.5 秒才换回天空曲（火龙扎一下水不来回切歌；900 Hz 低通马上就有）。开局头 0.5 秒直接换
    const want = u > .5 ? 1 : 0;
    if (want === st.tgt) st.hold = 0;
    else if ((st.hold += dt) >= (want ? 1 : .5) || live && S.t < .5) { st.tgt = want; st.hold = 0; }
    st.mix += clamp(st.tgt - st.mix, -dt / 1.5, dt / 1.5);   // 两首曲子 1.5 秒交叉
    E.setMix(st.mix, st.tgt, now);
    E.stage = S ? clamp(S.stage | 0, 0, 2) : 1;   // 曲子的编配跟着年纪走（排程提前 0.6 秒，所以最多晚 0.6 秒换）
    const h = live && S.hero, c = live && S.cfg || {}, L = st.L;
    L.wind = 0; L.fire = 0; L.amb = u; L.windK = 0; L.water = false;
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
    // 第二技能冷却好了：轻轻「叮-叮」一声（冷却从 >0 走到 0 的那一下；暂停 / 换局时清零，不会误响）
    const sk = h && h.skill;
    if (sk) { if (st.skCd > 0 && sk.cd <= 0) E.play('ready', { kind: S.kind }); st.skCd = sk.cd; } else st.skCd = 0;
    if (u > .5 && (st.bubT -= dt) < 0) { st.bubT = .4 + Math.random() * 1.6; E.play('bubble', { k: .5 + .5 * Math.random() }); }   // 水下偶尔冒泡
    if (events) for (const e of events) onEvent(e, S, u);
    st.lockFree = h && h.lock ? 0 : st.lockFree + dt;   // 放在事件后面：锁定事件那一帧 h.lock 已经是新的了，要看的是之前空了多久
  }

  return {
    unlock, setMute, update,
    get muted() { return muted; },
    play(name, o) { if (E && ac.state === 'running') E.play(name, o || {}); },     // 额外：界面音效等（'tap'）
    setMusic(on) { musicOn = !!on; if (E) E.musicOn = musicOn; },                  // 解锁前调也算数
    get ctx() { return ac; }, get engine() { return E; },
  };
}
