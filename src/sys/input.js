// 输入：第一根手指 = 摇杆（按哪出在哪，直径 96，最大位移 48）；拖动时第二根手指点哪都算动作键；键盘方向键 / WASD + 空格。
// 顶部 64px 内按下不出摇杆；按钮自己 stopPropagation。
export function createInput(wrap, joyEl, { onDrag, onAction } = {}) {
  const knob = joyEl.firstElementChild;
  const I = { jx: 0, jy: 0, act: false, actTap: false, btn: false, finger2: false, dragging: false, enabled: false, moved: 0 };
  let ptr = null; const keys = {}; let second = null;
  wrap.addEventListener('pointerdown', e => {
    if (!I.enabled) return;
    const r = wrap.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (ptr && e.pointerId !== ptr.id) {                    // 第二根手指：动作键
      second = e.pointerId; I.finger2 = true; I.actTap = true; onAction && onAction(true); return;
    }
    if (y < 64) return;
    ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
    try { wrap.setPointerCapture(e.pointerId); } catch (err) { }
    joyEl.style.display = 'block'; joyEl.style.left = x + 'px'; joyEl.style.top = y + 'px';
    I.dragging = true; onDrag && onDrag(true);
  });
  wrap.addEventListener('pointermove', e => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x0, dy = e.clientY - ptr.y0, R = 48, l = Math.hypot(dx, dy), k = l > R ? R / l : 1;
    I.jx = dx * k / R; I.jy = dy * k / R; knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    I.moved = Math.max(I.moved, l);
  });
  const end = e => {
    if (second != null && e.pointerId === second) { second = null; I.finger2 = false; onAction && onAction(false); return; }
    if (ptr && e.pointerId === ptr.id) { ptr = null; I.jx = I.jy = 0; joyEl.style.display = 'none'; knob.style.transform = ''; I.dragging = false; onDrag && onDrag(false); }
  };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);
  addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space') { I.actTap = true; onAction && onAction(true); }
  });
  addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') onAction && onAction(false); });
  // 每个 sim 步读一次
  I.read = () => {
    const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    const ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    const o = { jx: Math.max(-1, Math.min(1, I.jx + kx)), jy: Math.max(-1, Math.min(1, I.jy + ky)), act: I.btn || I.finger2 || !!keys.Space, actTap: I.actTap };
    I.actTap = false;
    return o;
  };
  I.reset = () => { ptr = null; second = null; I.jx = I.jy = 0; I.btn = I.finger2 = false; joyEl.style.display = 'none'; knob.style.transform = ''; I.dragging = false; };
  return I;
}
