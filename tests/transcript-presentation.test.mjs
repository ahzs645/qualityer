import test from 'node:test';
import assert from 'node:assert/strict';
import {transcriptReadingRows,chunksForRow,displayCodebook,speakerColor,speakerTimeline,readableInk} from '../src/transcript-presentation.mjs';
import {slice,cp} from '../src/domain.mjs';
const document=()=>({id:'d',revision:1,text:'A😀 café. Next sentence!\r\nمرحبا؟\nLast fragment',mediaKey:'p/recording',alignment:{status:'matched',recordingKey:'p/recording'},turns:[{id:'t0',start:0,end:23,speaker:'Speaker 1',timeStart:0,timeEnd:4},{id:'t1',start:25,end:31,speaker:'Speaker 2',timeStart:4,timeEnd:7}]});
test('Sentence and segment layouts preserve every Unicode character, including gaps, CRLF and incomplete speech',()=>{
 const d=document(),before=structuredClone(d);
 for(const mode of ['sentences','segments']){const rows=transcriptReadingRows(d,mode);assert.equal(rows.map(r=>r.text).join(''),d.text);assert.equal(rows[0].start,0);assert.equal(rows.at(-1).end,cp(d.text).length);for(const row of rows)assert.equal(row.text,slice(d.text,row.start,row.end));for(let i=1;i<rows.length;i++)assert.equal(rows[i-1].end,rows[i].start);}
 assert.deepEqual(d,before);assert.ok(transcriptReadingRows(d).length>transcriptReadingRows(d,'segments').length);
 assert.equal(transcriptReadingRows(d).at(-1).unitKind,'fragment');
});
test('Reading layouts show only supplied current speaker and segment timing; unknown and stale anchors remain unknown',()=>{
 const d=document();d.turns[0].anchorStatus='needs_review';const rows=transcriptReadingRows(d);assert.deepEqual(rows[0].speakers,['Unassigned']);assert.equal(rows[0].timeStart,null);
 d.turns[0].anchorStatus=undefined;d.alignment.recordingKey='different';assert.ok(transcriptReadingRows(d).every(r=>r.timeStart===null));
});
test('Multi-code chunks split at display boundaries without losing overlapping decisions or Unicode anchors',()=>{
 const text='A😀 café. Next.',chunks=[{start:0,end:cp(text).length,text,applied:[{codeId:'one'},{codeId:'two'}]}],rows=[{start:0,end:8},{start:8,end:cp(text).length}],parts=rows.flatMap(row=>chunksForRow(row,chunks));
 assert.equal(parts.map(p=>p.text).join(''),text);assert.ok(parts.every(p=>p.applied.length===2));assert.equal(parts[1].start,8);
});
test('Display palette distinguishes a monochrome codebook consistently while preserving saved colors and source records',()=>{
 const codes=Array.from({length:12},(_,i)=>({id:'code-'+i,name:'Category '+i,color:'#397d7b'})),before=structuredClone(codes),display=displayCodebook(codes);
 assert.equal(new Set(display.map(c=>c.color)).size,12);assert.deepEqual(codes,before);assert.deepEqual(displayCodebook(codes,'saved'),codes);
 const reversed=displayCodebook([...codes].reverse());assert.ok(display.every(c=>reversed.find(r=>r.id===c.id).color===c.color));assert.equal(readableInk('#ffffff'),'#172c38');assert.equal(readableInk('#007a87'),'#fff');
 assert.ok(displayCodebook(Array.from({length:40},(_,i)=>({id:'category-'+i}))).every(c=>/^#[0-9a-f]{6}$/u.test(c.color)));
});
test('Speaker colors remain stable across views, unknown is neutral, and stale diarization never becomes playable',()=>{
 assert.equal(speakerColor('Speaker 1'),speakerColor('Speaker 1'));assert.notEqual(speakerColor('Speaker 1'),speakerColor('Speaker 2'));assert.equal(speakerColor('Unassigned'),speakerColor(null));
 const d=document();assert.equal(speakerTimeline(d).kind,'transcript');assert.equal(speakerTimeline(d).rows.length,2);
 d.diarization={recordingKey:'other',regular:[{timeStart:0,timeEnd:4,speaker:'Speaker 1'}]};assert.equal(speakerTimeline(d).kind,'stale');assert.equal(speakerTimeline(d).rows.length,0);
 d.diarization.recordingKey=d.mediaKey;assert.equal(speakerTimeline(d).kind,'diarization');assert.equal(speakerTimeline(d).rows.length,1);assert.equal(speakerTimeline(d,'exclusive').rows.length,0);
});

test('a detached recording says so instead of blaming another recording',()=>{
 const d={id:'x',text:'Hi.\n',turns:[],mediaKey:null,mediaType:'audio/mp4',diarization:{recordingKey:'old/key',regular:[{timeStart:0,timeEnd:1,speaker:'Speaker 1'}]}};
 const t=speakerTimeline(d);assert.equal(t.kind,'unavailable');assert.match(t.message,/No recording is attached/);
});
