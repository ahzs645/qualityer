import test from 'node:test';
import assert from 'node:assert/strict';
import {frameworkCellCurrent} from '../src/framework-method.mjs';
import {applyOperation,emptyState,validateState} from '../src/domain.mjs';
import {applyContinuationOperation,continuationCurrent,continuationCitationCurrent,sameContinuationInput,MAX_CONTINUATION_BYTES} from '../src/analysis-continuation.mjs';
import {unzipSync} from 'fflate';
import {exportProjectArchive,readProjectArchive} from '../src/project-archive.mjs';
import {teamAccess,visibleProjectState} from '../src/team-policy.mjs';

const actor='Synthetic analyst';
function fixture(){
 let state=emptyState('Synthetic continuation fixture');
 for(const symbol of ['😀','🌲'])state=applyOperation(state,{type:'source.import',data:{name:`Synthetic ${symbol} account`,text:`${symbol} Support. Qualification.`}},actor);
 for(let n=0;n<6;n++)state=applyOperation(state,{type:'code.create',data:{name:`Synthetic category ${n}`}},actor);
 state=applyOperation(state,{type:'framework.study.save',data:{id:'base',name:'Synthetic baseline',researchQuestion:'What qualifications accompany the account?',documentIds:state.documents.map(d=>d.id),themes:state.codes.map((c,n)=>({id:`t${n}`,title:`Category ${n}`,codeIds:[c.id],interpretation:'Baseline-only interpretation metadata.'}))}},actor);
 const doc=state.documents[0];
 state=applyOperation(state,{type:'coding.create',data:{documentId:doc.id,start:0,end:10,text:'😀 Support.',sourceRevision:1,codeIds:[state.codes[0].id]}},actor);
 return applyOperation(state,{type:'framework.cell.save',data:{studyId:'base',documentId:doc.id,themeId:'t0',finding:'observed',summary:'Original baseline summary.',limitations:'Synthetic data.',evidence:[citation(doc)]}},actor);
}
function citation(doc,relation='support'){
 const start=relation==='support'?0:11,end=relation==='support'?10:25;
 return {documentId:doc.id,sourceRevision:doc.revision,start,end,text:Array.from(doc.text).slice(start,end).join(''),relation};
}
function input(state){
 return {id:'synthetic-run',name:'Synthetic continuation',method:'Framework Method continuation',scope:'Two synthetic accounts; interpretations remain provisional.',documentIds:state.documents.map(d=>d.id),baseStudyId:'base',
  meaningUnits:state.documents.map((d,n)=>({id:`mu${n}`,documentId:d.id,lenses:['experiences','constraints'],description:'The synthetic source includes support.',interpretation:'A provisional interpretation qualified by context.',qualifications:['No external corroboration.'],accountType:'reported-account',citations:[citation(d)]})),
  contrasts:[{id:'contrast',title:'Synthetic qualification',type:'within-source-qualification',description:'The source supplies qualification.',interpretation:'This is contextual qualification, not a factual contradiction.',limitations:['Synthetic text only.'],citations:[citation(state.documents[0]),citation(state.documents[0],'contrast')]}],
  propositions:[{id:'proposition',title:'Synthetic analytical proposition',descriptions:state.documents.map(d=>({documentId:d.id,text:'A descriptive source account.'})),interpretation:'A provisional cross-source relationship.',context:['Synthetic setting.'],alternatives:['Another explanation is possible.'],limits:['No verified effect.'],checks:['Verify the source before a final decision.'],citations:state.documents.map(d=>citation(d))}],
  limits:['Independent agent review is not human or audio verification.'],review:{mode:'independent-agent-review',note:'Synthetic independent interpretation review; source verification remains pending.'},
  cells:state.documents.flatMap(d=>state.frameworkStudies[0].themes.map(t=>({documentId:d.id,themeId:t.id,summary:'Provisional synthetic category account.',limitations:'Synthetic account only.',evidence:[citation(d),citation(d,'contrast')]})))
 };
}
const add=(state,run=input(state),role='owner')=>applyOperation(state,{type:'framework.continuation.add',data:run},actor,role);

test('Continuation atomically adds immutable run and twelve agent-reviewed cells without changing baseline',()=>{
 const original=fixture(),run=input(original),state=add(original,run);
 assert.deepEqual(state.documents,original.documents);assert.deepEqual(state.codes,original.codes);assert.deepEqual(state.codings,original.codings);
 assert.deepEqual(state.frameworkStudies[0],original.frameworkStudies[0]);assert.deepEqual(state.frameworkCells[0],original.frameworkCells[0]);assert.equal(original.analysisContinuations,undefined);
 assert.equal(state.analysisContinuations.length,1);assert.equal(state.frameworkStudies.length,2);assert.equal(state.frameworkCells.length,13);
 const saved=state.analysisContinuations[0],study=state.frameworkStudies[1];
 assert.equal(saved.frameworkStudyId,'synthetic-run-framework');assert.equal(saved.status,'agent-reviewed');assert.equal(saved.createdBy,actor);assert.equal(continuationCurrent(state,saved),true);
 for(const t of study.themes)assert.deepEqual(Object.keys(t),['id','title','codeIds']);
 for(const c of state.frameworkCells.slice(1)){assert.equal(c.status,'agent-reviewed');assert.equal(c.reviews[0].status,'agent-reviewed');assert.equal(c.reviews[0].reviewer,actor);assert.equal(c.finding,'observed');}
 run.meaningUnits[0].description='Changed after submission.';assert.notEqual(saved.meaningUnits[0].description,run.meaningUnits[0].description);
});

