// This boundary validates generated worker JSON without filling missing seconds.
const invalid=message=>{throw Object.assign(Error(message),{status:502});};
const object=x=>!!x&&typeof x==='object'&&!Array.isArray(x);
function pair(record){
 const starts=['timeStart','start_time','start'],ends=['timeEnd','end_time','end'];
 for(const key of [...starts,...ends]){const value=record[key];if(value!=null&&(typeof value!=='number'||!Number.isFinite(value)||value<0))invalid('The recording worker returned invalid timestamp seconds.');}
 const start=starts.map(key=>record[key]).find(value=>value!==undefined),end=ends.map(key=>record[key]).find(value=>value!==undefined);
 if(start!=null&&end!=null&&end<start)invalid('The recording worker returned reversed timestamp bounds.');
}
export function validateAudioResult(result){
 if(!object(result)||!Array.isArray(result.segments))invalid('The recording worker returned no transcript segments.');
 for(const segment of result.segments){
  if(!object(segment)||typeof segment.text!=='string')invalid('The recording worker returned invalid segment text.');
  pair(segment);
  if(segment.speaker!=null&&typeof segment.speaker!=='string')invalid('The recording worker returned an invalid speaker label.');
  if(segment.words!==undefined){
   if(!Array.isArray(segment.words))invalid('The recording worker returned invalid word data.');
   for(const word of segment.words){
    if(!object(word)||typeof word.word!=='string')invalid('The recording worker returned invalid word text.');
    pair(word);
    if(word.speaker!=null&&typeof word.speaker!=='string')invalid('The recording worker returned an invalid word speaker.');
   }
  }
 }
 return result;
}
