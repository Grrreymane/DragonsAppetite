// glb 瘦身前后对比（配 _lab/pipedoc_slim.html）：每段动作 4 个时刻，打印骨头 / 蒙皮顶点的最大位置差，每段存一张左右对比图
//   python tools/rec3d.py --page _lab/pipedoc_slim.html --director tools/scenarios/pipedoc_slim.js --query "a=models/fire_baby_anim.glb&b=.cache/check/pipedoc/fire_baby_slim.glb" --size 900x600 --out .cache/check/pipedoc/cmp_fire_baby
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 50); k(); });
await wait(() => window.__lab && window.__lab.ready);
const L = window.__lab;
let worst = 0;
for (const [clip, dur] of L.clips) {
  const out = [];
  for (const f of [0, .25, .5, .75]) {
    L.set(clip, dur * f); const d = L.diff(); worst = Math.max(worst, d.vert);
    out.push(`${(dur * f).toFixed(2)}s 骨 ${d.bone.toFixed(5)} 顶点 ${d.vert.toFixed(5)}`);
  }
  __log(`${clip.padEnd(6)} ${out.join(' | ')}`);
  L.set(clip, dur * .25); L.render(); await __shot(clip);
}
__log(`最大顶点差 ${worst.toFixed(5)}（模型单位，模型约 1 长；< 0.002 算看不出来）`);
await __done();