test('Owner/reviewer can add; coder/viewer cannot and input cannot claim human verification',()=>{
 for(const role of ['owner','reviewer'])assert.equal(add(fixture(),undefined,role).analysisContinuations.length,1);
 for(const role of ['coder','viewer']){const s=fixture();assert.throws(()=>add(s,input(s),role),/Reviewer access|Read-only/);assert.equal(s.analysisContinuations,undefined);}
 const s=fixture(),run=input(s);run.review.mode='human-reviewed';assert.throws(()=>add(s,run),/independent-agent-review/);
});

test('Codepoint citations preserve supplementary Unicode and every nested evidence layer is checked',()=>{
 const s=fixture(),run=input(s);assert.equal(run.meaningUnits[0].citations[0].text.length,11);assert.equal(run.meaningUnits[0].citations[0].end,10);
 assert.equal(continuationCurrent(add(s,run),run),true);
 for(const layer of ['meaningUnits','contrasts','propositions','cells']){
  const bad=structuredClone(run),cit=layer==='cells'?bad[layer][0].evidence[0]:bad[layer][0].citations[0];cit.sourceRevision=2;
  assert.throws(()=>add(s,bad),/changed or is restricted/);
 }
 const bad=structuredClone(run);bad.propositions[0].citations[0].text='😀 Missing.';assert.throws(()=>add(s,bad),/changed or is restricted/);
 const utf16=structuredClone(run);utf16.meaningUnits[0].citations[0].end=11;assert.throws(()=>add(s,utf16),/codepoint ranges/);
 const relation=structuredClone(run);relation.contrasts[0].citations[0].relation='fact';assert.throws(()=>add(s,relation),/support\/contrast/);
});

test('Consent restrictions reject new runs and make saved evidence noncurrent without destroying history',()=>{
 const original=fixture(),saved=add(original),doc=original.documents[0];
 const flag={type:'source.consent.flag',data:{id:doc.id,start:0,end:10,text:'😀 Support.',sourceRevision:1,note:'Synthetic pending consent scope.'}};
 const restricted=applyOperation(original,flag,actor);assert.throws(()=>add(restricted,input(original)),/restricted/);
 const historical=applyOperation(saved,flag,actor);assert.equal(continuationCurrent(historical,historical.analysisContinuations[0]),false);assert.deepEqual(historical.analysisContinuations,saved.analysisContinuations);assert.equal(validateState(historical),true);
});

test('Identical normalized retries are idempotent; conflicting same-ID input is rejected',()=>{
 const original=fixture(),run=input(original),saved=add(original,run),again=add(saved,structuredClone(run));assert.deepEqual(again,saved);
 const keysReordered={cells:run.cells,...run,name:'  Synthetic continuation  '};assert.equal(sameContinuationInput(saved.analysisContinuations[0],keysReordered),true);
 const bad=structuredClone(run);bad.propositions[0].interpretation='Different interpretation.';assert.equal(sameContinuationInput(saved.analysisContinuations[0],bad),false);assert.throws(()=>add(saved,bad),/different continuation/);
});

test('Source edits preserve historical run and citations while currentness changes',()=>{
 const saved=add(fixture()),history=structuredClone(saved.analysisContinuations[0]);
 const edited=applyOperation(saved,{type:'source.revise',data:{id:saved.documents[0].id,text:'A changed synthetic source.'}},actor);
 assert.equal(validateState(edited),true);assert.deepEqual(edited.analysisContinuations[0],history);assert.equal(continuationCurrent(edited,history),false);
 // An exact retry does not import new evidence or update the old analysis after a source edit.
 assert.deepEqual(add(edited,history),edited);
});

