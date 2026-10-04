import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperation,emptyState} from '../src/domain.mjs';
import {taskAnchor} from '../src/processing-domain.mjs';

// These are synthetic recommendations, not interview evidence or human ratings.
function fixture(){
 let s={...emptyState('Synthetic reviewer rehearsal'),documents:[{id:'a',name:'Primary',text:'A direct account.',revision:1},{id:'b',name:'Counterpoint',text:'A contrasting account.',revision:1}],codes:[{id:'c',name:'Account'}]};
 const evidence=(documentId)=>{const d=s.documents.find(d=>d.id===documentId);return {documentId,start:0,end:Array.from(d.text).length,text:d.text,sourceRevision:d.revision};};
 return applyOperation(s,{type:'reviewTasks.add',data:{runId:'synthetic-run',tasks:[{id:'t',...evidence('a'),issue:'Compare accounts',rationale:'Read the counterpoint before making a claim.',suggestedCodeIds:['c'],relatedEvidence:[evidence('b')]}]}},'assistant');
}
const decide=(s,status='accepted',extra={})=>applyOperation(s,{type:'reviewTask.decide',data:{id:'t',status,note:'The researcher records a reason.',...extra}},'reviewer','reviewer');

test('Recommendations stay separate until a reviewer records a reasoned decision',()=>{
 const s=fixture();assert.equal(s.codings.length,0);assert.equal(s.reviewTasks[0].status,'pending');
 assert.throws(()=>applyOperation(s,{type:'reviewTask.decide',data:{id:'t',status:'accepted',note:'Reason'}},'coder','coder'),/Reviewer access/);
 assert.throws(()=>decide(s,'accepted',{note:'  '}),/reasoning/);
 const accepted=decide(s);assert.equal(accepted.codings.length,0);assert.equal(accepted.reviewTasks[0].status,'accepted');
 assert.throws(()=>decide(accepted),/final decision/);
});

test('Accept and revise reject changed linked evidence atomically',()=>{
 const s=applyOperation(fixture(),{type:'source.revise',data:{id:'b',text:'The account was corrected.'}},'reviewer');
 assert.equal(taskAnchor(s,s.reviewTasks[0]),true);assert.equal(taskAnchor(s,s.reviewTasks[0].relatedEvidence[0]),false);
 const before=structuredClone(s);
 for(const status of ['accepted','revised'])assert.throws(()=>decide(s,status,{createCoding:true,codeIds:['c']}),/Linked evidence changed/);
 assert.deepEqual(s,before);assert.equal(s.codings.length,0);
});

test('Consent changes block accepting either primary or linked evidence, including notes without coding',()=>{
 for(const documentId of ['a','b'])for(const createCoding of [false,true]){
  const s=fixture();s.documents.find(d=>d.id===documentId).reviewFlags=[{start:0,end:1}];
  const before=structuredClone(s);
  for(const status of ['accepted','revised'])assert.throws(()=>decide(s,status,{createCoding,codeIds:['c']}),/Resolve consent review/);
  assert.deepEqual(s,before);
 }
});

test('Defer and reject remain available for stale or consent-restricted recommendations',()=>{
 let s=applyOperation(fixture(),{type:'source.revise',data:{id:'b',text:'Corrected evidence.'}},'reviewer');s.documents[0].reviewFlags=[{start:0,end:1}];
 s=decide(s,'deferred',{note:'Await consent and counterpoint verification.'});assert.equal(s.codings.length,0);
 assert.equal(s.reviewTasks[0].history[0].evidence.consentRestricted,true);
 assert.equal(s.reviewTasks[0].history[0].relatedEvidence[0].anchorCurrent,false);
 s=decide(s,'rejected',{note:'Cannot support the proposed interpretation.'});assert.equal(s.reviewTasks[0].status,'rejected');assert.equal(s.reviewTasks[0].history.length,2);
});

test('A reviewer can re-anchor a changed primary quotation before accepting it',()=>{
 let s=applyOperation(fixture(),{type:'source.revise',data:{id:'a',text:'An updated account.'}},'reviewer');
 assert.throws(()=>decide(s),/source changed/);
 s=applyOperation(s,{type:'reviewTask.reanchor',data:{id:'t',start:0,end:s.documents[0].text.length,note:'Checked the corrected source.'}},'reviewer','reviewer');
 s=decide(s,'revised',{createCoding:true,codeIds:['c']});assert.equal(s.codings[0].origin,'assistant-reviewed');assert.equal(s.codings[0].coder,'reviewer');assert.equal(s.codings[0].status,'accepted');assert.equal(s.reviewTasks[0].history[0].action,'reanchor');
});

test('Decision history keeps original primary and counterpoint evidence after later revisions',()=>{
 let s=decide(fixture(),'accepted',{createCoding:true,codeIds:['c']});const history=structuredClone(s.reviewTasks[0].history);
 s=applyOperation(s,{type:'source.revise',data:{id:'b',text:'Prefix: '+s.documents[1].text}},'reviewer');
 assert.equal(s.reviewTasks[0].relatedEvidence[0].sourceRevision,2);assert.deepEqual(s.reviewTasks[0].history,history);assert.equal(history[0].relatedEvidence[0].sourceRevision,1);
});

test('Failed code selection leaves the recommendation and coder layer untouched',()=>{
 const s=fixture(),before=structuredClone(s);assert.throws(()=>decide(s,'accepted',{createCoding:true,codeIds:['missing']}),/existing code/);assert.deepEqual(s,before);
});
