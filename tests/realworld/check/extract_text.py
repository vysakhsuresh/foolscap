import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
for e in manifest('extract-text'):
    name = e['inputs'][0]; src = os.path.join(PDF, name)
    ref = pdftotext(src, PW.get(name))
    o = e['outcomes'][0]
    if o['kind'] != 'produced':
        print(f"{name:40s} {o['kind']}: {o.get('reason')}"); continue
    got = open(o['path'], encoding='utf-8').read()
    r, p, miss, extra = recall_precision(ref, got)
    flag = '' if r > 0.97 and p > 0.97 else '  <<<'
    print(f"{name:40s} rec {r:.3f} prec {p:.3f} {e['ms']}ms{flag}")
    if flag: print('   missing', list(miss.items())[:12]); print('   extra', list(extra.items())[:12])
