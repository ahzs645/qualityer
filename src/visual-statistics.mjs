import {eligibleAnalyticalCodings} from './analytical-codings.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=(value,places=4)=>value==null?null:Number(value.toFixed(places));
function merge(spans){const out=[];for(const [a,b] of spans.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).sort((x,y)=>x[0]-y[0]||x[1]-y[1])){const last=out.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else out.push([a,b]);}return out;}
const total=spans=>spans.reduce((n,[a,b])=>n+b-a,0);
function intersection(left,right){let i=0,j=0,n=0;while(i<left.length&&j<right.length){const a=Math.max(left[i][0],right[j][0]),b=Math.min(left[i][1],right[j][1]);if(b>a)n+=b-a;if(left[i][1]<right[j][1])i++;else j++;}return n;}

/** Text co-occurrence across directly applied codes. Counts distinct overlap intervals; Jaccard unions each code's codepoints per source. */
export function cooccurrenceMatrix(state,{source='',coder='',limit=30}={}){
 const active=eligibleAnalyticalCodings(state).filter(c=>!c.deletedAt&&c.status!=='needs_review'&&(!c.kind||c.kind==='text')&&(!source||c.documentId===source)&&(!coder||c.coder===coder));
 const codes=state.codes.filter(code=>active.some(c=>c.codeId===code.id)).slice(0,limit);
 const byCode=new Map(codes.map(code=>[code.id,active.filter(c=>c.codeId===code.id)]));
 const spans=new Map(codes.map(code=>{const docs=new Map();for(const c of byCode.get(code.id)){if(!docs.has(c.documentId))docs.set(c.documentId,[]);docs.get(c.documentId).push([c.start,c.end]);}for(const [d,s] of docs)docs.set(d,merge(s));return [code.id,docs];}));
 const cells=[];
 for(const a of codes)for(const b of codes){
  if(a.id===b.id){cells.push({a:a.id,b:b.id,diagonal:true,count:null,jaccard:null,shared:0,union:0,applications:[]});continue;}
  const keys=new Set(),apps=new Map();
  for(const x of byCode.get(a.id))for(const y of byCode.get(b.id))if(x.id!==y.id&&x.documentId===y.documentId&&Math.max(x.start,y.start)<Math.min(x.end,y.end)){keys.add([x.documentId,Math.max(x.start,y.start),Math.min(x.end,y.end)].join(':'));apps.set(x.id,x);apps.set(y.id,y);}
  let shared=0,union=0;const left=spans.get(a.id),right=spans.get(b.id);
  for(const doc of new Set([...left.keys(),...right.keys()])){const l=left.get(doc)||[],r=right.get(doc)||[],both=intersection(l,r);shared+=both;union+=total(l)+total(r)-both;}
  cells.push({a:a.id,b:b.id,diagonal:false,count:keys.size,jaccard:union?shared/union:null,shared,union,applications:[...apps.values()]});
 }
 return {codes,cells,cell:(a,b)=>cells.find(c=>c.a===a&&c.b===b),applications:active.length};
}
export function cooccurrenceRows(matrix,{measure='count',scope=''}={}){
 const label=measure==='jaccard'?'Jaccard (shared / union codepoints)':'Distinct overlap intervals';
 return [['Scope',scope],['Measure',label],['Unit','Directly applied text codes; overlapping ranges on the same source and revision. Descriptive only.'],[],['Code',...matrix.codes.map(c=>c.name)],...matrix.codes.map(a=>[a.name,...matrix.codes.map(b=>{const cell=matrix.cell(a.id,b.id);return cell.diagonal?'':measure==='jaccard'?(cell.jaccard==null?'N/A':round(cell.jaccard)):cell.count;})])];
}

