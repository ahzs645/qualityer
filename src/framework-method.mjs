import {citationCurrent} from './analysis-memos.mjs';
export const FRAMEWORK_STAGES=['Familiarization','Initial coding','Working framework','Framework application','Charting','Interpretation','Critical review'];
const boundedText=(value,max,label)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw Error('Write a bounded '+label+'.');return value.trim();};
export function frameworkCellCurrent(state,cell){
 const document=state.documents.find(d=>d.id===cell.documentId);
 if(!document||document.sourceRole==='reference'||cell.sourceRevision!==(document.revision||1)||!['observed','not-observed','withheld'].includes(cell.finding)||!Array.isArray(cell.evidence))return false;
 return (cell.finding!=='observed'||cell.evidence.length>0)&&cell.evidence.every(e=>e.documentId===document.id&&citationCurrent(state,e));
}
export function frameworkMatrix(state,studyId){
 const study=(state.frameworkStudies||[]).find(s=>s.id===studyId);
 if(!study)return {study:null,rows:[]};
 return {study,rows:state.documents.filter(d=>d.sourceRole!=='reference'&&(!study.documentIds?.length||study.documentIds.includes(d.id))).map(document=>({document,cells:study.themes.map(theme=>{
  const saved=(state.frameworkCells||[]).find(c=>c.studyId===study.id&&c.documentId===document.id&&c.themeId===theme.id);
  return {theme,cell:saved||null,current:saved?frameworkCellCurrent(state,saved):false};
 })}))};
}
export function applyFrameworkOperation(state,op,actor,role,{uid=()=>crypto.randomUUID()}={}){
 if(!op.type.startsWith('framework.'))return false;
 if(!['owner','reviewer'].includes(role))throw Error('Reviewer access is required for framework analysis.');
 const data=op.data||{};state.frameworkStudies??=[];state.frameworkCells??=[];
 if(op.type==='framework.study.save'){
  const previous=state.frameworkStudies.find(s=>s.id===data.id);
  const themes=data.themes||previous?.themes;
  if(!Array.isArray(themes)||!themes.length||themes.length>30||new Set(themes.map(t=>t.id)).size!==themes.length)throw Error('Choose one to thirty uniquely identified framework themes.');
  for(const t of themes){boundedText(t.id,100,'theme identifier');boundedText(t.title,200,'theme title');if(!Array.isArray(t.codeIds)||!t.codeIds.length||t.codeIds.some(id=>!state.codes.some(c=>c.id===id)))throw Error('Every framework theme needs existing code definitions.');}
  const documentIds=data.documentIds||previous?.documentIds||[];
  if(!Array.isArray(documentIds)||documentIds.some(id=>!state.documents.some(d=>d.id===id&&d.sourceRole!=='reference')))throw Error('Choose existing research sources for the framework.');
  const value={...previous,id:previous?.id||data.id||uid(),name:boundedText(data.name||previous?.name,200,'framework name'),researchQuestion:boundedText(data.researchQuestion||previous?.researchQuestion,4000,'research question'),method:'Framework Method',themes:structuredClone(themes),documentIds:[...new Set(documentIds)],methodNotes:String(data.methodNotes||previous?.methodNotes||'').slice(0,20000),stages:structuredClone(data.stages||previous?.stages||[]),createdBy:previous?.createdBy||actor,createdAt:previous?.createdAt||new Date().toISOString(),modifiedBy:actor,modifiedAt:new Date().toISOString(),versions:[...(previous?.versions||[]),...(previous?[{...previous,versions:undefined}]:[])]};
  if(value.stages.some(s=>!FRAMEWORK_STAGES.includes(s.name)||!['pending','in-progress','complete'].includes(s.status)))throw Error('Choose valid method stages and progress states.');
  if(previous)Object.assign(previous,value);else state.frameworkStudies.push(value);return true;
 }
 const study=state.frameworkStudies.find(s=>s.id===data.studyId);
 if(!study)throw Error('Framework study missing.');
 if(op.type==='framework.cell.save'){
  const doc=state.documents.find(d=>d.id===data.documentId),theme=study.themes.find(t=>t.id===data.themeId);
  if(!doc||doc.sourceRole==='reference'||study.documentIds.length&&!study.documentIds.includes(doc.id)||!theme)throw Error('Choose a source and theme in this framework.');
  if(data.sourceRevision!==undefined&&data.sourceRevision!==(doc.revision||1))throw Error('The chart source changed. Revisit the current source before saving.');
  const evidence=data.evidence||[];
  if(!Array.isArray(evidence)||evidence.length>100||evidence.some(e=>e.documentId!==doc.id||!['support','contrast'].includes(e.relation)||!citationCurrent(state,e)))throw Error('Chart evidence must be exact current quotations from this source, outside restricted passages.');
  if(!['observed','not-observed','withheld'].includes(data.finding))throw Error('Distinguish observed, not observed and withheld material.');
  if(data.finding==='observed'&&!evidence.length)throw Error('An observed interpretation needs linked evidence.');
  const previous=state.frameworkCells.find(c=>c.studyId===study.id&&c.documentId===doc.id&&c.themeId===theme.id);
  const value={id:previous?.id||uid(),studyId:study.id,documentId:doc.id,sourceRevision:doc.revision||1,themeId:theme.id,finding:data.finding,summary:boundedText(data.summary,12000,'chart summary'),evidence:structuredClone(evidence),limitations:String(data.limitations||'').slice(0,12000),status:'draft',author:previous?.author||actor,modifiedBy:actor,date:previous?.date||new Date().toISOString(),modifiedAt:new Date().toISOString(),versions:[...(previous?.versions||[]),...(previous?[{...previous,versions:undefined}]:[])]};
  if(previous)Object.assign(previous,value);else state.frameworkCells.push(value);return true;
 }
 if(op.type==='framework.cell.review'){
  const cell=state.frameworkCells.find(c=>c.id===data.id&&c.studyId===study.id);
  if(!cell||!frameworkCellCurrent(state,cell)||!study.themes.some(t=>t.id===cell.themeId)||study.documentIds.length&&!study.documentIds.includes(cell.documentId))throw Error('The chart source or evidence changed or became restricted. Review it before recording a decision.');
  if(!['agent-reviewed','reviewed','deferred'].includes(data.status)||!data.note?.trim())throw Error('Choose a review state and record its reasoning.');
  cell.reviews??=[];cell.reviews.push({previous:cell.status,status:data.status,note:data.note.trim(),reviewer:actor,date:new Date().toISOString()});cell.status=data.status;return true;
 }
 return false;
}
