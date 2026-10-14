import collections, json, os, re, subprocess, tempfile, unicodedata
RW = os.environ.get('REALWORLD_DIR', '.')
OUT = os.path.join(RW, 'out')
PDF = os.path.join(RW, 'pdf')
PW = {'lo-report-locked.pdf': 'x'}
LO = ['soffice', '-env:UserInstallation=file://' + os.path.abspath(os.path.join(os.environ.get('REALWORLD_DIR', '.'), 'lo-profile')), '--headless']

def manifest(tool=None):
    out = []
    with open(os.path.join(OUT, 'manifest.jsonl')) as f:
        for line in f:
            e = json.loads(line)
            if tool is None or e['tool'] == tool:
                out.append(e)
    return out

def pdftotext(path, pw=None, layout=False, first=None, last=None):
    args = ['pdftotext', '-enc', 'UTF-8'] + (['-layout'] if layout else ['-raw']) + (['-upw', pw] if pw else [])
    if first: args += ['-f', str(first)]
    if last: args += ['-l', str(last)]
    r = subprocess.run(args + [path, '-'], capture_output=True)
    return r.stdout.decode('utf-8', 'replace')

def pages(path, pw=None):
    r = subprocess.run(['pdfinfo'] + (['-upw', pw] if pw else []) + [path], capture_output=True, text=True)
    m = re.search(r'Pages:\s+(\d+)', r.stdout)
    return int(m.group(1)) if m else -1

WORD = re.compile(r'[\wഀ-ൿऀ-ॿ]+', re.U)
def words(text):
    text = unicodedata.normalize('NFC', text)
    return [w.lower() for w in WORD.findall(text)]

def recall_precision(ref, got):
    a = collections.Counter(words(ref)); b = collections.Counter(words(got))
    inter = sum((a & b).values())
    rec = inter / max(1, sum(a.values())); prec = inter / max(1, sum(b.values()))
    return rec, prec, a - b, b - a

def to_pdf(path):
    """An office file (docx/xlsx/pptx/epub/html) through LibreOffice to PDF; returns the PDF path."""
    outdir = tempfile.mkdtemp(dir=os.path.join(RW, 'tmp'))
    subprocess.run(LO + ['--convert-to', 'pdf', path, '--outdir', outdir], capture_output=True, timeout=300)
    pdfs = [f for f in os.listdir(outdir) if f.endswith('.pdf')]
    return os.path.join(outdir, pdfs[0]) if pdfs else None

def render(path, page, dpi=50, pw=None, gray=True):
    import numpy as np
    from PIL import Image
    d = tempfile.mkdtemp(dir=os.path.join(RW, 'tmp'))
    subprocess.run(['pdftoppm', '-cropbox', '-r', str(dpi), '-f', str(page), '-l', str(page), '-png', '-singlefile'] + (['-upw', pw] if pw else []) + (['-gray'] if gray else []) + [path, os.path.join(d, 'p')], capture_output=True)
    p = os.path.join(d, 'p.png')
    if not os.path.exists(p): return None
    im = Image.open(p)
    return np.asarray(im.convert('L' if gray else 'RGB'), dtype=np.int16)
