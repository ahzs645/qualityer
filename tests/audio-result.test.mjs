import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAudioResult} from '../server/audio-result.mjs';
test('Worker result validation preserves raw timing, overlaps, zero and missing words',()=>{
 const r={segments:[{text:'α',start:0,end:1.125,words:[{word:'α',start:0,end:null,score:.8},{word:'untimed'}]},{text:'overlap',start:.75,end:1.5},{text:'untimed',start:null}],engine:'whisperx'},before=structuredClone(r);
 assert.equal(validateAudioResult(r),r);assert.deepEqual(r,before);
});
test('Worker rejects invalid segment and word timing and reversed bounds',()=>{
 for(const bad of [false,true,'0',-1,NaN,Infinity,-Infinity,{},[]])for(const field of ['start','end','timeStart','timeEnd','start_time','end_time']){
  assert.throws(()=>validateAudioResult({segments:[{text:'x',[field]:bad}]}),{status:502});
  assert.throws(()=>validateAudioResult({segments:[{text:'x',words:[{word:'x',[field]:bad}]}]}),{status:502});
 }
 for(const segment of [{text:'x',start:2,end:1},{text:'x',timeStart:2,end:1},{text:'x',words:[{word:'x',start:2,end:1}]}])assert.throws(()=>validateAudioResult({segments:[segment]}),{status:502});
});
test('Worker rejects malformed text, words and speaker labels',()=>{
 for(const r of [null,[],{}, {segments:{}},{segments:[null]},{segments:[{text:2}]},{segments:[{text:'x',speaker:2}]},{segments:[{text:'x',words:null}]},{segments:[{text:'x',words:[null]}]},{segments:[{text:'x',words:[{word:2}]}]},{segments:[{text:'x',words:[{word:'x',speaker:2}]}]}])assert.throws(()=>validateAudioResult(r),{status:502});
});
