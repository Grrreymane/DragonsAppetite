// rec3d.py 的帮手：通过 Chrome 调试端口截整页（包括 DOM 界面），canvas.toBlob 截不到 HUD。
// 用法（rec3d 自动启动）：node tools/cdp_shot.mjs <端口>；stdin 每行 "png|路径" 或 "jpeg|路径"，截完 stdout 打一行 ok
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const port = process.argv[2];
let target = null;
for (let i = 0; i < 100 && !target; i++) {
  try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = list.find(t => t.type === 'page' && t.url.includes('__rec.html')); } catch (e) { }
  if (!target) await new Promise(r => setTimeout(r, 200));
}
if (!target) { console.log('ERR no target'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const call = (method, params = {}) => new Promise(r => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
console.log('ready');
const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const [fmt, path] = line.split('|');
  const res = await call('Page.captureScreenshot', fmt === 'jpeg' ? { format: 'jpeg', quality: 85 } : { format: 'png' });
  if (res.result && res.result.data) writeFileSync(path, Buffer.from(res.result.data, 'base64'));
  console.log(res.result ? 'ok' : 'ERR ' + JSON.stringify(res.error));
}
