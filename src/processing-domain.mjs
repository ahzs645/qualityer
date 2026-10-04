const chars=s=>Array.from(s||'');
const part=(s,a,b)=>chars(s).slice(a,b).join('');
export const intersects=(a,b)=>Math.max(a.start,b.start)<Math.min(a.end,b.end);
export function evidenceAttribution(state,selection){const d=state.documents.find(d=>d.id===selection.documentId),turns=(d?.turns||[]).filter(t=>t.anchorStatus!=='needs_review'&&intersects(t,selection));return {firstTurn:turns[0]?((turns[0].sourceIndex??d.turns.indexOf(turns[0]))+1):null,speakers:[...new Set(turns.map(t=>t.speaker))]};}
export function taskAnchor(state,task){const doc=state.documents.find(d=>d.id===task.documentId);return !!doc&&Number.isInteger(task.start)&&Number.isInteger(task.end)&&task.start>=0&&task.end>task.start&&task.end<=chars(doc.text).length&&task.anchorStatus!=='needs_review'&&doc.revision===task.sourceRevision&&part(doc.text,task.start,task.end)===task.text;}
export function quoteContext(doc,selection,radius=1){
 if(!doc||!selection)return [];
 const valid=(doc.turns||[]).filter(t=>t.anchorStatus!=='needs_review'),hits=valid.map((t,i)=>intersects(t,selection)?i:-1).filter(i=>i>=0);
 if(hits.length){return valid.slice(Math.max(0,hits[0]-radius),Math.min(valid.length,hits.at(-1)+radius+1)).map(t=>({...t,number:(t.sourceIndex??doc.turns.indexOf(t))+1,text:part(doc.text,t.start,t.end),selected:intersects(t,selection),restricted:(doc.reviewFlags||[]).some(f=>intersects(f,t))}));}
 const length=chars(doc.text).length,start=Math.max(0,selection.start-250),end=Math.min(length,selection.end+250);return [{start,end,text:part(doc.text,start,end),selected:true,restricted:(doc.reviewFlags||[]).some(f=>intersects(f,{start,end})),number:null}];
}
export function addReviewTasks(state,data,actor){
 state.reviewTasks??=[];state.assistantRuns??=[];
 if(!Array.isArray(data.tasks)||data.tasks.length>100)throw Error('Choose up to 100 review tasks.');
 const runId=String(data.runId||'');if(!runId)throw Error('Review run identifier is required.');
 for(const supplied of data.tasks){
  if(state.reviewTasks.some(t=>t.id===supplied.id))continue;
  const task={...supplied,runId,status:'pending',history:[],addedBy:actor,createdAt:new Date().toISOString()};
  if(!task.id||!task.issue?.trim()||!task.rationale?.trim()||!Number.isInteger(task.start)||!Number.isInteger(task.end)||task.start<0||task.end<=task.start||!taskAnchor(state,task))throw Error('Review task quotation does not match the current source.');
  const d=state.documents.find(d=>d.id===task.documentId);if((d.reviewFlags||[]).some(f=>intersects(f,task)))throw Error('The review task intersects a passage pending consent review.');
  if((task.suggestedCodeIds||[]).some(id=>!state.codes.some(c=>c.id===id&&c.codable!==false)))throw Error('Unknown proposed code.');
  task.originalAnchor={documentId:task.documentId,start:task.start,end:task.end,text:task.text,sourceRevision:task.sourceRevision};
  for(const e of task.relatedEvidence||[]){if(!taskAnchor(state,e))throw Error('Related evidence does not match its current source.');const relatedDoc=state.documents.find(d=>d.id===e.documentId);if((relatedDoc.reviewFlags||[]).some(f=>intersects(f,e)))throw Error('Related evidence intersects a passage pending consent review.');e.originalAnchor={documentId:e.documentId,start:e.start,end:e.end,text:e.text,sourceRevision:e.sourceRevision};}
  state.reviewTasks.push(task);
 }
 if(!state.assistantRuns.some(r=>r.id===runId))state.assistantRuns.push({id:runId,name:String(data.name||'Research review'),method:String(data.method||'Source-linked recommendations, requiring researcher decisions.'),createdBy:actor,date:new Date().toISOString()});
}
export function decideReviewTask(state,data,actor,role,newId,checkProtocol){
 if(!['owner','reviewer'].includes(role))throw Error('Reviewer access required.');
 const task=state.reviewTasks?.find(t=>t.id===data.id);if(!task)throw Error('Review task missing.');
 if(['accepted','revised','rejected'].includes(task.status))throw Error('This task already has a final decision.');
 if(!['accepted','revised','rejected','deferred'].includes(data.status)||!String(data.note||'').trim())throw Error('Choose a decision and record its reasoning.');
 const accepting=['accepted','revised'].includes(data.status),codeIds=[...new Set(data.codeIds||[])],created=[],reused=[];
 if(accepting&&!taskAnchor(state,task))throw Error('The source changed. Re-anchor this recommendation before accepting it.');
 if(accepting){
  const evidence=[task,...(task.relatedEvidence||[])];
  if(evidence.some(e=>!taskAnchor(state,e)))throw Error('Linked evidence changed. Review and re-anchor the evidence before accepting this recommendation.');
  if(evidence.some(e=>(state.documents.find(d=>d.id===e.documentId)?.reviewFlags||[]).some(f=>intersects(f,e))))throw Error('Resolve consent review for the recommendation and its linked evidence before accepting it.');
 }
 if(data.createCoding&&accepting){
  if(!codeIds.length||codeIds.some(id=>!state.codes.some(c=>c.id===id&&c.codable!==false)))throw Error('Select at least one existing code.');
  const d=state.documents.find(d=>d.id===task.documentId);if((d.reviewFlags||[]).some(f=>intersects(f,task)))throw Error('Resolve consent review before creating coding from this recommendation.');
  for(const codeId of codeIds){const existing=state.codings.find(c=>!c.deletedAt&&c.coder===actor&&c.documentId===d.id&&c.start===task.start&&c.end===task.end&&c.codeId===codeId&&c.status!=='needs_review'&&!c.kind);if(existing){reused.push(existing.id);continue;}const c={id:newId(),documentId:d.id,codeId,start:task.start,end:task.end,text:task.text,coder:actor,date:new Date().toISOString(),status:'accepted',sourceRevision:d.revision,origin:'assistant-reviewed',reviewTaskId:task.id,memo:data.note};state.codings.push(c);created.push(c.id);}
  if(state.protocol==='nhhr'&&checkProtocol(state).some(i=>i.type==='protocol'&&i.coding.documentId===task.documentId&&i.coding.start===task.start&&i.coding.end===task.end&&i.coding.coder===actor))throw Error('Select exactly one evidence grade and stance alongside substantive NHHR codes.');
  task.codingIds=[...created,...reused];
 }
 const snapshot=e=>({documentId:e.documentId,start:e.start,end:e.end,text:e.text,sourceRevision:e.sourceRevision,anchorCurrent:taskAnchor(state,e),consentRestricted:(state.documents.find(d=>d.id===e.documentId)?.reviewFlags||[]).some(f=>intersects(f,e))});
 task.status=data.status;task.reviewedBy=actor;task.reviewNote=String(data.note).trim();task.history??=[];task.history.push({status:data.status,note:task.reviewNote,codeIds,createdCoding:created.length>0,createdCodingIds:created,reusedCodingIds:reused,evidence:snapshot(task),relatedEvidence:(task.relatedEvidence||[]).map(snapshot),reviewer:actor,date:new Date().toISOString()});
}
export function reanchorReviewTask(state,data,actor,role){
 if(!['owner','reviewer'].includes(role))throw Error('Reviewer access required.');const task=state.reviewTasks?.find(t=>t.id===data.id),d=state.documents.find(d=>d.id===task?.documentId);if(!task||!d)throw Error('Review task missing.');
 if(!['pending','deferred'].includes(task.status))throw Error('A completed task cannot be re-anchored.');
 if(!Number.isInteger(data.start)||!Number.isInteger(data.end)||data.start<0||data.end<=data.start||data.end>chars(d.text).length||(d.reviewFlags||[]).some(f=>intersects(f,data)))throw Error('Choose a valid quotation outside the consent-review range.');
 if(!String(data.note||'').trim())throw Error('Record the reason for changing this quotation.');task.history??=[];task.history.push({action:'reanchor',prior:{start:task.start,end:task.end,text:task.text,sourceRevision:task.sourceRevision},note:data.note,reviewer:actor,date:new Date().toISOString()});const text=part(d.text,data.start,data.end),turn=(d.turns||[]).find(t=>t.anchorStatus!=='needs_review'&&t.start<=data.start&&t.end>data.start),index=turn?(turn.sourceIndex??d.turns.indexOf(turn)):null;Object.assign(task,{start:data.start,end:data.end,text,quote:text,sourceRevision:d.revision,anchorStatus:'current',turnIndex:index,turnNumber:index==null?null:index+1,speaker:turn?.speaker||'Unassigned'});
}
export function codingSequence(state,documentId,{status='all',coder='',bins=12}={}){
 const d=state.documents.find(d=>d.id===documentId);if(!d)return {bins:[],rows:[]};const length=chars(d.text).length,windows=Array.from({length:bins},(_,i)=>({index:i,start:Math.floor(i*length/bins),end:Math.floor((i+1)*length/bins)}));
 const active=state.codings.filter(c=>c.documentId===d.id&&!c.deletedAt&&c.status!=='needs_review'&&!c.kind&&(!coder||c.coder===coder)&&(status==='all'||c.status===status));
 return {bins:windows,rows:state.codes.map(code=>({code,cells:windows.map(w=>{const applications=active.filter(c=>c.codeId===code.id&&intersects(c,w)),unique=[...new Map(applications.map(c=>[[c.start,c.end].join(':'),c])).values()];return {...w,count:unique.length,applications};})})).filter(row=>row.cells.some(c=>c.count))};
}
export function reviewLedger(state){return {name:state.name,method:'Assistant recommendations remain separate from researcher decisions and coder agreement.',runs:state.assistantRuns||[],tasks:(state.reviewTasks||[]).map(t=>({...t,anchorCurrent:taskAnchor(state,t)}))};}
export function importSummary(state){const codings=state.codings.filter(c=>!c.deletedAt),spans=new Set(codings.map(c=>[c.documentId,c.start,c.end,c.kind||'',c.timeStart,c.timeEnd,JSON.stringify(c.region||{})].join(':')));return {sources:state.documents.length,codes:state.codes.length,categories:state.categories?.length||0,applications:codings.length,pendingAnchors:codings.filter(c=>c.status==='needs_review'||c.anchorStatus==='needs_review').length,excerpts:spans.size,coders:[...new Set(codings.map(c=>c.coder))],memos:state.memos?.length||0,journals:state.journals?.length||0,attributes:state.attributeTypes?.length||0,storedQueries:state.legacy?.storedQueries?.length||0,important:codings.filter(c=>c.important).length,media:state._mediaFiles?.length||0,legacyTables:Object.keys(state.legacy||{})};}
