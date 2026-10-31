const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const col=l=>l>=60?'#ff3b4e':l>=40?'#f5a524':'#a879ff';
const J=u=>fetch(u+'?t='+Date.now()).then(r=>{if(!r.ok)throw r.status;return r.json()});
let A=[],C=[],K=[],M={},S=[],I=[],X=[],R=[],LZ=[],FL=null,q='',lastVisit=+localStorage.bgLastVisit||0,shown=25,tf='all',cf='',sf=0,seen=new Set();
const H=t=>(Date.now()-new Date(t))/36e5;
const ago=t=>{const s=(Date.now()-new Date(t))/1e3;return s<3600?Math.max(1,Math.round(s/60))+' min ago':s<86400?Math.round(s/3600)+' h ago':Math.round(s/86400)+' d ago'};
const usd=u=>u>=1e9?'$'+(u/1e9).toFixed(2)+'B':u>=1e6?'$'+(u/1e6).toFixed(1)+'M':u>=1e3?'$'+Math.round(u/1e3)+'K':u?'$'+Math.round(u):'—';
const TL={exchange:'Exchange',hack:'Hack',lazarus:'Lazarus'};
const sev=l=>l>=60?['hi','High']:l>=40?['md','Medium']:['lo','Low'];
const isNew=a=>(lastVisit>0&&new Date(a.time)>lastVisit)||H(a.time)<24;
async function load(first){
 const G=(u,d)=>J(u).catch(()=>d);
 const [m,a,c,s,i,x]=await Promise.all([J('data/meta.json'),J('data/alerts.json'),J('data/clusters.json'),G('data/scenarios.json',{scenarios:[]}),G('data/incidents.json',{incidents:[]}),G('data/exchanges.json',{exchanges:[]})]);
 M=m;document.querySelectorAll('[data-c]').forEach(e=>{const v=(m.counts||{})[e.dataset.c];if(v!=null)e.textContent='plus' in e.dataset?Math.floor(v/50)*50+'+':v.toLocaleString()});C=c.clusters;K=c.candidates;S=s.scenarios;I=i.incidents;X=x.exchanges;A=a.alerts.map(z=>({...z,type:z.type||'lazarus'}));
 const fresh=A.filter(z=>!seen.has(z.id));if(!first&&fresh.length)fresh.slice(0,4).forEach(z=>{notify(z);toast(z)});
 A.forEach(z=>seen.add(z.id));
 if(first){[...new Set(A.map(z=>z.chain))].sort().forEach(c=>$('#cfil').insertAdjacentHTML('beforeend',`<option>${esc(c)}</option>`))}
 render();
}
function why(a){const t=a.tags||[];
 if(t.includes('anomaly'))return 'A sudden drop or burst of outflows from an exchange hot wallet is how exchange hacks usually look at first. It can also be routine rebalancing.';
 if(a.type=='hack')return 'This wallet was named in a public hack write-up. Movements usually mean stolen funds are being laundered or cashed out.';
 if(t.includes('mixer'))return 'Mixers hide where money goes next. That is a common laundering step.';
 if(t.includes('e2e'))return 'Large exchange-to-exchange flows can signal market-moving trades or liquidity shifts.';
 if(a.type=='exchange')return a.usd>=1e8?'Transfers this size can move markets. Most are internal reshuffling, but drains start the same way.':'A large transfer from a labeled exchange wallet. Usually routine, worth watching if it repeats.';
 return 'This wallet is on an official US government list tied to North Korean hackers. Any movement can mean stolen funds are being moved.';}