/** Linear-interpolated quartiles (the default used by common box-plot tools). */
export function boxStats(values){
 const v=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!v.length)return null;
 const q=p=>{const i=(v.length-1)*p,lo=Math.floor(i),hi=Math.ceil(i);return v[lo]+(v[hi]-v[lo])*(i-lo);};
 const q1=q(.25),q3=q(.75),iqr=q3-q1,lowFence=q1-1.5*iqr,highFence=q3+1.5*iqr,inside=v.filter(x=>x>=lowFence&&x<=highFence);
 return {n:v.length,min:v[0],q1,median:q(.5),q3,max:v.at(-1),mean:v.reduce((a,b)=>a+b,0)/v.length,whiskerLow:inside[0],whiskerHigh:inside.at(-1),outliers:v.filter(x=>x<lowFence||x>highFence)};
}
const unitOf=c=>c.kind==='media'?'seconds':!c.kind||c.kind==='text'?'codepoints':null;
const span=c=>c.kind==='media'?[c.timeStart,c.timeEnd]:[c.start,c.end];
/** Gap between two applications in their native unit; zero when they overlap or touch. */
export function applicationGap(a,b){const [p,q]=span(a),[r,t]=span(b);return Math.max(0,Math.max(p,r)-Math.min(q,t));}
/** Distance distributions per related code pair, never mixing codepoints with seconds. Pairs are dependent observations. */
export function relationDistances(relations){
 const out=[];
 for(const r of relations){const groups=new Map();for(const [a,b] of r.pairs){const unit=unitOf(a);if(!unit||unit!==unitOf(b))continue;if(!groups.has(unit))groups.set(unit,[]);groups.get(unit).push(applicationGap(a,b));}
  for(const [unit,values] of groups)out.push({a:r.a,b:r.b,unit,values,stats:boxStats(values),pairs:r.pairs.filter(([a])=>unitOf(a)===unit)});}
 return out;
}
export function relationDistanceRows(rows,{scope='',operator=''}={}){
 return [['Scope',scope],['Relationship',operator],['Unit of observation','Application pair (pairs sharing an application are dependent; no significance test implied)'],[],['Code A','Code B','Unit','Pairs','Min','Q1','Median','Q3','Max','Mean','Outliers'],...rows.map(r=>[r.a.name,r.b.name,r.unit,r.stats.n,round(r.stats.min,2),round(r.stats.q1,2),round(r.stats.median,2),round(r.stats.q3,2),round(r.stats.max,2),round(r.stats.mean,2),r.stats.outliers.length])];
}
export function relationDistanceSVG(rows,{scope='',operator=''}={}){
 const width=900,left=300,right=40,row=34,top=70,height=top+rows.length*row+50,units=[...new Set(rows.map(r=>r.unit))];
 const max=Math.max(1,...rows.map(r=>r.stats.max)),x=v=>left+(v/max)*(width-left-right);
 const body=rows.map((r,i)=>{const y=top+i*row+row/2,s=r.stats;return `<g><title>${esc(r.a.name+' – '+r.b.name)}: median ${round(s.median,2)} ${r.unit}, n=${s.n}</title><text x="${left-10}" y="${y+4}" text-anchor="end" font-size="12">${esc((r.a.name+' – '+r.b.name).slice(0,46))}</text><line x1="${x(s.whiskerLow)}" x2="${x(s.whiskerHigh)}" y1="${y}" y2="${y}" stroke="#53616b"/><line x1="${x(s.whiskerLow)}" x2="${x(s.whiskerLow)}" y1="${y-7}" y2="${y+7}" stroke="#53616b"/><line x1="${x(s.whiskerHigh)}" x2="${x(s.whiskerHigh)}" y1="${y-7}" y2="${y+7}" stroke="#53616b"/><rect x="${x(s.q1)}" y="${y-10}" width="${Math.max(1,x(s.q3)-x(s.q1))}" height="20" fill="#cfe1ea" stroke="#447e96"/><line x1="${x(s.median)}" x2="${x(s.median)}" y1="${y-10}" y2="${y+10}" stroke="#1f4d63" stroke-width="2"/>${s.outliers.map(o=>`<circle cx="${x(o)}" cy="${y}" r="3" fill="none" stroke="#a15e71"/>`).join('')}</g>`;}).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="20" y="26" font-size="16" font-weight="600">Distance between related code applications</text><text x="20" y="48" font-size="11" fill="#53616b">${esc([scope,operator&&'Relationship: '+operator,'Unit: '+units.join(' / '),'Each box summarizes dependent application pairs; axis 0–'+round(max,2)].filter(Boolean).join(' · '))}</text>${units.length>1?`<text x="20" y="${height-12}" font-size="11" fill="#a15e71">Mixed units share this axis only for layout; compare rows within one unit.</text>`:''}${body}</svg>`;
}

/** Distribution of one case or source attribute: categories for text/boolean values, Sturges histogram for all-numeric values. */
export function attributeDistribution(state,{target='cases',attribute}={}){
 const items=(target==='sources'?state.documents.filter(d=>!d.deletedAt&&d.sourceRole!=='reference'):state.cases||[]).map(item=>({item,value:item.attributes?.[attribute]}));
 const present=items.filter(x=>x.value!==undefined&&x.value!==null&&String(x.value).trim()!=='' ),missing=items.length-present.length;
 const numeric=present.length>0&&present.every(x=>typeof x.value==='number'||(typeof x.value==='string'&&x.value.trim()!==''&&Number.isFinite(Number(x.value))));
 if(!numeric){const groups=new Map();for(const x of present){const key=String(x.value);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(x.item);}
  return {kind:'categorical',attribute,target,total:items.length,missing,bins:[...groups].map(([label,members])=>({label,count:members.length,members})).sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label))};}
 const values=present.map(x=>({...x,n:Number(x.value)})),min=Math.min(...values.map(x=>x.n)),max=Math.max(...values.map(x=>x.n));
 const count=min===max?1:Math.ceil(Math.log2(values.length)+1),width=(max-min)/count||1;
 const bins=Array.from({length:count},(_,i)=>({from:min+i*width,to:i===count-1?max:min+(i+1)*width,members:[]}));
 for(const x of values)bins[Math.min(count-1,Math.floor((x.n-min)/width))].members.push(x.item);
 return {kind:'numeric',attribute,target,total:items.length,missing,stats:boxStats(values.map(x=>x.n)),bins:bins.map(b=>({...b,label:min===max?String(min):round(b.from,2)+' – '+round(b.to,2),count:b.members.length}))};
}
export function attributeAttributes(state,target='cases'){return [...new Set((target==='sources'?state.documents.filter(d=>!d.deletedAt&&d.sourceRole!=='reference'):state.cases||[]).flatMap(x=>Object.keys(x.attributes||{})))].sort((a,b)=>a.localeCompare(b));}
export function attributeDistributionRows(dist){return [['Attribute',dist.attribute],['Described',dist.target==='sources'?'Sources':'Cases'],['Missing values',dist.missing],[],[dist.kind==='numeric'?'Range':'Value','Count','Members'],...dist.bins.map(b=>[b.label,b.count,b.members.map(m=>m.name).join('; ')])];}
