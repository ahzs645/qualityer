import {normalizeDiarization} from './speaker-tracks.mjs';

const anonymous=label=>label==='Unassigned'||/^Speaker [1-9][0-9]{0,2}$/u.test(label||'');
const fraction=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1;
const bounded=value=>typeof value==='string'&&value.trim()&&value.length<=4000;
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function normalizeSpeakerApplication(data){
 if(!data||typeof data.id!=='string'||!Number.isInteger(data.sourceRevision)||data.sourceRevision<1||!bounded(data.note)||new TextEncoder().encode(JSON.stringify(data)).length>2000000)throw Error('Supply a bounded, source-revision-bound speaker application and note.');
 const run=normalizeDiarization(data.diarization,{sourceId:data.id});
 if(run.provenance?.machineEstimated!==true||run.provenance?.overlapDetection!==false||!bounded(run.provenance?.method)||! /^[0-9a-f]{64}$/u.test(run.provenance?.recordingSha256||''))throw Error('Record the acoustic method, recording hash and explicit machine/overlap limits.');
 if(run.provenance?.humanReviewed===true||run.provenance?.identityVerified===true)throw Error('Machine speaker proposals cannot claim human review or verified identities.');
 if(run.regular.some(row=>!anonymous(row.speaker))||run.exclusive.length)throw Error('Estimated speaker applications use anonymous regular labels; they cannot assert exclusive or verified identity tracks.');
 const sorted=[...run.regular].sort((a,b)=>a.timeStart-b.timeStart||a.timeEnd-b.timeEnd);
 if(sorted.some((r,i)=>i&&r.timeStart<sorted[i-1].timeEnd))throw Error('Single-voice clustering intervals cannot imply detected overlapping speech.');
 if(!Array.isArray(data.assignments)||!data.assignments.length||data.assignments.length>100000)throw Error('Supply all source-segment speaker decisions.');
 const labels=new Set(run.regular.map(r=>r.speaker));labels.add('Unassigned');
 const assignments=data.assignments.map(a=>{
  if(typeof a.turnId!=='string'||!anonymous(a.speaker)||!labels.has(a.speaker)||!fraction(a.dominantShare)||!fraction(a.coverage)||!bounded(a.reason))throw Error('Speaker decisions require anonymous labels, coverage, relative dominance and reasoning.');
  let contextReview;if(a.contextReview!==undefined){const c=a.contextReview;if(!['high','normal'].includes(c?.priority)||!Array.isArray(c.reasons)||!c.reasons.length||c.reasons.length>20||c.reasons.some(r=>!bounded(r)))throw Error('Bound transcript-context review cues and keep their priority explicit.');contextReview={priority:c.priority,reasons:c.reasons.map(r=>r.trim()),basis:'transcript-context-proposal',audioVerified:false};}
  return {turnId:a.turnId,speaker:a.speaker,dominantShare:a.dominantShare,coverage:a.coverage,reason:a.reason.trim(),...(contextReview?{contextReview}:{})};
 }).sort((a,b)=>a.turnId.localeCompare(b.turnId));
 if(new Set(assignments.map(a=>a.turnId)).size!==assignments.length)throw Error('Each source segment needs a single speaker decision.');
 return {id:data.id,sourceRevision:data.sourceRevision,diarization:run,assignments,note:data.note.trim()};
}
export function sameSpeakerApplication(document,data){
 try{const incoming=normalizeSpeakerApplication(data),previous=(document.speakerLabelRuns||[]).find(r=>r.input.diarization.runId===incoming.diarization.runId);return !!previous&&canonical(previous.input)===canonical(incoming);}catch{return false;}
}
// Anonymous acoustic proposals are a separate layer. This does not replace text,
// timing, coding, consent, identities or the source's wording-review decision.
export function applySpeakerApplication(document,data,actor,{snapshot}={}){
 const input=normalizeSpeakerApplication(data),previous=(document.speakerLabelRuns||[]).find(r=>r.input.diarization.runId===input.diarization.runId);
 if(previous){if(!sameSpeakerApplication(document,input))throw Error('This speaker run identifier already has different content.');return document;}
 if(document.id!==input.id||document.revision!==input.sourceRevision||document.mediaKey!==input.diarization.recordingKey||! /^(audio|video)\//u.test(document.mediaType||''))throw Error('The speaker result belongs to another source revision or recording.');
 if(! /^[0-9a-f]{64}$/u.test(document.attributes?.['Source SHA-256']||'')||document.attributes['Source SHA-256']!==input.diarization.provenance.recordingSha256)throw Error('The acoustic result recording hash does not match this source.');
 if(document.alignment?.status!=='matched'||document.alignment?.recordingKey!==document.mediaKey)throw Error('Confirm source timing is matched to the current recording before applying acoustic estimates.');
 const turns=document.turns||[];
 if(turns.length!==input.assignments.length||input.assignments.some(a=>!turns.some(t=>t.id===a.turnId)))throw Error('Review every current source segment; do not omit or invent speaker decisions.');
 if(turns.some(t=>t.anchorStatus==='needs_review'||t.timingStatus==='needs_review'||!Number.isFinite(t.timeStart)||!Number.isFinite(t.timeEnd)||t.timeStart<0||t.timeEnd<=t.timeStart))throw Error('Resolve stale or missing source timing before applying acoustic speaker decisions.');
 const byAssignment=new Map(input.assignments.map(a=>[a.turnId,a]));
 for(const turn of turns){
  const seconds=new Map();for(const interval of input.diarization.regular){if(interval.speaker==='Unassigned')continue;const overlap=Math.max(0,Math.min(interval.timeEnd,turn.timeEnd)-Math.max(interval.timeStart,turn.timeStart));if(overlap)seconds.set(interval.speaker,(seconds.get(interval.speaker)||0)+overlap);}
  const total=[...seconds.values()].reduce((n,v)=>n+v,0),dominant=[...seconds].sort((a,b)=>b[1]-a[1])[0],coverage=total/(turn.timeEnd-turn.timeStart),share=total?(dominant?.[1]||0)/total:0,a=byAssignment.get(turn.id),epsilon=1e-6;
  if(Math.abs(coverage-a.coverage)>epsilon||Math.abs(share-a.dominantShare)>epsilon)throw Error('Speaker diagnostics must match the regular acoustic intervals inside each source segment.');
  if(a.speaker!=='Unassigned'&&(a.speaker!==dominant?.[0]||coverage+epsilon<.6||share+epsilon<.92||total+epsilon<.6||total-(dominant?.[1]||0)>.2+epsilon))throw Error('Ambiguous, mixed or low-coverage source segments must remain Unassigned.');
 }
 if(turns.some(t=>t.speakerAssignment?.status==='researcher-recorded')||(document.speakerMappings||[]).length)throw Error('Researcher speaker decisions are already present. Review this result alongside them instead of replacing those decisions.');
 const byId=new Map(input.assignments.map(a=>[a.turnId,a])),date=new Date().toISOString();
 const next=structuredClone(document);
 next.turns=turns.map(t=>{const a=byId.get(t.id);return {...structuredClone(t),rawSpeaker:t.rawSpeaker??t.speaker??'Unassigned',speaker:a.speaker,speakerRunId:input.diarization.runId,speakerAssignment:{runId:input.diarization.runId,status:a.speaker==='Unassigned'?'unresolved':'machine-estimate',dominantShare:a.dominantShare,coverage:a.coverage,reason:a.reason,method:input.diarization.provenance.method,...(a.contextReview?{contextReview:structuredClone(a.contextReview)}:{}),reviewer:null,identityVerified:false}};});
 next.diarization=structuredClone(input.diarization);
 next.speakerLabelRuns=[...(next.speakerLabelRuns||[]),{input,actor,date,status:'machine-estimate',humanReviewed:false,identityVerified:false}];
 next.speakerReviewStatus='Machine estimates — researcher review pending';
 next.attributes={...(next.attributes||{}),'Speaker separation':input.diarization.provenance.method+'; anonymous machine estimates; researcher review pending'};
 if('Identity status' in next.attributes)next.attributes['Identity status']='Recording file label only; anonymous voice estimates, identities unverified';
 if(snapshot){snapshot(document,actor);next.versions=document.versions;}
 Object.assign(document,next);return document;
}
