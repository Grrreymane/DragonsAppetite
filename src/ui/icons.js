// 界面图标（内联 SVG，24×24，白色实心 + 深蓝描边，卡通风）。不用 emoji：各家手机长得不一样。
// 用法：icon('fire') → '<svg …>'。描边靠 CSS（.ic { stroke; paint-order: stroke }）。
// 类名：.a 点缀色（黄）/ .d 深色（眼睛、指针）/ .t 半透明
const P = {
  menu: '<rect x="5.5" y="4.5" width="4.6" height="15" rx="1.8"/><rect x="13.9" y="4.5" width="4.6" height="15" rx="1.8"/>',
  sound: '<path d="M2.5 9h4l5-4.2v14.4l-5-4.2h-4z"/><path d="M14.6 8.1a5 5 0 0 1 0 7.8l-1.4-1.5a3 3 0 0 0 0-4.8z"/><path d="M17.2 5.2a9 9 0 0 1 0 13.6l-1.4-1.5a7 7 0 0 0 0-10.6z"/>',
  mute: '<path d="M2.5 9h4l5-4.2v14.4l-5-4.2h-4z"/><rect x="17" y="7.2" width="2.4" height="9.6" rx="1.1" transform="rotate(45 18.2 12)"/><rect x="17" y="7.2" width="2.4" height="9.6" rx="1.1" transform="rotate(-45 18.2 12)"/>',
  fire: '<path d="M12 1.8c1.2 3.3 4.8 5.1 5.9 8.9 1.3 4.6-1.6 9.8-5.9 9.8s-7.3-3.4-6.1-7.6c.6-2.1 2.1-3.3 2.7-4.8.4 1.7 1.2 2.7 2.3 3.1-.1-3.5-.4-6.6 1.1-9.4z"/><path class="a" d="M12 12.2c.9 1.7 2.8 2.7 2.8 4.8a2.8 2.8 0 0 1-5.6 0c0-1.3.9-2 1.5-2.8.2.8.6 1.2 1.1 1.4-.2-1.3-.2-2.3.2-3.4z"/>',
  dash: '<path d="M3 5h4.8l6.3 7-6.3 7H3l6.3-7z"/><path d="M10.6 5h4.8l6.3 7-6.3 7h-4.8l6.3-7z"/>',
  wave: '<path d="M1.8 15.4c2.6 0 3.7-1.7 5.2-3.8C9 8.7 11.5 6 15.3 6c3.5 0 6.1 2.3 6.8 5.2-1.2-1-2.7-1.4-4-1-1.8.6-2.1 2.7-.8 3.7 1 .8 2.6.8 3.7.3-1.3 3.2-4.1 4.9-8.2 4.9H1.8z"/>',
  play: '<path d="M7 4.2v15.6c0 .9 1 1.4 1.7.9l11.2-7.8a1 1 0 0 0 0-1.7L8.7 3.3C8 2.8 7 3.3 7 4.2z"/>',
  dragon: '<path d="M2.6 14.6c0-3.6 2.6-6.6 6.6-7.4L7.6 2.8l4.3 3.5h1.8l1.4-3.4 1.6 4.2c2.2.8 3.6 2.2 4.5 4.1l-1.1 1.2 1.1 1.4c-.6 1.7-2.1 2.7-3.8 2.7h-2.1l-1.3 2.3c-.4.8-1.2 1.3-2.1 1.3H8.9V17.4c-3.4-.4-6.3-1.6-6.3-2.8z"/><circle class="d" cx="14.6" cy="9.8" r="1.2"/>',
  book: '<path d="M2.2 5.2c3.1-1 6.3-.7 9 1v13.6c-2.7-1.5-5.9-1.8-9-1z"/><path d="M21.8 5.2c-3.1-1-6.3-.7-9 1v13.6c2.7-1.5 5.9-1.8 9-1z"/>',
  hand: '<rect x="5.2" y="5.5" width="2.8" height="10" rx="1.4"/><rect x="8.4" y="2.8" width="2.8" height="11" rx="1.4"/><rect x="11.6" y="2.4" width="2.8" height="11" rx="1.4"/><rect x="14.8" y="4" width="2.8" height="10" rx="1.4"/><rect x="17.3" y="10" width="2.8" height="7.5" rx="1.4" transform="rotate(32 18.7 13.7)"/><path d="M5.2 11h12.4v4.4c0 3.6-2.6 6.4-6.2 6.4s-6.2-2.8-6.2-6.4z"/>',
  share: '<path d="M12 2.2l5.4 5.4h-3.6v6.6h-3.6V7.6H6.6z"/><path d="M3.6 11.5h3.2v6.3h10.4v-6.3h3.2v8.1c0 .9-.7 1.6-1.6 1.6H5.2c-.9 0-1.6-.7-1.6-1.6z"/>',
  retry: '<path d="M12 4a8 8 0 1 0 7.8 9.8h-3.3A5 5 0 1 1 12 7v3l4.6-4.5L12 1z"/>',
  back: '<path d="M10.2 4.2L2.5 12l7.7 7.8v-4.6h11.3V8.8H10.2z"/>',
  check: '<path d="M3.2 12.6l2.6-2.6 4.1 4.1 8.3-8.3 2.6 2.6L9.9 19.3z"/>',
  star: '<path d="M12 2.3l3 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.4l-6 3.2 1.2-6.6-4.9-4.7 6.7-.9z"/>',
  lock: '<path d="M7.4 10.6V7.8a4.6 4.6 0 0 1 9.2 0v2.8h-2.7V7.8a1.9 1.9 0 0 0-3.8 0v2.8z"/><rect x="4.8" y="10.2" width="14.4" height="11" rx="2.2"/>',
  clock: '<circle cx="12" cy="12" r="9.6"/><path class="d" d="M10.9 6.2h2.2v5.3l3.4 2.1-1.1 1.8-4.5-2.7z"/>',
  bite: '<path d="M12 2.4a9.6 9.6 0 1 0 9.6 9.6 3 3 0 0 1-3.4-3.2 3 3 0 0 1-3-3.4 3 3 0 0 1-3.2-3z"/><circle class="d" cx="8.2" cy="10" r="1.2"/><circle class="d" cx="11" cy="15.6" r="1.2"/><circle class="d" cx="15.8" cy="14.6" r="1.1"/>',
  arrow: '<path d="M12 1.8l8.7 16c.5.9-.5 1.9-1.4 1.4L12 15.6l-7.3 3.6c-.9.5-1.9-.5-1.4-1.4z"/>',
  point: '<path d="M6.4 12.4c0-1.1.9-2 2-2h8.2c1.7 0 3 1.3 3 3v3.2c0 3.4-2.8 6.2-6.2 6.2h-1.6c-3 0-5.4-2.4-5.4-5.4z"/><rect x="9.4" y="1.6" width="4" height="12.6" rx="2"/>',
  down: '<path d="M8.8 2.2h6.4v8.6h4.6L12 19.4 4.2 10.8h4.6z"/><path class="a" d="M2 21.6c1.7-1.3 3.3-1.3 5 0s3.3 1.3 5 0 3.3-1.3 5 0 3.3 1.3 5 0" fill="none" stroke-width="2"/>',
  up: '<path d="M8.8 19.4h6.4v-8.6h4.6L12 2.2 4.2 10.8h4.6z"/><path class="a" d="M2 21.6c1.7-1.3 3.3-1.3 5 0s3.3 1.3 5 0 3.3-1.3 5 0 3.3 1.3 5 0" fill="none" stroke-width="2"/>',
  fish: '<path d="M2 12c2.6-4 6.2-5.6 9.7-5.6 4.1 0 6.7 2.4 8.1 4.4L22.6 8v8l-2.8-2.8c-1.4 2-4 4.4-8.1 4.4C8.2 17.6 4.6 16 2 12z"/><circle class="d" cx="7" cy="11" r="1.1"/>',
  bird: '<path d="M1.8 9.2c3.3-.9 6.2.4 8.3 3.3l1.9 2.2 1.9-2.2c2.1-2.9 5-4.2 8.3-3.3-2.7 1-4.6 2.7-5.8 4.8L12 19.4l-4.4-5.4C6.4 11.9 4.5 10.2 1.8 9.2z"/>',
  jelly: '<path d="M4 12.5C4 7.8 7.6 4 12 4s8 3.8 8 8.5c-1.2.8-2.4.8-3.6 0-1.2.8-2.4.8-3.6 0-1.2.8-2.4.8-3.6 0-1.2.8-2.4.8-3.6 0z"/><path d="M7.4 13.6v6M11 14v7M13.6 14v6M17 13.6v5.4" fill="none" stroke-width="1.6" stroke-linecap="round"/>',
  grow: '<path d="M12 2.4l7.6 8.2h-4.4v10.6H8.8V10.6H4.4z"/>',
  cross: '<path d="M4 7h11V3.5l6 6-6 6V12H4z"/><path class="a" d="M20 17H9v-3.5l-6 6 6 6V20h11z" transform="translate(0 -3)"/>',
  bang: '<rect x="9.6" y="2.6" width="4.8" height="12.4" rx="2.2"/><circle cx="12" cy="19" r="2.6"/>',
};

