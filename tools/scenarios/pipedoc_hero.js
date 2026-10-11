// 主角模型自查剧本（_workflow/HERO_3D_PIPELINE.md S14）：固定操作，不靠机器人，每次录出来都一样，方便前后对比。
// 先瞬移到开阔海面 → 直游/直飞 → 右转（摇杆 0.8）4 秒 → 回正 → 满舵右转（摇杆 1）2 秒 → 回正 → 动作键（喷火 / 冲刺）
//   → 扎水再出水（火龙）/ 跃出再落水（海龙），都等到真的换了介质 → 再瞬移到开阔海面，镜头绕龙一圈
// 终端里每段打印一行：帧号（对应 <out>_frames/ 里的文件名）、脖子各骨的偏航 / 俯仰、yawRate（sim 的转向速度）、
//   lock（自动瞄准锁定的猎物 id，0 = 没锁）、看得见的嘴尖在前方几倍体长（括号里是 sim 判定嘴的 mouthK；转弯行再给「÷直行」的比例）、
//   嘴差（看得见的嘴和 sim 判定嘴的三维距离，÷ 嘴半径，拆成前 / 上 / 左三项；最后一行汇总，直行合格线 ≤0.3×嘴半径）、
//   静止网格长（从 glb 网格量的，和清单 length 无关）/ sim 体长、介质和高度、绘制调用和三角面
// v2 有捕猎辅助（sim/assist.js，自动转向猎物）。不关掉它，「回正后脖子偏航回 0」这条判据会被自动转向带偏，
//   所以剧本在 setStage 之后把 assist 的范围设成 0（只改这一局的 S.cfg 副本，不动 config/dragons.js）。
//   判据只在 yawRate≈0（|yawRate| < 0.05）的行上看。
// 用法（URL 参数走 --query：kind=fire|sea，stage=0|1|2，fast=1 只存截图不录视频，assist=1 保留捕猎辅助）：
//   PYTHONIOENCODING=utf-8 python tools/rec3d.py --page index.html --director tools/scenarios/pipedoc_hero.js --query "kind=sea&stage=2" --size 540x960 --out .cache/rec/hero_sea_adult.mp4 --sheet 0.5
const Q = new URLSearchParams(location.search);
const FAST = Q.has('fast'), KEEP_ASSIST = Q.get('assist') === '1';
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__dg.dragon && window.__dg.dragon.model);
window.__pause = true;
const D = window.__dg, G = D.dragon, fps = 30;
// ?stage= 开局时模型按「幼龙体长」建（S.hero.len 还没跟上），先走一步再重建一次，大小才对
D.step(1); await D.setStage(D.S.stage);
// 关掉捕猎辅助：S.cfg 指向 config/dragons.js 里的对象，所以换成副本再改（进化时 sim 会换回原对象，每帧都检查一次）
function noAssist() {
  if (KEEP_ASSIST) return;
  const S = D.S;
  if (S.cfg.assist && (S.cfg.assist.range || S.cfg.assist.cone)) S.cfg = { ...S.cfg, assist: { range: 0, cone: 0 } };
  S.hero.lock = 0;
}
noAssist();
// 岛表（和游戏用的是同一个模块实例；就算不是，固定种子生成的岛也一样）
const W = await import('./src/sim/world.js');
const V3 = D.camera.position.constructor, Qt = D.camera.quaternion.constructor;
const kind = D.S.kind, man = G.man || {};
// 「临时」角标（没有清单、用成龙模型顶替时出现）：普通录像不截 DOM，这里直接读元素
const tempEl = document.querySelector('.d-temp');
const temp = tempEl ? (tempEl.hidden ? 'no' : 'YES（这个阶段在用顶替模型）') : '找不到 .d-temp';
__log(`HERO ${G.name} kind=${kind} stage=${D.S.stage} len=${D.S.hero.len.toFixed(2)}m scale=${G.scale.toFixed(2)} clips=${Object.keys(G.act).join(',')} assist=${KEEP_ASSIST ? 'on' : 'off'} canCross=${!!D.S.cfg.canCross} turn=${D.S.cfg.turn} temp=${temp}`);

