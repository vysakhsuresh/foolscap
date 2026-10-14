# Scans and phone photos of the printed documents, and scanner-style PDFs (image pages, with and without a hidden OCR layer).
import io, os, random, subprocess, sys, xml.etree.ElementTree as ET
from PIL import Image, ImageDraw, ImageFilter, ImageOps
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

RW = sys.argv[1]
PDF = os.path.join(RW, 'pdf'); IMG = os.path.join(RW, 'img'); TMP = os.path.join(RW, 'tmp')
for d in (IMG, TMP): os.makedirs(d, exist_ok=True)
rng = random.Random(3)

def render(pdf, dpi, gray=False, first=1, last=None):
    base = os.path.join(TMP, os.path.basename(pdf)[:-4] + f'-{dpi}')
    args = ['pdftoppm', '-r', str(dpi), '-png', '-f', str(first)] + (['-l', str(last)] if last else []) + (['-gray'] if gray else []) + [pdf, base]
    subprocess.run(args, check=True)
    out = sorted(f for f in os.listdir(TMP) if f.startswith(os.path.basename(base) + '-') and f.endswith('.png'))
    return [os.path.join(TMP, f) for f in out]

def scanned(im, angle=0.6, noise=10, yellow=False):
    im = im.convert('RGB')
    if yellow:
        tint = Image.new('RGB', im.size, (250, 244, 225)); im = Image.blend(im, tint, 0.15)
    im = im.rotate(angle, resample=Image.BICUBIC, expand=False, fillcolor=(245, 245, 242))
    px = im.load(); w, h = im.size
    for _ in range(w * h // 40):
        x, y = rng.randrange(w), rng.randrange(h); v = rng.randint(-noise, noise)
        r, g, b = px[x, y]; px[x, y] = (max(0, min(255, r + v)), max(0, min(255, g + v)), max(0, min(255, b + v)))
    # a dark scanner-lid edge at the bottom
    ImageDraw.Draw(im).rectangle([0, h - 6, w, h], fill=(70, 70, 70))
    return im.filter(ImageFilter.GaussianBlur(0.4))

def words(pdf, page):
    """pdftotext -bbox words of a page, in points: what an OCR engine would have found."""
    out = subprocess.run(['pdftotext', '-bbox', '-f', str(page), '-l', str(page), pdf, '-'], capture_output=True, text=True).stdout
    out = out.replace('<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">', '')
    root = ET.fromstring(out)
    ns = '{http://www.w3.org/1999/xhtml}'
    pg = root.find(f'.//{ns}page')
    return float(pg.get('width')), float(pg.get('height')), [(float(w.get('xMin')), float(w.get('yMin')), float(w.get('xMax')), float(w.get('yMax')), w.text or '') for w in pg.iter(f'{ns}word')]

def garble(t):
    # What OCR does to small print: a few letters swapped, barcodes read as I1l.
    if rng.random() < 0.08: return ''.join(rng.choice('Il1|') for _ in t)
    return t.replace('rn', 'm') if rng.random() < 0.2 else t

def scanner_pdf(out, src_pdf, pages, mode, dpi=150, strips=1, jpeg_q=70, gray=False):
    """mode: 'image' (no text), 'invisible' (render mode 3 over the image), 'under' (text drawn first, image painted over it)."""
    c = canvas.Canvas(out, pageCompression=1)
    c.setProducer('PaperPort-style scanner (fictional) 14.5'); c.setCreator('Scan to PDF')
    for p in pages:
        W, H, ws = words(src_pdf, p)
        png = render(src_pdf, dpi, gray=gray, first=p, last=p)[0]
        im = scanned(Image.open(png), angle=rng.uniform(-0.8, 0.8), yellow=not gray)
        if gray: im = im.convert('L')
        c.setPageSize((W, H))
        def text():
            t = c.beginText(); t.setTextRenderMode(3 if mode == 'invisible' else 0)
            for x0, y0, x1, y1, s in ws:
                s = garble(s); size = max(4, (y1 - y0) * 0.9)
                t.setFont('Helvetica', size); t.setTextOrigin(x0, H - y1 + (y1 - y0) * 0.2)
                width = c.stringWidth(s, 'Helvetica', size) or 1
                t.setHorizScale(100 * (x1 - x0) / width); t.textOut(s)
            c.drawText(t)
        if mode == 'under': text()
        h = im.size[1]; step = -(-h // strips)
        for k in range(strips):
            part = im.crop((0, k * step, im.size[0], min(h, (k + 1) * step)))
            buf = io.BytesIO(); part.save(buf, 'JPEG', quality=jpeg_q); buf.seek(0)
            ph = H * part.size[1] / h
            c.drawImage(ImageReader(buf), 0, H - (k * step) * H / h - ph, W, ph)
        if mode == 'invisible': text()
        c.showPage()
    c.save()

P = lambda n: os.path.join(PDF, n)
scanner_pdf(P('scan-salary-slip-ocr.pdf'), P('chrome-salary-slip.pdf'), [1], 'invisible')
scanner_pdf(P('scan-rent-agreement-ocr.pdf'), P('chrome-rent-agreement.pdf'), [1, 2, 3], 'invisible', dpi=120)
scanner_pdf(P('scan-invoice-under.pdf'), P('chrome-invoice-gst.pdf'), [1], 'under')
scanner_pdf(P('scan-form16-strips.pdf'), P('chrome-form16.pdf'), [1, 2], 'invisible', strips=8, gray=True)
scanner_pdf(P('scan-admit-card-image.pdf'), P('chrome-admit-card.pdf'), [1], 'image', dpi=200)
scanner_pdf(P('scan-statement-image.pdf'), P('chrome-bank-statement.pdf'), [1, 2], 'image', dpi=100, gray=True)
scanner_pdf(P('scan-idcard-ocr.pdf'), P('chrome-id-card.pdf'), [1, 2], 'invisible', dpi=300)

# ImageMagick scans: 1-bit CCITT G4, CMYK JPEG, JPEG 2000, a big 300 dpi colour, 8-bit grey with Zip.
def im(args): subprocess.run(['convert'] + args, check=True)
f16 = render(P('chrome-form16.pdf'), 200, gray=True)
im(f16 + ['-threshold', '60%', '-monochrome', '-compress', 'Group4', '-density', '200', P('im-form16-g4.pdf')])
sal = render(P('chrome-salary-slip.pdf'), 150)[0]
im([sal, '-colorspace', 'CMYK', '-compress', 'JPEG', '-quality', '75', '-density', '150', P('im-salary-cmyk.pdf')])
im([sal, '-compress', 'JPEG2000', '-quality', '40', '-density', '150', P('im-salary-jp2.pdf')])
big = render(P('chrome-certificate.pdf'), 300)[0]
im([big, '-compress', 'JPEG', '-quality', '92', '-density', '300', P('im-certificate-300dpi.pdf')])
lab = render(P('chrome-lab-report.pdf'), 150, gray=True)[0]
im([lab, '-compress', 'Zip', '-density', '150', P('im-lab-grey-zip.pdf')])
mal = render(P('chrome-malayalam-letter.pdf'), 110)
im(mal + ['-compress', 'JPEG', '-quality', '60', '-density', '110', P('im-malayalam-letter-scan.pdf')])

# Phone photos: the page on a wooden table, in perspective, with shadow; saved as a phone saves them.
def phone_photo(src_png, out, exif_rot=None, size=(3000, 4000), angle=4):
    page = Image.open(src_png).convert('RGB')
    W, H = size
    bg = Image.new('RGB', (W, H), (122, 84, 52)); d = ImageDraw.Draw(bg)
    for y in range(0, H, 9): d.line([(0, y), (W, y + rng.randint(-20, 20))], fill=(110 + rng.randint(0, 30), 75 + rng.randint(0, 20), 45), width=3)
    pw = int(W * 0.78); ph = int(pw * page.size[1] / page.size[0])
    if ph > H * 0.85: ph = int(H * 0.85); pw = int(ph * page.size[0] / page.size[1])
    page = page.resize((pw, ph))
    shade = Image.new('L', (pw, ph), 0); sd = ImageDraw.Draw(shade)
    for x in range(pw): sd.line([(x, 0), (x, ph)], fill=int(40 * x / pw))
    page = Image.composite(Image.new('RGB', (pw, ph), (60, 60, 60)), page, shade)
    page = page.rotate(angle, expand=True, fillcolor=(0, 0, 0)); mask = page.convert('L').point(lambda v: 255 if v > 3 else 0)
    x0, y0 = (W - page.size[0]) // 2, (H - page.size[1]) // 2
    bg.paste(page, (x0, y0), mask)
    # mild perspective: shrink the top edge
    coeffs = (1, 0.04, -W * 0.02, 0, 1, 0, 0, 0.00002)
    bg = bg.transform((W, H), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(100, 70, 40))
    exif = Image.Exif(); exif[0x0110] = 'Pixel 7a (fictional test)'; exif[0x010F] = 'Phone'
    if exif_rot:
        exif[0x0112] = exif_rot
        bg = bg.rotate({6: 90, 8: -90, 3: 180}[exif_rot], expand=True)  # stored sideways, EXIF says how to stand it up
    bg.save(out, 'JPEG', quality=85, exif=exif.tobytes())

shots = os.path.join(RW, 'gen', 'shots')
phone_photo(render(P('chrome-salary-slip.pdf'), 150)[0], os.path.join(IMG, 'photo-salary-slip.jpg'))
phone_photo(render(P('chrome-invoice-gst.pdf'), 150)[0], os.path.join(IMG, 'photo-invoice-exif6.jpg'), exif_rot=6)
phone_photo(render(P('chrome-rent-agreement.pdf'), 120, first=1, last=1)[0], os.path.join(IMG, 'photo-agreement-p1.jpg'), angle=-3)
phone_photo(render(P('chrome-rent-agreement.pdf'), 120, first=2, last=2)[0], os.path.join(IMG, 'photo-agreement-p2.jpg'), exif_rot=8, angle=2)
phone_photo(render(P('chrome-id-card.pdf'), 300, first=1, last=1)[0], os.path.join(IMG, 'photo-idcard.jpg'), size=(4000, 3000), angle=7)
phone_photo(render(P('chrome-eticket-train.pdf'), 150)[0], os.path.join(IMG, 'photo-ticket-small.jpg'), size=(1200, 1600))
# A WhatsApp-forwarded photo: small, heavily compressed, no EXIF. A PNG screenshot. A HEIC is not something a browser decodes, so not here.
Image.open(os.path.join(IMG, 'photo-salary-slip.jpg')).resize((900, 1200)).save(os.path.join(IMG, 'wa-salary-slip.jpg'), quality=45)
Image.open(os.path.join(shots, 'eticket-train.png')).save(os.path.join(IMG, 'screenshot-ticket.png'))
Image.open(os.path.join(IMG, 'photo-salary-slip.jpg')).convert('L').save(os.path.join(IMG, 'grey-salary-slip.jpg'), quality=80)
Image.open(os.path.join(shots, 'invoice-gst.png')).convert('RGBA').save(os.path.join(IMG, 'invoice-rgba.png'))
Image.open(os.path.join(shots, 'resume.png')).convert('CMYK').save(os.path.join(IMG, 'resume-cmyk.jpg'), quality=85)
Image.open(os.path.join(shots, 'lab-report.png')).convert('P', palette=Image.ADAPTIVE, colors=64).save(os.path.join(IMG, 'lab-palette.png'))
# Phone photos to PDF the way ImageMagick does it (EXIF orientation not applied: the sideways page stays sideways in the file).
im([os.path.join(IMG, 'photo-agreement-p1.jpg'), os.path.join(IMG, 'photo-agreement-p2.jpg'), P('im-phone-photos.pdf')])
im([os.path.join(IMG, 'photo-invoice-exif6.jpg'), '-auto-orient', P('im-phone-invoice-oriented.pdf')])
print('ok')
