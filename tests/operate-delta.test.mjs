import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {emptyState} from '../src/domain.mjs';

async function harness(){
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET']});
 const db=await mf.getD1Database('DB');for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const request=(path,method='GET',body)=>mf.dispatchFetch('http://local/api'+path,{method,headers:{'Content-Type':'application/json','x-local-user':'local-researcher'},body:body?JSON.stringify(body):undefined});
 return {mf,request};
}
test('operate with ?delta=1 returns only changed top-level keys, and merging them reproduces the full state',async()=>{
 const {mf,request}=await harness();
 try{
  const state=emptyState('Delta');state.documents=[{id:'a',name:'A',text:'Alpha beta gamma.\n'.repeat(2000),revision:1,turns:[]}];state.codes=[{id:'c',name:'Code',color:'#227e8a'}];
  const {id}=await (await request('/projects','POST',{state})).json(),path='/projects/'+id,before=await (await request(path)).json();
  const op={type:'coding.create',data:{documentId:'a',start:0,end:5,text:'Alpha',sourceRevision:1,codeIds:['c']}};
  const r=await (await request(path+'/operate?delta=1','POST',{revision:before.revision,operation:op})).json();
  assert.equal(r.baseRevision,before.revision);assert.equal(r.revision,before.revision+1);assert.ok(r.stateDelta.codings);assert.equal(r.stateDelta.documents,undefined,'unchanged transcripts are not resent');assert.equal(r.state,undefined);
  const merged={...before.state,...r.stateDelta};for(const k of r.removedKeys)delete merged[k];
  const full=await (await request(path)).json();assert.deepEqual(merged,full.state);
  const plain=await (await request(path+'/operate','POST',{revision:full.revision,operation:{...op,data:{...op.data,start:6,end:10,text:'beta'}}})).json();assert.ok(plain.state.documents,'clients that do not ask for a delta still get the full state');
 }finally{await mf.dispose();}
});
