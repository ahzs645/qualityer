import {caseIncludes} from './research-operations.mjs';
import {pointLength} from './text-points.mjs';

const spanKey=c=>[c.documentId,c.start,c.end].join(':');
function unionLength(list){const intervals=list.map(c=>[c.start,c.end]).sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;for(const [a,b] of intervals){if(b<=end)continue;total+=b-Math.max(a,end);end=b;}return total;}
const unionBySource=list=>{const by=new Map();for(const c of list){if(!by.has(c.documentId))by.set(c.documentId,[]);by.get(c.documentId).push(c);}return [...by.values()].reduce((n,l)=>n+unionLength(l),0);};
const isText=c=>!c.kind||c.kind==='text';

/** One row per code over the already-scoped text applications. Counts describe coding choices, not prevalence. */
export function codeSummary(s,rows){
 return s.codes.filter(c=>c.codable!==false).map(code=>{
  const own=rows.filter(r=>r.codeId===code.id&&isText(r)),spans=new Map(own.map(r=>[spanKey(r),r])),
   cases=(s.cases||[]).filter(k=>own.some(r=>caseIncludes(k,r)));
  const codepoints=unionBySource(own),excerpts=spans.size;
  return {code,applications:own.length,excerpts,sources:new Set(own.map(r=>r.documentId)).size,cases:cases.length,
   coders:[...new Set(own.map(r=>r.coder).filter(Boolean))].sort(),codepoints,
   meanCodepoints:excerpts?codepoints/excerpts:0,
   accepted:own.filter(r=>r.status==='accepted').length,provisional:own.filter(r=>r.status==='provisional').length,flagged:own.filter(r=>r.status==='flagged').length};
 });
}

/** One row per interview source: how much of its eligible text carries coding. */
export function sourceSummary(s,rows){
 return s.documents.filter(d=>d.sourceRole!=='reference').map(d=>{
  const own=rows.filter(r=>r.documentId===d.id&&isText(r)),total=pointLength(d.text),covered=unionLength(own);
  return {source:d,applications:own.length,excerpts:new Set(own.map(spanKey)).size,codes:new Set(own.map(r=>r.codeId)).size,
   coders:[...new Set(own.map(r=>r.coder).filter(Boolean))].sort(),codepoints:covered,total,percent:total?100*covered/total:0};
 });
}

/** Code × case (or source) grid whose cells hold the distinct coded quotations. */
export function codeTextGrid(s,rows,{group='case',hideEmpty=true}={}){
 const text=rows.filter(isText),columns=group==='source'?s.documents.filter(d=>d.sourceRole!=='reference').map(d=>({id:d.id,name:d.name,test:r=>r.documentId===d.id})):(s.cases||[]).map(k=>({id:k.id,name:k.name,test:r=>caseIncludes(k,r)}));
 let gridRows=s.codes.filter(c=>c.codable!==false).map(code=>({code,cells:columns.map(col=>{const seen=new Map();for(const r of text)if(r.codeId===code.id&&col.test(r)){const key=spanKey(r);if(!seen.has(key))seen.set(key,{key,documentId:r.documentId,start:r.start,end:r.end,text:r.text||'',coders:new Set()});seen.get(key).coders.add(r.coder);}
  return {column:col,quotations:[...seen.values()].map(q=>({...q,coders:[...q.coders].filter(Boolean).sort()})).sort((a,b)=>a.documentId.localeCompare(b.documentId)||a.start-b.start)};})}));
 const usedColumns=columns.map((_,i)=>gridRows.some(r=>r.cells[i].quotations.length));
 let kept=hideEmpty?columns.filter((_,i)=>usedColumns[i]):columns;
 if(hideEmpty)gridRows=gridRows.filter(r=>r.cells.some(c=>c.quotations.length));
 gridRows=gridRows.map(r=>({...r,cells:r.cells.filter(c=>kept.includes(c.column))}));
 return {columns:kept,rows:gridRows,uncased:group==='case'?text.filter(r=>!(s.cases||[]).some(k=>caseIncludes(k,r))).length:0};
}
export const transposeGrid=grid=>({columns:grid.rows.map(r=>({id:r.code.id,name:r.code.name})),rows:grid.columns.map((col,i)=>({column:col,cells:grid.rows.map(r=>({column:{id:r.code.id,name:r.code.name},quotations:r.cells[i].quotations}))})),transposed:true,uncased:grid.uncased});

export function codeSummaryTable(rows){return [['Code','Applications','Distinct excerpts','Sources','Cases','Coders','Coded codepoints (union per source)','Mean codepoints per excerpt','Accepted','Provisional','Flagged'],...rows.map(r=>[r.code.name,r.applications,r.excerpts,r.sources,r.cases,r.coders.join('; '),r.codepoints,Number(r.meanCodepoints.toFixed(1)),r.accepted,r.provisional,r.flagged])];}
export function sourceSummaryTable(rows){return [['Source','Applications','Distinct excerpts','Codes used','Coders','Covered codepoints','Eligible codepoints','Coverage %'],...rows.map(r=>[r.source.name,r.applications,r.excerpts,r.codes,r.coders.join('; '),r.codepoints,r.total,Number(r.percent.toFixed(1))])];}
/** Grid as rows of text: each cell lists its quotations separated by a blank line. */
export function codeTextGridTable(grid){const first=grid.transposed?'Case / source':'Code';return [[first,...grid.columns.map(c=>c.name)],...grid.rows.map(r=>[r.code?.name??r.column.name,...r.cells.map(c=>c.quotations.map(q=>q.text).join('\n\n'))])];}

/** For each coding, the other codes applied to overlapping text in the same source (by code id, sorted by name). */
export function coCodesIndex(s,all){
 const by=new Map();for(const c of all){if(c.deletedAt||c.status==='needs_review'||(c.kind&&c.kind!=='text'))continue;if(!by.has(c.documentId))by.set(c.documentId,[]);by.get(c.documentId).push(c);}
 const names=new Map(s.codes.map(c=>[c.id,c.name]));
 return coding=>{if(coding.kind&&coding.kind!=='text')return [];const ids=new Set();for(const o of by.get(coding.documentId)||[])if(o.codeId!==coding.codeId&&Math.max(o.start,coding.start)<Math.min(o.end,coding.end))ids.add(o.codeId);return [...ids].map(id=>({id,name:names.get(id)||id})).sort((a,b)=>a.name.localeCompare(b.name));};
}
