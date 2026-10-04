import {sha256} from './storage.mjs';
import {visibleHistoryEvents} from './team-history-policy.mjs';

const encoder=new TextEncoder(),decoder=new TextDecoder();
export const INLINE_EVENT_DETAIL_BYTES=64*1024;
const bounded=value=>{const text=JSON.stringify(value);return text&&encoder.encode(text).byteLength<=24*1024?value:{truncated:true,note:'Full change detail is retained in verified object storage.'};};

/** Keep large transcript operations below D1's row limit without discarding history. */
export async function storeEventDetail(env,pid,eventId,detail){
 const serialized=typeof detail==='string'?detail:JSON.stringify(detail),bytes=encoder.encode(serialized);
 if(bytes.byteLength<=INLINE_EVENT_DETAIL_BYTES)return serialized;
 if(!env.BUCKET)throw Error('Event object storage is unavailable. No project changes were saved.');
 const checksum=await sha256(bytes),key='event-details/'+pid+'/'+eventId+'/'+checksum+'.json';
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
 const saved=await env.BUCKET.get(key);
 if(!saved||await sha256(await saved.arrayBuffer())!==checksum)throw Error('Could not verify the complete event history. No project changes were saved.');
 const value=typeof detail==='string'?JSON.parse(detail):detail;
 return JSON.stringify({_eventDetailKey:key,_checksum:checksum,_bytes:bytes.byteLength,recordId:typeof value.recordId==='string'?value.recordId.slice(0,200):null,revision:bounded(value.revision),operation:{type:String(value.operation?.type||'').slice(0,200)},diff:bounded(value.diff),textFilterScope:'SQL text filtering searches this stored summary; complete operation payloads are hydrated for history reading and export.'});
}

/** Authorize/redact before reading any object; never follow pointers to another project. */
export async function readEventDetails(env,pid,events,access){
 if(access?.blind)return visibleHistoryEvents(events,access);
 const result=[];
 for(const event of events){
  let pointer;try{pointer=JSON.parse(event.detail);}catch{result.push(event);continue;}
  if(!pointer||typeof pointer!=='object'||Array.isArray(pointer)){result.push(event);continue;}
  if(!Object.hasOwn(pointer,'_eventDetailKey')){result.push(event);continue;}
  if(typeof pointer._checksum!=='string'||!/^[a-f0-9]{64}$/.test(pointer._checksum)||pointer._eventDetailKey!=='event-details/'+pid+'/'+event.id+'/'+pointer._checksum+'.json')throw Error('Event history object does not belong to this project.');
  const object=await env.BUCKET?.get(pointer._eventDetailKey);
  if(!object)throw Error('Complete event history is unavailable.');
  const bytes=await object.arrayBuffer();
  if(bytes.byteLength!==pointer._bytes||await sha256(bytes)!==pointer._checksum)throw Error('Event history integrity check failed.');
  const detail=decoder.decode(bytes);JSON.parse(detail);
  result.push({...event,detail});
 }
 return result;
}
