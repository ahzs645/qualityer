import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyOperation,emptyState,queryCodings} from '../src/domain.mjs';
import {eligibleAnalyticalCodings} from '../src/analytical-codings.mjs';
import {exportCSV} from '../src/coded-excerpts-export.mjs';

function fixture(){
 const state={...emptyState(),documents:[{id:'text',name:'Synthetic text',text:'😀 Public. Private. Ending.',revision:2,sourceRole:'interview',reviewFlags:[]},{id:'reference',name:'Methods reference',text:'Reference passage',revision:1,sourceRole:'reference'}],codes:[{id:'parent',name:'Parent'},{id:'child',name:'Child',parentId:'parent'},{id:'other',name:'Other'}]};
 const make=(id,start,end,text,codeId='child',changes={})=>({id,documentId:'text',start,end,text,sourceRevision:2,codeId,coder:'Synthetic coder',status:'coded',...changes});
 state.codings=[make('public',0,9,'😀 Public.'),make('private',10,18,'Private.'),make('overlap',10,18,'Private.','other'),make('ending',19,26,'Ending.'),make('stale',0,9,'😀 Public.','child',{sourceRevision:1}),make('changed',0,9,'Invented.'),make('removed',0,9,'😀 Public.','child',{deletedAt:'2026-01-01'}),make('needs-review',0,9,'😀 Public.','child',{status:'needs_review'}),make('reference',0,17,'Reference passage','child',{documentId:'reference',sourceRevision:1})];
 return state;
}
const restrict=state=>({...state,documents:state.documents.map(d=>d.id==='text'?{...d,reviewFlags:[{id:'restricted',start:10,end:18,status:'pending'}]}:d)});
const ids=rows=>rows.map(c=>c.id);

test('Coded-excerpts CSV and original-application queries exclude restricted, stale, deleted and reference evidence',()=>{
 const state=restrict(fixture()),before=structuredClone(state),csv=exportCSV(state);
 assert.deepEqual(ids(queryCodings(state)),['public','ending']);assert.deepEqual(ids(eligibleAnalyticalCodings(state)),['public','ending']);
 assert.ok(csv.includes('😀 Public.'));assert.ok(csv.includes('Ending.'));for(const privateText of ['Private.','Invented.','Reference passage'])assert.ok(!csv.includes(privateText));
 assert.equal(csv.split('\r\n').length,3);assert.deepEqual(state,before);
 assert.match(readFileSync(new URL('../src/exchange.js',import.meta.url),'utf8'),/export \{exportCSV\} from '\.\/coded-excerpts-export\.mjs'/);
});

test('Consent decisions immediately change analytical query and CSV scope without removing preserved coding',()=>{
 let state=fixture();state.codings=state.codings.filter(c=>c.id!=='changed');state=applyOperation(state,{type:'source.consent.flag',data:{id:'text',start:10,end:18,text:'Private.',sourceRevision:2,note:'Synthetic restriction.'}},'reviewer');const flagId=state.documents[0].consentDecisions[0].id;
 assert.deepEqual(ids(queryCodings(state,{codeA:'parent'})),['public','ending']);assert.ok(!exportCSV(state).includes('Private.'));
 state=applyOperation(state,{type:'source.consent.decide',data:{id:'text',flagId,status:'included',note:'Synthetic user authorization.'}},'reviewer');
 assert.deepEqual(ids(queryCodings(state,{codeA:'parent',codeB:'other',operator:'and'})),['private']);assert.ok(exportCSV(state).includes('Private.'));
 state=applyOperation(state,{type:'source.consent.decide',data:{id:'text',flagId,status:'withheld',note:'Synthetic withdrawal.'}},'reviewer');
 assert.deepEqual(ids(queryCodings(state,{codeA:'parent',codeB:'other',operator:'and'})),[]);assert.ok(!exportCSV(state).includes('Private.'));assert.equal(state.codings.length,8);
});

test('Malformed restriction bounds fail closed for every query operator and CSV',()=>{
 const state=fixture();state.documents[0].reviewFlags=[{start:NaN,end:18,status:'pending'}];
 for(const operator of ['and','or','not','near'])assert.deepEqual(queryCodings(state,{codeA:'parent',codeB:'other',operator}),[]);
 assert.equal(exportCSV(state).split('\r\n').length,1);
});

test('Current media identity and geometry are required, and any consent restriction withholds media from analytics',()=>{
 const state=fixture();state.documents.push({id:'audio',name:'Synthetic recording',text:'Timed transcript',revision:1,mediaKey:'project/current',mediaType:'audio/wav',reviewFlags:[],turns:[],alignment:{status:'matched',recordingKey:'project/current'}},{id:'image',name:'Synthetic image',text:'',revision:1,mediaKey:'project/image',mediaType:'image/png'});
 const audio={id:'audio-current',documentId:'audio',kind:'media',codeId:'child',coder:'Synthetic coder',status:'coded',sourceRevision:1,recordingKey:'project/current',timeStart:0,timeEnd:2,text:'CURRENT MEDIA QUOTE'};
 state.codings.push(audio,{...audio,id:'audio-wrong',recordingKey:'project/old',text:'STALE MEDIA QUOTE'},{...audio,id:'audio-invalid',timeEnd:0,text:'INVALID MEDIA QUOTE'},{id:'image-current',documentId:'image',kind:'image',codeId:'child',coder:'Synthetic coder',status:'coded',sourceRevision:1,mediaKey:'project/image',region:{x:0,y:0,width:.5,height:.5},text:'CURRENT IMAGE QUOTE'},{id:'image-invalid',documentId:'image',kind:'image',codeId:'child',sourceRevision:1,mediaKey:'project/image',region:{x:0,y:0,width:2,height:2},text:'INVALID IMAGE QUOTE'});
 assert.ok(ids(queryCodings(state)).includes('audio-current'));assert.ok(ids(queryCodings(state)).includes('image-current'));let output=exportCSV(state);assert.ok(output.includes('CURRENT MEDIA QUOTE'));assert.ok(output.includes('CURRENT IMAGE QUOTE'));assert.ok(!output.includes('STALE MEDIA QUOTE'));assert.ok(!output.includes('INVALID MEDIA QUOTE'));assert.ok(!output.includes('INVALID IMAGE QUOTE'));
 state.documents.find(d=>d.id==='audio').reviewFlags=[{start:5,end:10,status:'withheld'}];state.documents.find(d=>d.id==='image').reviewFlags=[{start:0,end:1,status:'pending'}];
 assert.ok(!ids(queryCodings(state)).includes('audio-current'));assert.ok(!ids(queryCodings(state)).includes('image-current'));output=exportCSV(state);assert.ok(!output.includes('CURRENT MEDIA QUOTE'));assert.ok(!output.includes('CURRENT IMAGE QUOTE'));
});

test('CSV retains exact Unicode quotations and numeric zero while escaping spreadsheet formulas',()=>{
 const state=fixture();state.documents[0].name='=HYPERLINK("synthetic")';state.codings=state.codings.filter(c=>c.id==='public');state.codings[0].memo='+Synthetic note';
 const output=exportCSV(state);assert.ok(output.includes("'=HYPERLINK"));assert.ok(output.includes("'+Synthetic note"));assert.ok(output.includes('"0","9","😀 Public."'));
});
