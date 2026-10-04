import test from 'node:test';
import assert from 'node:assert/strict';
import {cooccurrenceMatrix,cooccurrenceRows,boxStats,applicationGap,relationDistances,relationDistanceRows,relationDistanceSVG,attributeDistribution,attributeAttributes,attributeDistributionRows} from '../src/visual-statistics.mjs';
import {codeRelations,words} from '../src/analysis-domain.mjs';
const text='😀abcdefghijklmnopqrstuvwxyz0123456789';
const fixture=()=>({documents:[{id:'d',name:'Source',text,revision:1},{id:'e',name:'Other',text,revision:1}],codes:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}],codings:[],cases:[]});
function coding(s,id,codeId,start,end,extra={}){const documentId=extra.documentId||'d',row={id,documentId,start,end,text:Array.from(text).slice(start,end).join(''),codeId,coder:'Researcher',sourceRevision:1,status:'coded',...extra};s.codings.push(row);return row;}

test('co-occurrence counts distinct overlap intervals and Jaccard unions each code per source',()=>{
 const s=fixture();coding(s,'a1','a',0,10);coding(s,'a2','a',5,12);coding(s,'b1','b',8,20);coding(s,'c1','c',30,34);coding(s,'b2','b',0,4,{documentId:'e'});
 const m=cooccurrenceMatrix(s),ab=m.cell('a','b'),ba=m.cell('b','a');
 // a1∩b1=[8,10), a2∩b1=[8,12): two distinct intervals. A=[0,12), B=[8,20) → shared 4, union 20 (+B on e: 4).
 assert.equal(ab.count,2);assert.equal(ab.shared,4);assert.equal(ab.union,24);assert.equal(ab.jaccard,4/24);
 assert.deepEqual([ba.count,ba.jaccard],[ab.count,ab.jaccard]);
 assert.equal(m.cell('a','c').count,0);assert.equal(m.cell('a','c').jaccard,0);assert.equal(m.cell('a','a').diagonal,true);
 assert.deepEqual(ab.applications.map(x=>x.id).sort(),['a1','a2','b1']);
});
test('co-occurrence honours source and coder filters, excludes stale anchors and escapes CSV formulas',()=>{
 const s=fixture();coding(s,'a1','a',0,10);coding(s,'b1','b',5,15,{coder:'Other'});coding(s,'b2','b',2,6,{text:'stale'});
 assert.equal(cooccurrenceMatrix(s).cell('a','b').count,1);
 assert.equal(cooccurrenceMatrix(s,{coder:'Researcher'}).codes.length,1);
 assert.equal(cooccurrenceMatrix(s,{source:'e'}).codes.length,0);
 s.codes[0].name='=HYPERLINK("x")';const rows=cooccurrenceRows(cooccurrenceMatrix(s),{measure:'jaccard',scope:'All'});
 assert.equal(rows[4][1],'=HYPERLINK("x")');assert.equal(rows[5][2],0.3333);assert.equal(rows[5][1],'');
});
test('box statistics use linear quartiles and Tukey fences',()=>{
 const s=boxStats([1,2,3,4,100]);
 assert.deepEqual([s.n,s.min,s.q1,s.median,s.q3,s.max],[5,1,2,3,4,100]);assert.deepEqual(s.outliers,[100]);assert.equal(s.whiskerHigh,4);
 assert.equal(boxStats([7]).median,7);assert.equal(boxStats([]),null);assert.equal(boxStats([1,2,3,4]).q1,1.75);
});
test('relation distances keep codepoints and seconds separate and treat overlaps as zero',()=>{
 const s=fixture();coding(s,'a1','a',0,5);coding(s,'b1','b',9,12);coding(s,'b2','b',3,6);
 s.codings.push({id:'am',documentId:'d',kind:'media',recordingKey:'r',timeStart:1,timeEnd:2,codeId:'a',coder:'Researcher',status:'coded'},{id:'bm',documentId:'d',kind:'media',recordingKey:'r',timeStart:4.5,timeEnd:6,codeId:'b',coder:'Researcher',status:'coded'});
 assert.equal(applicationGap(s.codings[0],s.codings[1]),4);assert.equal(applicationGap(s.codings[0],s.codings[2]),0);
 const rows=relationDistances(codeRelations(s,s.codings,'same-source'));
 assert.deepEqual(rows.map(r=>[r.unit,r.values.sort()]),[['codepoints',[0,4]],['seconds',[2.5]]]);
 const csv=relationDistanceRows(rows,{scope:'All',operator:'same-source'});assert.match(csv[2][1],/dependent/);assert.equal(csv[5][2],'codepoints');
 const svg=relationDistanceSVG(rows,{scope:'<All>'});assert.match(svg,/&lt;All&gt;/);assert.match(svg,/Mixed units/);assert.equal((svg.match(/<rect /g)||[]).length,3);
});
test('attribute distribution separates categorical, numeric histogram and missing values',()=>{
 const s={documents:[{id:'d',name:'Doc',attributes:{Site:'North'}},{id:'r',name:'Ref',sourceRole:'reference',attributes:{Site:'South'}}],cases:[{id:'1',name:'One',attributes:{Age:31,Role:'Nurse',Rural:true}},{id:'2',name:'Two',attributes:{Age:'45',Role:'Nurse',Rural:false}},{id:'3',name:'Three',attributes:{Age:60,Role:'Lead'}},{id:'4',name:'Four',attributes:{Role:''}}]};
 assert.deepEqual(attributeAttributes(s),['Age','Role','Rural']);assert.deepEqual(attributeAttributes(s,'sources'),['Site']);
 const role=attributeDistribution(s,{attribute:'Role'});assert.equal(role.kind,'categorical');assert.deepEqual(role.bins.map(b=>[b.label,b.count]),[['Nurse',2],['Lead',1]]);assert.equal(role.missing,1);
 const rural=attributeDistribution(s,{attribute:'Rural'});assert.deepEqual(rural.bins.map(b=>b.label).sort(),['false','true']);
 const age=attributeDistribution(s,{attribute:'Age'});assert.equal(age.kind,'numeric');assert.equal(age.bins.reduce((n,b)=>n+b.count,0),3);assert.equal(age.bins.length,3);assert.equal(age.bins.at(-1).to,60);assert.equal(age.stats.median,45);
 assert.equal(attributeDistribution(s,{target:'sources',attribute:'Site'}).total,1);
 assert.deepEqual(attributeDistributionRows(role).at(-1),['Lead',1,'Three']);
});
test('word frequency hits keep exact Unicode quotations after per-source codepoint caching',()=>{
 const s={documents:[{id:'d',text:'😀 Hub hub, café hub.',reviewFlags:[]}]};const [hub]=words(s,s.documents,{language:'none',min:2});
 assert.equal(hub.term,'hub');assert.equal(hub.count,3);assert.deepEqual(hub.hits.map(h=>[h.start,h.text]),[[2,'Hub'],[6,'hub'],[16,'hub']]);
});
