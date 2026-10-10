// 无头 Chrome（CDP）截整页（含 DOM 界面）。rec3d.py 的 __shot 只截画布，界面是 DOM，所以另写这个。报错打印成 ERR。
// node _lab/ui_shot.mjs D:/Minigame/Dragon "_lab/ui.html?s=load" .cache/ui/shots 540x960,360x640 "hud|title|pause|codex|result" 800
// 名字：LAB.go 的画面名 / js:<表达式>（执行后截图）/ p:<表达式>（打印值）/ f:<选择器>（实际用的字体）/ tap:x,y hold:x,y touch:x,y / slow / share
import { spawn } from 'child_process'; import http from 'http'; import fs from 'fs'; import path from 'path'; import os from 'os';
const [root, page, outdir, sizesArg, namesArg, waitArg] = process.argv.slice(2);
const wait = +(waitArg || 700);
fs.mkdirSync(outdir, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary' };
const srv = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(b); });
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp'));
const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--hide-scrollbars', '--mute-audio', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let dport = null;
for (let i = 0; i < 100 && !dport; i++) { await sleep(100); try { dport = fs.readFileSync(path.join(prof, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch (_) {} }
const list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(); let errs = 0;
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); return; }
  if (d.method === 'Runtime.exceptionThrown') { errs++; const x = d.params.exceptionDetails; console.log('ERR', (x.exception && x.exception.description) || x.text, x.url || '', x.lineNumber); }
  else if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'warning')) { if (d.params.type === 'error') errs++; console.log(d.params.type === 'error' ? 'ERR' : 'WARN', d.params.args.map(a => a.value ?? a.description).join(' ')); }
  else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') console.log('LOG', d.params.entry.text, d.params.entry.url || '');
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr, awaitPromise = false) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true }); if (r.result && r.result.exceptionDetails) { errs++; console.log('ERR eval', expr, r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description); } return r.result && r.result.result && r.result.result.value; };
await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
for (const sz of sizesArg.split(',')) {
  const [w, h] = sz.split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}${page.includes('?') ? '&' : '?'}t=${Date.now()}` });
  for (let i = 0; i < 100; i++) { await sleep(100); if (await ev('window.__labReady === true')) break; }
  await ev('document.fonts.ready.then(() => 1)', true);
  for (const name of namesArg.split('|')) {
    const file = path.join(outdir, `${name.replace(/[^\w-]/g, '_').slice(0, 40)}_${w}x${h}.png`);
    if (name.startsWith('f:')) { await send('DOM.enable'); await send('CSS.enable'); const doc = await send('DOM.getDocument'); const q = await send('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: name.slice(2) });
      const ch = await send('DOM.describeNode', { nodeId: q.result.nodeId, depth: 3 }); const pf = await send('CSS.getPlatformFontsForNode', { nodeId: q.result.nodeId }); console.log('FONT', name, JSON.stringify(pf.result)); continue; }
    if (name.startsWith('tap:') || name.startsWith('hold:')) { const [x, y] = name.split(':')[1].split(',').map(Number);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await sleep(name.startsWith('hold:') ? 400 : 60);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); await sleep(350); continue; }
    if (name.startsWith('touch:')) { const [x, y] = name.split(':')[1].split(',').map(Number);
      await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(80);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(350); continue; }
    if (name.startsWith('p:')) { console.log('VAL', JSON.stringify(await ev(name.slice(2), true))); continue; }
    if (name === 'share') { const u = await ev('LAB.drawCard().then(c => c.toDataURL("image/png"))', true); if (u) fs.writeFileSync(file, Buffer.from(u.split(',')[1], 'base64')); console.log('shot', file); continue; }
    if (name === 'slow') { await ev(`LAB.go('load')`); await sleep(8400); }
    else { await ev(name.startsWith('js:') ? name.slice(3) : `LAB.go('${name}')`); await sleep(wait); }
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); console.log('shot', file);
  }
}
console.log('done', errs, 'errors');
ws.close(); ch.kill(); srv.close();
setTimeout(() => process.exit(0), 300);
