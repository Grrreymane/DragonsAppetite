// 小龙大胃王 · 主程序：启动、状态机（标题 / 游戏 / 暂停 / 结算）、主循环（sim 固定步长 1/60 + 渲染插值）、把各模块接起来。
import * as THREE from 'three';
import { createSim, step, DT, setStage, goalTarget, nearestEdible, cookableNow } from './sim/sim.js';
import { DRAGONS, STAGE_PTS, STAGE_NAMES, ABILITIES } from './config/dragons.js';
import { SPECIES, SPECIES_IDS } from './config/species.js';
import { waveH, zoneAt } from './sim/world.js';
import { GRAD, outlineMat, toonMat, setOutlineMode } from './view/toon.js';
import { createSky } from './view/sky.js';
import { applyLook } from './view/look.js';
import { createIslands } from './view/islands.js';
import { createClouds } from './view/clouds.js';
import { createParticles } from './view/particles.js';
import { createDragonView, loadModel } from './view/dragon.js';
import { createCamera } from './view/camera.js';
import { fallbackCreatures, fallbackSea, fallbackUI, fallbackAudio } from './view/fallback.js';
import { loadSave, writeSave, reportProgress } from './sys/save.js';
import { createInput } from './sys/input.js';

const Q = new URLSearchParams(location.search);
const REC = Q.has('rec'), DEBUG = Q.has('debug');
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// ---------- 渲染器 ----------
const wrap = document.getElementById('wrap');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: REC });
let pixelRatio = Math.min(devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
wrap.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, .5, .3, 3000);
const ctx = { THREE, scene, camera, renderer, GRAD, outlineMat, toonMat };
const sky = createSky(ctx); ctx.sky = sky.sky;
applyLook(Q.get('look') || 'a', { renderer, sky });   // 用户选了 A 明亮卡通
if (Q.get('outline')) setOutlineMode(Q.get('outline'));
const isl = createIslands(ctx);
const clouds = createClouds(ctx);
const P = createParticles(ctx);
const dragon = createDragonView(ctx);
const cam = createCamera(camera);

// 嘴边的发光贴片（代替原型的点光源：灯的数量一变就要重新编译着色器）
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(.4, 'rgba(255,140,50,.5)'); gr.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const mouthGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
scene.add(mouthGlow);
// 护盾泡泡
const shieldMat = new THREE.MeshBasicMaterial({ color: 0x9ff0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), shieldMat); scene.add(shield); shield.visible = false;

// ---------- 可选模块（并行开发的；加载失败就用备用实现） ----------
async function opt(path, name, fb) {
  try { const m = await import(path); if (typeof m[name] === 'function') return m[name]; } catch (e) { console.warn('模块加载失败，用备用实现：', path, e && e.message); }
  return fb;
}
const [mkCreatures, mkSea, mkUI, mkAudio] = await Promise.all([
  opt('./view/creatures.js', 'createCreatures', fallbackCreatures),
  opt('./view/sea.js', 'createSea', fallbackSea),
  opt('./ui/ui.js', 'createUI', fallbackUI),
  opt('./sys/audio.js', 'createAudio', fallbackAudio),
]);
const creatures = mkCreatures(ctx);
const sea = mkSea(ctx);
const audio = mkAudio();
// 模块可以返回 ready（Promise）：例如岛的精模要先下载完
await Promise.all([isl, sky, sea, creatures, clouds].map(m => m && m.ready ? m.ready.catch(e => console.warn('模块准备失败', e && e.message)) : null));

// ---------- 存档 / 状态 ----------
const save = loadSave();
let S = null, state = 'title', kind = save.pick || 'fire', temp = false, loadingModel = false;
let evo = null, resultTimer = 0, saveT = 0, hintState = {}, playSecAcc = 0, preloaded = {}, eatenBase = 0;
const input = createInput(wrap, document.getElementById('joy'), {
  onDrag: on => { ui.dragging(on); if (on) audio.unlock(); },
  onAction: on => onAction(on),
});
function onAction(on) { input.btn = on; if (on) input.actTap = true; audio.unlock(); }

