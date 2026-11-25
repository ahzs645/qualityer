import test from 'node:test';
import assert from 'node:assert/strict';
import {correctSpeakers} from '../src/speaker-tracks.mjs';
const doc=mediaKey=>({id:'d',revision:2,text:'Hello there.\nYes.\n',mediaKey,diarization:{runId:'run1',recordingKey:'old/rec',regular:[]},turns:[{id:'t1',start:0,end:12,speaker:'Speaker 1',speakerRunId:'run1',speakerAssignment:{runId:'run1',status:'machine-estimate'}},{id:'t2',start:13,end:17,speaker:'Speaker 2',speakerRunId:'run1'}]});
test('a reviewer can record a transcript-only label when the recording is not in the project',()=>{
 const out=correctSpeakers(doc(null),{sourceId:'d',sourceRevision:2,turnIds:['t1'],to:'Interviewer',note:'Asks the questions throughout.',transcriptOnly:true},'rev');
 const t=out.turns.find(t=>t.id==='t1');assert.equal(t.speaker,'Interviewer');assert.equal(t.rawSpeaker,'Speaker 1');assert.equal(t.speakerAssignment.sourceBasis,'transcript-only');assert.equal(t.speakerAssignment.detachedFromRun,'run1');
 assert.equal(out.speakerMappings.at(-1).sourceBasis,'transcript-only');
});
test('transcript-only labels are refused when a recording is attached, without a reason, for intervals or a stale revision',()=>{
 assert.throws(()=>correctSpeakers(doc('p/rec'),{sourceId:'d',sourceRevision:2,turnIds:['t1'],to:'X',note:'n',transcriptOnly:true}),/only for sources whose recording is not/);
 assert.throws(()=>correctSpeakers(doc(null),{sourceId:'d',sourceRevision:2,turnIds:['t1'],to:'X',note:' ',transcriptOnly:true}),/needs the current source revision/);
 assert.throws(()=>correctSpeakers(doc(null),{sourceId:'d',sourceRevision:1,turnIds:['t1'],to:'X',note:'n',transcriptOnly:true}),/needs the current source revision/);
 assert.throws(()=>correctSpeakers(doc(null),{sourceId:'d',sourceRevision:2,turnIds:['t1'],intervalIds:['i'],to:'X',note:'n',transcriptOnly:true}),/needs the current source revision|interval/i);
 assert.throws(()=>correctSpeakers(doc(null),{sourceId:'d',sourceRevision:2,turnIds:['t1'],to:'X',note:'n'}),/Review the current source revision/);
});
