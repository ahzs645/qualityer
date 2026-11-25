import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../src/domain.mjs';
import {scopedSources,scopedCodings,casesMatchingAttribute,caseAttributeNames} from '../src/analysis-domain.mjs';

function study(){
 const s=emptyState('Synthetic');
 s.documents=[{id:'a',name:'A',text:'Alpha account here.\n',revision:1},{id:'b',name:'B',text:'Beta account here.\n',revision:1}];
 s.codes=[{id:'c1',name:'Theme',color:'#227e8a'}];
 s.cases=[{id:'k1',name:'North',documentIds:['a'],attributes:{region:'north',years:3}},{id:'k2',name:'South',documentIds:['b'],attributes:{region:'south',years:12}}];
 s.codings=[{id:'x',documentId:'a',codeId:'c1',start:0,end:5,text:'Alpha',status:'accepted',coder:'me'},{id:'y',documentId:'b',codeId:'c1',start:0,end:4,text:'Beta',status:'accepted',coder:'me'}];
 return s;
}
test('case attribute filters limit sources and codings to matching cases',()=>{
 const s=study();
 assert.deepEqual(caseAttributeNames(s),['region','years']);
 assert.equal(casesMatchingAttribute(s,{}),null);
 assert.deepEqual(scopedSources(s,{caseAttribute:'region',caseAttributeValue:'north'}).map(d=>d.id),['a']);
 assert.deepEqual(scopedCodings(s,{caseAttribute:'region',caseAttributeValue:'south'}).map(c=>c.id),['y']);
 assert.deepEqual(scopedCodings(s,{caseAttribute:'years',caseAttributeValue:'5',caseAttributeOperator:'gt'}).map(c=>c.id),['y']);
 assert.deepEqual(scopedCodings(s,{caseAttribute:'region',caseAttributeValue:'east'}),[]);
 assert.equal(scopedCodings(s,{}).length,2);
});
