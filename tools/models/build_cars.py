#!/usr/bin/env python3
"""NitroVerse — öz maşın gövdələrinin generatoru (Faza 3.8b).

Kenney Car Kit ilə EYNİ boru xəttinə düşən GLB yazır: `body` + 4 təkər düyünü, tək material,
Kenney palitra atlası (`Textures/colormap.png`, CC0). Hər üz atlasın bir tekselinə bağlanır —
boya dəyişimi, yanan fara/stop və tünd şüşə (ModelLibrary) əlavə kod olmadan işləyir.
Təkərlər Kenney modelindən (sedan-sports.glb, CC0) olduğu kimi köçürülür.

Gövdə: yan profil çoxbucaqlısı (təkər tağları kəsilmiş) eninə çəkilir, en profil boyu dəyişir;
üstünə daralan kabina oturur; fara, stop, radiator, ətək, qanad ayrıca qutulardır.

İşlətmə:  python3 tools/models/build_cars.py            → public/models/cars/<ad>.glb
Xarici kitabxana tələb etmir.
"""
import json
import math
import os
import struct
import sys

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
CARS = os.path.join(ROOT, 'public', 'models', 'cars')

# Atlas tekselləri (ölçülüb: colormap.png 512×512) — rəng ailələri ModelLibrary ilə uzlaşır
UV = {
    'paint': (0.8438, 0.3691),   # #e86147 — doymuş ailə: boya bunu dəyişir
    'glass': (0.0938, 0.9092),   # #e1f2ff — detal keçidi tündləşdirir
    'head': (0.2188, 0.9102),    # #ffd02b — yanır (isti ağ)
    'tail': (0.2812, 0.8750),    # #de433e — yanır (qırmızı)
    'dark': (0.3438, 0.6748),    # #3a3a3f — plastik/rezin
    'grey': (0.4688, 0.7158),    # #66677c — şassi
    'light': (0.8438, 0.6387),   # #d9d9e7 — metal detal
}


def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


