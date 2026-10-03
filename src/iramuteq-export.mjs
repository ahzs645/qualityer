import {scopedCodings,excerptKey,reportRows} from './analysis-domain.mjs';
import {caseIncludes} from './research-operations.mjs';

// Encode punctuation, whitespace, underscores and non-ASCII characters so labels
// cannot introduce corpus variables or separators; encoding remains reversible.
export function iramuteqToken(value){return Array.from(String(value)).map(c=>/[A-Za-z0-9]/.test(c)?c:'_u'+c.codePointAt(0).toString(16)+'_').join('')||'empty';}

const variableKey=value=>Array.from(String(value)).map(c=>c.codePointAt(0).toString(16)).join('x')||'empty';

export function iramuteqCorpus(state,requestedRows,{filters={},scope='',includeAttributes=false}={}){
 const requested=new Set(requestedRows.map(c=>c.id)),eligible=scopedCodings(state,filters).filter(c=>requested.has(c.id)),groups=new Map();
 const omissions={ineligible:requested.size-eligible.length,nonText:0,invalidAnchor:0,reservedMarker:0};
 for(const c of eligible){
  if(c.kind&&c.kind!=='text'){omissions.nonText++;continue;}
  const d=state.documents.find(d=>d.id===c.documentId),p=Array.from(d.text),revision=d.revision||1;
  if(!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||c.end>p.length||p.slice(c.start,c.end).join('')!==c.text||(c.sourceRevision!=null&&c.sourceRevision!==revision)){omissions.invalidAnchor++;continue;}
  // Keep quotations verbatim. Omit ambiguous corpus separator lines rather than
  // silently rewriting text or letting a quotation create a forged document.
  if(/^\s*\*{4}(?:\s|$)/mu.test(c.text)){omissions.reservedMarker++;continue;}
  const key=excerptKey(c);if(!groups.has(key))groups.set(key,{document:d,revision,start:c.start,end:c.end,text:c.text,rows:[]});groups.get(key).rows.push(c);
 }
 const records=[],parts=[];
 for(const group of groups.values()){
  const {document:d,revision,start,end,text,rows}=group,number=records.length+1,variables=[['excerpt',number],['source',d.id],['revision',revision],['start',start],['end',end]],codes=[...new Set(rows.map(c=>c.codeId))].map(id=>state.codes.find(c=>c.id===id)),coders=[...new Set(rows.map(c=>c.coder))],cases=(state.cases||[]).filter(k=>rows.some(c=>caseIncludes(k,c)));
  for(const c of codes){variables.push(['code'+variableKey(c.id),'present']);const categories=new Map((state.categories||[]).map(x=>[x.id,x]));let category=categories.get(c.categoryId),seen=new Set();while(category&&!seen.has(category.id)){seen.add(category.id);variables.push(['category'+variableKey(category.id),'present']);category=categories.get(category.parentId);}}
  for(const coder of coders)variables.push(['coder'+variableKey(coder),'present']);for(const c of cases)variables.push(['case'+variableKey(c.id),'present']);
  if(includeAttributes){for(const [name,value] of Object.entries(d.attributes||{}))if(value!==null&&value!==undefined&&value!=='')variables.push(['filevar'+variableKey(name),value]);for(const c of cases)for(const [name,value] of Object.entries(c.attributes||{}))if(value!==null&&value!==undefined&&value!=='')variables.push(['casevar'+variableKey(c.id)+'z'+variableKey(name),value]);}
  const unique=[...new Map(variables.map(([name,value])=>[name+'_'+iramuteqToken(value),[name,value]])).values()];
  parts.push('**** '+unique.map(([name,value])=>'*'+name+'_'+iramuteqToken(value)).join(' ')+'\n'+text+'\n\n');
  records.push({number,documentId:d.id,sourceName:d.name,sourceRevision:revision,start,end,codingIds:rows.map(c=>c.id),codeIds:codes.map(c=>c.id),coders,caseIds:cases.map(c=>c.id),variables:unique,evidence:reportRows(state,rows).slice(1)});
 }
 return {text:parts.join(''),manifest:{format:'research-weave-iramuteq',version:1,unit:'Distinct current exact text excerpt; coincident coder/code applications are grouped once. Overlapping nonidentical excerpts remain separate.',scope,filters,includeAttributes,records,omissions,notes:['Quotation text is retained verbatim. Metadata values escape unsafe characters as _uHEX_; variable names encode identities as codepoint hex joined by x. Code/coder/case/category variables are binary presence indicators, avoiding repeated variable keys.','Media/region coding is omitted; supplied transcript timing remains in evidence provenance, with no interpolation.','Overlapping nonidentical excerpts can repeat words; this coded-excerpt corpus is not a whole-interview prevalence measure.','Provenance manifest contains the same scoped evidence as the corpus. Private notes and whole source text are not included.']}};
}
