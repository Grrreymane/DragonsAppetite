# glb 瘦身（系统 python + numpy，不用 Blender）：KHR_mesh_quantization + 去掉不动的动画通道
#   python blender/glb_quantize.py <in.glb> [out.glb]          （不写 out 就覆盖 in）
# three.js r160 的 GLTFLoader 原生支持 KHR_mesh_quantization，不需要解码器（不像 Draco / meshopt）。
#   POSITION   float → 归一化 SHORT（坐标必须在 ±1 内；Tripo 模型最大边约 1，居中，所以在 ±0.5 内），每个顶点补齐到 8 字节
#   NORMAL     float → 归一化 BYTE，补齐到 4 字节
#   TEXCOORD_n float → 归一化 UNSIGNED_SHORT（UV 都在 [0,1] 时；否则保持 float）
#   WEIGHTS_0  float → 归一化 UNSIGNED_BYTE，每个顶点四个权重的和正好 255（最大余数法）
#   动画：平移 / 缩放通道如果全程不变、而且等于骨头节点自己的静止值，就删掉（three.js 不碰没动画的属性，骨头保持静止值）
#         旋转输出 float → 归一化 SHORT
# 不动：索引、骨骼索引、逆绑定矩阵、贴图。输出前把 bufferView 按 4 字节对齐重新排。
import sys, json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
BYTE, UBYTE, SHORT, USHORT, FLOAT = 5120, 5121, 5122, 5123, 5126


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, total = struct.unpack('<III', b[:12])
    assert magic == 0x46546C67, 'not a glb'
    jl, jt = struct.unpack('<II', b[12:20]); j = json.loads(b[20:20 + jl])
    o = 20 + jl; bl, bt = struct.unpack('<II', b[o:o + 8]); binc = b[o + 8:o + 8 + bl]
    return j, binc


def acc_array(j, binc, ai):
    a = j['accessors'][ai]; bv = j['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]); n = NC[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride') or dt.itemsize * n
    item = dt.itemsize * n
    raw = np.frombuffer(binc, dtype=np.uint8)[off:off + stride * a['count']]
    if len(raw) < stride * a['count']: raw = np.concatenate([raw, np.zeros(stride * a['count'] - len(raw), np.uint8)])
    return raw.reshape(a['count'], stride)[:, :item].copy().view(dt).reshape(a['count'], n)   # 归一化的也原样返回整数


