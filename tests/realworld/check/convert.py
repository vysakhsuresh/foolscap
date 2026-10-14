"""Converters: outputs back through LibreOffice to PDF, text compared with the source's, and contact sheets to look at."""
import os, sys, zipfile, html, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *

BACK = os.path.join(RW, 'back')
TOOLS = sys.argv[1:] or ['pdf-to-word', 'pdf-to-excel', 'pdf-to-powerpoint', 'pdf-to-epub']

def back_pdf(path, tool, variant):
    """The LibreOffice PDF of an office output, made in batches per tool/variant."""
    d = os.path.join(BACK, tool, variant)
    stem = os.path.splitext(os.path.basename(path))[0]
    return os.path.join(d, stem + '.pdf')

def batch_convert(tool, variant, paths):
    d = os.path.join(BACK, tool, variant); os.makedirs(d, exist_ok=True)
    todo = [p for p in paths if not os.path.exists(back_pdf(p, tool, variant))]
    for i in range(0, len(todo), 20):
        subprocess.run(LO + ['--convert-to', 'pdf', '--outdir', d] + todo[i:i + 20], capture_output=True, timeout=1200)

def epub_text(path):
    z = zipfile.ZipFile(path); out = []
    names = [n for n in z.namelist() if n.endswith(('.xhtml', '.html', '.htm'))]
    for n in sorted(names):
        if 'nav' in n.lower(): continue
        t = z.read(n).decode('utf-8', 'replace')
        out.append(t)
    return strip_html('\n'.join(out))

def strip_html(t):
    t = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', t, flags=re.S)
    t = re.sub(r'<[^>]+>', ' ', t)
    return html.unescape(t)

rows = []
for tool in TOOLS:
    ents = manifest(tool)
    byvar = {}
    for e in ents:
        for o in e['outcomes']:
            if o['kind'] == 'produced' and o['path'].endswith(('.docx', '.xlsx', '.pptx')):
                byvar.setdefault(e['variant'], []).append(o['path'])
    for v, ps in byvar.items(): batch_convert(tool, v, ps)
    for e in ents:
        name = e['inputs'][0]; src = os.path.join(PDF, name)
        ref = pdftotext(src, PW.get(name))
        outs = [o for o in e['outcomes'] if o['kind'] == 'produced']
        if not outs:
            rows.append((tool, e['variant'], name, None, None, None, e['ms'], (e['outcomes'] or [{}])[0].get('reason', e.get('error', ''))[:120])); continue
        o = outs[0]; p = o['path']
        pg = None
        if p.endswith('.epub'): got = epub_text(p)
        elif p.endswith('.html'): got = strip_html(open(p, encoding='utf-8').read())
        else:
            bp = back_pdf(p, tool, e['variant'])
            if not os.path.exists(bp): rows.append((tool, e['variant'], name, None, None, None, e['ms'], 'LibreOffice could not open the output')); continue
            got = pdftotext(bp); pg = pages(bp)
        r, pr, miss, extra = recall_precision(ref, got)
        note = ''
        if r < 0.95 or pr < 0.9:
            note = 'miss ' + ' '.join(f'{k}×{v}' for k, v in list(miss.most_common(8))) + ' | extra ' + ' '.join(f'{k}×{v}' for k, v in list(extra.most_common(8)))
        rows.append((tool, e['variant'], name, r, pr, (pg, pages(src, PW.get(name))), e['ms'], note))

for t in rows:
    tool, v, name, r, pr, pg, ms, note = t
    if r is None:
        print(f'{tool:18s} {v:11s} {name:36s} NO OUTPUT {note}')
        continue
    flag = '<<<' if (r < 0.95 or pr < 0.9) else ''
    print(f'{tool:18s} {v:11s} {name:36s} rec {r:.2f} prec {pr:.2f} pages {pg} {ms}ms {flag} {note[:260]}')
