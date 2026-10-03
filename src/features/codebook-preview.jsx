import React,{useMemo,useState} from 'react';
import {previewCodebookCSV} from '../codebook-csv.mjs';
import {Modal} from '../components/ui.jsx';

export function CodebookPreview({state,source,onImport,onClose}) {
 const [separator,setSeparator]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const preview=useMemo(()=>{try{if(source.csv===undefined&&(!Array.isArray(source.codes)||source.codes.some(c=>!c||typeof c.id!=='string'||typeof c.name!=='string'||!c.name.trim())))throw Error('A JSON codebook must contain an array of code definitions with IDs and names.');return source.csv!==undefined?previewCodebookCSV(source.csv,state,{separator:separator||null}):{codes:source.codes,entries:source.codes,errors:[],warnings:[]};}catch(e){return {codes:[],entries:[],errors:[{message:e.message}],warnings:[]};}},[state,source,separator]);
 return <Modal title="Preview codebook import" wide onClose={()=>{if(!busy)onClose();}}><p>{source.name} · {preview.codes.length} new definitions. Existing coding stays linked to its current codebook.</p>
 {source.csv!==undefined&&<label className="field"><span>CSV path interpretation</span><select aria-label="CSV hierarchy interpretation" disabled={busy} value={separator} onChange={e=>setSeparator(e.target.value)}><option value="">Literal Taguette tag names</option><option value=" / ">Hierarchy separated by spaced slash</option><option value="/">Hierarchy separated by slash</option><option value=".">Hierarchy separated by dot</option></select></label>}
 {preview.errors.map((e,i)=><p className="error" role="alert" key={i}>{e.row?'Row '+e.row+': ':''}{e.message}</p>)}
 {preview.warnings.map((w,i)=><p className="muted" key={i}>{w}</p>)}
 <div className="table-wrap"><table><thead><tr><th>Code / path</th><th>Definition</th><th>Action</th></tr></thead><tbody>{preview.entries.slice(0,200).map((c,i)=><tr key={c.id+':'+i}><td>{c.path||c.name}</td><td>{c.description}</td><td>{c.existing?'Keep existing':c.codable===false?'Create category code':'Create code'}</td></tr>)}</tbody></table></div>{preview.entries.length>200&&<p>Showing the first 200 definitions; import includes all previewed definitions.</p>}
 {error&&<p role="alert" className="error">{error}</p>}<footer><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!!preview.errors.length||!preview.codes.length} onClick={async()=>{setBusy(true);setError('');try{await onImport(preview.codes);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{busy?'Importing…':'Import codebook'}</button></footer></Modal>;
}