test('A complete six-category matrix is required and native Framework failures leave direct-call state untouched',()=>{
 const s=fixture(),before=structuredClone(s),run=input(s);run.cells.pop();assert.throws(()=>add(s,run),/one continuation cell/);assert.deepEqual(s,before);
 const badTheme=structuredClone(s);badTheme.frameworkStudies[0].themes[5].codeIds=['missing'];const badBefore=structuredClone(badTheme);
 assert.throws(()=>applyContinuationOperation(badTheme,{type:'framework.continuation.add',data:input(s)},actor,'owner'),/existing code definitions/);assert.deepEqual(badTheme,badBefore);
 const late=structuredClone(s),lateBefore=structuredClone(late),full=input(late);let serial=0;
 assert.throws(()=>applyContinuationOperation(late,{type:'framework.continuation.add',data:full},actor,'reviewer',{uid:()=>{if(++serial===5)throw Error('Synthetic late failure.');return `cell-${serial}`;}}),/Synthetic late failure/);assert.deepEqual(late,lateBefore);
});

test('Bounds reject excessive arrays, oversized byte payloads and duplicate scoped records',()=>{
 const s=fixture(),run=input(s);
 for(const [key,count] of [['meaningUnits',501],['contrasts',101],['propositions',51]]){
  const bad=structuredClone(run);bad[key]=Array.from({length:count},(_,n)=>({...structuredClone(run[key][0]),id:`item-${n}`}));assert.throws(()=>add(s,bad),new RegExp(key==='meaningUnits'?'meaning units':key));
 }
 const oversized={...run,unused:'🌲'.repeat(MAX_CONTINUATION_BYTES/4)};assert.throws(()=>add(s,oversized),/at most 2 MB/);
 const duplicate=structuredClone(run);duplicate.cells[1]=structuredClone(duplicate.cells[0]);assert.throws(()=>add(s,duplicate),/Duplicate/);
 const external=structuredClone(run);external.propositions[0].descriptions[0].documentId='outside-scope';assert.throws(()=>add(s,external),/continuation scope/);
 const broken=add(s);broken.analysisContinuations[0].cells[0].evidence[0].relation='unbounded-fact';assert.throws(()=>validateState(broken),/support\/contrast/);
});

test('Deleted, restricted and reference sources invalidate the shared citation guard and new runs',()=>{
 const original=fixture(),run=input(original),saved=add(original,run);
 for(const change of [{deletedAt:'Synthetic deletion'},{reviewStatus:'restricted'},{sourceRole:'reference'}]){
  const state=structuredClone(saved);Object.assign(state.documents[0],change);
  assert.equal(continuationCitationCurrent(state,run.meaningUnits[0].citations[0]),false);
  assert.equal(continuationCurrent(state,state.analysisContinuations[0]),false);
  assert.equal(validateState(state),true);
  assert.throws(()=>add(state,{...run,id:'a-new-synthetic-run'}),/restricted/);
 }
 assert.equal(continuationCitationCurrent(saved,null),false);
});

test('Native project ZIP retains current and historical stale continuations and Framework cells',async()=>{
 const saved=add(fixture());
 const edited=applyOperation(saved,{type:'source.revise',data:{id:saved.documents[0].id,text:'Synthetic revised source.'}},actor);
 for(const state of [saved,edited]){
  const restored=await readProjectArchive(unzipSync(await exportProjectArchive(state)));
  assert.deepEqual(restored.state,JSON.parse(JSON.stringify(state)));assert.equal(validateState(restored.state),true);
  assert.deepEqual(restored.state.analysisContinuations,state.analysisContinuations);
  assert.deepEqual(restored.state.frameworkCells,state.frameworkCells);
  assert.equal(continuationCurrent(restored.state,restored.state.analysisContinuations[0]),state===saved);
 }
});

test('Blind-coding allowlist omits continuation interpretations and derived Framework data',()=>{
 const state=add(fixture());state.settings.teamAccess={blindCoding:true};
 const visible=visibleProjectState(state,teamAccess(state,'coder',{id:'Synthetic blind coder'}));
 assert.equal(visible.analysisContinuations,undefined);assert.equal(visible.frameworkStudies,undefined);assert.equal(visible.frameworkCells,undefined);
 assert.ok(!JSON.stringify(visible).includes('A provisional cross-source relationship.'));
 assert.equal(state.analysisContinuations.length,1);
});

test('Every described proposition account requires source evidence and whole-source restrictions also hide linked Framework cells',()=>{
 const state=fixture(),run=input(state),bad=structuredClone(run);bad.propositions[0].citations=bad.propositions[0].citations.filter(c=>c.documentId===state.documents[0].id);
 assert.throws(()=>add(state,bad),/Every described source/);
 const saved=add(state,run),restricted=structuredClone(saved);restricted.documents[0].reviewStatus='restricted';
 assert.equal(continuationCurrent(restricted,restricted.analysisContinuations[0]),false);
 for(const cell of restricted.frameworkCells.filter(c=>c.documentId===restricted.documents[0].id))assert.equal(frameworkCellCurrent(restricted,cell),false);
 const deleted=structuredClone(saved);deleted.documents[0].deletedAt='synthetic-date';for(const cell of deleted.frameworkCells.filter(c=>c.documentId===deleted.documents[0].id))assert.equal(frameworkCellCurrent(deleted,cell),false);
});
