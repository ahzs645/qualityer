import React,{useMemo} from 'react';
import {relationPairEvidence,relationEvidenceRows} from '../relation-evidence.mjs';
import {safeCSV} from '../report-export.mjs';
import {download} from '../exchange.js';
export function RelationPairEvidence({state,pairs,scope}){
  const rows=useMemo(()=>relationPairEvidence(state,pairs),[state,pairs]);
  if(!pairs)return null;
  return <section><h2>Selection distances and overlap context</h2><p className="muted">Each row describes an application pair on the same source. Text distances use Unicode codepoints; recording distances use seconds on the current recording. Overlapping text is split into before/shared/after portions; uncoded gaps are omitted. These pairs are not independent observations.</p><button onClick={()=>download('selection-relation-evidence.csv',safeCSV(relationEvidenceRows(rows,{scope})),'text/csv')}>Export relation distances CSV</button><div className="table-wrap"><table><thead><tr><th>Codes</th><th>Source</th><th>Relation</th><th>Unit</th><th>Gap</th><th>Overlap</th><th>Union</th><th>Excerpt context</th></tr></thead><tbody>{rows.slice(0,100).map((e,i)=><tr key={e.leftId+':'+e.rightId+':'+i}><td>{e.leftCode} ↔ {e.rightCode}</td><td>{e.source}</td><td>{e.relation}</td><td>{e.unit}</td><td>{e.distance}</td><td>{e.overlap}</td><td>{e.union}</td><td>{e.shared?<details><summary>Read before / shared / after</summary><p>{e.before}<mark>{e.shared}</mark>{e.after}</p></details>:e.contextBasis}</td></tr>)}</tbody></table></div>{rows.length>100&&<p>First 100 pairs shown; export includes all {rows.length} valid pairs.</p>}{!rows.length&&<p>No current text or recording pairs are eligible for interval detail in this selection.</p>}</section>;
}
