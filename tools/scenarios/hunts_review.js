// Visual QA: naturally steer through one hunt, using the existing action/skill inputs.
// python tools/rec3d.py --dom --director tools/scenarios/hunts_review.js --query 'kind=fire&stage=1' --out .cache/hunts/fire
const { createHunt } = await import('/src/sim/hunts.js');
const { clamp, wrapAngle } = await import('/src/sim/rng.js');
await new Promise(resolve => { const wait = () => window.__dg?.ready ? resolve() : setTimeout(wait, 100); wait(); });
window.__pause = true;
const D = window.__dg, S = D.S, fps = 30;
// Let introductory cards finish before inspecting the new encounter card.
for (let i = 0; i < 4 * fps; i++) D.frame(1 / fps);
const hunt = S.hunt || createHunt(S);
if (!hunt) throw new Error('No safe hunt could be created for this scenario.');
const seen = new Set(), eatenAt = S.stats.eaten, skillsAt = S.stats.skills;
function drive() {
  const h = S.hero, hunt = S.hunt;
  let target = hunt;
  if (hunt?.phase !== 'cue') {
    let best = Infinity;
    for (const c of S.creatures) {
      if (c.huntId !== hunt?.id || c.dying) continue;
      const d = Math.hypot(c.x - h.x, c.y - h.y, c.z - h.z);
      if (d < best) { best = d; target = c; }
    }
  }
  if (!target) { D.input.jx = D.input.jy = 0; D.input.btn = false; return; }
  const dx = target.x - h.x, dy = target.y - h.y, dz = target.z - h.z;
  const yaw = wrapAngle(Math.atan2(dx, dz) - h.yaw), dist = Math.hypot(dx, dy, dz);
  D.input.jx = clamp(-yaw * 2.2, -1, 1);
  D.input.jy = clamp(-Math.atan2(dy, Math.hypot(dx, dz)) / S.cfg.pitchK, -1, 1);
  D.input.btn = S.kind === 'fire' && hunt?.phase !== 'cue' && dist < S.cfg.fireRange;
  if (S.kind === 'sea' && hunt?.phase === 'chase' && Math.abs(yaw) < .35 && dist > 10 && h.dashCd <= 0) D.input.actTap = true;
  if (hunt?.phase === 'finale' && h.skill?.cd <= 0 && dist < h.skill.r * .8) D.input.skillTap = true;
}
for (let i = 0; i < 48 * fps; i++) {
  drive(); D.frame(1 / fps);
  const current = S.hunt;
  const phase = current?.id === hunt.id ? current.phase : 'end';
  const name = phase === 'chase' && current.elapsed > 5 ? 'chase' : phase === 'finale' ? 'finale' : phase === 'cue' ? 'cue' : phase === 'end' ? 'end' : null;
  if (name && !seen.has(name)) { seen.add(name); await __shot(name); }
  if (i % (fps * 4) === 0) __log(JSON.stringify({ t: +S.t.toFixed(1), phase, caught: current?.caught, pos: [hRound(S.hero.x), hRound(S.hero.y), hRound(S.hero.z)], calls: D.renderer.info.render.calls }));
  if (phase === 'end') break;
}
function hRound(v) { return +v.toFixed(1); }
__log(JSON.stringify({ discoveries: S.discoveries, saved: D.save.discoveries, seen: [...seen], caught: hunt.caught, eaten: S.stats.eaten - eatenAt, skills: S.stats.skills - skillsAt }));
D.ui.showCodex(D.save);
await new Promise(resolve => setTimeout(resolve, 400));
D.render(); await __shot('discoveries');
await __done();