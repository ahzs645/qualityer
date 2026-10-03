import test from 'node:test';
import assert from 'node:assert/strict';
import {comparisonScope,compareCodingPair,pairwiseComparisons,comparisonExportRows,mergeIntervals} from '../src/coder-comparison.mjs';
const fixture=()=>({documents:[{id:'d',text:'abcdefghijklmnopqrstuvwxyz',revision:1,sourceRole:'interview'}],codes:[{id:'c',name:'Code'},{id:'x',name:'Other'}],codings:[]});
const coding=(s,id,coder,start,end,codeId='c',extra={})=>s.codings.push({id,documentId:'d',start,end,text:Array.from(s.documents[0].text).slice(start,end).join(''),codeId,coder,status:'coded',sourceRevision:1,...extra});
test('Different boundaries disagree exactly but have independent expected Jaccard and kappa',()=>{
  const s=fixture();coding(s,'a','one',0,10);coding(s,'b','two',5,10);
  const r=compareCodingPair(s,'one','two');assert.equal(r.exact.percent,0);assert.equal(r.jaccard,.5);
  const c=r.byCode[0];assert.equal(c.n11,5);assert.equal(c.n10,5);assert.equal(c.n01,0);assert.equal(c.n00,16);assert.equal(c.n,26);
  const observed=21/26,expected=(10*5+16*21)/(26*26);assert.ok(Math.abs(c.kappa-(observed-expected)/(1-expected))<1e-12);
});
test('Overlapping duplicate decisions union once and preserve input arrays',()=>{
  const s=fixture();coding(s,'a','one',0,10);coding(s,'b','one',0,10);coding(s,'c','one',5,15);coding(s,'d','two',10,20);
  const before=JSON.stringify(s),r=compareCodingPair(s,'one','two').byCode[0];assert.equal(r.leftCharacters,15);assert.equal(r.intersection,5);assert.equal(r.union,20);assert.equal(r.jaccard,.25);assert.equal(JSON.stringify(s),before);
  assert.deepEqual(mergeIntervals([[4,7],[0,3],[2,4]]),[[0,7]]);
});
test('Code and document identities never manufacture overlap',()=>{
  const s=fixture();s.documents.push({id:'d2',text:s.documents[0].text,revision:1});coding(s,'a','one',0,10);coding(s,'b','two',0,10,'x');coding(s,'c','two',0,10,'c',{documentId:'d2'});
  const r=compareCodingPair(s,'one','two');assert.equal(r.intersection,0);assert.equal(r.union,30);assert.equal(r.jaccard,0);assert.equal(r.byCode[0].n,52);
});
test('Reference and consent-review characters are removed from both decisions and the kappa denominator',()=>{
  const s=fixture();s.documents[0].reviewFlags=[{start:0,end:5}];s.documents.push({id:'r',text:s.documents[0].text,sourceRole:'reference'});
  coding(s,'a','one',0,10);coding(s,'b','two',5,10);coding(s,'c','one',10,15,'c',{documentId:'r'});
  const r=compareCodingPair(s,'one','two');assert.deepEqual(r.scope.codings.map(c=>c.id),['b']);assert.equal(r.scope.totalCharacters,21);assert.equal(r.byCode[0].n,21);assert.equal(r.byCode[0].n00,16);
  const no=compareCodingPair(s,'one','two',{sourceId:'r',codeId:'c'});assert.equal(no.scope.totalCharacters,0);assert.equal(no.byCode[0].kappa,null);
});
test('Stale, invalid, removed, media and other-status records are withheld without altering originals',()=>{
  const s=fixture();coding(s,'good','one',0,5,'c',{status:'accepted'});coding(s,'needs','two',0,5,'c',{status:'needs_review'});coding(s,'revision','two',0,5,'c',{sourceRevision:0});coding(s,'anchor','two',0,5,'c',{anchorStatus:'needs_review'});coding(s,'deleted','two',0,5,'c',{deletedAt:'2026-01-01'});coding(s,'media','two',0,5,'c',{kind:'media'});coding(s,'wrong','two',0,5,'c',{text:'incorrect'});coding(s,'status','two',0,5,'c',{status:'coded'});
  assert.deepEqual(comparisonScope(s,{status:'accepted'}).codings.map(c=>c.id),['good']);
  s.documents[0].reviewFlags=[{start:undefined,end:4}];assert.equal(comparisonScope(s).totalCharacters,0);assert.equal(comparisonScope(s).codings.length,0);
});
test('Unicode codepoints, true zero positions and undefined measures are preserved',()=>{
  const s=fixture();s.documents[0].text='😀éabc';coding(s,'a','one',0,2);coding(s,'b','two',0,2);
  const r=compareCodingPair(s,'one','two',{codeId:'c'});assert.equal(r.jaccard,1);assert.equal(r.byCode[0].n,5);assert.equal(r.byCode[0].n11,2);assert.equal(r.byCode[0].kappa,1);
  s.codings=[];const none=compareCodingPair(s,'one','two',{codeId:'c'});assert.equal(none.jaccard,null);assert.equal(none.exact.percent,null);assert.equal(none.byCode[0].kappa,null);assert.equal(none.byCode[0].n,5);
  assert.throws(()=>compareCodingPair(s,'one','one'),/distinct/);
});
test('Pairwise export stays scoped, contains counts and method, and no quotation text',()=>{
  const s=fixture();coding(s,'a','one',0,10);coding(s,'b','two',5,10);coding(s,'c','three',0,10,'x');
  const all=pairwiseComparisons(s,['one','two','three','one'],{codeId:'c',sourceId:'d'});assert.equal(all.length,3);const rows=comparisonExportRows(all);assert.equal(rows.length,4);assert.ok(rows.slice(1).every(r=>r[2]==='d'&&r[5]==='c'));assert.ok(rows.slice(1).every(r=>typeof r.at(-1)==='string'&&r.at(-1).includes('Jaccard')));assert.ok(!JSON.stringify(rows).includes('abcdefghij'));
});
