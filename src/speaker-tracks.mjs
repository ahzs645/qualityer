// Recording-bound annotations. Timing is supplied evidence; missing timing stays missing.
const clone=x=>structuredClone(x),label=x=>typeof x==='string'&&x.trim().length>0&&x.length<=200&&!/[\u0000-\u001f]/u.test(x);
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const stamp=()=>new Date().toISOString();
function binding(x){if(!x||typeof x.sourceId!=='string'||!x.sourceId||typeof x.recordingKey!=='string'||!x.recordingKey||typeof x.runId!=='string'||!x.runId)throw Error('Speaker tracks require a source, recording and run identifier.');return {sourceId:x.sourceId,recordingKey:x.recordingKey,runId:x.runId};}
export function normalizeDiarization(input,expected={}){
 const scope=binding(input);for(const key of ['sourceId','recordingKey','runId'])if(expected[key]!=null&&expected[key]!==scope[key])throw Error('Speaker tracks belong to another '+key+'.');
 if(input.units!==undefined&&input.units!=='seconds')throw Error('Speaker track units must be seconds.');
 if(input.history!==undefined&&!Array.isArray(input.history))throw Error('Speaker correction history must be an array.');const tracks={regular:[],exclusive:[]};
 for(const kind of ['regular','exclusive']){
  const rows=input[kind]??[];if(!Array.isArray(rows)||rows.length>100000)throw Error('Speaker tracks must be bounded arrays.');const ids=new Set();
  tracks[kind]=rows.map((row,index)=>{
   if(!row||!label(row.speaker)||!numeric(row.timeStart)||!numeric(row.timeEnd)||row.timeEnd<=row.timeStart)throw Error('Speaker intervals need a label and positive seconds range.');
   const id=row.id??`${scope.runId}:${kind}:${index}`;if(typeof id!=='string'||!id||ids.has(id))throw Error('Speaker interval identifiers must be unique.');ids.add(id);
   if(row.rawSpeaker!=null&&!label(row.rawSpeaker))throw Error('Invalid original speaker label.');
   return {...clone(row),id,speaker:row.speaker,rawSpeaker:row.rawSpeaker??row.speaker,timeStart:row.timeStart,timeEnd:row.timeEnd};
  });
  if(kind==='exclusive'){const sorted=[...tracks[kind]].sort((a,b)=>a.timeStart-b.timeStart||a.timeEnd-b.timeEnd);for(let i=1;i<sorted.length;i++)if(sorted[i].timeStart<sorted[i-1].timeEnd)throw Error('Exclusive speaker tracks cannot overlap.');}
 }
 return {...clone(input),...scope,units:'seconds',...tracks,history:clone(input.history??[])};
}
export function speakerOverlaps(track){
 const points=(track||[]).flatMap(row=>[{time:row.timeStart,kind:1,row},{time:row.timeEnd,kind:-1,row}]).sort((a,b)=>a.time-b.time||a.kind-b.kind),active=new Map(),out=[];let previous=null;
 for(let i=0;i<points.length;){const time=points[i].time;if(previous!==null&&time>previous&&active.size>1)out.push({timeStart:previous,timeEnd:time,intervalIds:[...active.keys()],speakers:[...new Set([...active.values()].map(x=>x.speaker))]});while(i<points.length&&points[i].time===time){const {row,kind}=points[i++];if(kind<0)active.delete(row.id);else active.set(row.id,row);}previous=time;}
 return out;
}
export function correctSpeakers(document,{sourceId,recordingKey,runId,turnIds=[],intervalIds=[],track='regular',to},actor='researcher',date=stamp()){
 if(document.id!==sourceId||!label(to)||!Array.isArray(turnIds)||!Array.isArray(intervalIds)||!['regular','exclusive'].includes(track))throw Error('Choose this source and a valid speaker correction.');
 const turns=document.turns||[],selected=new Set(turnIds),intervals=new Set(intervalIds),run=document.diarization;
 if(!selected.size&&!intervals.size)throw Error('Select turns or speaker intervals to correct.');
 if(selected.size!==turnIds.length||intervals.size!==intervalIds.length)throw Error('Duplicate selections are invalid.');
 if(turnIds.some(id=>!turns.some(t=>t.id===id)))throw Error('A selected turn is missing.');
 if(runId!==undefined&&runId!==null){if(!run||run.runId!==runId||run.recordingKey!==recordingKey||recordingKey!==document.mediaKey)throw Error('Speaker correction belongs to a different recording run.');if(turnIds.some(id=>turns.find(t=>t.id===id)?.speakerRunId!==runId))throw Error('A selected turn belongs to another speaker run.');}
 if(intervals.size){if(!runId||!recordingKey||document.mediaKey!==recordingKey)throw Error('Interval correction requires the current recording and run.');normalizeDiarization(run,{sourceId,recordingKey,runId});if(intervalIds.some(id=>!run[track].some(row=>row.id===id)))throw Error('A selected interval is missing.');}
 const result=clone(document),changes=[];
 result.turns=turns.map(t=>{if(!selected.has(t.id))return clone(t);changes.push({kind:'turn',id:t.id,from:t.speaker,to});return {...clone(t),rawSpeaker:t.rawSpeaker??t.speaker,speaker:to};});
 if(intervals.size)result.diarization[track]=run[track].map(row=>{if(!intervals.has(row.id))return clone(row);changes.push({kind:track,id:row.id,from:row.speaker,to});return {...clone(row),rawSpeaker:row.rawSpeaker??row.speaker,speaker:to};});
 const history={sourceId,recordingKey:recordingKey??null,runId:runId??null,actor,date,to,changes};result.speakerMappings??=[];result.speakerMappings.push(history);if(intervals.size){result.diarization.history??=[];result.diarization.history.push(history);}return result;
}
export function importRTTM(text,scope,{track='regular',recordingId=null}={}){
 if(!['regular','exclusive'].includes(track)||typeof text!=='string'||text.length>16000000)throw Error('Invalid RTTM input.');binding(scope);const rows=[];let declared=recordingId;
 for(const [index,line] of text.split(/\r?\n/u).entries()){
  if(!line.trim()||line.trim().startsWith('#'))continue;const fields=line.trim().split(/\s+/u);
  if(fields.length!==10||fields[0]!=='SPEAKER'||fields[2]!=='1')throw Error('RTTM requires ten-column SPEAKER records on channel 1.');
  if(declared===null)declared=fields[1];if(fields[1]!==declared)throw Error('Import one RTTM recording at a time.');
  if(![fields[3],fields[4]].every(value=>/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)))throw Error('RTTM timestamps must be decimal seconds.');const start=Number(fields[3]),duration=Number(fields[4]);if(!numeric(start)||!numeric(duration)||duration<=0||!label(fields[7]))throw Error('Invalid RTTM interval.');
  rows.push({id:`${scope.runId}:${track}:${index}`,timeStart:start,timeEnd:start+duration,speaker:fields[7],rawSpeaker:fields[7]});
 }
 return normalizeDiarization({...scope,units:'seconds',recordingId:declared,[track]:rows,history:[],provenance:{format:'RTTM',channel:1,track}});
}
export function exportRTTM(input,{track='regular',recordingId=input.recordingId??'recording'}={}){
 const run=normalizeDiarization(input);if(!['regular','exclusive'].includes(track)||typeof recordingId!=='string'||!recordingId||/\s/u.test(recordingId))throw Error('Choose a single-token RTTM recording identifier.');
 const speakerAliases=Object.create(null),used=new Set(run[track].map(row=>row.speaker).filter(speaker=>! /\s/u.test(speaker)));let count=0;const rows=run[track].map(row=>{let speaker=row.speaker;if(/\s/u.test(speaker)){if(!speakerAliases[speaker]){let alias;do{alias=`speaker_${++count}`;}while(used.has(alias));used.add(alias);speakerAliases[speaker]=alias;}speaker=speakerAliases[speaker];}return `SPEAKER ${recordingId} 1 ${row.timeStart} ${row.timeEnd-row.timeStart} <NA> <NA> ${speaker} <NA> <NA>`;});
 return {text:rows.join('\n')+(rows.length?'\n':''),report:{format:'RTTM',sourceId:run.sourceId,recordingKey:run.recordingKey,runId:run.runId,track,speakerAliases,losses:['RTTM omits transcript words, correction history, run metadata and original speaker labels; retain canonical JSON alongside it.']}};
}
function cue(seconds,comma){const ms=Math.round(seconds*1000),h=Math.floor(ms/3600000),m=Math.floor(ms/60000)%60,s=Math.floor(ms/1000)%60;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}${comma?',':'.'}${String(ms%1000).padStart(3,'0')}`;}
export function exportCorrectedTranscript(document,format='vtt'){
 if(!['srt','vtt','tsv'].includes(format))throw Error('Choose SRT, VTT or TSV.');const omitted=[],rounded=[],rows=[];
 for(const t of document.turns||[]){const text=Array.from(document.text||'').slice(t.start,t.end).join('').trim();if(format==='tsv'){rows.push([t.id,t.timeStart??'',t.timeEnd??'',t.speaker??'',t.rawSpeaker??'',text]);continue;}
  if(!numeric(t.timeStart)||!numeric(t.timeEnd)||t.timeEnd<=t.timeStart||t.timingStatus==='needs_review'||t.anchorStatus==='needs_review'){omitted.push(t.id);continue;}
  if(Math.round(t.timeStart*1000)!==t.timeStart*1000||Math.round(t.timeEnd*1000)!==t.timeEnd*1000)rounded.push(t.id);
  if(Math.round(t.timeEnd*1000)<=Math.round(t.timeStart*1000)){omitted.push(t.id);continue;}
  const safe=text.replace(/-->/gu,'→').replace(/\r?\n\s*\r?\n/gu,'\n'),speaker=String(t.speaker||'Speaker').replace(/[\r\n]/gu,' ');rows.push(`${rows.length+1}\n${cue(t.timeStart,format==='srt')} --> ${cue(t.timeEnd,format==='srt')}\n${speaker}: ${safe}\n`);
 }
 const cell=value=>'"'+String(value).replaceAll('"','""')+'"';
 return {text:format==='tsv'?[['turn_id','start_seconds','end_seconds','speaker','original_speaker','text'],...rows].map(row=>row.map(cell).join('\t')).join('\n')+'\n':(format==='vtt'?'WEBVTT\n\n':'')+rows.join('\n'),report:{format,sourceId:document.id,recordingKey:document.mediaKey??null,alignment:clone(document.alignment??null),omittedTurnIds:omitted,roundedToMilliseconds:rounded,losses:format==='tsv'?['TSV retains untimed turns as empty cells; canonical JSON retains word timing, corrections and metadata.']:['Subtitle cues use milliseconds; untimed, invalid or stale turns are omitted.','Overlapping supplied cues are retained; player rendering varies.','Speaker labels are prefixed as text; raw labels and word timing require canonical JSON.']}};
}
