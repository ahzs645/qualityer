// Fragment query algebra. Text positions are Unicode codepoints; media positions are seconds.
import {pointLength,pointSlice} from './text-points.mjs';
const points=t=>Array.from(t||'');
const overlaps=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1]);
const range=c=>c.kind==='media'?[c.timeStart,c.timeEnd]:[c.start,c.end];
const revision=d=>d.revision??1;
const textAt=(d,a,b)=>pointSlice(d.text,a,b);
export function resultQuerySpec(spec={}){
 const mode=spec.mode==='literal'?'literal':'intervals';
 const kind=['all','text','media'].includes(spec.kind)?spec.kind:'all';
 return {mode,kind,codeA:String(spec.codeA||''),codeB:String(spec.codeB||''),operator:['and','or','not','near'].includes(spec.operator)?spec.operator:'and',near:Math.max(0,Math.min(100000,Number(spec.near)||0)),source:String(spec.source||spec.sourceId||''),caseId:String(spec.caseId||''),coder:String(spec.coder||''),status:['all','coded','accepted','provisional','flagged'].includes(spec.status)?spec.status:'all',text:String(spec.text||''),caseSensitive:spec.caseSensitive===true,includeDescendants:spec.includeDescendants!==false};
}
function subtree(s,id,descend){if(!id)return null;const ids=new Set([id]);if(descend){let size;do{size=ids.size;for(const c of s.codes||[])if(ids.has(c.parentId))ids.add(c.id);}while(size!==ids.size);}return ids;}
function sourceAllowed(d,f){return d.sourceRole!=='reference'&&!d.deletedAt&&(!f.source||d.id===f.source);}
function currentText(d,a){return a.anchorStatus!=='needs_review'&&(a.sourceRevision==null||a.sourceRevision===revision(d))&&Number.isInteger(a.start)&&Number.isInteger(a.end)&&a.start>=0&&a.end>a.start&&a.end<=pointLength(d.text)&&textAt(d,a.start,a.end)===a.text;}
function consentBlocked(d,c){if(!d.reviewFlags?.length)return false;if(c.kind!=='media')return d.reviewFlags.some(f=>overlaps([f.start,f.end],range(c)));const flags=d.reviewFlags;const relevant=(d.turns||[]).filter(t=>flags.some(f=>overlaps([f.start,f.end],[t.start,t.end])));if(d.alignment?.status!=='matched'||d.alignment?.recordingKey!==d.mediaKey||!relevant.length||relevant.some(t=>t.anchorStatus==='needs_review'||t.timingStatus==='needs_review'||!Number.isFinite(t.timeStart)||!Number.isFinite(t.timeEnd)))return true;return relevant.some(t=>overlaps([t.timeStart,t.timeEnd],range(c)));}
function caseRanges(s,d,f){if(!f.caseId)return null;const k=(s.cases||[]).find(k=>k.id===f.caseId);if(!k)return [];if(k.documentIds?.includes(d.id))return null;return (k.passages||[]).filter(a=>a.documentId===d.id&&currentText(d,a)).map(a=>[a.start,a.end]);}
function provenance(c){return {codingId:c.id,codeId:c.codeId,coder:c.coder,status:c.status,sourceRevision:c.sourceRevision??null,kind:c.kind||'text',...(c.kind==='media'?{recordingKey:c.recordingKey,timeStart:c.timeStart,timeEnd:c.timeEnd}:{start:c.start,end:c.end})};}
const unique=refs=>[...new Map(refs.map(r=>[r.codingId,r])).values()];
function fragment(d,kind,a,b,refs,related,operation){const base={documentId:d.id,sourceRevision:revision(d),kind:kind==='media'?'media':undefined,units:kind==='media'?'seconds':'unicode-codepoints',operation,provenance:unique(refs),relatedProvenance:unique(related),origin:'query-fragment',status:'coded'};if(kind==='media')Object.assign(base,{recordingKey:d.mediaKey,timeStart:a,timeEnd:b,text:`Recording range ${a}–${b} seconds`});else Object.assign(base,{start:a,end:b,text:textAt(d,a,b)});base.queryResultId=resultIdentity(base);return base;}
export function resultIdentity(r){return JSON.stringify([r.documentId,r.sourceRevision,r.kind||'text',r.recordingKey||null,r.kind==='media'?r.timeStart:r.start,r.kind==='media'?r.timeEnd:r.end,r.operation,String(r.text||''),unique(r.provenance||[]).sort((a,b)=>String(a.codingId).localeCompare(String(b.codingId))),unique(r.relatedProvenance||[]).sort((a,b)=>String(a.codingId).localeCompare(String(b.codingId)))]);}
function merge(spans){const out=[];for(const pair of spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const last=out.at(-1);if(last&&pair[0]<=last[1])last[1]=Math.max(last[1],pair[1]);else out.push([...pair]);}return out;}
export function intervalQuery(s,spec={}){
 const f=resultQuerySpec(spec),aIds=subtree(s,f.codeA,f.includeDescendants),bIds=subtree(s,f.codeB,f.includeDescendants),groups=new Map();
 for(const d of s.documents||[]){if(!sourceAllowed(d,f))continue;const cases=caseRanges(s,d,f);if(cases?.length===0)continue;
 for(const c of s.codings||[]){if(c.documentId!==d.id||c.deletedAt||c.status==='needs_review'||c.anchorStatus==='needs_review'||(f.coder&&c.coder!==f.coder)||(f.status!=='all'&&c.status!==f.status)||(c.sourceRevision!=null&&c.sourceRevision!==revision(d)))continue;
 const kind=c.kind||'text';if(!['text','media'].includes(kind)||(f.kind!=='all'&&f.kind!==kind))continue;const r=range(c);if(!r.every(Number.isFinite)||r[0]<0||r[1]<=r[0])continue;
 if(kind==='text'&&!currentText(d,c))continue;if(kind==='media'&&(!d.mediaKey||c.recordingKey!==d.mediaKey))continue;if(consentBlocked(d,c))continue;
 if(f.text&&!(f.caseSensitive?String(c.text||'').includes(f.text):String(c.text||'').toLowerCase().includes(f.text.toLowerCase())))continue;
 // Passage cases restrict text intervals exactly. Media membership requires a whole-source case link.
 if(kind==='media'&&cases!==null)continue;const spans=cases?cases.filter(k=>overlaps(r,k)).map(k=>[Math.max(r[0],k[0]),Math.min(r[1],k[1])]):[r];
 const key=JSON.stringify([d.id,revision(d),kind,kind==='media'?d.mediaKey:null]);if(!groups.has(key))groups.set(key,{d,kind,left:[],right:[]});const g=groups.get(key);
 for(const [start,end]of spans){const item={start,end,ref:provenance(c)};if(!aIds||aIds.has(c.codeId))g.left.push(item);if(bIds?.has(c.codeId))g.right.push(item);}
 }}
 const out=[];for(const {d,kind,left,right}of groups.values()){
 const op=!f.codeB?'single':f.operator;
 if(op==='near'){const matched=new Map();for(const a of left){const rs=right.filter(b=>Math.max(0,Math.max(a.start,b.start)-Math.min(a.end,b.end))<=f.near);if(!rs.length)continue;const key=[a.start,a.end].join(':');if(!matched.has(key))matched.set(key,{a,refs:[],related:[]});const m=matched.get(key);m.refs.push(a.ref);m.related.push(...rs.map(b=>b.ref));}for(const {a,refs,related}of matched.values())out.push(fragment(d,kind,a.start,a.end,refs,related,op));continue;}
 const bounds=[...new Set([...left,...right].flatMap(x=>[x.start,x.end]))].sort((a,b)=>a-b),spans=[];
 for(let i=0;i<bounds.length-1;i++){const a=bounds[i],b=bounds[i+1],hasA=left.some(c=>c.start<=a&&c.end>=b),hasB=right.some(c=>c.start<=a&&c.end>=b);if(op==='single'?hasA:op==='or'?hasA||hasB:op==='not'?hasA&&!hasB:hasA&&hasB)spans.push([a,b]);}
 for(const [a,b]of merge(spans)){const l=left.filter(c=>overlaps([a,b],[c.start,c.end])),r=right.filter(c=>overlaps([a,b],[c.start,c.end]));const refs=(op==='and'||op==='or'?[...l,...r]:l).map(c=>c.ref),related=op==='not'?right.filter(c=>l.some(x=>overlaps([x.start,x.end],[c.start,c.end]))).map(c=>c.ref):[];out.push(fragment(d,kind,a,b,refs,related,op));}
 }return out;
}
// Fold each source codepoint with an index map. Expanding lowercase mappings never shift anchors.
function folded(text,caseSensitive){const chars=points(text),starts=[],ends=[],boundaries=new Set([0]);let value='';for(let i=0;i<chars.length;i++){const part=caseSensitive?chars[i]:chars[i].toLowerCase();for(let j=0;j<part.length;j++){starts.push(i);ends.push(i+1);}value+=part;boundaries.add(value.length);}return {value,starts,ends,boundaries};}
export function literalCorpusSearch(s,spec={}){
 const f=resultQuerySpec({...spec,mode:'literal'});if(!f.text)return [];const needle=f.caseSensitive?f.text:f.text.toLowerCase(),hits=[];
 for(const d of s.documents||[]){if(!sourceAllowed(d,f))continue;const cases=caseRanges(s,d,f);if(cases?.length===0)continue;const index=folded(d.text,f.caseSensitive),seen=new Set();let at=0;
 while((at=index.value.indexOf(needle,at))!==-1){const stop=at+needle.length,start=index.starts[at],end=index.ends[stop-1];at++;if(!index.boundaries.has(at-1)||!index.boundaries.has(stop)||seen.has(start+':'+end))continue;seen.add(start+':'+end);if(cases&&!cases.some(r=>start>=r[0]&&end<=r[1]))continue;if((d.reviewFlags||[]).some(flag=>overlaps([start,end],[flag.start,flag.end])))continue;
 const c={documentId:d.id,sourceRevision:revision(d),start,end,text:textAt(d,start,end),operation:'literal',origin:'literal-search',units:'unicode-codepoints',provenance:[],relatedProvenance:[],status:'coded'};
 const turns=(d.turns||[]).filter(t=>t.anchorStatus!=='needs_review'&&t.timingStatus!=='needs_review'&&overlaps([start,end],[t.start,t.end]));c.suppliedTurnBounds=turns.map(t=>({start:t.start,end:t.end,timeStart:Number.isFinite(t.timeStart)?t.timeStart:null,timeEnd:Number.isFinite(t.timeEnd)?t.timeEnd:null}));c.timingBasis='Supplied turn bounds only; no interpolation';c.timeStart=null;c.timeEnd=null;c.recordingKey=d.alignment?.status==='matched'&&d.alignment.recordingKey===d.mediaKey?d.mediaKey:null;c.queryResultId=resultIdentity(c);hits.push(c);
 }}return hits;
}
export function executeResultQuery(s,spec){return spec?.mode==='literal'?literalCorpusSearch(s,spec):intervalQuery(s,spec);}