export const icon = (name, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || ''}</svg>`;

export const ICON_PATHS = P;
// 独立的 SVG 字符串（画到 canvas 上用：分享卡）
export const iconSVG = (name, fill = '#fff') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 28 28" width="56" height="56"><g fill="${fill}" stroke="#0b1530" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke"><style>.a{fill:#ffd34d}.d{fill:#0b1530;stroke:none}</style>${P[name] || ''}</g></svg>`;

// 标题卡上的大龙剪影（200×200，颜色写在属性里，所以也能当图片画到 canvas 上）。没有预渲染的 webp 时用它顶上
const art = (ol, inner) => `<svg class="art" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" aria-hidden="true"><g stroke="${ol}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" paint-order="stroke">${inner}</g></svg>`;
export const DRAGON_ART = {
  fire: art('#2a1018', `
  <path fill="#5e1d16" d="M104 96 Q98 58 86 30 Q78 48 62 54 Q74 64 70 76 Q84 74 90 90z"/>
  <path fill="#8e2f1f" d="M136 118 C160 122 174 140 184 160 L177 165 C166 148 154 136 132 133z"/>
  <path fill="#3a2420" d="M181 152 L197 160 L186 178 L174 166z"/>
  <ellipse fill="#8e2f1f" cx="108" cy="116" rx="38" ry="20" transform="rotate(-14 108 116)"/>
  <ellipse fill="#7a281b" cx="96" cy="133" rx="7" ry="13" transform="rotate(28 96 133)"/>
  <ellipse fill="#7a281b" cx="132" cy="134" rx="8" ry="14" transform="rotate(40 132 134)"/>
  <path fill="none" stroke-width="23" d="M86 112 C72 102 64 90 56 74"/>
  <path fill="none" stroke="#8e2f1f" stroke-width="17" d="M86 112 C72 102 64 90 56 74"/>
  <path fill="none" stroke="#e8c49a" stroke-width="6" d="M80 116 C68 106 62 96 56 84"/>
  <path fill="#3a2420" d="M51 51 L60 34 L61 54z M59 54 L74 41 L68 59z"/>
  <path fill="#8e2f1f" d="M28 66 C33 55 50 50 62 56 L72 64 C68 73 59 77 50 77 L34 75 C27 73 25 70 28 66z"/>
  <path fill="none" stroke-width="2" d="M31 70 L48 71"/>
  <path fill="#b8442a" d="M96 102 Q108 56 128 26 Q154 30 186 48 Q168 56 170 72 Q154 66 148 82 Q136 76 132 94 Q120 92 114 110z"/>
  <path fill="none" stroke="#6e2216" stroke-width="2.5" d="M104 98 Q114 66 128 36 M128 36 Q150 48 168 64 M128 36 Q140 56 146 78 M128 36 Q130 64 131 90"/>
  <circle fill="#ffd34d" stroke-width="2" cx="54" cy="62" r="3.6"/>`),
  sea: art('#0b1f33', `
  <path fill="#2a8f9f" d="M58 84 L62 66 L72 90z M78 102 L86 82 L94 108z M100 114 L110 94 L116 118z M122 116 L134 96 L138 116z M144 106 L156 86 L158 104z"/>
  <path fill="#173d5c" d="M70 120 l-14 18 l15 1 l8 -14z M86 127 l-5 20 l14 -1 l2 -17z M120 131 l-3 20 l14 0 l1 -18z M138 124 l7 19 l12 -5 l-7 -16z"/>
  <path fill="#2a8f9f" d="M164 88 L186 48 Q190 72 198 82 Q190 96 196 122 L172 100z"/>
  <path fill="#1d4a6e" d="M42 70 C56 80 64 96 80 108 C98 120 118 122 136 114 C150 108 158 96 168 82 L180 90 C170 106 158 122 140 131 C118 142 92 141 72 127 C56 115 46 99 34 86z"/>
  <path fill="none" stroke="#e9e4cf" stroke-width="5" d="M40 86 C52 101 62 114 76 122 C94 133 118 135 138 126"/>
  <path fill="#2a8f9f" d="M40 54 L54 30 L58 56z M48 58 L72 42 L62 66z"/>
  <path fill="#1d4a6e" d="M12 68 C16 57 30 51 44 54 L58 62 C59 73 51 81 41 83 L22 81 C13 79 9 74 12 68z"/>
  <path fill="none" stroke-width="2" d="M16 74 L36 76"/>
  <circle fill="#7ff6ff" stroke-width="2" cx="36" cy="64" r="3.4"/>
  <g fill="#7ff6ff" stroke="none"><circle cx="58" cy="92" r="2.4"/><circle cx="74" cy="106" r="2.6"/><circle cx="92" cy="116" r="2.8"/><circle cx="112" cy="120" r="2.6"/><circle cx="130" cy="117" r="2.4"/><circle cx="148" cy="108" r="2.2"/><circle cx="162" cy="96" r="2"/></g>`),
};
