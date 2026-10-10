// 结算卡（成龙！）：一帧截图 + 用时 / 吃了 / 图鉴，按钮「分享」「继续」。分享 = 画一张 720×1280 的竖版卡片
import { icon, iconSVG, DRAGON_ART } from './icons.js';
import { h, button, blocker, show } from './dom.js';

const FT = '"ZCOOL QingKe HuangYou","PingFang SC","Microsoft YaHei",sans-serif';
const FP = '"Fusion Pixel","PingFang SC","Microsoft YaHei",sans-serif';
const mmss = s => { s = Math.max(0, Math.round(+s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const loadImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
const svgURL = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

export function createResult(root, api) {
  const el = blocker(h('div', 'd-result d-full d-dim'));
  el.hidden = true;
  el.innerHTML = `<div class="d-panel d-rin">
    <h2 class="d-rtitle"></h2>
    <div class="d-rshot"></div>
    <div class="d-rstats">
      <div>${icon('clock')}<span>用时</span><b class="t"></b></div>
      <div>${icon('bite')}<span>吃了</span><b class="e"></b></div>
      <div>${icon('book')}<span>图鉴</span><b class="c"></b></div>
    </div>
    <div class="d-rbtns"></div></div>`;
  const q = s => el.querySelector(s);
  const title = q('.d-rtitle'), shotBox = q('.d-rshot'), btns = q('.d-rbtns');
  let info = {}, shot = null, onGo = null, busy = false;
  const bShare = button('share', '分享', 'd-btn', () => share());
  const bGo = button('play', '继续', 'd-btn d-main', () => { show(el, false); const f = onGo; onGo = null; f && f(); });
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
      title.textContent = (info.stageName || '成龙') + '！';
      q('.t').textContent = mmss(info.timeSec); q('.e').textContent = info.eaten | 0;
      q('.c').textContent = (info.codexN | 0) + '/' + (info.codexMax || 12);
      shot = grab();
      shotBox.innerHTML = shot ? `<img src="${shot}" alt="">` : `<div class="d-cart">${DRAGON_ART[kind]}</div>`;
      shotBox.classList.toggle('art', !shot);
      show(el, true);
    },
    hide() { show(el, false); },
    drawCard: () => drawCard(info, shot),   // 测试页用
  };
}

// 竖版分享卡 720×1280
async function drawCard(info, shot) {
  const W = 720, H = 1280, sea = info.kind === 'sea';
  try { await Promise.all([document.fonts.load(`96px ${FT}`, '小龙大胃王成少年！'), document.fonts.load(`48px ${FP}`, '用时吃了图鉴0123456789:/')]); } catch (_) { /* 字体没好就用系统字 */ }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, H);
  if (sea) { g.addColorStop(0, '#62d8d0'); g.addColorStop(.5, '#1f7f9e'); g.addColorStop(1, '#0c2848'); }
  else { g.addColorStop(0, '#ffc066'); g.addColorStop(.5, '#e0502c'); g.addColorStop(1, '#3c1426'); }
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // 字：绕圈叠印描边（WORKFLOW §3：不用 strokeText）
  const txt = (s, X, Y, font, fill, ol = '#0b1530', r = 5) => {
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = ol;
    for (let a = 0; a < 16; a++) x.fillText(s, X + Math.cos(a / 16 * 6.283) * r, Y + Math.sin(a / 16 * 6.283) * r);
    x.fillText(s, X, Y + r + 3); x.fillStyle = fill; x.fillText(s, X, Y);
  };
  txt('小龙大胃王', W / 2, 112, `96px ${FT}`, '#fff');
  // 照片框
  const fx = 60, fy = 200, fw = 600, fh = 640, rr = 36;
  const rrect = () => { x.beginPath(); x.moveTo(fx + rr, fy); x.arcTo(fx + fw, fy, fx + fw, fy + fh, rr); x.arcTo(fx + fw, fy + fh, fx, fy + fh, rr); x.arcTo(fx, fy + fh, fx, fy, rr); x.arcTo(fx, fy, fx + fw, fy, rr); x.closePath(); };
  x.save(); rrect(); x.fillStyle = sea ? '#bfeef0' : '#ffe2b8'; x.fill(); x.clip();
  const im = shot ? await loadImg(shot) : null;
  if (im) { const s = Math.max(fw / im.width, fh / im.height); x.drawImage(im, fx + (fw - im.width * s) / 2, fy + (fh - im.height * s) / 2, im.width * s, im.height * s); }
  else { const a = await loadImg(svgURL(DRAGON_ART[sea ? 'sea' : 'fire'])); if (a) x.drawImage(a, fx + 20, fy + 40, fw - 40, fw - 40); }
  x.restore();
  rrect(); x.lineWidth = 8; x.strokeStyle = '#0b1530'; x.stroke(); x.lineWidth = 4; x.strokeStyle = '#ffffffcc'; x.stroke();
  txt((info.stageName || '成龙') + '！', W / 2, 930, `120px ${FT}`, sea ? '#c9fff6' : '#ffe08a', '#0b1530', 7);
  // 三项数字
  const cols = [['clock', '用时', mmss(info.timeSec)], ['bite', '吃了', String(info.eaten | 0)], ['book', '图鉴', (info.codexN | 0) + '/' + (info.codexMax || 12)]];
  for (let i = 0; i < 3; i++) {
    const cx = 130 + i * 230, ic = await loadImg(svgURL(iconSVG(cols[i][0])));
    if (ic) x.drawImage(ic, cx - 28, 1040, 56, 56);
    txt(cols[i][1], cx, 1122, `24px ${FP}`, '#fff', '#0b1530', 3);
    txt(cols[i][2], cx, 1170, `48px ${FP}`, '#fff', '#0b1530', 4);
  }
  const url = (location.origin + location.pathname).replace(/^https?:\/\//, '').replace(/index\.html$/, '');
  txt(url.length > 46 ? url.slice(0, 46) : url, W / 2, 1240, `24px ${FP}`, '#ffffffcc', '#0b1530', 2);
  return cv;
}