function row(a){const [c,l]=sev(a.level);return `<details class="ar"><summary><span class="sevc"><span class="sev ${c}">${l}</span></span><span class="msg">${isNew(a)?'<span class="new">NEW</span>':''}${esc(a.message)}</span><span class="amt">${usd(a.usd)}</span><span class="ch">${esc(a.chain)} · ${TL[a.type]||''}</span><span class="tm" title="${esc(a.time)}">${ago(a.time)}</span></summary>
<div class="ad"><b>Why this matters:</b> ${esc(why(a))}${a.reasons&&a.reasons.length?`<br><span class="small">Flagged because: ${esc(a.reasons.join(' · '))}. Score ${a.level}/100 (pattern match, not proof).</span>`:`<br><span class="small">Score ${a.level}/100 (pattern match, not proof).</span>`}
<div class="links"><a href="${esc(a.tx_url)}" target="_blank" rel="noopener">View transaction ↗</a><a href="${esc(a.address_url)}" target="_blank" rel="noopener">View wallet ↗</a>${(a.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">Source: ${esc(s.name)} ↗</a>`).join('')}<span class="mono small muted">${esc(a.time.slice(0,16).replace('T',' '))} UTC</span></div></div></details>`}
function heat(){const cv=$('#heat'),d=devicePixelRatio,w=cv.clientWidth,h=40;cv.width=w*d;cv.height=h*d;const x=cv.getContext('2d');x.scale(d,d);
 const N=168,b=new Array(N).fill(0),now=Date.now();A.forEach(a=>{const k=Math.floor((now-new Date(a.time))/36e5);if(k>=0&&k<N)b[N-1-k]+=1});const mx=Math.max(1,...b),bw=w/N;
 b.forEach((v,i)=>{x.fillStyle=v?`rgba(255,59,78,${.25+.75*v/mx})`:'#1a1a22';const bh=v?Math.max(4,h*v/mx):3;x.fillRect(i*bw+.5,h-bh,Math.max(1,bw-1),bh)});
 $('#stripmax').textContent=`${b.reduce((s,v)=>s+v,0)} alerts · peak ${mx}/h`}
function render(){
 const n=M.counts||{};
 const hk=A.filter(a=>a.type=='hack'),an=A.filter(a=>(a.tags||[]).includes('anomaly')),lz=A.filter(a=>a.type=='lazarus'),ex=A.filter(a=>a.type=='exchange');
 const recInc=I.filter(i=>H(i.date+'T23:59:59Z')<72),hot=[...hk,...an].filter(a=>H(a.time)<6),warm=[...hk,...an,...lz].filter(a=>H(a.time)<72);
 const st=hot.length?'a':(warm.length||recInc.length)?'w':'q';$('#status').className='status '+st;
 $('#slab').textContent=st=='a'?'Active':st=='w'?'Watch':'All quiet';
 const big=recInc.slice().sort((a,b)=>b.amount_usd-a.amount_usd)[0];
 $('#shead').textContent=st=='a'?`${hot.length} hack or unusual-outflow alert${hot.length>1?'s':''} in the last 6 hours`:st=='w'?(recInc.length?`${recInc.length} hack${recInc.length>1?'s':''} reported in the last 3 days${big?`. The largest is ${big.name} (${usd(big.amount_usd)}).`:''}`:'Tracked hacker wallets moved in the last 3 days.'):'Nothing unusual in the last 72 hours.';
 const last=A.find(a=>a.type!='exchange'||(a.tags||[]).includes('anomaly'));
 $('#ssub').textContent=last?`Latest hack or Lazarus signal, ${ago(last.time)}: ${last.message}`:'';
 const mins=Math.round((Date.now()-new Date(M.generated))/6e4);$('#schk').textContent=`Last checked ${mins<1?'just now':mins<120?mins+' min ago':Math.round(mins/60)+' h ago'} · updates every few minutes`;
 const cell=(t,arr,ex)=>`<div>${t}<b>${arr.filter(a=>H(a.time)<24).length} alerts in 24h</b>${arr[0]?'Last '+ago(arr[0].time):'None yet'}${ex||''}</div>`;
 const an24=an.filter(a=>H(a.time)<24).length;
 $('#sgrid').innerHTML=cell('Exchanges',ex,an24?` · <span style="color:var(--a)">${an24} unusual</span>`:'')+cell('Hacks',hk,recInc.length?` · ${recInc.length} new incident${recInc.length>1?'s':''}`:'')+cell('Lazarus',lz);
 const la=A[0];$('#latesttxt').innerHTML=la?`<b>Latest alert</b> · ${ago(la.time)} · ${esc(la.message)}`:'No alerts yet';
 heat();
 const chains=new Set([...(R.length?R:[]).map(w=>w.chain)]);
 const cov=[['Exchanges',n.exchanges||X.length],['Exchange wallets',n.registry_wallets],['Lazarus-linked addresses',n.addresses],['Hack-flagged addresses',n.flagged_hack_addresses],['Hacks logged',I.length],['Chains live-monitored','5 (ETH, BTC, OP, Polygon, + Lazarus BTC/ETH)'],['Update frequency','Every 10 min'],['Last updated',new Date(M.generated).toLocaleString([], {dateStyle:'medium',timeStyle:'short'})]];
 cov[5][1]='ETH · BTC · Optimism · Polygon';
 $('#cov').innerHTML=cov.map(([k,v])=>`<div><dt>${k}</dt><dd>${typeof v=='number'?v.toLocaleString():esc(v??'—')}</dd></div>`).join('');
 $('#gen').textContent=new Date(M.generated).toLocaleString();
 const LF=A.filter(a=>(tf=='all'||a.type==tf||(tf=='whale'&&a.usd>=1e7))&&(!cf||a.chain==cf)&&(a.usd||0)>=sf&&(!q||(a.message+a.address+(a.entity||'')).toLowerCase().includes(q)));
 const nw=LF.filter(isNew).length;$('#newnote').textContent=`${LF.length.toLocaleString()} alerts match · ${nw} new since your last visit or in the last 24h · click a row for details`;
 $('#arows').innerHTML=LF.slice(0,shown).map(row).join('')||'<p class="muted" style="padding:16px">No alerts match these filters.</p>';
 $('#more').style.display=LF.length>shown?'':'none';
 $('#exnote').textContent='Wallets from open label datasets. Net flow and biggest move cover the wallets checked in the latest run, not whole-exchange totals.';
 $('#extbl').innerHTML='<thead><tr><th>Exchange</th><th class="n">Wallets</th><th>Chains</th><th class="n">Net flow seen</th><th class="n">Alerts 24h</th><th>Biggest move seen</th><th>Status</th></tr></thead><tbody>'+X.map(e=>{const net=(e.flow_in_usd||0)-(e.flow_out_usd||0),has=e.flow_in_usd||e.flow_out_usd;return `<tr><td class="ex">${esc(e.entity)}</td><td class="n">${e.wallets}</td><td class="small muted">${Object.keys(e.chains).join(', ')}</td><td class="n ${has?(net<0?'neg':'pos'):''}">${has?(net<0?'−':'+')+usd(Math.abs(net)):'—'}</td><td class="n">${e.alerts_24h}</td><td class="bm">${e.biggest?`${usd(e.biggest.usd)} · ${esc(e.biggest.text)} <a href="${esc(e.biggest.tx)}" target="_blank" rel="noopener">tx ↗</a>`:'Not checked this run'}</td><td>${e.anomaly?'<span class="flag">Unusual</span>':'<span class="ok">Normal</span>'}</td></tr>`}).join('')+'</tbody>';
 const AT={'Government-attributed':['gov','Government'],'Analyst-attributed':['ana','Analyst'],'Unattributed':['una','Unattributed']};
 $('#inc').innerHTML=I.slice(0,15).map(i=>{const live=A.filter(a=>a.type=='hack'&&a.entity&&a.entity.startsWith(i.name)),[ac,al]=AT[i.attribution]||AT.Unattributed,rec=H(i.date+'T23:59:59Z')<72;return `<div class="it${rec?' recent':''}"><div class="dt">${i.date}<br>${esc(i.chains.slice(0,3).join(', '))}${i.chains.length>3?' +'+(i.chains.length-3):''}</div><div><span class="tag ${ac}">${al}</span>${live.length?`<span class="tag live">Following ${i.addresses.length} wallets</span>`:''}<br><b>${esc(i.name)}</b><p>${esc((i.description||i.technique||'').slice(0,220))}${(i.description||'').length>220?'…':''}</p>${i.actor?`<p class="small">Blamed on: ${esc(i.actor)}</p>`:''}${live[0]?`<p class="small">Latest move ${ago(live[0].time)}: ${esc(live[0].message)}</p>`:''}<div class="links">${i.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join('')}</div></div><div class="amt">${i.amount_usd?usd(i.amount_usd):'—'}<div class="small muted">${esc(i.technique||'')}</div></div></div>`}).join('');
 $('#scen').innerHTML=S.filter(c=>c.type!='hack').slice(0,4).map(c=>`<div class="sc"><div class="top"><span class="sev ${c.confidence_label=='high'?'hi':c.confidence_label=='medium'?'md':'lo'}">${c.confidence_label} confidence</span><span>${esc(c.chain)}</span><span>${new Date(c.end).toDateString().slice(4)}</span></div><b>${esc(c.title)}</b><p>${esc(c.what)}</p><div class="lb">Why it matters</div><p>${esc(c.why)}</p><div class="links">${c.tx_links.slice(0,3).map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">Tx ${i+1} ↗</a>`).join('')}${(c.sources||[]).slice(0,1).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join('')}</div></div>`).join('');
 $('#clist').innerHTML=C.map(c=>`<div class="cl"><b>${c.id} · ${esc(c.label)}</b><br>${c.size} addresses · ${c.children} connected · ${c.chains.join('/')}<br>${c.sources.slice(0,1).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join('')}</div>`).join('');
 $('#cands').innerHTML=K.slice(0,9).map(k=>`<div class="cd"><span class="s">${k.score}</span><b>${k.chain} · ${k.cluster}</b><br><a href="${k.chain=='BTC'?'https://mempool.space/address/':'https://eth.blockscout.com/address/'}${esc(k.address)}" target="_blank" rel="noopener">${esc(k.address)}</a><ul>${k.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>`).join('');
 $('#srcs').innerHTML=(M.sources||[]).map(s=>`<div class="sr"><b>${esc(s.name)}</b><br><span class="${s.ok?'okc':'bad'}">${s.ok?'Reachable':'Unreachable, excluded'}</span>${s.count!=null?` · ${s.count} items`:''}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>`).join('');
 if(!G.nodes.length)buildGraph();
}
document.querySelectorAll('#tfil button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#tfil button').forEach(x=>x.classList.remove('on'));b.classList.add('on');tf=b.dataset.t;shown=25;render()});
$('#cfil').onchange=e=>{cf=e.target.value;render()};$('#sfil').onchange=e=>{sf=+e.target.value;render()};
$('#q').oninput=e=>{q=e.target.value.toLowerCase();shown=25;render()};$('#more').onclick=()=>{shown+=25;render()};
addEventListener('beforeunload',()=>localStorage.bgLastVisit=Date.now());addEventListener('resize',()=>A.length&&heat());
function toast(a){const t=document.createElement('div');t.className='toast';t.innerHTML=`<b>New ${TL[a.type]||''} alert</b>${esc(a.message)}`;$('#toasts').append(t);setTimeout(()=>t.remove(),9000)}
async function en(){if(!('Notification'in window))return alert('Your browser does not support notifications.');const p=await Notification.requestPermission();['#notify','#notify2'].forEach(s=>$(s).textContent=p=='granted'?'Notifications on':'Notifications blocked')}
$('#notify').onclick=en;$('#notify2').onclick=en;
function notify(a){if(window.Notification&&Notification.permission=='granted')new Notification('HACKWATCH: '+(TL[a.type]||'')+' alert',{body:a.message,icon:'brand/mark-180.png'})}
// address lookup: registry, Lazarus list, hack-flagged list, connected wallets
$('#look').onsubmit=async e=>{e.preventDefault();const v=$('#lq').value.trim();if(!v)return;const k=v.startsWith('0x')?v.toLowerCase():v,box=$('#lres');box.hidden=false;box.textContent='Checking…';
 try{if(!R.length)R=(await J('data/registry.json')).wallets;if(!LZ.length)LZ=(await J('data/addresses.json')).addresses;if(!FL)FL=(await J('data/flagged.json').catch(()=>({flagged:{}}))).flagged}catch(x){}
 const eq=a=>(a.startsWith('0x')?a.toLowerCase():a)==k,hits=[];
 R.filter(w=>eq(w.address)).forEach(w=>hits.push(`<li><b>${esc(w.entity)}</b> exchange wallet (${esc(w.name)}, ${esc(w.type)}, ${esc(w.chain)}). Source: ${w.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(', ')}</li>`));
 LZ.filter(w=>eq(w.address)).forEach(w=>hits.push(`<li><b>Lazarus-linked list:</b> ${esc(w.label)} (${esc(w.chain)}). Source: ${w.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(', ')}</li>`));
 if(FL&&FL[k])hits.push(`<li><b>Hack-flagged:</b> named in the ${esc(FL[k].incident)} hack. Source: <a href="${esc(FL[k].source)}" target="_blank" rel="noopener">${esc(FL[k].source)}</a></li>`);
 K.filter(c=>eq(c.address)).forEach(c=>hits.push(`<li><b>Connected wallet</b>, one hop from Lazarus cluster ${esc(c.cluster)}. Pattern score ${c.score}/100, not attribution.</li>`));
 const n=A.filter(a=>eq(a.address)).length;if(n)hits.push(`<li>${n} logged alert${n>1?'s':''} involve this wallet. <a href="#alerts" onclick="document.getElementById('q').value='${esc(v)}';document.getElementById('q').dispatchEvent(new Event('input'))">Show them</a></li>`);
 box.innerHTML=hits.length?`<b>Found in HACKWATCH data:</b><ul>${hits.join('')}</ul>`:`<b>Not on any of our lists.</b> <span class="muted">That doesn't mean it's safe or unsafe, only that no public source we use names it. We check ${(M.counts.registry_wallets||0).toLocaleString()} exchange wallets, ${(M.counts.addresses||0)} Lazarus-linked addresses and ${(M.counts.flagged_hack_addresses||0).toLocaleString()} hack-flagged addresses.</span>`};
