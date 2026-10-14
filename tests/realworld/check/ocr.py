import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
SRC={'im-certificate-300dpi.pdf':'chrome-certificate.pdf','im-form16-g4.pdf':'chrome-form16.pdf','im-lab-grey-zip.pdf':'chrome-lab-report.pdf','im-malayalam-letter-scan.pdf':'chrome-malayalam-letter.pdf','im-phone-invoice-oriented.pdf':'chrome-invoice-gst.pdf','im-phone-photos.pdf':'chrome-rent-agreement.pdf','im-salary-cmyk.pdf':'chrome-salary-slip.pdf','im-salary-jp2.pdf':'chrome-salary-slip.pdf','scan-admit-card-image.pdf':'chrome-admit-card.pdf','scan-statement-image.pdf':'chrome-bank-statement.pdf'}
for e in manifest(sys.argv[1] if len(sys.argv)>1 else 'ocr'):
    name=e['inputs'][0]
    if len(sys.argv)>2 and e['variant']!=sys.argv[2]: continue
    o=e['outcomes'][0]
    if name not in SRC:
        if o['kind']=='produced' and name.startswith(('chrome','lo-','rl-')): print('OCRd a text file?', name, o['detail'])
        continue
    if o['kind']!='produced': print(f"{name:32s} {o['kind']} {o.get('reason')}"); continue
    ref=pdftotext(os.path.join(PDF,SRC[name]))
    if name=='im-phone-photos.pdf': ref=pdftotext(os.path.join(PDF,SRC[name]),first=1,last=2)
    p=o['path']
    if p.endswith('.pdf'): got=pdftotext(p)
    elif p.endswith('.docx') or p.endswith('.xlsx'):
        b=os.path.join(RW,'back',e['tool'],e['variant'],os.path.splitext(os.path.basename(p))[0]+'.pdf'); got=pdftotext(b) if os.path.exists(b) else ''
    else: got=open(p,encoding='utf-8',errors='replace').read()
    r,pr,miss,extra=recall_precision(ref,got)
    print(f"{name:32s} rec {r:.2f} prec {pr:.2f} {e['ms']}ms | {o['detail'][:90]}")
