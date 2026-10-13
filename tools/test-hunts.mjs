import assert from 'node:assert/strict';
import { createSim, step, DT } from '../src/sim/sim.js';
import { createHunt, stepHunts, recordHuntEat } from '../src/sim/hunts.js';
import { stepCreatures, manageSpawns } from '../src/sim/creatures.js';
import { groundAt, seabedY, SKY_CAP } from '../src/sim/world.js';
import { clamp, wrapAngle } from '../src/sim/rng.js';
import { SPECIES } from '../src/config/species.js';

const neutral = { jx: 0, jy: 0, act: false, actTap: false, skillTap: false };
const keyFor = kind => kind === 'fire' ? 'cloud' : 'tide';
let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`ok ${checks} - ${name}`); }
function scene(kind = 'fire', stage = 0, seed = 31, extra = {}) {
  const S = createSim({ kind, stage, seed, ...extra });
  // Disable unrelated populations so assertions distinguish actual encounter catches.
  S.creatures = []; S.groups = []; S.spots = []; S.spawnT = Infinity; S.goal = null;
  return S;
}
function cue(S) {
  const hunt = createHunt(S);
  assert.ok(hunt, `safe hunt available for ${S.kind} at the starting area`);
  assert.equal(hunt.phase, 'cue');
  return hunt;
}
function worldTick(S, seconds, move = true) {
  for (let n = Math.ceil(seconds / DT); n > 0; n--) {
    S.t += DT; stepHunts(S, DT); if (move) stepCreatures(S, DT);
  }
}
function approach(S) {
  const hunt = S.hunt || cue(S);
  Object.assign(S.hero, { x: hunt.x, y: hunt.y, z: hunt.z });
  stepHunts(S, DT);
  assert.equal(hunt.phase, 'chase');
  return hunt;
}
function steer(S) {
  const h = S.hero, hunt = S.hunt;
  let target = hunt, best = Infinity;
  if (hunt?.phase !== 'cue') for (const c of S.creatures) {
    if (c.huntId !== hunt?.id || c.dying) continue;
    const d = Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z);
    if (d < best) { best = d; target = c; }
  }
  if (!target) return neutral;
  const dx = target.x - h.x, dy = target.y - h.y, dz = target.z - h.z;
  const yaw = wrapAngle(Math.atan2(dx, dz) - h.yaw), dist = Math.hypot(dx, dy, dz);
  return {
    jx: clamp(-yaw * 2.2, -1, 1), jy: clamp(-Math.atan2(dy, Math.hypot(dx, dz)) / S.cfg.pitchK, -1, 1),
    act: S.kind === 'fire' && dist < S.cfg.fireRange,
    actTap: S.kind === 'sea' && hunt?.phase === 'chase' && Math.abs(yaw) < .35 && dist > 10 && h.dashCd <= 0,
    skillTap: hunt?.phase === 'finale' && h.skill?.cd <= 0 && dist < h.skill.r * .8,
  };
}

