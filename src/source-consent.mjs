const points=value=>Array.from(value||'');
const slice=(value,start,end)=>points(value).slice(start,end).join('');
const overlaps=(a,b)=>Math.max(a.start,b.start)<Math.min(a.end,b.end);
const statuses=new Set(['pending','included','withheld']);
const current=(doc,anchor)=>anchor.anchorStatus!=='needs_review'&&anchor.sourceRevision===(doc.revision||1)&&Number.isInteger(anchor.start)&&Number.isInteger(anchor.end)&&anchor.start>=0&&anchor.end>anchor.start&&anchor.end<=points(doc.text).length&&slice(doc.text,anchor.start,anchor.end)===anchor.text;

export function restrictedSourceRanges(doc){
 const length=points(doc?.text).length,ranges=[];
 for(const flag of doc?.reviewFlags||[]){
  if(flag.status==='included'&&flag.anchorStatus!=='needs_review')continue;
  if(!Number.isInteger(flag.start)||!Number.isInteger(flag.end)||flag.start<0||flag.end<=flag.start||flag.end>length)return [{start:0,end:length,reason:'A restriction anchor needs review.'}];
  ranges.push({...flag});
 }
 return ranges;
}
export function consentMarkers(doc){
 const text=String(doc?.text||''),markers=[];
 for(const match of text.matchAll(/\b(?:off[- ]the[- ]record|do not (?:record|quote)|not for (?:attribution|publication))\b/giu)){
  const start=points(text.slice(0,match.index)).length;
  markers.push({start,end:start+points(match[0]).length,text:match[0],sourceRevision:doc.revision||1});
 }
 return markers;
}
export function consentAnchorCurrent(doc,record){return current(doc,record);}
export function normalizeConsentDecisions(records=[]){
 if(!Array.isArray(records))throw Error('Invalid consent decision records.');
 return records.map(record=>{
  if(!record||typeof record!=='object'||Array.isArray(record)||typeof record.id!=='string'||!record.id.trim()||!statuses.has(record.status))throw Error('Invalid consent decision record.');
  const history=record.history??[];
  if(!Array.isArray(history)||history.some(entry=>!entry||typeof entry!=='object'||Array.isArray(entry)))throw Error('Invalid consent decision history.');
  return {...structuredClone(record),history:structuredClone(history)};
 });
}

export function applyConsentOperation(state,operation,actor,role,{uid=()=>crypto.randomUUID()}={}){
 if(!operation.type.startsWith('source.consent.'))return false;
 if(!['owner','reviewer'].includes(role))throw Error('Reviewer access is required for consent decisions.');
 const data=operation.data||{},doc=state.documents.find(d=>d.id===data.id);
 if(!doc)throw Error('Source missing.');
 if(!data.note?.trim())throw Error('Record the reason and authorization scope for this consent decision.');
 doc.consentDecisions=normalizeConsentDecisions(doc.consentDecisions);doc.reviewFlags??=[];
 if(operation.type==='source.consent.flag'){
  const anchor={start:data.start,end:data.end,text:data.text,sourceRevision:data.sourceRevision,anchorStatus:'current'};
  if(!current(doc,anchor))throw Error('Select an exact current passage before flagging consent.');
  const id=uid(),record={...anchor,id,status:'pending',kind:'consent',note:data.note.trim(),createdBy:actor,createdAt:new Date().toISOString(),history:[]};
  doc.consentDecisions.push(record);doc.reviewFlags.push({...record});return true;
 }
 const record=doc.consentDecisions.find(r=>r.id===data.flagId);
 if(!record)throw Error('Consent marker missing.');
 const previous=structuredClone({...record,history:undefined});
 if(operation.type==='source.consent.reanchor'){
  const anchor={start:data.start,end:data.end,text:data.text,sourceRevision:data.sourceRevision,anchorStatus:'current'};
  if(!current(doc,anchor))throw Error('Choose the exact current consent scope.');
  Object.assign(record,anchor,{status:'pending'});
 }else if(operation.type==='source.consent.decide'){
  if(!statuses.has(data.status))throw Error('Choose pending, included or withheld.');
  if(!current(doc,record))throw Error('The source changed. Re-anchor this consent scope before deciding.');
  record.status=data.status;
 }else return false;
 record.history.push({...previous,changedBy:actor,changedAt:new Date().toISOString(),decisionNote:data.note.trim()});
 Object.assign(record,{note:data.note.trim(),reviewer:actor,reviewedAt:new Date().toISOString()});
 doc.reviewFlags=doc.reviewFlags.filter(f=>f.id!==record.id);
 if(record.status!=='included')doc.reviewFlags.push(structuredClone(record));
 return true;
}

// Text changes preserve the scope history and suspend a crossed inclusion decision.
export function rebaseConsentScopes(doc,{prefix,oldEnd,delta,actor}){
 for(const record of doc.consentDecisions||[]){
  if(record.anchorStatus==='needs_review')continue;
  if(record.end<=prefix){record.sourceRevision=doc.revision;const flag=doc.reviewFlags?.find(f=>f.id===record.id);if(flag)flag.sourceRevision=doc.revision;continue;}
  if(record.start>=oldEnd){record.start+=delta;record.end+=delta;record.sourceRevision=doc.revision;const flag=doc.reviewFlags?.find(f=>f.id===record.id);if(flag)flag.sourceRevision=doc.revision;continue;}
  record.history??=[];
  record.history.push({...structuredClone(record),history:undefined,changedBy:actor||'Source revision',changedAt:new Date().toISOString(),decisionNote:'Source text changed across this consent scope; prior authorization suspended pending re-anchoring.',event:'source-edit'});
  record.originalAnchor??={start:record.start,end:record.end,text:record.text,sourceRevision:record.sourceRevision};
  record.start=Math.min(record.start,prefix);record.end=Math.min(points(doc.text).length,Math.max(record.start,record.end+delta));record.anchorStatus='needs_review';record.status='pending';
  doc.reviewFlags=(doc.reviewFlags||[]).filter(f=>f.id!==record.id);
  doc.reviewFlags.push({...record,status:'pending'});
 }
}
export function passageConsentRestricted(doc,selection){return restrictedSourceRanges(doc).some(r=>overlaps(r,selection));}
