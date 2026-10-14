import json, os
from collections import Counter
c=Counter(); slow=[]; err=[]
for l in open(os.path.join(os.environ.get('REALWORLD_DIR', '.'), 'out', 'manifest.jsonl')):
    e=json.loads(l); c[e['tool']]+=1
    if e['ms']>15000: slow.append((e['tool'],e['variant'],e['inputs'][0],e['ms']))
    if e.get('error'): err.append((e['tool'],e['variant'],e['inputs'][0],e['error'][:300]))
print(dict(c)); print('SLOW',slow); print('ERR',err)
