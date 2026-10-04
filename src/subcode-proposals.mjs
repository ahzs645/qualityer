import {citationCurrent} from './analysis-memos.mjs';

const nameKey=name=>name.normalize('NFKC').trim().replace(/\s+/gu,' ').toLocaleLowerCase('en-US');
export function validateSubcodeDrafts(s,parentId,proposals){
 const parent=s.codes.find(c=>c.id===parentId&&!c.archivedAt&&c.codable!==false);
 if(!parent)throw Error('Choose an active parent code.');
 if(!Array.isArray(proposals)||!proposals.length||proposals.length>8)throw Error('Select one to eight subcode drafts.');
 const names=new Set(s.codes.filter(c=>c.parentId===parentId).map(c=>nameKey(c.name)));
 return proposals.map(p=>{
  if(typeof p.name!=='string'||!p.name.trim()||p.name.length>120||typeof p.description!=='string'||!p.description.trim()||p.description.length>4000)throw Error('Each subcode needs a name and inclusion definition.');
  const key=nameKey(p.name);if(names.has(key))throw Error('A subcode name is duplicated under this parent.');names.add(key);
  if(!Array.isArray(p.citations)||!p.citations.length||p.citations.length>80)throw Error('Link each subcode draft to current parent-code evidence.');
  for(const e of p.citations){const c=s.codings.find(c=>c.id===e.id),d=s.documents.find(d=>d.id===e.documentId);
   if(!c||c.codeId!==parentId||c.deletedAt||c.kind||['needs_review','flagged'].includes(c.status)||!d||d.excludeAI||d.sourceRole==='reference'||!citationCurrent(s,e)||['documentId','start','end','text'].some(k=>c[k]!==e[k])||(c.sourceRevision!=null&&c.sourceRevision!==e.sourceRevision))throw Error('Subcode evidence changed, was withdrawn or is outside the parent code. Generate a fresh draft.');
  }
  return {name:p.name.trim().replace(/\s+/gu,' '),description:p.description.trim(),citations:p.citations.map(e=>({id:e.id,documentId:e.documentId,sourceRevision:e.sourceRevision,start:e.start,end:e.end,text:e.text}))};
 });
}
export function applySubcodeOperation(s,op,actor,role,{uid}){
 if(op.type!=='subcodes.apply')return false;
 if(!['owner','reviewer'].includes(role))throw Error('Reviewer access required to refine the shared codebook.');
 const data=op.data||{},drafts=validateSubcodeDrafts(s,data.parentId,data.proposals),parent=s.codes.find(c=>c.id===data.parentId);
 const date=new Date().toISOString();
 for(const p of drafts)s.codes.push({id:uid(),parentId:parent.id,name:p.name,description:p.description,color:parent.color||'#537a92',codable:true,origin:'ai-subcodes-reviewed',definitionReview:{actor,date,model:String(data.model||'unspecified').slice(0,200),citations:p.citations,coverage:data.coverage||null}});
 return true;
}
