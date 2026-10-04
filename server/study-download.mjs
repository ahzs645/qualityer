import {Zip,ZipPassThrough,ZipDeflate,strToU8} from 'fflate';
import {createHash} from 'node:crypto';
import {projectMediaReferences} from '../src/project-archive.mjs';
import {transcriptExport} from '../src/transcript-alignment.mjs';
import {safeCSV} from '../src/report-export.mjs';
import {readEventDetails} from './event-detail.mjs';

const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const name=value=>String(value||'source').normalize('NFC').replace(/[\\/\u0000-\u001f<>:"|?*]/g,'_').replace(/^\.+/,'_').slice(0,120);
const json=value=>strToU8(JSON.stringify(value,null,2));

/** Owner-only, read-only export. Recordings and recovery copies never collect in RAM. */
export async function studyDownload(req,env,p,state,role,access){
 if(role!=='owner')fail('Only the project owner can download the complete study and recovery history.',403);
 const includeMedia=new URL(req.url).searchParams.get('media')==='1',pid=p.id,db=env.DB;
 const metadata={project:{id:pid,name:p.name,revision:p.revision,createdAt:p.created_at,updatedAt:p.updated_at},availability:{}};
 for(const table of ['members','jobs','backups'])metadata[table]=(await db.prepare('SELECT * FROM '+table+' WHERE project_id=? ORDER BY id').bind(pid).all()).results;
 metadata.events=await readEventDetails(env,pid,(await db.prepare('SELECT id,actor,action,detail,created_at FROM events WHERE project_id=? ORDER BY created_at,id').bind(pid).all()).results,access);
 const references=projectMediaReferences(state),objects=[],assets=[];
 async function retain(key,path,kind,extra={}){
  const allowed=kind==='media'?key.startsWith(pid+'/')&&!key.slice(pid.length+1).includes('/'):kind==='recovery'?key.startsWith('states/'+pid+'/'):key.startsWith('jobs/'+pid+'/');
  if(!allowed)fail('A retained file belongs to another project. No archive was created.');
  const head=await env.BUCKET?.head(key);if(!head)fail('A retained '+kind+' file is missing. Restore it before downloading the complete study.');
  objects.push({key,path,kind,etag:head.etag,size:head.size,...extra});
 }
 for(const [i,backup] of metadata.backups.entries())await retain(backup.object_key,'Recovery/'+String(i+1).padStart(4,'0')+'-revision-'+backup.revision+'.json','recovery',{expectedChecksum:backup.checksum});
 for(const job of metadata.jobs)if(job.result_key)await retain(job.result_key,'Processing/'+name(job.id)+'.json','processing');
 if(includeMedia)for(const [i,ref] of references.entries()){
  if(!ref.key.startsWith(pid+'/')||ref.key.slice(pid.length+1).includes('/'))fail('A referenced recording belongs to another project. Restore it before downloading with recordings.');
  const head=await env.BUCKET?.head(ref.key);if(!head)fail('A referenced recording is missing. Choose the download without recordings or restore it.');
  const type=head.httpMetadata?.contentType||ref.type,original=head.customMetadata?.name||ref.name||'recording';
  const extension={'audio/mp4':'m4a','audio/quicktime':'qta','audio/mpeg':'mp3','audio/wav':'wav'}[type];
  const filename=name(original)+(extension&&!original.toLowerCase().endsWith('.'+extension)?'.'+extension:'');
  await retain(ref.key,'Media/'+String(i+1).padStart(4,'0')+'-'+filename,'media',{ref,type,name:original});
 }
 const current=await db.prepare('SELECT revision FROM projects WHERE id=?').bind(pid).first();
 if(current.revision!==p.revision)fail('Project changed while preparing the archive. Please retry.');
 metadata.availability={events:'included',members:'included',jobs:'included with retained result files',backups:'included with full recovery snapshots'};
 const transform=new TransformStream(),writer=transform.writable.getWriter();
 let output=[],zipError;
 const zip=new Zip((error,chunk)=>{if(error)zipError=error;else output.push(chunk);});
 async function flush(){if(zipError)throw zipError;for(const chunk of output)await writer.write(chunk);output=[];}
 async function entry(path,chunks,{binary=false,expectedChecksum}={}){
  const file=binary?new ZipPassThrough(path):new ZipDeflate(path,{level:1}),hash=createHash('sha256');let byteLength=0;
  zip.add(file);
  for await(const bytes of chunks)for(let offset=0;offset<bytes.length;offset+=65536){const part=bytes.subarray(offset,offset+65536);hash.update(part);byteLength+=part.length;file.push(part);await flush();}
  const sha256=hash.digest('hex');if(expectedChecksum&&sha256!==expectedChecksum)throw Error('Recovery checksum failed. The download is incomplete; retry after restoring a verified copy.');
  file.push(new Uint8Array(),true);await flush();return {sha256,byteLength};
 }
 async function* objectJSON(value){
  yield strToU8('{');let first=true;
  for(const [key,item] of Object.entries(value)){
   if(item===undefined)continue;
   yield strToU8((first?'':',')+JSON.stringify(key)+':');first=false;
   if(Array.isArray(item)){yield strToU8('[');for(let i=0;i<item.length;i++)yield strToU8((i?',':'')+JSON.stringify(item[i]));yield strToU8(']');}
   else yield strToU8(JSON.stringify(item));
  }yield strToU8('}');
 }
 async function* native(){yield strToU8('{"format":"research-weave","version":1,"state":');yield* objectJSON(state);yield strToU8('}');}

 (async()=>{
  try{
   await entry('research-weave.json',native());
   await entry('research-weave-project-metadata.json',[json(metadata)]);
   for(const [i,d] of state.documents.entries()){
    const prefix='Transcripts/'+String(i+1).padStart(4,'0')+'-'+name(d.name);
    await entry(prefix+'.txt',[strToU8(d.text)]);
    await entry(prefix+'.transcript.json',objectJSON(transcriptExport(d,{clone:false})));
   }
   for(const field of ['codes','codings','cases','memos','journals','reviewTasks','frameworkStudies','frameworkCells','analysisContinuations'])if(state[field])await entry('Analysis/'+field+'.json',[json(state[field])]);
   await entry('Analysis/coded-excerpts.csv',[strToU8(safeCSV([['Source','Code','Quotation','Coder','Status','Start','End','Source revision'],...(state.codings||[]).map(c=>[state.documents.find(d=>d.id===c.documentId)?.name||c.documentId,state.codes.find(code=>code.id===c.codeId)?.name||c.codeId,c.text,c.coder,c.status,c.start,c.end,c.sourceRevision])]))]);
   const retained=[];
   for(const object of objects){
    const body=await env.BUCKET.get(object.key,{onlyIf:{etagMatches:object.etag}});
    if(!body?.body)throw Error('A retained file changed or disappeared during download. Retry.');
    const checksum=await entry(object.path,body.body,{binary:object.kind==='media',expectedChecksum:object.expectedChecksum});
    if(checksum.byteLength!==object.size)throw Error('Retained file size changed during download. Retry.');
    retained.push({path:object.path,kind:object.kind,...checksum});
    if(object.ref)assets.push({...object.ref,type:object.type,name:object.name,path:object.path,...checksum});
   }
   await entry('research-weave-archive.json',[json({format:'research-weave-project-archive',version:1,includeMedia,references,assets})]);
   await entry('EXPORT-SCOPE.json',[json({revision:p.revision,includeMedia,retained,nativeState:'All saved project fields, including exact transcripts, source versions, timing, speaker estimates, coding, consent decisions, reviews, memos, cases and analysis.',history:'Full retained recovery snapshots and event history; retained processing results are included.',excluded:['Private account notes','Service credentials','Embedding caches','Files never retained in project storage'],qualification:'Machine transcripts, anonymous speaker estimates and agent reviews do not certify human listening, identities or interpretations. Counts do not establish prevalence or importance.'})]);
   await entry('README.txt',[strToU8('Complete study download\n\nOpen research-weave.json for the full native project; Transcripts/ for exact text and timing; Analysis/ for coding, memos, journals, review tasks and Framework work; Recovery/ for earlier saved states; Processing/ for retained job results; Media/ for recordings when selected. EXPORT-SCOPE.json lists retained-file sizes and SHA-256 checksums.\n\nEach Recovery/ file is an earlier raw project state. To import it, wrap it as {"format":"research-weave","version":1,"state":<recovery state>}. Importing the complete ZIP opens its current native snapshot; recovery copies and audit history remain reference records.\n\nPreserve consent and off-record decisions. Machine estimates and agent-reviewed interpretations still require researcher review. Counts describe saved coding, not prevalence or importance.\n')]);
   zip.end();await flush();await writer.close();
  }catch(error){console.error('Study download failed:',error.message);await writer.abort(error).catch(()=>{});}
 })();
 return new Response(transform.readable,{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="research-weave-complete-study'+(includeMedia?'-with-recordings':'-without-recordings')+'.zip"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
