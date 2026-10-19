// 金色领头 + 特性：出现、追、抓到学会特性（只给一次）、跑掉不给、和猎场互斥、特性效果有上限
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim/sim.js';
import { makeBot, TIERS } from '../src/sim/bot.js';
import { TRAITS, LEADER_PTS, heatWave } from '../src/sim/leaders.js';

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
    const S = createSim({ kind, seed: 3 }); let cues = 0, traits = 0, caught = 0, overlap = 0;
    play(S, 240, true, S => { for (const e of S.events) { if (e.type === 'leaderCue') cues++; if (e.type === 'trait') traits++; if (e.type === 'leaderEnd' && e.caught) caught++; } if (S.leader && S.hunt) overlap++; });
    assert.ok(cues >= 1, 'a leader cue appeared');
    assert.ok(caught >= 1, 'chasing bot caught a leader');
    assert.equal(traits, 1, 'the trait event fires only on the first catch');
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
console.log(`Leader / trait regression: ${checks} checks passed.`);
