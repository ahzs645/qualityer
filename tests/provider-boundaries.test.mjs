import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';

test('Authenticated provider routes reject truncated suggestions and invalid audio before saving research or job results',async()=>{
 let finish='length',invalidAudio=true;
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true',AI_BASE_URL:'https://fixture.test',AUDIO_WORKER_URL:'https://fixture.test'},d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:async req=>{
  const path=new URL(req.url).pathname;
  if(path==='/v1/chat/completions')return Response.json({choices:[{finish_reason:finish,message:{content:JSON.stringify({suggestions:[{quote:'synthetic evidence',reason:'Synthetic contract check'}]})}}]});
  if(path==='/jobs'&&req.method==='POST')return Response.json({id:new URL(req.url).searchParams.get('job_id'),status:'queued'});
  if(path.startsWith('/jobs/'))return Response.json({status:'completed',progress:100,result:{segments:[{text:'synthetic evidence',start:invalidAudio?2:0,end:1.125,words:[{word:'synthetic',start:0,end:null}]}]}});
  throw Error('Unexpected provider request');
 }});
 try{
  const db=await mf.getD1Database('DB');for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const request=async(path,method='GET',data)=>mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});
  const state={name:'Synthetic boundaries',documents:[{id:'d',name:'Synthetic',text:'synthetic evidence',revision:1}],codes:[{id:'c',name:'Topic'}],codings:[],cases:[],memos:[],categories:[],journals:[],coverage:[],extractions:[],suggestions:[]};
  const {id}=await (await request('/projects','POST',{state})).json(),prefix='/projects/'+id;
  const original=await (await request(prefix)).json();const rejected=await request(prefix+'/ai','POST',{documentId:'d',codeId:'c'});assert.equal(rejected.status,502);assert.match((await rejected.json()).error,/incomplete/);assert.deepEqual((await (await request(prefix)).json()).state,original.state);
  finish='stop';const accepted=await request(prefix+'/ai','POST',{documentId:'d',codeId:'c'});assert.equal(accepted.status,200);assert.equal((await accepted.json()).suggestions[0].start,0);
  const bucket=await mf.getR2Bucket('BUCKET'),key=id+'/recording';await bucket.put(key,new Uint8Array([1]),{httpMetadata:{contentType:'audio/wav'}});await request(prefix+'/operate','POST',{revision:0,operation:{type:'source.media.attach',data:{id:'d',mediaKey:key,mediaType:'audio/wav'}}});
  const snapshot=await (await request(prefix)).json(),job=await (await request(prefix+'/jobs','POST',{documentId:'d'})).json();
  const bad=await request(prefix+'/jobs/'+job.id);assert.equal(bad.status,502);assert.match((await bad.json()).error,/reversed/);assert.equal((await db.prepare('SELECT status FROM jobs WHERE id=?').bind(job.id).first()).status,'queued');assert.equal((await bucket.list({prefix:'jobs/'})).objects.length,0);
  invalidAudio=false;const complete=await (await request(prefix+'/jobs/'+job.id)).json();assert.equal(complete.status,'completed');assert.equal(complete.result.segments[0].start,0);assert.equal(complete.result.segments[0].words[0].end,null);assert.deepEqual((await (await request(prefix)).json()).state,snapshot.state);
 }finally{await mf.dispose();}
});
