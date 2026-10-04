import {zip,strToU8,strFromU8} from 'fflate';
import {validateState} from './domain.mjs';
import {transcriptExport} from './transcript-alignment.mjs';
import {mediaFileType} from './media-file.mjs';

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

/** Portable native ZIP. Media is stored without recompressing audio/video bytes. */
export async function exportProjectArchive(state,{includeMedia=false,mediaFiles={},metadata={}}={}){
 validateState(state);
 const files={'research-weave.json':json({format:'research-weave',version:1,state}),'research-weave-project-metadata.json':json(metadata)};
 const references=projectMediaReferences(state),assets=[];
 for(const [index,d] of state.documents.entries()){
  const path='Transcripts/'+String(index+1).padStart(4,'0')+'-'+safeName(d.name);
  files[path+'.txt']=strToU8(d.text);
  files[path+'.transcript.json']=json(transcriptExport(d));
 }
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

/** Parse already-unzipped native ZIP entries; validate every declared asset. */
export async function readProjectArchive(files){
 if(!files['research-weave-archive.json'])return null;
 const manifest=JSON.parse(strFromU8(files['research-weave-archive.json']));
 if(manifest.format!=='research-weave-project-archive'||manifest.version!==1)throw Error('Unsupported project ZIP version.');
 if(!files['research-weave.json'])throw Error('Project ZIP is missing its native project snapshot.');
 const state=JSON.parse(strFromU8(files['research-weave.json'])).state;
 validateState(state);
 const mediaFiles=[];
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
  if(!bytes)throw Error('Project ZIP is missing media: '+asset.path);
  if(bytes.byteLength!==asset.byteLength||await digest(bytes)!==asset.sha256)throw Error('Project ZIP media integrity check failed: '+asset.path);
  mediaFiles.push({originalKey:asset.key,bytes,name:asset.name,type:asset.type,documentIds:asset.documentIds||[]});
 }
 if(manifest.includeMedia)for(const ref of projectMediaReferences(state))if(!assetKeys.has(ref.key))throw Error('Project ZIP is missing requested media: '+ref.key);
 const metadata=files['research-weave-project-metadata.json']?JSON.parse(strFromU8(files['research-weave-project-metadata.json'])):{};
 return {state,mediaFiles,metadata,manifest};
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
