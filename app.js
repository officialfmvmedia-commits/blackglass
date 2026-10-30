const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const J=u=>fetch(u+'?t='+Date.now()).then(r=>r.json());
let A=[],C=[],K=[],M={},S=[],I=[],X=[],q='',lastVisit=+localStorage.bgLastVisit||0,shown=20,filt='all',tf='all',cf='',sf=0,seen=new Set(),pings=[];
const col=l=>l>=60?'#ff2a3d':l>=40?'#ff7a45':'#b46bff';
const H=t=>(Date.now()-new Date(t))/36e5;
const ago=t=>{const s=(Date.now()-new Date(t))/1e3;return s<3600?Math.max(1,Math.round(s/60))+'m ago':s<86400?Math.round(s/3600)+'h ago':Math.round(s/86400)+'d ago'};
const usd=u=>u>=1e9?'$'+(u/1e9).toFixed(2)+'B':u>=1e6?'$'+(u/1e6).toFixed(1)+'M':u>=1e3?'$'+Math.round(u/1e3)+'K':'$'+Math.round(u||0);
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)};
const TL={exchange:'EXCHANGE',hack:'HACK',lazarus:'LAZARUS'};
async function load(first){
 const G=(u,d)=>J(u).catch(()=>d);
 const [m,a,c,s,i,x]=await Promise.all([J('data/meta.json'),J('data/alerts.json'),J('data/clusters.json'),G('data/scenarios.json',{scenarios:[]}),G('data/incidents.json',{incidents:[]}),G('data/exchanges.json',{exchanges:[]})]);
 M=m;C=c.clusters;K=c.candidates;S=s.scenarios;I=i.incidents;X=x.exchanges;A=a.alerts.map(z=>({...z,type:z.type||'lazarus'}));
 const fresh=A.filter(z=>!seen.has(z.id));if(!first&&fresh.length)fresh.slice(0,5).forEach(z=>{ping(z.cluster);notify(z);toast(z)});
 A.forEach(z=>seen.add(z.id));
 if(first){const cs=[...new Set(A.map(z=>z.chain))].sort();$('#cfil').innerHTML+=cs.map(c=>`<option>${c}</option>`).join('')}
 render();
}
const isNew=a=>(lastVisit>0&&new Date(a.time)>lastVisit)||H(a.time)<24;
const src=a=>(a.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">source: ${esc(s.name)} ↗</a>`).join('');
function card(a){return `<article class="d${isNew(a)?' new':''}" style="--c:${col(a.level)}"><div class="dh">${isNew(a)?'<span class="nb">NEW</span>':''}<span class="tag" style="color:${col(a.level)}">${TL[a.type]||'ALERT'} · ${a.chain}</span>${a.usd?`<span>${usd(a.usd)}</span>`:''}<span>${new Date(a.time).toUTCString().slice(5,22)} UTC · ${ago(a.time)}</span><span title="Pattern-match score, not proof">SCORE ${a.level}/100</span></div><p>${esc(a.message)}</p>${a.reasons&&a.reasons.length?`<p class="tiny mono">why flagged: ${esc(a.reasons.join(' · '))}</p>`:''}<div class="dl"><a href="${esc(a.tx_url)}" target="_blank" rel="noopener">tx ↗</a><a href="${esc(a.address_url)}" target="_blank" rel="noopener">wallet ↗</a>${src(a)}</div></article>`}
function render(){
 const n=M.counts||{};
 const hk=A.filter(a=>a.type=='hack'),an=A.filter(a=>(a.tags||[]).includes('anomaly')),lz=A.filter(a=>a.type=='lazarus'),ex=A.filter(a=>a.type=='exchange');
 const recInc=I.filter(i=>H(i.date+'T23:59:59Z')<72);
 const hot=[...hk,...an].filter(a=>H(a.time)<6), warm=[...hk,...an,...lz].filter(a=>H(a.time)<72);
 const st=hot.length?'a':(warm.length||recInc.length)?'w':'q';
 $('#status').className='status '+st;$('#slab').textContent=st=='a'?'● ACTIVE':st=='w'?'● WATCH':'● ALL QUIET';
 const big=recInc.slice().sort((a,b)=>b.amount_usd-a.amount_usd)[0];
 $('#shead').textContent=st=='a'?`${hot.length} hack or anomaly alert${hot.length>1?'s':''} in the last 6 hours`:st=='w'?(recInc.length?`${recInc.length} hack${recInc.length>1?'s':''} reported in the last 3 days${big?`, biggest: ${big.name} (${usd(big.amount_usd)})`:''}`:`Tracked hacker wallets moved in the last 3 days`):'Nothing unusual in the last 72 hours';
 const last=A.find(a=>a.type!='exchange'||(a.tags||[]).includes('anomaly'))||A[0];
 $('#ssub').textContent=last?`Latest hack/Lazarus signal (${ago(last.time)}): ${last.message}`:'';
 const cell=(t,arr,extra)=>{const l=arr[0];return `<div>${t}<b>${arr.filter(a=>H(a.time)<24).length} in 24h</b>${l?'last '+ago(l.time):'none yet'}${extra||''}</div>`};
 $('#sgrid').innerHTML=cell('EXCHANGES',ex,an.filter(a=>H(a.time)<24).length?` · <span style="color:#ffb020">${an.filter(a=>H(a.time)<24).length} anomaly</span>`:'')+cell('HACKS',hk,recInc.length?` · ${recInc.length} new incident(s)`:'')+cell('LAZARUS',lz);
 const mins=Math.round((Date.now()-new Date(M.generated))/6e4);$('#schk').innerHTML=`Last checked <b>${mins<1?'just now':mins<120?mins+' min ago':Math.round(mins/60)+' h ago'}</b>`;
 $('#slast').innerHTML=A[0]?`Last real movement <b>${ago(A[0].time)}</b>`:'';
 $('#tl').textContent=(M.threat??'--')+'/100';setTimeout(()=>$('#tlb').style.width=(M.threat||0)+'%',200);
 $('#stats').innerHTML=[['WALLETS TRACKED',(n.registry_wallets||0)+(n.addresses||0)],['EXCHANGES',n.exchanges||X.length],['HACKS LOGGED',I.length],['HACK-FLAGGED ADDRS',n.flagged_hack_addresses||0],['LOGGED EVENTS',A.length]].map(([k,v])=>`<div><b>${(+v).toLocaleString()}</b><span>${k}</span></div>`).join('');
 $('#gen').textContent=new Date(M.generated).toLocaleString();
 $('#ticker').textContent=A.slice(0,20).map(a=>`▲ ${ago(a.time).toUpperCase()} // ${a.message}`).join('     ');
 const LF=A.filter(a=>(tf=='all'||a.type==tf||(tf=='whale'&&a.usd>=1e7))&&(!cf||a.chain==cf)&&(a.usd||0)>=sf);
 const nw=LF.filter(isNew);$('#newnote').textContent=nw.length?`${nw.length} new since your last visit or in the last 24h.`:`Nothing new for this filter since your last visit. Showing the latest ${Math.min(6,LF.length)}.`;
 $('#alerts').innerHTML=(nw.length?nw.slice(0,12):LF.slice(0,6)).map(card).join('')||'<p class="tiny mono">No alerts match.</p>';
 const AT={'Government-attributed':'a','Analyst-attributed':'w','Unattributed':'q'};
 $('#inc').innerHTML=I.slice(0,12).map(i=>{const live=A.filter(a=>a.type=='hack'&&a.entity&&a.entity.startsWith(i.name));return `<div class="ic${H(i.date+'T23:59:59Z')<72?' live':''}"><div class="dh"><span class="k ${AT[i.attribution]}">${i.attribution.toUpperCase()}</span><span>${i.date}</span><span>${esc(i.chains.slice(0,4).join(', '))}</span></div><h3>${esc(i.name)}</h3><div class="amt">${i.amount_usd?usd(i.amount_usd):'amount n/a'}</div><p>${esc((i.description||i.technique||'').slice(0,260))}${(i.description||'').length>260?'…':''}</p>${i.actor?`<p class="tiny mono">Attributed to: ${esc(i.actor)}</p>`:''}${i.addresses.length?`<p class="tiny mono">Following ${i.addresses.length} published wallet(s) · ${live.length} movement alert(s)${live[0]?' · last '+ago(live[0].time):''}</p>`:''}<div class="dl">${i.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join('')}</div></div>`}).join('');
 $('#exnote').textContent='Wallets come from open label datasets. Flows are totals from the wallets polled in the latest run, not whole-exchange totals.';
 $('#exg').innerHTML=X.map(e=>{const net=(e.flow_in_usd||0)-(e.flow_out_usd||0);return `<div class="ec${e.anomaly?' anom':''}"><div class="dh"><span class="tag">${Object.keys(e.chains).join(' · ')}</span>${e.anomaly?'<span class="k w">ANOMALY</span>':''}</div><h3>${esc(e.entity)}</h3><div class="kv"><div><b>${e.wallets}</b>wallets tracked</div><div><b style="color:${net<0?'#ff6b78':'#7dffb8'}">${e.flow_in_usd||e.flow_out_usd?(net<0?'−':'+')+usd(Math.abs(net)):'—'}</b>net flow seen</div><div><b>${e.alerts_24h}</b>alerts 24h</div><div><b>${Object.entries(e.types).filter(([k])=>k!='unspecified').map(([k,v])=>v+' '+k).join(', ')||'—'}</b>types</div></div>${e.biggest?`<p class="tiny mono">Biggest move: ${usd(e.biggest.usd)}, ${esc(e.biggest.text)} <a href="${esc(e.biggest.tx)}" target="_blank" rel="noopener">tx ↗</a></p>`:'<p class="tiny mono">Not polled this run (rotating).</p>'}</div>`}).join('');
 $('#scen').innerHTML=S.slice(0,6).map(c=>`<div class="sc"><div class="dh"><span class="tag">${esc(c.cluster)} · ${c.chain}</span><span>${new Date(c.end).toDateString().slice(4)} · ${ago(c.end)}</span><span class="conf ${c.confidence_label}" title="Highest pattern-match score in this storyline">${c.confidence_label.toUpperCase()} · ${c.confidence}/100</span></div><h3>${esc(c.title)}</h3><div class="lb">WHAT HAPPENED</div><p>${esc(c.what)}</p><div class="lb">WHY IT MATTERS</div><p>${esc(c.why)}</p><div class="dl">${c.tx_links.map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">tx ${i+1} ↗</a>`).join('')}${(c.sources||[]).map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">source: ${esc(s.name)} ↗</a>`).join('')}</div></div>`).join('')||'<p class="tiny mono">No storylines yet.</p>';
 const L=A.filter(a=>(filt=='all'||a.chain==filt||(filt=='hi'&&a.level>=50))&&(!q||(a.message+a.address+(a.cluster||'')+(a.entity||'')).toLowerCase().includes(q)));
 $('#log').innerHTML='<div class="tr th"><span>WHEN (UTC)</span><span>CHAIN</span><span>SCORE</span><span>WHAT HAPPENED</span><span>LINKS</span></div>'+L.slice(0,shown).map(a=>`<div class="tr"><span class="mono">${a.time.slice(0,16).replace('T',' ')}</span><span class="mono hm">${a.chain}</span><span class="sc0 hm" style="color:${col(a.level)}">${a.level}</span><span><span class="tiny mono">${TL[a.type]}</span> ${esc(a.message)}</span><span><a href="${esc(a.tx_url)}" target="_blank" rel="noopener">tx</a>${a.sources&&a.sources[0]?` · <a href="${esc(a.sources[0].url)}" target="_blank" rel="noopener">src</a>`:''}</span></div>`).join('');
 $('#more').style.display=L.length>shown?'':'none';
 $('#clist').innerHTML=C.map(c=>`<div class="cl"><b>${c.id} · ${esc(c.label)}</b><br>${c.size} addr · ${c.children} children · ${c.chains.join('/')} · bal ${c.balance.ETH} ETH / ${c.balance.BTC} BTC<br>${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join(' ')}</div>`).join('');
 $('#cands').innerHTML=K.slice(0,12).map(k=>`<div class="cd"><span class="s">${k.score}</span><b>${k.chain} · ${k.cluster}</b><br><a href="${k.chain=='BTC'?'https://mempool.space/address/':'https://eth.blockscout.com/address/'}${esc(k.address)}" target="_blank" rel="noopener">${esc(k.address)}</a><ul>${k.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><a href="${esc(k.via[0].url)}" target="_blank" rel="noopener">first link tx ↗</a></div>`).join('');
 $('#srcs').innerHTML=(M.sources||[]).map(s=>`<div class="sr"><b>${esc(s.name)}</b><br><span class="${s.ok?'ok':'bad'}">${s.ok?'● REACHED':'● UNREACHABLE — excluded'}</span>${s.count!=null?` · ${s.count} items`:''}${s.error?` · ${esc(s.error)}`:''}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>`).join('');
 if(!G.nodes.length)buildGraph();
}
document.querySelectorAll('#filters .chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('#filters .chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');filt=b.dataset.f;shown=20;render()});
document.querySelectorAll('#tfil .chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('#tfil .chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');tf=b.dataset.t;render()});
$('#cfil').onchange=e=>{cf=e.target.value;render()};$('#sfil').onchange=e=>{sf=+e.target.value;render()};
$('#q').oninput=e=>{q=e.target.value.toLowerCase();shown=20;render()};
addEventListener('beforeunload',()=>localStorage.bgLastVisit=Date.now());
function toast(a){const t=document.createElement('div');t.className='toast';t.innerHTML=`<b>NEW ${TL[a.type]||''} ALERT</b>${esc(a.message)}`;$('#toasts').append(t);setTimeout(()=>t.remove(),9000)}
$('#more').onclick=()=>{shown+=20;render()};
$('#notify').onclick=async()=>{if(!('Notification'in window))return alert('Notifications not supported');const p=await Notification.requestPermission();$('#notify').textContent=p=='granted'?'🔔 Alerts on':'Alerts blocked'};
function notify(a){if(window.Notification&&Notification.permission=='granted')new Notification('BLACKGLASS '+(TL[a.type]||'')+' alert',{body:a.message,icon:'logo.svg'})}
// radar
const R=$('#radar'),rx=R.getContext('2d');let ang=0;
function ping(cid){pings.push({cid,t:performance.now()})}
function radar(now){const d=devicePixelRatio,w=R.clientWidth;R.width=R.height=w*d;rx.setTransform(d,0,0,d,0,0);const c=w/2,r=c*.9;rx.clearRect(0,0,w,w);
 rx.strokeStyle='rgba(255,42,61,.22)';rx.lineWidth=1;for(let i=1;i<=4;i++){rx.beginPath();rx.arc(c,c,r*i/4,0,7);rx.stroke()}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;rx.beginPath();rx.moveTo(c,c);rx.lineTo(c+Math.cos(a)*r,c+Math.sin(a)*r);rx.stroke()}
 ang=(now/1000*0.9)%(Math.PI*2);const g=rx.createConicGradient?rx.createConicGradient(ang-0.9,c,c):null;
 if(g){g.addColorStop(0,'rgba(255,42,61,0)');g.addColorStop(0.14,'rgba(255,42,61,.35)');g.addColorStop(0.145,'rgba(255,42,61,0)');rx.fillStyle=g;rx.beginPath();rx.arc(c,c,r,0,7);rx.fill()}
 rx.strokeStyle='#ff2a3d';rx.lineWidth=2;rx.beginPath();rx.moveTo(c,c);rx.lineTo(c+Math.cos(ang)*r,c+Math.sin(ang)*r);rx.stroke();
 C.concat(I.filter(i=>i.addresses.length).map(i=>({id:i.name,label:'hack',size:9,kind:'fbi'}))).forEach(k=>{const h=hash(k.id+k.label),a=(h%628)/100,dist=r*(.25+((h>>8)%70)/100),x=c+Math.cos(a)*dist,y=c+Math.sin(a)*dist;
  let diff=(ang-a)%(Math.PI*2);if(diff<0)diff+=Math.PI*2;const glow=Math.max(0,1-diff/2.5);const s=3+Math.sqrt(k.size)*1.6;
  rx.fillStyle=k.kind=='fbi'?`rgba(180,107,255,${.35+glow*.65})`:`rgba(255,42,61,${.35+glow*.65})`;rx.shadowColor=rx.fillStyle;rx.shadowBlur=14*glow;rx.beginPath();rx.arc(x,y,s,0,7);rx.fill();rx.shadowBlur=0;
  if(glow>.6){rx.fillStyle='rgba(236,232,242,.8)';rx.font='10px Plex';rx.fillText(k.id+' '+k.label.slice(0,18),x+s+4,y+3)}
  pings.filter(p=>p.cid==k.id).forEach(p=>{const t=(now-p.t)/2000;if(t<1){rx.strokeStyle=`rgba(255,42,61,${1-t})`;rx.lineWidth=2;rx.beginPath();rx.arc(x,y,s+t*60,0,7);rx.stroke()}})});
 pings=pings.filter(p=>now-p.t<2000);rx.fillStyle='#fff';rx.beginPath();rx.arc(c,c,3,0,7);rx.fill();requestAnimationFrame(radar)}
requestAnimationFrame(radar);
// replay recent alerts as pings on the radar so it's alive (real alerts, cycling)
setInterval(()=>{if(A.length){const a=A[Math.floor(Math.random()*Math.min(25,A.length))];ping(a.cluster)}},2600);
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
 const t=performance.now()/1000;gx.lineWidth=1;G.links.forEach(([a,b])=>{gx.strokeStyle=`rgba(255,42,61,${.12+.1*Math.sin(t*2+b.x)})`;gx.beginPath();gx.moveTo(a.x,a.y);gx.lineTo(b.x,b.y);gx.stroke()});
 N.forEach(n=>{gx.fillStyle=n.main?(n.k=='fbi'?'#b46bff':'#ff2a3d'):col(n.s);gx.shadowColor=gx.fillStyle;gx.shadowBlur=n.main?18:6;gx.beginPath();gx.arc(n.x,n.y,n.r,0,7);gx.fill()});gx.shadowBlur=0;
 gx.font='11px Plex';gx.fillStyle='#ece8f2';N.filter(n=>n.main).forEach(n=>gx.fillText(n.id+' '+n.l.slice(0,22),n.x+n.r+4,n.y+4));requestAnimationFrame(step)}
requestAnimationFrame(step);
const pos=e=>{const b=Gc.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:p.clientX-b.left,y:p.clientY-b.top}};
Gc.addEventListener('pointerdown',e=>{const p=pos(e);drag=G.nodes.find(n=>Math.hypot(n.x-p.x,n.y-p.y)<n.r+6)});
addEventListener('pointermove',e=>{if(drag){const p=pos(e);drag.x=p.x;drag.y=p.y}});addEventListener('pointerup',()=>drag=null);
load(true);setInterval(()=>load(false),120000);
