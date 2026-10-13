import assert from 'node:assert/strict';
import { loadSave, writeSave } from '../src/sys/save.js';
import { createSim } from '../src/sim/sim.js';

const entries = new Map();
globalThis.localStorage = {
  getItem: key => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, String(value)),
};
let checks = 0;
function test(name, run) { entries.clear(); run(); console.log(`ok ${++checks} - ${name}`); }

test('old saves keep growth, goals and codex while adding an empty exploration book', () => {
  const old = { v: 1, pick: 'sea', fire: { stage: 2, pts: 531, goal: 2, playSec: 122 }, sea: { stage: 1, pts: 134, eaten: 74 }, codex: { sardine: { n: 63, gold: 2 } }, tut: { drag: 1 } };
  entries.set('dragon_v1', JSON.stringify(old));
  const save = loadSave();
  assert.deepEqual(save.discoveries, {});
  assert.equal(save.fire.pts, old.fire.pts); assert.equal(save.fire.goal, 2);
  assert.equal(save.sea.stage, 1); assert.equal(save.sea.eaten, 74);
  assert.deepEqual(save.codex, old.codex); assert.equal(save.tut.drag, 1);
  for (const kind of ['fire', 'sea']) {
    const S = createSim({ kind, ...save[kind], codex: save.codex, discoveries: save.discoveries });
    assert.deepEqual(S.discoveries, {}); assert.equal(S.stage, old[kind].stage);
  }
});

test('both discovered habitats survive save/load and switching dragon', () => {
  const save = loadSave();
  save.discoveries = { cloud: { found: 1, best: 9, completed: 2 }, tide: { found: 1, best: 14, completed: 3 } };
  save.fire.pts = 400; save.fire.stage = 2;
  writeSave(save);
  for (const kind of ['fire', 'sea']) {
    const loaded = loadSave();
    const S = createSim({ kind, discoveries: loaded.discoveries });
    assert.deepEqual(S.discoveries, save.discoveries);
    S.discoveries.cloud.best = 99;
    assert.equal(loaded.discoveries.cloud.best, 9);
    assert.equal(loadSave().discoveries.cloud.best, 9);
  }
  assert.equal(loadSave().fire.pts, 400);
});

test('discovery data never carries an in-progress hunt or grants growth on load', () => {
  const S = createSim({ discoveries: { cloud: { found: 1, best: 11, completed: 2 } } });
  assert.equal(S.hunt, null); assert.equal(S.pts, 0); assert.equal(S.stats.eaten, 0);
  assert.equal(S.discoveries.cloud.best, 11);
});

test('malformed JSON is backed up without preventing a fresh game', () => {
  const raw = '{broken'; entries.set('dragon_v1', raw);
  const save = loadSave();
  assert.equal(entries.get('dragon_v1_bak'), raw);
  assert.deepEqual(save.discoveries, {});
  assert.equal(createSim({ discoveries: save.discoveries }).stage, 0);
});

test('unavailable local storage still allows play and discovery records', () => {
  const storage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  try { const save = loadSave(); writeSave(save); assert.deepEqual(createSim({ discoveries: save.discoveries }).discoveries, {}); }
  finally { globalThis.localStorage = storage; }
});
console.log(`Discovery save regression: ${checks} checks passed.`);
