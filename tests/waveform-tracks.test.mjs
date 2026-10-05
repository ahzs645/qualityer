import test from 'node:test';import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../src/domain.mjs';
import {teamAccess,authorizeOperation,visibleProjectState} from '../src/team-policy.mjs';
import {secondsAt,pixelAt,clampRange,retimeEdge,nudgeEdge,packRows,codeTrackLayout,MIN_SEGMENT} from '../src/waveform-tracks.mjs';
import {quantizePeaks,dequantizePeaks,validateMediaPeaks,overviewPeaks,peakColumns,peaksURL,peaksBucketsPerSecond,PEAKS_MAX_BUCKETS} from '../src/media-peaks.mjs';

// Synthetic project: one 12-second recording, two codes, two coders. No real interview data.
const fixture=()=>{const s=emptyState('Synthetic tracks');s.codes=[{id:'a',name:'Alpha',color:'#aa3344'},{id:'b',name:'Beta',color:'#3344aa'}];s.documents=[{id:'d',name:'Synthetic tone',text:'One two. Three four.',revision:1,mediaKey:'p/rec',mediaType:'audio/wav',turns:[{id:'t1',start:0,end:8,timeStart:1,timeEnd:3},{id:'t2',start:9,end:20,timeStart:4,timeEnd:6.5}],alignment:{recordingKey:'p/rec',status:'matched',units:'seconds'}}];s.codings=[{id:'m1',documentId:'d',codeId:'a',kind:'media',recordingKey:'p/rec',timeStart:1,timeEnd:4,text:'Recording',coder:'u1',status:'coded',sourceRevision:1},{id:'m2',documentId:'d',codeId:'a',kind:'media',recordingKey:'p/rec',timeStart:3,timeEnd:5,text:'Recording',coder:'u2',status:'coded',sourceRevision:1},{id:'m3',documentId:'d',codeId:'b',kind:'media',recordingKey:'p/rec',timeStart:8,timeEnd:9,text:'Recording',coder:'u2',status:'coded',sourceRevision:1},{id:'old',documentId:'d',codeId:'b',kind:'media',recordingKey:'p/older',timeStart:0,timeEnd:1,text:'Recording',coder:'u1',status:'needs_review',sourceRevision:1},{id:'tx',documentId:'d',codeId:'b',start:9,end:20,text:'Three four.',coder:'u1',status:'coded',sourceRevision:1}];return s;};

