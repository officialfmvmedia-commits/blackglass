#!/usr/bin/env python3
"""Normalize alert wording and compute a verdict (SAFE / MONITORING / RISK) for every alert
from data already stored in alerts.json. Deterministic and idempotent; re-run on every ingest.
Labels are heuristic (public label datasets, OFAC/FBI lists, post-mortems), not attribution."""
import re, json, os, html, datetime as dt
EX=[('Binance',r'binance'),('Coinbase',r'coinbase'),('OKX',r'\bokx|okex'),('Kraken',r'kraken'),('Bybit',r'bybit'),('Bitget',r'bitget'),('KuCoin',r'kucoin'),
    ('HTX',r'huobi|\bhtx\b'),('Gate',r'gate\.?io|^gate\b'),('Bitfinex',r'bitfinex'),('Gemini',r'gemini'),('Crypto.com',r'crypto\.com'),('Upbit',r'upbit'),('MEXC',r'mexc'),
    ('Robinhood',r'robinhood'),('Bitstamp',r'bitstamp'),('Bithumb',r'bithumb'),('Poloniex',r'poloniex'),('Bitpanda',r'bitpanda'),('Bittrex',r'bittrex'),('Coinone',r'coinone'),('WhiteBIT',r'whitebit')]
def entity(name):
    if not name or re.search(r'lazarus|flagged|hack wallet|incident',name,re.I): return None
    for e,rx in EX:
        if re.search(rx,name,re.I): return e
P=lambda s:dt.datetime.fromisoformat(s.replace('Z','+00:00'))
def fm(u): return f'${u/1e9:.2f}B' if u>=1e9 else f'${u/1e6:.1f}M' if u>=1e7 else f'${u/1e6:.2f}M' if u>=1e5 else f'${u:,.0f}'
def pm(s):
    s=s.replace('$','').replace(',','');m=1e9 if s.endswith('B') else 1e6 if s.endswith('M') else 1
    return float(s.rstrip('BM'))*m
TX=re.compile(r'^(?P<who>.+?) (?P<dir>sent|received|moved) (?P<usd>\$[\d.,]+[MBK]?) \((?P<amt>[^)]*)\) (?:to|from) (?P<cp>.+?)(?: on (?P<ch>[A-Z]+))?\.$')
def clean(a):
    m=a['message']
    # legacy hype / hedge phrasing -> plain log wording
    d=re.match(r"Unusual outflow: (.+?) native balance fell (\d+)% \((\$[\d.,]+[MB]?) → (\$[\d.,]+[MB]?)\) since the last check\..*",m)
    if d: m=f"{d[1]} ({a.get('chain','ETH')}) balance down {d[2]}%: {fm(pm(d[3]))} → {fm(pm(d[4]))} between checks."
    f=re.match(r"Unusual outflows: (.+?) sent (\d+) large transfers to unlabeled addresses within one hour\..*",m)
    if f: m=f"{f[1]}: {f[2]} transfers ≥$1M to unlabeled addresses within one hour."
    m=re.sub(r'^A wallet in an FBI attribution','FBI-attributed wallet',m)
    m=re.sub(r'^A wallet the FBI tied to the Bybit hack','FBI-attributed Bybit-hack wallet',m)
    m=re.sub(r'^An address OFAC lists under "([^"]+)"',r'OFAC-listed address (\1)',m)
    m=m.replace(' just sent ',' sent ').replace(' just spent BTC: ',' spent ').replace(' just spent ',' spent ')
    m=re.sub(r', 1 hop from cluster (C\d+)',r' [cluster \1]',m)
    m=re.sub(r'\. Resemblance score \d+/100\.$','.',m)
    m=m.replace('to the mixer ','to mixer ')
    a['message']=m
    t=TX.match(m)
    if t and a.get('type')!='lazarus':
        a.setdefault('counterparty_label',t['cp']); a.setdefault('direction','out' if t['dir'] in('sent','moved') else 'in')
    return a
def mins(x):
    x=round(x); return f'{x} min' if x<90 else f'{x/60:.1f} h'
