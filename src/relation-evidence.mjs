import {codepoints} from './text-points.mjs';
import {coverageScope} from './coverage-profile.mjs';
import {passageConsentRestricted,restrictedSourceRanges} from './source-consent.mjs';
export function relationPairEvidence(state,pairs){
  const eligible=new Set(coverageScope(state).rows.map(c=>c.id)),canonical=new Map(state.codings.map(c=>[c.id,c])),out=[];
  for(const pair of pairs||[]){
    const a=canonical.get(pair[0]?.id),b=canonical.get(pair[1]?.id),doc=state.documents.find(d=>d.id===a?.documentId);
    if(!a||!b||!doc||a.documentId!==b.documentId||(a.kind||'text')!==(b.kind||'text')||doc.sourceRole==='reference'||a.deletedAt||b.deletedAt||a.status==='needs_review'||b.status==='needs_review')continue;
    const media=a.kind==='media';
    // Text consent positions cannot be inferred onto a recording timeline.
    // Until every restriction has reviewed recording bounds, withhold media detail.
    if(media?(!a.recordingKey||a.recordingKey!==b.recordingKey||a.recordingKey!==doc.mediaKey||restrictedSourceRanges(doc).length>0):(!eligible.has(a.id)||!eligible.has(b.id)))continue;
    const [a0,a1]=media?[a.timeStart,a.timeEnd]:[a.start,a.end],[b0,b1]=media?[b.timeStart,b.timeEnd]:[b.start,b.end];
    if(![a0,a1,b0,b1].every(Number.isFinite)||Math.min(a0,b0)<0||a1<=a0||b1<=b0)continue;
    const overlapStart=Math.max(a0,b0),overlapEnd=Math.min(a1,b1),overlap=Math.max(0,overlapEnd-overlapStart),distance=Math.max(0,Math.max(a0,b0)-Math.min(a1,b1)),outerStart=Math.min(a0,b0),outerEnd=Math.max(a1,b1);
    // For disjoint selections, never export the intervening uncoded passage.
    // For overlapping selections, the union consists entirely of coded text.
    const text=codepoints(doc.text||''),contextAllowed=!media&&overlap>0&&!passageConsentRestricted(doc,{start:outerStart,end:outerEnd}),part=(start,end)=>contextAllowed?text.slice(start,end).join(''):'';
    out.push({documentId:doc.id,source:doc.name,sourceRevision:doc.revision||1,leftId:a.id,rightId:b.id,leftCode:state.codes.find(c=>c.id===a.codeId)?.name||a.codeId,rightCode:state.codes.find(c=>c.id===b.codeId)?.name||b.codeId,leftCoder:a.coder,rightCoder:b.coder,unit:media?'seconds':'codepoints',leftStart:a0,leftEnd:a1,rightStart:b0,rightEnd:b1,distance,overlap,union:(a1-a0)+(b1-b0)-overlap,relation:a0===b0&&a1===b1?'exact':overlap>0?(a0<=b0&&a1>=b1||b0<=a0&&b1>=a1?'containment':'overlap'):distance===0?'touch':'disjoint',before:part(outerStart,overlapStart),shared:part(overlapStart,overlapEnd),after:part(overlapEnd,outerEnd),contextBasis:media?'Direct current recording ranges; no text interpolation':contextAllowed?'Exact current source decomposition of overlapping coded ranges':'No decomposition for disjoint/touching ranges; uncoded gap text omitted'});
  }
  return out;
}
export function relationEvidenceRows(evidence,{scope=''}={}){
  const header=['Source','Source ID','Source revision','Left code','Right code','Left coder','Right coder','Left application','Right application','Unit','Left start','Left end','Right start','Right end','Relation','Gap distance','Overlap length','Union length','Before overlap','Shared overlap','After overlap','Context basis'];
  return [['Scope',scope],['Method','Distances are between exact current selections. Counts describe application pairs, not independent observations. Text uses Unicode codepoints and media uses seconds; units are never pooled. Uncoded gaps are never included in decomposition.'],[],header,...evidence.map(e=>[e.source,e.documentId,e.sourceRevision,e.leftCode,e.rightCode,e.leftCoder,e.rightCoder,e.leftId,e.rightId,e.unit,e.leftStart,e.leftEnd,e.rightStart,e.rightEnd,e.relation,e.distance,e.overlap,e.union,e.before,e.shared,e.after,e.contextBasis])];
}
