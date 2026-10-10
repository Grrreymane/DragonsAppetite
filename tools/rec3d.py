"""无头 Chrome（开 GPU）跑一个页面 + 一段「导演脚本」，逐帧录视频 / 存截图 / 转发报错。

    python tools/rec3d.py --page index.html --director tools/scenarios/fly.js --size 540x960 --out .cache/rec/fly.mp4
    python tools/rec3d.py --page _lab/creatures.html --director tools/scenarios/snap.js --out .cache/rec/creatures   # 只存截图

导演脚本是一个普通 JS 文件，被当成 <script type="module"> 插到页面最后。它能用这些全局函数：
    await __frame()            把当前画布存成一帧（JPEG，进视频）
    await __shot(name)         把当前画布存成 <out目录>/<name>.png（截图，不进视频）
    __log(text)                打印到终端
    await __done()             结束（必须调用）
页面里的报错（error / unhandledrejection / console.error）会自动打印成 "ERR ..."。
录视频时页面地址带 ?rec=1（游戏据此打开 preserveDrawingBuffer）。可以用 --query 追加参数，例如 --query "seed=3&stage=1"。
--sheet 0.5   每 0.5 秒抽一帧拼成联系表（<out>_sheet.jpg），方便一眼看完整段。
"""
import argparse, functools, http.server, pathlib, subprocess, sys, tempfile, threading, time, urllib.parse
sys.path.insert(0, 'D:/Minigame/_workflow/tools')
from shot import browser  # noqa

HOOKS = r"""
<script>
(() => {
  const post = (p, b) => fetch(p, { method: 'POST', body: b });
  const log = t => post('/__log', String(t));
  addEventListener('error', e => log('ERR ' + e.message + ' @' + (e.filename || '') + ':' + (e.lineno || '')));
  addEventListener('unhandledrejection', e => log('ERR (promise) ' + (e.reason && (e.reason.stack || e.reason.message) || e.reason)));
  const ce = console.error.bind(console); console.error = (...a) => { log('ERR console: ' + a.map(String).join(' ')); ce(...a); };
  const cw = console.warn.bind(console); console.warn = (...a) => { log('WARN ' + a.map(String).join(' ')); cw(...a); };
  const cv = () => document.querySelector('canvas');
  window.__log = log;
  window.__frame = async () => { const b = await new Promise(r => cv().toBlob(r, 'image/jpeg', .9)); await post('/__frame', b); };
  window.__shot = async name => { const b = await new Promise(r => cv().toBlob(r, 'image/png')); await post('/__shot?name=' + encodeURIComponent(name), b); };
  window.__done = () => post('/__done', '');
})();
</script>
"""

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--page', default='index.html'); ap.add_argument('--director', required=True)
    ap.add_argument('--size', default='540x960'); ap.add_argument('--out', default='.cache/rec/out.mp4')
    ap.add_argument('--query', default=''); ap.add_argument('--fps', type=int, default=30)
    ap.add_argument('--sheet', type=float, default=0); ap.add_argument('--timeout', type=int, default=900)
    a = ap.parse_args()
    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    root = pathlib.Path(__file__).resolve().parent.parent
    out = (root / a.out).resolve()
    video = out.suffix.lower() == '.mp4'
    shots_dir = out.parent / (out.stem + '_frames') if video else out
    shots_dir.mkdir(parents=True, exist_ok=True)
    for f in list(shots_dir.glob('*.jpg')): f.unlink()
    director = (root / a.director).read_text(encoding='utf-8')
    page_path = a.page.replace('\\', '/').lstrip('/')
    html = (root / page_path).read_text(encoding='utf-8')
    head_at = html.find('<head>')
    html = html[:head_at + 6] + HOOKS + html[head_at + 6:] if head_at >= 0 else HOOKS + html
    html = html.replace('</body>', '<script type="module">\n' + director + '\n</script>\n</body>')
    enc = None
    if video:
        enc = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', str(a.fps), '-i', '-',
                                '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p',
                                '-movflags', '+faststart', str(out)], stdin=subprocess.PIPE)
    done = threading.Event(); st = {'n': 0, 'err': 0}
    rec_name = '/' + page_path.rsplit('/', 1)[0] + '/__rec.html' if '/' in page_path else '/__rec.html'
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *x): pass
        def end_headers(self):
            self.send_header('Cache-Control', 'no-store'); super().end_headers()
        def do_GET(self):
            if self.path.split('?')[0] == rec_name:
                b = html.encode('utf-8'); self.send_response(200); self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b); return
            return super().do_GET()
        def do_POST(self):
            body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
            p = urllib.parse.urlparse(self.path)
            if p.path == '/__frame':
                if enc: enc.stdin.write(body)
                (shots_dir / f'{st["n"]:05d}.jpg').write_bytes(body); st['n'] += 1
            elif p.path == '/__shot':
                name = urllib.parse.parse_qs(p.query).get('name', ['shot'])[0]
                (shots_dir / (name + '.png')).write_bytes(body); print('shot', shots_dir / (name + '.png'), flush=True)
            elif p.path == '/__log':
                t = body.decode('utf-8', 'replace'); print(t, flush=True)
                if t.startswith('ERR'): st['err'] += 1
            elif p.path == '/__done': done.set()
            self.send_response(204); self.end_headers()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=str(root)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    w, h = a.size.split('x')
    q = 'rec=1' + ('&' + a.query if a.query else '')
    url = f'http://127.0.0.1:{srv.server_port}{rec_name}?{q}&t={int(time.time())}'
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as prof:
        ch = subprocess.Popen([browser(), '--headless=new', '--hide-scrollbars', '--mute-audio', '--enable-gpu', '--ignore-gpu-blocklist',
                               '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--force-device-scale-factor=1',
                               f'--user-data-dir={prof}', f'--window-size={w},{h}', url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ok = done.wait(a.timeout); ch.kill(); ch.wait()
    srv.shutdown()
    if enc: enc.stdin.close(); enc.wait()
    if video and a.sheet > 0 and st['n']:
        from PIL import Image
        step = max(1, round(a.sheet * a.fps)); files = sorted(shots_dir.glob('*.jpg'))[::step]
        ims = [Image.open(f) for f in files]; tw = 180; th = round(ims[0].height * tw / ims[0].width); cols = 8
        sheet = Image.new('RGB', (cols * tw, ((len(ims) + cols - 1) // cols) * th), (20, 20, 20))
        for i, im in enumerate(ims): sheet.paste(im.resize((tw, th)), ((i % cols) * tw, (i // cols) * th))
        sp = out.with_name(out.stem + '_sheet.jpg'); sheet.save(sp, quality=88); print('sheet', sp)
    print('ok' if ok else 'TIMEOUT', st['n'], 'frames', st['err'], 'errors ->', out)

if __name__ == '__main__':
    main()
