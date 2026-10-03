import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperation,emptyState,queryCodings,agreement,characterKappa} from '../src/domain.mjs';
import {previewCodebookCSV} from '../src/codebook-csv.mjs';
import {scopedSources} from '../src/analysis-domain.mjs';

test('Codebook imports remap arbitrary ordering atomically, preserve existing coding and reject cycles',()=>{
 const original=emptyState();original.codes=[{id:'old',name:'Existing'}];
 const p=applyOperation(original,{type:'codebook.import',data:{codes:[{id:'child',name:'Child',parentId:'parent'},{id:'parent',name:'Parent'},{id:'reuse',name:'Under existing',parentId:'old'}]}},'owner');
 assert.equal(p.codes.find(c=>c.name==='Child').parentId,p.codes.find(c=>c.name==='Parent').id);
 assert.equal(p.codes.find(c=>c.name==='Under existing').parentId,'old');assert.equal(original.codes.length,1);
 for(const codes of [[{id:'a',name:'A',parentId:'a'}],[{id:'a',name:'A',parentId:'b'},{id:'b',name:'B',parentId:'a'}],[{id:'a',name:'A',parentId:'missing'}]])assert.throws(()=>applyOperation(original,{type:'codebook.import',data:{codes}},'owner'),/cycle|parent/);
 assert.equal(original.codes.length,1);assert.throws(()=>applyOperation(original,{type:'codebook.import',data:{codes:[]}},'viewer','viewer'),/Read-only/);
});
test('CSV hierarchy refuses literal root separator ambiguity and temporary IDs never shadow existing parents',()=>{
 assert.throws(()=>previewCodebookCSV('tag,description\nA/B/C,child',{codes:[{id:'old',name:'A/B'}]},{separator:'/'}),/separator/);
 const p=previewCodebookCSV('tag,description\nNew,definition',{codes:[{id:'csv-preview-1',name:'Existing'}]});assert.notEqual(p.codes[0].id,'csv-preview-1');
});
test('Application queries use matching recording seconds and keep original identity without interval subtraction',()=>{
 const state={codes:[{id:'a'},{id:'b'}],codings:[{id:'left',codeId:'a',documentId:'d',kind:'media',recordingKey:'r',timeStart:0,timeEnd:.75},{id:'other',codeId:'b',documentId:'d',kind:'media',recordingKey:'other',timeStart:0,timeEnd:.5}]};
 const spec={codeA:'a',codeB:'b'};assert.deepEqual(queryCodings(state,spec),[]);assert.deepEqual(queryCodings(state,{...spec,operator:'not'}).map(c=>c.id),['left']);
 state.codings[1].recordingKey='r';assert.deepEqual(queryCodings(state,spec).map(c=>c.id),['left']);
 state.codings[1].timeStart=1;state.codings[1].timeEnd=2;assert.equal(queryCodings(state,{...spec,operator:'near',near:.25}).length,1);
 state.codings[1]={id:'text',codeId:'b',documentId:'d',start:0,end:10};assert.deepEqual(queryCodings(state,spec),[]);assert.deepEqual(queryCodings(state,{...spec,operator:'or'}).map(c=>c.id),['left','text']);
});
test('Existing agreement entrypoints exclude consent-review and reference evidence from numerator and denominator',()=>{
 const state={documents:[{id:'d',text:'abcdef',revision:1,reviewFlags:[{start:4,end:6}]},{id:'ref',text:'abcdef',sourceRole:'reference'}],codes:[{id:'c'}],codings:[{id:'a',documentId:'d',codeId:'c',coder:'a',start:0,end:2,text:'ab'},{id:'b',documentId:'d',codeId:'c',coder:'b',start:0,end:2,text:'ab'},{id:'restricted',documentId:'d',codeId:'c',coder:'a',start:4,end:6,text:'ef'},{id:'reference',documentId:'ref',codeId:'c',coder:'a',start:0,end:6,text:'abcdef'}]};
 assert.equal(agreement(state,'a','b').units,1);assert.equal(agreement(state,'a','b').percent,100);const k=characterKappa(state,'a','b','c');assert.equal(k.n,4);assert.equal(k.kappa,1);
});
test('Whole-source vocabulary scope uses numeric/date attribute operators and passage case sources consistently',()=>{
 const state={documents:[{id:'a',text:'one',attributes:{score:0,date:'2026-01-01'}},{id:'b',text:'two',attributes:{score:5,date:'2026-10-01'}},{id:'c',text:'ref',sourceRole:'reference',attributes:{score:9}}],cases:[{id:'case',documentIds:[],passages:[{documentId:'b',start:0,end:3}]}]};
 assert.deepEqual(scopedSources(state,{attribute:'score',attributeOperator:'gt',attributeValue:'0'}).map(d=>d.id),['b']);
 assert.deepEqual(scopedSources(state,{attribute:'date',attributeOperator:'gte',attributeValue:'2026-02-01'}).map(d=>d.id),['b']);
 assert.deepEqual(scopedSources(state,{caseId:'case'}).map(d=>d.id),['b']);
});
