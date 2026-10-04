import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('large transcript operations survive D1 limits with exact history, atomic races and blind redaction',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'qualityer-event-test-')),scriptPath=join(folder,'worker.mjs');
 await build({entryPoints:['server/worker.mjs'],bundle:true,format:'esm',platform:'neutral',target:'es2022',outfile:scriptPath});
 const mf=new Miniflare({modules:true,modulesRoot:folder,scriptPath,compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB');
  for(const name of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const call=async(path,actor='owner',method='GET',body)=>{const r=await mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json','x-local-user':actor},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};};
  const created=await call('/projects','owner','POST',{name:'Synthetic large event'});assert.equal(created.status,201);const id=created.data.id,path='/projects/'+id;
  const turn={start:0,end:20,timeStart:0,timeEnd:1.125,speaker:'Speaker',words:[{word:'Synthetic',start:0,end:.125,raw:'PRIVATE-LARGE-PROVIDER-'+ 'x'.repeat(2_200_000)}]};
  const operation={type:'source.import',data:{name:'Synthetic source',text:'Synthetic transcript',turns:[turn]}};
  assert.ok(new TextEncoder().encode(JSON.stringify(operation)).byteLength>2_000_000);
  let response=await call(path+'/operate','owner','POST',{revision:0,operation});assert.equal(response.status,200);const sourceId=response.data.state.documents[0].id;
  const transcript={type:'source.transcript',data:{id:sourceId,text:'Synthetic transcript',turns:[turn],transcriptMetadata:{model:'synthetic'}}};
  response=await call(path+'/operate','owner','POST',{revision:1,operation:transcript});assert.equal(response.status,200);
  const raced=await Promise.all([1,2].map(i=>call(path+'/operate','owner','POST',{revision:2,operation:{...transcript,data:{...transcript.data,transcriptMetadata:{model:'synthetic-'+i}}}})));
  assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);
  const stored=await db.prepare('SELECT id,detail FROM events WHERE project_id=? ORDER BY created_at').bind(id).all();assert.equal(stored.results.length,3);
  assert.ok(stored.results.every(row=>new TextEncoder().encode(row.detail).byteLength<64*1024));
  for(const suffix of ['/events','/events?paginated=true']){
   const history=await call(path+suffix);assert.equal(history.status,200);const events=history.data.events||history.data;
   assert.ok(JSON.stringify(JSON.parse(events.find(e=>e.action==='source.import').detail).operation)===JSON.stringify(operation));
   assert.ok(events.filter(e=>e.action==='source.transcript').every(e=>JSON.parse(e.detail).operation.data.turns[0].words[0].raw===turn.words[0].raw));
  }
  assert.equal((await call(path)).data.revision,3);assert.deepEqual((await call(path+'/backups')).data.map(b=>b.revision).sort(),[0,1,2,3]);
  assert.equal((await call(path+'/members','owner','POST',{email:'coder@local.test',role:'coder'})).status,200);
  assert.equal((await call(path+'/operate','owner','POST',{revision:3,operation:{type:'permissions.update',data:{blindCoding:true}}})).status,200);
  // Legacy own-pointer history must be redacted even if its backing object is missing.
  const pointer=stored.results[0].detail;await db.prepare('INSERT INTO events (id,project_id,actor,action,detail,created_at) VALUES (?,?,?,?,?,?)').bind('blind-own-pointer',id,'coder@local.test','source.import',pointer,new Date().toISOString()).run();
  for(const suffix of ['/events','/events?paginated=true']){const history=await call(path+suffix,'coder');assert.equal(history.status,200);assert.ok(!JSON.stringify(history.data).includes('PRIVATE-LARGE-PROVIDER'));assert.ok(!JSON.stringify(history.data).includes('_eventDetailKey'));}
  await db.prepare('DELETE FROM events WHERE id=?').bind('blind-own-pointer').run();
  const bucket=await mf.getR2Bucket('BUCKET'),key=JSON.parse(pointer)._eventDetailKey;await bucket.put(key,'corrupted event');
  assert.equal((await call(path+'/events')).status,500);assert.equal((await call(path)).data.revision,4);
 }finally{await mf.dispose();await rm(folder,{recursive:true,force:true});}
});
