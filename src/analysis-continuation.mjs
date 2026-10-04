import {citationCurrent} from './analysis-memos.mjs';
import {applyFrameworkOperation} from './framework-method.mjs';

export const MAX_CONTINUATION_BYTES=2_000_000;
const LENSES=new Set(['experiences','actions','values','context','constraints','consequences']);
const text=(value,max,label)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`Write a bounded ${label}.`);
 return value.trim();
};
const list=(value,max,label,min=0)=>{
 if(!Array.isArray(value)||value.length<min||value.length>max)throw Error(`Invalid ${label}.`);
 return value;
};
const strings=(value,label,max=100)=>list(value,max,label).map(v=>text(v,12000,label));
const unique=(items,label)=>{if(new Set(items).size!==items.length)throw Error(`Duplicate ${label}.`);return items;};
const boundedRun=run=>{
 if(!run||typeof run!=='object'||Array.isArray(run)||new TextEncoder().encode(JSON.stringify(run)).length>MAX_CONTINUATION_BYTES)throw Error('Analysis continuation must be at most 2 MB.');
};

// This is structural normalization, deliberately independent of current source state.
// Saved runs retain their original evidence when sources change or are removed later.
export function normalizeContinuationInput(input){
 boundedRun(input);
 const documentIds=unique(list(input.documentIds,50,'continuation sources',1).map(id=>text(id,100,'source identifier')),'continuation sources');
 const citation=c=>{
  if(!c||typeof c!=='object'||!documentIds.includes(c.documentId)||!Number.isInteger(c.sourceRevision)||c.sourceRevision<1||!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<0||c.end<=c.start||typeof c.text!=='string'||Array.from(c.text).length!==c.end-c.start||!['support','contrast'].includes(c.relation))throw Error('Continuation citations need exact codepoint ranges, source revisions and support/contrast relations.');
  return {documentId:c.documentId,sourceRevision:c.sourceRevision,start:c.start,end:c.end,text:c.text,relation:c.relation};
 };
 const citations=value=>list(value,100,'continuation citations',1).map(citation);
 const meaningUnits=list(input.meaningUnits,500,'meaning units',1).map(u=>({
  id:text(u.id,100,'meaning-unit identifier'),documentId:text(u.documentId,100,'meaning-unit source'),
  lenses:unique(list(u.lenses,6,'meaning-unit lenses',1).map(l=>{if(!LENSES.has(l))throw Error('Choose valid meaning-unit lenses.');return l;}),'meaning-unit lenses'),
  description:text(u.description,12000,'meaning-unit description'),interpretation:text(u.interpretation,12000,'meaning-unit interpretation'),
  qualifications:strings(u.qualifications,'meaning-unit qualifications'),accountType:text(u.accountType,200,'account type'),citations:citations(u.citations)
 }));
 unique(meaningUnits.map(u=>u.id),'meaning-unit identifiers');
 if(meaningUnits.some(u=>!documentIds.includes(u.documentId)||u.citations.some(c=>c.documentId!==u.documentId)))throw Error('Meaning-unit quotations must belong to their selected source.');
 const contrasts=list(input.contrasts,100,'contrasts').map(c=>({id:text(c.id,100,'contrast identifier'),title:text(c.title,200,'contrast title'),type:text(c.type,200,'contrast type'),description:text(c.description,12000,'contrast description'),interpretation:text(c.interpretation,12000,'contrast interpretation'),limitations:strings(c.limitations,'contrast limitations'),citations:citations(c.citations)}));
 unique(contrasts.map(c=>c.id),'contrast identifiers');
 if(contrasts.some(c=>!c.citations.some(e=>e.relation==='support')||!c.citations.some(e=>e.relation==='contrast')))throw Error('A contrast needs both supporting and contrasting citations.');
 const propositions=list(input.propositions,50,'propositions',1).map(p=>({
  id:text(p.id,100,'proposition identifier'),title:text(p.title,200,'proposition title'),
  descriptions:list(p.descriptions,50,'source descriptions',1).map(d=>({documentId:text(d.documentId,100,'description source'),text:text(d.text,12000,'source description')})),
  interpretation:text(p.interpretation,12000,'proposition interpretation'),context:strings(p.context,'proposition context'),alternatives:strings(p.alternatives,'alternative explanations'),limits:strings(p.limits,'proposition limits'),checks:strings(p.checks,'proposition checks'),citations:citations(p.citations)
 }));
 unique(propositions.map(p=>p.id),'proposition identifiers');
 for(const p of propositions){unique(p.descriptions.map(d=>d.documentId),'proposition description sources');if(p.descriptions.some(d=>!documentIds.includes(d.documentId)))throw Error('Describe sources in the continuation scope.');if(p.descriptions.some(d=>!p.citations.some(c=>c.documentId===d.documentId)))throw Error('Every described source needs its own exact proposition evidence.');}
 const cells=list(input.cells,300,'continuation cells',1).map(c=>{
  const limitations=Array.isArray(c.limitations)?strings(c.limitations,'chart limitations').join('\n'):c.limitations;
  if(typeof limitations!=='string'||limitations.length>12000)throw Error('Write bounded chart limitations.');
  return {documentId:text(c.documentId,100,'chart source'),themeId:text(c.themeId,100,'chart category'),summary:text(c.summary,12000,'chart summary'),limitations:limitations.trim(),evidence:citations(c.evidence)};
 });
 unique(cells.map(c=>JSON.stringify([c.documentId,c.themeId])),'continuation chart cells');
 if(cells.some(c=>!documentIds.includes(c.documentId)||c.evidence.some(e=>e.documentId!==c.documentId)))throw Error('Chart quotations must belong to their selected source.');
 if(input.review?.mode!=='independent-agent-review')throw Error('Continuation review must remain independent-agent-review, not human verification.');
 return {id:text(input.id,100,'continuation identifier'),name:text(input.name,200,'continuation name'),method:text(input.method,200,'continuation method'),scope:text(input.scope,12000,'continuation scope'),documentIds,baseStudyId:text(input.baseStudyId,100,'base framework identifier'),meaningUnits,contrasts,propositions,limits:strings(input.limits,'continuation limits'),review:{mode:'independent-agent-review',note:text(input.review.note,12000,'agent review note')},cells};
}
const allCitations=run=>[...run.meaningUnits.flatMap(u=>u.citations),...run.contrasts.flatMap(c=>c.citations),...run.propositions.flatMap(p=>p.citations),...run.cells.flatMap(c=>c.evidence)];
export function continuationCitationCurrent(state,citation){
 const document=state.documents.find(d=>d.id===citation?.documentId);
 return !!document&&document.sourceRole!=='reference'&&!document.deletedAt&&document.reviewStatus!=='restricted'&&citationCurrent(state,citation);
}

