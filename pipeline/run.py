#!/usr/bin/env python3
"""HACKWATCH pipeline: ingest public sources -> cluster -> score -> alerts/feeds. Public data only. Heuristic, not attribution."""
import csv, io, json, os, re, time, html, datetime as dt, urllib.request, collections
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); D=os.path.join(ROOT,'data')
UA={'User-Agent':'Mozilla/5.0 (hackwatch-osint)'}
SITE=os.environ.get('SITE_URL','https://hackwatch.info/')
def get(url,timeout=40,tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=timeout) as r: return r.read()
        except Exception as e:
            err=e; time.sleep(2*(i+1))
    raise err
def gj(u): return json.loads(get(u))
def now(): return dt.datetime.now(dt.timezone.utc)
def iso(t): return dt.datetime.fromtimestamp(t,dt.timezone.utc).isoformat().replace('+00:00','Z')
sources=[]; tracked={}
def track(chain,addr,label,src,url,kind):
    k=addr.lower() if chain=='ETH' else addr
    if k in tracked: tracked[k]['sources'].append({'name':src,'url':url}); return
    tracked[k]={'address':addr,'chain':chain,'label':label,'kind':kind,'sources':[{'name':src,'url':url}]}
# --- 1. OFAC SDN
SDN='https://www.treasury.gov/ofac/downloads/sdn.csv'
try:
    raw=get(SDN,120).decode('latin-1'); n=0
    for r in csv.reader(io.StringIO(raw)):
        if len(r)<12 or 'DPRK' not in r[3]: continue
        for cur,a in re.findall(r'Digital Currency Address - (\w+) (\w+)',' '.join(r)):
            ch={'XBT':'BTC','ETH':'ETH'}.get(cur,cur)
            track(ch,a,r[1].strip(),f'OFAC SDN #{r[0]} ({r[3].strip()})',f'https://sanctionssearch.ofac.treas.gov/Details.aspx?id={r[0]}','sanctioned'); n+=1
    sources.append({'name':'OFAC SDN list (DPRK programs)','url':SDN,'ok':True,'count':n})
except Exception as e: sources.append({'name':'OFAC SDN list','url':SDN,'ok':False,'error':str(e)[:120]})
# --- 2. FBI IC3 PSA Bybit
PSA='https://www.ic3.gov/PSA/2025/PSA250226'
try:
    h=get(PSA).decode('utf8','ignore'); a=sorted(set(re.findall(r'0x[0-9a-fA-F]{40}(?![0-9a-fA-F])',h)))
    for x in a: track('ETH',x,'Bybit hack (TraderTraitor) — FBI-published address','FBI IC3 PSA250226 (Bybit, Feb 2025)',PSA,'fbi')
    sources.append({'name':'FBI IC3 PSA250226 — Bybit attribution','url':PSA,'ok':True,'count':len(a)})
except Exception as e: sources.append({'name':'FBI IC3 PSA250226','url':PSA,'ok':False,'error':str(e)[:120]})
for nm,u in [('FBI Harmony Horizon attribution (Jan 2023)','https://www.fbi.gov/news/press-releases/fbi-confirms-lazarus-group-cyber-actors-responsible-for-harmonys-horizon-bridge-currency-theft'),('FBI Atomic Wallet / 2023 heists PSA','https://www.ic3.gov/PSA/2023/PSA230822')]:
    try:
        h=get(u,30,1).decode('utf8','ignore'); a=sorted(set(re.findall(r'0x[0-9a-fA-F]{40}(?![0-9a-fA-F])',h)))
        for x in a: track('ETH',x,nm,nm,u,'fbi')
        sources.append({'name':nm,'url':u,'ok':True,'count':len(a)})
    except Exception as e: sources.append({'name':nm,'url':u,'ok':False,'error':str(e)[:120]})
