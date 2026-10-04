import test from 'node:test';
import assert from 'node:assert/strict';
import {privateAnalysis} from '../server/private-analysis.mjs';
test('temporary analysis service preserves identity and fences operations to the registered owner study',async()=>{
 const token='synthetic-analysis-service-token-123456789';
 const records={calibration_owner:{value:'owner'},'private-import:reviewed-interviews:v1':{value:JSON.stringify({id:'study',ownerId:'owner'})}};
 const env={PRIVATE_ANALYSIS_TOKEN:token,DB:{
  prepare:sql=>({bind:(...values)=>({first:async()=>sql.includes('site_settings')?records[values[0]]:values[0]==='study'&&values[1]==='owner'?{id:'study'}:null})})
 }};
 const calls=[],state={analysisContinuations:[]},dispatch=async req=>{calls.push(req);return Response.json({state,revision:3,id:'study'});};
 const call=(method='GET',payload,path='/api/private-analysis',credential=token)=>privateAnalysis(new Request('https://test.invalid'+path,{method,headers:{'x-qualityer-analysis-token':credential},body:payload?JSON.stringify(payload):undefined}),env,dispatch);
 await assert.rejects(call('GET',null,undefined,'bad'),e=>e.status===401);
 await assert.rejects(call('GET',null,'/api/private-analysis/members'),e=>e.status===403);
 for(const type of ['source.transcript','permissions.update','framework.cell.review'])await assert.rejects(call('POST',{revision:3,operation:{type}}),e=>e.status===403);
 await assert.rejects(call('POST',{revision:3,ownerId:'attacker',operation:{type:'framework.continuation.add'}}),e=>e.status===403);
 await call();assert.equal(calls.at(-1).url,'https://test.invalid/api/projects/study');assert.equal(calls.at(-1).headers.get('oai-authenticated-user-id'),'owner');assert.equal(calls.at(-1).headers.get('x-qualityer-analysis-token'),null);
 await call('POST',{revision:3,operation:{type:'framework.continuation.add',data:{id:'run'}}});assert.equal(calls.at(-1).url,'https://test.invalid/api/projects/study/operate');assert.equal((await calls.at(-1).json()).revision,3);
 env.PRIVATE_ANALYSIS_TOKEN='disabled';await assert.rejects(call(),e=>e.status===401);env.PRIVATE_ANALYSIS_TOKEN=undefined;await assert.rejects(call(),e=>e.status===404);
});