export function continuationCurrent(state,run){
 try{
  const normalized=normalizeContinuationInput(run);
  return normalized.documentIds.every(id=>state.documents.some(d=>d.id===id&&d.sourceRole!=='reference'&&!d.deletedAt&&d.reviewStatus!=='restricted'))&&allCitations(normalized).every(c=>continuationCitationCurrent(state,c));
 }catch{return false;}
}
export function sameContinuationInput(saved,incoming){
 try{return JSON.stringify(normalizeContinuationInput(saved))===JSON.stringify(normalizeContinuationInput(incoming));}catch{return false;}
}
export function validateContinuationState(state){
 if(state.analysisContinuations===undefined)return true;
 const runs=list(state.analysisContinuations,1000,'saved analysis continuations');
 unique(runs.map(r=>r.id),'saved continuation identifiers');
 for(const run of runs){normalizeContinuationInput(run);if(run.frameworkStudyId!==`${run.id}-framework`||run.status!=='agent-reviewed'||typeof run.createdBy!=='string'||typeof run.createdAt!=='string')throw Error('Invalid saved continuation provenance.');}
 return true;
}

export function applyContinuationOperation(state,op,actor,role,{uid=()=>crypto.randomUUID()}={}){
 if(op.type!=='framework.continuation.add')return false;
 if(!['owner','reviewer'].includes(role))throw Error('Reviewer access is required for analysis continuation.');
 const run=normalizeContinuationInput(op.data);
 const previous=(state.analysisContinuations||[]).find(r=>r.id===run.id);
 if(previous){if(!sameContinuationInput(previous,run))throw Error('A different continuation already uses this identifier.');return true;}
 if(!continuationCurrent(state,run))throw Error('Continuation evidence changed or is restricted. Select exact current source quotations.');
 const base=(state.frameworkStudies||[]).find(s=>s.id===run.baseStudyId);
 if(!base||base.themes?.length!==6)throw Error('Choose a base Framework study with six categories.');
 const studyId=`${run.id}-framework`;
 if((state.frameworkStudies||[]).some(s=>s.id===studyId))throw Error('The continuation Framework identifier already exists.');
 if(run.documentIds.some(id=>base.documentIds?.length&&!base.documentIds.includes(id)))throw Error('Continuation sources must belong to the base Framework scope.');
 if(run.cells.length!==run.documentIds.length*base.themes.length||run.documentIds.some(id=>base.themes.some(t=>!run.cells.some(c=>c.documentId===id&&c.themeId===t.id))))throw Error('Provide one continuation cell for each source and base category.');
 const saved={...run,frameworkStudyId:studyId,status:'agent-reviewed',createdBy:actor,createdAt:new Date().toISOString()};
 boundedRun(saved);
 // Stage the native Framework operations so a failure cannot leave a partial run/study.
 const staged={...state,frameworkStudies:structuredClone(state.frameworkStudies||[]),frameworkCells:structuredClone(state.frameworkCells||[])};
 applyFrameworkOperation(staged,{type:'framework.study.save',data:{id:studyId,name:run.name,researchQuestion:base.researchQuestion,documentIds:run.documentIds,themes:base.themes.map(t=>({id:t.id,title:t.title,codeIds:[...t.codeIds]})),methodNotes:`${run.method}\n${run.scope}\nIndependent agent review only; source and human verification remain separate.`,stages:[]}},actor,role,{uid});
 for(const cell of run.cells){
  applyFrameworkOperation(staged,{type:'framework.cell.save',data:{...cell,studyId,finding:'observed'}},actor,role,{uid});
  const created=staged.frameworkCells.find(c=>c.studyId===studyId&&c.documentId===cell.documentId&&c.themeId===cell.themeId);
  applyFrameworkOperation(staged,{type:'framework.cell.review',data:{studyId,id:created.id,status:'agent-reviewed',note:run.review.note}},actor,role,{uid});
 }
 state.frameworkStudies=staged.frameworkStudies;
 state.frameworkCells=staged.frameworkCells;
 state.analysisContinuations=[...(state.analysisContinuations||[]),saved];
 return true;
}
