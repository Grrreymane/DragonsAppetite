// 金色领头 + 特性：出现、追、抓到学会特性（只给一次）、跑掉不给、和猎场互斥、特性效果有上限
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim/sim.js';
import { makeBot, TIERS } from '../src/sim/bot.js';
import { TRAITS, TRAIT_LIST, EQUIP_MAX, LEADER_PTS, heatWave, traitOn } from '../src/sim/leaders.js';
import { masteryGoal, MASTERY } from '../src/sim/mastery.js';
import { createHunt, RIVAL_PTS } from '../src/sim/hunts.js';

let checks = 0;
function test(name, fn) { fn(); checks++; console.log(`ok ${checks} - ${name}`); }
// 机器人照常玩；领头在场时朝它飞（chase = false 就躲开它）
function play(S, sec, chase = true, onStep) {
  const bot = makeBot(TIERS[0], 7);
  for (let i = 0; i < sec * 60; i++) {
    let inp = bot(S); const L = S.leader, h = S.hero;
    if (L) {
      const want = Math.atan2(L.x - h.x, L.z - h.z) + (chase ? 0 : Math.PI), d = Math.atan2(Math.sin(want - h.yaw), Math.cos(want - h.yaw));
      inp = { ...inp, jx: Math.max(-1, Math.min(1, -d * 2)), jy: chase ? Math.max(-1, Math.min(1, (h.y - L.y) * .08)) : 0 };
    }
    step(S, inp); if (onStep) onStep(S);
  }
}

