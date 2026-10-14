"""Page tools: every output page rendered and compared with the source page it came from."""
import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import numpy as np
from PIL import Image

DPI = 36
cache = {}
def R(path, page, pw=None):
    k = (path, page)
    if k not in cache:
        from PIL import ImageFilter
        a = render(path, page, DPI, pw)
        cache[k] = None if a is None else np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), dtype=np.int16)
    return cache[k]

def diff(a, b):
    if a is None or b is None: return 999, 1
    if a.shape != b.shape:
        # allow a pixel of rounding
        if abs(a.shape[0] - b.shape[0]) <= 2 and abs(a.shape[1] - b.shape[1]) <= 2:
            h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1]); a, b = a[:h, :w], b[:h, :w]
        else:
            return 999, 1
    d = np.abs(a - b)
    return float(d.mean()), float((d > 64).mean())

def best_rot(src, out):
    best = (999, 1, 0)
    for k in range(4):
        m, f = diff(np.rot90(src, k), out)
        if m < best[0]: best = (m, f, k)
    return best

def ok(m, f): return m < 4 and f < 0.02

def src_pw(name): return PW.get(name)

problems = []
def report(tool, e, msg):
    problems.append(f"{tool}/{e['variant']}/{e['inputs'][0]}: {msg}")

def outputs(e): return [o for o in e['outcomes'] if o['kind'] == 'produced']

def check_mapping(tool, e, mapping, rot_ok=True):
    """mapping: list of (source_path, source_page, pw) in output order, across all outputs in order."""
    outs = outputs(e)
    got = []
    for o in outs:
        n = pages(o['path'], src_pw(e['inputs'][0]))
        got += [(o['path'], i + 1) for i in range(n)]
    if len(got) != len(mapping):
        report(tool, e, f'{len(got)} pages out, expected {len(mapping)}'); return
    for i, ((op, opg), (sp, spg, pw)) in enumerate(zip(got, mapping)):
        a = R(sp, spg, pw); b = R(op, opg, src_pw(e['inputs'][0]))
        m, f, k = best_rot(a, b) if rot_ok else (*diff(a, b), 0)
        if not ok(m, f): report(tool, e, f'out page {i + 1} differs from source page {spg} (mean {m:.1f}, frac {f:.3f}, rot {k})')

for tool in ['split', 'organise', 'extract-pages', 'insert-pages', 'merge']:
    for e in manifest(tool):
        name = e['inputs'][0]; src = os.path.join(PDF, name); pw = PW.get(name); n = pages(src, pw)
        outs = outputs(e)
        if not outs:
            o = e['outcomes'][0] if e['outcomes'] else {}
            if not (tool == 'split' and e['variant'] == 'bookmarks') and not (tool == 'split' and n <= 2 and e['variant'] == 'default'):
                report(tool, e, f"no output: {o.get('reason')}")
            continue
        if tool == 'split':
            if e['variant'] == 'default': mp = [(src, i + 1, pw) for i in range(n)]
            elif e['variant'] == 'single': mp = [(src, i + 1, pw) for i in range(n)]
            else: mp = None
            if mp: check_mapping(tool, e, mp)
            else:
                tot = sum(pages(o['path'], pw) for o in outs)
                if tot != n: report(tool, e, f'bookmark parts hold {tot} pages of {n}')
        elif tool == 'organise':
            check_mapping(tool, e, [(src, n - i, pw) for i in range(n)])
        elif tool == 'extract-pages':
            mp = [(src, 1, pw)] if e['variant'] == 'default' else [(src, i + 1, pw) for i in range(1, n)]
            check_mapping(tool, e, mp)
        elif tool == 'insert-pages':
            if e['variant'] == 'file-after-1':
                slip = os.path.join(PDF, e['inputs'][1])
                check_mapping(tool, e, [(src, 1, pw), (slip, 1, None)] + [(src, i + 1, pw) for i in range(1, n)])
        elif tool == 'merge':
            mp = []
            for nm in e['inputs']:
                p = os.path.join(PDF, nm); mp += [(p, i + 1, PW.get(nm)) for i in range(pages(p, PW.get(nm)))]
            check_mapping(tool, e, mp)

# Crop: trimmed by 5 mm, auto to the drawing, onto A4.
def bbox(a, thr=200):
    ys, xs = np.where(a < thr)
    if len(xs) == 0: return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

for e in manifest('crop'):
    name = e['inputs'][0]; src = os.path.join(PDF, name); pw = PW.get(name); n = pages(src, pw)
    outs = outputs(e)
    if not outs:
        report('crop', e, f"no output: {e['outcomes'][0].get('reason')}"); continue
    out = outs[0]['path']
    if pages(out, pw) != n: report('crop', e, f'{pages(out, pw)} pages of {n}'); continue
    for p in range(1, n + 1):
        a = R(src, p, pw); b = R(out, p, pw)
        if a is None or b is None: report('crop', e, f'page {p} not drawn'); continue
        if e['variant'] == 'default':
            mpx = 5 / 25.4 * DPI
            exp = (a.shape[0] - 2 * mpx, a.shape[1] - 2 * mpx)
            if abs(b.shape[0] - exp[0]) > 2.5 or abs(b.shape[1] - exp[1]) > 2.5:
                report('crop', e, f'page {p}: {b.shape} after a 5 mm trim of {a.shape}'); continue
            c = int(round(mpx))
            m, f = min((diff(a[c + dy:c + dy + b.shape[0], c + dx:c + dx + b.shape[1]], b) for dy in (-1, 0, 1) for dx in (-1, 0, 1)), key=lambda t: t[0])
            if not ok(m, f): report('crop', e, f'page {p}: trimmed page differs from the middle of the source ({m:.1f}, {f:.3f})')
        elif e['variant'] == 'auto':
            ba, bb = bbox(a), bbox(b)
            if ba is None: continue
            if bb is None: report('crop', e, f'page {p}: nothing left after auto crop'); continue
            wa, ha = ba[2] - ba[0], ba[3] - ba[1]; wb, hb = bb[2] - bb[0], bb[3] - bb[1]
            if abs(wa - wb) > 3 or abs(ha - hb) > 3: report('crop', e, f'page {p}: drawing {wa}x{ha} became {wb}x{hb} (something was cut off?)')
        else:
            # A4 at DPI, either way round
            A4 = (297 / 25.4 * DPI, 210 / 25.4 * DPI)
            if not (abs(b.shape[0] - A4[0]) < 3 and abs(b.shape[1] - A4[1]) < 3 or abs(b.shape[1] - A4[0]) < 3 and abs(b.shape[0] - A4[1]) < 3):
                report('crop', e, f'page {p}: {b.shape} is not A4')
            ba, bb = bbox(a), bbox(b)
            if ba is not None and bb is None: report('crop', e, f'page {p}: blank on A4')
            elif ba is not None:
                ra = (ba[2] - ba[0]) / max(1, ba[3] - ba[1]); rb = (bb[2] - bb[0]) / max(1, bb[3] - bb[1])
                if abs(ra - rb) / ra > 0.08: report('crop', e, f'page {p}: drawing aspect {ra:.2f} became {rb:.2f}')

print('\n'.join(problems) or 'all page checks passed')
print(len(problems), 'problems')
