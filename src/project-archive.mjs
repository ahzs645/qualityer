import {zip,strToU8,strFromU8} from 'fflate';
import {validateState} from './domain.mjs';
import {transcriptExport} from './transcript-alignment.mjs';
import {mediaFileType} from './media-file.mjs';
import {safeCSV} from './report-export.mjs';

const keyFields=new Set(['mediaKey','recordingKey']);
const safeName=value=>String(value||'source').normalize('NFC').replace(/[\\/\u0000-\u001f<>:"|?*]/g,'_').replace(/^\.+/,'_').slice(0,120)||'source';
const extensions={'audio/mpeg':'mp3','audio/mp4':'m4a','audio/quicktime':'qta','audio/wav':'wav','audio/x-wav':'wav','audio/flac':'flac','audio/ogg':'ogg','audio/webm':'webm','video/mp4':'mp4','video/quicktime':'mov','video/webm':'webm','video/ogg':'ogv','application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'};
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const json=value=>strToU8(JSON.stringify(value,null,2));

/** Every explicit recording/media reference, including archived source versions. */
export function projectMediaReferences(state){
 const refs=new Map();
 function visit(value,context={}){
  if(!value||typeof value!=='object')return;
  const next={...context,type:value.mediaType||context.type,name:context.name||value.name,documentId:value.documentId||context.documentId};
  for(const [field,item] of Object.entries(value)){
   if(keyFields.has(field)&&typeof item==='string'&&item){
    const ref=refs.get(item)||{key:item,type:next.type||'application/octet-stream',name:next.name||'',documentIds:[],historical:true};
    if(next.type&&ref.type==='application/octet-stream')ref.type=next.type;
    if(field==='mediaKey'&&value.mediaType)ref.type=value.mediaType;
    if(next.documentId&&!ref.documentIds.includes(next.documentId))ref.documentIds.push(next.documentId);
    if(next.current&&field==='mediaKey')ref.historical=false;
    refs.set(item,ref);
   }else if(item&&typeof item==='object')visit(item,{...next,current:false});
  }
 }
 for(const d of state.documents||[])visit(d,{documentId:d.id,name:d.name,type:d.mediaType,current:true});
 // Imported server metadata is reference history, never a live media attachment.
 for(const [field,value] of Object.entries(state))if(!['documents','archiveImport'].includes(field))visit(value);
 return [...refs.values()];
}

/** Readable companions retain the native snapshot as the authoritative record. */
export function projectArchiveFiles(state,{metadata={}}={}){
 validateState(state);
 const files={'research-weave.json':json({format:'research-weave',version:1,state}),'research-weave-project-metadata.json':json(metadata)};
 for(const [index,d] of state.documents.entries()){
  const path='Transcripts/'+String(index+1).padStart(4,'0')+'-'+safeName(d.name);
  files[path+'.txt']=strToU8(d.text);
  files[path+'.transcript.json']=json(transcriptExport(d));
 }
 for(const field of ['codes','codings','cases','memos','journals','reviewTasks','frameworkStudies','frameworkCells','analysisContinuations'])if(state[field])files['Analysis/'+field+'.json']=json(state[field]);
 files['Analysis/coded-excerpts.csv']=strToU8(safeCSV([['Source','Code','Quotation','Coder','Status','Start','End','Source revision'],...(state.codings||[]).map(c=>[state.documents.find(d=>d.id===c.documentId)?.name||c.documentId,state.codes.find(code=>code.id===c.codeId)?.name||c.codeId,c.text,c.coder,c.status,c.start,c.end,c.sourceRevision])]));
 files['README.txt']=strToU8('Research Weave study export\n\nresearch-weave.json is the complete native project snapshot. Transcripts/ contains exact text and timing companions. Analysis/ contains saved coding, cases, memos, journals, reviews, Framework matrices and evidence-linked analysis when present.\n\nMachine transcripts, anonymous speaker estimates and agent-reviewed interpretations retain their recorded uncertainty. They do not establish human listening review, speaker identity, prevalence or importance. Consent and off-record decisions remain in the native snapshot.\n');
 return files;
}

/** Portable native ZIP. Media is stored without recompressing audio/video bytes. */
export async function exportProjectArchive(state,{includeMedia=false,mediaFiles={},metadata={}}={}){
 const files=projectArchiveFiles(state,{metadata});
 const references=projectMediaReferences(state),assets=[];
 if(includeMedia)for(const [index,ref] of references.entries()){
  const supplied=mediaFiles instanceof Map?mediaFiles.get(ref.key):mediaFiles[ref.key];
  const bytes=supplied instanceof Uint8Array?supplied:supplied?.bytes;
  if(!(bytes instanceof Uint8Array))throw Error('Project ZIP is missing requested media: '+ref.key);
  const name=safeName(supplied?.name||ref.name||'recording'),type=mediaFileType({name,type:supplied?.type||ref.type}),extension=extensions[type]||'bin';
  const path='Media/'+String(index+1).padStart(4,'0')+'-'+name+(name.toLowerCase().endsWith('.'+extension)?'':'.'+extension);
  assets.push({...ref,type,name,path,byteLength:bytes.byteLength,sha256:await digest(bytes)});
  files[path]=[bytes,{level:0}];
 }
 const manifest={format:'research-weave-project-archive',version:1,includeMedia,references,assets};
 files['research-weave-archive.json']=json(manifest);
 files['EXPORT-SCOPE.json']=json({format:manifest.format,version:1,media:includeMedia?'All explicit current and historical media references are included and SHA-256 checked.':'No binary media is included. Original recording identifiers remain as provenance; playback requires reattachment.',nativeState:'research-weave.json retains all supplied project-state fields and identifiers, including transcript timing, speaker corrections, source revisions, coding decisions, review tasks, memos, cases, attributes and protocol.',metadata:'research-weave-project-metadata.json contains only the server metadata supplied by the exporter. Its audit events, membership, job and recovery indexes are reference records; importing this ZIP does not grant membership or restart jobs.',excluded:['Private account notes','Service credentials','Embedding caches','Full server recovery snapshots unless explicitly supplied in metadata','Binary processing-job result artifacts unless explicitly supplied'],transcripts:'Plain UTF-8 text and per-source native transcript JSON are included. Original DOCX and other converted source bytes are included only when they were retained as referenced media.'});
 return new Promise((resolve,reject)=>zip(files,{level:6},(error,data)=>error?reject(error):resolve(data)));
}

const megabytes=n=>(n/1048576).toLocaleString('en',{maximumFractionDigits:1})+' MB';
const baseName=value=>String(value||'').split('/').at(-1).normalize('NFC').replace(/ \(\d+\)(?=\.[^.]*$|$)/,'');

/** Parse already-unzipped native ZIP entries; validate every declared asset. `partial` treats absent media entries as missing (cut-off download); `recordings` are separately downloaded files ({name,bytes}) matched to the manifest by file name, then unique exact size. */
export async function readProjectArchive(files,{partial=false,recordings=[]}={}){
 if(!files['research-weave-archive.json'])return null;
 const manifest=JSON.parse(strFromU8(files['research-weave-archive.json']));
 if(manifest.format!=='research-weave-project-archive'||manifest.version!==1)throw Error('Unsupported project ZIP version.');
 if(!files['research-weave.json'])throw Error('Project ZIP is missing its native project snapshot.');
 const state=JSON.parse(strFromU8(files['research-weave.json'])).state;
 validateState(state);
 const mediaFiles=[],missingMedia=[],warnings=[];
 const assetKeys=new Set(),assetPaths=new Set(),referenceKeys=new Set(projectMediaReferences(state).map(ref=>ref.key));
 if(typeof manifest.includeMedia!=='boolean'||!Array.isArray(manifest.assets))throw Error('Project ZIP contains an invalid media manifest.');
 if(!manifest.includeMedia&&manifest.assets.length)throw Error('Transcript-only project ZIP cannot contain declared media assets.');
 for(const asset of manifest.assets||[]){
  if(typeof asset.key!=='string'||!asset.key||assetKeys.has(asset.key))throw Error('Project ZIP contains invalid or duplicate media identifiers.');
  if(typeof asset.path!=='string'||!asset.path.startsWith('Media/')||asset.path.split('/').some(part=>part==='..')||assetPaths.has(asset.path))throw Error('Project ZIP contains invalid or duplicate media paths.');
  if(!referenceKeys.has(asset.key))throw Error('Project ZIP contains unreferenced media: '+asset.key);
  assetKeys.add(asset.key);
  assetPaths.add(asset.path);
  const bytes=files[asset.path];
  if(!bytes){if(partial){missingMedia.push({key:asset.key,path:asset.path,name:asset.name,byteLength:asset.byteLength});continue;}throw Error('Project ZIP is missing media: '+asset.path);}
  if(bytes.byteLength!==asset.byteLength||await digest(bytes)!==asset.sha256)throw Error('Project ZIP media integrity check failed: '+asset.path);
  mediaFiles.push({originalKey:asset.key,bytes,name:asset.name,type:asset.type,documentIds:asset.documentIds||[]});
 }
 if(manifest.includeMedia&&!partial)for(const ref of projectMediaReferences(state))if(!assetKeys.has(ref.key))throw Error('Project ZIP is missing requested media: '+ref.key);
 // Study downloads list large recordings for separate download; match supplied files by name, then by unique exact size.
 const listed=(Array.isArray(manifest.recordings)?manifest.recordings:[]).filter(r=>r?.delivery==='separate'),used=new Set();
 for(const item of listed){
  if(typeof item.key!=='string'||!referenceKeys.has(item.key)||assetKeys.has(item.key)||typeof item.path!=='string'||!item.path.startsWith('Media/')||item.path.split('/').some(part=>part==='..')||!Number.isSafeInteger(item.size))throw Error('Project ZIP lists an invalid separately downloaded recording.');
  assetKeys.add(item.key);
  const sized=recordings.filter(f=>!used.has(f)&&f.bytes?.byteLength===item.size),file=sized.find(f=>baseName(f.name)===baseName(item.path))||(sized.length===1&&listed.filter(r=>r.size===item.size).length===1?sized[0]:null);
  if(!file){missingMedia.push({key:item.key,path:item.path,name:item.name,byteLength:item.size,separate:true});continue;}
  if(item.checksums?.sha256&&await digest(file.bytes)!==item.checksums.sha256)throw Error('Recording '+file.name+' does not match the checksum listed in the study ZIP.');
  used.add(file);mediaFiles.push({originalKey:item.key,bytes:file.bytes,name:item.name||file.name,type:item.type,documentIds:item.documentIds||[]});
 }
 const unmatched=recordings.filter(f=>!used.has(f)).map(f=>f.name),notSelected=missingMedia.filter(m=>m.separate);
 if(notSelected.length)warnings.push('Recordings listed in this study ZIP but not selected with it: '+notSelected.map(m=>baseName(m.path)+' ('+megabytes(m.byteLength)+')').join(', ')+'. They are treated as missing, as in a transcript-only import. Select the ZIP together with its recording files to restore them.');
 if(unmatched.length)warnings.push('These selected files do not match any recording listed in the ZIP (by name and exact size) and were not imported: '+unmatched.join(', ')+'.');
 const metadata=files['research-weave-project-metadata.json']?JSON.parse(strFromU8(files['research-weave-project-metadata.json'])):{};
 return {state,mediaFiles,metadata,manifest,missingMedia,warnings};
}

/** Salvage a study ZIP that stopped before its central directory (see recoverZipEntries). Opens the native snapshot when it arrived complete; every incomplete or never-received entry is named and its media treated as missing. */
export async function readRecoveredProjectArchive(recovery,{recordings=[]}={}){
 const files=recovery.files,cut=recovery.incomplete[0],lead='This ZIP is truncated: it has no end-of-central-directory record, so the download stopped after '+recovery.totalBytes.toLocaleString('en')+' bytes'+(cut?.path?' inside '+cut.path:'')+'.';
 if(!files['research-weave.json'])throw Error(lead+' Its native project snapshot (research-weave.json) did not arrive complete, so nothing can be imported. Download the study again.');
 let scope=null;try{scope=files['EXPORT-SCOPE.json']?JSON.parse(strFromU8(files['EXPORT-SCOPE.json'])):null;}catch{}
 let native=await readProjectArchive(files,{partial:true,recordings});
 if(!native){
  // Older downloads wrote their manifest last. Their Media/NNNN- paths follow the snapshot's reference order.
  const state=JSON.parse(strFromU8(files['research-weave.json'])).state;validateState(state);
  const refs=projectMediaReferences(state),mediaFiles=[];
  for(const [path,bytes] of Object.entries(files)){const n=/^Media\/(\d{4})-(.+)$/.exec(path),ref=n&&refs[Number(n[1])-1];if(ref)mediaFiles.push({originalKey:ref.key,bytes,name:n[2],type:ref.type,documentIds:ref.documentIds||[]});}
  let metadata={};try{metadata=files['research-weave-project-metadata.json']?JSON.parse(strFromU8(files['research-weave-project-metadata.json'])):{};}catch{}
  native={state,mediaFiles,metadata,manifest:{format:'research-weave-project-archive'},missingMedia:refs.filter(ref=>!mediaFiles.some(m=>m.originalKey===ref.key)).map(ref=>({key:ref.key,name:ref.name})),warnings:[]};
 }
 const expected=Array.isArray(scope?.entries)?scope.entries:[],incomplete=recovery.incomplete.map(e=>({path:e.path,receivedBytes:e.receivedBytes,expectedBytes:e.expectedBytes??expected.find(x=>x.path===e.path)?.byteLength,reason:e.reason})),never=expected.filter(e=>!files[e.path]&&!incomplete.some(i=>i.path===e.path)).map(e=>e.path);
 const warnings=[lead,'Recovered '+recovery.complete.length+' complete entr'+(recovery.complete.length===1?'y':'ies')+', including the native project snapshot shown here.',...incomplete.map(e=>'Incomplete: '+(e.path||'an unnamed entry')+' ('+e.receivedBytes.toLocaleString('en')+(e.expectedBytes!=null?' of '+e.expectedBytes.toLocaleString('en'):'')+' bytes received). '+e.reason)];
 if(never.length)warnings.push('Never received: '+never.join(', ')+'.');
 else if(!scope)warnings.push('This older download did not list its entries in advance; anything written after the incomplete entry (usually research-weave-archive.json, EXPORT-SCOPE.json and README.txt) is missing.');
 const lost=native.missingMedia.filter(m=>!m.separate);
 if(lost.length)warnings.push('Recordings not restored: '+lost.map(m=>m.path?baseName(m.path):m.name||m.key).join(', ')+'. They are treated as missing, as in a transcript-only import; reattach them later.');
 if(native.mediaFiles.length)warnings.push(native.mediaFiles.length+' recording'+(native.mediaFiles.length===1?'':'s')+' arrived complete and checked, and will be restored.');
 return {...native,warnings:[...warnings,...native.warnings],recovery:{truncated:true,receivedBytes:recovery.totalBytes,recovered:recovery.complete.map(e=>e.path),incomplete,neverReceived:never}};
}

/** Rebind verified uploaded bytes without treating them as a replacement recording. */
export function restoreProjectMedia(state,keyMap={}, {detachMissing=true}={}){
 const next=structuredClone(state),mapped=key=>{const value=keyMap instanceof Map?keyMap.get(key):Object.hasOwn(keyMap,key)?keyMap[key]:null;return typeof value==='string'&&value?value:null;};
 function visit(value){
  if(!value||typeof value!=='object')return;
  for(const [field,item] of Object.entries(value)){
   if(field==='archiveImport')continue;
   if(keyFields.has(field)&&typeof item==='string'&&item&&mapped(item))value[field]=mapped(item);
   else if(item&&typeof item==='object')visit(item);
  }
 }
 visit(next);
 if(detachMissing)for(const [index,d] of next.documents.entries()){
  const original=state.documents[index];
  if(original.mediaKey&&!mapped(original.mediaKey)){
   d.mediaKey=null;
   if(d.alignment&&d.alignment.status==='matched')d.alignment.status='unbound';
  }
 }
 validateState(next);return next;
}