class Mesh:
    """Düz kölgəli üçbucaq şorbası: hər üçbucağın öz təpələri, normalı və tək UV-si."""

    def __init__(self):
        self.pos, self.nrm, self.uv = [], [], []

    def tri(self, a, b, c, col, out=None, fixed=None):
        n = cross(sub(b, a), sub(c, a))
        if dot(n, n) < 1e-12:
            return
        n = norm(n)
        if out is not None and dot(n, out) < 0:      # sarğını çölə baxan tərəfə çevir
            b, c = c, b
            n = (-n[0], -n[1], -n[2])
        if fixed is not None:                        # ortaq normal: əyri panel düz səth kimi işıqlanır
            n = norm(fixed)
        for p in (a, b, c):
            self.pos.append(p)
            self.nrm.append(n)
            self.uv.append(UV[col])

    def quad(self, a, b, c, d, col, out=None):
        self.tri(a, b, c, col, out)
        self.tri(a, c, d, col, out)

    def box(self, cx, cy, cz, sx, sy, sz, col, skip=()):
        """Mərkəz + ölçü. skip: çəkilməyən üzlər ('+x', '-y', …)."""
        x0, x1, y0, y1, z0, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2
        f = {
            '+x': ((x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1), (1, 0, 0)),
            '-x': ((x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0), (-1, 0, 0)),
            '+y': ((x0, y1, z0), (x0, y1, z1), (x1, y1, z1), (x1, y1, z0), (0, 1, 0)),
            '-y': ((x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (0, -1, 0)),
            '+z': ((x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), (0, 0, 1)),
            '-z': ((x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (0, 0, -1)),
        }
        for k, (a, b, c, d, n) in f.items():
            if k not in skip:
                self.quad(a, b, c, d, col, n)


def ear_clip(poly):
    """Sadə (öz-özünü kəsməyən) çoxbucaqlının üçbucaqlara bölünməsi. poly: [(u, v)] — indekslər qaytarır."""
    n = len(poly)
    area = sum(poly[i][0] * poly[(i + 1) % n][1] - poly[(i + 1) % n][0] * poly[i][1] for i in range(n))
    idx = list(range(n)) if area > 0 else list(range(n - 1, -1, -1))   # saat əqrəbinin əksinə

    def turn(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    def inside(p, a, b, c):
        return turn(a, b, p) >= -1e-12 and turn(b, c, p) >= -1e-12 and turn(c, a, p) >= -1e-12

    tris = []
    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        m = len(idx)
        for k in range(m):
            i0, i1, i2 = idx[(k - 1) % m], idx[k], idx[(k + 1) % m]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if turn(a, b, c) <= 1e-12:
                continue
            if any(inside(poly[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(k)
            break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


def arch(zc, r, yb, yc, seg=7, forward=True):
    """Təkər tağı: (z, y) nöqtələri — alt xətdən qalxır, qövs çəkir, alt xəttə enir."""
    pts = [(zc + r, yb)] if forward else [(zc - r, yb)]
    for k in range(seg + 1):
        t = math.pi * k / seg
        z = zc + r * math.cos(t) * (1 if forward else -1)
        pts.append((z, yc + r * math.sin(t)))
    pts.append((zc - r, yb) if forward else (zc + r, yb))
    return pts


def build_body(P):
    """P — parametrlər lüğəti. Qaytarır: Mesh."""
    m = Mesh()
    wz, wr, wy = P['wheel_z'], P['wheel_r'], P['wheel_y']
    yb = P['clear']                     # yerdən məsafə
    ar = wr + P.get('arch_gap', 0.035)
    top = P['top']                      # çiyin xətti: [(z, y)] arxadan önə
    # ——— yan profil (saat əqrəbi istiqamətində: arxa-alt → arxa üz → üst → burun → alt) ———
    prof = []
    prof += P['rear']                   # arxa üz, aşağıdan yuxarı
    prof += top
    prof += P['nose']                   # burun, yuxarıdan aşağı
    prof += arch(wz, ar, yb, wy, forward=True)        # ön tağ (öndən arxaya)
    prof += arch(-wz, ar, yb, wy, forward=True)       # arxa tağ
    # təkrarlanan qonşu nöqtələri at
    clean = []
    for p in prof:
        if not clean or abs(p[0] - clean[-1][0]) > 1e-6 or abs(p[1] - clean[-1][1]) > 1e-6:
            clean.append(p)
    prof = clean

    width = P['width']                  # [(z, yarım en)] — xətti interpolyasiya

    def half(z):
        for (z0, w0), (z1, w1) in zip(width, width[1:]):
            if z0 <= z <= z1:
                t = (z - z0) / (z1 - z0) if z1 > z0 else 0
                return w0 + (w1 - w0) * t
        return width[0][1] if z < width[0][0] else width[-1][1]

    # aşağı hissə içəri yığılır (ətək): y < sill → en azalır
    def hw(z, y):
        w = half(z)
        t = max(0.0, min(1.0, (P['sill'] - y) / max(1e-6, P['sill'] - yb)))
        return w - P.get('tuck', 0.05) * t

    n = len(prof)
    cen = (0.0, 0.45, 0.0)
    # yan üzlər
    for (i0, i1, i2) in ear_clip(prof):
        for sx in (1, -1):
            v = [(sx * hw(z, y), y, z) for (z, y) in (prof[i0], prof[i1], prof[i2])]
            # yan panel eni dəyişdiyi üçün üçbucaqlar bir müstəvidə deyil — öz normalları ilə
            # yelpik kimi zolaqlanırdı (kadr: pilot-inferno 'yan'); ortaq normal təmiz panel verir
            m.tri(v[0], v[1], v[2], 'paint', (sx, 0, 0), fixed=(sx, 0.12, 0))
    # profil boyu zolaqlar (üst, burun, arxa, alt, tağların içi)
    area = sum(prof[i][0] * prof[(i + 1) % n][1] - prof[(i + 1) % n][0] * prof[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    for i in range(n):
        (z0, y0), (z1, y1) = prof[i], prof[(i + 1) % n]
        dz, dy = z1 - z0, y1 - y0
        out = (0.0, -dz * sgn, dy * sgn)            # 2D çölə normal (y, z müstəvisində)
        in_arch = (abs(z0) > wz - ar - 1e-4 and abs(z0) < wz + ar + 1e-4 and abs(z1) > wz - ar - 1e-4
                   and abs(z1) < wz + ar + 1e-4 and min(y0, y1) < wy + ar + 1e-4 and max(y0, y1) <= wy + ar + 1e-4
                   and not (y0 > wy + ar * 0.99 and y1 > wy + ar * 0.99))
        low = max(y0, y1) <= yb + 1e-4
        col = 'dark' if in_arch else 'grey' if low else 'paint'
        a = (-hw(z0, y0), y0, z0); b = (hw(z0, y0), y0, z0)
        c = (hw(z1, y1), y1, z1); d = (-hw(z1, y1), y1, z1)
        m.quad(a, b, c, d, col, out)

    # tağların arxasını bağlayan tünd nüvə (o biri tərəf görünməsin)
    m.box(0, (yb + wy + ar) / 2, 0, (half(0) - 0.36) * 2, wy + ar - yb - 0.02, (wz + ar) * 2 - 0.04, 'dark')

    # ——— kabina: çiyin xəttindən daralaraq qalxır ———
    C = P['cabin']
    zb0, zb1, zr0, zr1 = C['base'][0], C['base'][1], C['roof'][0], C['roof'][1]
    wb, wt, yr = C['wbase'], C['wroof'], C['y']

    def topy(z):
        for (z0, y0), (z1, y1) in zip(top, top[1:]):
            if z0 <= z <= z1:
                t = (z - z0) / (z1 - z0) if z1 > z0 else 0
                return y0 + (y1 - y0) * t
        return top[0][1]

    b0, b1 = topy(zb0) - 0.02, topy(zb1) - 0.02
    A = [(-wb, b0, zb0), (wb, b0, zb0), (wb, b1, zb1), (-wb, b1, zb1)]          # əsas
    R = [(-wt, yr, zr0), (wt, yr, zr0), (wt, yr, zr1), (-wt, yr, zr1)]          # tavan
    m.quad(R[0], R[1], R[2], R[3], 'paint', (0, 1, 0))                          # tavan
    m.quad(A[3], A[2], R[2], R[3], 'glass', (0, 0.5, 1))                        # ön şüşə
    m.quad(A[0], A[1], R[1], R[0], 'glass', (0, 0.5, -1))                       # arxa şüşə
    for sx, i, j in ((1, 1, 2), (-1, 0, 3)):
        m.quad(A[i], A[j], R[j], R[i], 'glass', (sx, 0.3, 0))                   # yan şüşə
        # dirəklər (A və C): şüşənin kənarında nazik boyalı zolaq — kabina "akvarium" olmasın
        for (p, q, w) in ((A[j], R[j], 0.05), (A[i], R[i], 0.07)):
            e = 0.012 * sx
            dzp = w if p is A[i] else -w
            m.quad((p[0] + e, p[1], p[2]), (p[0] + e, p[1], p[2] + dzp), (q[0] + e, q[1], q[2] + dzp),
                   (q[0] + e, q[1], q[2]), 'paint', (sx, 0.3, 0))
    # tavan lövhəsi (şüşədən azca çıxan kənar)
    m.box(0, yr + 0.012, (zr0 + zr1) / 2, wt * 2 + 0.03, 0.03, (zr1 - zr0) + 0.05, 'paint', skip=('-y',))

    # ——— detallar ———
    for d in P.get('boxes', []):
        cx, cy, cz, sx, sy, sz, col = d[:7]
        mirror = len(d) > 7 and d[7]
        m.box(cx, cy, cz, sx, sy, sz, col)
        if mirror:
            m.box(-cx, cy, cz, sx, sy, sz, col)
    return m, cen


def read_glb(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    return j, b[20 + n + 8:]


def accessor_bytes(j, bin_, i):
    a = j['accessors'][i]
    bv = j['bufferViews'][a['bufferView']]
    size = {5126: 4, 5123: 2, 5125: 4, 5121: 1}[a['componentType']] * {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', size)
    if stride == size:
        return bin_[off:off + size * a['count']]
    return b''.join(bin_[off + k * stride: off + k * stride + size] for k in range(a['count']))


def write_glb(path, body, wheels_from, wheel_pos):
    """body: Mesh. Təkərlər `wheels_from` GLB-dən köçürülür, `wheel_pos` = (x, y, z) yerləşməsi."""
    src, sbin = read_glb(wheels_from)
    buf = bytearray()
    views, accs, meshes, nodes = [], [], [], []

    def add(data, target=None):
        while len(buf) % 4:
            buf.append(0)
        views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(data), **({'target': target} if target else {})})
        buf.extend(data)
        return len(views) - 1

    def acc(view, ctype, count, typ, mn=None, mx=None):
        a = {'bufferView': view, 'componentType': ctype, 'count': count, 'type': typ}
        if mn is not None:
            a['min'], a['max'] = mn, mx
        accs.append(a)
        return len(accs) - 1

    # gövdə
    P = body.pos
    pv = add(b''.join(struct.pack('<3f', *p) for p in P), 34962)
    nv = add(b''.join(struct.pack('<3f', *p) for p in body.nrm), 34962)
    uv = add(b''.join(struct.pack('<2f', *p) for p in body.uv), 34962)
    mn = [min(p[i] for p in P) for i in range(3)]
    mx = [max(p[i] for p in P) for i in range(3)]
    meshes.append({'name': 'body', 'primitives': [{'attributes': {
        'POSITION': acc(pv, 5126, len(P), 'VEC3', mn, mx), 'NORMAL': acc(nv, 5126, len(P), 'VEC3'),
        'TEXCOORD_0': acc(uv, 5126, len(P), 'VEC2')}, 'material': 0}]})
    nodes.append({'name': 'body', 'mesh': 0})
    # təkərlər
    wx, wy, wz = wheel_pos
    for nd in src['nodes']:
        name = nd.get('name', '')
        if not name.startswith('wheel-') or 'mesh' not in nd:
            continue
        prims = []
        for p in src['meshes'][nd['mesh']]['primitives']:
            at = {}
            for k in ('POSITION', 'NORMAL', 'TEXCOORD_0'):
                if k not in p['attributes']:
                    continue
                a = src['accessors'][p['attributes'][k]]
                v = add(accessor_bytes(src, sbin, p['attributes'][k]), 34962)
                at[k] = acc(v, a['componentType'], a['count'], a['type'], a.get('min'), a.get('max'))
            q = {'attributes': at, 'material': 0}
            if 'indices' in p:
                a = src['accessors'][p['indices']]
                v = add(accessor_bytes(src, sbin, p['indices']), 34963)
                q['indices'] = acc(v, a['componentType'], a['count'], 'SCALAR')
            prims.append(q)
        meshes.append({'name': name, 'primitives': prims})
        sx = 1 if 'left' in name else -1
        sz = 1 if 'front' in name else -1
        # Kenney təkərinin düyün yeri x = ±0.3 (həndəsə oxdan çölə uzanır) — iz eninə görə sürüşdürülür
        nodes.append({'name': name, 'mesh': len(meshes) - 1, 'translation': [sx * wx, wy, sz * wz]})
    while len(buf) % 4:
        buf.append(0)
    gltf = {
        'asset': {'version': '2.0', 'generator': 'NitroVerse tools/models/build_cars.py'},
        'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes,
        'materials': [{'name': 'colormap', 'doubleSided': True,
                       'pbrMetallicRoughness': {'baseColorTexture': {'index': 0}, 'metallicFactor': 0.0}}],
        'textures': [{'sampler': 0, 'source': 0, 'name': 'colormap'}],
        'images': [{'uri': 'Textures/colormap.png', 'name': 'colormap'}],
        'samplers': [{'minFilter': 9987}],
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}],
    }
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    total = 12 + 8 + len(js) + 8 + len(buf)
    with open(path, 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON'))
        f.write(js)
        f.write(struct.pack('<I4s', len(buf), b'BIN\x00'))
        f.write(buf)
    return len(body.pos) // 3


# ————— MODELLƏR —————
# Vahidlər Kenney modelləri ilə eynidir (maşın ≈ 2.6 uzun; oyun 4.4 m-ə normallaşdırır). +z = ön.
MODELS = {
    # İDMAN KUPESİ — alçaq paz burun, arxaya çəkilmiş kabina, ördək quyruğu, arxa qanad
    'coupe': dict(
        wheel_z=0.80, wheel_r=0.30, wheel_y=0.30, wheel_x=0.34, clear=0.13, sill=0.30, tuck=0.07,
        rear=[(-1.02, 0.13), (-1.30, 0.20), (-1.33, 0.44), (-1.30, 0.66), (-1.33, 0.71)],
        top=[(-1.33, 0.71), (-1.12, 0.72), (-0.70, 0.71), (0.42, 0.68), (0.78, 0.67), (1.08, 0.56), (1.30, 0.44)],
        nose=[(1.30, 0.44), (1.36, 0.34), (1.33, 0.19), (1.20, 0.13)],
        width=[(-1.34, 0.60), (-0.80, 0.70), (0.0, 0.68), (0.80, 0.70), (1.10, 0.64), (1.37, 0.52)],
        cabin=dict(base=(-0.86, 0.50), roof=(-0.30, 0.10), wbase=0.60, wroof=0.47, y=1.02),
        boxes=[
            # fara: burnun yuxarı künclərində enli, nazik
            (0.36, 0.40, 1.315, 0.26, 0.07, 0.06, 'head', True),
            # radiator ağzı + alt dodaq
            (0.0, 0.26, 1.345, 0.62, 0.10, 0.04, 'dark'),
            (0.0, 0.135, 1.30, 1.06, 0.03, 0.16, 'dark'),
            # stop: tam enli nazik zolaq + altında difuzor
            (0.0, 0.58, -1.325, 1.06, 0.06, 0.04, 'tail'),
            (0.0, 0.20, -1.26, 0.86, 0.10, 0.12, 'dark'),
            (0.24, 0.20, -1.335, 0.10, 0.07, 0.06, 'light', True),     # egzoz ucları
            # yan ətək
            (0.655, 0.165, 0.0, 0.05, 0.06, 0.88, 'dark', True),
            # kapot hava çıxışı
            (0.20, 0.655, 0.72, 0.16, 0.02, 0.26, 'dark', True),
            # arxa qanad: iki dayaq + lövhə
            (0.40, 0.80, -1.12, 0.05, 0.16, 0.10, 'dark', True),
            (0.0, 0.89, -1.16, 1.16, 0.035, 0.22, 'paint'),
            # güzgülər
            (0.66, 0.78, 0.36, 0.12, 0.06, 0.08, 'paint', True),
        ],
    ),
}


def main():
    only = sys.argv[1:]
    src = os.path.join(CARS, 'sedan-sports.glb')
    for name, P in MODELS.items():
        if only and name not in only:
            continue
        body, _ = build_body(P)
        out = os.path.join(CARS, name + '.glb')
        tris = write_glb(out, body, src, (P['wheel_x'], P['wheel_y'], P['wheel_z']))
        print(f'{name}: gövdə {tris} üçbucaq → {os.path.relpath(out, ROOT)} ({os.path.getsize(out) // 1024} KB)')


if __name__ == '__main__':
    main()