def verdict(a,byaddr):
    tags=set(a.get('tags') or []); typ=a.get('type','lazarus'); m=a['message']; cp=a.get('counterparty_label') or ''; out=a.get('direction')=='out'
    if typ=='lazarus':
        src='OFAC SDN list' if m.startswith('OFAC') else 'FBI public attribution'
        if ' received ' in m: return 'MONITORING',f'Inbound to a wallet on the {src}. No outflow in this transaction.'
        if '(no ETH moved)' in m: return 'MONITORING',f'Contract call by a wallet on the {src}. No value transferred.'
        return 'RISK',f'Sender is on the {src}.'
    if typ=='hack':
        return ('RISK' if out or ' moved ' in m else 'MONITORING'),('Wallet is named in a public hack post-mortem.' if out or ' moved ' in m else 'Inbound to a wallet named in a public hack post-mortem.')
    if 'hack' in tags or re.search(r'Lazarus-tracked|flagged in the',cp): return 'RISK',f'Counterparty is {cp}.'
    if 'mixer' in tags: return 'RISK','Counterparty is a mixer.'
    if a['id'].startswith('drop:'):
        t0=P(a['time']); ent=a.get('entity')
        for b in byaddr.get(a['address'].lower(),[]):
            if b is a or b['id'].startswith(('drop:','fan:')): continue
            dtm=(P(b['time'])-t0).total_seconds()/60; ce=entity(b.get('counterparty_label'))
            if b.get('direction')=='in' and 0<=dtm<=60 and ce==ent:
                am=TX.match(b['message'])
                return 'SAFE',f"Refilled with {am['amt']} ({am['usd']}) from {b['counterparty_label']} {mins(dtm)} later. Internal rebalance."
            if b.get('direction')=='out' and -60<=dtm<=0 and ce==ent:
                am=TX.match(b['message'])
                return 'SAFE',f"Outflow of {am['amt']} ({am['usd']}) went to {b['counterparty_label']} (same exchange). Internal transfer."
        return 'MONITORING','No matching internal transfer found in logged activity. Destination not identified.'
    if a['id'].startswith('fan:'): return 'MONITORING','Destinations are unlabeled. No link to flagged wallets found.'
    if 'bridge' in tags: return 'MONITORING',f'Funds moved via bridge ({cp}).'
    ce=entity(cp)
    if ce and ce==a.get('entity'): return 'SAFE',f'Counterparty is {cp} (same exchange). Internal transfer.'
    if ce: return 'SAFE',f'Counterparty is {cp} (labeled {ce} wallet). Exchange-to-exchange transfer.'
    if not out: return 'SAFE','Inbound deposit. Funds entered exchange custody.'
    return 'MONITORING','Destination is unlabeled. Not linked to any flagged wallet.'
def apply(al):
    for a in al: a.setdefault('type','lazarus'); clean(a)
    byaddr={}
    for a in al: byaddr.setdefault((a.get('address') or '').lower(),[]).append(a)
    for a in al: a['status'],a['basis']=verdict(a,byaddr)
    return al
def feeds(al,root,site,now):
    e=lambda s:html.escape(str(s),quote=True)
    line=lambda a:f"[{a['status']}] {a['message']}"
    body=lambda a:f"{a['message']} Status: {a['status']}. {a['basis']} Risk score {a['level']}/100."
    srcs=lambda a:', '.join(s['url'] for s in a.get('sources') or [])
    json.dump({'version':'https://jsonfeed.org/version/1.1','title':'HACKWATCH alerts','home_page_url':site,'feed_url':site+'feed.json',
      'items':[{'id':a['id'],'url':a['tx_url'],'title':line(a)[:140],'content_text':body(a)+(' Sources: '+srcs(a) if srcs(a) else '')+' Labels are heuristic, not attribution.','date_published':a['time'],
                'tags':[a.get('type'),a['status']]+(a.get('tags') or []),'_hackwatch':{'status':a['status'],'basis':a['basis'],'risk':a['level']}} for a in al[:150]]},open(os.path.join(root,'feed.json'),'w'),indent=1)
    items=''.join(f"<entry><id>urn:glassbreak:{e(a['id'])}</id><title>{e(line(a)[:140])}</title><link href=\"{e(a['tx_url'])}\"/><updated>{a['time']}</updated><category term=\"{e(a.get('type'))}\"/><category term=\"{a['status']}\"/><summary>{e(body(a))} Source: {e(a['sources'][0]['url'] if a.get('sources') else a['tx_url'])}. Labels are heuristic, not attribution.</summary></entry>" for a in al[:150])
    open(os.path.join(root,'feed.xml'),'w').write(f'<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>HACKWATCH alerts</title><id>{site}</id><link href="{site}"/><link rel="self" href="{site}feed.xml"/><updated>{now}</updated>{items}</feed>')
if __name__=='__main__':
    ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); f=os.path.join(ROOT,'data','alerts.json'); d=json.load(open(f))
    apply(d['alerts']); json.dump(d,open(f,'w'),indent=1)
    feeds(d['alerts'],ROOT,os.environ.get('SITE_URL','https://hackwatch.info/'),d['generated'])
    import collections; print(collections.Counter(a['status'] for a in d['alerts']))
