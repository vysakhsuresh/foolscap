"""Marking tools: what changed on each page, compared with where the tool was asked to draw."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import numpy as np
from PIL import Image, ImageFilter

DPI = 40
def R(path, page, pw=None):
    a = render(path, page, DPI, pw)
    return a

def changed(a, b, thr=48):
    if a is None or b is None: return None
    if a.shape != b.shape:
        h, w = min(a.shape[0], b.shape[0]), min(a.shape[1], b.shape[1])
        if abs(a.shape[0] - b.shape[0]) > 2 or abs(a.shape[1] - b.shape[1]) > 2: return 'size'
        a, b = a[:h, :w], b[:h, :w]
    d = np.abs(a - b) > thr
    return d

def frac_box(d, box):
    """Fraction of changed pixels outside box (fractions x,y,w,h, page-relative, top-left origin)."""
    h, w = d.shape
    m = np.ones_like(d)
    for (x, y, bw, bh) in box:
        x0, y0 = max(0, int((x - 0.02) * w)), max(0, int((y - 0.02) * h)); x1, y1 = min(w, int((x + bw + 0.02) * w) + 1), min(h, int((y + bh + 0.02) * h) + 1)
        m[y0:y1, x0:x1] = False
    return float((d & m).sum()) / max(1, m.sum()), float(d.sum())

problems = []
def say(tool, e, msg): problems.append(f"{tool}/{e['variant']}/{e['inputs'][0]}: {msg}")

def params_marks(tool, variant):
    """The areas each default variant was asked to touch (from tests/fixtures/gauntlet-params.ts)."""
    if tool == 'sign': return {0: [(0.6, 0.8, 0.3, 0.1)]} if variant == 'default' else {'last': [(0.55, 0.02, 0.4, 0.03)]}
    if tool == 'add-text': return {0: [(0.1, 0.1, 0.5, 0.04)]} if variant == 'default' else {'last': [(0.55, 0.02, 0.4, 0.04)]}
    if tool == 'add-image': return {0: [(0.2, 0.2, 0.3, 0.2)]}
    if tool == 'mark-up': return {0: [(0.1, 0.1, 0.4, 0.04), (0.1, 0.2, 0.4, 0.04), (0.1, 0.5, 0.4, 0.1), (0.5, 0.5, 0.2, 0.1), (0.1, 0.85, 0.5, 0.06), (0.2, 0.7, 0.2, 0.05), (0.8, 0.1, 0.04, 0.03), (0.6, 0.3, 0.3, 0.08), (0.1, 0.3, 0.3, 0.04), (0.1, 0.4, 0.5, 0.05), (0.6, 0.8, 0.3, 0.1)]}
    if tool == 'remove-areas' and variant == 'default': return {0: [(0.05, 0.05, 0.5, 0.1)]}
    return None

for tool in ['sign', 'add-text', 'add-image', 'mark-up', 'remove-areas', 'watermark', 'page-numbers', 'header-footer', 'background', 'edit-text', 'fill-form', 'create-form', 'edit-images', 'page-labels', 'bookmarks', 'digital-sign', 'document-details', 'attachments', 'pdf-a', 'add-password', 'remove-password']:
    for e in manifest(tool):
        if tool == 'attachments' and e['variant'] == 'extract': continue
        name = e['inputs'][0]; src = os.path.join(PDF, name); pw = PW.get(name)
        outs = [o for o in e['outcomes'] if o['kind'] == 'produced' and o['path'].endswith('.pdf')]
        if not outs:
            r = (e['outcomes'] or [{}])[0]
            if tool not in ('fill-form', 'edit-images', 'remove-password', 'attachments') or 'couldn' in r.get('reason', ''):
                say(tool, e, f"no output: {r.get('kind')} {r.get('reason')}")
            continue
        out = outs[0]['path']
        opw = pw
        if tool == 'add-password' and e['variant'] == 'default': opw = 'tea'
        if tool == 'add-password' and e['variant'] == 'restrict': opw = None
        if tool in ('remove-password', 'pdf-a'): opw = None
        n = pages(src, pw); m = pages(out, opw)
        if m != n:
            say(tool, e, f'{m} pages from {n}'); continue
        expect = params_marks(tool, e['variant'])
        for p in range(1, n + 1):
            a = R(src, p, pw); b = R(out, p, opw)
            if b is None: say(tool, e, f'page {p} does not draw'); continue
            d = changed(a, b)
            if isinstance(d, str): say(tool, e, f'page {p} changed size {a.shape}->{b.shape}'); continue
            if tool in ('page-labels', 'bookmarks', 'digital-sign', 'document-details', 'attachments', 'pdf-a', 'add-password', 'remove-password', 'create-form'):
                # Nothing on the page should change (create-form adds fields; a reader draws their borders)
                if tool == 'digital-sign' and p == n: continue
                lim = 0.01 if tool == 'create-form' else 0.0005
                if d.mean() > lim: say(tool, e, f'page {p}: {d.mean():.4f} of the page changed')
                continue
            if expect is not None:
                key = p - 1
                boxes = expect.get(key) or (expect.get('last') if p == n else None) or []
                outside, total = frac_box(d, boxes)
                if outside > 0.002: say(tool, e, f'page {p}: {outside:.4f} changed outside the marked areas')
                if boxes and total == 0 and tool != 'remove-areas': say(tool, e, f'page {p}: nothing visible changed')
            elif tool in ('page-numbers', 'header-footer'):
                h = d.shape[0]
                band = np.ones_like(d); band[int(0.1 * h):int(0.9 * h), :] = False
                inner = (d & ~band).mean()
                if inner > 0.001: say(tool, e, f'page {p}: {inner:.4f} changed in the middle of the page')
                if (d & band).sum() == 0: say(tool, e, f'page {p}: nothing added at the top or bottom')
            elif tool == 'watermark':
                if (np.abs(a - b) > 6).sum() == 0: say(tool, e, f'page {p}: no watermark to be seen')
            elif tool == 'background':
                pass
        # Text checks
        if tool in ('watermark', 'page-numbers', 'header-footer', 'sign', 'add-text', 'add-image', 'mark-up', 'background', 'page-labels', 'bookmarks', 'document-details', 'digital-sign', 'create-form'):
            ref = pdftotext(src, pw); got = pdftotext(out, opw)
            r, pr, miss, extra = recall_precision(ref, got)
            if words(ref) and r < 0.99: say(tool, e, f'text recall {r:.3f}: lost {list(miss.most_common(6))}')
        if tool == 'page-numbers' and e['variant'] == 'default':
            for p in range(1, n + 1):
                t = pdftotext(out, opw, first=p, last=p)
                if f'Page {p} of {n}' not in t: say(tool, e, f'page {p}: "Page {p} of {n}" not in its text'); break
        if tool == 'page-numbers' and e['variant'] == 'bates':
            for p in range(1, n + 1):
                t = pdftotext(out, opw, first=p, last=p)
                if f'KL-{p:06d}' not in t: say(tool, e, f'page {p}: Bates number not in its text'); break
        if tool == 'header-footer':
            for p in range(1, n + 1):
                t = pdftotext(out, opw, first=p, last=p)
                if 'CONFIDENTIAL' not in t or f'page {p} of {n}' not in t: say(tool, e, f'page {p}: header or footer text missing'); break
        if tool == 'edit-text':
            t = pdftotext(out, opw, first=1, last=1)
            if 'EDITED 4242' not in t and '4,242.00' not in t: say(tool, e, 'the new words are not in the text')

print('\n'.join(problems) or 'no problems')
print(len(problems), 'problems')