def quantize(src, dst):
    j, binc = read_glb(src)
    assert not any('sparse' in a for a in j['accessors']), 'sparse accessors not supported'
    new_views = []          # (bytes, target, stride)
    view_of_acc = {}        # accessor index → (data bytes, target, stride)
    acc = j['accessors']

    def put(ai, arr, ctype, normalized, target, stride=None, minmax=False):
        a = acc[ai]; a['componentType'] = ctype
        if normalized: a['normalized'] = True
        else: a.pop('normalized', None)
        a.pop('byteOffset', None)
        n = NC[a['type']]; item = arr.dtype.itemsize * n
        if stride and stride != item:   # 每个元素补齐到 stride 字节
            buf = np.zeros((arr.shape[0], stride), dtype=np.uint8)
            buf[:, :item] = arr.view(np.uint8).reshape(arr.shape[0], item)
            data = buf.tobytes()
        else:
            data = np.ascontiguousarray(arr).tobytes(); stride = None
        if minmax:
            a['min'] = [int(x) for x in arr.min(0)]; a['max'] = [int(x) for x in arr.max(0)]
        view_of_acc[ai] = (data, target, stride)

    report = {}
    done = set()
    for mesh in j['meshes']:
        for prim in mesh['primitives']:
            at = prim['attributes']
            for key, ai in at.items():
                if ai in done: continue
                done.add(ai); a = acc[ai]
                if a['componentType'] != FLOAT:
                    continue
                v = acc_array(j, binc, ai).astype(np.float64)
                if key == 'POSITION':
                    m = np.abs(v).max(); assert m <= 1.0, f'POSITION out of ±1 ({m}); needs a node scale'
                    q = np.round(v * 32767).astype(np.int16)
                    put(ai, q, SHORT, True, 34962, stride=8, minmax=True)
                    report[key] = float(np.abs(q / 32767 - v).max())
                elif key == 'NORMAL':
                    nv = v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)
                    q = np.round(nv * 127).astype(np.int8)
                    put(ai, q, BYTE, True, 34962, stride=4)
                    back = q / 127.0; back /= np.linalg.norm(back, axis=1, keepdims=True)
                    report[key] = float(np.degrees(np.arccos(np.clip((back * nv).sum(1), -1, 1))).max())
                elif key.startswith('TEXCOORD') and v.min() >= 0 and v.max() <= 1:
                    q = np.round(v * 65535).astype(np.uint16)
                    put(ai, q, USHORT, True, 34962)
                    report[key] = float(np.abs(q / 65535 - v).max())
                elif key.startswith('WEIGHTS'):
                    w = np.clip(v, 0, None); s = w.sum(1, keepdims=True); s[s == 0] = 1; w = w / s * 255
                    q = np.floor(w).astype(np.int32); rem = 255 - q.sum(1)
                    frac = w - q; order = np.argsort(-frac, axis=1)
                    for r in range(4):   # 最大余数法：余下的 1 给小数部分最大的
                        sel = rem > r
                        q[np.arange(len(q))[sel], order[sel, r]] += 1
                    assert (q.sum(1) == 255).all()
                    put(ai, q.astype(np.uint8), UBYTE, True, 34962)
                    report[key] = float(np.abs(q / 255 - v / np.maximum(v.sum(1, keepdims=True), 1e-9)).max())
    # ---- 动画 ----
    dropped = 0
    for an in j.get('animations', []):
        keep = []
        for ch in an['channels']:
            path = ch['target']['path']; smp = an['samplers'][ch['sampler']]
            node = j['nodes'][ch['target']['node']]
            if path in ('translation', 'scale') and smp.get('interpolation', 'LINEAR') != 'CUBICSPLINE':
                out = acc_array(j, binc, smp['output']).astype(np.float64)
                rest = np.array(node.get(path, [0, 0, 0] if path == 'translation' else [1, 1, 1]))
                if np.abs(out - out[0]).max() < 1e-6 and np.abs(out[0] - rest).max() < 1e-5:
                    dropped += 1; continue
            keep.append(ch)
        # 采样器重新编号
        used = sorted({c['sampler'] for c in keep}); remap = {o: i for i, o in enumerate(used)}
        an['samplers'] = [an['samplers'][i] for i in used]
        for c in keep: c['sampler'] = remap[c['sampler']]
        an['channels'] = keep
        for c in keep:
            smp = an['samplers'][c['sampler']]; ai = smp['output']
            # CUBICSPLINE 的输出里夹着切线（in-tangent / value / out-tangent），不能当四元数归一，原样保留
            if c['target']['path'] == 'rotation' and smp.get('interpolation', 'LINEAR') != 'CUBICSPLINE'                     and acc[ai]['componentType'] == FLOAT and ai not in view_of_acc:
                q = acc_array(j, binc, ai).astype(np.float64)
                q /= np.linalg.norm(q, axis=1, keepdims=True)
                put(ai, np.round(q * 32767).astype(np.int16), SHORT, True, None)
    # ---- 重新排 buffer：只留还被引用的 accessor / image ----
    used_acc = set()
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            used_acc.update(p['attributes'].values())
            if 'indices' in p: used_acc.add(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: used_acc.add(s['inverseBindMatrices'])
    for an in j.get('animations', []):
        for s in an['samplers']: used_acc.update((s['input'], s['output']))
    old_acc = j['accessors']; acc_remap = {}; new_acc = []
    for i, a in enumerate(old_acc):
        if i in used_acc: acc_remap[i] = len(new_acc); new_acc.append(a)
    out_bin = bytearray(); views = []
    def add_view(data, target=None, stride=None):
        while len(out_bin) % 4: out_bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(out_bin), 'byteLength': len(data)}
        if target: v['target'] = target
        if stride: v['byteStride'] = stride
        out_bin.extend(data); views.append(v); return len(views) - 1
    for oi, a in enumerate(old_acc):
        if oi not in used_acc: continue
        if oi in view_of_acc:
            data, target, stride = view_of_acc[oi]
        else:
            bv = j['bufferViews'][a['bufferView']]
            st = bv.get('byteOffset', 0); data = binc[st:st + bv['byteLength']]
            target, stride = bv.get('target'), bv.get('byteStride')
            # 原 view 可能被别的 accessor 共用：这里每个 accessor 各拷一份（Blender 导出的是一对一）
        a['bufferView'] = add_view(data, target, stride)
    for img in j.get('images', []):
        bv = j['bufferViews'][img['bufferView']]; st = bv.get('byteOffset', 0)
        img['bufferView'] = add_view(binc[st:st + bv['byteLength']])
    j['accessors'] = new_acc; j['bufferViews'] = views
    def ra(x): return acc_remap[x]
    for mesh in j['meshes']:
        for p in mesh['primitives']:
            p['attributes'] = {k: ra(v) for k, v in p['attributes'].items()}
            if 'indices' in p: p['indices'] = ra(p['indices'])
    for s in j.get('skins', []):
        if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = ra(s['inverseBindMatrices'])
    for an in j.get('animations', []):
        for s in an['samplers']: s['input'] = ra(s['input']); s['output'] = ra(s['output'])
    while len(out_bin) % 4: out_bin.append(0)
    j['buffers'] = [{'byteLength': len(out_bin)}]
    for k in ('extensionsUsed', 'extensionsRequired'):
        l = j.setdefault(k, [])
        if 'KHR_mesh_quantization' not in l: l.append('KHR_mesh_quantization')
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out_bin))
    glb += struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out_bin), 0x004E4942) + bytes(out_bin)
    open(dst, 'wb').write(glb)
    return {'bytes': len(glb), 'json': len(js), 'bin': len(out_bin), 'droppedChannels': dropped, 'maxErr': report}


if __name__ == '__main__':
    src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else src
    import os; before = os.path.getsize(src)
    r = quantize(src, dst)
    print('QUANTIZED', os.path.basename(dst), before, '->', r['bytes'], json.dumps(r))