for (const kind of ['fire', 'sea']) {
  const key = keyFor(kind);
  test(`${kind}: an ignored cue has no discovery, free points, or encounter prey`, () => {
    const S = scene(kind), hunt = cue(S), before = S.pts;
    Object.assign(S.hero, { x: hunt.x - 500, y: hunt.y, z: hunt.z - 500 });
    worldTick(S, 36);
    assert.notEqual(S.hunt?.id, hunt.id);
    assert.equal(S.discoveries[key]?.found || 0, 0);
    assert.equal(S.pts, before); assert.equal(S.stats.eaten, 0);
    assert.equal(S.creatures.filter(c => c.huntId).length, 0);
    assert.equal(S.events.filter(e => e.type === 'huntDiscover').length, 0);
  });

  test(`${kind}: a cue needs 3D proximity before one discovery is recorded`, () => {
    const S = scene(kind), hunt = cue(S), before = S.pts;
    Object.assign(S.hero, { x: hunt.x, y: hunt.y + 120, z: hunt.z });
    stepHunts(S, DT); assert.equal(hunt.phase, 'cue');
    assert.equal(S.discoveries[key]?.found || 0, 0);
    approach(S); worldTick(S, .5);
    assert.equal(S.discoveries[key].found, 1);
    assert.equal(S.events.filter(e => e.type === 'huntDiscover').length, 1);
    assert.equal(S.pts, before, 'discovery records a place; food still needs to be caught');
  });

  test(`${kind}: baby hunt prey are edible and remain in their home habitat`, () => {
    const S = scene(kind), hunt = approach(S);
    worldTick(S, .5);
    const prey = S.creatures.filter(c => c.huntId === hunt.id);
    assert.ok(prey.length >= (kind === 'fire' ? 5 : 7));
    assert.ok(prey.every(c => c.edible && !c.dying));
    assert.ok(prey.every(c => kind === 'fire' ? c.y > 8 : c.y < -2 && c.y > S.cfg.maxDepth));
    assert.equal(S.hero.skill, null, 'encounter access does not require an unlocked skill');
  });

  test(`${kind}: the finale adds exactly one special golden prey`, () => {
    const S = scene(kind), hunt = approach(S);
    Object.assign(S.hero, { x: hunt.x - 50, y: hunt.y, z: hunt.z });
    worldTick(S, 17.5);
    assert.equal(hunt.phase, 'chase');
    assert.equal(S.creatures.filter(c => c.huntId === hunt.id && c.gold).length, 0);
    worldTick(S, 1);
    assert.equal(hunt.phase, 'finale');
    assert.equal(S.creatures.filter(c => c.huntId === hunt.id && c.gold).length, 1);
    worldTick(S, 3);
    assert.equal(S.creatures.filter(c => c.huntId === hunt.id && c.gold).length, 1);
    assert.equal(S.events.filter(e => e.type === 'huntPhase' && e.phase === 'finale').length, 1);
  });

  test(`${kind}: an ordinary bite counts a hunt catch exactly once`, () => {
    const S = scene(kind), hunt = approach(S);
    worldTick(S, 1);
    const c = S.creatures.find(c => c.huntId === hunt.id);
    const h = S.hero;
    Object.assign(h, { x: c.x, y: c.y, z: c.z - h.len * .47, yaw: 0, pitch: 0, yawRate: 0, chewT: 0 });
    step(S, neutral);
    assert.ok(S.stats.eaten > 0, 'the actual mouth interaction must eat prey');
    assert.equal(hunt.caught, S.stats.eaten);
    const caught = hunt.caught;
    recordHuntEat(S, c); recordHuntEat(S, c);
    assert.equal(hunt.caught, caught, 'a removed creature cannot count twice');
    recordHuntEat(S, { id: -1, huntId: -1 });
    assert.equal(hunt.caught, caught, 'ordinary prey do not enter the encounter score');
  });

  test(`${kind}: ending a missed hunt clears its tags and gives no completion`, () => {
    const S = scene(kind), hunt = approach(S), before = S.pts;
    worldTick(S, 27);
    assert.notEqual(S.hunt?.id, hunt.id);
    assert.equal(S.creatures.filter(c => c.huntId === hunt.id).length, 0);
    assert.equal(S.groups.filter(g => g.huntId === hunt.id).length, 0);
    assert.equal(S.discoveries[key].completed || 0, 0); assert.equal(S.discoveries[key].best || 0, 0);
    assert.equal(S.pts, before);
  });

  test(`${kind}: stun and skill control survive encounter movement`, () => {
    const S = scene(kind, 1), hunt = approach(S);
    worldTick(S, 1);
    const c = S.creatures.find(c => c.huntId === hunt.id);
    Object.assign(c, { daze: 2, vx: 0, vy: 0, vz: 0 });
    const p = { x: c.x, y: c.y, z: c.z };
    worldTick(S, .2);
    assert.ok(Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) < .1, 'choreography must not teleport a stunned creature back into formation');
    assert.ok(c.daze > 1.7 && c.daze < 2);
  });

  for (const stage of [0, 1, 2]) test(`${kind} stage ${stage}: normal steering can follow and catch the encounter`, () => {
    const S = scene(kind, stage), hunt = cue(S);
    let ended = null, empty = 0, longestEmpty = 0;
    for (let i = 0; i < 65 / DT; i++) {
      step(S, steer(S));
      ended = S.events.find(e => e.type === 'huntEnd' && e.kind === hunt.kind) || ended;
      if (S.hunt?.id === hunt.id && hunt.phase !== 'cue') {
        const visibleFood = S.creatures.some(c => c.huntId === hunt.id && !c.dying && c.size > .05);
        empty = visibleFood ? 0 : empty + DT; longestEmpty = Math.max(longestEmpty, empty);
      }
      if (S.hunt?.id !== hunt.id) break;
    }
    assert.equal(S.discoveries[key]?.found, 1, 'player should reach the cue by steering');
    assert.ok(hunt.caught >= 3, `caught ${hunt.caught}; route should yield several bites`);
    assert.equal(S.stats.nan || 0, 0); assert.equal(S.stats.stuck || 0, 0);
    assert.ok(ended, 'hunt naturally ends without pausing play');
    assert.ok(longestEmpty <= 3.2, "a successful chase must not leave the player waiting for food: " + longestEmpty.toFixed(2) + ' seconds');
    assert.ok((S.discoveries[key].best || 0) >= hunt.caught);
    console.log(`  ${kind} stage ${stage}: ${hunt.caught}/${hunt.total}, skills ${S.stats.skills}`);
  });
}

test('discovery state is cloned and old saves retain no discovered places', () => {
  const discoveries = { cloud: { found: 1, best: 8, completed: 2 }, tide: { found: 1, best: 11, completed: 3 } };
  const S = createSim({ discoveries });
  assert.deepEqual(S.discoveries, discoveries);
  S.discoveries.cloud.best = 99;
  assert.equal(discoveries.cloud.best, 8);
  const old = createSim();
  assert.equal(old.discoveries.cloud?.found || 0, 0); assert.equal(old.discoveries.tide?.found || 0, 0);
});

