import React,{useMemo,useState} from 'react';
import {codeSummary,sourceSummary,codeTextGrid,transposeGrid,codeSummaryTable,sourceSummaryTable,codeTextGridTable} from '../code-summary.mjs';
import {safeCSV,xlsx} from '../report-export.mjs';
import {download} from '../exchange.js';
import './code-summary.css';

const XLSX_TYPE='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const num=n=>Number(n).toLocaleString(undefined,{maximumFractionDigits:1});

/** Per-code and per-source statistics for the current workbench scope. */
export function CodeSummary({state:s,rows,scope,onDrill}){
 const [sort,setSort]=useState('excerpts'),codes=useMemo(()=>{const list=codeSummary(s,rows);return sort==='name'?[...list].sort((a,b)=>a.code.name.localeCompare(b.code.name)):[...list].sort((a,b)=>b[sort]-a[sort]);},[s,rows,sort]),sources=useMemo(()=>sourceSummary(s,rows),[s,rows]);
 const codeTable=codeSummaryTable(codes),sourceTable=sourceSummaryTable(sources);
 return <section className="code-summary" aria-label="Code and source summary statistics">
  <p className="muted">Counts describe the coding decisions in the current scope. They do not measure how important or common a theme is in the interviews. “Coded codepoints” count overlapping selections once within each source; parent and child codes may overlap, so rows are not additive.</p>
  <h2>Codes</h2>
  <div className="filterbar"><label>Sort by<select aria-label="Sort code summary" value={sort} onChange={e=>setSort(e.target.value)}><option value="excerpts">Distinct excerpts</option><option value="applications">Applications</option><option value="codepoints">Coded codepoints</option><option value="name">Name (A–Z)</option></select></label><button onClick={()=>download('code-summary.csv',safeCSV(codeTable),'text/csv')}>Export code summary CSV</button><button onClick={()=>download('code-summary.xlsx',xlsx(codeTable),XLSX_TYPE)}>Export code summary XLSX</button></div>
  <div className="table-wrap"><table><caption className="sr-only">Summary statistics for each code in the current scope</caption><thead><tr>{codeTable[0].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{codes.map(r=><tr key={r.code.id}><th scope="row"><button onClick={()=>onDrill(r.code.name,rows.filter(x=>x.codeId===r.code.id))} disabled={!r.applications}>{r.code.name}</button></th><td>{r.applications}</td><td>{r.excerpts}</td><td>{r.sources}</td><td>{r.cases}</td><td>{r.coders.join(', ')||'—'}</td><td>{r.codepoints.toLocaleString()}</td><td>{num(r.meanCodepoints)}</td><td>{r.accepted}</td><td>{r.provisional}</td><td>{r.flagged}</td></tr>)}</tbody></table></div>
  <h2>Sources</h2>
  <div className="filterbar"><button onClick={()=>download('source-summary.csv',safeCSV(sourceTable),'text/csv')}>Export source summary CSV</button><button onClick={()=>download('source-summary.xlsx',xlsx(sourceTable),XLSX_TYPE)}>Export source summary XLSX</button></div>
  <div className="table-wrap"><table><caption className="sr-only">Summary statistics for each interview source in the current scope</caption><thead><tr>{sourceTable[0].map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{sources.map(r=><tr key={r.source.id}><th scope="row"><button onClick={()=>onDrill(r.source.name,rows.filter(x=>x.documentId===r.source.id))} disabled={!r.applications}>{r.source.name}</button></th><td>{r.applications}</td><td>{r.excerpts}</td><td>{r.codes}</td><td>{r.coders.join(', ')||'—'}</td><td>{r.codepoints.toLocaleString()}</td><td>{r.total.toLocaleString()}</td><td>{num(r.percent)}%</td></tr>)}</tbody></table></div>
  <p className="muted">Scope: {scope}</p>
 </section>;
}

/** Code × case (or source) grid showing the coded text itself, for cross-case reading. */
export function CodeTextGrid({state:s,rows,jump,scope}){
 const [group,setGroup]=useState((s.cases||[]).length?'case':'source'),[hideEmpty,setHideEmpty]=useState(true),[transpose,setTranspose]=useState(false),
  base=useMemo(()=>codeTextGrid(s,rows,{group,hideEmpty}),[s,rows,group,hideEmpty]),grid=transpose?transposeGrid(base):base,table=codeTextGridTable(grid);
 const open=q=>jump&&jump({documentId:q.documentId,start:q.start,end:q.end});
 return <section className="code-text-grid" aria-label="Coded text by code and case">
  <p className="muted">Each cell lists the distinct coded quotations for that code in that {group}. A quotation coded by several coders appears once. Withheld, stale and removed coding is excluded by the filters above. Quotations are shown in full, so review consent before sharing an export.</p>
  <div className="filterbar"><label>Columns<select aria-label="Grid columns" value={group} onChange={e=>setGroup(e.target.value)}><option value="case">Cases</option><option value="source">Sources</option></select></label><label><input type="checkbox" checked={hideEmpty} onChange={e=>setHideEmpty(e.target.checked)}/> Hide empty codes and columns</label><label><input type="checkbox" checked={transpose} onChange={e=>setTranspose(e.target.checked)}/> Swap rows and columns</label><button onClick={()=>download('code-text-grid.csv',safeCSV(table),'text/csv')}>Export grid CSV</button><button onClick={()=>download('code-text-grid.xlsx',xlsx(table),XLSX_TYPE)}>Export grid XLSX</button></div>
  {group==='case'&&!(s.cases||[]).length&&<p className="viz-empty" role="status">This study has no cases yet. Create cases to compare accounts, or switch the columns to Sources.</p>}
  {base.uncased>0&&<p className="muted" role="status">{base.uncased} coded application{base.uncased===1?' is':'s are'} outside every case and not shown in this grid.</p>}
  {grid.rows.length?<div className="table-wrap"><table className="text-grid"><caption className="sr-only">Coded quotations by {transpose?'case or source and code':'code and case or source'}</caption><thead><tr><th scope="col">{transpose?'Case / source':'Code'}</th>{grid.columns.map(c=><th key={c.id} scope="col">{c.name}</th>)}</tr></thead><tbody>{grid.rows.map(r=><tr key={r.code?.id??r.column.id}><th scope="row">{r.code?.name??r.column.name}</th>{r.cells.map(c=><td key={c.column.id}>{c.quotations.length?<ul>{c.quotations.map(q=><li key={q.key}><button onClick={()=>open(q)} title="Open exact quotation in the transcript">{q.text.length>240?q.text.slice(0,239)+'…':q.text}</button><small>{q.coders.join(', ')}</small></li>)}</ul>:<span aria-label="No coded text">·</span>}</td>)}</tr>)}</tbody></table></div>:<p className="viz-empty" role="status">No coded text in this scope.</p>}
  <p className="muted">Scope: {scope}</p>
 </section>;
}
