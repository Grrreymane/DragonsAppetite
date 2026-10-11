// 云图集：AI 画的积云 / 火山烟 / 高空卷云（img/clouds.webp，带透明）。天空（卷云）和 clouds.js（云、烟、远处的云带）共用一张贴图、只下载一次。
import * as THREE from 'three';
import { ATLAS_SIZE, RECTS } from './cloud-atlas-rects.js';

export const CUMULUS = ['cu0', 'cu1', 'cu3', 'cu2', 'cu4', 'cu5'].filter(k => RECTS[k]);   // 高耸、宽、宽、扁长、小团、小团
export const SMOKE = ['sm0', 'sm1', 'sm2'].filter(k => RECTS[k]);
// 天上的卷云：9 片，方位角大致均匀（竖屏只看得到 37° 宽，每个方向都要有一两片），仰角 / 宽（弧度）/ 透明度；flip = 左右翻
const WI = ['wi0', 'wi1', 'wi2'].filter(k => RECTS[k]);
export const WISPS = !WI.length ? [] : [
  [0.25, .30, .30, .62, 0], [0.95, .46, .26, .5, 1], [1.62, .24, .34, .6, 0], [2.35, .38, .28, .55, 1], [3.05, .27, .32, .62, 0],
  [3.78, .50, .25, .48, 1], [4.45, .31, .33, .6, 0], [5.12, .22, .3, .58, 1], [5.75, .42, .27, .52, 0],
].map(([az, el, w, a, flip], i) => ({ id: WI[i % WI.length], az, el, w, a, flip }));

// 像素矩形 → 贴图坐标 [u0, v0, du, dv]（three 的贴图默认上下翻转：v = 0 在图的下边）
export function rectUV(id) {
  const r = RECTS[id]; if (!r) return [0, 0, 0, 0];
  const [W, H] = ATLAS_SIZE;
  return [r[0] / W, 1 - (r[1] + r[3]) / H, r[2] / W, r[3] / H];
}
export const aspect = id => { const r = RECTS[id]; return r ? r[2] / r[3] : 1; };

let P = null;
export function loadCloudAtlas() {
  if (!P) P = new Promise((res, rej) => {
    new THREE.TextureLoader().load(new URL('../../img/clouds.webp', import.meta.url).href, t => {
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 2;
      res({ tex: t, rect: rectUV });
    }, undefined, rej);
  });
  return P;
}
