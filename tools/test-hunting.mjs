import assert from 'node:assert/strict';
import { createSim, step, DT } from '../src/sim/sim.js';
import { updateLock, assistSteer } from '../src/sim/assist.js';
import { makeGroup } from '../src/sim/creatures.js';
import { clamp, wrapAngle } from '../src/sim/rng.js';
import { runOne } from './sim.mjs';
import { TIERS } from '../src/sim/bot.js';

const right = { jx: -1, jy: 0, act: false, actTap: false };
const neutral = { ...right, jx: 0 };
const left = { ...right, jx: 1 };
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`ok ${checks} - ${name}`); }
function scene({ kind = 'fire', stage = 1, sp = 'sparrow', x = 18, y, z = 0, heroY } = {}) {
  const S = createSim({ kind, stage, seed: 31 });
  S.creatures = []; S.groups = []; S.spots = []; S.spawnT = Infinity;
  S.hero.y = heroY ?? (kind === 'fire' ? 60 : -6);
  y ??= S.hero.y;
  makeGroup(S, sp, x, y, z, 1);
  const c = S.creatures[0];
  Object.assign(c, { x, y, z, age: 1, size: c.baseSize, edible: true, edibleCooked: true });
  return { S, c };
}

test('active turn acquires reachable prey beside the flight path', () => {
  const { S, c } = scene(); assert.equal(updateLock(S, right, DT), c);
});
test('keeping a side target does not replay the lock event every frame', () => {
  const { S, c } = scene(); updateLock(S, right, DT); S.events.length = 0;
  assert.equal(updateLock(S, right, DT), c); assert.equal(S.events.length, 0);
});
test('neutral input does not turn the dragon toward side prey', () => {
  const { S } = scene(); assert.equal(updateLock(S, neutral, DT), null);
});
test('opposite input does not acquire side prey', () => {
  const { S } = scene(); assert.equal(updateLock(S, left, DT), null);
});
test('side assistance does not acquire distant or rear prey', () => {
  for (const options of [{ x: 40 }, { x: 10, z: -18 }]) {
    const { S } = scene(options); assert.equal(updateLock(S, right, DT), null);
  }
});
test('normal forward acquisition still works with neutral input', () => {
  const { S, c } = scene({ x: 0, z: 20 }); assert.equal(updateLock(S, neutral, DT), c);
});
test('opposing a retained lock releases it and honors the cooldown', () => {
  const { S } = scene({ x: 12, z: 18 }); updateLock(S, right, DT);
  for (let i = 0; i < 32; i++) assistSteer(S, left, updateLock(S, left, DT));
  assert.equal(S.hero.lock, 0); assert.ok(S.hero.lockCd > 0);
  assert.equal(updateLock(S, right, DT), null);
});
test('baby dragons cannot lock across the water boundary', () => {
  const fire = scene({ stage: 0, sp: 'sardine', heroY: 5, y: -2 });
  const sea = scene({ kind: 'sea', stage: 0, sp: 'gull', heroY: -6, y: 3 });
  assert.equal(updateLock(fire.S, right, DT), null);
  assert.equal(updateLock(sea.S, right, DT), null);
});
test('fire dragons cannot acquire fish below their plunge depth', () => {
  const { S } = scene({ sp: 'sardine', heroY: 5, y: -15 });
  assert.equal(updateLock(S, right, DT), null);
});
test('side acquisition does not pull prey through the dragon flank', () => {
  const { S, c } = scene(); step(S, right); assert.equal(c.lunged, undefined);
});
test('steering toward nearby fish breaks the repeated turning circle', () => {
  const { S, c } = scene({ sp: 'sardine', x: 18, y: -2.2, heroY: 5 });
  c.g.spot = 10000; c.g.home = { x: 18, y: -2.2, z: 0 };
  let caught = false;
  for (let i = 0; i < 10 / DT; i++) {
    const h = S.hero, dx = c.x - h.x, dy = c.y - h.y, dz = c.z - h.z;
    const yawErr = wrapAngle(Math.atan2(dx, dz) - h.yaw);
    const pitch = Math.atan2(dy, Math.hypot(dx, dz));
    step(S, { ...neutral, jx: clamp(-yawErr * 2.2, -1, 1), jy: clamp(-pitch / S.cfg.pitchK, -1, 1) });
    if (S.events.some(e => e.type === 'eat')) { caught = true; break; }
  }
  assert.ok(caught, 'a reachable fish must be caught within 10 seconds of continuous pursuit');
});
test('spawning rescue prey does not reset the real no-eat timer', () => {
  const { S } = scene(); S.creatures = []; S.groups = []; S.spawnT = 0;
  S.goal = { type: 'grow', n: 1, have: 0, done: false }; S.noEat = 20;
  step(S, neutral); assert.ok(S.noEat > 20); assert.ok(S.creatures.length > 0);
});
test('simulation reports the unfinished no-eat interval', () => {
  const r = runOne('fire', TIERS[0], 1000, .001);
  assert.equal(r.eats, 0); assert.equal(r.maxGap, r.t); assert.ok(r.maxGap > 0);
});
console.log(`${checks} hunting regression checks passed.`);
