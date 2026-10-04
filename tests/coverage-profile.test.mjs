import test from 'node:test';
import assert from 'node:assert/strict';
import {coverageProfile,coverageScope,eligibleSourceIntervals,coderOverlapProfile,coverageExportRows,overlapExportRows,coverageSVG,intersectIntervals} from '../src/coverage-profile.mjs';
import {compareCodingPair} from '../src/coder-comparison.mjs';
import {safeCSV} from '../src/report-export.mjs';
const fixture=()=>({documents:[{id:'d',name:'First source',text:'😀abcdefghijklmnopqrs',revision:1,attributes:{Group:'A'}}],codes:[{id:'p',name:'Parent'},{id:'c',name:'Child',parentId:'p'},{id:'x',name:'Other'}],cases:[],codings:[]});
function add(s,id,coder,start,end,codeId='c',extra={}){const d=s.documents.find(d=>d.id===(extra.documentId||'d'));s.codings.push({id,coder,documentId:d.id,start,end,text:Array.from(d.text).slice(start,end).join(''),sourceRevision:d.revision||1,status:'coded',codeId,...extra});}
test('Normalized coverage unions duplicate and nested code decisions; rates preserve applications and Unicode codepoints',()=>{
  const s=fixture();add(s,'a','one',0,6);add(s,'b','one',3,10);add(s,'c','two',0,6);add(s,'d','one',0,4,'p');
  const before=JSON.stringify(s),p=coverageProfile(s),parent=p.codeRows.find(c=>c.id==='p').cells[0];
  assert.equal(parent.eligibleCodepoints,20);assert.equal(parent.coveredCodepoints,10);assert.equal(parent.coveragePercent,50);assert.equal(parent.applications,4);assert.equal(parent.applicationsPer1000,200);assert.equal(JSON.stringify(s),before);
  const direct=coverageProfile(s,{}, {rowMode:'direct'}).codeRows.find(c=>c.id==='p').cells[0];assert.equal(direct.coveragePercent,20);assert.equal(direct.applications,1);
});
test('Overlapping restrictions union once and remove text from the denominator, whole crossing applications withheld',()=>{
  const s=fixture();s.documents[0].reviewFlags=[{start:2,end:7},{start:5,end:10}];add(s,'crossing','one',0,4);add(s,'good','one',10,16);add(s,'outside','two',17,20);
  const p=coverageProfile(s),cell=p.codeRows.find(c=>c.id==='c').cells[0];assert.equal(cell.eligibleCodepoints,12);assert.equal(cell.coveredCodepoints,9);assert.equal(cell.coveragePercent,75);assert.deepEqual(cell.rows.map(c=>c.id),['good','outside']);assert.deepEqual(p.sources[0].intervals,[[0,2],[10,20]]);
  s.documents[0].reviewFlags[0].anchorStatus='needs_review';assert.equal(coverageProfile(s).sources[0].eligibleCodepoints,0);assert.equal(coverageScope(s).rows.length,0);
});
test('Case passage denominators and measured coverage clip to the linked union without rewriting original decisions',()=>{
  const s=fixture(),text=Array.from(s.documents[0].text);s.cases=[{id:'case',name:'Passage case',passages:[{documentId:'d',start:5,end:12,text:text.slice(5,12).join(''),sourceRevision:1},{documentId:'d',start:10,end:15,text:text.slice(10,15).join(''),sourceRevision:1}]}];add(s,'wide','one',0,8);add(s,'inside','two',7,13);
  const p=coverageProfile(s,{caseId:'case'}),cell=p.codeRows.find(c=>c.id==='c').cells[0];assert.equal(cell.eligibleCodepoints,10);assert.equal(cell.coveredCodepoints,8);assert.equal(cell.coveragePercent,80);assert.equal(cell.rows[0].start,0);assert.equal(cell.rows[0].text,text.slice(0,8).join(''));
  const heat=coderOverlapProfile(s,{caseId:'case'}).cells[0][1];assert.equal(heat.leftCodepoints,3);assert.equal(heat.rightCodepoints,6);assert.equal(heat.intersection,1);assert.equal(heat.union,8);assert.equal(heat.jaccard,1/8);
  s.cases[0].documentIds=['d'];assert.equal(coverageProfile(s,{caseId:'case'}).sources[0].eligibleCodepoints,20);
});
test('Code, decision, quote and coder filters limit numerator; source attribute and source filters limit denominator',()=>{
  const s=fixture();s.documents.push({id:'other',name:'Second',text:'abcdefghij',revision:1,attributes:{Group:'B'}});add(s,'a','one',0,6,'c',{status:'accepted'});add(s,'b','two',8,12);add(s,'c','one',0,5,'x',{documentId:'other'});
  const p=coverageProfile(s,{attribute:'Group',attributeValue:'A',coder:'one',status:'accepted',text:'abc',codeId:'c'});assert.equal(p.sources.length,1);assert.equal(p.sources[0].eligibleCodepoints,20);assert.equal(p.rows.length,1);assert.equal(p.codeRows.find(c=>c.id==='c').cells[0].coveragePercent,30);
});
test('Reference, stale, removed, invalid, nontext and changed anchors never contribute; zero denominator stays undefined',()=>{
  const s=fixture();s.documents.push({id:'r',name:'Reference',text:s.documents[0].text,sourceRole:'reference'});s.documents.push({id:'empty',name:'Empty',text:''});
  for(const [id,extra] of [['bad',{text:'wrong'}],['old',{sourceRevision:0}],['review',{status:'needs_review'}],['anchor',{anchorStatus:'needs_review'}],['removed',{deletedAt:'yes'}],['reference',{documentId:'r'}],['media',{kind:'media'}]])add(s,id,'one',0,4,'c',extra);
  const p=coverageProfile(s);assert.equal(p.rows.length,0);assert.equal(p.sources.length,2);const cell=p.codeRows[0].cells.find(c=>c.sourceId==='empty');assert.equal(cell.coveragePercent,null);assert.equal(cell.applicationsPer1000,null);
  s.documents[0].reviewFlags=[{start:undefined,end:5}];assert.deepEqual(eligibleSourceIntervals(s,s.documents[0]),[]);
});
test('Requal-inspired heatmap agrees with existing pair comparison, keeps source/code dimensions separate, unions duplicate layers',()=>{
  const s=fixture();add(s,'a','AI Analyst',0,10);add(s,'dup','AI Analyst',0,10);add(s,'b','AI Reviewer',5,15);add(s,'x','AI Analyst',0,5,'x');
  const p=coderOverlapProfile(s),a=p.coders.indexOf('AI Analyst'),b=p.coders.indexOf('AI Reviewer'),cell=p.cells[a][b],comparison=compareCodingPair(s,'AI Analyst','AI Reviewer');assert.equal(cell.jaccard,comparison.jaccard);assert.equal(cell.intersection,5);assert.equal(cell.union,20);assert.equal(p.cells[a][a].jaccard,1);assert.equal(p.cells[b][a].jaccard,cell.jaccard);
  assert.match(p.method,/does not establish/);assert.match(p.method,/AI identities/);assert.equal(coderOverlapProfile(s,{sourceId:'missing'}).cells.length,0);
});
test('Exports carry denominators, active filters, methodology and scope without quotation text; SVG escapes labels',()=>{
  const s=fixture();s.codes[1].name='<script>alert(1)</script>';s.documents[0].name='=Sensitive';add(s,'a','one',0,6);add(s,'b','two',3,8);const p=coverageProfile(s,{coder:'one'}),rows=coverageExportRows(p,{scope:'revision 12'}),csv=safeCSV(rows),svg=coverageSVG(p,{scope:'<private>& scope'});
  assert.match(csv,/revision 12/);assert.match(csv,/Eligible codepoints/);assert.match(csv,/"'=Sensitive"/);assert.ok(!csv.includes('😀abcde'));assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);assert.match(svg,/&lt;private&gt;&amp; scope/);assert.match(svg,/20 codepoints/);assert.throws(()=>coverageSVG(p,{metric:'bad'}),/Unknown/);
  const heat=overlapExportRows(coderOverlapProfile(s));assert.match(JSON.stringify(heat),/Union codepoints/);assert.ok(!JSON.stringify(heat).includes('😀abcde'));
});
test('Interval intersection preserves inputs and handles empty, touching, merged and nested bounds',()=>{
  const a=[[0,6],[3,9]],b=[[9,11],[2,4]],before=JSON.stringify([a,b]);assert.deepEqual(intersectIntervals(a,b),[[2,4]]);assert.equal(JSON.stringify([a,b]),before);assert.deepEqual(intersectIntervals([],b),[]);
});
