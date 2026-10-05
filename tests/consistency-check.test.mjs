import test from 'node:test';
import assert from 'node:assert/strict';
import {lexicalConsistency,codeExcerpts,outlierCutoff,consistencyTasks,MIN_EXCERPTS} from '../src/consistency-check.mjs';

const app=(id,documentId,start,text,codeId='c',coder='me')=>({id,documentId,start,end:start+Array.from(text).length,text,codeId,coder,status:'accepted'});
const rows=[
 app('1','a',0,'The hospital funding for research equipment was cut again this year'),
 app('2','a',100,'Research equipment funding from the health authority keeps the lab running'),
 app('3','b',0,'Without equipment funding our research capacity in the north would collapse'),
 app('4','b',100,'Funding for shared research equipment is the main bottleneck we face'),
 app('5','b',200,'My grandmother taught me to fish on the river every summer'),
 app('6','a',0,'The hospital funding for research equipment was cut again this year','c','you')];

test('distinct excerpts merge coders and ignore other codes and non-text kinds',()=>{
 const list=codeExcerpts([...rows,{...rows[0],id:'x',codeId:'other'},{...rows[1],id:'m',kind:'media'}],'c');
 assert.equal(list.length,5);assert.deepEqual(list.find(e=>e.start===0&&e.documentId==='a').coders,['me','you']);
});
test('the off-topic excerpt is ranked first and flagged; on-topic ones are not',()=>{
 const r=lexicalConsistency(rows,'c');assert.equal(r.n,5);
 assert.equal(r.excerpts[0].id,'5');assert.equal(r.flagged.length,1);assert.equal(r.flagged[0].id,'5');
 assert.ok(r.flagged[0].missingTerms.includes('funding'));
 assert.ok(r.excerpts.slice(1).every(e=>!e.flagged&&e.score>r.cutoff));
});
test('results are deterministic and need a minimum number of excerpts',()=>{
 const scores=r=>r.excerpts.map(e=>[e.key,e.score.toFixed(12),e.flagged]);assert.deepEqual(scores(lexicalConsistency(rows,'c')),scores(lexicalConsistency([...rows].reverse(),'c')));
 const few=lexicalConsistency(rows.slice(0,MIN_EXCERPTS-1),'c');assert.equal(few.flagged.length,0);assert.equal(few.cutoff,null);assert.match(few.reason,/At least/);
});
test('cutoff never forces outliers when excerpts are alike',()=>{
 assert.equal(outlierCutoff([1,2]),null);
 const same=[0.8,0.8,0.8,0.8];assert.ok(same.every(x=>x>=outlierCutoff(same)));
});
test('review tasks carry exact anchors and an explanation',()=>{
 const r=lexicalConsistency(rows,'c');let n=0;const tasks=consistencyTasks(r,{name:'Funding'},{uid:()=>'t'+(++n)});
 assert.equal(tasks.length,1);assert.equal(tasks[0].start,200);assert.equal(tasks[0].documentId,'b');assert.match(tasks[0].rationale,/not a coding error/);assert.equal(tasks[0].issue,'Read lexical outlier');
});

test('review tasks use the source revision and skip excerpts that no longer match',()=>{
 const r=lexicalConsistency(rows,'c'),flagged=r.flagged[0],text='x'.repeat(200)+flagged.text;let n=0;
 const ok=consistencyTasks(r,{name:'F'},{uid:()=>'t'+(++n),documents:[{id:'b',text,revision:7}]});assert.equal(ok.length,1);assert.equal(ok[0].sourceRevision,7);
 assert.equal(consistencyTasks(r,{name:'F'},{uid:()=>'z',documents:[{id:'b',text:'changed',revision:8}]}).length,0);
});