// ---------- 界面 ----------
const _p = V();
const ui = mkUI(document.getElementById('ui'), {
  project(x, y, z) {
    _p.set(x, y, z).project(camera);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    return { x: (_p.x * .5 + .5) * w, y: (-_p.y * .5 + .5) * h, visible: _p.z < 1 && Math.abs(_p.x) <= 1 && Math.abs(_p.y) <= 1, behind: _p.z >= 1 };
  },
  portrait: (sp, size) => creatures.portrait ? creatures.portrait(sp, size) : '',
  onPick: k => { audio.unlock(); startGame(k); },
  onAction: on => onAction(on),
  onSkill: () => { input.skillTap = true; audio.unlock(); },
  onPause: () => pause(),
  onResume: () => resume(),
  onSwitch: () => toTitle(),
  onCodex: () => ui.showCodex(save),
  onToggleMute: () => { save.mute = !save.mute; audio.setMute(save.mute); ui.setMute(save.mute); writeSave(save); },
  onToggleLeft: () => { save.left = !save.left; ui.setLeft(save.left); writeSave(save); },
  getSave: () => save,
});
audio.setMute(!!save.mute); ui.setMute && ui.setMute(!!save.mute); ui.setLeft && ui.setLeft(!!save.left);

// ---------- 主角模型：当前阶段的真模型；没做好就用成龙模型 + 骨骼缩放顶替（标「临时」） ----------
async function heroFor(k, stage) {
  const c = DRAGONS[k].stages[stage];
  try { return { loaded: await loadModel(c.model), bones: null, temp: false }; } catch (e) { }
  if (c.fallback) { try { return { loaded: await loadModel(c.fallback.model), bones: c.fallback.bones, temp: true }; } catch (e) { } }
  // 海龙一个模型都没有时：先用火龙顶着（只会在开发中出现）
  return { loaded: await loadModel('fire_adult'), bones: null, temp: true };
}
async function applyHero(k, stage, len) {
  loadingModel = true;
  const r = await heroFor(k, stage);
  dragon.build(r.loaded, len, r.bones);
  if (S) S.hero.mouthK = dragon.mouthK;
  temp = r.temp; ui.setTemp && ui.setTemp(temp);
  loadingModel = false;
  return r;
}

// ---------- 开局 / 标题 / 暂停 ----------
async function startGame(k) {
  kind = k; save.pick = k; writeSave(save);
  const sv = save[k];
  const seed = +(Q.get('seed') || 1) + (sv.playSec | 0);
  S = createSim({ kind: k, seed, stage: sv.stage | 0, pts: sv.pts | 0, goalIdx: sv.goal | 0, codex: save.codex });
  eatenBase = sv.eaten | 0;
  if (Q.has('stage')) setStage(S, +Q.get('stage'));
  ui.hideTitle(); ui.setLoading && ui.setLoading(0, '');
  await applyHero(k, S.stage, S.hero.len);
  ui.setLoading && ui.setLoading(1, '');
  cam.snap(); acc = 0; hintState = {};
  ui.showHUD(k); state = 'play'; input.enabled = true; input.reset();
  if (!save.tut.drag) ui.hint('drag');
  window.__dg.ready = true;
}
function toTitle() {
  persist(); state = 'title'; input.enabled = false; input.reset(); ui.hidePause && ui.hidePause(); ui.hideHUD && ui.hideHUD(); ui.hint(null);
  ui.showTitle(save);
}
function pause() { if (state !== 'play') return; state = 'pause'; input.reset(); persist(); ui.showPause && ui.showPause(); }
function resume() { if (state !== 'pause') return; ui.hidePause && ui.hidePause(); state = 'play'; last = performance.now(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (state === 'play') pause(); persist(); } });
addEventListener('pagehide', () => persist());
addEventListener('keydown', e => { if (e.code === 'Escape') state === 'play' ? pause() : resume(); if (e.code === 'KeyM') ui && ui.setMute && (save.mute = !save.mute, audio.setMute(save.mute), ui.setMute(save.mute)); });

