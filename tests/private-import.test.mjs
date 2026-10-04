import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {emptyState} from '../src/domain.mjs';

test('Private loading service preserves user authentication and is confined to its pinned-owner imported project',async()=>{
 const token='synthetic-test-private-import-token-123456789',mf=new Miniflare({modules:true,scriptPath:'dist/server/index.js',compatibilityDate:'2025-10-01',compatibilityFlags:['nodejs_compat'],bindings:{PRIVATE_IMPORT_TOKEN:token},d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB');for(const file of (await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort())for(const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(sql.trim())await db.prepare(sql).run();
  const call=(path,method='GET',body,credential=token)=>mf.dispatchFetch('https://app.test/api'+path,{method,headers:{'Content-Type':'application/json','x-qualityer-import-token':credential},body:body?JSON.stringify(body):undefined});
  assert.equal((await call('/me')).status,401);assert.equal((await call('/private-import','GET',null,'wrong')).status,401);assert.equal((await call('/private-import')).status,503);
  await db.prepare('INSERT INTO site_settings (key,value) VALUES (?,?)').bind('calibration_owner','real-site-owner').run();
  const state=emptyState('Synthetic imported study');state.documents=[{id:'doc',name:'Source',text:'Synthetic words.',revision:1,mediaKey:'old/recording',mediaType:'audio/wav'}];
  assert.equal((await call('/private-import','POST',{state,ownerId:'attacker'})).status,400);
  const created=await call('/private-import','POST',{state});assert.equal(created.status,201);const {id}=await created.json();
  assert.equal((await call('/private-import','POST',{state})).status,200);assert.equal((await call('/private-import','POST',{state})).status,200);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM projects').first()).n,1);
  assert.equal((await db.prepare('SELECT owner_id FROM projects WHERE id=?').bind(id).first()).owner_id,'real-site-owner');assert.equal((await call('/projects/'+id)).status,401);
  const imported=await (await call('/private-import')).json();assert.equal(imported.id,id);assert.deepEqual(imported.state,state);
  assert.equal((await call('/private-import/members','POST',{email:'other@test.invalid',role:'owner'})).status,403);
  assert.equal((await call('/private-import/operate','POST',{revision:0,operation:{type:'permissions.update',data:{}}})).status,403);
  const bucket=await mf.getR2Bucket('BUCKET');await bucket.put('other/recording',new Uint8Array([1]));
  const restore=key=>call('/private-import/operate','POST',{revision:0,operation:{type:'source.media.restore',data:{keyMap:{'old/recording':key}}}});
  assert.equal((await restore('other/recording')).status,400);await bucket.put(id+'/recording',new Uint8Array([1]),{httpMetadata:{contentType:'audio/wav'}});
  assert.equal((await restore(id+'/recording')).status,200);const media=await call('/private-import/media/recording');assert.ok([200,206].includes(media.status));assert.deepEqual(new Uint8Array(await media.arrayBuffer()),new Uint8Array([1]));
  assert.equal((await restore(id+'/recording')).status,409);assert.equal((await call('/private-import/../projects/'+id)).status,401);
 }finally{await mf.dispose();}
});
