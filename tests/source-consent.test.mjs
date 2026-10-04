import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperation,emptyState} from '../src/domain.mjs';
import {consentAnchorCurrent,consentMarkers,passageConsentRestricted,restrictedSourceRanges} from '../src/source-consent.mjs';
import {scopedCodings} from '../src/analysis-domain.mjs';
import {annotatedSourceHTML} from '../src/annotated-source-export.mjs';

const actor='Synthetic reviewer',sourceText='😀 Public. Private. Ending.';
function fixture(){return applyOperation(emptyState(),{type:'source.import',data:{name:'Synthetic Unicode source',text:sourceText}},actor);}
const flagData=state=>({id:state.documents[0].id,start:10,end:18,text:'Private.',sourceRevision:state.documents[0].revision,note:'Synthetic passage requires explicit authorization.'});
const flag=state=>applyOperation(state,{type:'source.consent.flag',data:flagData(state)},actor);
const decide=(state,status)=>applyOperation(state,{type:'source.consent.decide',data:{id:state.documents[0].id,flagId:state.documents[0].consentDecisions[0].id,status,note:'Synthetic scope decision: '+status}},actor);

test('Reviewer decisions include and withhold exact Unicode scopes with immutable reasoning history',()=>{
 let state=flag(fixture());const original=structuredClone(state),id=state.documents[0].id;
 assert.equal(state.documents[0].consentDecisions[0].status,'pending');assert.equal(passageConsentRestricted(state.documents[0],{start:10,end:18}),true);
 state=decide(state,'included');assert.equal(state.documents[0].reviewFlags.length,0);assert.equal(passageConsentRestricted(state.documents[0],{start:10,end:18}),false);assert.deepEqual(original.documents[0].consentDecisions[0].history,[]);
 state=decide(state,'withheld');const record=state.documents[0].consentDecisions[0];
 assert.equal(record.status,'withheld');assert.equal(record.history.length,2);assert.deepEqual(record.history.map(h=>h.status),['pending','included']);assert.ok(record.history.every(h=>h.changedBy===actor&&h.decisionNote));
 assert.equal(state.documents[0].text,sourceText);assert.equal(state.documents[0].id,id);assert.equal(state.documents[0].reviewFlags.length,1);
});

test('Flagging existing coded evidence removes it from analysis and annotated exports until included',()=>{
 let state=applyOperation(fixture(),{type:'code.create',data:{name:'Synthetic code'}},actor);
 state=applyOperation(state,{type:'coding.create',data:{documentId:state.documents[0].id,start:10,end:18,text:'Private.',codeIds:[state.codes[0].id]}},actor);
 assert.equal(scopedCodings(state).length,1);
 state=flag(state);assert.equal(scopedCodings(state).length,0);let report=annotatedSourceHTML(state,state.documents[0].id);assert.ok(!report.includes('Private.'));assert.ok(report.includes('Public.'));assert.match(report,/Passage withheld/);
 state=decide(state,'included');assert.equal(scopedCodings(state).length,1);assert.match(annotatedSourceHTML(state,state.documents[0].id),/Private\./);
 state=decide(state,'withheld');assert.equal(scopedCodings(state).length,0);assert.ok(!annotatedSourceHTML(state,state.documents[0].id).includes('Private.'));
});

test('Text edits crossing an included scope suspend authorization and preserve the prior exact decision',()=>{
 let state=decide(flag(fixture()),'included');const record=structuredClone(state.documents[0].consentDecisions[0]),id=state.documents[0].id;
 state=applyOperation(state,{type:'source.revise',data:{id,text:'😀 Public. Changed private. Ending.'}},actor);
 const changed=state.documents[0].consentDecisions[0];assert.equal(changed.status,'pending');assert.equal(changed.anchorStatus,'needs_review');assert.equal(consentAnchorCurrent(state.documents[0],changed),false);
 assert.deepEqual(changed.originalAnchor,{start:record.start,end:record.end,text:record.text,sourceRevision:record.sourceRevision});assert.equal(changed.history.at(-1).status,'included');assert.equal(changed.history.at(-1).event,'source-edit');assert.equal(changed.history.at(-1).changedBy,actor);assert.equal(state.documents[0].reviewFlags[0].status,'pending');
 assert.equal(passageConsentRestricted(state.documents[0],{start:10,end:25}),true);assert.throws(()=>decide(state,'included'),/Re-anchor/);
 state=applyOperation(state,{type:'source.consent.reanchor',data:{id,flagId:changed.id,start:10,end:26,text:'Changed private.',sourceRevision:2,note:'Synthetic reviewed scope after correction.'}},actor);
 assert.equal(state.documents[0].consentDecisions[0].status,'pending');assert.equal(consentAnchorCurrent(state.documents[0],state.documents[0].consentDecisions[0]),true);
 state=decide(state,'included');assert.equal(state.documents[0].reviewFlags.length,0);assert.equal(state.documents[0].consentDecisions[0].history.at(-1).status,'pending');
});

test('Edits before a withheld Unicode passage shift scope while keeping restriction and revision current',()=>{
 let state=decide(flag(fixture()),'withheld');const id=state.documents[0].id;
 state=applyOperation(state,{type:'source.revise',data:{id,text:'Intro '+sourceText}},actor);
 const doc=state.documents[0],record=doc.consentDecisions[0];assert.equal(record.start,16);assert.equal(record.end,24);assert.equal(record.text,'Private.');assert.equal(record.sourceRevision,2);assert.equal(doc.reviewFlags[0].sourceRevision,2);assert.equal(consentAnchorCurrent(doc,record),true);
 assert.equal(passageConsentRestricted(doc,{start:16,end:24}),true);assert.equal(passageConsentRestricted(doc,{start:0,end:10}),false);
 state=decide(state,'included');assert.equal(state.documents[0].reviewFlags.length,0);
});

test('Consent writes require reviewer authority, exact current bounds, valid decisions and a reason',()=>{
 const state=fixture(),data=flagData(state);
 assert.throws(()=>applyOperation(state,{type:'source.consent.flag',data},'coder','coder'),/Reviewer access/);
 assert.throws(()=>applyOperation(state,{type:'source.consent.flag',data},'viewer','viewer'),/Read-only/);
 for(const changes of [{start:9},{end:100},{sourceRevision:0},{text:'Invented'},{start:10.1}])assert.throws(()=>applyOperation(state,{type:'source.consent.flag',data:{...data,...changes}},actor),/exact current/);
 assert.throws(()=>applyOperation(state,{type:'source.consent.flag',data:{...data,note:' '}},actor),/authorization scope/);
 const pending=flag(state);assert.throws(()=>decide(pending,'public'),/pending, included or withheld/);
 assert.equal(state.documents[0].consentDecisions.length,0);
});

test('Marker suggestions use codepoints without automatically restricting hypothetical or explicit speech',()=>{
 const doc={revision:3,text:'😀 Maybe on or off the record later. This is off-the-record now. Do not quote. Not for attribution.'};
 const markers=consentMarkers(doc);assert.equal(markers.length,4);assert.equal(markers[0].start,14);
 for(const marker of markers){assert.equal(Array.from(doc.text).slice(marker.start,marker.end).join(''),marker.text);assert.equal(marker.sourceRevision,3);}
 assert.deepEqual(restrictedSourceRanges(doc),[]);
 const broken={...doc,reviewFlags:[{start:0,end:10000,status:'pending'}]};assert.equal(passageConsentRestricted(broken,{start:0,end:1}),true);
});
