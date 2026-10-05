import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../src/domain.mjs';
test('restoring a removed coding is refused when the same coder already re-applied that code to the same passage',()=>{
 let s=emptyState('Synthetic');s.documents=[{id:'d',name:'D',text:'Alpha beta gamma.\n',revision:1}];s.codes=[{id:'c',name:'Code',color:'#227e8a'}];
 const create=()=>applyOperation(s,{type:'coding.create',data:{documentId:'d',start:0,end:5,text:'Alpha',sourceRevision:1,codeIds:['c']}},'me');
 s=create();const first=s.codings[0].id;
 s=applyOperation(s,{type:'coding.delete',data:{id:first}},'me');
 s=create();assert.equal(s.codings.filter(c=>!c.deletedAt).length,1);
 assert.throws(()=>applyOperation(s,{type:'coding.restore',data:{id:first}},'me'),/duplicate/);
 const other=applyOperation(s,{type:'coding.delete',data:{id:s.codings.find(c=>!c.deletedAt).id}},'me');
 const restored=applyOperation(other,{type:'coding.restore',data:{id:first}},'me');assert.equal(restored.codings.filter(c=>!c.deletedAt).length,1);
});
