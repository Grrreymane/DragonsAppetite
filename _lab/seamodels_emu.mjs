// True small-phone capture: CDP device-metrics emulation (headless Chrome's minimum window can't go to 360x640).
// node emu360.mjs <outDir> <query> [secs=20] [every=2.5] [W=360] [H=640]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const [out, query, secsA, everyA, WA, HA] = process.argv.slice(2);
const SECS = +(secsA || 20), EVERY = +(everyA || 2.5), W = +(WA || 360), H = +(HA || 640);
mkdirSync(out, { recursive: true });
const ROOT = 'D:/Minigame/Dragon';
const PORT = 8700 + Math.floor(Math.random() * 200), DPORT = 9400 + Math.floor(Math.random() * 200);
const srv = spawn('python', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', ROOT], { stdio: 'ignore' });
const chromes = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'];
const exe = chromes.find(existsSync);
const prof = join(tmpdir(), 'emu360_' + Date.now());
const ch = spawn(exe, ['--headless=new', '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required',
  `--user-data-dir=${prof}`, '--window-size=800,900', `--remote-debugging-port=${DPORT}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target = null;
for (let i = 0; i < 100 && !target; i++) { try { const l = await (await fetch(`http://127.0.0.1:${DPORT}/json`)).json(); target = l.find(t => t.type === 'page'); } catch (e) { } if (!target) await sleep(200); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } else if (m.method === 'Runtime.exceptionThrown') console.log('ERR', JSON.stringify(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error')) console.log('ERR console', m.params.args.map(a => a.value || a.description).join(' ')); });
const call = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) console.log('EVAL ERR', JSON.stringify(r.result.exceptionDetails.exception?.description)); return r.result?.result?.value; };
await call('Runtime.enable'); await call('Page.enable');
await call('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true });
await call('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await call('Page.navigate', { url: `http://127.0.0.1:${PORT}/index.html?${query}` });
for (let i = 0; i < 200; i++) { if (await ev('!!(window.__dg && window.__dg.ready)')) break; await sleep(150); }
console.log('viewport', await ev('innerWidth + "x" + innerHeight + " dpr " + devicePixelRatio + " canvas " + document.querySelector("canvas").width + "x" + document.querySelector("canvas").height'));
await ev(`(async () => { const { makeBot, TIERS } = await import('/src/sim/bot.js'); window.__pause = true; window.__bot = makeBot(TIERS[1], 1234); return 1; })()`);
const fps = 30;
for (let i = 0; i < SECS * fps; i++) {
  const info = await ev(`(() => { const D = window.__dg, o = window.__bot(D.S); D.input.jx = o.jx; D.input.jy = o.jy; D.input.btn = o.act; if (o.actTap) D.input.actTap = true; D.frame(1 / ${fps}); return D.S.stage + '_' + D.S.hero.medium; })()`);
  if (i % Math.round(EVERY * fps) === 0) {
    await sleep(50);
    const r = await call('Page.captureScreenshot', { format: 'png' });
    const f = join(out, `t${(i / fps).toFixed(1).padStart(5, '0')}_s${info}.png`); writeFileSync(f, Buffer.from(r.result.data, 'base64')); console.log('shot', f);
  }
}
ch.kill(); srv.kill(); process.exit(0);