// 找一块开阔海面：从 (x,z) 沿当前朝向往前 len 米、左右 side 米内没有岛（岛的 reach + 余量）
function clearAt(x, z, yaw, len, side) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (let s = -side; s <= len; s += 8) {
    const px = x + fx * Math.max(0, s), pz = z + fz * Math.max(0, s);
    for (const is of W.islands) {
      const d = Math.hypot(W.wrapP(px - is.x), W.wrapP(pz - is.z));
      if (d < (is.reach || is.r * 1.4) + side) return false;
    }
  }
  return true;
}
function toOpenSea(len, side, y) {
  const h = D.S.hero;
  for (let ring = 0; ring < 40; ring++) {
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, r = ring * 40, x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
      if (clearAt(x, z, h.yaw, len, side)) { D.teleport(x, y, z); return [Math.round(x), Math.round(z)]; }
    }
  }
  D.teleport(h.x, y, h.z); return null;
}

// 骨头在龙自己坐标系里的朝向：[偏航(度，正=往龙的左边), 俯仰(度，正=往上)]。导出的骨头局部 +Y = 骨头方向
const neckNames = [...(man.neckBones || ['neck1', 'neck2']), man.headBone || 'head'].filter((n, i, a) => a.indexOf(n) === i);
function dirOf(n) {
  const b = G.bone(n); if (!b) return null;
  const inv = G.root.getWorldQuaternion(new Qt()).invert();
  const v = new V3(0, 1, 0).applyQuaternion(b.getWorldQuaternion(new Qt())).applyQuaternion(inv);
  return [Math.round(Math.atan2(v.x, v.z) * 57.3), Math.round(Math.atan2(v.y, Math.hypot(v.x, v.z)) * 57.3)];
}
// 静止网格长（米）：网格在绑定姿势下沿模型前后方向（glTF 的 x = Blender 的 x）的长度 × 世界缩放。
// 和清单的 length 无关，所以能查出「改形后清单 length 没跟着改」：那时它和 sim 体长对不上（游戏缩放 = 体长 ÷ 清单 length）。
function restMeshLen() {
  let best = 0; const seen = new Set();
  G.model.traverse(o => {
    if (!o.isSkinnedMesh || seen.has(o.geometry)) return; seen.add(o.geometry);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox, sx = new V3().setFromMatrixColumn(o.matrixWorld, 0).length();
    best = Math.max(best, (bb.max.x - bb.min.x) * sx);
  });
  return best;
}
let straightAhead = null;               // 直行时「嘴在前方」的值，转弯行拿它比
// 嘴差：看得见的嘴（G.mouth()）和 sim 判定的嘴之间的三维距离。sim 的判定嘴 = 身体位置 + 朝向 × mouthK × 体长（src/sim/hero.js 的 heroMouth），
//   这里用渲染出来的身体位置当基准（猎物也是按渲染位置画的，玩家看到的就是这个差）。÷ 嘴半径（S.cfg.mouthR × sizeK，吃到的距离 = 它 + 猎物半径）。
//   拆成三项（龙自己的坐标，正 = 看得见的嘴更靠 前 / 上 / 左）：前后多 → 清单 mouth / pivot；上下多 → sim 不管嘴的高度；左右多 → 转弯时脖子转太多
const mouthGaps = [];                   // [tag, 嘴差÷嘴半径, yawRate]，最后汇总
function mouthGap(h, f) {
  const mR = (D.S.cfg.mouthR || 0) * (h.sizeK || 1);
  const sim = G.root.position.clone().addScaledVector(f, (h.mouthK || .47) * h.len);
  const g = G.mouth(new V3()).sub(sim), q = G.root.quaternion;
  const up = new V3(0, 1, 0).applyQuaternion(q), left = new V3(1, 0, 0).applyQuaternion(q);
  const d = g.length(), r = mR ? d / mR : 0, s = x => (x >= 0 ? '+' : '') + x.toFixed(2);
  return { r, txt: `嘴差 ${d.toFixed(2)}m=${r.toFixed(2)}×嘴半径${mR.toFixed(1)}m(前${s(g.dot(f))} 上${s(g.dot(up))} 左${s(g.dot(left))})` };
}
function report(tag, note = '') {
  const h = D.S.hero, parts = neckNames.map(n => `${n}${JSON.stringify(dirOf(n))}`).join(' ');
  // 嘴：看得见的嘴尖在身体中心前方多远（÷ sim 体长）；sim 的判定嘴在 mouthK × 体长（main.js 按清单算好传给 S.hero.mouthK，没清单时 0.47）
  const m = G.mouth(new V3()).sub(G.root.position), f = G.forward(new V3());
  const ahead = m.dot(f) / h.len;
  const mg = mouthGap(h, f); mouthGaps.push([tag.trim(), mg.r, h.yawRate || 0]);
  const ri = D.renderer.info.render, yr = h.yawRate || 0, turning = Math.abs(yr) >= .05;
  if (!turning && h.medium === (kind === 'fire' ? 'air' : 'water') && straightAhead === null) straightAhead = ahead;
  const ratio = turning && straightAhead ? ` ÷直行 ${(ahead / straightAhead).toFixed(2)}${ahead / straightAhead < .9 ? ' <0.9 嘴跑到侧面了' : ''}` : '';
  const flag = turning ? ' (在转向，偏航判据不看这行)' : '';
  const rest = restMeshLen();
  __log(`${tag.padEnd(9)} f${String(n).padStart(4, '0')} ${parts} | yawRate ${yr.toFixed(3)} lock ${h.lock || 0}${flag} | 嘴在前方 ${ahead.toFixed(2)}×体长(sim ${(h.mouthK || .47).toFixed(2)})${ratio} | ${mg.txt} | 静止网格长 ${rest.toFixed(2)}m sim长 ${h.len.toFixed(2)}m${Math.abs(rest / h.len - 1) > .02 ? ' 差>2%：清单 length 过时？' : ''} | ${h.medium} y=${h.y.toFixed(1)} | calls ${ri.calls} tris ${(ri.triangles / 1000).toFixed(1)}k${note}`);
}
let n = 0;
async function cap() { if (FAST) { if (n % 30 === 0) await __shot('f' + String(n).padStart(4, '0')); } else await __frame(); n++; }
async function tick(o, onFrame, t) {
  noAssist();
  D.input.jx = o.jx || 0; D.input.jy = o.jy || 0; D.input.btn = !!o.btn; if (o.tap) D.input.actTap = true;
  D.frame(1 / fps);
  if (onFrame) onFrame(t);
  await cap();
}
async function play(secs, ctl, onFrame) {
  for (let i = 0; i < secs * fps; i++) await tick(ctl(i / fps), onFrame, i / fps);
}
// 一直按 ctl 操作，直到 cond() 成立（返回用了几秒），最多 maxSecs 秒（返回 null）
async function playUntil(cond, maxSecs, ctl) {
  for (let i = 0; i < maxSecs * fps; i++) { if (cond()) return i / fps; await tick(ctl(i / fps)); }
  return cond() ? maxSecs : null;
}
const med = want => () => D.S.hero.medium === want;
// 先到开阔海面、安全高度：火龙在空中、海龙在水下巡游（前方 260 米、左右 40 米没有岛，转弯那几秒也不撞）
const cruiseY = kind === 'fire' ? Math.max(D.S.hero.y, 60) : Math.min(D.S.hero.y, -12);
__log(`开阔海面 ${JSON.stringify(toOpenSea(260, 40, cruiseY))}`);