test('safe routes clear terrain across many positions, headings and baby/adult stages', () => {
  let safe = 0;
  for (const kind of ['fire', 'sea']) for (const stage of [0, 2]) for (let n = 0; n < 60; n++) {
    const S = scene(kind, stage, n * 71 + 3, { x: Math.sin(n * 2.4) * 1150, z: Math.cos(n * 1.7) * 1150, yaw: n * .71 });
    const hunt = createHunt(S); if (!hunt) continue;
    safe++;
    assert.ok(hunt.route.length >= 3);
    const all = [{ x: S.hero.x, y: S.hero.y, z: S.hero.z }, ...hunt.route];
    // The route itself, including between control points, must stay out of hills and shallow seabed.
    for (let j = 1; j < all.length; j++) {
      const a = all[j - 1], b = all[j];
      for (let k = 0; k <= 20; k++) {
        const t = k / 20, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
        // Random spawn positions can begin inside an island; only authored hunt route points are constrained.
        if (j === 1) continue;
        if (kind === 'fire') { assert.ok(y > groundAt(x, z) + 8); assert.ok(y < SKY_CAP); }
        else { assert.ok(y > seabedY(x, z) + 2); assert.ok(y < -2); assert.ok(y > S.cfg.maxDepth); }
      }
    }
  }
  assert.ok(safe >= 100, `${safe} safe routes found in 240 attempts`);
});

test('ordinary hunger rescue still runs during an ignored cue without resetting the gap', () => {
  const S = scene('fire'); cue(S); S.spawnT = 0; S.noEat = 20;
  step(S, neutral);
  assert.ok(S.noEat > 20); assert.ok(S.creatures.some(c => !c.huntId));
});
for (const kind of ['fire', 'sea']) {
  const key = keyFor(kind), species = kind === 'fire' ? 'sparrow' : 'sardine';
  test(`${kind}: revisiting a saved place preserves best and adds one actual completion`, () => {
    const previous = { [key]: { found: 1, best: 100, completed: 2 } };
    const S = scene(kind, 1, 19, { discoveries: previous }), hunt = cue(S);
    for (let i = 0; i < 65 / DT; i++) {
      step(S, steer(S));
      const discovery = S.events.find(e => e.type === 'huntDiscover');
      if (discovery) assert.equal(discovery.first, false);
      if (S.hunt?.id !== hunt.id) break;
    }
    assert.equal(hunt.first, false); assert.ok(hunt.caught >= 7);
    assert.equal(S.discoveries[key].best, 100); assert.equal(S.discoveries[key].completed, 3);
    assert.deepEqual(previous[key], { found: 1, best: 100, completed: 2 });
    const restored = createSim({ kind, discoveries: S.discoveries });
    assert.deepEqual(restored.discoveries, S.discoveries);
    assert.equal(restored.hunt, null, 'reload preserves records without restarting an old reward sequence');
  });

  test(`${kind}: repeated skipped hunts keep encounter and creature populations bounded`, () => {
    const S = scene(kind, 1, 7);
    S.stats.eaten = 1;
    let discoveries = 0, maxTagged = 0, maxSpecies = 0, lastHunt = null;
    // A player circles in one area for eight minutes, approaching each cue but leaving its food.
    // Ordinary creature recycling runs at the same half-second cadence as the real simulation.
    for (let i = 0; i < 8 * 60 / DT; i++) {
      S.t += DT;
      if (S.hunt?.phase === 'cue' && S.hunt !== lastHunt) {
        lastHunt = S.hunt;
        Object.assign(S.hero, { x: S.hunt.x, y: S.hunt.y, z: S.hunt.z });
        discoveries++;
      }
      stepHunts(S, DT); stepCreatures(S, DT);
      if (i % 30 === 0) manageSpawns(S);
      const tagged = S.creatures.filter(c => c.huntId && !c.dying);
      maxTagged = Math.max(maxTagged, tagged.length);
      maxSpecies = Math.max(maxSpecies, S.creatures.filter(c => c.sp === species && !c.dying).length);
      assert.ok(tagged.every(c => c.huntId === S.hunt?.id));
    }
    assert.ok(discoveries >= 4, `${discoveries} visits should exercise multiple expiry/cooldown cycles`);
    assert.ok(maxTagged <= (kind === 'fire' ? 21 : 30));
    assert.ok(maxSpecies <= SPECIES[species].max + (kind === 'fire' ? 42 : 60), `${maxSpecies} ${species} exceeded the normal cap plus two recent hunts`);
    assert.equal(S.discoveries[key].completed, 0); assert.equal(S.discoveries[key].best, 0);
    console.log(`  ${kind}: ${discoveries} skipped visits, at most ${maxSpecies} ${species}`);
  });
}
console.log(`${checks} encounter regression checks passed.`);
