import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,applyOperation} from '../src/domain.mjs';
import {canSeekTurn} from '../src/transcript-alignment.mjs';
const fixture=()=>({...emptyState('Archive'),documents:[{id:'d',name:'Recording',text:'Evidence',revision:1,mediaKey:'old/recording',mediaType:'audio/mp4',turns:[{id:'t',start:0,end:8,timeStart:0,timeEnd:2}],alignment:{recordingKey:'old/recording',status:'matched'}}],codes:[{id:'c',name:'Topic'}],codings:[{id:'a',documentId:'d',codeId:'c',kind:'media',recordingKey:'old/recording',timeStart:0,timeEnd:2,text:'Evidence',status:'accepted'}]});
test('owner archive restoration preserves matching audio, timing and accepted decisions without replacement history',()=>{
 const before=fixture(),after=applyOperation(before,{type:'source.media.restore',data:{keyMap:{'old/recording':'new/uploaded'}}},'owner','owner');
 assert.equal(after.documents[0].mediaKey,'new/uploaded');
 assert.equal(after.codings[0].recordingKey,'new/uploaded');
 assert.equal(after.codings[0].status,'accepted');
 assert.equal(canSeekTurn(after.documents[0],after.documents[0].turns[0]),true);
 assert.equal(after.documents[0].versions,undefined);
 assert.equal(before.documents[0].mediaKey,'old/recording');
});
test('bulk restoration cannot be used by non-owners or introduce unrelated references',()=>{
 assert.throws(()=>applyOperation(fixture(),{type:'source.media.restore',data:{keyMap:{}}},'reviewer','reviewer'),/owner/);
 assert.throws(()=>applyOperation(fixture(),{type:'source.media.restore',data:{keyMap:{unknown:'new/uploaded'}}},'owner','owner'),/unknown/);
 const detached=applyOperation(fixture(),{type:'source.media.restore',data:{keyMap:{}}},'owner','owner');
 assert.equal(detached.documents[0].mediaKey,null);
 assert.equal(canSeekTurn(detached.documents[0],detached.documents[0].turns[0]),false);
 assert.equal(detached.codings[0].recordingKey,'old/recording');
});
