"""录一段试飞视频（逐帧，固定 30fps），同时把帧存成 JPEG（.cache/flight/frames/NNNN.jpg），方便拼图检查。
只录原型页 _lab/flight.html（钩子 __fl / __flReady）。正式游戏 index.html 用 tools/rec3d.py 录。

    python tools/record_flight.py --size 540x960 --out .cache/flight/flight.mp4

剧本在下面 DIRECTOR 里：直飞 → 右转 → 喷火 → 俯冲 → 拉升 → 左转 → 滑翔 → 镜头绕龙一圈。
"""
import argparse, functools, http.server, os, pathlib, subprocess, sys, tempfile, threading, time
sys.path.insert(0, 'D:/Minigame/_workflow/tools')
from shot import browser  # noqa

DIRECTOR = r"""
<script type="module">
const post = (p, b) => fetch(p, { method: 'POST', body: b });
const wait = () => new Promise(r => { const k = () => window.__flReady ? r() : setTimeout(k, 100); k(); });
await wait();
window.__pause = true;
const F = window.__fl, cv = document.querySelector('canvas');
F.fl.pos.y = 110;
// [开始秒, 结束秒, stick.x, stick.y, 喷火]
const plan = [[0, 2, 0, 0, 0], [2, 4.2, .8, 0, 0], [4.2, 5.4, 0, 0, 1], [5.4, 7.2, 0, 1, 0], [7.2, 9, 0, -1, 0], [9, 11, -1, 0, 0], [11, 14, 0, 0, 0]];
const ORBIT = 14, END = 19, fps = 30;
for (let i = 0; i < END * fps; i++) {
  const t = i / fps, p = plan.find(q => t >= q[0] && t < q[1]) || [0, 0, 0, 0, 0];
  F.stick.x = p[2]; F.stick.y = p[3]; F.setFire(!!p[4]);
  F.step(1, 1 / fps);
  if (t >= ORBIT) {                       // 最后几秒：镜头绕着龙转一圈，专门看脖子和头
    const d = F.dragon, c = F.camera, a = (t - ORBIT) / (END - ORBIT) * Math.PI * 2, V = d.position.constructor;
    const fwd = new V(0, 0, 1).applyQuaternion(d.quaternion), left = new V(1, 0, 0).applyQuaternion(d.quaternion);
    c.position.copy(d.position).addScaledVector(fwd, Math.cos(a) * 20).addScaledVector(left, Math.sin(a) * 20).add(new V(0, 4, 0));
    c.lookAt(d.position.clone().addScaledVector(fwd, 2)); F.render();
  }
  const b = await new Promise(r => cv.toBlob(r, 'image/jpeg', .9));
  await post('/__frame', b);
  if (i % fps === 0) post('/__log', 't=' + t + ' ' + Math.round(performance.now()) + 'ms');
}
await post('/__done', '');
</script>
"""

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--size', default='540x960'); ap.add_argument('--out', default='.cache/flight/flight.mp4')
    a = ap.parse_args()
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    root = pathlib.Path(__file__).resolve().parent.parent
    out = (root / a.out).resolve(); frames = out.parent / 'frames'; frames.mkdir(parents=True, exist_ok=True)
    for f in list(frames.glob('*.png')) + list(frames.glob('*.jpg')): f.unlink()
    page = (root / '_lab' / 'flight.html').read_text(encoding='utf-8').replace('</body>', DIRECTOR + '</body>')
    page = page.replace('<script>addEventListener(\'error\'', '<script>addEventListener(\'error\', e => fetch(\'/__log\', {method:\'POST\', body:\'ERR \' + e.message}));addEventListener(\'error\'', 1)
    enc = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', '30', '-i', '-',
                            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(out)], stdin=subprocess.PIPE)
    done = threading.Event(); st = {'n': 0}
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
        def do_GET(self):
            if self.path.split('?')[0] == '/_lab/_rec.html':
                b = page.encode('utf-8'); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
            return super().do_GET()
        def do_POST(self):
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            if self.path == '/__frame':
                enc.stdin.write(body); (frames / f'{st["n"]:04d}.jpg').write_bytes(body); st['n'] += 1
            elif self.path == '/__log': print(body.decode('utf-8', 'replace'), flush=True)
            elif self.path == '/__done': done.set()
            self.send_response(204); self.end_headers()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    w, h = a.size.split('x')
    url = f'http://127.0.0.1:{srv.server_port}/_lab/_rec.html?rec=1&t={int(time.time())}'
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as prof:
        ch = subprocess.Popen([browser(), '--headless=new', '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11',
                               '--force-device-scale-factor=1', f'--user-data-dir={prof}', f'--window-size={w},{h}', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ok = done.wait(900); ch.kill(); ch.wait()
    srv.shutdown(); enc.stdin.close(); enc.wait()
    print('ok' if ok else 'TIMEOUT', st['n'], 'frames ->', out)

if __name__ == '__main__':
    main()
