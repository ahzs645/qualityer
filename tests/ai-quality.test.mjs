import test from 'node:test';
import assert from 'node:assert/strict';
import {chunks,chatJSON,semantic,outlierCutoff,advancedReview} from '../server/research-ai.mjs';
const state=()=>({documents:[{id:'d',revision:1,text:'  😀 first speaker\r\n\nsecond speaker  \n'}],codes:[],codings:[]});
test('Paragraph chunks preserve Unicode codepoint anchors and never cross speaker lines',()=>{
 const s=state(),rows=chunks(s,'',650,'paragraph');
 assert.equal(rows.length,2);assert.equal(rows[0].start,2);assert.equal(rows[0].text,'😀 first speaker');
 for(const c of rows)assert.equal(Array.from(s.documents[0].text).slice(c.start,c.end).join(''),c.text);
 assert.ok(rows.every(c=>!c.text.includes('\n')));
 s.documents[0].reviewFlags=[{start:rows[1].start,end:rows[1].end}];assert.equal(chunks(s,'',650,'paragraph').length,1);
 s.documents[0].excludeAI=true;assert.equal(chunks(s,'',650,'paragraph').length,0);
});
test('Long paragraph windows progress and keep exact anchors at zero',()=>{
 const s=state();s.documents[0].text='😀'+'a'.repeat(1000);const rows=chunks(s,'',101,'paragraph');
 assert.equal(rows[0].start,0);assert.equal(rows.at(-1).end,1001);
 assert.ok(rows.every(c=>c.end>c.start&&c.end-c.start<=101));assert.throws(()=>chunks(s,'',100),/Chunk size/);
});
test('Changing chunk mode re-embeds cached entries with the same start and a different end',async()=>{
 const original=globalThis.fetch,records=new Map(),calls=[];
 const env={EMBEDDING_BASE_URL:'https://fixture.invalid',DB:{prepare:sql=>({bind:(...args)=>sql.startsWith('SELECT')?{all:async()=>({results:[...records.values()]})}:{args}}),batch:async rows=>{for(const {args:a}of rows)records.set(a[0],{source_id:a[2],revision:a[3],start:a[5],end:a[6],vector:a[7],content_hash:a[9]});}}};
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);calls.push(body.input);return Response.json({data:body.input.map((_,index)=>({index,embedding:[1,0]}))});};
 try{const s=state();s.documents[0].text='first speaker\nsecond speaker';const initial=await semantic(env,'p',s,{query:'speaker'});assert.equal(initial.indexed,1);const updated=await semantic(env,'p',s,{query:'speaker',chunkMode:'paragraph'});assert.equal(updated.indexed,2);assert.deepEqual(updated.hits.map(h=>h.text).sort(),['first speaker','second speaker']);assert.ok(calls.flat().includes('first speaker'));}finally{globalThis.fetch=original;}
});
test('Valid JSON at a provider length limit is rejected instead of becoming a complete draft',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{"text":"Looks complete"}'}}]});
 try{await assert.rejects(()=>chatJSON({AI_BASE_URL:'https://fixture.invalid'},'Review',{}),/incomplete/);globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'{"value":0,"timing":null}'}}]});assert.deepEqual(await chatJSON({AI_BASE_URL:'https://fixture.invalid'},'Review',{}),{value:0,timing:null});}finally{globalThis.fetch=original;}
});
test('Adaptive outlier cutoff permits no flags for consistent evidence and does not force a fraction',()=>{
 assert.equal(outlierCutoff([1,1,1]),null);assert.ok(outlierCutoff([1,1,1,1])<1);assert.deepEqual([1,1,1,1].filter(x=>x<outlierCutoff([1,1,1,1])),[]);assert.deepEqual([1,1,1,0].filter(x=>x<outlierCutoff([1,1,1,0])),[0]);
});
test('Adaptive embedding review produces no findings for consistent code and one for distinct evidence',async()=>{
 const original=globalThis.fetch,s={documents:[{id:'d',revision:1,text:'alpha beta gamma delta'}],codes:[{id:'c',name:'Topic'}],codings:['alpha','beta','gamma','delta'].map((text,i)=>({id:String(i),documentId:'d',codeId:'c',text,start:[0,6,11,17][i],end:[0,6,11,17][i]+text.length,status:'coded'}))};
 let distinctive=false;globalThis.fetch=async(url,options)=>Response.json({data:JSON.parse(options.body).input.map((text,index)=>({index,embedding:distinctive&&text==='delta'?[0,1]:[1,0]}))});
 try{assert.deepEqual((await advancedReview({EMBEDDING_BASE_URL:'https://fixture.invalid'},s,{mode:'embedding-outliers',codeId:'c'})).findings,[]);distinctive=true;const r=await advancedReview({EMBEDDING_BASE_URL:'https://fixture.invalid'},s,{mode:'embedding-outliers',codeId:'c'});assert.deepEqual(r.findings.map(f=>f.evidenceId),['3']);assert.ok(Number.isFinite(r.cutoff));}finally{globalThis.fetch=original;}
});
