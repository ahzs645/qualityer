import * as zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import {projectMediaReferences} from '../src/project-archive.mjs';
import {crc32} from '../src/zip-recovery.mjs';
import {transcriptExport} from '../src/transcript-alignment.mjs';
import {safeCSV} from '../src/report-export.mjs';
import {readEventDetails} from './event-detail.mjs';

/** `?media=1` embeds recordings only while their total stays at or below this (override with the STUDY_EMBED_MEDIA_BYTES variable; 0 never embeds). Larger studies list them for separate, resumable download. */
export const EMBED_MEDIA_LIMIT=64*1024*1024;
const embedLimit=env=>env.STUDY_EMBED_MEDIA_BYTES!=null&&env.STUDY_EMBED_MEDIA_BYTES!==''&&Number.isFinite(Number(env.STUDY_EMBED_MEDIA_BYTES))?Number(env.STUDY_EMBED_MEDIA_BYTES):EMBED_MEDIA_LIMIT;
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const name=value=>String(value||'source').normalize('NFC').replace(/[\\/\u0000-\u001f<>:"|?*]/g,'_').replace(/^\.+/,'_').slice(0,120);
const encoder=new TextEncoder(),u8=value=>encoder.encode(value),json=value=>u8(JSON.stringify(value,null,2)),pad=n=>String(n).padStart(4,'0');
const crc=(bytes,previous=0)=>typeof zlib.crc32==='function'?zlib.crc32(bytes,previous)>>>0:crc32(bytes,previous);
const ownMedia=(pid,key)=>typeof key==='string'&&key.startsWith(pid+'/')&&key.length>pid.length+1&&!key.slice(pid.length+1).includes('/');
const disposition=filename=>'attachment; filename="'+filename.replace(/[^\x20-\x7e]|["\\]/g,'_')+'"; filename*=UTF-8\'\''+encodeURIComponent(filename);
// One `bytes=` range against `size`: {offset,length}, false when unsatisfiable (416), null when absent or not a single range (serve the whole file).
const byteRange=(header,size)=>{const m=/^bytes=(\d*)-(\d*)$/.exec(String(header||'').trim());if(!m||m[1]===''&&m[2]==='')return null;if(m[1]===''){const n=Math.min(Number(m[2]),size);return n>0?{offset:size-n,length:n}:false;}const start=Number(m[1]),end=m[2]===''?size-1:Math.min(Number(m[2]),size-1);return start<size&&end>=start?{offset:start,length:end-start+1}:false;};
const fixedStream=length=>globalThis.FixedLengthStream?new FixedLengthStream(length):new TransformStream();
const recordingFile=(head,ref)=>{const type=head.httpMetadata?.contentType||ref.type,original=head.customMetadata?.name||ref.name||'recording',extension={'audio/mp4':'m4a','audio/quicktime':'qta','audio/mpeg':'mp3','audio/wav':'wav'}[type];return {type,name:original,filename:name(original)+(extension&&!original.toLowerCase().endsWith('.'+extension)?'.'+extension:'')};};

/** Every explicit current and historical recording, numbered like the Media/NNNN- paths of embedded downloads. */
async function studyRecordings(env,pid,state,{required=true}={}){
 const list=[];
 for(const [i,ref] of projectMediaReferences(state).entries()){
  const n=i+1,foreign=!ownMedia(pid,ref.key);
  if(foreign&&required)fail('A referenced recording belongs to another project. Restore it before downloading with recordings.');
  const head=foreign?null:await env.BUCKET?.head(ref.key),base={n,key:ref.key,documentIds:ref.documentIds,historical:ref.historical,download:'/api/projects/'+pid+'/archive/media/'+n};
  if(!head){if(required)fail('A referenced recording is missing. Choose the download without recordings or restore it.');list.push({...base,name:ref.name||'recording',type:ref.type,missing:true,...(foreign?{foreign:true}:{})});continue;}
  const file=recordingFile(head,ref);
  list.push({...base,...file,filename:pad(n)+'-'+file.filename,path:'Media/'+pad(n)+'-'+file.filename,size:head.size,etag:head.etag,checksums:head.checksums?.toJSON?.()||{}});
 }
 return list;
}

export async function studyRecordingList(env,p,state,role){
 if(role!=='owner')fail('Only the project owner can download study recordings.',403);
 const recordings=await studyRecordings(env,p.id,state,{required:false});
 return {embedLimit:embedLimit(env),totalBytes:recordings.reduce((n,r)=>n+(r.size||0),0),recordings};
}

/** One original recording, byte-for-byte from storage, with Range/If-Range so browsers can resume. */
export async function studyRecording(req,env,p,state,role,n){
 if(role!=='owner')fail('Only the project owner can download study recordings.',403);
 const ref=/^[1-9]\d{0,5}$/.test(n)?projectMediaReferences(state)[Number(n)-1]:null;if(!ref)fail('Recording not found.',404);
 if(!ownMedia(p.id,ref.key))fail('This recording belongs to another project.',409);
 const head=await env.BUCKET?.head(ref.key);if(!head)fail('This recording is missing from project storage.',404);
 const file=recordingFile(head,ref),ifRange=req.headers.get('if-range'),range=req.headers.has('range')&&(!ifRange||ifRange===head.httpEtag||ifRange===head.etag)?byteRange(req.headers.get('range'),head.size):null;
 const h=new Headers({'Content-Type':file.type||'application/octet-stream','Content-Disposition':disposition(pad(Number(n))+'-'+file.filename),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Accept-Ranges':'bytes','ETag':head.httpEtag});
 if(range===false){h.set('Content-Range','bytes */'+head.size);return new Response(null,{status:416,headers:h});}
 const length=range?range.length:head.size;h.set('Content-Length',String(length));if(range)h.set('Content-Range',`bytes ${range.offset}-${range.offset+length-1}/${head.size}`);
 if(req.method==='HEAD')return new Response(null,{status:range?206:200,headers:h});
 const obj=await env.BUCKET.get(ref.key,{onlyIf:{etagMatches:head.etag},...(range?{range}:{})});
 if(!obj?.body)fail('This recording changed while the download started. Retry.');
 // A fixed-length body makes a cut-off transfer a network error in the browser, not a short "complete" file.
 const out=fixedStream(length),started=Date.now();let sent=0;
 obj.body.pipeThrough(new TransformStream({transform(chunk,controller){sent+=chunk.byteLength;controller.enqueue(chunk);}})).pipeTo(out.writable).catch(error=>console.error('Study recording '+n+' download stopped after '+sent+' of '+length+' bytes in '+(Date.now()-started)+' ms:',error?.message||error));
 return new Response(out.readable,{status:range?206:200,headers:h});
}

async function* coalesce(chunks,size=65536){
 const buffer=new Uint8Array(size);let used=0;
 for await(const bytes of chunks){
  if(bytes.length>=size){if(used){yield buffer.slice(0,used);used=0;}yield bytes;continue;}
  if(used+bytes.length>size){yield buffer.slice(0,used);used=0;}
  buffer.set(bytes,used);used+=bytes.length;
 }
 if(used)yield buffer.slice(0,used);
}

/** Owner-only, read-only export. A stored (uncompressed) ZIP whose every entry is measured before the first byte is sent, so the response has an exact Content-Length and a cut-off download fails visibly. Recordings above EMBED_MEDIA_LIMIT never pass through the Worker. */
export async function studyDownload(req,env,p,state,role,access){
 if(role!=='owner')fail('Only the project owner can download the complete study and recovery history.',403);
 const mode=new URL(req.url).searchParams.get('media'),wantsMedia=mode==='1'||mode==='separate',pid=p.id,db=env.DB;
 const metadata={project:{id:pid,name:p.name,revision:p.revision,createdAt:p.created_at,updatedAt:p.updated_at},availability:{}};
 for(const table of ['members','jobs','backups'])metadata[table]=(await db.prepare('SELECT * FROM '+table+' WHERE project_id=? ORDER BY id').bind(pid).all()).results;
 metadata.events=await readEventDetails(env,pid,(await db.prepare('SELECT id,actor,action,detail,created_at FROM events WHERE project_id=? ORDER BY created_at,id').bind(pid).all()).results,access);
 const references=projectMediaReferences(state),objects=[];
 async function retain(key,path,kind,extra={}){
  const allowed=kind==='recovery'?key.startsWith('states/'+pid+'/'):key.startsWith('jobs/'+pid+'/');
  if(!allowed)fail('A retained file belongs to another project. No archive was created.');
  const head=await env.BUCKET?.head(key);if(!head)fail('A retained '+kind+' file is missing. Restore it before downloading the complete study.');
  objects.push({key,path,kind,etag:head.etag,size:head.size,...extra});
 }
 for(const [i,backup] of metadata.backups.entries())await retain(backup.object_key,'Recovery/'+pad(i+1)+'-revision-'+backup.revision+'.json','recovery',{expectedChecksum:backup.checksum});
 for(const job of metadata.jobs)if(job.result_key)await retain(job.result_key,'Processing/'+name(job.id)+'.json','processing');
 // Separate delivery tolerates missing recordings: the available ones are listed for download and the rest are named as missing, so one lost file does not drop every recording from the study ZIP.
 const listed=wantsMedia?await studyRecordings(env,pid,state,{required:mode!=='separate'}):[],recordings=listed.filter(r=>!r.missing),missingRecordings=listed.filter(r=>r.missing),mediaBytes=recordings.reduce((n,r)=>n+r.size,0),embed=mode==='1'&&mediaBytes<=embedLimit(env);
 if(embed)for(const r of recordings)objects.push({key:r.key,path:r.path,kind:'media',etag:r.etag,size:r.size,recording:r});
 const mediaDelivery=!recordings.length?'none':embed?'embedded':'separate';
 const current=await db.prepare('SELECT revision FROM projects WHERE id=?').bind(pid).first();
 if(current.revision!==p.revision)fail('Project changed while preparing the archive. Please retry.');
 metadata.availability={events:'included',members:'included',jobs:'included with retained result files',backups:'included with full recovery snapshots'};
 async function* objectJSON(value){
  yield u8('{');let first=true;
  for(const [key,item] of Object.entries(value)){
   if(item===undefined)continue;
   yield u8((first?'':',')+JSON.stringify(key)+':');first=false;
   if(Array.isArray(item)){yield u8('[');for(let i=0;i<item.length;i++)yield u8((i?',':'')+JSON.stringify(item[i]));yield u8(']');}
   else yield u8(JSON.stringify(item));
  }yield u8('}');
 }
 async function* native(){yield u8('{"format":"research-weave","version":1,"state":');yield* objectJSON(state);yield u8('}');}
 // Generated entries are produced twice (measure, then send); the output is deterministic for one revision.
 const generated=[{path:'research-weave.json',chunks:native},{path:'research-weave-project-metadata.json',chunks:()=>[json(metadata)]}];
 for(const [i,d] of state.documents.entries()){
  const prefix='Transcripts/'+pad(i+1)+'-'+name(d.name);
  generated.push({path:prefix+'.txt',chunks:()=>[u8(d.text)]},{path:prefix+'.transcript.json',chunks:()=>objectJSON(transcriptExport(d,{clone:false}))});
 }
 for(const field of ['codes','codings','cases','memos','journals','reviewTasks','frameworkStudies','frameworkCells','analysisContinuations'])if(state[field])generated.push({path:'Analysis/'+field+'.json',chunks:()=>[json(state[field])]});
 generated.push({path:'Analysis/coded-excerpts.csv',chunks:()=>[u8(safeCSV([['Source','Code','Quotation','Coder','Status','Start','End','Source revision'],...(state.codings||[]).map(c=>[state.documents.find(d=>d.id===c.documentId)?.name||c.documentId,state.codes.find(code=>code.id===c.codeId)?.name||c.codeId,c.text,c.coder,c.status,c.start,c.end,c.sourceRevision])]))]});
 for(const entry of generated){let size=0,check=0;for await(const bytes of coalesce(entry.chunks())){size+=bytes.length;check=crc(bytes,check);}Object.assign(entry,{kind:'generated',size,crc:check});}
 for(const object of objects){
  const body=await env.BUCKET.get(object.key,{onlyIf:{etagMatches:object.etag}});
  if(!body?.body)fail('A retained file changed or disappeared while preparing the download. No archive was created; retry.');
  const hash=createHash('sha256');let size=0,check=0;for await(const bytes of body.body){hash.update(bytes);size+=bytes.length;check=crc(bytes,check);}
  Object.assign(object,{sha256:hash.digest('hex'),crc:check});
  if(size!==object.size)fail('A retained file changed size while preparing the download. No archive was created; retry.');
  if(object.expectedChecksum&&object.sha256!==object.expectedChecksum)fail('Recovery checksum failed. No archive was created; restore a verified copy and retry.');
 }
 const separate=[...recordings.map(({n,download,...r})=>({...r,delivery:embed?'embedded':'separate',...(embed?{}:{download})})),...missingRecordings.map(r=>({key:r.key,name:r.name,type:r.type,documentIds:r.documentIds,historical:r.historical,delivery:'missing'}))];
 const assets=objects.filter(o=>o.kind==='media').map(o=>({key:o.key,type:o.recording.type,name:o.recording.name,documentIds:o.recording.documentIds,historical:o.recording.historical,path:o.path,byteLength:o.size,sha256:o.sha256,etag:o.etag}));
 const fixed=(path,bytes,kind)=>({path,kind,bytes,size:bytes.length,crc:crc(bytes)});
 const readme=fixed('README.txt',u8('Complete study download\n\nOpen research-weave.json for the full native project; Transcripts/ for exact text and timing; Analysis/ for coding, memos, journals, review tasks and Framework work; Recovery/ for earlier saved states; Processing/ for retained job results. EXPORT-SCOPE.json comes first and lists every following entry with its byte length and CRC-32; this README is written last, so a ZIP without it (or that will not open) stopped downloading early.\n\nRecordings: '+(mediaDelivery==='embedded'?'included in Media/ and SHA-256 checked.':mediaDelivery==='separate'?'downloaded separately, one file per recording, from the Export dialog. EXPORT-SCOPE.json and research-weave-archive.json list each file name, size and storage checksum. To restore them, import this ZIP together with the recording files.':'not requested.')+'\n\nEach Recovery/ file is an earlier raw project state. To import it, wrap it as {"format":"research-weave","version":1,"state":<recovery state>}. Importing the complete ZIP opens its current native snapshot; recovery copies and audit history remain reference records. Importing a cut-off ZIP opens the native snapshot when it arrived complete and names every missing entry.\n\nPreserve consent and off-record decisions. Machine estimates and agent-reviewed interpretations still require researcher review. Counts describe saved coding, not prevalence or importance.\n'),'readme');
 const archive=fixed('research-weave-archive.json',json({format:'research-weave-project-archive',version:1,includeMedia:embed,mediaDelivery,references,assets,recordings:separate}),'manifest');
 const following=[archive,...generated,...objects,readme],hex=n=>n.toString(16).padStart(8,'0');
 const scope=fixed('EXPORT-SCOPE.json',json({format:'research-weave-study-download',version:2,revision:p.revision,includeMedia:embed,mediaDelivery,integrity:'Entries follow in the listed order, uncompressed, each with its exact byte length and CRC-32. A complete download ends with README.txt and a ZIP central directory. If either is missing the download stopped early: import recovers complete entries and names the rest.',entries:following.map(e=>({path:e.path,kind:e.kind,byteLength:e.size,crc32:hex(e.crc),...(e.sha256?{sha256:e.sha256}:{})})),recordings:separate,retained:objects.map(o=>({path:o.path,kind:o.kind,byteLength:o.size,sha256:o.sha256,etag:o.etag})),nativeState:'All saved project fields, including exact transcripts, source versions, timing, speaker estimates, coding, consent decisions, reviews, memos, cases and analysis.',history:'Full retained recovery snapshots and event history; retained processing results are included.',excluded:['Private account notes','Service credentials','Embedding caches','Files never retained in project storage',...(mediaDelivery==='separate'?['Recording bytes (listed under recordings; download each separately)']:[])],qualification:'Machine transcripts, anonymous speaker estimates and agent reviews do not certify human listening, identities or interpretations. Counts do not establish prevalence or importance.'}),'manifest');
 const entries=[scope,...following];for(const e of entries)e.name=u8(e.path);
 const total=entries.reduce((n,e)=>n+76+2*e.name.length+e.size,22);
 if(total>0xffffffff||entries.length>0xffff)fail('This study is too large for a single ZIP. Download recordings separately; contact support if the study ZIP still exceeds 4 GB.',413);
 const stamp=new Date(Date.parse(p.updated_at)||0),time=stamp.getUTCHours()<<11|stamp.getUTCMinutes()<<5|stamp.getUTCSeconds()>>1,date=Math.max(0,stamp.getUTCFullYear()-1980)<<9|stamp.getUTCMonth()+1<<5|stamp.getUTCDate();
 function header(e,offset){
  const central=offset!==undefined,bytes=new Uint8Array((central?46:30)+e.name.length),view=new DataView(bytes.buffer);let at=0;
  const w16=x=>{view.setUint16(at,x,true);at+=2;},w32=x=>{view.setUint32(at,x,true);at+=4;};
  w32(central?0x02014b50:0x04034b50);if(central)w16(20);w16(10);w16(0x800);w16(0);w16(time);w16(date);w32(e.crc);w32(e.size);w32(e.size);w16(e.name.length);w16(0);
  if(central){w16(0);w16(0);w16(0);w32(0);w32(offset);}
  bytes.set(e.name,at);return bytes;
 }
 const out=fixedStream(total),writer=out.writable.getWriter(),started=Date.now();let written=0,at='start';
 const send=async bytes=>{await writer.write(bytes);written+=bytes.length;};
 async function* stored(object){const body=await env.BUCKET.get(object.key,{onlyIf:{etagMatches:object.etag}});if(!body?.body)throw Error('A retained file changed or disappeared during download.');yield* body.body;}
 (async()=>{
  try{
   const offsets=[];
   for(const e of entries){
    at=e.path;offsets.push(written);await send(header(e));let sent=0;
    for await(const bytes of e.bytes?[e.bytes]:e.chunks?coalesce(e.chunks()):stored(e)){sent+=bytes.length;if(sent>e.size)break;await send(bytes);}
    if(sent!==e.size)throw Error(e.path+' changed size during download ('+sent+' of '+e.size+' bytes).');
   }
   at='central directory';const directory=written;
   for(const [i,e] of entries.entries())await send(header(e,offsets[i]));
   const end=new Uint8Array(22),view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,written-directory,true);view.setUint32(16,directory,true);
   await send(end);await writer.close();
  }catch(error){console.error('Study download failed after '+written+' of '+total+' bytes in '+(Date.now()-started)+' ms at '+at+':',error?.message||error);await writer.abort(error).catch(()=>{});}
 })();
 return new Response(out.readable,{headers:{'Content-Type':'application/zip','Content-Length':String(total),'Content-Disposition':'attachment; filename="research-weave-complete-study'+({embedded:'-with-recordings',separate:'-recordings-separate'}[mediaDelivery]||'-without-recordings')+'.zip"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
