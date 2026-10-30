const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const J=u=>fetch(u+'?t='+Date.now()).then(r=>r.json());
let A=[],C=[],K=[],M={},S=[],q='',lastVisit=+localStorage.bgLastVisit||0,shown=20,filt='all',seen=new Set(),pings=[];
const col=l=>l>=60?'#ff2a3d':l>=40?'#ff7a45':'#b46bff';
const ago=t=>{const s=(Date.now()-new Date(t))/1e3;return s<3600?Math.round(s/60)+'m ago':s<86400?Math.round(s/3600)+'h ago':Math.round(s/86400)+'d ago'};
const hash=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))|0;return Math.abs(h)};
async function load(first){
 const [m,a,c,s]=await Promise.all([J('data/meta.json'),J('data/alerts.json'),J('data/clusters.json'),J('data/scenarios.json').catch(()=>({scenarios:[]}))]);M=m;C=c.clusters;K=c.candidates;S=s.scenarios;
 const fresh=a.alerts.filter(x=>!seen.has(x.id));
 if(!first&&fresh.length){fresh.forEach(x=>{ping(x.cluster);notify(x);toast(x)})}
 a.alerts.forEach(x=>seen.add(x.id));A=a.alerts;render();
}
function render(){
 const n=M.counts;$('#stats').innerHTML=[['ADDRESSES',n.addresses],['CLUSTERS',n.clusters],['LOGGED EVENTS',A.length],['SCORED CHILDREN',n.candidates]].map(([k,v])=>`<div><b>${v.toLocaleString()}</b><span>${k}</span></div>`).join('');
 $('#tl').textContent=M.threat+'/100';setTimeout(()=>$('#tlb').style.width=M.threat+'%',200);
 $('#gen').textContent=new Date(M.generated).toLocaleString();
 $('#ticker').textContent=A.slice(0,15).map(a=>`▲ ${ago(a.time).toUpperCase()} // ${a.message}`).join('     ');
 const isNew=a=>new Date(a.time)>lastVisit&&lastVisit>0||Date.now()-new Date(a.time)<864e5;
 const last=A[0],h=last?(Date.now()-new Date(last.time))/36e5:1e9,in6=A.filter(a=>Date.now()-new Date(a.time)<6*36e5),in72=A.filter(a=>Date.now()-new Date(a.time)<72*36e5);
 const st=h<6?'a':h<72?'w':'q',wal=x=>new Set(x.map(a=>a.address)).size;
 $('#status').className='status '+st;$('#slab').textContent=st=='a'?'● ACTIVE':st=='w'?'● WATCH':'● ALL QUIET';
 $('#shead').textContent=st=='a'?`${wal(in6)} tracked wallet${wal(in6)>1?'s':''} moved funds in the last 6 hours`:st=='w'?`${wal(in72)} tracked wallet${wal(in72)>1?'s':''} moved funds in the last 3 days`:'No new movement from tracked wallets in the last 72 hours';
 $('#ssub').textContent=last?`Most recent: ${last.message}`:'';
 const mins=Math.round((Date.now()-new Date(M.generated))/6e4);$('#schk').innerHTML=`Last checked <b>${mins<1?'just now':mins<120?mins+' min ago':Math.round(mins/60)+' h ago'}</b>`;
 $('#slast').innerHTML=last?`Last real movement <b>${ago(last.time)}</b>`:'';
 const nw=A.filter(isNew);$('#newnote').textContent=nw.length?`${nw.length} new since your last visit or in the last 24h.`:`Nothing new since your last visit. Showing the latest ${Math.min(5,A.length)} anyway.`;
 const card=a=>`<article class="d${isNew(a)?' new':''}" style="--c:${col(a.level)}"><div class="dh">${isNew(a)?'<span class="nb">NEW</span>':''}<span class="tag" style="color:${col(a.level)}">INTERCEPT · ${a.chain}</span><span>${esc(a.cluster)}</span><span>${new Date(a.time).toUTCString().slice(5,22)} UTC · ${ago(a.time)}</span><span title="Pattern-match score, not proof">SCORE ${a.level}/100</span></div><p>${esc(a.message)}</p><div class="dl"><a href="${esc(a.tx_url)}" target="_blank" rel="noopener">tx ↗</a><a href="${esc(a.address_url)}" target="_blank" rel="noopener">address ↗</a>${a.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">source: ${esc(s.name)} ↗</a>`).join('')}</div></article>`;
 $('#alerts').innerHTML=(nw.length?nw.slice(0,8):A.slice(0,5)).map(card).join('');
 $('#scen').innerHTML=S.slice(0,6).map(c=>`<div class="sc"><div class="dh"><span class="tag">${esc(c.cluster)} · ${c.chain}</span><span>${new Date(c.end).toDateString().slice(4)} · ${ago(c.end)}</span><span class="conf ${c.confidence_label}" title="Highest pattern-match score in this storyline">${c.confidence_label.toUpperCase()} · ${c.confidence}/100</span></div><h3>${esc(c.title)}</h3><div class="lb">WHAT HAPPENED</div><p>${esc(c.what)}</p><div class="lb">WHY IT MATTERS</div><p>${esc(c.why)}</p><div class="dl">${c.tx_links.map((u,i)=>`<a href="${esc(u)}" target="_blank" rel="noopener">tx ${i+1} ↗</a>`).join('')}${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">source: ${esc(s.name)} ↗</a>`).join('')}</div></div>`).join('')||'<p class="tiny mono">No storylines yet.</p>';
 const L=A.filter(a=>(filt=='all'||a.chain==filt||(filt=='hi'&&a.level>=50))&&(!q||(a.message+a.address+a.cluster).toLowerCase().includes(q)));
 $('#log').innerHTML='<div class="tr th"><span>WHEN (UTC)</span><span>CHAIN</span><span>SCORE</span><span>WHAT HAPPENED</span><span>LINKS</span></div>'+L.slice(0,shown).map(a=>`<div class="tr"><span class="mono">${a.time.slice(0,16).replace('T',' ')}</span><span class="mono hm">${a.chain}</span><span class="sc0 hm" style="color:${col(a.level)}">${a.level}</span><span>${esc(a.message)}</span><span><a href="${esc(a.tx_url)}" target="_blank" rel="noopener">tx</a> · <a href="${esc(a.sources[0].url)}" target="_blank" rel="noopener">src</a></span></div>`).join('');
 $('#more').style.display=L.length>shown?'':'none';
 $('#clist').innerHTML=C.map(c=>`<div class="cl"><b>${c.id} · ${esc(c.label)}</b><br>${c.size} addr · ${c.children} children · ${c.chains.join('/')} · bal ${c.balance.ETH} ETH / ${c.balance.BTC} BTC<br>${c.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)} ↗</a>`).join(' ')}</div>`).join('');
 $('#cands').innerHTML=K.slice(0,12).map(k=>`<div class="cd"><span class="s">${k.score}</span><b>${k.chain} · ${k.cluster}</b><br><a href="${k.chain=='BTC'?'https://mempool.space/address/':'https://eth.blockscout.com/address/'}${esc(k.address)}" target="_blank" rel="noopener">${esc(k.address)}</a><ul>${k.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><a href="${esc(k.via[0].url)}" target="_blank" rel="noopener">first link tx ↗</a></div>`).join('');
 $('#srcs').innerHTML=M.sources.map(s=>`<div class="sr"><b>${esc(s.name)}</b><br><span class="${s.ok?'ok':'bad'}">${s.ok?'● REACHED':'● UNREACHABLE — excluded'}</span>${s.count!=null?` · ${s.count} items`:''}${s.failed?` · ${s.failed} failed`:''}<br><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url)}</a></div>`).join('');
 if(!G.nodes.length)buildGraph();
}
document.querySelectorAll('.chip').forEach(b=>b.onclick=()=>{document.querySelectorAll('.chip').forEach(x=>x.classList.remove('on'));b.classList.add('on');filt=b.dataset.f;shown=20;render()});
$('#q').oninput=e=>{q=e.target.value.toLowerCase();shown=20;render()};
addEventListener('beforeunload',()=>localStorage.bgLastVisit=Date.now());
function toast(a){const t=document.createElement('div');t.className='toast';t.innerHTML=`<b>NEW ALERT</b>${esc(a.message)}`;$('#toasts').append(t);setTimeout(()=>t.remove(),9000)}
$('#more').onclick=()=>{shown+=20;render()};
$('#notify').onclick=async()=>{if(!('Notification'in window))return alert('Notifications not supported');const p=await Notification.requestPermission();$('#notify').textContent=p=='granted'?'Alerts on':'Alerts blocked'};
function notify(a){if(window.Notification&&Notification.permission=='granted')new Notification('BLACKGLASS intercept',{body:a.message,icon:'logo.svg'})}
// radar
const R=$('#radar'),rx=R.getContext('2d');let ang=0;
function ping(cid){pings.push({cid,t:performance.now()})}
function radar(now){const d=devicePixelRatio,w=R.clientWidth;R.width=R.height=w*d;rx.setTransform(d,0,0,d,0,0);const c=w/2,r=c*.9;rx.clearRect(0,0,w,w);
 rx.strokeStyle='rgba(255,42,61,.22)';rx.lineWidth=1;for(let i=1;i<=4;i++){rx.beginPath();rx.arc(c,c,r*i/4,0,7);rx.stroke()}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;rx.beginPath();rx.moveTo(c,c);rx.lineTo(c+Math.cos(a)*r,c+Math.sin(a)*r);rx.stroke()}
 ang=(now/1000*0.9)%(Math.PI*2);const g=rx.createConicGradient?rx.createConicGradient(ang-0.9,c,c):null;
 if(g){g.addColorStop(0,'rgba(255,42,61,0)');g.addColorStop(0.14,'rgba(255,42,61,.35)');g.addColorStop(0.145,'rgba(255,42,61,0)');rx.fillStyle=g;rx.beginPath();rx.arc(c,c,r,0,7);rx.fill()}
 rx.strokeStyle='#ff2a3d';rx.lineWidth=2;rx.beginPath();rx.moveTo(c,c);rx.lineTo(c+Math.cos(ang)*r,c+Math.sin(ang)*r);rx.stroke();
 C.forEach(k=>{const h=hash(k.id+k.label),a=(h%628)/100,dist=r*(.25+((h>>8)%70)/100),x=c+Math.cos(a)*dist,y=c+Math.sin(a)*dist;
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
