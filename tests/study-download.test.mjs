import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {emptyState} from '../src/domain.mjs';
import {readProjectArchive} from '../src/project-archive.mjs';

test('complete study download preserves exact interviews, recovery states, estimates and original media without changing the project',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const request=(path,method='GET',body,actor='local-researcher')=>mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json','x-local-user':actor},body:body?JSON.stringify(body):undefined});
  const state=emptyState('Two synthetic interviews');state.documents=[{id:'a',name:'Sarah synthetic',text:'First 😀 account.\n',revision:1,turns:[],speakerLabelRuns:[{id:'anonymous-estimate',status:'pending-listening'}]},{id:'b',name:'Margot synthetic',text:'Second é account.\n',revision:1,turns:[]}];
  const {id}=await (await request('/projects','POST',{state})).json(),path='/projects/'+id;
  const recording=new Uint8Array(2*1024*1024+19);for(let i=0;i<recording.length;i++)recording[i]=i%251;
  await bucket.put(id+'/audio',recording,{httpMetadata:{contentType:'audio/mp4'},customMetadata:{name:'original.m4a'}});
  await request(path+'/operate','POST',{revision:0,operation:{type:'source.media.attach',data:{id:'a',mediaKey:id+'/audio',mediaType:'audio/mp4'}}});
  const before=await (await request(path)).json();
  await request(path+'/members','POST',{email:'viewer@local.test',role:'viewer'});
  assert.equal((await request(path+'/archive','GET',undefined,'viewer')).status,403);
  const without=await request(path+'/archive');assert.equal(without.status,200);assert.match(without.headers.get('content-disposition'),/without-recordings/);assert.equal(without.headers.get('cache-control'),'private, no-store');
  const noMedia=unzipSync(new Uint8Array(await without.arrayBuffer())),parsed=await readProjectArchive(noMedia);
  assert.deepEqual(parsed.state,before.state);assert.equal(parsed.mediaFiles.length,0);assert.equal(Object.keys(noMedia).filter(p=>p.startsWith('Recovery/')).length,2);
  assert.equal(strFromU8(noMedia['Transcripts/0001-Sarah synthetic.txt']),state.documents[0].text);
  assert.ok(noMedia['Analysis/coded-excerpts.csv']);assert.ok(noMedia['Analysis/reviewTasks.json']===undefined);
  const withMedia=await request(path+'/archive?media=1'),files=unzipSync(new Uint8Array(await withMedia.arrayBuffer())),full=await readProjectArchive(files);
  assert.deepEqual(full.state,before.state);assert.deepEqual(full.mediaFiles[0].bytes,recording);assert.equal(full.mediaFiles[0].name,'original.m4a');
  const scope=JSON.parse(strFromU8(files['EXPORT-SCOPE.json']));assert.equal(scope.revision,1);assert.equal(scope.retained.filter(x=>x.kind==='media').length,1);assert.ok(scope.retained.every(x=>x.sha256.length===64));
  assert.deepEqual(await (await request(path)).json(),before);
  await bucket.delete(id+'/audio');assert.equal((await request(path+'/archive?media=1')).status,409);assert.equal((await request(path+'/archive')).status,200);
 }finally{await mf.dispose();}
});
