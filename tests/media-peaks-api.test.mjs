import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {emptyState} from '../src/domain.mjs';
import {quantizePeaks} from '../src/media-peaks.mjs';

test('waveform peaks are stored per recording version, editor-only, validated and never trusted from the client for timing bounds',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const request=(path,method='GET',body,actor='local-researcher',raw=false)=>mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json','x-local-user':actor},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
  const state=emptyState('Synthetic tone study');state.codes=[{id:'c',name:'Tone'}];state.documents=[{id:'a',name:'Synthetic tone',text:'Tone.\n',revision:1,turns:[]}];
  const {id}=await (await request('/projects','POST',{state})).json(),path='/projects/'+id,other=(await (await request('/projects','POST',{state:emptyState('Other synthetic project')})).json()).id;
  const tone=new Uint8Array(4000).map((_,i)=>i%200);await bucket.put(id+'/tone',tone,{httpMetadata:{contentType:'audio/wav'}});await bucket.put(other+'/tone2',tone,{httpMetadata:{contentType:'audio/wav'}});await bucket.put(id+'/loose',tone,{httpMetadata:{contentType:'audio/wav'}});
  let p=await (await request(path+'/operate','POST',{revision:0,operation:{type:'source.media.attach',data:{id:'a',mediaKey:id+'/tone',mediaType:'audio/wav'}}})).json();
  p=await (await request(path+'/operate','POST',{revision:p.revision,operation:{type:'coding.create',data:{documentId:'a',kind:'media',codeIds:['c'],timeStart:1,timeEnd:2,text:'Synthetic range'}}})).json();
  const media=await request(path+'/media/tone');const etag=media.headers.get('ETag');assert.ok(etag);assert.equal((await media.arrayBuffer()).byteLength,tone.length);
  const samples=new Float32Array(8000*4).map((_,i)=>.5*Math.sin(i/7)),peaks=quantizePeaks([samples],{sampleRate:8000,duration:4,recordingKey:id+'/tone',etag,size:tone.length});
  assert.equal((await request(path+'/media-peaks/tone')).status,404,'missing peaks fall back to decoding');
  const ok=await request(path+'/media-peaks/tone','PUT',peaks);assert.equal(ok.status,200,await ok.clone().text());
  assert.ok(await bucket.head('peaks/'+id+'/tone.json'),'stored under the project peaks prefix');
  const got=await request(path+'/media-peaks/tone');assert.equal(got.status,200);assert.deepEqual(await got.json(),peaks);
  await request(path+'/members','POST',{email:'viewer@local.test',role:'viewer'});await request(path+'/members','POST',{email:'coder@local.test',role:'coder'});
  assert.equal((await request(path+'/media-peaks/tone','PUT',peaks,'viewer')).status,403,'viewer cannot store peaks');
  assert.equal((await request(path+'/media-peaks/tone','GET',undefined,'viewer')).status,200,'members who can play the recording can read its display peaks');
  assert.equal((await request(path+'/media-peaks/tone','PUT',peaks,'coder')).status,200,'editors can store peaks');
  assert.equal((await request(path+'/media-peaks/tone','PUT',peaks,'stranger')).status,403);
  assert.equal((await request(path+'/media-peaks/tone','PUT','{"version":1,'.padEnd(2100000,' ')+'}','local-researcher',true)).status,413,'oversized peaks are rejected');
  for(const bad of [{...peaks,min:peaks.min.slice(3)},{...peaks,max:peaks.max.map(()=>999)},{...peaks,version:9},{...peaks,duration:-1}])assert.equal((await request(path+'/media-peaks/tone','PUT',bad)).status,400);
  assert.equal((await request(path+'/media-peaks/tone','PUT','not json','local-researcher',true)).status,400,'malformed JSON is rejected');
  assert.equal((await request(path+'/media-peaks/tone','PUT',{...peaks,recordingKey:other+'/tone2'})).status,409,'a recording key from another project is rejected');
  assert.equal((await request(path+'/media-peaks/tone2','PUT',{...peaks,recordingKey:id+'/tone2'})).status,404,'another project’s media name does not resolve in this project');
  assert.equal((await request(path+'/media-peaks/loose','PUT',{...peaks,recordingKey:id+'/loose'})).status,404,'unattached uploads are not given peaks');
  assert.equal((await request(path+'/media-peaks/tone','PUT',{...peaks,etag:'"stale"'})).status,409,'peaks from another recording version are rejected');
  assert.equal((await request(path+'/media-peaks/..%2Ftone','GET')).status,404);
  // Retiming is bounded by the server-verified peaks duration (4 s), not by a client-supplied duration.
  const coding=p.state.codings[0],retime=(timeEnd,extra={})=>request(path+'/operate','POST',{revision:p.revision,operation:{type:'coding.media.retime',data:{id:coding.id,timeStart:1,timeEnd,recordingKey:id+'/tone',previousTimeStart:1,previousTimeEnd:2,...extra}}});
  const beyond=await retime(9,{recordingDuration:100});assert.equal(beyond.status,400);assert.match((await beyond.json()).error,/ends after the recording/);
  const viewerRetime=await request(path+'/operate','POST',{revision:p.revision,operation:{type:'coding.media.retime',data:{id:coding.id,timeStart:1,timeEnd:3,recordingKey:id+'/tone',previousTimeStart:1,previousTimeEnd:2}}},'viewer');assert.equal(viewerRetime.status,403);
  const saved=await retime(3.5);assert.equal(saved.status,200);p=await saved.json();assert.deepEqual([p.state.codings[0].timeStart,p.state.codings[0].timeEnd],[1,3.5]);
  // Replacing the bytes changes the etag, so stale peaks are no longer served.
  await bucket.put(id+'/tone',new Uint8Array(4100),{httpMetadata:{contentType:'audio/wav'}});assert.equal((await request(path+'/media-peaks/tone')).status,404);
 }finally{await mf.dispose();}
});