function persist() {
  if (!S) return;
  const sv = save[S.kind];
  sv.stage = S.stage; sv.pts = Math.round(S.pts); sv.goal = S.goalIdx; sv.eaten = (eatenBase | 0) + S.stats.eaten;
  sv.playSec = (sv.playSec || 0) + playSecAcc; playSecAcc = 0;
  save.codex = S.codex;
  writeSave(save);
  const n = SPECIES_IDS.filter(id => save.codex[id] && save.codex[id].n).length;
  reportProgress(`${DRAGONS[S.kind].zh}·${STAGE_NAMES[S.stage]} · 吃了 ${totalEaten()} 只 · 图鉴 ${n}/12`);
}
function totalEaten() { return SPECIES_IDS.reduce((a, id) => a + ((save.codex[id] && save.codex[id].n) || 0), 0); }

// ---------- 事件 → 画面效果 / 提示 / 存档 ----------
const _m = V(), _f = V(), _c = new THREE.Color(), _c2 = new THREE.Color();
function handleEvents(evs) {
  const h = S.hero, k = h.len / 10;
  for (const e of evs) {
    switch (e.type) {
      case 'eat': {
        _c.set(SPECIES[e.sp].colors.belly || 0xffffff).lerp(_c2.set(0xffffff), .35);
        P.burst('splash', e.x, e.y, e.z, 7, 3.5 * Math.max(.6, e.size), .35, Math.max(.12, e.size * .14), { tint: [_c.r, _c.g, _c.b], grav: 3, grow: 1 });
        P.burst('spark', e.x, e.y, e.z, 5, 3, .3, Math.max(.2, e.size * .2), { grow: 1 });
        if (e.gold) P.burst('gold', e.x, e.y, e.z, 14, 6, .8, .6);
        if (e.cross) P.burst('spark', e.x, e.y, e.z, 8, 4, .6, .5);
        dragon.bite = .2; dragon.gulp = .15;
        saveT = Math.min(saveT, 1);
        break;
      }
      case 'cook': { const c = S.creatures.find(c => c.id === e.id); if (c) { P.burst('smoke', c.x, c.y, c.z, 6, 2, 1, c.size * .5, { rise: 1.5 }); P.burst('spark', c.x, c.y, c.z, 8, 4, .5, .3); } break; }
      case 'stun': { const c = S.creatures.find(c => c.id === e.id); if (c) P.burst('star', c.x, c.y + c.size * .5, c.z, 8, 3, .8, .35, { up: 1 }); break; }
      case 'enterWater': case 'exitWater': {
        const sy = waveH(e.x, e.z, S.t), big = e.type === 'enterWater' ? 1 : .8;
        P.burst('splash', e.x, sy + .3, e.z, Math.round(44 * big), 8 * Math.max(.6, k), .8, .42 * Math.max(.6, k), { grav: 14, up: 1.6, drag: 1, grow: 1.2, alpha: .85 });
        P.burst('bubble', e.x, sy - 1, e.z, 16, 4, .9, .12, { rise: 6, grow: .6, alpha: .7 });
        if (e.type === 'exitWater' && S.kind === 'fire') dripT = 1.5;
        break;
      }
      case 'splash': { const sy = waveH(e.x, e.z, S.t); P.burst('splash', e.x, sy + .2, e.z, Math.round(6 + 10 * e.size), 3 + 4 * e.size, .5, .16 + .22 * e.size, { grav: 12, up: 1.4, drag: 1, grow: 1.2, alpha: .85 }); break; }
      case 'bite': P.burst('spark', e.x, e.y, e.z, 14, 6, .5, .5); flashT = .35; break;
      case 'orb': P.burst('orb', e.x, e.y, e.z, 6, 3, .4, .5); break;
      case 'evolve': startEvolve(e.stage); break;
      // 'unlock'（新能力卡）和 'blocked'（长大后学会）界面自己处理（ui.update 里读事件）
      case 'lunge': dragon.bite = .2; break;
      case 'skill': {
        const h = S.hero;
        if (e.id === 'roar') {
          dragon.roar = .9;
          for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; P.emit('spark', h.x, h.y, h.z, Math.cos(a) * e.r * 1.4, (Math.random() - .5) * 4, Math.sin(a) * e.r * 1.4, .7, 1.2, { drag: 1.2, grow: 1.5, alpha: .7 }); }
        } else {
          for (let i = 0; i < 60; i++) { const a = Math.random() * Math.PI * 2, r = e.r * (.3 + Math.random() * .7); P.emit('bubble', h.x + Math.cos(a) * r, h.y + (Math.random() - .5) * 6, h.z + Math.sin(a) * r, -Math.sin(a) * 12 - Math.cos(a) * 6, 1, Math.cos(a) * 12 - Math.sin(a) * 6, 1.2, .18, { rise: 2, grow: .6, alpha: .8, drag: .4 }); }
        }
        break;
      }
      case 'goal': saveT = 0; break;
      case 'complete': if (!save[S.kind].adultShown) resultTimer = 1.6; break;
      case 'codex': break;
      case 'shield': break;
    }
  }
}
let dripT = 0, flashT = 0;

