import {scopedSources,scopedCodings,codeRows} from './analysis-domain.mjs';
import {mergeIntervals} from './coder-comparison.mjs';
import {esc} from './report-export.mjs';
import {restrictedSourceRanges} from './source-consent.mjs';

const length=spans=>spans.reduce((sum,[a,b])=>sum+b-a,0);
export function intersectIntervals(left,right){
  const a=mergeIntervals(left),b=mergeIntervals(right),out=[];let i=0,j=0;
  while(i<a.length&&j<b.length){const start=Math.max(a[i][0],b[j][0]),end=Math.min(a[i][1],b[j][1]);if(end>start)out.push([start,end]);if(a[i][1]<b[j][1])i++;else j++;}
  return out;
}
function subtractIntervals(spans,removed){
  let out=mergeIntervals(spans);
  for(const [a,b] of mergeIntervals(removed))out=out.flatMap(([start,end])=>b<=start||a>=end?[[start,end]]:[[start,Math.min(a,end)],[Math.max(start,b),end]].filter(([x,y])=>y>x));
  return out;
}
const validRange=(r,size)=>Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.start>=0&&r.end>r.start&&r.end<=size;
export function eligibleSourceIntervals(state,doc,filters={}){
  const points=Array.from(doc.text||''),size=points.length,flags=restrictedSourceRanges(doc);
  // Uncertain restriction anchors cannot establish a safe denominator.
  if(doc.sourceRole==='reference'||flags.some(f=>f.anchorStatus==='needs_review'||!validRange(f,size)))return [];
  let spans=size?[[0,size]]:[];
  if(filters.caseId){
    const which=(state.cases||[]).find(c=>c.id===filters.caseId);
    if(!which)return [];
    if(!(which.documentIds||[]).includes(doc.id))spans=mergeIntervals((which.passages||[]).filter(p=>p.documentId===doc.id&&p.anchorStatus!=='needs_review'&&validRange(p,size)&&(p.sourceRevision==null||p.sourceRevision===(doc.revision||1))&&typeof p.text==='string'&&points.slice(p.start,p.end).join('')===p.text).map(p=>[p.start,p.end]));
  }
  return subtractIntervals(spans,flags.map(f=>[f.start,f.end]));
}

