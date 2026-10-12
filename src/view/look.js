// 画面的「光照风格」预设：色调映射、曝光、卡通色阶（GRAD，所有卡通材质共用）、半球光 / 太阳。
// 用户觉得默认画面偏黑，出三个方案对比：?look=a|b|c（默认 cur = 原来的）
import * as THREE from 'three';
import { GRAD } from './toon.js';

export const LOOKS = {
  cur: { zh: '现在', filter: '', exposure: 1.0, grad: [95, 170, 255], hemi: [0xdcecff, 0x6b5a4a, .9], sun: [0xfff0d8, 2.6] },
  // A 明亮卡通：阴影面提亮到六成，整体曝光高一点，颜色还是三档
  a: { zh: '明亮卡通', filter: 'brightness(1.13) saturate(1.3)', exposure: 1.45, grad: [165, 215, 255], hemi: [0xeaf4ff, 0xa89478, 1.5], sun: [0xfff2dc, 2.5] },
  // B 清透动画：两档硬分界（亮面 / 暗面），暗面很浅，地面反光也亮，像日系动画
  b: { zh: '清透动画', filter: 'brightness(1.2) contrast(.84) saturate(1.12)', exposure: 1.35, grad: [192, 255], hemi: [0xf4f8ff, 0xc8bca8, 1.9], sun: [0xffffff, 2.1] },
  // C 暖阳绘本：四档柔和过渡，太阳偏暖偏强，暗面带一点暖棕
  c: { zh: '暖阳绘本', filter: 'sepia(.28) saturate(1.4) brightness(1.12) hue-rotate(-6deg)', exposure: 1.35, grad: [140, 185, 225, 255], hemi: [0xffe8cc, 0x9a7458, 1.3], sun: [0xffd49a, 3.2] },
};

export function applyLook(name, { renderer, sky }) {
  // 录像用 canvas.toBlob 截不到 CSS 滤镜，截图要用 rec3d --dom
  const L = LOOKS[name] || LOOKS.cur;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = L.exposure;
  GRAD.image = { data: new Uint8Array(L.grad), width: L.grad.length, height: 1 };
  GRAD.needsUpdate = true;
  if (sky && sky.hemi) { sky.hemi.color.set(L.hemi[0]); sky.hemi.groundColor.set(L.hemi[1]); sky.hemi.intensity = L.hemi[2]; }
  if (sky && sky.sun) { sky.sun.color.set(L.sun[0]); sky.sun.intensity = L.sun[1]; }
  // 整屏调色（海、天这些自己写着色器的东西不吃灯光，靠这个一起提亮）；CSS 滤镜在手机上由合成器做，几乎不花钱
  renderer.domElement.style.filter = L.filter || '';
  return L;
}
