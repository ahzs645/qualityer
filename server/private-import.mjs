import {emptyState,validateState,uid} from '../src/domain.mjs';
import {storeState,snapshotStatement} from './storage.mjs';

const registryKey='private-import:reviewed-interviews:v1';
const deny=(message,status=403)=>{throw Object.assign(Error(message),{status});};
async function authorized(provided,expected){
 if(typeof expected!=='string'||expected.length<32)return false;
 const hashes=await Promise.all([provided||'',expected].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 const [a,b]=hashes.map(value=>new Uint8Array(value));let difference=0;
 for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}

// An owner enables this narrow service route only while loading an owner-private
// Site. Sites service access supplies no visitor identity. The existing owner is
// read from server storage, and the token cannot access arbitrary projects.
export async function privateImport(req,env,dispatch){
 if(!env.PRIVATE_IMPORT_TOKEN)deny('Import service is disabled.',404);
 if(!await authorized(req.headers.get('x-qualityer-import-token'),env.PRIVATE_IMPORT_TOKEN))deny('Import authorization required.',401);
 const db=env.DB,pin=await db.prepare('SELECT value FROM site_settings WHERE key=?').bind('calibration_owner').first();
 if(!pin?.value)deny('Open the workspace as its owner before loading interviews.',503);
 const ownerId=pin.value,url=new URL(req.url),tail=url.pathname.slice('/api/private-import'.length);
 const existing=await db.prepare('SELECT value FROM site_settings WHERE key=?').bind(registryKey).first();
 let record=existing?JSON.parse(existing.value):null;
 if(!tail&&req.method==='POST'){
  if(Number(req.headers.get('content-length'))>32000000)deny('Import exceeds 32 MB.',413);
  const payload=await req.json();if(Object.keys(payload).some(key=>key!=='state'))deny('Only project state can be loaded.',400);
  const state=payload.state||emptyState('Reviewed interviews');validateState(state);
  if(!record){const candidate={id:uid(),ownerId};await db.prepare('INSERT OR IGNORE INTO site_settings (key,value) VALUES (?,?)').bind(registryKey,JSON.stringify(candidate)).run();record=JSON.parse((await db.prepare('SELECT value FROM site_settings WHERE key=?').bind(registryKey).first()).value);}
  if(record.ownerId!==ownerId)deny('Import ownership changed.');
  if(await db.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(record.id,ownerId).first())return Response.json({id:record.id,reused:true});
  const stored=await storeState(env,record.id,state),date=new Date().toISOString();
  const inserted=await db.prepare('INSERT OR IGNORE INTO projects (id,name,owner_id,state,revision,created_at,updated_at) VALUES (?,?,?,?,0,?,?)').bind(record.id,state.name,ownerId,stored.pointer,date,date).run();
  if(inserted.meta.changes===1)await snapshotStatement(db,record.id,0,stored,'Private interview import','private-import service').run();
  return Response.json({id:record.id,reused:inserted.meta.changes!==1},{status:inserted.meta.changes===1?201:200});
 }
 if(!record||record.ownerId!==ownerId)deny('Load the interview project first.',409);
 const allowed=(!tail&&req.method==='GET')||(/^\/uploads(?:\/[a-zA-Z0-9-]+\/(?:[1-9][0-9]{0,2}|complete|cancel))?$/.test(tail)&&req.method==='POST')||(/^\/media\/[a-zA-Z0-9-]+$/.test(tail)&&req.method==='GET')||(tail==='/operate'&&req.method==='POST');
 if(!allowed)deny('The import service only loads recordings into its own project.');
 let body=req.method==='GET'?undefined:req.body;
 if(tail==='/operate'){
  const payload=await req.json();if(payload.operation?.type!=='source.media.restore')deny('Only uploaded recording references can be restored.');
  body=JSON.stringify(payload);
 }
 const headers=new Headers(req.headers);headers.delete('x-qualityer-import-token');if(tail==='/operate')headers.delete('content-length');headers.set('oai-authenticated-user-id',ownerId);headers.set('oai-authenticated-user-email','private-import@service.invalid');
 // Reuse normal membership, revision, media ownership and upload-size checks.
 return dispatch(new Request(url.origin+'/api/projects/'+record.id+tail+url.search,{method:req.method,headers,body,duplex:body?'half':undefined}));
}
