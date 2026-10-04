import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOperation,emptyState} from '../src/domain.mjs';
import {frameworkCellCurrent,frameworkMatrix} from '../src/framework-method.mjs';

const actor='Synthetic framework reviewer';
function fixture(){let state=applyOperation(emptyState(),{type:'source.import',data:{name:'Synthetic source',text:'😀 Support. Qualification.'}},actor);state=applyOperation(state,{type:'code.create',data:{name:'Synthetic theme'}},actor);return applyOperation(state,{type:'framework.study.save',data:{id:'study',name:'Synthetic framework',researchQuestion:'How does the account describe participation?',documentIds:[state.documents[0].id],themes:[{id:'theme',title:'Participation',codeIds:[state.codes[0].id]}]}},actor);}
const cellData=(state,finding='observed')=>({studyId:'study',documentId:state.documents[0].id,themeId:'theme',finding,summary:'A provisional synthetic interpretation.',limitations:'Synthetic test data only.',evidence:finding==='observed'?[{documentId:state.documents[0].id,start:0,end:10,text:'😀 Support.',sourceRevision:state.documents[0].revision,relation:'support'}]:[]});
const save=(state,finding)=>applyOperation(state,{type:'framework.cell.save',data:cellData(state,finding)},actor);
const review=state=>applyOperation(state,{type:'framework.cell.review',data:{studyId:'study',id:state.frameworkCells[0].id,status:'agent-reviewed',note:'Synthetic independent agent interpretation review, not source verification.'}},actor);

test('Framework observed chart stores current evidence, contrasting evidence and review history',()=>{
 let state=fixture();const data=cellData(state);data.evidence.push({documentId:state.documents[0].id,start:11,end:25,text:'Qualification.',sourceRevision:1,relation:'contrast'});
 state=applyOperation(state,{type:'framework.cell.save',data},actor);assert.equal(state.frameworkCells[0].sourceRevision,1);assert.equal(frameworkCellCurrent(state,state.frameworkCells[0]),true);
 state=review(state);assert.equal(state.frameworkCells[0].status,'agent-reviewed');assert.equal(state.frameworkCells[0].reviews.length,1);assert.equal(frameworkMatrix(state,'study').rows[0].cells[0].current,true);
 state=applyOperation(state,{type:'framework.cell.save',data:{...state.frameworkCells[0],summary:'A revised provisional interpretation.'}},actor);
 assert.equal(state.frameworkCells[0].status,'draft');assert.equal(state.frameworkCells[0].versions.length,1);assert.equal(state.frameworkCells[0].versions[0].summary,data.summary);
});

test('All findings become stale after source revision; empty not-observed and withheld cells are initially current',()=>{
 for(const finding of ['observed','not-observed','withheld']){
  let state=save(fixture(),finding);const original=state.frameworkCells[0];assert.equal(frameworkCellCurrent(state,original),true);state=review(state);
  state=applyOperation(state,{type:'source.revise',data:{id:state.documents[0].id,text:'A replacement account now describes a different pattern.'}},actor);
  assert.equal(frameworkCellCurrent(state,state.frameworkCells[0]),false);assert.equal(frameworkMatrix(state,'study').rows[0].cells[0].current,false);
  assert.throws(()=>review(state),/source or evidence changed/);
  assert.throws(()=>applyOperation(state,{type:'framework.cell.save',data:{...original,summary:'Old source summary.'}},actor),/source changed/);
 }
});

test('Observed chart requires exact current quotations and restriction decisions invalidate its review',()=>{
 const state=fixture(),data=cellData(state),doc=state.documents[0];
 assert.throws(()=>applyOperation(state,{type:'framework.cell.save',data:{...data,evidence:[]}},actor),/needs linked evidence/);
 assert.throws(()=>applyOperation(state,{type:'framework.cell.save',data:{...data,evidence:[{...data.evidence[0],text:'Invented.'}]}},actor),/exact current/);
 let saved=save(state);saved=applyOperation(saved,{type:'source.consent.flag',data:{id:doc.id,start:0,end:10,text:'😀 Support.',sourceRevision:1,note:'Synthetic consent review.'}},actor);
 assert.equal(frameworkCellCurrent(saved,saved.frameworkCells[0]),false);assert.throws(()=>review(saved),/restricted/);
 assert.throws(()=>applyOperation(saved,{type:'framework.cell.save',data},actor),/outside restricted/);
});

test('Framework mutation requires reviewer access and valid scope',()=>{
 const state=fixture();assert.throws(()=>applyOperation(state,{type:'framework.cell.save',data:cellData(state)},'coder','coder'),/Reviewer access/);
 assert.throws(()=>applyOperation(state,{type:'framework.cell.save',data:{...cellData(state),themeId:'missing'}},actor),/source and theme/);
 assert.throws(()=>applyOperation(state,{type:'framework.cell.save',data:{...cellData(state),finding:'absent'}},actor),/Distinguish/);
});
