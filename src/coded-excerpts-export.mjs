import {eligibleAnalyticalCodings} from './analytical-codings.mjs';
import {safeCSV} from './report-export.mjs';

export function exportCSV(state){
 const codes=new Map(state.codes.map(c=>[c.id,c])),documents=new Map(state.documents.map(d=>[d.id,d]));
 return safeCSV([['Source','Code','Coder','Start (codepoint)','End (codepoint)','Quotation','Status','Memo','Selection kind','Recording key','Start (seconds)','End (seconds)','Alignment status'],...eligibleAnalyticalCodings(state).map(c=>[documents.get(c.documentId)?.name,codes.get(c.codeId)?.name,c.coder,c.start,c.end,c.text,c.status,c.memo,c.kind||'text',c.recordingKey||documents.get(c.documentId)?.mediaKey||'',c.kind==='media'?c.timeStart:'',c.kind==='media'?c.timeEnd:'',documents.get(c.documentId)?.alignment?.status||'unbound'])]);
}
