// 存档：localStorage 'dragon_v1'。读档时用默认值深合并，永远不清空；坏档原文备份到 dragon_v1_bak。
const KEY = 'dragon_v1';
const blank = () => ({
  v: 1, pick: 'fire', mute: false, left: false,
  tut: { drag: 0, plunge: 0, breach: 0, fire: 0, dash: 0 },
  fire: { stage: 0, pts: 0, eaten: 0, goal: 0, adultShown: 0, playSec: 0 },
  sea: { stage: 0, pts: 0, eaten: 0, goal: 0, adultShown: 0, playSec: 0 },
  codex: {}, discoveries: {},
});
function merge(base, extra) {
  if (!extra || typeof extra !== 'object') return base;
  for (const k in extra) {
    if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], extra[k]);
    else base[k] = extra[k];
  }
  return base;
}
export function loadSave() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* 隐私模式：照样能玩 */ }
  if (!raw) return blank();
  try { return merge(blank(), JSON.parse(raw)); }
  catch (e) { try { localStorage.setItem(KEY + '_bak', raw); } catch (e2) { } return blank(); }
}
export function writeSave(sv) {
  try { localStorage.setItem(KEY, JSON.stringify(sv)); } catch (e) { }
}

// AI Made Games 平台的「你的存档」：在平台 iframe 里才发，一行文字，内容变了才发，最少隔 15 秒
let lastText = '', lastT = 0, pending = null, nextText = '';
export function reportProgress(text, now = Date.now(), force = false) {
  if (window.parent === window) return;
  nextText = text;
  if (text === lastText) return;
  const send = () => {
    pending = null; lastT = Date.now(); lastText = nextText;
    let t = String(nextText).slice(0, 120);
    try { if (window.GameI18n) t = window.GameI18n.translate(t); } catch (e) { }
    try { window.parent.postMessage({ source: 'aimadegames', v: 1, type: 'progress', text: t }, '*'); } catch (e) { }
  };
  if (force || now - lastT > 15000) send();
  else if (!pending) pending = setTimeout(send, 15000 - (now - lastT));
}