await play(2, () => ({}));                                  report('直行 2s');
await play(1, () => ({ jx: .8 }));                          report('右转 1s');
await play(3, () => ({ jx: .8 }));                          report('右转 4s');
await play(3, () => ({}));                                  report('回正 3s');
await play(2, () => ({ jx: 1 }));                           report('满舵右转2s');
await play(3, () => ({}));                                  report('回正 3s');
// 转了快一整圈，前面可能有岛：按现在的朝向再找一块开阔海面（扎水 / 跃出那几帧别被岛挡住）
__log(`动作前开阔海面 ${JSON.stringify(toOpenSea(260, 40, cruiseY))}`);
if (kind === 'fire') await play(2, () => ({ btn: true }));  // 喷火：看火是不是从嘴里出来
else await play(2, t => ({ tap: t < .05 }));                 // 冲刺：Dash 动作 + 斑点变亮
report('动作键');
// 扎水 / 跃出：幼龙（canCross=false）不会，sim 会拦下来并提示；少年龙、成龙一直操作到真的换了介质（日志写帧号，去 _frames/ 里看那几帧）
if (!D.S.cfg.canCross) {
  const cross = ' (幼龙不会扎水/跃出，出入水判据不看)';
  if (kind === 'fire') { await play(3, () => ({ jy: 1 })); report('扎水', cross); await play(3, () => ({ jy: -.6 })); report('拉起', cross); }
  else { D.teleport(D.S.hero.x, -4, D.S.hero.z); await play(3, () => ({ jy: -1 })); report('跃出', cross); await play(3, () => ({})); report('落水', cross); }
} else if (kind === 'fire') {
  const tIn = await playUntil(med('water'), 8, () => ({ jy: 1 }));
  report('入水', tIn === null ? ' 未入水（8 秒内没进水，出入水那几帧没录到）' : ` 俯冲 ${tIn.toFixed(1)}s`);
  if (tIn !== null) {
    await play(1, () => ({}));                               report('水下 1s');
    const tOut = await playUntil(med('air'), 6, () => ({ jy: -.6 }));
    report('出水', tOut === null ? ' 未出水' : ` 拉起 ${tOut.toFixed(1)}s`);
    await play(1, () => ({}));                               report('出水 1s');
  }
} else {
  D.teleport(D.S.hero.x, -4, D.S.hero.z);
  const tUp = await playUntil(med('air'), 4, () => ({ jy: -1 }));
  report('跃出', tUp === null ? ' 未跃出（4 秒内没出水）' : ` 上浮 ${tUp.toFixed(1)}s`);
  if (tUp !== null) {
    const tDown = await playUntil(med('water'), 4, () => ({}));
    report('落水', tDown === null ? ' 未落水' : ` 空中 ${tDown.toFixed(1)}s`);
    await play(1, () => ({}));                               report('落水 1s');
  }
}
// 镜头绕龙一圈（5 秒）：先瞬移到开阔海面（龙 5 秒要游 / 飞 100 多米，镜头半径 1.7 倍体长，别让石柱挡满一帧）
// 龙继续直行，每帧在主循环算完镜头后改写镜头位置再画一次
const R = D.S.hero.len * 1.7;
__log(`绕圈前开阔海面 ${JSON.stringify(toOpenSea(260, R + 30, kind === 'fire' ? Math.max(D.S.hero.y, 40) : Math.min(D.S.hero.y, -10)))}`);
await play(5, () => ({}), t => {
  const h = D.S.hero, a = t / 5 * Math.PI * 2;
  let cy = h.y + R * .28;
  cy = h.y < 0 ? Math.min(cy, -3) : Math.max(cy, 4);          // 镜头别停在水线上（一半水上一半水下会糊成一片）
  D.camera.position.set(h.x + Math.sin(h.yaw + a) * R, cy, h.z + Math.cos(h.yaw + a) * R);
  D.camera.lookAt(h.x, h.y, h.z); D.render();
});
report('绕一圈后');
// 嘴差汇总：直行（不转向的平飞 / 平游行）的最大值要 ≤0.3 倍嘴半径；满舵那行也报出来（超了多半是 dragon.js 的脖子叠加，文档 §8.2）
{
  const flat = mouthGaps.filter(([t, , yr]) => Math.abs(yr) < .05 && /^(直行|回正|动作键|绕一圈后)/.test(t)).map(x => x[1]);
  const full = mouthGaps.filter(([t]) => t.startsWith('满舵')).map(x => x[1]);
  const mx = a => a.length ? Math.max(...a) : NaN;
  __log(`嘴差汇总 直行最大 ${mx(flat).toFixed(2)}×嘴半径（合格线 ≤0.30${mx(flat) > .3 ? '，超了：看上面各行是前后 / 上下 / 左右哪一项大' : '，过'}） | 满舵 ${mx(full).toFixed(2)}×嘴半径${mx(full) > 1 ? '（比嘴半径还大：猎物会在头旁边消失）' : ''}`);
}
await __done();
