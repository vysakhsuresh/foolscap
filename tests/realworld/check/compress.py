import os, sys; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import *
import numpy as np
for e in manifest('compress'):
    name=e['inputs'][0]; src=os.path.join(PDF,name); pw=PW.get(name)
    o=e['outcomes'][0]
    if o['kind']!='produced':
        if e['variant']!='target-100': print(f"{e['variant']:10s} {name:34s} {o['kind']}: {o.get('reason','')[:100]}")
        continue
    a=os.path.getsize(src); b=os.path.getsize(o['path'])
    n=pages(src,pw); worst=0
    for p in range(1,min(n,3)+1):
        x=render(src,p,30,pw); y=render(o['path'],p,30,pw)
        if x is None or y is None or x.shape!=y.shape: worst=999; break
        worst=max(worst,float(np.abs(x-y).mean()))
    t1=pdftotext(src,pw); t2=pdftotext(o['path'],pw)
    r,_,_,_=recall_precision(t1,t2) if words(t1) else (1,1,0,0)
    flag='<<<' if b>=a or worst>6 or r<0.99 else ''
    print(f"{e['variant']:10s} {name:34s} {a//1000:6d}K -> {b//1000:6d}K  diff {worst:5.1f} text {r:.2f} {e['ms']}ms {flag} | {o['detail'][:110]}")