test('pixel and seconds conversion is clamped to the recording',()=>{
 assert.equal(secondsAt(250,1000,12),3);assert.equal(secondsAt(-40,1000,12),0);assert.equal(secondsAt(5000,1000,12),12);assert.equal(secondsAt(10,0,12),0);
 assert.equal(pixelAt(3,1000,12),250);assert.equal(pixelAt(20,1000,12),1000);assert.equal(pixelAt(3,1000,0),0);
 for(const t of [0,1.25,6,11.999])assert.ok(Math.abs(secondsAt(pixelAt(t,1440,12),1440,12)-t)<1e-9);
});
test('retime math keeps a minimum duration and stays inside the recording',()=>{
 const seg={start:2,end:5};
 assert.deepEqual(retimeEdge(seg,'start',1.2345,12),{start:1.235,end:5});
 assert.deepEqual(retimeEdge(seg,'start',4.99,12),{start:5-MIN_SEGMENT,end:5});
 assert.deepEqual(retimeEdge(seg,'start',-3,12),{start:0,end:5});
 assert.deepEqual(retimeEdge(seg,'end',30,12),{start:2,end:12});
 assert.deepEqual(retimeEdge(seg,'end',2,12),{start:2,end:2.2});
 assert.deepEqual(retimeEdge(seg,'end',NaN,12),seg);
 assert.deepEqual(retimeEdge(seg,'end',30,undefined),{start:2,end:30},'unknown duration does not invent an upper bound');
 assert.deepEqual(nudgeEdge(seg,'start',-.5,12),{start:1.5,end:5});assert.deepEqual(nudgeEdge(seg,'end',.5,12),{start:2,end:5.5});assert.deepEqual(nudgeEdge({start:0,end:1},'start',-.5,12),{start:0,end:1});
 assert.deepEqual(clampRange(6,2,12),{start:2,end:6});assert.deepEqual(clampRange(11.95,11.96,12),{start:11.8,end:12});assert.deepEqual(clampRange(-1,30,12),{start:0,end:12});assert.throws(()=>clampRange(NaN,2,12));
});
test('lane layout gives one lane per code with sub-rows only for overlaps and hides other recordings',()=>{
 const s=fixture(),l=codeTrackLayout(s,s.documents[0],{actor:'u1',canEdit:true,canReview:false});
 assert.equal(l.withheld,false);assert.deepEqual(l.lanes.map(x=>[x.codeId,x.name,x.color,x.rows]),[['a','Alpha','#aa3344',2],['b','Beta','#3344aa',1]]);
 assert.deepEqual(l.lanes[0].segments.map(x=>[x.id,x.row,x.editable]),[['m1',0,true],['m2',1,false]]);assert.equal(l.otherRecording,1);
 assert.deepEqual(packRows([{start:0,end:2},{start:2,end:3},{start:1,end:4}]).map(x=>x.row),[0,1,0]);
 assert.deepEqual(l.approximate.segments.map(x=>[x.id,x.start,x.end,x.approximate]),[['tx',4,6.5,true]]);
 const reviewer=codeTrackLayout(s,s.documents[0],{actor:'r',canEdit:true,canReview:true});assert.ok(reviewer.lanes.flatMap(x=>x.segments).every(x=>x.editable));
 const viewer=codeTrackLayout(s,s.documents[0],{actor:'u1',canEdit:false});assert.ok(viewer.lanes.flatMap(x=>x.segments).every(x=>!x.editable));
 assert.deepEqual(codeTrackLayout(s,s.documents[0],{extraCodeIds:['b','zz']}).lanes.map(x=>x.codeId),['a','b','zz']);
 const unaligned=fixture();unaligned.documents[0].alignment.status='needs_review';assert.equal(codeTrackLayout(unaligned,unaligned.documents[0]).approximate,null);
});
test('pending or withheld consent restrictions withhold all recording track detail',()=>{
 for(const flag of [{id:'f',start:0,end:3,status:'pending'},{id:'f',start:0,end:3,status:'withheld'},{id:'f',start:0,end:3,status:'included',anchorStatus:'needs_review'}]){const s=fixture();s.documents[0].reviewFlags=[flag];const l=codeTrackLayout(s,s.documents[0],{canEdit:true});assert.equal(l.withheld,true);assert.deepEqual(l.lanes,[]);assert.equal(l.approximate,null);}
 const s=fixture();s.documents[0].reviewFlags=[{id:'f',start:0,end:3,status:'included'}];assert.equal(codeTrackLayout(s,s.documents[0]).withheld,false);
 const r=fixture();r.documents[0].reviewStatus='restricted';assert.equal(codeTrackLayout(r,r.documents[0]).withheld,true);
});

