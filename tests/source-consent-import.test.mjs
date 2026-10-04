import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperation,emptyState,validateState} from '../src/domain.mjs';
import {timestampedTranscript} from '../src/transcript.mjs';
import {transcriptExport} from '../src/transcript-alignment.mjs';
import {consentAnchorCurrent,passageConsentRestricted} from '../src/source-consent.mjs';

const actor='Synthetic reviewer';
function fixture(){
 let state=applyOperation(emptyState(),{type:'source.import',data:{name:'Synthetic source',text:'😀 Public. Private. Ending.',revision:4}},actor);
 const id=state.documents[0].id;
 state=applyOperation(state,{type:'source.consent.flag',data:{id,start:10,end:18,text:'Private.',sourceRevision:4,note:'Synthetic restriction for consent round-trip review.'}},actor);
 return state;
}
function roundTrip(state){return applyOperation(emptyState(),{type:'source.import',data:{name:'Reimported synthetic source',...timestampedTranscript(JSON.parse(JSON.stringify(transcriptExport(state.documents[0]))))}},actor);}

test('Canonical transcript reimport preserves restriction, source revision and full decision history',()=>{
 let state=fixture(),doc=state.documents[0],flagId=doc.consentDecisions[0].id;
 state=applyOperation(state,{type:'source.consent.decide',data:{id:doc.id,flagId,status:'withheld',note:'Synthetic explicit withholding.'}},actor);
 const imported=roundTrip(state),next=imported.documents[0];
 assert.equal(next.revision,4);assert.deepEqual(next.reviewFlags,JSON.parse(JSON.stringify(state.documents[0].reviewFlags)));assert.deepEqual(next.consentDecisions,JSON.parse(JSON.stringify(state.documents[0].consentDecisions)));
 assert.equal(consentAnchorCurrent(next,next.consentDecisions[0]),true);assert.equal(passageConsentRestricted(next,{start:10,end:18}),true);
 assert.throws(()=>applyOperation(imported,{type:'code.create',data:{name:'Code'}},actor,'viewer'),/Read-only/);
 const coded=applyOperation(imported,{type:'code.create',data:{name:'Synthetic code'}},actor);
 assert.throws(()=>applyOperation(coded,{type:'coding.create',data:{documentId:next.id,start:10,end:18,text:'Private.',codeIds:[coded.codes[0].id]}},actor),/consent review|withheld/);
 const included=applyOperation(imported,{type:'source.consent.decide',data:{id:next.id,flagId,status:'included',note:'Synthetic authorized inclusion after reimport.'}},actor);
 assert.equal(passageConsentRestricted(included.documents[0],{start:10,end:18}),false);assert.equal(included.documents[0].consentDecisions[0].history.length,2);
});

test('Included consent authorization remains current through transcript export and import',()=>{
 let state=fixture();const doc=state.documents[0];
 state=applyOperation(state,{type:'source.consent.decide',data:{id:doc.id,flagId:doc.consentDecisions[0].id,status:'included',note:'Synthetic inclusion authorization.'}},actor);
 const next=roundTrip(state).documents[0];assert.equal(next.reviewFlags.length,0);assert.equal(next.consentDecisions[0].status,'included');assert.equal(consentAnchorCurrent(next,next.consentDecisions[0]),true);
});

test('Same-text transcription revision preserves current decisions and never revives stale decisions',()=>{
 let state=fixture();const id=state.documents[0].id,flagId=state.documents[0].consentDecisions[0].id;
 state=applyOperation(state,{type:'source.transcript',data:{id,text:state.documents[0].text,turns:[]}},actor);
 assert.equal(state.documents[0].revision,5);assert.equal(state.documents[0].consentDecisions[0].sourceRevision,5);assert.equal(state.documents[0].reviewFlags[0].sourceRevision,5);
 state=applyOperation(state,{type:'source.consent.decide',data:{id,flagId,status:'included',note:'Current synthetic inclusion.'}},actor);
 state=applyOperation(state,{type:'source.revise',data:{id,text:'😀 Public. Changed private. Ending.'}},actor);
 const stale=structuredClone(state.documents[0].consentDecisions[0]);
 state=applyOperation(state,{type:'source.transcript',data:{id,text:state.documents[0].text,turns:[]}},actor);
 assert.deepEqual(state.documents[0].consentDecisions[0],stale);assert.equal(passageConsentRestricted(state.documents[0],{start:10,end:20}),true);
 assert.throws(()=>applyOperation(state,{type:'source.consent.decide',data:{id,flagId,status:'included',note:'Do not revive stale scope.'}},actor),/Re-anchor/);
});

test('Canonical transcript import rejects invalid revision and consent container types',()=>{
 const data=transcriptExport(fixture().documents[0]);
 for(const revision of [0,-1,1.5,'4'])assert.throws(()=>timestampedTranscript({...data,source:{...data.source,revision}}),/source revision/);
 assert.throws(()=>timestampedTranscript({...data,reviewFlags:{}}),/consent records/);
 assert.throws(()=>timestampedTranscript({...data,consentDecisions:{}}),/consent records/);
});

test('Legacy consent decisions without history normalize before import, display or a later decision',()=>{
 const original=fixture(),exported=transcriptExport(original.documents[0]);delete exported.consentDecisions[0].history;
 exported.reviewFlags.push({start:0,end:2,kind:'legacy-review-flag'});
 const read=timestampedTranscript(exported);assert.deepEqual(read.consentDecisions[0].history,[]);assert.equal(read.reviewFlags.at(-1).kind,'legacy-review-flag');
 let imported=applyOperation(emptyState(),{type:'source.import',data:{name:'Legacy synthetic transcript',...read}},actor);
 const doc=imported.documents[0];imported=applyOperation(imported,{type:'source.consent.decide',data:{id:doc.id,flagId:doc.consentDecisions[0].id,status:'withheld',note:'Synthetic later decision.'}},actor);
 assert.equal(imported.documents[0].consentDecisions[0].history.length,1);
 const archive=structuredClone(original);delete archive.documents[0].consentDecisions[0].history;assert.equal(validateState(archive),true);assert.deepEqual(archive.documents[0].consentDecisions[0].history,[]);
});

test('Canonical consent records reject malformed history and decision shapes without restricting legacy review flags',()=>{
 const data=transcriptExport(fixture().documents[0]);
 for(const history of [{},'history',[null],['invalid entry']])assert.throws(()=>timestampedTranscript({...data,consentDecisions:[{...data.consentDecisions[0],history}]}),/decision history/);
 for(const record of [null,[],{...data.consentDecisions[0],id:''},{...data.consentDecisions[0],status:'approved'}])assert.throws(()=>timestampedTranscript({...data,consentDecisions:[record]}),/decision record/);
 const legacy=timestampedTranscript({...data,consentDecisions:[],reviewFlags:[{start:0,end:2}]});assert.deepEqual(legacy.reviewFlags,[{start:0,end:2}]);
});
