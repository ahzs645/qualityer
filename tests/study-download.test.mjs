import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import {emptyState} from '../src/domain.mjs';
import {readProjectArchive,readRecoveredProjectArchive} from '../src/project-archive.mjs';
import {hasEndOfCentralDirectory,recoverZipEntries} from '../src/zip-recovery.mjs';

// Direct sockets bypass Miniflare's proxy so Content-Length and aborted bodies behave as they do on the wire.
async function harness(options={}){
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET'],unsafeDirectSockets:[{port:0}],...options});
 const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET'),direct=await mf.unsafeGetDirectURL();
 for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 const request=(path,method='GET',body,actor='local-researcher',headers={})=>fetch(new URL('api'+path,direct),{method,headers:{'Content-Type':'application/json','x-local-user':actor,...headers},body:body?JSON.stringify(body):undefined});
 return {mf,bucket,request};
}
async function readAll(response){const chunks=[];let error=null;try{for await(const chunk of response.body)chunks.push(chunk);}catch(e){error=e;}const bytes=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return {bytes,error};}
const synthetic=n=>{const bytes=new Uint8Array(n);for(let i=0;i<n;i++)bytes[i]=(i*7+i%251)&255;return bytes;};
async function seed(request,bucket,{recordingBytes=2*1024*1024+19}={}){
 const state=emptyState('Two synthetic interviews');state.documents=[{id:'a',name:'Sarah synthetic',text:'First 😀 account.\n',revision:1,turns:[],speakerLabelRuns:[{id:'anonymous-estimate',status:'pending-listening'}]},{id:'b',name:'Margot synthetic',text:'Second é account.\n',revision:1,turns:[]}];
 const {id}=await (await request('/projects','POST',{state})).json(),path='/projects/'+id,recording=synthetic(recordingBytes);
 await bucket.put(id+'/audio',recording,{httpMetadata:{contentType:'audio/mp4'},customMetadata:{name:'original.m4a'}});
 await request(path+'/operate','POST',{revision:0,operation:{type:'source.media.attach',data:{id:'a',mediaKey:id+'/audio',mediaType:'audio/mp4'}}});
 return {id,path,state,recording};
}
const localNames=bytes=>{const names=[];for(let at=0;new DataView(bytes.buffer,bytes.byteOffset).getUint32(at,true)===0x04034b50;){const v=new DataView(bytes.buffer,bytes.byteOffset+at),n=v.getUint16(26,true);names.push(strFromU8(bytes.subarray(at+30,at+30+n)));at+=30+n+v.getUint16(28,true)+v.getUint32(18,true);}return names;};

test('complete study download preserves exact interviews, recovery states, estimates and original media without changing the project',async()=>{
 const {mf,bucket,request}=await harness();
 try{
  const {id,path,state,recording}=await seed(request,bucket);
  const before=await (await request(path)).json();
  await request(path+'/members','POST',{email:'viewer@local.test',role:'viewer'});
  for(const route of ['/archive','/archive?media=1','/archive/media','/archive/media/1'])assert.equal((await request(path+route,'GET',undefined,'viewer')).status,403,route);
  const without=await request(path+'/archive');assert.equal(without.status,200);assert.match(without.headers.get('content-disposition'),/without-recordings/);assert.equal(without.headers.get('cache-control'),'private, no-store');
  const plain=await readAll(without);assert.equal(plain.error,null);assert.equal(Number(without.headers.get('content-length')),plain.bytes.length);assert.ok(hasEndOfCentralDirectory(plain.bytes));
  const noMedia=unzipSync(plain.bytes),parsed=await readProjectArchive(noMedia);
  assert.deepEqual(parsed.state,before.state);assert.equal(parsed.mediaFiles.length,0);assert.equal(Object.keys(noMedia).filter(p=>p.startsWith('Recovery/')).length,2);
  assert.equal(strFromU8(noMedia['Transcripts/0001-Sarah synthetic.txt']),state.documents[0].text);
  assert.ok(noMedia['Analysis/coded-excerpts.csv']);assert.ok(noMedia['Analysis/reviewTasks.json']===undefined);
  // The scope manifest comes first and predicts every following entry exactly; README is last.
  const order=localNames(plain.bytes),scope=JSON.parse(strFromU8(noMedia['EXPORT-SCOPE.json']));
  assert.equal(order[0],'EXPORT-SCOPE.json');assert.equal(order.at(-1),'README.txt');assert.deepEqual(scope.entries.map(e=>e.path),order.slice(1));
  for(const e of scope.entries)assert.equal(noMedia[e.path].length,e.byteLength,e.path);
  assert.equal(scope.mediaDelivery,'none');assert.ok(scope.retained.every(x=>x.sha256.length===64));
  // Small studies keep the single self-contained ZIP for ?media=1.
  const withMedia=await request(path+'/archive?media=1'),embedded=await readAll(withMedia);assert.equal(embedded.error,null);assert.match(withMedia.headers.get('content-disposition'),/with-recordings/);assert.equal(Number(withMedia.headers.get('content-length')),embedded.bytes.length);
  const files=unzipSync(embedded.bytes),full=await readProjectArchive(files);
  assert.deepEqual(full.state,before.state);assert.deepEqual(full.mediaFiles[0].bytes,recording);assert.equal(full.mediaFiles[0].name,'original.m4a');
  const fullScope=JSON.parse(strFromU8(files['EXPORT-SCOPE.json']));assert.equal(fullScope.revision,1);assert.equal(fullScope.mediaDelivery,'embedded');assert.equal(fullScope.retained.filter(x=>x.kind==='media').length,1);assert.equal(fullScope.recordings[0].size,recording.length);
  assert.deepEqual(await (await request(path)).json(),before);
  await bucket.delete(id+'/audio');assert.equal((await request(path+'/archive?media=1')).status,409);assert.equal((await request(path+'/archive?media=separate')).status,409);assert.equal((await request(path+'/archive')).status,200);
  assert.equal((await (await request(path+'/archive/media')).json()).recordings[0].missing,true);assert.equal((await request(path+'/archive/media/1')).status,404);
 }finally{await mf.dispose();}
});

