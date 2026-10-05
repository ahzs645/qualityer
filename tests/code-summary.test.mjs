import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../src/domain.mjs';
import {scopedCodings} from '../src/analysis-domain.mjs';
import {codeSummary,sourceSummary,codeTextGrid,transposeGrid,codeTextGridTable,codeSummaryTable} from '../src/code-summary.mjs';

function study(){
 const s=emptyState('Synthetic');
 s.documents=[{id:'a',name:'A',text:'Alpha account 😀 here.\n',revision:1},{id:'b',name:'B',text:'Beta account here.\n',revision:1}];
 s.codes=[{id:'c1',name:'Theme one',color:'#227e8a'},{id:'c2',name:'Theme two',color:'#a15e71'},{id:'c3',name:'Unused',color:'#555555'}];
 s.cases=[{id:'k1',name:'North',documentIds:['a'],attributes:{}},{id:'k2',name:'South',documentIds:['b'],attributes:{}}];
 s.codings=[
  {id:'1',documentId:'a',codeId:'c1',start:0,end:5,text:'Alpha',status:'accepted',coder:'me'},
  {id:'2',documentId:'a',codeId:'c1',start:0,end:5,text:'Alpha',status:'provisional',coder:'you'},
  {id:'3',documentId:'a',codeId:'c2',start:3,end:13,text:'ha account',status:'accepted',coder:'me'},
  {id:'4',documentId:'b',codeId:'c1',start:0,end:4,text:'Beta',status:'flagged',coder:'me'}];
 return s;
}
test('code summary counts applications, distinct excerpts and union coverage',()=>{
 const s=study(),rows=scopedCodings(s,{status:'all'}),sum=codeSummary(s,rows),one=sum.find(r=>r.code.id==='c1');
 assert.equal(one.applications,3);assert.equal(one.excerpts,2);assert.equal(one.sources,2);assert.equal(one.cases,2);
 assert.deepEqual(one.coders,['me','you']);assert.equal(one.codepoints,9);assert.equal(one.meanCodepoints,4.5);
 assert.equal(one.accepted,1);assert.equal(one.provisional,1);assert.equal(one.flagged,1);
 assert.equal(sum.find(r=>r.code.id==='c3').applications,0);
 assert.equal(codeSummaryTable(sum).length,4);
});
test('source summary reports union coverage over eligible codepoints',()=>{
 const s=study(),rows=scopedCodings(s,{status:'all'}),a=sourceSummary(s,rows).find(r=>r.source.id==='a');
 assert.equal(a.applications,3);assert.equal(a.excerpts,2);assert.equal(a.codes,2);assert.equal(a.codepoints,13);
 assert.ok(Math.abs(a.percent-100*13/22)<1e-9);
});
test('code by case grid holds distinct quotations, hides empty rows and transposes',()=>{
 const s=study(),rows=scopedCodings(s,{status:'all'}),grid=codeTextGrid(s,rows,{group:'case'});
 assert.deepEqual(grid.rows.map(r=>r.code.id),['c1','c2']);
 const c1=grid.rows[0].cells;assert.equal(c1[0].quotations.length,1);assert.deepEqual(c1[0].quotations[0].coders,['me','you']);assert.equal(c1[1].quotations[0].text,'Beta');
 assert.equal(codeTextGrid(s,rows,{group:'case',hideEmpty:false}).rows.length,3);
 const t=transposeGrid(grid);assert.equal(t.rows.length,2);assert.equal(t.columns.length,2);
 assert.equal(codeTextGridTable(grid)[1][1],'Alpha');
 assert.equal(codeTextGrid(s,rows,{group:'source'}).columns.length,2);
});
test('codings outside every case are counted rather than silently dropped',()=>{
 const s=study();s.cases=[s.cases[0]];const rows=scopedCodings(s,{status:'all'});
 assert.equal(codeTextGrid(s,rows,{group:'case'}).uncased,1);
});
