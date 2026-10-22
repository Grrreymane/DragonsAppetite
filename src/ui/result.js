// 结算画面（大胃王！）：整屏铺满成龙 CG（缓慢推近）+ 上方小 logo + 下方大标题（不挡龙头）和半透明数据栏（用时 / 吃了 / 图鉴）+「分享」「继续」。
// 分享 = 画一张同样版式的 720×1280 竖版卡片。2026-10-22 重做（用户：结算画面再设计一下，CG 按参考图的动作重画）
import { icon, iconSVG, DRAGON_ART, drawPainted, sheetReady } from './icons.js';
import { h, button, blocker, show, setIcon } from './dom.js';
import { SPECIES_IDS } from '../config/species.js';

const FT = '"Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
const FP = FT;
const mmss = s => { s = Math.max(0, Math.round(+s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
const LOGO = new URL('../../img/ui/logo.webp', import.meta.url).href;
// 结算插画（AI 画的帅气成龙 CG）；代替以前截的一帧 3D 画面（手机上又糊又常常只拍到背影）
const WIN = { fire: new URL('../../img/ui/win_fire.webp', import.meta.url).href, sea: new URL('../../img/ui/win_sea.webp', import.meta.url).href };
const INK = '#2a1a14';
const svgURL = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

export function createResult(root, api) {
  const el = blocker(h('div', 'd-result d-full d-dim'));
  el.hidden = true;
  el.innerHTML = `<div class="d-rshot"></div><div class="d-rshade"></div>
    <div class="d-rtop"><img class="d-rlogo" src="${LOGO}" alt=""></div>
    <div class="d-rbot">
      <div class="d-rhead"><h2 class="d-rtitle"></h2><div class="d-rsub"></div></div>
      <div class="d-rstats">
        <div>${icon('clock')}<span>用时</span><b class="t"></b></div>
        <div>${icon('gulp')}<span>吃了</span><b class="e"></b></div>
        <div>${icon('book')}<span>图鉴</span><b class="c"></b></div>
      </div>
      <div class="d-rbtns"></div>
    </div>`;
  el.classList.add('d-r2');
  const q = s => el.querySelector(s);
  const title = q('.d-rtitle'), shotBox = q('.d-rshot'), btns = q('.d-rbtns'), sub = q('.d-rsub');
  let info = {}, shot = null, onGo = null, busy = false;
  const bShare = button('share', '分享', 'd-btn', () => share());
  const bGo = button('playw', '继续', 'd-btn d-main', () => { show(el, false); const f = onGo; onGo = null; f && f(); });
  btns.append(bShare, bGo);
  root.appendChild(el);

  // 截一帧 3D 画面：优先用主程序给的 info.shot（渲染完立刻 toDataURL），否则试着读画布；读到全空就用剪影
  function grab() {
    if (info.shot) return info.shot;
    try {
      const cv = root.parentElement && root.parentElement.querySelector('canvas');
      if (!cv || !cv.width) return null;
      const t = document.createElement('canvas'); t.width = t.height = 8;
      const x = t.getContext('2d'); x.drawImage(cv, 0, 0, 8, 8);
      const d = x.getImageData(0, 0, 8, 8).data; let lit = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] > 30) lit++;
      return lit > 8 ? cv.toDataURL('image/jpeg', .85) : null;
    } catch (_) { return null; }
  }

  async function share() {
    if (busy) return; busy = true; bShare.classList.add('busy');
    try {
      const cv = await drawCard(info, shot);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      const file = blob && typeof File === 'function' ? new File([blob], 'dragon.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        try { await navigator.share({ files: [file], title: '小龙大胃王' }); } catch (_) { /* 用户取消 */ }
      } else if (blob) {
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'dragon.png';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } catch (e) { console.warn('share', e); }
    busy = false; bShare.classList.remove('busy');
  }

  return {
    el,
    show(i, onContinue) {
      info = i || {}; onGo = onContinue || null;
      const kind = info.kind === 'sea' ? 'sea' : 'fire';
      el.classList.toggle('sea', kind === 'sea');
      setIcon(q('.d-rstats > div:nth-child(2)'), kind === 'sea' ? 'gulp_sea' : 'gulp');
      title.innerHTML = `${info.stageName || '成龙'}<i>!</i>`;   // 「大胃王」三个字居中，感叹号挂在右边不占位
      sub.textContent = (kind === 'sea' ? '海龙' : '火龙') + ' · 成龙';
      el.classList.remove('d-rplay'); void el.offsetWidth; el.classList.add('d-rplay');   // 重新播入场动画
      q('.t').textContent = mmss(info.timeSec); q('.e').textContent = info.eaten | 0;
      q('.c').textContent = (info.codexN | 0) + '/' + (info.codexMax || SPECIES_IDS.length);
      shot = WIN[kind];
      shotBox.innerHTML = shot ? `<img src="${shot}" alt="">` : `<div class="d-cart">${DRAGON_ART[kind]}</div>`;
      shotBox.classList.toggle('art', !shot);
      show(el, true);
    },
    hide() { show(el, false); },
    drawCard: () => drawCard(info, shot),   // 测试页用
  };
}

// 竖版分享卡 720×1280：和结算画面同一个版式——CG 铺满、上下压暗、logo + 大标题、底部三项数字
async function drawCard(info, shot) {
  const W = 720, H = 1280, sea = info.kind === 'sea';
  try { await sheetReady; await Promise.all([document.fonts.load(`800 96px ${FT}`, '小龙大胃王成少年！海火龙·'), document.fonts.load(`500 48px ${FP}`, '用时吃了图鉴0123456789:/')]); } catch (_) { /* 字体没好就用系统字 */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  x.fillStyle = sea ? '#0c2848' : '#3c1426'; x.fillRect(0, 0, W, H);
  const im = shot ? await loadImg(shot) : null;
  if (im) { const s = Math.max(W / im.width, H / im.height); x.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) * .3, im.width * s, im.height * s); }
  else { const a = await loadImg(svgURL(DRAGON_ART[sea ? 'sea' : 'fire'])); if (a) x.drawImage(a, 60, 260, 600, 600); }
  // 上下压暗（字压在上面看得清）
  let g = x.createLinearGradient(0, 0, 0, 220); g.addColorStop(0, 'rgba(10,8,20,.5)'); g.addColorStop(1, 'rgba(10,8,20,0)'); x.fillStyle = g; x.fillRect(0, 0, W, 220);
  g = x.createLinearGradient(0, H - 560, 0, H); g.addColorStop(0, 'rgba(10,8,20,0)'); g.addColorStop(.4, 'rgba(10,8,20,.66)'); g.addColorStop(1, 'rgba(10,8,20,.9)'); x.fillStyle = g; x.fillRect(0, H - 560, W, 560);
  // 字：绕圈叠印描边（WORKFLOW §3：不用 strokeText）
  const txt = (s, X, Y, font, fill, ol = INK, r = 5) => {
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ol;
    for (let a = 0; a < 16; a++) x.fillText(s, X + Math.cos(a / 16 * 6.283) * r, Y + Math.sin(a / 16 * 6.283) * r);
    x.fillText(s, X, Y + r + 3); x.fillStyle = fill; x.fillText(s, X, Y);
  };
  const logo = await loadImg(LOGO);
  if (logo) { const lw = 260, lh = logo.height * lw / logo.width; x.drawImage(logo, (W - lw) / 2, 24, lw, lh); }
  x.save(); x.shadowColor = sea ? 'rgba(80,240,220,.8)' : 'rgba(255,160,60,.8)'; x.shadowBlur = 40;
  const tt = info.stageName || '成龙'; x.font = `800 120px ${FT}`; const tw = x.measureText(tt).width;
  txt(tt, W / 2, 850, `800 120px ${FT}`, sea ? '#c9fff6' : '#ffe7a0', INK, 7);
  txt('!', W / 2 + tw / 2 + 26, 850, `800 120px ${FT}`, sea ? '#c9fff6' : '#ffe7a0', INK, 7); x.restore();   // 三个字居中，感叹号挂在右边
  txt((sea ? '海龙' : '火龙') + ' · 成龙', W / 2, 936, `800 34px ${FT}`, '#ffffff', INK, 3);
  // 三项数字（半透明小卡）
  const cols = [['clock', '用时', mmss(info.timeSec)], [sea ? 'gulp_sea' : 'gulp', '吃了', String(info.eaten | 0)], ['book', '图鉴', (info.codexN | 0) + '/' + (info.codexMax || SPECIES_IDS.length)]];
  for (let i = 0; i < 3; i++) {
    const cx = 130 + i * 230, by = 1010;
    x.fillStyle = 'rgba(255,255,255,.14)'; x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2;
    x.beginPath(); if (x.roundRect) x.roundRect(cx - 98, by - 6, 196, 196, 26); else x.rect(cx - 98, by - 6, 196, 196); x.fill(); x.stroke();
    if (!drawPainted(x, cols[i][0], cx - 34, by + 8, 68)) { const ic = await loadImg(svgURL(iconSVG(cols[i][0]))); if (ic) x.drawImage(ic, cx - 28, by + 14, 56, 56); }
    txt(cols[i][1], cx, by + 102, `500 24px ${FP}`, '#fff', INK, 3);
    txt(cols[i][2], cx, by + 150, `800 46px ${FT}`, '#fff', INK, 4);
  }
  const url = (location.origin + location.pathname).replace(/^https?:\/\//, '').replace(/index\.html$/, '');
  txt(url.length > 46 ? url.slice(0, 46) : url, W / 2, 1244, `500 24px ${FP}`, '#ffffffcc', INK, 2);
  return cv;
}