// 进化演出：柔光 0.6 秒淡入 → 慢放 → 最亮时换模型 → 镜头 1.5 秒拉到新距离 → 阶段名
function startEvolve(stage) {
  evo = { t: 0, stage, swapped: false, ready: null };
  const c = DRAGONS[S.kind].stages[stage];
  evo.ready = heroFor(S.kind, stage);
  ui.toast(STAGE_NAMES[stage]);
  persist();
}
function stepEvolve(dt) {
  if (!evo) return 1;
  evo.t += dt;
  const glow = evo.t < .6 ? evo.t / .6 : evo.t < 1.6 ? 1 : Math.max(0, 1 - (evo.t - 1.6) / .9);
  dragon.rim.value = .8 * glow;
  if (evo.t < 2.2 && Math.random() < .7) P.emit('gold', S.hero.x + (Math.random() - .5) * S.hero.len, S.hero.y + (Math.random() - .5) * S.hero.len * .5, S.hero.z + (Math.random() - .5) * S.hero.len, 0, 2 + Math.random() * 3, 0, 1.3, (.12 + Math.random() * .12) * Math.max(1, S.hero.len / 6), { drag: .5, grow: .8 });
  if (!evo.swapped && evo.t > .6) {
    evo.swapped = true;
    evo.ready.then(r => { dragon.build(r.loaded, S.hero.len, r.bones); S.hero.mouthK = dragon.mouthK; temp = r.temp; ui.setTemp && ui.setTemp(temp); }).catch(() => { });
  }
  if (evo.t > 2.5) {
    const st = evo.stage; evo = null; dragon.rim.value = 0;
    return 1;
  }
  return evo.t > .3 && evo.t < 1.3 ? .35 : 1;
}

