# 导出后压缩 glb（系统 python + numpy，不用 Blender）：
#   python blender/glb_pack.py <in.glb> [out.glb]      （不给 out 就原地覆盖）
# 1) 动画：丢掉「整段不变、而且等于静止姿势」的通道（缩放几乎全是这种；非根骨的位移也是）；
#    整段不变但不等于静止姿势的通道缩成 2 个关键帧；旋转输出存成 SHORT normalized（three 的 GLTFLoader 会还原）。
# 2) 网格（KHR_mesh_quantization，不需要解码器，three.js 原生支持）：
#    POSITION → SHORT normalized（模型在 ±1 以内，直接存，不需要额外变换，描边外扩宽度不变）
#    NORMAL → BYTE normalized，TEXCOORD_0 → UNSIGNED_SHORT normalized，WEIGHTS_0 → UNSIGNED_BYTE normalized（每个顶点和 = 255）
# 不用 Draco / meshopt（要解码器）。
import json, struct, sys, os
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def load(path):
    b = open(path, 'rb').read()
    assert b[:4] == b'glTF'
    jl = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + jl])
    o = 20 + jl; bl = struct.unpack('<I', b[o:o + 4])[0]; binc = b[o + 8:o + 8 + bl]
    return j, binc

def read_acc(j, binc, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]; cnt = a['count']
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', 0) or dt.itemsize * n
    raw = np.frombuffer(binc, dtype=np.uint8, count=stride * (cnt - 1) + dt.itemsize * n, offset=off)
    arr = np.lib.stride_tricks.as_strided(raw, shape=(cnt, dt.itemsize * n), strides=(stride, 1)).copy()
    out = arr.view(dt).reshape(cnt, n)
    if a.get('normalized'):
        mx = {np.int8: 127, np.uint8: 255, np.int16: 32767, np.uint16: 65535}[CT[a['componentType']]]
        out = np.maximum(out.astype(np.float32) / mx, -1)
    return out.astype(np.float32) if a['componentType'] == 5126 or a.get('normalized') else out

class Writer:
    def __init__(s): s.buf = bytearray(); s.views = []; s.accs = []; s.shared = None
    def begin_shared(s):            # 之后的 accessor 都放进同一个 bufferView（动画数据，JSON 小很多）
        while len(s.buf) % 4: s.buf.append(0)
        s.shared = (len(s.buf), len(s.views)); s.views.append(None)
    def end_shared(s):
        st, vi = s.shared; s.views[vi] = {'buffer': 0, 'byteOffset': st, 'byteLength': len(s.buf) - st}; s.shared = None
    def view(s, data, stride=None, target=None):
        while len(s.buf) % 4: s.buf.append(0)
        if s.shared:
            st, vi = s.shared; s._off = len(s.buf) - st; s.buf += data; return vi
        v = {'buffer': 0, 'byteOffset': len(s.buf), 'byteLength': len(data)}
        if stride: v['byteStride'] = stride
        if target: v['target'] = target
        s.buf += data; s.views.append(v); return len(s.views) - 1
    def acc(s, arr, ctype, typ, normalized=False, minmax=False, stride=None, target=None):
        arr = np.ascontiguousarray(arr); n = NC[typ]; dt = np.dtype(CT[ctype])
        rows = arr.reshape(len(arr), n).astype(dt)
        if stride and stride > dt.itemsize * n:      # 顶点属性每行要 4 字节对齐（VEC3 的 BYTE / SHORT 要补位）
            pad = np.zeros((len(rows), stride), np.uint8); pad[:, :dt.itemsize * n] = rows.view(np.uint8).reshape(len(rows), -1)
            data = pad.tobytes()
        else:
            data = rows.tobytes(); stride = None
        a = {'bufferView': s.view(data, stride, target), 'componentType': ctype, 'count': len(rows), 'type': typ}
        if s.shared and s._off: a['byteOffset'] = s._off
        if normalized: a['normalized'] = True
        if minmax: a['min'] = rows.min(0).tolist(); a['max'] = rows.max(0).tolist()
        s.accs.append(a); return len(s.accs) - 1

def qrot_same(a, b, tol):
    return min(np.abs(a - b).max(), np.abs(a + b).max()) < tol

