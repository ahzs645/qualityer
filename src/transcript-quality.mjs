/** Native ASR probability triage. Never convert alignment scores into ASR confidence. */
import {codepoints} from './text-points.mjs';
export function transcriptionQuality(document, threshold = .5) {
 if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) throw Error('Review threshold must be between zero and one.');
 const engine = document.transcriptMetadata?.provider?.engine;
 const points=codepoints(document.text||'');
 const bins = Array.from({length:10}, (_,i)=>({start:i/10,end:(i+1)/10,count:0}));
 const rows=[]; let scoredWords=0, unscoredWords=0, flaggedWords=0;
 for(const turn of document.turns||[]) {
  if(turn.anchorStatus==='needs_review'||turn.sourceRevision!==undefined&&turn.sourceRevision!==(document.revision||1)) continue;
  if(!Number.isInteger(turn.start)||!Number.isInteger(turn.end)||turn.start<0||turn.end<=turn.start||turn.end>points.length) continue;
  const flagged=[];
  for(const word of Array.isArray(turn.words)?turn.words:[]) {
   if(!word||typeof word!=='object'){unscoredWords++;continue;}
   const candidate=Object.hasOwn(word,'probability')?word.probability:(word.confidence_kind==='asr-word-probability'||!word.confidence_kind&&engine==='faster-whisper'?word.score:undefined);
   if(typeof candidate!=='number'||!Number.isFinite(candidate)||candidate<0||candidate>1) {unscoredWords++;continue;}
   scoredWords++;bins[Math.min(9,Math.floor(candidate*10))].count++;
   if(candidate<threshold){flaggedWords++;flagged.push({text:typeof word.word==='string'?word.word:'[word text unavailable]',probability:candidate});}
  }
  if(flagged.length) rows.push({turnId:turn.id,start:turn.start,end:turn.end,timeStart:turn.timeStart,timeEnd:turn.timeEnd,timingStatus:turn.timingStatus,flagged,text:points.slice(turn.start,turn.end).join('')});
 }
 return {threshold,bins,rows,scoredWords,unscoredWords,flaggedWords};
}