// 首次提示：每条只出现一次（记进存档）
function updateHints(dt) {
  const h = S.hero, T = save.tut;
  let want = null;
  if (!T.drag) { if (input.moved > 20 || S.t > 12) { T.drag = 1; writeSave(save); } else want = 'drag'; }
  else if (S.kind === 'fire') {
    const g = S.goal;
    if (!T.plunge && h.medium === 'air' && (g && g.type === 'cross' || S.spots.some(s => Math.hypot(s.x - h.x, s.z - h.z) < 70))) {
      want = 'plunge'; hintState.plungeT = (hintState.plungeT || 0) + dt;
      if (S.stats.cross > 0 || hintState.plungeT > 8) { T.plunge = 1; writeSave(save); }
    } else if (!T.fire && S.creatures.some(c => c.edibleCooked && !c.edible && cookableNow(S, c) && Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z) < 40)) {
      want = 'fire'; hintState.fireT = (hintState.fireT || 0) + dt;
      if (h.firing && input.btn || hintState.fireT > 6) { T.fire = 1; writeSave(save); }
    }
  } else {
    if (!T.breach && h.medium === 'water' && S.creatures.some(c => (c.sp === 'gull' || c.sp === 'flyfish') && c.y > 0 && Math.hypot(c.x - h.x, c.z - h.z) < 35)) {
      want = 'breach'; hintState.breachT = (hintState.breachT || 0) + dt;
      if (S.stats.cross > 0 || hintState.breachT > 8) { T.breach = 1; writeSave(save); }
    } else if (!T.dash && S.creatures.some(c => c.edibleCooked && !c.edible && cookableNow(S, c) && Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z) < 30)) {
      want = 'dash'; hintState.dashT = (hintState.dashT || 0) + dt;
      if (h.dashT > 0 || hintState.dashT > 6) { T.dash = 1; writeSave(save); }
    }
  }
  if (want !== hintState.cur) { hintState.cur = want; ui.hint(want); }
}

// ---------- 画面跟着 sim 走 ----------
const H = {};                       // 插值后的主角
let acc = 0, last = performance.now(), T = 0, frameEvents = [];
function lerpHero(a) {
  const h = S.hero;
  Object.assign(H, h);
  H.x = lerp(h.px, h.x, a); H.y = lerp(h.py, h.y, a); H.z = lerp(h.pz, h.z, a);
  return H;
}