def pack(src, dst):
    j, binc = load(src); W = Writer(); nodes = j['nodes']
    before = os.path.getsize(src); remap = {}
    def keep(i):            # 原样拷贝一个 accessor
        if i in remap: return remap[i]
        a = dict(j['accessors'][i]); arr = read_acc(j, binc, i) if not a.get('normalized') else None
        if arr is None: raise RuntimeError('unexpected normalized accessor')
        typ = a['type']; ct = a['componentType']
        tgt = j['bufferViews'][a['bufferView']].get('target')
        k = W.acc(arr, ct, typ, minmax='min' in a, target=tgt)
        remap[i] = k; return k
    # ---- 网格 ----
    stats = {}
    for m in j['meshes']:
        for pr in m['primitives']:
            at = pr['attributes']; new = {}
            for name, i in at.items():
                arr = read_acc(j, binc, i)
                if name == 'POSITION':
                    mx = float(np.abs(arr).max()); assert mx <= 1.0, f'POSITION out of ±1 ({mx}); need IBM rescale'
                    q = np.clip(np.round(arr * 32767), -32767, 32767)
                    new[name] = W.acc(q, 5122, 'VEC3', True, True, stride=8, target=34962)
                    stats['pos_err'] = float(np.abs(q / 32767 - arr).max())
                elif name == 'NORMAL':
                    nn = arr / np.maximum(np.linalg.norm(arr, axis=1, keepdims=True), 1e-9)
                    new[name] = W.acc(np.clip(np.round(nn * 127), -127, 127), 5120, 'VEC3', True, stride=4, target=34962)
                elif name.startswith('TEXCOORD') and arr.min() >= 0 and arr.max() <= 1:
                    new[name] = W.acc(np.round(arr * 65535), 5123, 'VEC2', True, target=34962)
                elif name.startswith('WEIGHTS'):
                    w = arr / np.maximum(arr.sum(1, keepdims=True), 1e-9)
                    q = np.floor(w * 255 + 0.5).astype(np.int32)
                    d = 255 - q.sum(1); k = np.argmax(w, 1); q[np.arange(len(q)), k] += d
                    new[name] = W.acc(np.clip(q, 0, 255), 5121, 'VEC4', True, target=34962)
                elif name.startswith('JOINTS'):
                    new[name] = W.acc(arr, 5121 if arr.max() < 256 else 5123, 'VEC4', target=34962)
                else:
                    new[name] = keep(i)
            pr['attributes'] = new
            if 'indices' in pr:
                ia = read_acc(j, binc, pr['indices']).reshape(-1)
                pr['indices'] = W.acc(ia, 5123 if ia.max() < 65536 else 5125, 'SCALAR', target=34963)
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = keep(s['inverseBindMatrices'])
    # ---- 动画 ----
    dropped = kept = shrunk = 0
    W.begin_shared(); tcache = {}
    for an in j.get('animations', []):
        chans = []; samplers = []
        for ch in an['channels']:
            smp = an['samplers'][ch['sampler']]; node = nodes[ch['target']['node']]; path = ch['target']['path']
            t = read_acc(j, binc, smp['input']).reshape(-1); v = read_acc(j, binc, smp['output'])
            rest = np.array(node.get({'rotation': 'rotation', 'translation': 'translation', 'scale': 'scale'}[path],
                                      {'rotation': [0, 0, 0, 1], 'translation': [0, 0, 0], 'scale': [1, 1, 1]}[path]), np.float32)
            const = np.abs(v - v[0]).max() < (2e-4 if path == 'rotation' else 1e-5)
            if const:
                at_rest = qrot_same(v[0], rest, 2e-4) if path == 'rotation' else np.abs(v[0] - rest).max() < 1e-5
                if at_rest: dropped += 1; continue
                t = t[[0, -1]]; v = v[[0, -1]]; shrunk += 1
            kept += 1
            tk = t.astype(np.float32).tobytes()
            if tk not in tcache: tcache[tk] = W.acc(t, 5126, 'SCALAR', minmax=True)   # 同一段动作的时间轴共用
            ti = tcache[tk]
            if path == 'rotation':
                v = v / np.linalg.norm(v, axis=1, keepdims=True)
                for r in range(1, len(v)):             # 相邻四元数取同一半球，插值不绕远
                    if np.dot(v[r], v[r - 1]) < 0: v[r] = -v[r]
                vi = W.acc(np.clip(np.round(v * 32767), -32767, 32767), 5122, 'VEC4', True)
            else:
                vi = W.acc(v, 5126, 'VEC3')
            samplers.append({'input': ti, 'output': vi, 'interpolation': smp.get('interpolation', 'LINEAR')})
            chans.append({'sampler': len(samplers) - 1, 'target': ch['target']})
        an['channels'] = chans; an['samplers'] = samplers
    W.end_shared()
    # ---- 贴图 ----
    for im in j.get('images', []):
        if 'bufferView' in im:
            bv = j['bufferViews'][im['bufferView']]; o = bv.get('byteOffset', 0)
            im['bufferView'] = W.view(binc[o:o + bv['byteLength']])
    for nd in nodes:                     # 节点的 TRS 保留 6 位小数，单位缩放直接省掉
        for k in ('rotation', 'translation', 'scale'):
            if k in nd: nd[k] = [round(x, 6) + 0.0 for x in nd[k]]
        if 'scale' in nd and max(abs(x - 1) for x in nd['scale']) < 1e-5: del nd['scale']
    for a in W.accs:
        for k in ('min', 'max'):
            if k in a and a['componentType'] == 5126: a[k] = [round(x, 5) for x in a[k]]
    j['accessors'] = W.accs; j['bufferViews'] = W.views
    while len(W.buf) % 4: W.buf.append(0)
    j['buffers'] = [{'byteLength': len(W.buf)}]
    for key in ('extensionsUsed', 'extensionsRequired'):
        j[key] = sorted(set(j.get(key, [])) | {'KHR_mesh_quantization'})
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = b'glTF' + struct.pack('<II', 2, 12 + 8 + len(js) + 8 + len(W.buf))
    out += struct.pack('<I', len(js)) + b'JSON' + js + struct.pack('<I', len(W.buf)) + b'BIN\x00' + bytes(W.buf)
    open(dst, 'wb').write(out)
    print(f'PACK {os.path.basename(dst)} {before:,} -> {len(out):,} B  json {len(js):,}  channels kept {kept} (shrunk {shrunk}) dropped {dropped}  pos_err {stats.get("pos_err", 0):.2e}')

if __name__ == '__main__':
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else src
    pack(src, dst)