# --- 3. chain activity
MIX=re.compile(r'tornado|sinbad|blender|wasabi|samourai|railgun',re.I)
BRIDGE=re.compile(r'thorchain|bridge|avalanche|wormhole|multichain|synapse|stargate|across|hop|eXch|fixedfloat|changenow',re.I)
SWAP=re.compile(r'uniswap|1inch|0x|router|swap|curve|cow|paraswap|okx',re.I)
txs=[]; chainok=collections.Counter(); chainfail=collections.Counter()
for k,t in tracked.items():
    try:
        if t['chain']=='BTC':
            info=gj(f"https://blockstream.info/api/address/{t['address']}"); cs=info['chain_stats']
            t['balance']=(cs['funded_txo_sum']-cs['spent_txo_sum'])/1e8; t['tx_count']=cs['tx_count']
            for x in gj(f"https://blockstream.info/api/address/{t['address']}/txs")[:25]:
                ins=[v['prevout']['scriptpubkey_address'] for v in x['vin'] if v.get('prevout') and v['prevout'].get('scriptpubkey_address')]
                outs=[(v.get('scriptpubkey_address'),v['value']/1e8) for v in x['vout'] if v.get('scriptpubkey_address')]
                txs.append({'chain':'BTC','hash':x['txid'],'time':x['status'].get('block_time') or int(time.time()),'ins':ins,'outs':outs,'src':k,
                    'url':f"https://mempool.space/tx/{x['txid']}"})
        elif t['chain']=='ETH':
            a=gj(f"https://eth.blockscout.com/api/v2/addresses/{t['address']}")
            t['balance']=int(a.get('coin_balance') or 0)/1e18; t['tags']=[x.get('display_name') for x in (a.get('metadata') or {}).get('tags',[]) if x.get('display_name')][:4]
            for x in gj(f"https://eth.blockscout.com/api/v2/addresses/{t['address']}/transactions").get('items',[])[:25]:
                to=x.get('to') or {}; fr=x.get('from') or {}
                ts=int(dt.datetime.fromisoformat(x['timestamp'].replace('Z','+00:00')).timestamp()) if x.get('timestamp') else int(time.time())
                txs.append({'chain':'ETH','hash':x['hash'],'time':ts,'from':fr.get('hash'),'to':to.get('hash'),'to_name':to.get('name') or '', 'to_contract':bool(to.get('is_contract')),
                    'value':int(x.get('value') or 0)/1e18,'method':x.get('method') or '','src':k,'url':f"https://eth.blockscout.com/tx/{x['hash']}"})
        else: continue
        chainok[t['chain']]+=1; time.sleep(0.35)
    except Exception as e: chainfail[t['chain']]+=1; t['fetch_error']=str(e)[:80]
sources.append({'name':'Blockstream Esplora (BTC)','url':'https://blockstream.info/api/','ok':chainok['BTC']>0,'count':chainok['BTC'],'failed':chainfail['BTC']})
sources.append({'name':'Blockscout Ethereum API','url':'https://eth.blockscout.com/api/v2/','ok':chainok['ETH']>0,'count':chainok['ETH'],'failed':chainfail['ETH']})
# --- 4. clustering (union-find)
P={}
def f(x):
    P.setdefault(x,x)
    while P[x]!=x: P[x]=P[P[x]]; x=P[x]
    return x
def u(a,b): P[f(a)]=f(b)
for k in tracked: f(k)
for t in tracked.values():  # same SDN entry / same report = same designated cluster
    pass
bylabel=collections.defaultdict(list)
for k,t in tracked.items(): bylabel[t['label']].append(k)
for ks in bylabel.values():
    for k in ks[1:]: u(ks[0],k)
for x in txs:
    if x['chain']=='BTC' and len(set(x['ins']))>1:  # common-input-ownership
        for a in x['ins'][1:]: u(x['ins'][0],a)
    if x['chain']=='ETH' and x.get('from') and x.get('to'):
        fl,tl=x['from'].lower(),x['to'].lower()
        if fl in tracked and tl in tracked: u(fl,tl)
