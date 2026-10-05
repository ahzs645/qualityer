import {pointLength,pointSlice} from './text-points.mjs';
// Proposed Research Weave comparison module, independently implemented from
// interval mathematics. Requal source inspection motivates the Jaccard view;
// its R implementation is not copied, and its segment metric is not claimed.
const intersects=(a,b)=>Math.max(a[0],b[0])<Math.min(a[1],b[1]);

export function mergeIntervals(spans){
  const out=[];
  for(const [start,end] of spans.filter(([a,b])=>Number.isFinite(a)&&Number.isFinite(b)&&b>a).map(x=>[...x]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])){
    const prior=out.at(-1);
    if(prior&&start<=prior[1])prior[1]=Math.max(prior[1],end);
    else out.push([start,end]);
  }
  return out;
}
const length=spans=>spans.reduce((n,[a,b])=>n+b-a,0);
function intersectionLength(a,b){
  let i=0,j=0,total=0;
  while(i<a.length&&j<b.length){
    total+=Math.max(0,Math.min(a[i][1],b[j][1])-Math.max(a[i][0],b[j][0]));
    if(a[i][1]<b[j][1])i++;else j++;
  }
  return total;
}
function eligibleIntervals(size,flags){
  // Bad consent boundaries cannot safely describe an eligible corpus.
  if(flags.some(f=>!Number.isInteger(f.start)||!Number.isInteger(f.end)||f.start<0||f.end<=f.start||f.end>size))return [];
  const out=[];let start=0;
  for(const [a,b] of mergeIntervals(flags.map(f=>[f.start,f.end]))){if(start<a)out.push([start,a]);start=b;}
  if(start<size)out.push([start,size]);return out;
}

export function comparisonScope(state,filters={}){
  const sourceId=filters.sourceId||filters.documentId||'',status=filters.status||'all';
  const documents=(state.documents||[]).filter(d=>d.sourceRole!=='reference'&&(!sourceId||d.id===sourceId));
  const points=new Map(documents.map(d=>[d.id,pointLength(d.text||'')]));
  const eligible=new Map(documents.map(d=>[d.id,eligibleIntervals(points.get(d.id),d.reviewFlags||[])]));
  const docs=new Map(documents.map(d=>[d.id,d]));
  const codings=(state.codings||[]).filter(c=>{
    const d=docs.get(c.documentId),p=points.get(c.documentId);
    if(!d||c.deletedAt||c.status==='needs_review'||c.anchorStatus==='needs_review'||(c.kind&&c.kind!=='text')||(!['all',''].includes(status)&&c.status!==status)||(filters.codeId&&c.codeId!==filters.codeId))return false;
    if(!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||c.end>p||typeof c.text!=='string'||pointSlice(d.text||'',c.start,c.end)!==c.text)return false;
    if(c.sourceRevision!=null&&c.sourceRevision!==(d.revision||1))return false;
    // Withhold the complete coding when any of it intersects consent review;
    // do not quietly rewrite a researcher's decision by clipping its quote.
    return eligible.get(d.id).some(([a,b])=>c.start>=a&&c.end<=b);
  });
  return {documents,codings,eligible,totalCharacters:[...eligible.values()].reduce((n,v)=>n+length(v),0),filters:{sourceId,codeId:filters.codeId||'',status},method:'Current exact text anchors only; reference sources, removed/media/stale coding and coding touching consent-review spans are excluded. The character corpus also excludes consent-review characters.'};
}

function exactAgreement(codings,a,b){
  const groups=new Map();
  for(const c of codings.filter(c=>c.coder===a||c.coder===b)){
    const key=JSON.stringify([c.documentId,c.start,c.end]);
    if(!groups.has(key))groups.set(key,[new Set(),new Set()]);
    groups.get(key)[c.coder===a?0:1].add(c.codeId);
  }
  const agreed=[...groups.values()].filter(([x,y])=>x.size===y.size&&[...x].every(id=>y.has(id))).length;
  return {units:groups.size,agreed,percent:groups.size?100*agreed/groups.size:null,method:'Exact-span code-set agreement. Different boundaries and passages coded by only one researcher are disagreements.'};
}

export function compareCodingPair(state,a,b,filters={}){
  if(!a||!b||a===b)throw Error('Choose two distinct coders.');
  const scope=comparisonScope(state,filters),codings=scope.codings.filter(c=>c.coder===a||c.coder===b);
  const ids=filters.codeId?[filters.codeId]:[...new Set(codings.map(c=>c.codeId))];
  const codes=new Map((state.codes||[]).map(c=>[c.id,c]));
  const byCode=ids.map(codeId=>{
    let left=0,right=0,intersection=0;
    for(const d of scope.documents){
      const spans=coder=>mergeIntervals(codings.filter(c=>c.documentId===d.id&&c.codeId===codeId&&c.coder===coder).map(c=>[c.start,c.end]));
      const x=spans(a),y=spans(b);left+=length(x);right+=length(y);intersection+=intersectionLength(x,y);
    }
    const union=left+right-intersection,n=scope.totalCharacters,n11=intersection,n10=left-intersection,n01=right-intersection,n00=n-union;
    const observed=n?(n11+n00)/n:null,expected=n?((n11+n10)*(n11+n01)+(n01+n00)*(n10+n00))/(n*n):null;
    return {codeId,code:codes.get(codeId)?.name||codeId,leftCharacters:left,rightCharacters:right,intersection,union,jaccard:union?intersection/union:null,kappa:n&&expected!==1?(observed-expected)/(1-expected):null,n,n11,n10,n01,n00,observed,expected};
  });
  const intersection=byCode.reduce((n,r)=>n+r.intersection,0),union=byCode.reduce((n,r)=>n+r.union,0);
  return {a,b,scope,exact:exactAgreement(codings,a,b),byCode,intersection,union,jaccard:union?intersection/union:null,method:'Interval-union Jaccard = intersection / union of each coder’s selected-code coverage. Duplicate/overlapping coding by one coder counts once. Code and source identities stay separate; total weights each code by its coded union. Uncoded characters do not enter Jaccard. Per-code Cohen’s kappa includes every eligible Unicode codepoint, including uncoded characters. Neither measure establishes interview-level agreement, blind independence or consensus.'};
}

export function pairwiseComparisons(state,coders,filters={}){
  const ids=[...new Set(coders.filter(Boolean))],out=[];
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++)out.push(compareCodingPair(state,ids[i],ids[j],filters));
  return out;
}

export function comparisonExportRows(results){
  const out=[['First coder','Second coder','Source scope','Decision scope','Code','Code ID','Left coded codepoints','Right coded codepoints','Intersection codepoints','Union codepoints','Jaccard','Eligible corpus codepoints','Cohen kappa','Both coded','Left only','Right only','Neither coded','Exact units','Exact matches','Exact agreement percent','Method']];
  for(const r of results)for(const c of r.byCode)out.push([r.a,r.b,r.scope.filters.sourceId||'All eligible interview sources',r.scope.filters.status,c.code,c.codeId,c.leftCharacters,c.rightCharacters,c.intersection,c.union,c.jaccard,c.n,c.kappa,c.n11,c.n10,c.n01,c.n00,r.exact.units,r.exact.agreed,r.exact.percent,r.method+' '+r.scope.method]);
  return out;
}
