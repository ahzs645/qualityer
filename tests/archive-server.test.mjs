import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {emptyState} from '../src/domain.mjs';
test('archive restoration validates uploaded project ownership and metadata pagination retains all indexes',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB');
  for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const request=(path,method='GET',body)=>mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
  const state=emptyState('Archive import');state.documents=[{id:'d',name:'Recording',text:'',mediaKey:'old/recording',mediaType:'audio/quicktime',revision:1}];
  const {id}=await (await request('/projects','POST',{state})).json(),prefix='/projects/'+id,bucket=await mf.getR2Bucket('BUCKET');
  await bucket.put('other/recording',new Uint8Array([1]));
  const restore=key=>request(prefix+'/operate','POST',{revision:0,operation:{type:'source.media.restore',data:{keyMap:{'old/recording':key}}}});
  assert.equal((await restore('other/recording')).status,400);
  assert.equal((await restore(id+'/missing')).status,400);
  await bucket.put(id+'/uploaded',new Uint8Array([1]),{httpMetadata:{contentType:'audio/quicktime'}});
  const restored=await restore(id+'/uploaded');assert.equal(restored.status,200);
  assert.equal((await restored.json()).state.documents[0].mediaKey,id+'/uploaded');
  const now=new Date().toISOString();
  await db.batch(Array.from({length:205},(_,i)=>db.prepare('INSERT INTO jobs (id,project_id,source_id,status,progress,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind('job-'+i,id,'d','completed',100,'local-researcher',now,now)));
  const first=await (await request(prefix+'/jobs?paginated=true&limit=200')).json(),second=await (await request(prefix+'/jobs?paginated=true&limit=200&offset=200')).json();
  assert.equal(first.total,205);assert.equal(first.records.length,200);assert.equal(second.records.length,5);assert.equal(new Set([...first.records,...second.records].map(j=>j.id)).size,205);
  const backups=await (await request(prefix+'/backups?paginated=true&limit=1')).json();assert.equal(backups.total,2);assert.equal(backups.records.length,1);
  const session=await request(prefix+'/uploads','POST',{name:'Recording.qta',type:'audio/quicktime',size:3});assert.equal(session.status,200);
  const project=await (await request(prefix)).json();assert.ok(project.metadata.createdAt);assert.equal(project.metadata.ownerId,'local-researcher');
 }finally{await mf.dispose();}
});