export function coverageScope(state,filters={}){
  const documents=scopedSources(state,filters),points=new Map(documents.map(d=>[d.id,Array.from(d.text||'')])),intervals=new Map(documents.map(d=>[d.id,eligibleSourceIntervals(state,d,filters)])),docs=new Map(documents.map(d=>[d.id,d]));
  const rows=scopedCodings(state,filters).filter(c=>{
    const doc=docs.get(c.documentId),p=points.get(c.documentId);
    return doc&&!c.kind&&c.anchorStatus!=='needs_review'&&validRange(c,p.length)&&(c.sourceRevision==null||c.sourceRevision===(doc.revision||1))&&typeof c.text==='string'&&p.slice(c.start,c.end).join('')===c.text&&intersectIntervals([[c.start,c.end]],intervals.get(doc.id)).length>0;
  });
  return {documents,rows,intervals,filters};
}
export const COVERAGE_METHOD='Text coverage is the union of current coded Unicode codepoints divided by eligible source codepoints. Consent-review text is removed from both scope and denominator; coding touching a restriction is withheld entirely. Case passage scopes clip measured coverage to the union of current linked passages while drilldown retains original decisions. Source, case and source-attribute filters determine the denominator. Code, coder, decision and quotation filters determine the numerator. The denominator includes all transcript text, including interviewer speech; it is not participant-only word count, recording duration or population prevalence.';
export function coverageProfile(state,filters={}, {rowMode='subtree'}={}){
  const scope=coverageScope(state,filters),sources=scope.documents.map(source=>({source,intervals:scope.intervals.get(source.id),eligibleCodepoints:length(scope.intervals.get(source.id))}));
  const rows=codeRows(state,rowMode).map(code=>{
    const cells=sources.map(({source,intervals,eligibleCodepoints})=>{
      const rows=scope.rows.filter(c=>c.documentId===source.id&&code.codeIds.has(c.codeId)),coveredCodepoints=length(intersectIntervals(rows.map(c=>[c.start,c.end]),intervals));
      return {sourceId:source.id,sourceName:source.name,rows,applications:rows.length,eligibleCodepoints,coveredCodepoints,coveragePercent:eligibleCodepoints?100*coveredCodepoints/eligibleCodepoints:null,applicationsPer1000:eligibleCodepoints?1000*rows.length/eligibleCodepoints:null};
    });
    return {...code,cells};
  });
  return {...scope,sources,codeRows:rows,method:COVERAGE_METHOD};
}
export function coverageExportRows(profile,{scope=''}={}){
  return [['Scope',scope],['Method',profile.method],['Filters',JSON.stringify(profile.filters)],['Row mode note','Parent/subtree rows and codes can share evidence; coverage percentages across codes must not be added. Application rates include distinct coder records.'],[],['Code','Code ID','Source','Source ID','Eligible codepoints','Covered union codepoints','Coverage percent','Applications','Applications per 1000 eligible codepoints'],...profile.codeRows.flatMap(code=>code.cells.map(cell=>[code.name,code.id,cell.sourceName,cell.sourceId,cell.eligibleCodepoints,cell.coveredCodepoints,cell.coveragePercent,cell.applications,cell.applicationsPer1000]))];
}
export const OVERLAP_METHOD='Interval-union Jaccard: intersection / union of each coder’s current text coverage, keeping source and directly applied code identities separate. Duplicate and overlapping applications by one coder count once. Case passage coverage is clipped to eligible linked passages. Uncoded text is excluded from this denominator. Empty unions have no defined score. This is descriptive overlap of saved decisions; it does not establish blind independence, human agreement, reliability or consensus. AI reviewer/analyst identities remain AI identities.';
const scopeCoders=scope=>[...new Set(scope.rows.map(c=>c.coder).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));
// Eligible, merged coverage per [source, directly applied code] and coder.
function coderSpans(scope){
  const groups=new Map();
  for(const row of scope.rows){
    const key=JSON.stringify([row.documentId,row.codeId]);if(!groups.has(key))groups.set(key,new Map());const byCoder=groups.get(key);if(!byCoder.has(row.coder))byCoder.set(row.coder,[]);byCoder.get(row.coder).push(...intersectIntervals([[row.start,row.end]],scope.intervals.get(row.documentId)));
  }
  for(const byCoder of groups.values())for(const [coder,spans] of byCoder)byCoder.set(coder,mergeIntervals(spans));
  return groups;
}
export function coderOverlapProfile(state,filters={}){
  const scope=coverageScope(state,filters),coders=scopeCoders(scope),groups=coderSpans(scope);
  const cells=coders.map(a=>coders.map(b=>{
    let left=0,right=0,intersection=0;
    for(const byCoder of groups.values()){const x=byCoder.get(a)||[],y=byCoder.get(b)||[];left+=length(x);right+=length(y);intersection+=length(intersectIntervals(x,y));}
    const union=left+right-intersection;
    return {a,b,leftCodepoints:left,rightCodepoints:right,intersection,union,jaccard:union?intersection/union:null,rows:scope.rows.filter(c=>c.coder===a||c.coder===b)};
  }));
  return {...scope,coders,cells,method:OVERLAP_METHOD};
}
export function overlapExportRows(profile,{scope=''}={}){
  return [['Scope',scope],['Method',profile.method],['Filters',JSON.stringify(profile.filters)],[],['Coder A','Coder B','Left codepoints','Right codepoints','Intersection codepoints','Union codepoints','Jaccard'],...profile.cells.flatMap((row,i)=>row.slice(i).map(cell=>[cell.a,cell.b,cell.leftCodepoints,cell.rightCodepoints,cell.intersection,cell.union,cell.jaccard]))];
}
export const NOT_RECORDED_GROUP='Not recorded';
export const ATTRIBUTE_AGREEMENT_METHOD='Agreement by coder attribute groups saved coder identities by one recorded coder attribute and sums the pairwise overlap of every pair of distinct coders, keeping each source and directly applied code as a separate dimension. Codepoints: summed intersection / summed union of each pair’s current eligible coverage (duplicate applications by one coder count once). Segments: each pair’s combined coverage per source and code is split into contiguous units; a unit is shared when both coders cover at least one common codepoint in it; shared units / all units. Within-group cells compare coders who share a value; between-group cells compare coders with different values. Coders without the attribute form the “Not recorded” group. Empty unions are N/A. Values describe saved decisions only; they are not a reliability coefficient, do not establish blind independence and carry no significance test. AI identities remain labelled as saved.';
function pairDimensions(groups,a,b,unit){
  const out=[];
  for(const [key,byCoder] of groups){
    const x=byCoder.get(a)||[],y=byCoder.get(b)||[];if(!x.length&&!y.length)continue;
    const [documentId,codeId]=JSON.parse(key),shared=intersectIntervals(x,y);let intersection,union;
    if(unit==='segments'){const units=mergeIntervals([...x,...y]);union=units.length;intersection=units.filter(([s,e])=>shared.some(([p,q])=>p>=s&&q<=e)).length;}
    else{intersection=length(shared);union=length(x)+length(y)-intersection;}
    out.push({documentId,codeId,intersection,union});
  }
  return out;
}
const total=(list,key)=>list.reduce((sum,x)=>sum+x[key],0);
export function coderAttributeAgreement(state,filters={},{attribute='',unit='codepoints',byCode=false}={}){
  if(!['codepoints','segments'].includes(unit))throw Error('Choose codepoints or segments.');
  const scope=coverageScope(state,filters),coders=scopeCoders(scope),spans=coderSpans(scope),saved=state.coderAttributes||{},docs=new Map(scope.documents.map(d=>[d.id,d.name])),codes=new Map(state.codes.map(c=>[c.id,c.name]));
  const valueOf=coder=>{const v=Object.hasOwn(saved,coder)?saved[coder]?.[attribute]:null;return v==null||v===''?null:String(v);};
  const groups=[...new Set(coders.map(valueOf))].sort((a,b)=>a==null?1:b==null?-1:a.localeCompare(b,undefined,{numeric:true})).map(value=>({value,label:value??NOT_RECORDED_GROUP,recorded:value!=null,coders:coders.filter(c=>valueOf(c)===value)}));
  const pairs=coders.flatMap((a,i)=>coders.slice(i+1).map(b=>({a,b,groupA:valueOf(a),groupB:valueOf(b),dimensions:pairDimensions(spans,a,b,unit).map(d=>({...d,sourceName:docs.get(d.documentId)??d.documentId,codeName:codes.get(d.codeId)??d.codeId}))})));
  const matrix=codeId=>groups.map(g=>groups.map(h=>{
    const members=pairs.filter(p=>(p.groupA===g.value&&p.groupB===h.value)||(p.groupA===h.value&&p.groupB===g.value));
    const coderPairs=members.map(p=>{const dimensions=p.dimensions.filter(d=>codeId==null||d.codeId===codeId),intersection=total(dimensions,'intersection'),union=total(dimensions,'union');return {a:p.a,b:p.b,groupA:p.groupA??NOT_RECORDED_GROUP,groupB:p.groupB??NOT_RECORDED_GROUP,intersection,union,agreement:union?intersection/union:null,dimensions};}).filter(p=>p.union>0);
    const intersection=total(coderPairs,'intersection'),union=total(coderPairs,'union'),sources=[...new Set(coderPairs.flatMap(p=>p.dimensions.filter(d=>d.union>0).map(d=>d.documentId)))],keys=new Set(coderPairs.flatMap(p=>p.dimensions.map(d=>JSON.stringify([d.documentId,d.codeId])))),involved=new Set(coderPairs.flatMap(p=>[p.a,p.b]));
    return {rowGroup:g.label,columnGroup:h.label,kind:g===h?'within':'between',intersection,union,agreement:union?intersection/union:null,coderPairs,pairCount:coderPairs.length,possiblePairs:members.length,sourceCount:sources.length,sources:sources.map(id=>docs.get(id)??id),rows:scope.rows.filter(r=>involved.has(r.coder)&&keys.has(JSON.stringify([r.documentId,r.codeId])))};
  }));
  const codeIds=byCode?[...new Set(scope.rows.map(r=>r.codeId))].sort((a,b)=>String(codes.get(a)??a).localeCompare(String(codes.get(b)??b))):[];
  return {attribute,unit,filters,coders,groups,pairCount:pairs.length,sourceCount:scope.documents.length,cells:matrix(null),codes:codeIds.map(codeId=>({codeId,codeName:codes.get(codeId)??codeId,cells:matrix(codeId)})),method:ATTRIBUTE_AGREEMENT_METHOD};
}
export function attributeAgreementExportRows(profile,{scope=''}={}){
  const unit=profile.unit==='segments'?'segments':'codepoints',tables=[{name:'All codes',cells:profile.cells},...profile.codes.map(c=>({name:c.codeName,cells:c.cells}))];
  return [['Scope',scope],['Method',profile.method],['Filters',JSON.stringify(profile.filters)],['Coder attribute',profile.attribute],['Unit',unit],['Groups',profile.groups.map(g=>g.label+': '+g.coders.join(' | ')).join('; ')],[],['Code','Group A','Group B','Comparison','Intersection '+unit,'Union '+unit,'Agreement (intersection / union)','Coder pairs contributing','Coder pairs possible','Sources contributing','Contributing coder pairs'],...tables.flatMap(t=>t.cells.flatMap((row,i)=>row.slice(i).map(c=>[t.name,c.rowGroup,c.columnGroup,c.kind,c.intersection,c.union,c.agreement,c.pairCount,c.possiblePairs,c.sourceCount,c.coderPairs.map(p=>p.a+' ↔ '+p.b).join('; ')]))),[],['Group A','Group B','Coder A','Coder B','Code','Source','Intersection '+unit,'Union '+unit],...profile.cells.flatMap((row,i)=>row.slice(i).flatMap(c=>c.coderPairs.flatMap(p=>p.dimensions.map(d=>[p.groupA,p.groupB,p.a,p.b,d.codeName,d.sourceName,d.intersection,d.union]))))];
}
export function coverageSVG(profile,{metric='coveragePercent',scope=''}={}){
  if(!['coveragePercent','applicationsPer1000'].includes(metric))throw Error('Unknown normalized coverage metric.');
  const items=profile.codeRows.flatMap(code=>code.cells.map(cell=>({code,cell}))),width=1100,height=160+items.length*34,label=metric==='coveragePercent'?'Coverage of eligible text (%)':'Applications per 1000 eligible codepoints',max=metric==='coveragePercent'?100:Math.max(1,...items.map(({cell})=>cell[metric]||0));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img"><title>${esc(label)}</title><desc>${esc(profile.method+' Scope: '+scope+' Filters: '+JSON.stringify(profile.filters))}</desc><rect width="100%" height="100%" fill="white"/><text x="24" y="30" font-family="sans-serif" font-size="20">${esc(label)}</text><text x="24" y="54" font-family="sans-serif" font-size="11">${esc(scope.slice(0,150))}</text><text x="24" y="74" font-family="sans-serif" font-size="11">All transcript text; restricted ranges excluded. Counts describe coding, not prevalence.</text><text x="430" y="104" font-family="sans-serif" font-size="11">0</text><text x="1010" y="104" font-family="sans-serif" font-size="11">${esc(Number(max.toFixed(2)))}</text>${items.map(({code,cell},i)=>{const y=128+i*34,value=cell[metric];return `<g><title>${esc(code.name+' · '+cell.sourceName+' · '+cell.coveredCodepoints+'/'+cell.eligibleCodepoints+' codepoints; '+cell.applications+' applications')}</title><text x="24" y="${y}" font-family="sans-serif" font-size="12">${esc((code.name+' · '+cell.sourceName).slice(0,60))}</text><rect x="430" y="${y-13}" width="600" height="18" fill="#edf2f5"/><rect x="430" y="${y-13}" width="${value==null?0:value/max*600}" height="18" fill="#447e96"/><text x="1040" y="${y}" font-family="sans-serif" font-size="12">${value==null?'N/A':Number(value.toFixed(2))}</text></g>`;}).join('')}</svg>`;
}
