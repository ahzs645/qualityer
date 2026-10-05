import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {emptyState,applyOperation,validateState} from '../src/domain.mjs';
import {coderAttributeAgreement,attributeAgreementExportRows,NOT_RECORDED_GROUP} from '../src/coverage-profile.mjs';
import {knownCoders,coderAttributeNames} from '../src/coder-attributes.mjs';
import {teamAccess,authorizeOperation,visibleProjectState} from '../src/team-policy.mjs';
import {exportProjectArchive,readProjectArchive} from '../src/project-archive.mjs';
import {exportQDPX} from '../src/refi.mjs';
import {safeCSV} from '../src/report-export.mjs';
// Synthetic fixture only: one 20-codepoint source, two codes, four saved coder identities.
function fixture(){
  const s=emptyState('Synthetic coder attributes');s.documents=[{id:'d',name:'Synthetic source',text:'abcdefghijklmnopqrst',revision:1},{id:'e',name:'Second synthetic source',text:'0123456789',revision:1}];s.codes=[{id:'c1',name:'Alpha'},{id:'c2',name:'Beta'}];
  const add=(id,coder,start,end,codeId,documentId='d')=>{const d=s.documents.find(d=>d.id===documentId);s.codings.push({id,coder,documentId,codeId,start,end,text:Array.from(d.text).slice(start,end).join(''),sourceRevision:1,status:'coded'});};
  add('a','n1',0,10,'c1');add('b','n2',5,15,'c1');add('c','p1',0,4,'c1');add('d','p1',6,8,'c1');add('e','n1',10,20,'c2');add('f','u',12,16,'c2');
  s.coderAttributes={n1:{Role:'Nurse'},n2:{Role:'Nurse',Site:'North'},p1:{Role:'Physician'}};return s;
}
const cell=(cells,a,b)=>cells.flat().find(c=>c.rowGroup===a&&c.columnGroup===b);
test('Codepoint agreement sums pairwise intersections and unions within and between attribute groups',()=>{
  const s=fixture(),before=JSON.stringify(s),p=coderAttributeAgreement(s,{},{attribute:'Role'});assert.equal(JSON.stringify(s),before);
  assert.deepEqual(p.groups.map(g=>[g.label,g.recorded,g.coders]),[['Nurse',true,['n1','n2']],['Physician',true,['p1']],[NOT_RECORDED_GROUP,false,['u']]]);assert.equal(p.pairCount,6);
  const nn=cell(p.cells,'Nurse','Nurse');assert.equal(nn.kind,'within');assert.deepEqual([nn.intersection,nn.union,nn.agreement,nn.pairCount,nn.sourceCount],[5,25,.2,1,1]);
  const np=cell(p.cells,'Nurse','Physician');assert.equal(np.kind,'between');assert.deepEqual([np.intersection,np.union,np.pairCount,np.possiblePairs],[8,34,2,2]);assert.equal(np.agreement,8/34);assert.deepEqual(np.coderPairs.map(x=>[x.a,x.b,x.intersection,x.union]),[['n1','p1',6,20],['n2','p1',2,14]]);
  assert.deepEqual(cell(p.cells,'Physician','Nurse').agreement,np.agreement);
  const pp=cell(p.cells,'Physician','Physician');assert.equal(pp.agreement,null);assert.equal(pp.possiblePairs,0);assert.equal(pp.union,0);
  assert.deepEqual(new Set(np.rows.map(r=>r.id)),new Set(['a','b','c','d','e']));
});
test('Coders without the attribute are an explicit Not recorded group, and a zero-overlap union is 0 rather than N/A',()=>{
  const s=fixture(),p=coderAttributeAgreement(s,{},{attribute:'Role'});
  const nr=cell(p.cells,'Nurse',NOT_RECORDED_GROUP);assert.deepEqual([nr.intersection,nr.union,nr.pairCount],[4,34,2]);
  const pr=cell(p.cells,'Physician',NOT_RECORDED_GROUP);assert.equal(pr.agreement,0);assert.equal(pr.union,10);
  assert.equal(cell(p.cells,NOT_RECORDED_GROUP,NOT_RECORDED_GROUP).agreement,null);
  const site=coderAttributeAgreement(s,{},{attribute:'Site'});assert.deepEqual(site.groups.map(g=>[g.label,g.coders]),[['North',['n2']],[NOT_RECORDED_GROUP,['n1','p1','u']]]);
  const missing=coderAttributeAgreement(s,{},{attribute:'Unused'});assert.deepEqual(missing.groups.map(g=>g.label),[NOT_RECORDED_GROUP]);assert.equal(missing.cells[0][0].pairCount,6);
  assert.deepEqual(knownCoders(s),['n1','n2','p1','u']);assert.deepEqual(coderAttributeNames(s),['Role','Site']);
});
test('Per-code breakdown keeps code dimensions separate and excludes pairs with an empty union for that code',()=>{
  const p=coderAttributeAgreement(fixture(),{},{attribute:'Role',byCode:true}),alpha=p.codes.find(c=>c.codeName==='Alpha').cells,beta=p.codes.find(c=>c.codeName==='Beta').cells;
  assert.deepEqual(p.codes.map(c=>c.codeName),['Alpha','Beta']);
  assert.deepEqual([cell(alpha,'Nurse','Nurse').intersection,cell(alpha,'Nurse','Nurse').union],[5,15]);assert.deepEqual([cell(alpha,'Nurse','Physician').intersection,cell(alpha,'Nurse','Physician').union],[8,24]);assert.deepEqual([cell(alpha,'Nurse',NOT_RECORDED_GROUP).intersection,cell(alpha,'Nurse',NOT_RECORDED_GROUP).union],[0,20]);
  assert.deepEqual([cell(beta,'Nurse','Nurse').intersection,cell(beta,'Nurse','Nurse').union],[0,10]);const bp=cell(beta,'Nurse','Physician');assert.deepEqual([bp.intersection,bp.union,bp.pairCount,bp.possiblePairs],[0,10,1,2]);assert.deepEqual([cell(beta,'Nurse',NOT_RECORDED_GROUP).intersection,cell(beta,'Nurse',NOT_RECORDED_GROUP).union],[4,14]);
  // Identical positions under different codes never count as agreement.
  const s=emptyState('Synthetic code separation');s.documents=[{id:'d',name:'S',text:'abcdef',revision:1}];s.codes=[{id:'x',name:'X'},{id:'y',name:'Y'}];s.codings=[{id:'1',coder:'a',documentId:'d',codeId:'x',start:0,end:6,text:'abcdef',status:'coded',sourceRevision:1},{id:'2',coder:'b',documentId:'d',codeId:'y',start:0,end:6,text:'abcdef',status:'coded',sourceRevision:1}];
  assert.deepEqual([coderAttributeAgreement(s,{},{attribute:'Role'}).cells[0][0].intersection,coderAttributeAgreement(s,{},{attribute:'Role'}).cells[0][0].union],[0,12]);
});
test('Segment unit counts shared contiguous units, and sources contributing are counted per cell',()=>{
  const p=coderAttributeAgreement(fixture(),{},{attribute:'Role',unit:'segments'});
  assert.deepEqual([cell(p.cells,'Nurse','Nurse').intersection,cell(p.cells,'Nurse','Nurse').union],[1,2]);assert.deepEqual([cell(p.cells,'Nurse','Physician').intersection,cell(p.cells,'Nurse','Physician').union],[2,4]);
  const s=fixture();s.codings.push({id:'g',coder:'n1',documentId:'e',codeId:'c1',start:0,end:5,text:'01234',status:'coded',sourceRevision:1},{id:'h',coder:'n2',documentId:'e',codeId:'c1',start:0,end:5,text:'01234',status:'coded',sourceRevision:1});
  const two=cell(coderAttributeAgreement(s,{},{attribute:'Role'}).cells,'Nurse','Nurse');assert.deepEqual([two.intersection,two.union,two.sourceCount],[10,30,2]);assert.deepEqual(two.sources,['Synthetic source','Second synthetic source']);
  assert.equal(cell(coderAttributeAgreement(s,{sourceId:'e'},{attribute:'Role'}).cells,'Nurse','Nurse').agreement,1);
  assert.throws(()=>coderAttributeAgreement(s,{},{attribute:'Role',unit:'words'}),/codepoints or segments/);
});
test('CSV export lists unordered group cells, per-code rows and contributing pair dimensions without spreadsheet formulas',()=>{
  const s=fixture();s.coderAttributes.n1.Role='=Nurse';const p=coderAttributeAgreement(s,{},{attribute:'Role',byCode:true}),rows=attributeAgreementExportRows(p,{scope:'Synthetic scope'}),csv=safeCSV(rows);
  assert.ok(rows.some(r=>r[0]==='All codes'&&r[1]==='Nurse'&&r[2]==='Physician'));assert.ok(rows.some(r=>r[0]==='Beta'));assert.ok(rows.some(r=>r[2]==='n1'&&r[3]==='p1'&&r[4]==='Alpha'));assert.ok(!/(^|,)"?=Nurse/m.test(csv));assert.match(csv,/not a reliability coefficient/);
});
test('Coder attribute operation trims, types, replaces and clears values; reviewers only',()=>{
  let s=fixture();s=applyOperation(s,{type:'attribute.type',data:{name:'Years',scope:'coder',valueType:'number'}},'owner');
  s=applyOperation(s,{type:'attribute.coder',data:{coder:'u',attributes:{' Role ':' Nurse ',Years:'4',Blank:'',Gone:null}}},'owner');assert.deepEqual(s.coderAttributes.u,{Role:'Nurse',Years:4});
  s=applyOperation(s,{type:'attribute.coder',data:{coder:'u',attributes:{Role:'Physician'}}},'r','reviewer');assert.deepEqual(s.coderAttributes.u,{Role:'Physician'});
  s=applyOperation(s,{type:'attribute.coder',data:{coder:'u',clear:true}},'owner');assert.equal(Object.hasOwn(s.coderAttributes,'u'),false);assert.deepEqual(s.coderAttributes.n1,{Role:'Nurse'});
  assert.throws(()=>applyOperation(s,{type:'attribute.coder',data:{coder:'u',attributes:{Years:'many'}}},'owner'),/numeric/);
  assert.throws(()=>applyOperation(s,{type:'attribute.coder',data:{coder:'u',attributes:{Role:'Nurse'}}},'n1','coder'),/Reviewer access required/);
  assert.throws(()=>applyOperation(s,{type:'attribute.coder',data:{coder:'u',attributes:{Role:'Nurse'}}},'v','viewer'),/Read-only/);
  for(const data of [{coder:'',attributes:{}},{coder:'__proto__',attributes:{Role:'x'}},{coder:'u',attributes:['Nurse']},{coder:'u',attributes:{Role:{nested:true}}},{coder:'u',attributes:{'':'x'}},{coder:'u',attributes:{Role:Infinity}}])assert.throws(()=>applyOperation(s,{type:'attribute.coder',data},'owner'),/coder|attribute/i);
  const typed=applyOperation(s,{type:'attribute.coder',data:{coder:'u',attributes:{Years:'7'}}},'owner');assert.deepEqual(applyOperation(typed,{type:'attribute.type',data:{name:'Years',scope:'coder',valueType:'text'}},'owner').coderAttributes.u,{Years:'7'});assert.deepEqual(typed.coderAttributes.u,{Years:7});
});
test('Project validation accepts coder attributes, rejects malformed records, and archives preserve them',async()=>{
  const s=fixture();assert.equal(validateState(s),true);assert.equal(validateState({...s,coderAttributes:undefined}),true);
  for(const bad of ['Nurse',[],{n1:'Nurse'},{n1:{Role:[1]}},{'':{Role:'x'}}])assert.throws(()=>validateState({...s,coderAttributes:bad}),/coder/i);
  const recovered=(await readProjectArchive(unzipSync(await exportProjectArchive(s)))).state;assert.deepEqual(recovered.coderAttributes,s.coderAttributes);
  assert.deepEqual(JSON.parse(strFromU8(unzipSync(exportQDPX(s))['research-weave.json'])).state.coderAttributes,s.coderAttributes);
});
test('Authorization: structure capability required; viewers and blind coders are refused; blind views omit coder attributes',()=>{
  const s=fixture(),op={type:'attribute.coder',data:{coder:'u',attributes:{Role:'Nurse'}}};
  assert.doesNotThrow(()=>authorizeOperation(s,op,teamAccess(s,'owner',{id:'o'})));assert.doesNotThrow(()=>authorizeOperation(s,op,teamAccess(s,'reviewer',{id:'r'})));
  assert.throws(()=>authorizeOperation(s,op,teamAccess(s,'viewer',{id:'v'})),e=>e.status===403);
  const limited={...s,settings:{...s.settings,teamAccess:{blindCoding:false,roles:{reviewer:{structure:false}}}}};assert.throws(()=>authorizeOperation(limited,op,teamAccess(limited,'reviewer',{id:'r'})),e=>e.status===403&&/structure/.test(e.message));
  const blind={...s,settings:{...s.settings,teamAccess:{blindCoding:true}}},access=teamAccess(blind,'coder',{id:'n1'});assert.throws(()=>authorizeOperation(blind,op,access),e=>e.status===403);assert.equal(visibleProjectState(blind,access).coderAttributes,undefined);
});
