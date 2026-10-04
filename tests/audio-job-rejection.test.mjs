import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {readFile,readdir} from 'node:fs/promises';
import {audioRoutes} from '../server/audio-jobs.mjs';

const SQL=await initSqlJs();
async function fixture(){
 const sqlite=new SQL.Database();
 for(const name of (await readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())
  for(const sql of (await readFile('drizzle/'+name,'utf8')).split('--> statement-breakpoint'))if(sql.trim())sqlite.run(sql);
 const DB={prepare(sql){return {params:[],bind(...params){this.params=params;return this;},async run(){sqlite.run(sql,this.params);return {meta:{changes:sqlite.getRowsModified()}};},async first(){const statement=sqlite.prepare(sql);try{statement.bind(this.params);return statement.step()?statement.getAsObject():null;}finally{statement.free();}}};}};
 const env={DB,AUDIO_WORKER_URL:'https://worker.test',AUDIO_WORKER_TOKEN:'synthetic-worker-token',BUCKET:{get:async()=>({body:new Uint8Array([1,2,3])})}};
 const project={state:JSON.stringify({documents:[{id:'d',name:'Synthetic recording',mediaKey:'p/media',mediaType:'audio/wav'}]})};
 const call=(tail,method='GET',body)=>audioRoutes(new Request('https://app.test/api/projects/p/'+tail,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,'p',project,'owner',{id:'alice'},tail);
 return {sqlite,DB,call};
}

test('definitive worker rejection fails immediately, explains remediation and avoids recovery polling',async()=>{
 const original=globalThis.fetch;
 try{
  for(const [status,reason] of [[400,/recording or its transcription options/],[401,/authentication token/],[403,/denied access/],[413,/upload limit/],[415,/recording format/],[422,/job parameters/]]){
   const f=await fixture();let requests=0;
   globalThis.fetch=async()=>{requests++;return new Response('PRIVATE worker diagnostic',{status});};
   try{
    await assert.rejects(()=>f.call('jobs','POST',{documentId:'d',diarize:true}),error=>error.status===502&&reason.test(error.message)&&!error.message.includes('PRIVATE'));
    const row=await f.DB.prepare('SELECT * FROM jobs').first();assert.equal(row.status,'failed');assert.match(row.error,reason);
    assert.equal((await f.call('jobs/'+row.id)).data.status,'failed');assert.equal(requests,1);
   }finally{f.sqlite.close();}
  }
 }finally{globalThis.fetch=original;}
});

test('transient HTTP failures and interrupted acknowledgements retain submission recovery',async()=>{
 const original=globalThis.fetch;
 try{
  for(const outcome of [429,500,502,503,504,'network','malformed']){
   const f=await fixture();let acknowledgementLost=true;
   globalThis.fetch=async()=>{
    if(!acknowledgementLost)return Response.json({status:'running',stage:'transcribing'});
    if(outcome==='network')throw new TypeError('Synthetic interrupted network');
    if(outcome==='malformed')return Response.json({status:'queued'});
    return new Response('Synthetic unavailable',{status:outcome});
   };
   try{
    await assert.rejects(()=>f.call('jobs','POST',{documentId:'d'}));
    const row=await f.DB.prepare('SELECT * FROM jobs').first();assert.equal(row.status,'submitting');assert.match(row.error,/acknowledgement was interrupted/);
    acknowledgementLost=false;
    assert.equal((await f.call('jobs/'+row.id)).data.status,'running');
    assert.equal((await f.DB.prepare('SELECT status FROM jobs').first()).status,'running');
   }finally{f.sqlite.close();}
  }
 }finally{globalThis.fetch=original;}
});