function advance(dtReal) {
  T += dtReal;
  frameEvents = [];
  if (S && state === 'play') {
    const ts = Math.min(S.slowmo || 1, stepEvolve(dtReal));
    acc += dtReal * ts;
    let n = 0;
    while (acc >= DT && n < 5) { step(S, input.read()); for (const e of S.events) frameEvents.push(e); acc -= DT; n++; }
    if (n >= 5) acc = 0;
    playSecAcc += dtReal;
    handleEvents(frameEvents);
    updateHints(dtReal);
    // 预取下一阶段的模型（本阶段进度过半时）
    if (S.stage < 2) {
      const a = STAGE_PTS[S.stage], b = STAGE_PTS[S.stage + 1];
      if ((S.pts - a) / (b - a) > .5 && !preloaded[S.kind + S.stage]) { preloaded[S.kind + S.stage] = 1; heroFor(S.kind, S.stage + 1).catch(() => { }); }
    }
    saveT -= dtReal; if (saveT <= 0) { saveT = 5; persist(); }
    if (resultTimer > 0) { resultTimer -= dtReal; if (resultTimer <= 0) { if (ui.abilityLeft > 0) resultTimer = ui.abilityLeft + .15; else showResult(); } }
  }
  const alpha = S && state === 'play' ? acc / DT : 1;
  // 海浪的时间：海面按 sim 的时间画浪，镜头判断水线也要用同一个时间（否则镜头会卡在水线上一半水上一半水下）
  const waveT = S ? S.t - (1 - alpha) * DT : T;
  if (S && dragon.model) {
    const h = lerpHero(alpha);
    dragon.glow.value = lerp(dragon.glow.value, S.kind === 'sea' ? (h.dashT > 0 ? 1.2 : .6) : 0, damp(5, dtReal));
    if (flashT > 0) { flashT -= dtReal; }
    const blink = h.invuln > 0 ? (Math.sin(T * Math.PI * 6) > 0 ? .12 : 0) : 0;
    if (!evo) dragon.flash.value = blink;
    dragon.update(h, S, dtReal * (state === 'play' ? 1 : 0), T);
    cam.update(h, S, dtReal, waveT);
    // 喷火粒子 + 嘴边发光
    const firing = h.firing && state === 'play';
    dragon.mouth(_m); dragon.forward(_f);
    mouthGlow.position.copy(_m).addScaledVector(_f, h.len * .08);
    mouthGlow.scale.setScalar(h.len * .5);
    mouthGlow.material.opacity = lerp(mouthGlow.material.opacity, firing ? .9 : 0, damp(10, dtReal));
    if (firing) {
      const sc = S.cfg.fireRange / 22, n = Math.ceil(dtReal * (70 + 90 * sc));
      for (let i = 0; i < n; i++) {
        const sp = (40 + Math.random() * 18) * sc;
        const vx = (_f.x + (Math.random() - .5) * .28) * sp + (h.x - h.px) / DT, vy = (_f.y + (Math.random() - .6) * .24) * sp + (h.y - h.py) / DT, vz = (_f.z + (Math.random() - .5) * .28) * sp + (h.z - h.pz) / DT;
        P.emit('fire', _m.x, _m.y, _m.z, vx, vy, vz, .55 + Math.random() * .3, (1.6 + Math.random()) * Math.max(.6, sc), { rise: 5, alpha: .8 });
      }
    }
    if (h.firing && h.medium === 'water') P.emit('steam', _m.x, _m.y, _m.z, 0, 2, 0, .6, .5, { rise: 3 });
    if (dripT > 0) { dripT -= dtReal; if (Math.random() < .5) P.emit('splash', h.x + (Math.random() - .5) * h.len * .8, h.y, h.z + (Math.random() - .5) * h.len * .8, 0, -2, 0, .7, .25, { grav: 10 }); }
    if (S.kind === 'sea' && h.dashT > 0 && h.medium === 'water' && Math.random() < .6) P.emit('bubble', h.x - _f.x * h.len * .45 + (Math.random() - .5) * h.len * .2, h.y + (Math.random() - .5) * h.len * .1, h.z - _f.z * h.len * .45, (Math.random() - .5) * 1.5, 1, (Math.random() - .5) * 1.5, .7, .07 + .05 * Math.random(), { rise: 4, grow: .6, alpha: .7 });
    // 烤熟的猎物冒烟、光点
    for (const c of S.creatures) if (c.roast > 0 && Math.random() < .25) P.emit('smoke', c.x, c.y, c.z, 0, 1.5, 0, 1, c.size * .5, { rise: 1 });
    for (const o of S.orbs) P.emit('orb', o.x, o.y, o.z, 0, 0, 0, .06, 1.1, { grow: 0 });
    // 护盾
    shield.visible = h.shield > 0; if (shield.visible) { shield.position.set(h.x, h.y, h.z); shield.scale.setScalar(h.len * .75); shieldMat.opacity = .18 + .05 * Math.sin(T * 3); }
  } else if (!S || state === 'title') {
    // 标题页：镜头绕着出生点慢慢转
    const a = T * .05; camera.position.set(Math.sin(a) * 120, 45, Math.cos(a) * 120 - 40); camera.lookAt(30, 35, 260);
  }
  if (S) creatures.update(S, alpha, dtReal, T);
  sea.update(S || { creatures: [], spots: [], hero: { x: 0, y: 60, z: 0, len: 10 }, t: T, kind: 'fire' }, alpha, dtReal, T, camera);
  const under = sea.underwater || 0;
  creatures.setUnderwater && creatures.setUnderwater(under);
  isl.update(camera, T, dtReal, waveT);
  clouds.update(camera, T, dtReal, isl.smokePoints());
  sky.update(camera, T);
  P.update(dtReal);
  if (S && (state === 'play' || state === 'pause')) ui.update(S, dtReal, frameEvents);
  audio.update(S || null, dtReal, frameEvents, under);
}

