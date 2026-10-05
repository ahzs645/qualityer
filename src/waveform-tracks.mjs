import {eligibleAnalyticalCodings} from './analytical-codings.mjs';
import {restrictedSourceRanges} from './source-consent.mjs';
// Per-code recording tracks. Seconds only; text codepoints are never mixed into these positions.
export const MIN_SEGMENT=0.2,NUDGE=0.5;
const ms=n=>Math.round(n*1000)/1000,limit=d=>Number.isFinite(d)&&d>0?d:Infinity;
export function secondsAt(x,width,duration){if(!(width>0)||!(duration>0))return 0;return Math.max(0,Math.min(duration,x/width*duration));}
export function pixelAt(t,width,duration){if(!(duration>0))return 0;return Math.max(0,Math.min(width,t/duration*width));}
export function clampRange(start,end,duration,min=MIN_SEGMENT){const d=limit(duration);let a=Math.min(start,end),b=Math.max(start,end);if(!Number.isFinite(a)||!Number.isFinite(b))throw Error('Enter a valid time range.');a=Math.max(0,Math.min(a,d));b=Math.max(0,Math.min(b,d));if(b-a<min){b=Math.min(d,a+min);a=Math.max(0,b-min);}return {start:ms(a),end:ms(b)};}
export function retimeEdge(seg,edge,t,duration,min=MIN_SEGMENT){const d=limit(duration);if(!Number.isFinite(t))return {start:seg.start,end:seg.end};if(edge==='start')return {start:ms(Math.max(0,Math.min(t,seg.end-min))),end:seg.end};return {start:seg.start,end:ms(Math.min(d,Math.max(t,seg.start+min)))};}
export function nudgeEdge(seg,edge,delta,duration,min=MIN_SEGMENT){return retimeEdge(seg,edge,seg[edge]+delta,duration,min);}
// Overlapping segments of one code share a lane but take separate sub-rows (as in QualCoder).
export function packRows(segments){const ends=[];return [...segments].sort((a,b)=>a.start-b.start||a.end-b.end).map(s=>{let row=ends.findIndex(e=>e<=s.start);if(row<0){row=ends.length;ends.push(0);}ends[row]=s.end;return {...s,row};});}
export function mediaDetailWithheld(doc){return !doc||!!doc.deletedAt||doc.reviewStatus==='restricted'||restrictedSourceRanges(doc).length>0;}
function approximateSpans(state,doc){
 if(doc.alignment?.status!=='matched'||doc.alignment.recordingKey!==doc.mediaKey)return [];
 const turns=(doc.turns||[]).filter(t=>Number.isFinite(t.timeStart)&&t.anchorStatus!=='needs_review'&&t.timingStatus!=='needs_review'&&Number.isInteger(t.start)&&Number.isInteger(t.end)).sort((a,b)=>a.start-b.start);
 return eligibleAnalyticalCodings(state).filter(c=>c.documentId===doc.id&&!c.kind&&!c.deletedAt&&c.status!=='needs_review').flatMap(c=>{const hit=turns.filter(t=>t.start<c.end&&t.end>c.start);if(!hit.length)return [];const start=Math.min(...hit.map(t=>t.timeStart)),end=Math.max(...hit.map(t=>Number.isFinite(t.timeEnd)?t.timeEnd:turns[turns.indexOf(t)+1]?.timeStart??t.timeStart));return end>start?[{id:c.id,codeId:c.codeId,start,end,coder:c.coder,approximate:true}]:[];});
}
export function codeTrackLayout(state,doc,{actor='',canEdit=false,canReview=false,extraCodeIds=[]}={}){
 if(mediaDetailWithheld(doc))return {withheld:true,lanes:[],approximate:null,otherRecording:0};
 const codes=state.codes||[],media=(state.codings||[]).filter(c=>c.documentId===doc.id&&c.kind==='media'&&!c.deletedAt&&Number.isFinite(c.timeStart)&&Number.isFinite(c.timeEnd)&&c.timeEnd>c.timeStart&&c.timeStart>=0),current=media.filter(c=>c.recordingKey&&c.recordingKey===doc.mediaKey);
 const ids=[...new Set([...current.map(c=>c.codeId),...extraCodeIds])],order=id=>{const i=codes.findIndex(c=>c.id===id);return i<0?codes.length:i;};
 const lanes=ids.sort((a,b)=>order(a)-order(b)).map(codeId=>{const code=codes.find(c=>c.id===codeId),segments=packRows(current.filter(c=>c.codeId===codeId).map(c=>({id:c.id,codeId,start:c.timeStart,end:c.timeEnd,coder:c.coder,status:c.status,editable:canEdit&&(canReview||c.coder===actor)&&c.status!=='needs_review'})));return {codeId,name:code?.name||'Unknown code',color:code?.color||'#6e7f8b',codable:!!code&&code.codable!==false,segments,rows:Math.max(1,...segments.map(s=>s.row+1))};});
 const spans=packRows(approximateSpans(state,doc).map(s=>({...s,color:codes.find(c=>c.id===s.codeId)?.color||'#6e7f8b',name:codes.find(c=>c.id===s.codeId)?.name||'Unknown code'})));
 return {withheld:false,lanes,approximate:spans.length?{segments:spans,rows:Math.max(1,...spans.map(s=>s.row+1))}:null,otherRecording:media.length-current.length};
}