# --- 5. scoring child/counterparty addresses
cand={}
fan=collections.Counter((x['src'],x['time']//3600) for x in txs)
def addc(addr,chain,x,val,reasons,score):
    key=addr.lower() if chain=='ETH' else addr
    if key in tracked: return
    c=cand.setdefault(key,{'address':addr,'chain':chain,'score':0,'reasons':[],'via':[],'parent':x['src']})
    c['score']=max(c['score'],min(100,score)); c['reasons']=sorted(set(c['reasons']+reasons)); c['via'].append({'tx':x['hash'],'url':x['url'],'value':val,'time':iso(x['time'])})
for x in txs:
    t=tracked[x['src']]; base=35 if t['kind'] in('sanctioned','fbi') else 20
    if x['chain']=='BTC':
        if x['src'] not in x['ins']: continue
        outs=[o for o in x['outs'] if o[0] not in x['ins']]
        peel=len(x['outs'])==2 and outs and min(v for _,v in x['outs'])<0.1*max(v for _,v in x['outs'])
        for a,v in outs:
            r=['received BTC directly from a tracked address (1 hop)']; s=base+15
            if len(set(x['ins']))>1: r.append('co-spent inputs with tracked wallet (common-input heuristic)'); s+=10
            if peel: r.append('2-output peel-chain shape'); s+=15
            if len(outs)>=8: r.append(f'part of {len(outs)}-way fan-out'); s+=10
            if v>=1: r.append(f'large value ({v:.2f} BTC)'); s+=10
            addc(a,'BTC',x,v,r,s)
    else:
        if (x.get('from') or '').lower()!=x['src'] or not x.get('to'): continue
        r=['received from a tracked address (1 hop)']; s=base+15; nm=x['to_name']+' '+x['method']
        if MIX.search(nm): r.append(f'mixer interaction ({x["to_name"] or x["method"]})'); s+=30
        elif BRIDGE.search(nm): r.append(f'bridge/cross-chain hop ({x["to_name"] or x["method"]})'); s+=25
        elif SWAP.search(nm) and x['to_contract']: r.append(f'DEX/swap router ({x["to_name"] or x["method"]})'); s+=10
        if not x['to_contract'] and x['value']>0: r.append('EOA recipient (possible fresh hop wallet)'); s+=5
        if fan[(x['src'],x['time']//3600)]>=5: r.append('rapid fan-out: 5+ outgoing tx within one hour'); s+=15
        if x['value']>=50: r.append(f'large value ({x["value"]:.1f} ETH)'); s+=10
        addc(x['to'],'ETH',x,x['value'],r,s)
# --- 6. clusters
cl=collections.defaultdict(lambda:{'members':[],'children':0})
for k in tracked: cl[f(k)]['members'].append(k)
for c in cand.values(): cl[f(c['parent'])]['children']+=1
clusters=[]
for i,(r,c) in enumerate(sorted(cl.items(),key=lambda kv:-len(kv[1]['members']))):
    m=[tracked[k] for k in c['members']]; cid=f'C{i+1:03d}'
    for k in c['members']: tracked[k]['cluster']=cid
    clusters.append({'id':cid,'label':m[0]['label'],'kind':m[0]['kind'],'chains':sorted({x['chain'] for x in m}),'size':len(m),'children':c['children'],
        'balance':{ch:round(sum(x.get('balance',0) for x in m if x['chain']==ch),4) for ch in ('BTC','ETH')},'sources':m[0]['sources'][:2],'members':[x['address'] for x in m][:40]})
for c in cand.values(): c['cluster']=tracked[c['parent']].get('cluster')
# --- 7. alerts (real tx only; accumulate across runs)
old={a['id']:a for a in (json.load(open(os.path.join(D,'alerts.json'))).get('alerts',[]) if os.path.exists(os.path.join(D,'alerts.json')) else [])}
def short(a): return a[:6]+'…'+a[-4:]
for x in txs:
    t=tracked[x['src']]; aid=x['chain']+':'+x['hash']
    if aid in old: continue
    who=('OFAC-listed address ('+t['label']+')') if t['kind']=='sanctioned' else 'FBI-attributed Bybit-hack wallet' if 'Bybit' in t['label'] else 'FBI-attributed wallet'
    if x['chain']=='ETH':
        out=(x.get('from') or '').lower()==x['src']; tgt=x['to'] or ''; c=cand.get(tgt.lower())
        if out:
            dest=('mixer '+x['to_name']) if MIX.search(x['to_name']+x['method']) else (x['to_name'] or ('address '+short(tgt)))
            msg=f"{who} sent {x['value']:.4g} ETH to {dest} [cluster {t.get('cluster')}]." 
            if x['value']==0: msg=f"{who} called {x['method'] or 'a contract'} on {dest} (no ETH moved)."
        elif x['value']<0.001: continue  # skip dust / address-poisoning noise
        else: msg=f"{who} received {x['value']:.4g} ETH from {short(x.get('from') or '?')}."
        lvl=(c or {}).get('score',30 if out else 15)
    else:
        out=x['src'] in x['ins']; tot=sum(v for a,v in x['outs'] if a not in x['ins'])
        if out: msg=f"{who} spent {tot:.4g} BTC split across {len([o for o in x['outs'] if o[0] not in x['ins']])} output(s) [cluster {t.get('cluster')}]."; lvl=max([cand[a]['score'] for a,_ in x['outs'] if a in cand] or [30])
        else:
            v=sum(v for a,v in x['outs'] if a==x['src'])
            if v<0.0005: continue
            msg=f"{who} received {v:.4g} BTC."; lvl=15
    old[aid]={'id':aid,'time':iso(x['time']),'chain':x['chain'],'level':lvl,'cluster':t.get('cluster'),'message':msg,'tx_url':x['url'],
        'address':t['address'],'address_url':(f"https://mempool.space/address/{t['address']}" if x['chain']=='BTC' else f"https://eth.blockscout.com/address/{t['address']}"),'sources':t['sources'][:2]}
import sys; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import verdict
alerts=verdict.apply(sorted(old.values(),key=lambda a:a['time'],reverse=True)[:3000])
gen=now().isoformat().replace('+00:00','Z')
recent=[a for a in alerts if a['time']>(now()-dt.timedelta(days=30)).isoformat()]
threat=min(100,round(sum(a['level'] for a in recent[:50])/max(1,min(50,len(recent)))*0.6+min(40,len(recent))))
W=lambda n,o:json.dump(o,open(os.path.join(D,n),'w'),indent=1)
W('addresses.json',{'generated':gen,'addresses':list(tracked.values())})
W('clusters.json',{'generated':gen,'clusters':clusters,'candidates':(lambda L:[c for i,c in enumerate(L) if i<100 or sum(1 for x in L[:i] if x['cluster']==c['cluster'])<20])(sorted(cand.values(),key=lambda c:-c['score']))[:500]})
W('alerts.json',{'generated':gen,'alerts':alerts})
W('meta.json',{'generated':gen,'threat':threat,'counts':{'addresses':len(tracked),'clusters':len(clusters),'alerts':len(alerts),'candidates':len(cand),'alerts_30d':len(recent),'txs_scanned':len(txs)},'sources':sources,
    'disclaimer':'Independent public-data OSINT. Not affiliated with any government. Scores are heuristic resemblance, not attribution.'})
# feeds
verdict.feeds(alerts,ROOT,SITE,gen)
print(json.dumps({'counts':json.load(open(os.path.join(D,'meta.json')))['counts'],'threat':threat,'sources':[(s['name'],s['ok'],s.get('count')) for s in sources]},indent=1))
