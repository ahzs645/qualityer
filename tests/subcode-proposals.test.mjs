import test from 'node:test';
import assert from 'node:assert/strict';
import {applySubcodeOperation,validateSubcodeDrafts} from '../src/subcode-proposals.mjs';
import {advancedReview} from '../server/research-ai.mjs';
const state=()=>({documents:[{id:'d',revision:2,text:'😀 We relied on peer support.'}],codes:[{id:'p',name:'Support',description:'Ways of receiving help',color:'#123456'}],codings:[{id:'e',documentId:'d',codeId:'p',sourceRevision:2,start:2,end:28,text:'We relied on peer support.',status:'accepted',coder:'analyst'}]});
const draft=s=>({name:'Peer support',description:'Help received from other participants',citations:[{...s.codings[0]}]});
test('Reviewed proposals create child definitions with immutable provenance without reassigning original decisions',()=>{
 const s=state(),before=structuredClone(s.codings),p=draft(s),op={type:'subcodes.apply',data:{parentId:'p',model:'synthetic',proposals:[p]}};
 assert.throws(()=>applySubcodeOperation(s,op,'coder','coder',{uid:()=>''}),/Reviewer/);
 assert.equal(s.codes.length,1);
 assert.equal(applySubcodeOperation(s,op,'reviewer','reviewer',{uid:()=> 'child'}),true);
 assert.deepEqual(s.codings,before);assert.equal(s.codes[1].parentId,'p');assert.equal(s.codes[1].definitionReview.actor,'reviewer');assert.equal(s.codes[1].definitionReview.citations[0].sourceRevision,2);
 p.citations[0].text='edited after save';assert.equal(s.codes[1].definitionReview.citations[0].text,before[0].text);
});
test('All selected drafts validate before mutation and normalized duplicate sibling names fail',()=>{
 const s=state(),op={type:'subcodes.apply',data:{parentId:'p',proposals:[draft(s),{...draft(s),name:' Ｐｅｅｒ   support '}]}};
 assert.throws(()=>applySubcodeOperation(s,op,'reviewer','owner',{uid:()=> 'child'}),/duplicated/);assert.equal(s.codes.length,1);
 s.codes.push({id:'child',name:'Peer support',parentId:'p'});assert.throws(()=>validateSubcodeDrafts(s,'p',[draft(s)]),/duplicated/);
});
test('Changing consent, source version or parent-code evidence prevents stale application',()=>{
 for(const change of [s=>s.documents[0].excludeAI=true,s=>s.documents[0].reviewFlags=[{start:4,end:8}],s=>s.documents[0].revision++,s=>s.codings[0].deletedAt='now',s=>s.codings[0].codeId='other',s=>s.codes[0].archivedAt='now']){
  const s=state(),p=draft(s);change(s);assert.throws(()=>validateSubcodeDrafts(s,'p',[p]));assert.equal(s.codes.length,1);
 }
});
test('Model subcodes require supplied citations, deduplicate drafts and expose rejected output and exact scope',async()=>{
 const original=globalThis.fetch,s=state(),before=structuredClone(s);let request;
 globalThis.fetch=async(url,options)=>{request=JSON.parse(options.body);return Response.json({model:'fixture',choices:[{finish_reason:'stop',message:{content:JSON.stringify({proposals:[{name:'Peer support',description:'Help received from peers',citations:['e']},{name:'Invented category',description:'Unsupported',citations:['invented']},{name:'PEER SUPPORT',description:'Repeated',citations:['e']},{name:'Unlinked',description:'No evidence',citations:[]}]})}}]});};
 try{const r=await advancedReview({AI_BASE_URL:'https://fixture.invalid'},s,{mode:'subcodes',codeId:'p',decisionScope:'accepted'});assert.equal(r.proposals.length,1);assert.equal(r.coverage.invalidProposalsRejected,3);assert.equal(r.proposals[0].citations[0].start,2);assert.equal(r.decisionScope,'accepted');assert.equal(r.sent,1);assert.equal(JSON.parse(request.messages[1].content).parent.name,'Support');assert.deepEqual(s,before);}finally{globalThis.fetch=original;}
});
test('Subcode model failures and absent provider leave the codebook unchanged',async()=>{
 const s=state(),before=structuredClone(s);await assert.rejects(()=>advancedReview({},s,{mode:'subcodes',codeId:'p'}),/Connect/);
 const original=globalThis.fetch;globalThis.fetch=async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{"proposals":[]}'}}]});
 try{await assert.rejects(()=>advancedReview({AI_BASE_URL:'https://fixture.invalid'},s,{mode:'subcodes',codeId:'p'}),/incomplete/);assert.deepEqual(s,before);}finally{globalThis.fetch=original;}
});
