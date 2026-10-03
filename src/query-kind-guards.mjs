// Proposal: use this predicate inside domain.mjs queryCodings. Does not alter whole-application query semantics.
export function queryRangeRelated(a,b,operator='and',distance=200){
  if(a.documentId!==b.documentId)return false;
  const kind=a.kind||'text';
  if(kind!==(b.kind||'text'))return false;
  let x,y;
  if(kind==='text'){x=[a.start,a.end];y=[b.start,b.end];}
  else if(kind==='media'){
    if(!a.recordingKey||a.recordingKey!==b.recordingKey)return false;
    x=[a.timeStart,a.timeEnd];y=[b.timeStart,b.timeEnd];
  }else return false; // Region intersection requires separate geometry operators.
  if(![...x,...y].every(Number.isFinite)||x[1]<=x[0]||y[1]<=y[0])return false;
  if(operator==='near')return Math.max(0,Math.max(x[0],y[0])-Math.min(x[1],y[1]))<=Math.max(0,Number.isFinite(Number(distance))?Number(distance):0);
  return Math.max(x[0],y[0])<Math.min(x[1],y[1]);
}
