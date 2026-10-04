import test from 'node:test';
import assert from 'node:assert/strict';
import {relationPairEvidence,relationEvidenceRows} from '../src/relation-evidence.mjs';
const fixture=()=>({documents:[{id:'d',name:'Source',text:'😀abcdefghijklmno',revision:1,mediaKey:'audio'}],codes:[{id:'a',name:'A'},{id:'b',name:'B'}],codings:[],cases:[]});
function coding(s,id,start,end,extra={}){const row={id,documentId:'d',start,end,text:Array.from(s.documents[0].text).slice(start,end).join(''),codeId:id==='a'?'a':'b',coder:'AI analyst',sourceRevision:1,status:'coded',...extra};s.codings.push(row);return row;}
test('QualCoder-inspired context retains exact Unicode before/shared/after and union lengths for overlaps',()=>{
  const s=fixture(),a=coding(s,'a',0,8),b=coding(s,'b',5,12),[r]=relationPairEvidence(s,[[a,b]]);
  assert.equal(r.before,'😀abcd');assert.equal(r.shared,'efg');assert.equal(r.after,'hijk');assert.equal(r.overlap,3);assert.equal(r.union,12);assert.equal(r.distance,0);assert.equal(r.relation,'overlap');assert.equal(r.unit,'codepoints');assert.equal(r.before+r.shared+r.after,Array.from(s.documents[0].text).slice(0,12).join(''));
});
test('Containment and exact selections decompose current source while disjoint gaps never export uncoded context',()=>{
  const s=fixture(),a=coding(s,'a',0,8),b=coding(s,'b',2,5),d=coding(s,'d',10,13);
  const contained=relationPairEvidence(s,[[a,b]])[0];assert.equal(contained.relation,'containment');assert.equal(contained.overlap,3);assert.equal(contained.union,8);
  const disjoint=relationPairEvidence(s,[[a,d]])[0];assert.equal(disjoint.distance,2);assert.equal(disjoint.union,11);assert.equal(disjoint.before+disjoint.shared+disjoint.after,'');assert.match(disjoint.contextBasis,/gap text omitted/);
  const exact=relationPairEvidence(s,[[a,{...a,id:'copy'}]]);assert.equal(exact.length,0,'Unpersisted caller-injected pair cannot export');
});
test('Canonical state wins over modified caller pairs; restrictions, stale source text and mismatched sources are excluded',()=>{
  const s=fixture(),a=coding(s,'a',0,8),b=coding(s,'b',5,12);assert.equal(relationPairEvidence(s,[[{...a,start:99},b]])[0].leftStart,0);
  s.documents[0].reviewFlags=[{start:6,end:7}];assert.equal(relationPairEvidence(s,[[a,b]]).length,0);s.documents[0].reviewFlags=[];b.text='edited';assert.equal(relationPairEvidence(s,[[a,b]]).length,0);
});
test('Fractional current recording bounds use seconds without text interpolation; mismatched recordings/restrictions withheld',()=>{
  const s=fixture(),a=coding(s,'a',0,1,{kind:'media',recordingKey:'audio',timeStart:0,timeEnd:4.25}),b=coding(s,'b',0,1,{kind:'media',recordingKey:'audio',timeStart:3,timeEnd:7.5});
  const [r]=relationPairEvidence(s,[[a,b]]);assert.equal(r.unit,'seconds');assert.equal(r.overlap,1.25);assert.equal(r.union,7.5);assert.equal(r.shared,'');assert.match(r.contextBasis,/no text interpolation/);
  b.recordingKey='other';assert.equal(relationPairEvidence(s,[[a,b]]).length,0);b.recordingKey='audio';s.documents[0].reviewFlags=[{start:10,end:12}];assert.equal(relationPairEvidence(s,[[a,b]]).length,0);
});
test('CSV rows describe source revisions, application identities, units, scope and the non-independent pair method',()=>{
  const s=fixture(),a=coding(s,'a',0,8),b=coding(s,'b',5,12),rows=relationEvidenceRows(relationPairEvidence(s,[[a,b]]),{scope:'revision 2; source d'});
  assert.equal(rows[0][1],'revision 2; source d');assert.match(rows[1][1],/not independent/);assert.ok(rows[3].includes('Source revision'));assert.ok(rows[3].includes('Unit'));assert.equal(rows[4][9],'codepoints');
});
