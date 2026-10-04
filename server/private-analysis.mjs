import {sameContinuationInput} from '../src/analysis-continuation.mjs';
const deny=(message,status=403)=>{throw Object.assign(Error(message),{status});};
async function authorized(provided,expected){
 if(typeof expected!=='string'||expected.length<32)return false;
 const hashes=await Promise.all([provided||'',expected].map(value=>crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
 const [a,b]=hashes.map(value=>new Uint8Array(value));let difference=0;
 for(let i=0;i<a.length;i++)difference|=a[i]^b[i];return difference===0;
}
// Temporary owner-private service. It can read the already registered study and
// add evidence-linked analysis through the normal fenced project operation.
// It cannot replace a project, correct transcripts, grant access or approve a
// human review. Ordinary visitor authentication remains unchanged.
export async function privateAnalysis(req,env,dispatch){
 if(!env.PRIVATE_ANALYSIS_TOKEN)deny('Analysis service is disabled.',404);
 if(!await authorized(req.headers.get('x-qualityer-analysis-token'),env.PRIVATE_ANALYSIS_TOKEN))deny('Analysis authorization required.',401);
 const url=new URL(req.url);
 if(url.pathname!=='/api/private-analysis'||!['GET','POST'].includes(req.method))deny('Only registered-study analysis is available.');
 const pin=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?').bind('calibration_owner').first();
 const saved=await env.DB.prepare('SELECT value FROM site_settings WHERE key=?').bind('private-import:reviewed-interviews:v1').first();
 const record=saved?JSON.parse(saved.value):null;
 if(!pin?.value||!record||record.ownerId!==pin.value)deny('The registered study owner is unavailable.',409);
 if(!await env.DB.prepare('SELECT id FROM projects WHERE id=? AND owner_id=?').bind(record.id,pin.value).first())deny('The registered study is unavailable.',409);
 const headers=new Headers(req.headers);headers.delete('x-qualityer-analysis-token');headers.delete('content-length');headers.set('oai-authenticated-user-id',pin.value);headers.set('oai-authenticated-user-email','private-analysis@service.invalid');
 const get=()=>dispatch(new Request(url.origin+'/api/projects/'+record.id,{headers}));
 if(req.method==='GET')return get();
 if(Number(req.headers.get('content-length'))>2000000)deny('Analysis exceeds 2 MB.',413);
 const raw=await req.text();if(new TextEncoder().encode(raw).length>2000000)deny('Analysis exceeds 2 MB.',413);
 let payload;try{payload=JSON.parse(raw);}catch{deny('Supply a JSON analysis operation.',400);}
 if(!payload||Object.keys(payload).some(k=>!['revision','operation'].includes(k))||payload.operation?.type!=='framework.continuation.add'||!Number.isInteger(payload.revision))deny('Only a revision-fenced analysis continuation may be added.');
 const response=await get();if(!response.ok)return response;
 const current=await response.clone().json(),previous=current.state.analysisContinuations?.find(r=>r.id===payload.operation.data?.id);
 if(previous){if(!sameContinuationInput(previous,payload.operation.data))deny('This analysis identifier already has different content.',409);return response;}
 return dispatch(new Request(url.origin+'/api/projects/'+record.id+'/operate',{method:'POST',headers,body:JSON.stringify(payload)}));
}
