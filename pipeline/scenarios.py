"""Build plain-English storylines from real alerts + scored children. No invented data."""
import json, os, collections, datetime as dt
D=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),'data')
L=lambda n:json.load(open(os.path.join(D,n)))
al=L('alerts.json')['alerts']; cj=L('clusters.json'); meta=L('meta.json')
cl={c['id']:c for c in cj['clusters']}
P=lambda t:dt.datetime.fromisoformat(t.replace('Z','+00:00'))
def name(c):
    l=c['label']
    if 'Bybit' in l: return 'Bybit hack funds (FBI-published wallets)'
    if 'Harmony' in l: return 'Harmony bridge hack funds (FBI-published wallets)'
    if c['kind']=='sanctioned': return f'OFAC-sanctioned wallets: {l}'
    return l
by=collections.defaultdict(list)
for a in al:
    if a.get('type','lazarus') in ('lazarus','hack'): by[a['cluster']].append(a)
out=[]
for cid,A in by.items():
    A.sort(key=lambda a:a['time'],reverse=True); last=P(A[0]['time'])
    W=[a for a in A if (last-P(a['time'])).days<=7]  # the latest 7-day burst
    first=P(W[-1]['time']); c=cl.get(cid) or {'label':cid,'kind':'incident','sources':A[0].get('sources',[])}
    kids=[k for k in cj['candidates'] if k.get('cluster')==cid and any(first<=P(v['time'])<=last+dt.timedelta(seconds=1) for v in k['via'])]
    unit='BTC' if W[0]['chain']=='BTC' else 'ETH'
    moved=sum(v['value'] for k in kids for v in k['via'] if first<=P(v['time'])<=last+dt.timedelta(seconds=1))
    flags=collections.Counter(r.split(' (')[0] for k in kids for r in k['reasons'])
    mixer=[r for k in kids for r in k['reasons'] if r.startswith('mixer')]; bridge=[r for k in kids for r in k['reasons'] if r.startswith('bridge')]
    d=lambda x:x.strftime('%b %-d, %Y')
    span=d(first) if first.date()==last.date() else f'{d(first)} – {d(last)}'
    what=f"{len(W)} logged movement{'s'*(len(W)!=1)} {'on' if first.date()==last.date() else 'between'} {span}. Latest: {A[0]['message']}"
    if kids: what+=f" About {moved:.4g} {unit} went out to {len(kids)} new address{'es'*(len(kids)!=1)} one hop away."
    if mixer: what+=f" Some went into a mixer ({mixer[0].split('(')[-1].rstrip(')')})."
    if bridge: what+=f" Some used a bridge/cross-chain service ({bridge[0].split('(')[-1].rstrip(')')})."
    why=[]
    if mixer: why.append('Mixers hide where money goes next, which is a documented Lazarus laundering step.')
    if bridge: why.append('Bridges move funds to another chain, a common Lazarus hop.')
    if flags.get('2-output peel-chain shape'): why.append('Peel-chain pattern: small amounts split off step by step.')
    if any(k.startswith('rapid fan-out') or k.startswith('part of') for k in flags): why.append('Fast fan-out: funds split across many wallets quickly.')
    if not why: why.append('These wallets are on official public lists, so any movement is worth watching. Nothing here matched a laundering pattern.')
    top=max([a['level'] for a in W]+[0])
    out.append({'id':f'{cid}-{last:%Y%m%d}','cluster':cid,'title':name(c),'start':first.isoformat().replace('+00:00','Z'),'end':A[0]['time'],'chain':unit,'events':len(W),
      'what':what,'why':' '.join(why),'confidence':top,'confidence_label':'high' if top>=70 else 'medium' if top>=45 else 'low',
      'type':A[0].get('type','lazarus'),'tx_links':[a['tx_url'] for a in W[:5]],'sources':c['sources']})
out.sort(key=lambda s:s['end'],reverse=True)
json.dump({'generated':meta['generated'],'scenarios':out[:20]},open(os.path.join(D,'scenarios.json'),'w'),indent=1)
print(len(out))
