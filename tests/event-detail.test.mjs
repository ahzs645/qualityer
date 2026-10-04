import test from 'node:test';
import assert from 'node:assert/strict';
import {storeEventDetail,readEventDetails,INLINE_EVENT_DETAIL_BYTES} from '../server/event-detail.mjs';

test('large event detail is verified, bounded in SQL, and hydrated byte-for-byte',async()=>{
 const objects=new Map(),env={BUCKET:{put:async(k,v)=>objects.set(k,v.slice()),get:async k=>objects.has(k)?{arrayBuffer:async()=>objects.get(k).buffer}:null}};
 const detail={operation:{type:'source.transcript',data:{raw:'x'.repeat(2_200_000)}},diff:{records:[{kind:'documents',name:'Synthetic source'}]},revision:{before:0,after:1}};
 const stored=await storeEventDetail(env,'project','event',detail);
 assert.ok(new TextEncoder().encode(stored).byteLength<INLINE_EVENT_DETAIL_BYTES);
 assert.ok(!stored.includes('x'.repeat(1000)));
 const rows=await readEventDetails(env,'project',[{id:'event',detail:stored}],{blind:false});
 assert.ok(rows[0].detail===JSON.stringify(detail));
 await assert.rejects(readEventDetails(env,'other-project',[{id:'event',detail:stored}],{blind:false}),/does not belong/);
 const pointer=JSON.parse(stored);objects.get(pointer._eventDetailKey)[0]=0;
 await assert.rejects(readEventDetails(env,'project',[{id:'event',detail:stored}],{blind:false}),/integrity check/);
});

test('blind history redacts before reading object storage and failed storage verification prevents pointer publication',async()=>{
 const secret=JSON.stringify({_eventDetailKey:'event-details/project/event/key.json',_checksum:'private-reference'}),env={BUCKET:{get:async()=>{throw Error('Blind history must never hydrate');}}};
 const rows=await readEventDetails(env,'project',[{id:'event',detail:secret}],{blind:true});
 assert.ok(!rows[0].detail.includes('private-reference'));assert.equal(JSON.parse(rows[0].detail).blindCoding,true);
 const broken={BUCKET:{put:async()=>{},get:async()=>({arrayBuffer:async()=>new Uint8Array([0]).buffer})}};
 await assert.rejects(storeEventDetail(broken,'p','e',{operation:{data:'x'.repeat(100_000)}}),/Could not verify/);
 const small={operation:{type:'code.create',data:{name:'Synthetic code'}}};assert.equal(await storeEventDetail({},'p','e',small),JSON.stringify(small));
});

test('legacy non-JSON and primitive inline history remain readable unchanged',async()=>{
 const rows=['legacy text','null','false','42','"Old note"','[]'].map((detail,index)=>({id:String(index),detail}));
 assert.deepEqual(await readEventDetails({},'project',rows,{blind:false}),rows);
});
