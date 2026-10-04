import test from 'node:test';
import assert from 'node:assert/strict';
import {transcriptionQuality} from '../src/transcript-quality.mjs';
test('native ASR triage preserves supplied probabilities and excludes alignment scores',()=>{
 const document={text:'hello world',turns:[{id:'t',start:0,end:11,timeStart:0,words:[{word:'hello',probability:.2},{word:' world',probability:1},{word:'ignored',score:.01},{word:'nan',probability:NaN}]}]};
 const report=transcriptionQuality(document);
 assert.equal(report.scoredWords,2);assert.equal(report.unscoredWords,2);assert.equal(report.flaggedWords,1);assert.equal(report.rows[0].timeStart,0);assert.equal(report.bins[9].count,1);
 assert.equal(transcriptionQuality(document,.1).rows.length,0);
});
test('explicit faster backend score is native probability and stale anchors do not create priorities',()=>{
 const document={text:'abc',revision:2,transcriptMetadata:{provider:{engine:'faster-whisper'}},turns:[{id:'stale',start:0,end:3,sourceRevision:1,words:[{word:'abc',score:.1}]},{id:'valid',start:0,end:3,sourceRevision:2,words:[{word:'abc',score:.2}]}]};
 assert.equal(transcriptionQuality(document).rows.length,1);assert.equal(transcriptionQuality(document).rows[0].turnId,'valid');
 assert.throws(()=>transcriptionQuality(document,-1));
});
