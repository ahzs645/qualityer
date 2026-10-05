import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {emptyState} from '../src/domain.mjs';

// Synthetic large source: generated words with astral characters, never real interview text.
function synthetic(length){const words=['alpha','beta','gamma','😀','café','delta','é'];let text='',n=11;while(text.length<length){n=(n*48271)%2147483647;text+=words[n%words.length]+(n%9===0?'.\n':' ');}return text;}

test('Revision polling is lightweight, member-only and lets clients skip unchanged full downloads; saves reuse the verified prior object',async()=>{
 const mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{LOCAL_DEV:'true'},d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('BUCKET');
  for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const request=(path,method='GET',body,actor='local-researcher')=>mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json','x-local-user':actor},body:body?JSON.stringify(body):undefined});
  const text=synthetic(80000),points=Array.from(text),state=emptyState('Synthetic revision study');
  state.documents=[{id:'a',name:'Synthetic source',text,revision:1,turns:[]}];state.codes=[{id:'c1',name:'Theme',color:'#537a92',codable:true}];
  const {id}=await (await request('/projects','POST',{state})).json(),path='/projects/'+id;
  const full=await request(path),fullText=await full.text(),before=JSON.parse(fullText);
  assert.equal(full.headers.get('cache-control'),'no-store');
  const poll=await request(path+'/revision'),pollText=await poll.text(),revision=JSON.parse(pollText);
  assert.equal(poll.status,200);assert.equal(poll.headers.get('cache-control'),'no-store');
  assert.deepEqual(Object.keys(revision).sort(),['id','revision','updatedAt']);assert.equal(revision.id,id);assert.equal(revision.revision,before.revision);
  assert.ok(pollText.length<200&&fullText.length>80000,'revision poll is tiny compared with the project');
  assert.equal((await request(path+'/revision','GET',undefined,'stranger')).status,403,'non-members cannot read the revision');
  const initialPointer=JSON.parse((await db.prepare('SELECT state FROM projects WHERE id=?').bind(id).first()).state);
  const start=1000,end=1040,saved=await request(path+'/operate','POST',{revision:before.revision,operation:{type:'coding.create',data:{documentId:'a',sourceRevision:1,start,end,text:points.slice(start,end).join(''),codeIds:['c1']}}});
  assert.equal(saved.status,200);const after=await saved.json();assert.equal(after.revision,before.revision+1);assert.equal(after.state.codings.length,1);
  assert.equal((await (await request(path+'/revision')).json()).revision,after.revision);
  assert.deepEqual((await (await request(path)).json()).state,after.state,'the operate response carries exactly the stored state');
  const backups=(await db.prepare('SELECT revision,object_key,checksum,label FROM backups WHERE project_id=? ORDER BY revision').bind(id).all()).results;
  const prior=backups.filter(b=>b.revision===before.revision);
  assert.ok(prior.length>=1&&prior.every(b=>b.object_key===initialPointer._stateKey&&b.checksum===initialPointer._checksum),'the recovery point before the change reuses the verified stored object');
  const objects=(await bucket.list({prefix:'states/'+id+'/'})).objects;assert.equal(objects.length,2,'only the new state is uploaded');
  // A stale revision is still refused after the lightweight poll.
  assert.equal((await request(path+'/operate','POST',{revision:before.revision,operation:{type:'coding.create',data:{documentId:'a',sourceRevision:1,start:2000,end:2010,text:points.slice(2000,2010).join(''),codeIds:['c1']}}})).status,409);
 }finally{await mf.dispose();}
});