for (const kind of ['fire', 'sea']) {
  const trait = kind === 'fire' ? 'ember' : 'eddy';
  test(`${kind}: the first leader appears, can be caught, and teaches ${trait} once`, () => {
    const S = createSim({ kind, seed: 3 }); let cues = 0, caught = 0, overlap = 0; const taught = {};
    play(S, 240, true, S => { for (const e of S.events) { if (e.type === 'leaderCue') cues++; if (e.type === 'trait') taught[e.id] = (taught[e.id] || 0) + 1; if (e.type === 'leaderEnd' && e.caught) caught++; } if (S.leader && S.hunt) overlap++; });
    assert.ok(cues >= 1, 'a leader cue appeared');
    assert.ok(caught >= 1, 'chasing bot caught a leader');
    assert.equal(taught[trait], 1, 'the first trait is taught exactly once');
    for (const id in taught) assert.equal(taught[id], 1, `trait ${id} taught once`);
    assert.equal(S.traits[trait], 1);
    assert.equal(overlap, 0, 'leader and hunt never run at the same time');
  });
  test(`${kind}: ignoring the leader lets it escape without a trait`, () => {
    const S = createSim({ kind, seed: 3 }); let ends = 0;
    play(S, 130, false, S => { for (const e of S.events) if (e.type === 'leaderEnd' && !e.caught) ends++; });
    assert.ok(ends >= 1, 'leader left'); assert.ok(!S.traits[trait], 'no trait without catching');
  });
  test(`${kind}: a saved trait is restored and not granted again`, () => {
    const S = createSim({ kind, seed: 3, traits: { [trait]: 1, bogus: 1 } });
    assert.deepEqual(Object.keys(S.traits), [trait]);
    let traits = 0; play(S, 120, true, S => { for (const e of S.events) if (e.type === 'trait') traits++; });
    assert.equal(traits, 0);
  });
}
test('ember heat wave cooks at most 6 and heat-cooked prey do not chain', () => {
  const S = createSim({ kind: 'fire', seed: 5, traits: { ember: 1 } }); step(S, { jx: 0, jy: 0 });
  const c = S.creatures.find(o => o.edible); assert.ok(c);
  for (const o of S.creatures) { o.x = c.x + (o.id % 5); o.y = c.y; o.z = c.z; }
  c.cooked = 1; S.events.length = 0; heatWave(S, c);
  const n = S.creatures.filter(o => o.heat).length; assert.ok(n > 0 && n <= 6, `cooked ${n}`);
  const o = S.creatures.find(o => o.heat); S.events.length = 0; heatWave(S, o);
  assert.equal(S.events.length, 0, 'heat-cooked prey start no new wave');
});
// 天敌抢食（猎场升级版）
test('first hunt of a kind never brings a rival; later ones may', () => {
  const S = createSim({ kind: 'sea', seed: 3 }); step(S, { jx: 0, jy: 0 });
  const h1 = createHunt(S); assert.ok(h1); assert.equal(h1.rival.planned, false);
});
test('a rival steals hunt prey, and eating it pays RIVAL_PTS exactly once', () => {
  const S = createSim({ kind: 'sea', seed: 3, stage: 2, discoveries: { tide: { found: 1, best: 0, completed: 0 } } }); step(S, { jx: 0, jy: 0 });
  S.leaderNext = 1e9; S.stats.eaten = 2;
  const hu = createHunt(S); assert.ok(hu); hu.rival.planned = true; hu.rival.at = 0;
  let stolen = 0, paid = 0, n = 0;
  for (let i = 0; i < 60 * 30 && S.hunt; i++) {
    if (S.hunt.phase === 'cue') Object.assign(S.hero, { x: S.hunt.x, y: S.hunt.y, z: S.hunt.z });
    step(S, { jx: 0, jy: 0 });
    for (const e of S.events) { if (e.type === 'rivalEat') stolen++; if (e.type === 'huntRivalEaten') { paid += e.pts; n++; } }
    const rv = S.hunt && S.hunt.rival.id > 0 && S.creatures.find(c => c.id === S.hunt.rival.id);
    if (rv && i > 240 && i % 30 === 0) Object.assign(S.hero, { x: rv.x, y: rv.y, z: rv.z - 2, px: rv.x, py: rv.y, pz: rv.z - 2 });   // 成龙去吃它
  }
  assert.ok(stolen >= 1, 'rival stole at least one');
  assert.ok(n <= 1 && paid === n * RIVAL_PTS, `paid ${paid} over ${n} events`);
});
// 特性 v2：每条龙 3 个、最多带 2 个；后两个少年起才出领头
test('baby leaders only teach the stage-0 trait; teen leaders teach the others', () => {
  for (const kind of ['fire', 'sea']) {
    const S = createSim({ kind, seed: 4 }); const seen = new Set();
    play(S, 200, true, S => { if (S.leader) seen.add(S.leader.trait); if (S.stage > 0) S.stage = 0; });
    for (const id of seen) assert.equal(TRAITS[id].stage, 0, `${kind} baby saw ${id}`);
    const T = createSim({ kind, seed: 4, stage: 1, traits: { [TRAIT_LIST[kind][0]]: 1 } }); let first = null;
    play(T, 150, true, S => { if (S.leader && !first) first = S.leader.trait; });
    assert.equal(first, TRAIT_LIST[kind][1], `${kind} teen gets the next trait first`);
  }
});
test('at most two traits are equipped; a third is learned but not worn', () => {
  const all = Object.fromEntries(TRAIT_LIST.fire.map(id => [id, 1]));
  const S = createSim({ kind: 'fire', seed: 4, stage: 2, traits: all });
  assert.equal(S.equip.length, EQUIP_MAX);
  assert.ok(!traitOn(S, TRAIT_LIST.fire[2]));
  const R = createSim({ kind: 'fire', seed: 4, stage: 2, traits: all, equip: ['skimF', 'echo', 'ember'] });
  assert.deepEqual(R.equip, ['skimF', 'echo']);
});
test('echo roar fires a second, smaller roar once', () => {
  const S = createSim({ kind: 'fire', seed: 4, stage: 2, traits: { echo: 1 }, equip: ['echo'] }); step(S, { jx: 0, jy: 0 });
  let roars = [];
  for (let i = 0; i < 60 * 3; i++) { step(S, { jx: 0, jy: 0, skillTap: i === 1 }); for (const e of S.events) if (e.type === 'skill') roars.push(e); }
  assert.equal(roars.length, 2); assert.ok(roars[1].echo && roars[1].r < roars[0].r);
});
// 成年精通：目标 = 纪录 + 步长，三种轮流
test('mastery goals rotate and always ask to beat the record', () => {
  const S = createSim({ kind: 'sea', seed: 4, stage: 2, best: { combo: 12, skill: 1, cross: 'x' } });
  const a = masteryGoal(S), b = masteryGoal(S), c = masteryGoal(S);
  assert.deepEqual([a.m, b.m, c.m], ['combo', 'skill', 'cross']);
  assert.equal(a.n, 12 + MASTERY.combo.step); assert.equal(b.n, MASTERY.skill.base); assert.equal(c.n, MASTERY.cross.base);
});
console.log(`Leader / trait regression: ${checks} checks passed.`);
