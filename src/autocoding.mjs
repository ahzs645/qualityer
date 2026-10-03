// Deterministic matching stays in the browser; candidates are never research decisions.
const points=text=>Array.from(text),excerpt=(text,a,b)=>points(text).slice(a,b).join('');
const overlap=(a,b)=>a.start<b.end&&b.start<a.end;
const current=(d,x)=>d&&x.sourceRevision===(d.revision||1)&&Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.start>=0&&x.end>x.start&&excerpt(d.text,x.start,x.end)===x.text;
export function compileAutocodeRule(rule){
 if(!rule||!['literal','regex'].includes(rule.mode)||typeof rule.pattern!=='string'||!rule.pattern.trim()||rule.pattern.length>300)throw Error('Enter a literal or restricted regular expression of at most 300 characters.');
 if(rule.mode==='literal')return new RegExp(rule.pattern.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gu'+(rule.caseSensitive?'':'i'));
 // No groups, backreferences, lookarounds or unbounded repetition: predictable local scans.
 if((rule.pattern.match(/\{\d+(?:,\d+)?\}/g)||[]).length>1)throw Error('Use at most one bounded repetition per restricted regex.');
 const syntax=rule.pattern.replace(/\\[\\.*+?()[\]{}|^$]/g,'').replace(/\[(?:\\.|[^\]\\])*\]/g,'').replace(/\{\d+(?:,\d+)?\}/g,m=>{const ns=m.match(/\d+/g).map(Number);if(ns.some(n=>n>100)||ns[1]<ns[0])throw Error('Repetitions must be bounded between zero and 100.');return '';});
 if(/[()*+?{}]/.test(syntax)||/\\[1-9k]/.test(syntax))throw Error('Use restricted regex: literals, character classes, alternation, anchors and one bounded {n,m} repetition; no groups or unbounded repetition.');
 try{return new RegExp(rule.pattern,'gu'+(rule.caseSensitive?'':'i'));}catch{throw Error('The restricted regular expression is invalid.');}
}
export function previewAutocoding(s,rule,{documentIds=[],limit=1000}={}){
 const code=s.codes.find(c=>c.id===rule.codeId&&c.codable!==false&&!c.archivedAt);if(!code)throw Error('Choose an active code.');
 const matcher=compileAutocodeRule(rule),selected=new Set(documentIds);if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('Preview limit must be between one and 1,000.');
 const matches=[],excluded=[],coverage=[];let total=0;
 for(const d of s.documents){if(selected.size&&!selected.has(d.id))continue;if(d.sourceRole==='reference'){excluded.push({documentId:d.id,reason:'Reference material'});continue;}
  let found=0,blocked=0;matcher.lastIndex=0;const offsets=new Uint32Array(d.text.length+1);let units=0;for(let i=0;i<d.text.length;){offsets[i]=units;const width=d.text.codePointAt(i)>65535?2:1;if(width===2)offsets[i+1]=units;i+=width;offsets[i]=++units;}
  for(const m of d.text.matchAll(matcher)){if(!m[0])continue;const start=offsets[m.index],end=offsets[m.index+m[0].length],candidate={documentId:d.id,sourceRevision:d.revision||1,start,end,text:m[0],codeId:rule.codeId};if((d.reviewFlags||[]).some(f=>overlap(f,candidate))){blocked++;continue;}found++;total++;if(matches.length<limit)matches.push({...candidate,key:JSON.stringify([d.id,d.revision||1,start,end,rule.codeId])});}
  coverage.push({documentId:d.id,matches:found,blocked});
 }
 return {rule:{mode:rule.mode,pattern:rule.pattern,caseSensitive:!!rule.caseSensitive,codeId:rule.codeId},matches,total,returned:matches.length,truncated:total>matches.length,coverage,excluded,method:'Literal/restricted-regex candidate matches; review exact passages before applying. No semantic classification.'};
}
const undoSnapshot=c=>JSON.stringify({documentId:c.documentId,codeId:c.codeId,start:c.start,end:c.end,text:c.text,sourceRevision:c.sourceRevision,status:c.status,memo:c.memo||'',reviews:c.reviews||[],reviewer:c.reviewer||null});
export function applyAutocodingOperation(s,op,actor,role,{uid}){
 const data=op.data||{};
 if(op.type==='autocoding.apply'){
  if(role==='viewer')throw Error('Read-only project access.');if(!Array.isArray(data.matches)||!data.matches.length||data.matches.length>1000)throw Error('Select one to 1,000 preview candidates.');
  const preview=previewAutocoding(s,data.rule,{documentIds:[...new Set(data.matches.map(m=>m.documentId))]}),allowed=new Map(preview.matches.map(m=>[m.key,m]));
  const run={id:uid(),actor,date:new Date().toISOString(),rule:preview.rule,codingIds:[],coverage:preview.coverage,skippedDuplicates:0};
  const seen=new Set();for(const submitted of data.matches){const candidate=allowed.get(submitted.key),d=s.documents.find(d=>d.id===submitted.documentId);if(!candidate||seen.has(submitted.key)||!current(d,submitted)||['documentId','sourceRevision','start','end','text','codeId'].some(k=>candidate[k]!==submitted[k]))throw Error('Preview candidates changed. Re-run preview before applying.');seen.add(submitted.key);
   if(s.codings.some(c=>!c.deletedAt&&!c.kind&&c.coder===actor&&c.documentId===d.id&&c.codeId===candidate.codeId&&c.start===candidate.start&&c.end===candidate.end)){run.skippedDuplicates++;continue;}
   const c={id:uid(),documentId:d.id,codeId:candidate.codeId,start:candidate.start,end:candidate.end,text:candidate.text,coder:actor,date:run.date,status:'coded',sourceRevision:d.revision||1,origin:'autocoding-reviewed',autocodingRunId:run.id,memo:''};c.autocodingUndoSnapshot=undoSnapshot(c);s.codings.push(c);run.codingIds.push(c.id);
  }s.autocodingRuns??=[];s.autocodingRuns.push(run);return true;
 }
 if(op.type==='autocoding.undo'){
  const run=s.autocodingRuns?.find(r=>r.id===data.id);if(!run||run.actor!==actor)throw Error('Only the person who applied this run can undo it.');if(run.undoneAt)throw Error('This run has already been undone.');
  const date=new Date().toISOString();run.undoneIds=[];run.retainedIds=[];for(const id of run.codingIds){const c=s.codings.find(c=>c.id===id);if(!c||c.deletedAt)continue;if(c.coder!==actor||c.autocodingRunId!==run.id||c.status!=='coded'||c.autocodingUndoSnapshot!==undoSnapshot(c)){run.retainedIds.push(id);continue;}c.deletedAt=date;c.deletedBy=actor;c.deletionReason='Undo reviewed autocoding run';run.undoneIds.push(id);}run.undoneAt=date;return true;
 }
 if(op.type==='codeSet.save'){
  if(!data.name?.trim()||!Array.isArray(data.codeIds)||!data.codeIds.length||data.codeIds.some(id=>!s.codes.some(c=>c.id===id)))throw Error('Name the set and choose existing codes.');s.codeSets??=[];const prior=s.codeSets.find(x=>x.id===data.id);if(prior&&prior.author!==actor&&!['owner','reviewer'].includes(role))throw Error('Cannot edit another researcher’s code set.');const set={id:prior?.id||uid(),name:data.name.trim(),codeIds:[...new Set(data.codeIds)],author:prior?.author||actor,modifiedBy:actor,date:new Date().toISOString()};s.codeSets=s.codeSets.filter(x=>x.id!==set.id);s.codeSets.push(set);return true;
 }
 if(op.type==='codeSet.delete'){const set=s.codeSets?.find(x=>x.id===data.id);if(!set)throw Error('Code set missing.');if(set.author!==actor&&!['owner','reviewer'].includes(role))throw Error('Cannot remove another researcher’s code set.');s.codeSets=s.codeSets.filter(x=>x.id!==set.id);return true;}
 return false;
}
export function validateSuggestionCandidate(s,x){const d=s.documents.find(d=>d.id===x.documentId);if(!d||d.excludeAI||d.sourceRole==='reference'||!current(d,x)||(d.reviewFlags||[]).some(f=>overlap(f,x))||!s.codes.some(c=>c.id===x.codeId&&c.codable!==false&&!c.archivedAt))throw Error('Suggestion quote, source consent scope or code is no longer current. Re-run the suggestion review.');return true;}