function showResult() {
  const sv = save[S.kind]; sv.adultShown = 1; persist();
  state = 'pause'; input.reset();
  ui.showResult({ kind: S.kind, timeSec: Math.round((sv.playSec || 0)), eaten: totalEaten(), codexN: SPECIES_IDS.filter(id => save.codex[id] && save.codex[id].n).length, codexMax: 12, stageName: '大胃王' }, () => { state = 'play'; last = performance.now(); });
}

// ---------- 尺寸 / 画质 ----------
let lastW = 0, lastH = 0;
function resize() {
  const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
  lastW = w; lastH = h;
  renderer.setPixelRatio(pixelRatio); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); if (window.visualViewport) visualViewport.addEventListener('resize', resize);
let qT = 0, qN = 0, qSum = 0, qGood = 0, qCool = 0;
function autoQuality(dt) {
  if (REC) return;
  qSum += dt; qN++; qT += dt; qCool -= dt;
  if (qT < 2) return;
  const avg = qSum / qN * 1000; qT = qSum = qN = 0;
  if (avg > 20 && pixelRatio > 1 && qCool <= 0) { pixelRatio = Math.max(1, pixelRatio - .5); resize(); qCool = 10; qGood = 0; }
  else if (avg < 12) { qGood += 2; if (qGood >= 10 && pixelRatio < Math.min(devicePixelRatio || 1, 2) && qCool <= 0) { pixelRatio = Math.min(Math.min(devicePixelRatio || 1, 2), pixelRatio + .5); resize(); qCool = 10; qGood = 0; } }
}

// ---------- 主循环 ----------
const dbg = document.getElementById('dbg'); if (DEBUG) dbg.style.display = 'block';
let fpsN = 0, fpsT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (window.__pause) { last = now; return; }
  if (wrap.clientWidth !== lastW || wrap.clientHeight !== lastH) resize();
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  autoQuality(dt);
  advance(dt);
  P.resize(lastH, renderer.getPixelRatio(), camera.fov);
  renderer.render(scene, camera);
  if (DEBUG) {
    fpsN++; fpsT += dt;
    if (fpsT > .5) { const i = renderer.info.render; dbg.textContent = `${Math.round(fpsN / fpsT)} fps  px ${pixelRatio}\ncalls ${i.calls}  tris ${(i.triangles / 1000).toFixed(1)}k\n${S ? `pts ${Math.round(S.pts)} stage ${S.stage} n ${S.creatures.length}\n${S.hero.medium} y ${S.hero.y.toFixed(1)} ${zoneAt(S.hero.x, S.hero.z)}` : ''}`; fpsN = fpsT = 0; }
  }
}
resize();
document.getElementById('boot').style.opacity = 0; setTimeout(() => document.getElementById('boot').remove(), 700);
window.__booted = true;

// 调试 / 录像钩子
window.__dg = {
  get S() { return S; }, input, dragon, camera, scene, renderer, ui, save, ready: false,
  start: k => startGame(k),
  step(n = 1) { for (let i = 0; i < n; i++) step(S, input.read()); },
  frame(dt = 1 / 30) { advance(dt); P.resize(lastH, renderer.getPixelRatio(), camera.fov); renderer.render(scene, camera); },
  render: () => renderer.render(scene, camera),
  setStage: st => { setStage(S, st); return applyHero(S.kind, S.stage, S.hero.len); },
  give: n => { S.pts += n; },
  teleport: (x, y, z) => { Object.assign(S.hero, { x, y, z, px: x, py: y, pz: z }); cam.snap(); },
  goalTarget: () => goalTarget(S), nearestEdible: () => nearestEdible(S),
  get state() { return state; },
};

if (Q.has('autostart') || REC) startGame(Q.get('kind') || kind);
else ui.showTitle(save);
requestAnimationFrame(frame);
