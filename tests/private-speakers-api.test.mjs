import test from'node:test';import assert from'node:assert/strict';import{Miniflare}from'miniflare';import{readFile,readdir}from'node:fs/promises';import{emptyState}from'../src/domain.mjs';
test('Private speaker service is confined, revision-fenced, resume-safe and disabled after loading',async()=>{
 const token='synthetic-speakers-service-token-1234567890',options={modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{PRIVATE_IMPORT_TOKEN:token,PRIVATE_SPEAKERS_TOKEN:token},d1Databases:['DB'],r2Buckets:['BUCKET']},mf=new Miniflare(options);
 try{
 let db=await mf.getD1Database('DB');for(const f of(await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of(await readFile('drizzle/'+f,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
 await db.prepare('INSERT INTO site_settings (key,value) VALUES (?,?)').bind('calibration_owner','owner').run();
 const call=(path,body,credential=token)=>mf.dispatchFetch('https://test.invalid/api'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','x-qualityer-import-token':token,'x-qualityer-speakers-token':credential},body:body?JSON.stringify(body):undefined});
 const s=emptyState('Synthetic two-voice source'),sha='a'.repeat(64);s.documents=[{id:'d',name:'Synthetic',text:'one\ntwo\n',revision:1,mediaKey:'old/audio',mediaType:'audio/wav',alignment:{status:'matched',recordingKey:'old/audio'},attributes:{'Source SHA-256':sha},turns:[{id:'a',start:0,end:4,timeStart:0,timeEnd:2,speaker:'Unassigned'},{id:'b',start:4,end:8,timeStart:2,timeEnd:4,speaker:'Unassigned'}],excludeAI:true}];
 assert.equal((await call('/private-import',{state:s})).status,201);await mf.setOptions({...options,bindings:{PRIVATE_IMPORT_TOKEN:'disabled',PRIVATE_SPEAKERS_TOKEN:token}});db=await mf.getD1Database('DB');
 assert.equal((await call('/me')).status,401);assert.equal((await call('/private-speakers',null,'wrong')).status,401);
 for(const type of ['source.transcript','source.speaker','permissions.update','framework.cell.review'])assert.equal((await call('/private-speakers',{revision:0,operation:{type}})).status,403);
 const data={id:'d',sourceRevision:1,note:'Synthetic acoustic proposal.',diarization:{sourceId:'d',recordingKey:'old/audio',runId:'run',regular:[{id:'i',speaker:'Speaker 1',timeStart:0,timeEnd:4}],exclusive:[],provenance:{method:'Synthetic fixture',machineEstimated:true,overlapDetection:false,recordingSha256:sha}},assignments:['a','b'].map(turnId=>({turnId,speaker:'Speaker 1',coverage:1,dominantShare:1,reason:'Synthetic only.'}))};
 const payload={revision:0,operation:{type:'source.diarization.apply',data}};
 assert.equal((await call('/private-speakers',{...payload,revision:99})).status,409);const first=await call('/private-speakers',payload);assert.equal(first.status,200);const saved=await first.json();assert.equal(saved.revision,1);assert.equal(saved.state.documents[0].text,s.documents[0].text);assert.equal(saved.state.documents[0].turns[0].speakerAssignment.identityVerified,false);
 const retry=await(await call('/private-speakers',payload)).json();assert.equal(retry.revision,1);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM events').first()).n,1);
 const conflicting=structuredClone(payload);conflicting.operation.data.assignments[0].reason='Different';assert.equal((await call('/private-speakers',conflicting)).status,409);
 assert.equal((await call('/private-speakers',{...payload,state:s})).status,403);assert.equal((await call('/private-speakers/members')).status,403);
 await mf.setOptions({...options,bindings:{PRIVATE_SPEAKERS_TOKEN:'disabled',PRIVATE_IMPORT_TOKEN:'disabled'}});assert.equal((await call('/private-speakers')).status,401);assert.equal((await call('/private-import')).status,401);assert.equal((await call('/me')).status,401);
 }finally{await mf.dispose();}
});