test('large recordings download separately with Content-Length, ETag, Range and resumable bytes, and re-import by name and size',async()=>{
 const {mf,bucket,request}=await harness({bindings:{LOCAL_DEV:'true',STUDY_EMBED_MEDIA_BYTES:'1024'}});
 try{
  const {id,path,recording}=await seed(request,bucket,{recordingBytes:300001});
  const before=await (await request(path)).json();
  await request(path+'/members','POST',{email:'viewer@local.test',role:'viewer'});
  const list=await (await request(path+'/archive/media')).json();
  assert.equal(list.embedLimit,1024);assert.equal(list.recordings.length,1);
  const listed=list.recordings[0];assert.equal(listed.filename,'0001-original.m4a');assert.equal(listed.size,recording.length);assert.equal(listed.download,'/api/projects/'+id+'/archive/media/1');assert.ok(listed.etag);
  const whole=await request(path+'/archive/media/1');assert.equal(whole.status,200);
  assert.equal(whole.headers.get('content-length'),String(recording.length));assert.equal(whole.headers.get('accept-ranges'),'bytes');assert.equal(whole.headers.get('content-type'),'audio/mp4');assert.equal(whole.headers.get('cache-control'),'private, no-store');
  assert.match(whole.headers.get('content-disposition'),/^attachment; filename="0001-original\.m4a"/);const etag=whole.headers.get('etag');assert.ok(etag?.includes(listed.etag));
  assert.deepEqual((await readAll(whole)).bytes,recording);
  const part=await request(path+'/archive/media/1','GET',undefined,'local-researcher',{Range:'bytes=1000-1999','If-Range':etag});assert.equal(part.status,206);
  assert.equal(part.headers.get('content-range'),'bytes 1000-1999/'+recording.length);assert.equal(part.headers.get('content-length'),'1000');assert.deepEqual((await readAll(part)).bytes,recording.subarray(1000,2000));
  const resume=await request(path+'/archive/media/1','GET',undefined,'local-researcher',{Range:'bytes=299000-'});assert.equal(resume.status,206);assert.deepEqual((await readAll(resume)).bytes,recording.subarray(299000));
  const stale=await request(path+'/archive/media/1','GET',undefined,'local-researcher',{Range:'bytes=0-9','If-Range':'"not-this-version"'});assert.equal(stale.status,200);assert.equal((await readAll(stale)).bytes.length,recording.length);
  const head=await request(path+'/archive/media/1','HEAD');assert.equal(head.status,200);assert.equal(head.headers.get('content-length'),String(recording.length));
  assert.equal((await request(path+'/archive/media/1','GET',undefined,'local-researcher',{Range:'bytes=999999-'})).status,416);
  assert.equal((await request(path+'/archive/media/2')).status,404);assert.equal((await request(path+'/archive/media/0')).status,404);
  for(const route of ['/archive/media','/archive/media/1'])assert.equal((await request(path+route,'GET',undefined,'viewer')).status,403);
  assert.equal((await request(path+'/archive/media/1','HEAD',undefined,'viewer')).status,403);
  // ?media=1 above the limit and ?media=separate both list the recording instead of embedding it.
  for(const mode of ['1','separate']){
   const response=await request(path+'/archive?media='+mode),{bytes,error}=await readAll(response);assert.equal(error,null);assert.equal(Number(response.headers.get('content-length')),bytes.length);assert.match(response.headers.get('content-disposition'),/recordings-separate/);
   const files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['research-weave-archive.json'])),scope=JSON.parse(strFromU8(files['EXPORT-SCOPE.json']));
   assert.equal(Object.keys(files).some(p=>p.startsWith('Media/')),false);assert.equal(manifest.includeMedia,false);assert.equal(manifest.mediaDelivery,'separate');
   for(const item of [manifest.recordings[0],scope.recordings[0]]){assert.equal(item.path,'Media/0001-original.m4a');assert.equal(item.size,recording.length);assert.equal(item.etag,listed.etag);assert.equal(item.type,'audio/mp4');assert.equal(item.delivery,'separate');assert.equal(item.download,listed.download);assert.ok(item.checksums.md5);}
   const alone=await readProjectArchive(files);assert.deepEqual(alone.state,before.state);assert.equal(alone.mediaFiles.length,0);assert.match(alone.warnings[0],/0001-original\.m4a/);
   const matched=await readProjectArchive(files,{recordings:[{name:'0001-original (1).m4a',bytes:recording}]});assert.equal(matched.mediaFiles.length,1);assert.equal(matched.mediaFiles[0].originalKey,id+'/audio');assert.deepEqual(matched.mediaFiles[0].bytes,recording);assert.deepEqual(matched.warnings,[]);
   const wrong=await readProjectArchive(files,{recordings:[{name:'0001-original.m4a',bytes:recording.subarray(1)}]});assert.equal(wrong.mediaFiles.length,0);assert.equal(wrong.warnings.length,2);
  }
  assert.deepEqual(await (await request(path)).json(),before);
 }finally{await mf.dispose();}
});

