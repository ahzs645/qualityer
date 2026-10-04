import {cp,uid} from './domain.mjs';
import {timePair} from './transcript-alignment.mjs';
import {normalizeConsentDecisions} from './source-consent.mjs';
const supplied=(record,keys)=>{for(const key of keys)if(record[key]!==undefined)return record[key];return null;};
export function timestampedTranscript(x){
 if(x?.format==='research-weave-transcript'){
  if(typeof x.text!=='string'||!Array.isArray(x.turns))throw Error('Invalid timestamped transcript export.');
  if(x.source?.revision!==undefined&&(!Number.isInteger(x.source.revision)||x.source.revision<1))throw Error('Invalid supplied source revision.');
  if(!Array.isArray(x.reviewFlags||[])||!Array.isArray(x.consentDecisions||[]))throw Error('Invalid transcript consent records.');
  return {text:x.text,revision:x.source?.revision||1,reviewFlags:structuredClone(x.reviewFlags||[]),consentDecisions:normalizeConsentDecisions(x.consentDecisions),direction:x.direction||x.source?.direction||'auto',importProvenance:structuredClone(x.importProvenance||null),ocr:structuredClone(x.ocr||null),turns:structuredClone(x.turns),transcriptMetadata:structuredClone(x.transcriptMetadata),alignment:structuredClone(x.alignment),transcription:structuredClone(x.transcription),speakerMappings:structuredClone(x.speakerMappings||[]),diarization:structuredClone(x.diarization||null),versions:structuredClone(x.versions||[])};
 }
 const canonical=Array.isArray(x?.turns),segments=x.segments||x.transcription||x.turns||x;
 if(!Array.isArray(segments))throw Error('Transcript JSON needs a segments or turns array.');
 let text='';const turns=[];
 for(const [index,seg] of segments.entries()){
  if(!seg||typeof seg!=='object'||typeof(seg.text??seg.content)!=='string')throw Error('Each transcript turn needs text.');
  const content=seg.text??seg.content,speaker=seg.speaker||seg.speaker_id||'Speaker',start=cp(text).length;
  const times=timePair(supplied(seg,canonical?['timeStart','start_time']:['timeStart','start_time','start']),supplied(seg,canonical?['timeEnd','end_time']:['timeEnd','end_time','end']));
  const words=structuredClone(seg.words||[]);if(!Array.isArray(words))throw Error('Transcript words must be an array.');
  const wordTiming=words.map(w=>timePair(supplied(w,['timeStart','start_time','start']),supplied(w,['timeEnd','end_time','end'])));
  text+=content+(content.endsWith('\n')?'':'\n');
  turns.push({id:uid(),sourceId:seg.id??null,sourceIndex:index,start,end:cp(text).length,speaker,rawSpeaker:speaker,...times,words,wordTiming,raw:structuredClone(seg),timingStatus:'supplied'});
 }
 const metadata=Array.isArray(x)?{}:Object.fromEntries(Object.entries(x).filter(([k])=>!['segments','turns','transcription'].includes(k)));
 return {text,turns,speakerTracks:structuredClone(metadata.speaker_tracks||null),transcriptMetadata:{format:canonical?'turns':'segments',units:'seconds',provider:structuredClone(metadata)},alignment:{recordingKey:null,status:turns.some(t=>Number.isFinite(t.timeStart))?'unbound':'untimed',units:'seconds'}};
}