const retime=(id,timeStart,timeEnd,prev,extra={})=>({type:'coding.media.retime',data:{id,timeStart,timeEnd,recordingKey:'p/rec',previousTimeStart:prev[0],previousTimeEnd:prev[1],...extra}});
test('coding.media.retime validates range, recording, staleness and ownership',()=>{
 const s=fixture(),next=applyOperation(s,retime('m1',1.5,4.25,[1,4]),'u1','coder'),c=next.codings.find(x=>x.id==='m1');
 assert.deepEqual([c.timeStart,c.timeEnd,c.recordingKey,c.modifiedBy],[1.5,4.25,'p/rec','u1']);assert.deepEqual(c.retimeHistory.map(h=>[h.timeStart,h.timeEnd,h.actor]),[[1,4,'u1']]);assert.equal(s.codings[0].timeStart,1,'input state is not mutated');
 assert.equal(applyOperation(s,retime('m1',1,4,[1,4]),'u1','coder').codings[0].retimeHistory,undefined,'unchanged ranges add no history');
 for(const [op,pattern] of [[retime('m1',4,4,[1,4]),/valid time range/],[retime('m1',-1,4,[1,4]),/valid time range/],[retime('m1',1,Infinity,[1,4]),/valid time range/],[retime('m1','1',4,[1,4]),/valid time range/],[retime('m1',1,4,[undefined,4]),/valid time range/],[retime('m1',2,3,[1,3.5]),/changed after you selected/],[retime('m1',2,3,[1,4],{recordingKey:'p/older'}),/recording changed/],[retime('old',0,1,[0,1],{recordingKey:'p/older'}),/recording changed/],[retime('tx',0,1,[0,1]),/Recording coding missing/],[retime('missing',0,1,[0,1]),/Recording coding missing/],[retime('m1',1,13,[1,4],{recordingDuration:12}),/ends after the recording/]])assert.throws(()=>applyOperation(s,op,'u1','coder'),pattern);
 assert.equal(applyOperation(s,retime('m1',1,12.02,[1,4],{recordingDuration:12}),'u1','coder').codings[0].timeEnd,12.02,'small decoder tolerance');
 assert.throws(()=>applyOperation(s,retime('m2',3,6,[3,5]),'u1','coder'),/Only a reviewer/);assert.equal(applyOperation(s,retime('m2',3,6,[3,5]),'r','reviewer').codings[1].timeEnd,6);
 assert.throws(()=>applyOperation(s,retime('m1',2,3,[1,4]),'u1','viewer'),/Read-only/);
 const deleted=fixture();deleted.codings[0].deletedAt='2026-01-01';assert.throws(()=>applyOperation(deleted,retime('m1',2,3,[1,4]),'u1','coder'),/missing/);
 const pending=fixture();pending.documents[0].reviewFlags=[{id:'f',start:0,end:3,status:'pending'}];assert.throws(()=>applyOperation(pending,retime('m1',2,3,[1,4]),'u1','coder'),/consent/);
});
test('coding.media.retime authorization follows coding capability and blind-coding ownership',()=>{
 const s=fixture(),op=retime('m1',2,3,[1,4]),theirs=retime('m2',3,6,[3,5]);
 assert.doesNotThrow(()=>authorizeOperation(s,op,teamAccess(s,'coder',{id:'u1'})));assert.throws(()=>authorizeOperation(s,op,teamAccess(s,'viewer',{id:'u1'})),/does not permit coding/);
 s.settings.teamAccess={blindCoding:false,roles:{coder:{coding:false}}};assert.throws(()=>authorizeOperation(s,op,teamAccess(s,'coder',{id:'u1'})),/does not permit coding/);
 s.settings.teamAccess={blindCoding:true};const blind=teamAccess(s,'coder',{id:'u1'});assert.doesNotThrow(()=>authorizeOperation(s,op,blind));assert.throws(()=>authorizeOperation(s,theirs,blind),/blind-coding view/);assert.doesNotThrow(()=>authorizeOperation(s,theirs,teamAccess(s,'reviewer',{id:'r'})));
 const after=applyOperation(s,retime('m1',2,3,[1,4]),'r','reviewer'),view=visibleProjectState(after,teamAccess(after,'coder',{id:'u1'}));assert.equal(view.codings.find(c=>c.id==='m1').retimeHistory,undefined,'reviewer retime history is hidden from blind coders');assert.equal(view.codings.find(c=>c.id==='m1').timeStart,2);
});
test('peaks quantize to Int8, round-trip within one step and validate shape',()=>{
 const rate=8000,duration=3,samples=new Float32Array(rate*duration).map((_,i)=>.8*Math.sin(2*Math.PI*220*i/rate)*(i<rate?1:.25));
 const p=quantizePeaks([samples],{sampleRate:rate,duration,recordingKey:'p/rec',etag:'"abc"',size:48044,bucketsPerSecond:50});
 assert.equal(p.version,1);assert.equal(p.min.length,150);assert.ok(p.min.every(v=>Number.isInteger(v)&&v>=-127&&v<=127));assert.ok(p.min.every((v,i)=>v<=p.max[i]));
 const back=dequantizePeaks(p);assert.ok(Math.abs(back.max[10]-.8)<=1/127+.01);assert.ok(Math.abs(back.min[10]+.8)<=1/127+.01);assert.ok(Math.abs(back.max[100]-.2)<=1/127+.01);
 assert.deepEqual(validateMediaPeaks(JSON.parse(JSON.stringify(p)),{recordingKey:'p/rec',etag:'"abc"',size:48044}),p);
 assert.equal(overviewPeaks(p,30).length,30);assert.ok(Math.abs(overviewPeaks(p,30)[0]-.8)<.02);const cols=peakColumns(p,10);assert.equal(cols.min.length,10);assert.ok(cols.max[0]>.78&&cols.min[9]<-.18);
 assert.equal(peaksURL('/api/projects/x/media/abc'),'/api/projects/x/media-peaks/abc');assert.ok(peaksBucketsPerSecond(7200)*7200<=PEAKS_MAX_BUCKETS);assert.equal(peaksBucketsPerSecond(5),100);
 for(const [bad,pattern] of [[{...p,version:2},/version/],[{...p,max:p.max.slice(1)},/equal/],[{...p,min:p.min.map(()=>200)},/Int8/],[{...p,min:p.max,max:p.min},/ordered/],[{...p,duration:9},/stated duration/],[{...p,etag:''},/recording version/],[{...p,sampleRate:-1},/sample rate/],[[],/object/]])assert.throws(()=>validateMediaPeaks(bad),pattern);
 assert.throws(()=>validateMediaPeaks(p,{recordingKey:'other/rec'}),e=>e.status===409);assert.throws(()=>validateMediaPeaks(p,{etag:'"new"'}),e=>e.status===409);
});
