import test from'node:test';import assert from'node:assert/strict';import{applyOperation,emptyState}from'../src/domain.mjs';import{applySpeakerApplication,sameSpeakerApplication}from'../src/speaker-label-application.mjs';import{transcriptExport}from'../src/transcript-alignment.mjs';
const sha='a'.repeat(64);
function fixture(){const s=emptyState('Synthetic voice study');s.documents=[{id:'d',name:'Synthetic',text:'😀 Yes.\nQuestion?\n',revision:1,mediaKey:'p/audio',mediaType:'audio/wav',alignment:{status:'matched',recordingKey:'p/audio'},attributes:{'Source SHA-256':sha,'Identity status':'Unassigned'},turns:[{id:'t1',start:0,end:7,timeStart:0,timeEnd:3,speaker:'Unassigned',rawSpeaker:'Unassigned'},{id:'t2',start:7,end:17,timeStart:3,timeEnd:5,speaker:'Unassigned',rawSpeaker:'Unassigned'}],excludeAI:true}];return s;}
function payload(){return{id:'d',sourceRevision:1,note:'Synthetic local acoustic inference; unverified anonymous labels.',diarization:{sourceId:'d',recordingKey:'p/audio',runId:'synthetic-run',units:'seconds',regular:[{id:'r1',speaker:'Speaker 1',timeStart:0,timeEnd:2.5},{id:'r2',speaker:'Speaker 2',timeStart:3,timeEnd:5}],exclusive:[],provenance:{method:'Synthetic acoustic fixture',machineEstimated:true,overlapDetection:false,recordingSha256:sha}},assignments:[{turnId:'t1',speaker:'Speaker 1',dominantShare:1,coverage:2.5/3,reason:'Synthetic dominant voice estimate.'},{turnId:'t2',speaker:'Unassigned',dominantShare:1,coverage:1,reason:'Synthetic mixed boundary.'}]};}
const add=(s,p=payload(),role='owner')=>applyOperation(s,{type:'source.diarization.apply',data:p},'synthetic-model-run',role);
test('Acoustic proposals label every existing segment while preserving text, timing, raw labels, source revision and analysis',()=>{
 const s=fixture(),p=payload(),next=add(s,p);const before=s.documents[0],d=next.documents[0];
 assert.equal(d.text,before.text);assert.equal(d.revision,1);assert.equal(d.excludeAI,true);assert.deepEqual(next.codings,s.codings);assert.equal(d.turns.length,2);
 for(let i=0;i<2;i++)for(const key of ['id','start','end','timeStart','timeEnd','rawSpeaker'])assert.deepEqual(d.turns[i][key],before.turns[i][key]);
 assert.equal(d.turns[0].speaker,'Speaker 1');assert.equal(d.turns[0].speakerAssignment.status,'machine-estimate');assert.equal(d.turns[1].speakerAssignment.status,'unresolved');assert.equal(d.turns[0].speakerAssignment.identityVerified,false);assert.equal(d.speakerLabelRuns[0].humanReviewed,false);assert.deepEqual(d.versions[0].turns,before.turns);
 const exported=transcriptExport(d);assert.deepEqual(exported.speakerLabelRuns,d.speakerLabelRuns);assert.deepEqual(exported.turns,d.turns);
});
test('Roles, full turn enumeration, anonymous tracks, recording hashes, timing and identity claims are fenced',()=>{
 for(const role of ['coder','viewer'])assert.throws(()=>add(fixture(),payload(),role),/Reviewer|Read-only/);
 for(const mutate of [p=>p.sourceRevision=2,p=>p.diarization.recordingKey='other/audio',p=>p.diarization.provenance.recordingSha256='b'.repeat(64),p=>p.assignments.pop(),p=>p.assignments[0].turnId='other',p=>p.assignments[0].speaker='Actual Name',p=>p.assignments[0].coverage=2,p=>p.diarization.provenance.identityVerified=true,p=>p.diarization.exclusive=p.diarization.regular]){const p=payload();mutate(p);assert.throws(()=>add(fixture(),p));}
 const s=fixture();s.documents[0].turns[0].timingStatus='needs_review';assert.throws(()=>add(s),/timing/);
});
test('Retries preserve manual corrections; conflicting same run and new runs cannot erase researcher decisions',()=>{
 const saved=add(fixture()),corrected=applyOperation(saved,{type:'source.speaker',data:{id:'d',turnIds:['t1'],sourceRevision:1,recordingKey:'p/audio',runId:'synthetic-run',to:'Reviewed anonymous label',note:'Synthetic listening decision.'}},'researcher','reviewer');
 assert.equal(corrected.documents[0].turns[0].speakerAssignment.status,'researcher-recorded');assert.equal(corrected.documents[0].turns[0].speakerAssignment.identityVerified,false);assert.equal(sameSpeakerApplication(corrected.documents[0],payload()),true);assert.deepEqual(add(corrected),corrected);
 const conflict=payload();conflict.assignments[0].reason='Different decision';assert.throws(()=>add(saved,conflict),/different content/);
 const another=payload();another.diarization.runId='new-run';assert.throws(()=>add(corrected,another),/Researcher speaker decisions/);
});
test('Direct-call failures are atomic and analysis labels cannot manufacture overlap detection',()=>{
 const s=fixture(),before=structuredClone(s.documents[0]),p=payload();p.diarization.regular[1].timeStart=2;
 assert.throws(()=>applySpeakerApplication(s.documents[0],p,'model'),/overlapping/);assert.deepEqual(s.documents[0],before);
});

test('Canonical transcript reimport preserves immutable acoustic provenance without claiming the old source ID is the new one',async()=>{
 const {timestampedTranscript}=await import('../src/transcript.mjs');const original=add(fixture()).documents[0],read=timestampedTranscript(transcriptExport(original));
 assert.deepEqual(read.speakerLabelRuns,original.speakerLabelRuns);assert.equal(read.excludeAI,true);assert.deepEqual(read.attributes,original.attributes);
 const imported=applyOperation(emptyState(),{type:'source.import',data:{...read,name:'Reimported synthetic'}},'owner').documents[0];
 assert.deepEqual(imported.speakerLabelRuns,original.speakerLabelRuns);assert.notEqual(imported.id,original.id);assert.equal(imported.diarization.sourceId,imported.id);assert.equal(imported.diarization.importedSourceId,original.id);assert.equal(imported.speakerLabelRuns[0].input.id,original.id);
});
test('Stale machine label corrections and unsupported interval statistics are refused',()=>{
 const saved=add(fixture()),data={id:'d',turnIds:['t1'],sourceRevision:1,recordingKey:'p/audio',runId:'synthetic-run',to:'Reviewed label'};
 for(const change of [d=>d.mediaKey='p/other',d=>d.revision=2,d=>d.turns[0].timingStatus='needs_review',d=>d.diarization.runId='other-run']){const s=structuredClone(saved);change(s.documents[0]);assert.throws(()=>applyOperation(s,{type:'source.speaker',data},'reviewer','reviewer'));}
 const missingHash=fixture();delete missingHash.documents[0].attributes['Source SHA-256'];assert.throws(()=>add(missingHash),/recording hash/);
 const badStats=payload();badStats.assignments[0].coverage=.95;assert.throws(()=>add(fixture(),badStats),/diagnostics/);
 const mixed=payload();mixed.diarization.regular[0].timeEnd=1.5;mixed.diarization.regular[1].timeStart=1.5; mixed.assignments[0].coverage=1;mixed.assignments[0].dominantShare=.5;assert.throws(()=>add(fixture(),mixed),/Ambiguous/);
});
