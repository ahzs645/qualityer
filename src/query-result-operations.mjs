import {executeResultQuery,resultQuerySpec} from './query-intervals.mjs';
export function applyResultQueryOperation(s,op,actor,role,{uid}){
 if(!['query.results.save','query.results.materialize'].includes(op.type))return false;
 if(role==='viewer')throw Error('Read-only project access.');const data=op.data||{},name=String(data.name||'').trim();if(!name||name.length>200)throw Error('Name the result query with up to 200 characters.');
 const spec=resultQuerySpec(data.spec),date=new Date().toISOString();
 if(op.type==='query.results.save'){s.savedQueries??=[];s.savedQueries.push({id:uid(),name,author:actor,date,spec});return true;}
 if(!Array.isArray(data.resultIds)||!data.resultIds.length||data.resultIds.length>10000||new Set(data.resultIds).size!==data.resultIds.length)throw Error('Select between 1 and 10000 current query results.');
 const current=executeResultQuery(s,spec),ids=new Set(data.resultIds),rows=current.filter(r=>ids.has(r.queryResultId));if(rows.length!==ids.size)throw Error('Query results changed. Refresh before freezing results.');
 const codeId=uid();s.codes.push({id:codeId,name,description:'Frozen '+spec.mode+' query: '+JSON.stringify(spec),color:'#4d7b94',codable:true,querySnapshot:{mode:spec.mode,spec,date,actor,count:rows.length,selectedResultIds:data.resultIds,sourceRevisions:Object.fromEntries(rows.map(r=>[r.documentId,r.sourceRevision]))}});
 for(const r of rows){const c={id:uid(),codeId,documentId:r.documentId,sourceRevision:r.sourceRevision,text:r.text,coder:actor,date,status:'coded',memo:'',origin:'query-fragment-result',queryResult:{operation:r.operation,resultId:r.queryResultId,units:r.units,provenance:structuredClone(r.provenance),relatedProvenance:structuredClone(r.relatedProvenance),suppliedTurnBounds:structuredClone(r.suppliedTurnBounds||[]),timingBasis:r.timingBasis||null},querySources:r.provenance.map(p=>p.codingId)};if(r.kind==='media')Object.assign(c,{kind:'media',recordingKey:r.recordingKey,timeStart:r.timeStart,timeEnd:r.timeEnd});else Object.assign(c,{start:r.start,end:r.end});s.codings.push(c);}return true;
}
