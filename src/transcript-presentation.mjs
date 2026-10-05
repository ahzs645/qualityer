import {cp,slice} from './domain.mjs';
import {pointLength} from './text-points.mjs';
import {canSeekTurn} from './transcript-alignment.mjs';

export const codePalette=['#007a87','#a94614','#6353a4','#237840','#a23768','#745c14','#2864a6','#a43232','#516c22','#714885','#126966','#855337','#3955a4','#9a3d80','#306c57','#755b81'];
function extraColor(index){const hue=(index*137.508)%360,lightness=.35,saturation=.58,a=saturation*Math.min(lightness,1-lightness),channel=n=>{const k=(n+hue/30)%12;return Math.round(255*(lightness-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');};return '#'+[0,8,4].map(channel).join('');}
// Display preferences never rewrite the saved codebook or quotation anchors.
export function displayCodebook(codes,mode='distinct'){
 const ids=[...new Set(codes.map(c=>c.id))].sort(),colors=new Map(ids.map((id,i)=>[id,i<codePalette.length?codePalette[i]:extraColor(i)]));
 return codes.map(code=>({...code,color:mode==='saved'?(code.color||'#537a92'):colors.get(code.id)}));
}
export function speakerColor(label){
 if(!label||/^(unassigned|unknown|unidentified|speaker unknown)$/iu.test(label.trim()))return '#687580';
 let hash=2166136261;for(const character of label.normalize('NFC'))hash=Math.imul(hash^character.codePointAt(0),16777619);
 return codePalette[(hash>>>0)%codePalette.length];
}
export function speakerAssignmentStatus(turn){
 const status=turn?.speakerAssignment?.status;
 if(['machine-estimate','unresolved','researcher-recorded'].includes(status))return status;
 return !turn?.speaker||/^(unassigned|unknown|unidentified|speaker unknown)$/iu.test(turn.speaker.trim())?'unresolved':'supplied';
}
export function speakerAssignmentLabel(turn){return {'machine-estimate':'Machine estimate · review needed',unresolved:'Unresolved speaker','researcher-recorded':'Researcher-recorded label · identity unverified',supplied:'Supplied label · review not recorded'}[speakerAssignmentStatus(turn)];}
export function readableInk(color){
 if(!/^#[0-9a-f]{6}$/iu.test(color||''))return '#fff';
 const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#172c38':'#fff';
}

export function transcriptReadingRows(doc,mode='sentences'){
 const length=pointLength(doc.text||'');if(!length)return [];
 const turns=(doc.turns||[]).map((turn,index)=>({...turn,number:index+1})).filter(t=>Number.isInteger(t.start)&&Number.isInteger(t.end)&&t.start>=0&&t.end>t.start&&t.end<=length&&t.anchorStatus!=='needs_review'&&(t.text==null||t.text===slice(doc.text,t.start,t.end)));
 const bounds=[...new Set([0,length,...turns.flatMap(t=>[t.start,t.end])])].sort((a,b)=>a-b),segments=[];
 for(let i=0;i<bounds.length-1;i++){
  const start=bounds[i],end=bounds[i+1],text=slice(doc.text,start,end),parents=turns.filter(t=>t.start<=start&&t.end>=end);
  if(!text.trim()&&segments.length){const last=segments.at(-1);last.end=end;last.text+=text;continue;}
  segments.push({start,end,text,turns:parents,speakers:[...new Set(parents.map(t=>t.speaker||'Unassigned'))],timeStart:parents.length===1&&canSeekTurn(doc,parents[0])?parents[0].timeStart:null,timeEnd:parents.length===1&&canSeekTurn(doc,parents[0])?parents[0].timeEnd:null});
 }
 const segmenter=mode==='sentences'&&typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'sentence'}):null,rows=[];
 for(const segment of segments){
  const parts=segmenter?[...segmenter.segment(segment.text)].map(p=>p.segment):[segment.text];let start=segment.start;
  for(const text of parts){const end=start+cp(text).length;if(!text.trim()&&rows.length){rows.at(-1).text+=text;rows.at(-1).end=end;}else rows.push({...segment,start,end,text,speakers:segment.speakers.length?segment.speakers:['Unassigned']});start=end;}
 }
 return rows.map((row,index)=>({...row,id:'reading-'+mode+'-'+row.start,number:index+1,unitKind:/[.!?؟。！？]["'”’\)\]]*\s*$/u.test(row.text)?'sentence':'fragment'}));
}
// Rendered chunks are sorted and disjoint, so each reading row finds its chunks by binary search instead of scanning all of them.
const disjoint=new WeakMap(),isDisjoint=chunks=>{let hit=disjoint.get(chunks);if(hit?.length!==chunks.length){hit={length:chunks.length,ok:chunks.every((c,i)=>c.end>=c.start&&(!i||chunks[i-1].end<=c.start))};disjoint.set(chunks,hit);}return hit.ok;};
function overlapping(row,chunks){if(!isDisjoint(chunks))return chunks.filter(c=>c.start<row.end&&c.end>row.start);let lo=0,hi=chunks.length;while(lo<hi){const mid=lo+hi>>1;if(chunks[mid].end<=row.start)lo=mid+1;else hi=mid;}const out=[];for(let i=lo;i<chunks.length&&chunks[i].start<row.end;i++)if(chunks[i].end>row.start)out.push(chunks[i]);return out;}
export function chunksForRow(row,chunks){return overlapping(row,chunks).map(c=>{const start=Math.max(row.start,c.start),end=Math.min(row.end,c.end);return {...c,start,end,text:slice(c.text,start-c.start,end-c.start)};});}
export function speakerTimeline(doc,track='regular'){
 const run=doc.diarization;
 if(run&&run.recordingKey!==doc.mediaKey)return {rows:[],kind:'stale',message:'Speaker track belongs to another recording. Review it before playback.'};
 if(run){const rows=(run[track]||[]).filter(r=>Number.isFinite(r.timeStart)&&Number.isFinite(r.timeEnd)&&r.timeStart>=0&&r.timeEnd>r.timeStart),machineEstimated=run.provenance?.machineEstimated===true;return {rows,kind:'diarization',machineEstimated,message:rows.length?(machineEstimated?'Estimated voice separation; anonymous labels and mixed segments require recording review.':'Supplied speaker separation; identities require review.')+(run.provenance?.overlapDetection===false?' Overlapping speech was not detected by this method; these tracks do not establish that overlap is absent.':''):'No intervals in this speaker track.'};}
 const rows=(doc.turns||[]).filter(t=>canSeekTurn(doc,t)&&Number.isFinite(t.timeEnd)&&t.timeEnd>t.timeStart);
 return {rows,kind:'transcript',message:'Speaker separation has not been loaded. This timeline uses supplied transcript segment timing.'};
}
