import {emptyState,validateState} from './domain.mjs';
import {coerceAttribute} from './research-operations.mjs';
export const qualCoderTables=['project','source','code_name','code_cat','code_text','cases','case_text','attribute','attribute_type','journal','annotation','stored_sql','coder_names','code_image','code_av'];
export function normalizeQualCoder(tables,name='Imported QualCoder project'){
 const rows=key=>tables[key]||[],s=emptyState(name),attrs=rows('attribute'),losses=[];
 const ref=value=>value===null||value===undefined||value===''?null:String(value);
 s.description=rows('project')[0]?.memo||'';
 s.attributeTypes=rows('attribute_type').map(a=>({name:a.name,valueType:a.valuetype==='numeric'?'number':a.valuetype==='character'?'text':a.valuetype,scope:a.caseOrFile,memo:a.memo,owner:a.owner,date:a.date}));
 const attributes=(scope,id)=>Object.fromEntries(attrs.filter(a=>a.attr_type===scope&&String(a.id)===String(id)).map(a=>{const type=s.attributeTypes.find(t=>t.scope===scope&&t.name===a.name);try{return [a.name,type?coerceAttribute(a.value,type.valueType):a.value];}catch{losses.push({kind:'attribute',scope,id:String(id),name:a.name,message:'A declared numeric attribute has an invalid value; retained in original records and omitted from the active typed value.'});return [a.name,null];}}));
 s.categories=rows('code_cat').map(c=>({id:String(c.catid),name:c.name,parentId:ref(c.supercatid),memo:c.memo}));
 s.codes=rows('code_name').map(c=>({id:String(c.cid),name:c.name,description:c.memo||'',parentId:ref(c.supercid),categoryId:ref(c.catid),color:c.color,coder:c.owner,date:c.date}));
 s.documents=rows('source').map(d=>({id:String(d.id),name:d.name,text:d.fulltext||'',revision:1,sourceRole:'interview',attributes:attributes('file',d.id),memo:d.memo||'',turns:[],versions:[],originalMediaPath:d.mediapath,owner:d.owner,date:d.date,avTextId:d.av_text_id,risId:d.risid,excludeAI:true}));
 s.codings=rows('code_text').map(c=>({id:String(c.ctid),codeId:String(c.cid),documentId:String(c.fid),start:c.pos0,end:c.pos1,text:c.seltext,coder:c.owner,memo:c.memo||'',date:c.date,status:'coded',sourceRevision:1,important:!!c.important,avId:c.avid}));
 const links=rows('case_text');s.cases=rows('cases').map(c=>({id:String(c.caseid),name:c.name,memo:c.memo,documentIds:[],passages:[],attributes:attributes('case',c.caseid)}));
 const caseLinks=[],docs=new Map(s.documents.map(d=>[d.id,d])),cases=new Map(s.cases.map(c=>[c.id,c]));
 for(const [index,l] of links.entries()){
  const d=docs.get(String(l.fid)),which=cases.get(String(l.caseid)),record={originalId:String(l.id??index),caseId:String(l.caseid),documentId:String(l.fid),originalStart:l.pos0,originalEnd:l.pos1,active:false};caseLinks.push(record);
  const points=d?Array.from(d.text):[],bounds=d&&which&&Number.isSafeInteger(l.pos0)&&Number.isSafeInteger(l.pos1)&&l.pos0>=0&&l.pos1>=l.pos0&&l.pos1<=points.length;
  if(bounds&&l.pos0===0&&l.pos1===points.length){record.active=true;record.kind='whole-source';if(!which.documentIds.includes(d.id))which.documentIds.push(d.id);continue;}
  // QualCoder's Python case display slices codepoints, but its Qt selection
  // writer stores UTF-16 positions. With no stored case quote, non-BMP sources
  // cannot establish which writer created a partial link. Never guess units.
  if(bounds&&l.pos1>l.pos0&&d.text.length===points.length){record.active=true;record.kind='passage';which.passages.push({id:'qualcoder-case-link:'+String(l.id??index),documentId:d.id,start:l.pos0,end:l.pos1,text:points.slice(l.pos0,l.pos1).join(''),sourceRevision:1,anchorStatus:'current',actor:l.owner||'Imported QualCoder case link (author unidentified)',date:l.date||null,memo:l.memo||''});continue;}
  losses.push({kind:'case-anchor',caseId:record.caseId,documentId:record.documentId,originalId:record.originalId,message:'A case passage has missing, invalid or ambiguous Unicode bounds; retained in original records without broadening it to a whole source.'});
 }
 for(const coding of s.codings){const doc=docs.get(coding.documentId),points=doc?Array.from(doc.text):[];if(doc&&(!Number.isSafeInteger(coding.start)||!Number.isSafeInteger(coding.end)||coding.start<0||coding.end<=coding.start||coding.end>points.length||points.slice(coding.start,coding.end).join('')!==coding.text)){coding.status='needs_review';losses.push({kind:'anchor',codingId:coding.id,message:'Stored quotation and source bounds do not match exactly; original coding retained and withheld pending review.'});}}
 s.nativeImport={application:'qualcoder',permissionsImported:false,losses,records:{caseLinks},sourceOffsetUnit:'Exact text quotations use zero-based Unicode codepoints with exclusive ends. Partial case links on non-BMP sources are withheld because native Qt/Python offsets can differ.'};
 s.journals=rows('journal').map(j=>({id:String(j.jid),name:j.name,text:j.jentry,coder:j.owner,date:j.date}));s.memos=rows('annotation').map(m=>({id:'annotation-'+m.anid,title:'Passage annotation',content:m.memo,documentId:String(m.fid),start:m.pos0,end:m.pos1,author:m.owner,date:m.date}));
 s.legacy={...tables,attributes:attrs,categories:rows('code_cat'),caseLinks:links,codes:rows('code_name'),annotations:rows('annotation'),imageCodings:rows('code_image'),mediaCodings:rows('code_av'),storedQueries:rows('stored_sql'),coderRegistry:rows('coder_names'),originalTextCodings:rows('code_text')};
 s.importNotes=['Supported QualCoder tables are retained as original records; ancillary graph, RIS and other application tables are not activated by this adapter.','Imported speaker names, transcript accuracy and consent still require review.','Stored SQL queries are retained as inert records; they are never executed.','Verified whole-source case links remain whole-source links; partial case bounds remain passage-specific. Missing, invalid and ambiguous non-BMP partial case anchors are withheld. Numeric/character attribute definitions become number/text; missing numeric values remain missing. Original owners are historical attribution, not imported permissions.',...losses.map(l=>l.message)];
 if(rows('code_image').length||rows('code_av').length||s.documents.some(d=>d.originalMediaPath))s.importNotes.push('QualCoder media paths and region/time selections are retained as original records. This importer does not attach archive media or activate those selections; attach originals and review geometry before using them.');
 validateState(s);return s;
}
