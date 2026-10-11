// 绿色描边测试（_workflow/HERO_3D_PIPELINE.md 第 9 步「网格修补」）：把主角的描边壳改成亮绿色，从 8 个角度近距离各拍一张，拍两个动作时刻。
// 描边壳是沿法线往外扩的背面壳，正常只在轮廓边上露一圈绿线。身体表面上出现「成块的绿色」= 那里有翻面的面 / 破洞 / 非流形的薄片，
//   游戏里就是黑斑、鳍上的黑碎片（blender_mesh_report.py 查不出粘在翼膜上的翻面小壳，所以这一步不能省）。
// 不改 dragon.js：只改这一局描边材质的颜色（window.__dg.dragon.hulls），并默认关掉雾（水下的雾会把绿色盖掉；--query 加 fog=1 保留）。
// --query 加 hull=keep 不改颜色，拍同样角度的正常画面，看绿块在游戏里是不是黑斑。
// 用法（--out 是目录；出 <out>/hg_<时刻>_<角度>.png，再拼成一张图，命令见文档第 9 步）：
//   PYTHONIOENCODING=utf-8 python tools/rec3d.py --page index.html --director tools/scenarios/pipedoc_hullgreen.js --query "kind=sea&stage=2" --size 540x960 --out .cache/check/sea_adult/hullgreen
const Q = new URLSearchParams(location.search);
const wait = c => new Promise(r => { const k = () => c() ? r() : setTimeout(k, 100); k(); });
await wait(() => window.__dg && window.__dg.ready && window.__dg.dragon && window.__dg.dragon.model);
window.__pause = true;
const D = window.__dg, G = D.dragon;
D.step(1); await D.setStage(D.S.stage);
const S = D.S, kind = S.kind;
if (S.cfg.assist) S.cfg = { ...S.cfg, assist: { range: 0, cone: 0 } };      // 别让自动瞄准转向（只改这一局的副本）
// 开阔海面（和 pipedoc_hero.js 同一个找法）：前方 120 米、左右 40 米没有岛
const W = await import('./src/sim/world.js');
function clearAt(x, z, yaw, len, side) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  for (let s = -side; s <= len; s += 8) {
    const px = x + fx * Math.max(0, s), pz = z + fz * Math.max(0, s);
    for (const is of W.islands) if (Math.hypot(W.wrapP(px - is.x), W.wrapP(pz - is.z)) < (is.reach || is.r * 1.4) + side) return false;
  }
  return true;
}
function toOpenSea(y) {
  const h = S.hero;
  for (let ring = 0; ring < 40; ring++) for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, x = h.x + Math.sin(a) * ring * 40, z = h.z + Math.cos(a) * ring * 40;
    if (clearAt(x, z, h.yaw, 120, 40)) { D.teleport(x, y, z); return; }
  }
  D.teleport(h.x, y, h.z);
}
// 海龙放深一点：俯视镜头在龙上方 1.6 倍体长，要还在水下（不然只拍到水面）
toOpenSea(kind === 'fire' ? 60 : Math.max(-(6 + S.hero.len * 1.7), (S.cfg.maxDepth || -25) + 3));
const scene = G.root.parent;
if (Q.get('fog') !== '1' && scene) scene.fog = null;
if (Q.get('hull') !== 'keep') for (const h of G.hulls) h.material.color.set(0x00ff00);   // hull=keep：保留原描边色，拍同角度的对照图
__log(`HULLGREEN ${G.name} kind=${kind} stage=${S.stage} hulls=${G.hulls.length} fog=${scene && scene.fog ? 'on' : 'off'}`);

// 8 个角度（相对龙自己：方位 0 = 正后方，90 = 龙的左边；仰角正 = 从上往下看；最后一个数 = 镜头距离 ÷ 体长，侧面、俯视要远一点才拍得下全身）
const VIEWS = [['1back_up', 0, 28, 1], ['2back_low', 330, -15, 1], ['3below', 0, -55, 1.2], ['4front', 180, 8, 1], ['5front_up', 150, 35, 1.1],
  ['6left', 90, 5, 1.6], ['7right', 270, 5, 1.6], ['8top', 0, 80, 1.6]];
async function shoot(tag) {
  const h = S.hero, ctr = G.root.position;
  for (const [name, az, el, k] of VIEWS) {
    const a = h.yaw + Math.PI + az * Math.PI / 180, e = el * Math.PI / 180, R = h.len * k;
    D.camera.position.set(ctr.x + Math.sin(a) * Math.cos(e) * R, ctr.y + Math.sin(e) * R, ctr.z + Math.cos(a) * Math.cos(e) * R);
    D.camera.lookAt(ctr.x, ctr.y, ctr.z); D.render();
    await __shot(`hg_${tag}_${name}`);
  }
}
// 平飞 / 平游一段，拍两个动作时刻（扇翅 / 摆尾的两个相位）
for (let i = 0; i < 30; i++) D.frame(1 / 30);
await shoot('t1');
for (let i = 0; i < 11; i++) D.frame(1 / 30);
await shoot('t2');
__log('shots 16');
await __done();
