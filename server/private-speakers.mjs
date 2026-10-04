import {sameSpeakerApplication} from '../src/speaker-label-application.mjs';
const deny=(message,status=403)=>{throw Object.assign(Error(message),{status});};
async function authorized(provided,expected){
 if(typeof expected!=='string'||expected.length<32)return false;
 const hashes=await Promise.all([provided||'',expected].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 const [a,b]=hashes.map(value=>new Uint8Array(value));let difference=0;
 for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
// Temporary owner-private service. It can read the already registered study and
// apply anonymous acoustic proposals through the normal fenced source operation.
// It cannot replace a project, correct transcripts, grant access or approve a
// human review. Ordinary visitor authentication remains unchanged.
export async function privateSpeakers(req,env,dispatch){
 if(!env.PRIVATE_SPEAKERS_TOKEN)deny('Speaker service is disabled.',404);
 if(!await authorized(req.headers.get('x-qualityer-speakers-token'),env.PRIVATE_SPEAKERS_TOKEN))deny('Speaker authorization required.',401);
 const url=new URL(req.url);
 if(url.pathname!=='/api/private-speakers'||!['GET','POST'].includes(req.method))deny('Only registered-study speaker loading is available.');
 const pin=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?').bind('calibration_owner').first();
 const saved=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?').bind('private-import:reviewed-interviews:v1').first();
 const record=saved?JSON.parse(saved.value):null;
 if(!pin?.value||!record||record.ownerId!==pin.value)deny('The registered study owner is unavailable.',409);
 if(!await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(record.id,pin.value).first())deny('The registered study is unavailable.',409);
 const headers=new Headers(req.headers);headers.delete('x-qualityer-speakers-token');headers.delete('content-length');headers.set('oai-authenticated-user-id',pin.value);headers.set('oai-authenticated-user-email','private-speakers@service.invalid');
 const get=()=>dispatch(new Request(url.origin+'/api/projects/'+record.id,{headers}));
 if(req.method==='GET')return get();
 if(Number(req.headers.get('content-length'))>2000000)deny('Speaker exceeds 2 MB.',413);
 const raw=await req.text();if(new TextEncoder().encode(raw).length>2000000)deny('Speaker exceeds 2 MB.',413);
 let payload;try{payload=JSON.parse(raw);}catch{deny('Supply a JSON speaker operation.',400);}
 if(!payload||Object.keys(payload).some(k=>!['revision','operation'].includes(k))||payload.operation?.type!=='source.diarization.apply'||!Number.isInteger(payload.revision))deny('Only a revision-fenced anonymous speaker application may be added.');
 const response=await get();if(!response.ok)return response;
 const current=await response.clone().json(),document=current.state.documents.find(d=>d.id===payload.operation.data?.id),previous=document?.speakerLabelRuns?.find(r=>r.input?.diarization.runId===payload.operation.data?.diarization?.runId);
 if(previous){if(!sameSpeakerApplication(document,payload.operation.data))deny('This speaker run identifier already has different content.',409);return response;}
 return dispatch(new Request(url.origin+'/api/projects/'+record.id+'/operate',{method:'POST',headers,body:JSON.stringify(payload)}));
}