test('an R2 body that errors mid-stream cannot be mistaken for a complete study ZIP or recording',async()=>{
 const {mf,bucket,request}=await harness({scriptPath:'tests/fixtures/failing-r2-worker.mjs',modulesRoot:'.',modulesRules:[{type:'ESModule',include:['**/*.js','**/*.mjs']}]});
 try{
  const {path,recording}=await seed(request,bucket);
  // The study ZIP reads each embedded object twice (measure, then send); break the second read after 600 KB.
  const response=await request(path+'/archive?media=1','GET',undefined,'local-researcher',{'x-test-r2-fail':'/audio:2:600000'});
  assert.equal(response.status,200);const expected=Number(response.headers.get('content-length'));assert.ok(expected>recording.length);
  const {bytes,error}=await readAll(response);
  assert.ok(error,'a cut-off body must surface as a network error, not a clean end');assert.ok(bytes.length<expected);
  assert.throws(()=>unzipSync(bytes));assert.equal(hasEndOfCentralDirectory(bytes),false);
  const recovery=recoverZipEntries(bytes);assert.equal(recovery.truncated,true);assert.ok(recovery.files['research-weave.json']);assert.ok(recovery.files['EXPORT-SCOPE.json']);
  assert.equal(recovery.incomplete[0].path,'Media/0001-original.m4a');
  const opened=await readRecoveredProjectArchive(recovery);assert.equal(opened.mediaFiles.length,0);assert.equal(opened.missingMedia[0].path,'Media/0001-original.m4a');
  assert.ok(opened.warnings.some(w=>w.startsWith('This ZIP is truncated')));assert.ok(opened.warnings.some(w=>w.includes('Incomplete: Media/0001-original.m4a')&&w.includes('of '+recording.length.toLocaleString('en'))));assert.ok(opened.warnings.some(w=>w.startsWith('Never received:')&&w.includes('README.txt')));
  assert.deepEqual(opened.recovery.neverReceived,['README.txt']);
  // A per-recording download that breaks also fails visibly instead of ending as a short file.
  const single=await request(path+'/archive/media/1','GET',undefined,'local-researcher',{'x-test-r2-fail':'/audio:1:500000'});assert.equal(single.headers.get('content-length'),String(recording.length));
  const cut=await readAll(single);assert.ok(cut.error);assert.ok(cut.bytes.length<recording.length);
 }finally{await mf.dispose();}
});
