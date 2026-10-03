// Transcript formats from speech tools, not qualitative-project archives.
import {timestampedTranscript} from './transcript.mjs';
const decimal=/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;
const clean=raw=>{if(typeof raw!=='string'||raw.length>2000000||raw.includes('\0'))throw Error('Speech transcript must be bounded text without NUL bytes.');return raw.replace(/^\uFEFF/u,'').replace(/\r\n?/gu,'\n');};
function time(value,{milliseconds=false,missing=false}={}){if(value===''&&missing)return null;if(!decimal.test(value)||milliseconds&&!/^\d+$/u.test(value))throw Error('Transcript timing needs explicit nonnegative '+(milliseconds?'integer milliseconds':'decimal seconds')+'.');const result=Number(value)/(milliseconds?1000:1);if(!Number.isFinite(result)||result<0)throw Error('Invalid transcript timestamp.');return result;}
function bounds(start,end){if(start!==null&&end!==null&&end<start)throw Error('Transcript end precedes its start.');}
function prefix(text){const match=text.match(/^\[([^\]\n]+)\]:[ \t]*/u);return match&&match[1].trim()?{speaker:match[1],text:text.slice(match[0].length),rawCueText:text,speakerMarker:'explicit-bracket-prefix'}:{speaker:'Unassigned',text,rawCueText:text};}
function subtitleSeconds(value){const match=value.match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{3})$/u);if(!match||Number(match[2])>=60||Number(match[3])>=60)throw Error('Subtitle timestamps require valid HH:MM:SS.mmm or MM:SS.mmm.');return Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;}
export function parseSubtitles(raw,format='vtt'){
 if(!['vtt','srt'].includes(format))throw Error('Choose SRT or VTT.');const normalized=clean(raw);let content=normalized;if(format==='vtt'){if(!/^WEBVTT(?:[ \t].*)?\n/u.test(content))throw Error('VTT transcript requires WEBVTT header.');content=content.slice(content.indexOf('\n')+1);}
 const segments=[];
 for(const block of content.split(/\n[ \t]*\n/gu)){const lines=block.trim().split('\n');if(!lines[0]||/^(NOTE(?:\s|$)|STYLE$|REGION$)/u.test(lines[0]))continue;const timing=lines.findIndex(line=>line.includes('-->'));if(timing<0)continue;if(timing>1)throw Error('Subtitle cue has unexpected lines before timing.');const match=lines[timing].match(/^\s*(\S+)\s+-->\s+(\S+)(?:\s+(.*))?\s*$/u);if(!match)throw Error('Invalid subtitle cue range.');const start=subtitleSeconds(match[1]),end=subtitleSeconds(match[2]);bounds(start,end);const rawCueText=lines.slice(timing+1).join('\n'),speaker=prefix(rawCueText);segments.push({start,end,...speaker,cueId:timing===1?lines[0]:null,cueSettings:match[3]||null});}
 return {segments,format:`speech-${format}`,units:'seconds',subtitle:{speakerSyntax:'Only an explicit [speaker]: marker establishes a speaker label.',rawSourceText:raw},losses:['Subtitles retain cue timing; word-level alignment, confidence and run metadata need original JSON.']};
}
function quotedTSV(raw){
 const rows=[];let row=[],cell='',quoted=false,closed=false;const pushCell=()=>{row.push(cell);cell='';closed=false;};
 for(let i=0;i<raw.length;i++){const char=raw[i];if(quoted){if(char==='"'){if(raw[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=char;continue;}if(char==='"'){if(cell||closed)throw Error('Invalid quoted TSV field.');quoted=true;}else if(char==='\t'){pushCell();}else if(char==='\n'){pushCell();if(row.some(value=>value!==''))rows.push(row);row=[];}else{if(closed)throw Error('Unexpected characters after quoted TSV field.');cell+=char;}}
 if(quoted)throw Error('Unclosed quoted TSV field.');pushCell();if(row.some(value=>value!==''))rows.push(row);return rows;
}
export function parseTranscriptTSV(raw){
 const text=clean(raw),first=text.slice(0,text.indexOf('\n')<0?text.length:text.indexOf('\n'));let segments,format,units;
 if(first==='start\tend\ttext'){
  format='whisperx-tsv';units='milliseconds';segments=text.split('\n').slice(1).filter(line=>line!=='').map(line=>{const cells=line.split('\t');if(cells.length!==3)throw Error('WhisperX TSV requires exactly start, end and text columns.');const start=time(cells[0],{milliseconds:true,missing:true}),end=time(cells[1],{milliseconds:true,missing:true});bounds(start,end);return {start,end,text:cells[2],speaker:'Unassigned',rawTSVCells:cells,sourceUnits:'milliseconds'};});
 }else{
  const rows=quotedTSV(text),header=rows.shift(),expected=['turn_id','start_seconds','end_seconds','speaker','original_speaker','text'];if(!header||header.length!==expected.length||header.some((value,index)=>value!==expected[index]))throw Error('TSV must declare WhisperX millisecond columns or Research Weave second columns.');format='research-weave-transcript-tsv';units='seconds';const ids=new Set();
  segments=rows.map(cells=>{if(cells.length!==expected.length||!cells[0]||ids.has(cells[0]))throw Error('Transcript TSV rows require six columns and unique turn IDs.');ids.add(cells[0]);const start=time(cells[1],{missing:true}),end=time(cells[2],{missing:true});bounds(start,end);return {id:cells[0],start,end,speaker:cells[3]||'Unassigned',rawSpeaker:cells[4]||cells[3]||'Unassigned',text:cells[5],rawTSVCells:cells,sourceUnits:'seconds'};});
 }
 return {segments,format,units:'seconds',sourceUnits:units,rawSourceText:raw,losses:format==='whisperx-tsv'?['WhisperX TSV declares integer milliseconds and omits speaker labels and word timing.']:['Research Weave TSV declares seconds and retains untimed cells; word timing, run binding and correction history require canonical JSON.']};
}
export function parseSTM(raw,{recordingId=null}={}){
 const content=clean(raw),segments=[],ignoredTimeSegments=[];let selected=recordingId;
 for(const [index,line] of content.split('\n').entries()){
  if(!line.trim()||line.trim().startsWith(';;'))continue;const match=line.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/u);if(!match)throw Error('STM needs recording, channel, speaker, start, end and transcript fields.');const [,recording,channel,speaker,startRaw,endRaw,tail]=match;if(selected===null)selected=recording;if(recording!==selected)throw Error('Import one STM recording at a time.');if(!/^\d+$/u.test(channel))throw Error('STM channel must be an integer.');const start=time(startRaw),end=time(endRaw);bounds(start,end);const label=tail.match(/^(<[^>]*>)\s*(.*)$/u),text=label?label[2]:tail;if(text==='IGNORE_TIME_SEGMENT_IN_SCORING'){ignoredTimeSegments.push({recordingId:recording,channel:Number(channel),speaker,start,end,label:label?.[1]??null,rawLine:line});continue;}segments.push({start,end,speaker,rawSpeaker:speaker,text,stm:{recordingId:recording,channel:Number(channel),label:label?.[1]??null,line:index+1,rawLine:line}});
 }
 return {segments,format:'speech-stm',units:'seconds',recordingId:selected,ignoredTimeSegments,rawSourceText:raw,losses:['STM supplies segment timing and labels; word alignment and model confidence are unavailable.','STM speaker labels and RTTM speaker labels are independent annotations; identity mapping requires review.']};
}
export function speechTranscript(raw,format,options={}){
 const parsed=['srt','vtt'].includes(format)?parseSubtitles(raw,format):format==='tsv'?parseTranscriptTSV(raw):format==='stm'?parseSTM(raw,options):null;if(!parsed)throw Error('Unsupported speech transcript format.');const imported=timestampedTranscript(parsed);imported.turns=imported.turns.map((turn,index)=>({...turn,rawSpeaker:parsed.segments[index].rawSpeaker??turn.rawSpeaker}));return imported;
}