// force graph
const Gc=$('#graph'),gx=Gc.getContext('2d'),G={nodes:[],links:[]};let drag=null,off={x:0,y:0};
function buildGraph(){const w=Gc.clientWidth,h=Gc.clientHeight;
 C.forEach(c=>G.nodes.push({id:c.id,r:6+Math.sqrt(c.size)*3,x:w/2+(Math.random()-.5)*w*.5,y:h/2+(Math.random()-.5)*h*.5,vx:0,vy:0,k:c.kind,l:c.label,main:1}));
 const byc={};K.forEach(k=>{const a=(byc[k.cluster]=byc[k.cluster]||[]);if(a.length<14)a.push(k)});
 Object.entries(byc).forEach(([cid,ks])=>ks.forEach(k=>{const p=G.nodes.find(n=>n.id==cid);if(!p)return;const n={id:k.address,r:2+k.score/30,x:p.x+Math.random()*40-20,y:p.y+Math.random()*40-20,vx:0,vy:0,s:k.score};G.nodes.push(n);G.links.push([p,n])}))}
function step(){const d=devicePixelRatio,w=Gc.clientWidth,h=Gc.clientHeight;if(Gc.width!=w*d){Gc.width=w*d;Gc.height=h*d}gx.setTransform(d,0,0,d,0,0);gx.clearRect(0,0,w,h);
 const N=G.nodes;for(let i=0;i<N.length;i++){const a=N[i];a.vx+=(w/2-a.x)*.0006;a.vy+=(h/2-a.y)*.0006;for(let j=i+1;j<N.length;j++){const b=N[j];const dx=a.x-b.x,dy=a.y-b.y,q=dx*dx+dy*dy+.1;if(q<9000){const f=(a.main&&b.main?140:22)/q;a.vx+=dx*f;a.vy+=dy*f;b.vx-=dx*f;b.vy-=dy*f}}}
 G.links.forEach(([a,b])=>{const dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy)||1,f=(l-(a.r+28))*.004;b.vx-=dx/l*f*l*.2;b.vy-=dy/l*f*l*.2;a.vx+=dx/l*f;a.vy+=dy/l*f});
 N.forEach(n=>{if(n==drag)return;n.vx*=.86;n.vy*=.86;n.x=Math.max(10,Math.min(w-10,n.x+n.vx));n.y=Math.max(10,Math.min(h-10,n.y+n.vy))});
 const t=performance.now()/1000;gx.lineWidth=1;G.links.forEach(([a,b])=>{gx.strokeStyle=`rgba(160,160,180,.18)`;gx.beginPath();gx.moveTo(a.x,a.y);gx.lineTo(b.x,b.y);gx.stroke()});
 N.forEach(n=>{gx.fillStyle=n.main?(n.k=='fbi'?'#a879ff':'#ff3b4e'):col(n.s);gx.shadowColor=gx.fillStyle;gx.shadowBlur=0;gx.beginPath();gx.arc(n.x,n.y,n.r,0,7);gx.fill()});gx.shadowBlur=0;
 gx.font='11px Plex';gx.fillStyle='#9a9aa8';N.filter(n=>n.main).forEach(n=>gx.fillText(n.id+' '+n.l.slice(0,22),n.x+n.r+4,n.y+4));requestAnimationFrame(step)}
requestAnimationFrame(step);
const pos=e=>{const b=Gc.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:p.clientX-b.left,y:p.clientY-b.top}};
Gc.addEventListener('pointerdown',e=>{const p=pos(e);drag=G.nodes.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<n.r+6)});
addEventListener('pointermove',e=>{if(drag){const p=pos(e);drag.x=p.x;drag.y=p.y}});addEventListener('pointerup',()=>drag=null);
load(true);setInterval(()=>load(false),120000);
