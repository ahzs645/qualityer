import {readableOn} from '../heatmap-ramp.mjs';
import React,{useEffect,useMemo,useState} from 'react';
import {coderAttributeAgreement,attributeAgreementExportRows} from '../coverage-profile.mjs';
import {knownCoders,coderAttributeNames} from '../coder-attributes.mjs';
import {safeCSV} from '../report-export.mjs';
import {download} from '../exchange.js';
import {TypedAttributes} from './typed-attributes.jsx';
import './coder-attribute-agreement.css';

const number=value=>value==null?'N/A':Number(value.toFixed(2)).toLocaleString();
// Viridis stops (as in Requal's overlap heatmap); text switches to dark on the light end for contrast.
const stops=[[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
function viridis(t){const x=Math.max(0,Math.min(1,t))*(stops.length-1),i=Math.min(stops.length-2,Math.floor(x)),f=x-i;return 'rgb('+stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f)).join(',')+')';}
const shown=value=>value==null?'':typeof value==='boolean'?(value?'True':'False'):String(value);

function CoderAttributeEditor({state,operate,reviewer}){
  const coders=knownCoders(state),names=coderAttributeNames(state),[coder,setCoder]=useState(coders[0]||''),active=coders.includes(coder)?coder:coders[0]||'',saved=state.coderAttributes?.[active];
  const [values,setValues]=useState(saved||{}),[name,setName]=useState(''),[value,setValue]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const savedKey=JSON.stringify(saved||{});useEffect(()=>setValues(saved||{}),[active,savedKey]);useEffect(()=>setMessage(''),[active]);
  async function save(data,done){setBusy(true);setMessage('');try{await operate('attribute.coder',{coder:active,...data});setMessage(done);}catch(e){setMessage(e.message);}finally{setBusy(false);}}
  return <details className="caa-editor" open={!names.length}><summary>Coder attributes <span className="muted">· {Object.keys(state.coderAttributes||{}).length} of {coders.length} saved identities described</span></summary>
    <p className="muted">Describe saved coder identities (for example role, site or training) to group them below. Identities are listed exactly as saved on codings, including AI identities; attributes never rename or merge them. Owners and reviewers can record attributes; define a typed coder attribute under Study structure to enforce number, true/false or date values.</p>
    {!coders.length?<p>No saved coder identities yet.</p>:<><div className="table-wrap"><table className="caa-overview"><thead><tr><th>Coder</th>{names.map(n=><th key={n}>{n}</th>)}</tr></thead><tbody>{coders.map(c=><tr key={c} className={c===active?'selected':''}><th><button type="button" onClick={()=>setCoder(c)} aria-label={'Edit attributes for '+c}>{c}</button></th>{names.map(n=>{const v=state.coderAttributes?.[c]?.[n];return <td key={n} className={v==null?'muted':''}>{v==null?'Not recorded':shown(v)}</td>;})}</tr>)}</tbody></table></div>
    <form className="caa-form" onSubmit={e=>{e.preventDefault();save({attributes:values},'Saved attributes for '+active+'.');}}>
      <label>Coder identity<select aria-label="Coder identity" value={active} onChange={e=>setCoder(e.target.value)}>{coders.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
      <TypedAttributes state={state} scope="coder" values={values} onChange={setValues}/>
      <div className="caa-add"><label>New attribute<input aria-label="New coder attribute name" placeholder="e.g. Role" value={name} onChange={e=>setName(e.target.value)}/></label><label>Value<input aria-label="New coder attribute value" placeholder="e.g. Nurse" value={value} onChange={e=>setValue(e.target.value)}/></label><button type="button" disabled={!name.trim()||!value.trim()} onClick={()=>{setValues({...values,[name.trim()]:value.trim()});setName('');setValue('');}}>Add attribute</button></div>
      <div className="filterbar"><button className="primary" disabled={!reviewer||busy}>Save coder attributes</button><button type="button" disabled={!reviewer||busy||!saved} onClick={()=>save({clear:true},'Cleared attributes for '+active+'.')}>Clear this coder</button>{!reviewer&&<span className="muted">Only owners and reviewers can record coder attributes.</span>}</div>
      {message&&<p role="status">{message}</p>}
    </form></>}
  </details>;
}

function AgreementMatrix({title,profile,cells,selected,onSelect}){
  return <div className="table-wrap"><table className="caa-heatmap"><caption>{title}</caption><thead><tr><th>Group</th>{profile.groups.map(g=><th key={g.label} className={g.recorded?'':'caa-unrecorded'}>{g.label}<small>{g.coders.length} coder{g.coders.length===1?'':'s'}</small></th>)}</tr></thead><tbody>{cells.map((row,i)=><tr key={profile.groups[i].label}><th className={profile.groups[i].recorded?'':'caa-unrecorded'}>{profile.groups[i].label}</th>{row.map(cell=>{const on=selected===cell,dark=cell.agreement!=null&&cell.agreement<.6;return <td key={cell.columnGroup} className={(cell.agreement==null?'caa-na ':'')+(on?'caa-on':'')} style={cell.agreement==null?undefined:{background:viridis(cell.agreement),color:readableOn(viridis(cell.agreement))}}><button type="button" aria-pressed={on} aria-label={`${cell.rowGroup} versus ${cell.columnGroup} (${cell.kind}-group): agreement ${number(cell.agreement)}, ${cell.intersection} of ${cell.union} ${profile.unit}, ${cell.pairCount} coder pairs, ${cell.sourceCount} sources`} onClick={()=>onSelect(on?null:cell)}><strong>{number(cell.agreement)}</strong><small>{cell.intersection.toLocaleString()} / {cell.union.toLocaleString()}</small><small>{cell.pairCount} pair{cell.pairCount===1?'':'s'} · {cell.sourceCount} src</small></button></td>;})}</tr>)}</tbody></table></div>;
}

export function CoderAttributeAgreement({state,filters,scope,onDrill,operate,reviewer}){
  const names=coderAttributeNames(state),[attribute,setAttribute]=useState(''),[unit,setUnit]=useState('codepoints'),[byCode,setByCode]=useState(false),[selected,setSelected]=useState(null),active=names.includes(attribute)?attribute:names[0]||'';
  const profile=useMemo(()=>coderAttributeAgreement(state,filters,{attribute:active,unit,byCode}),[state,filters,active,unit,byCode]);
  useEffect(()=>setSelected(null),[profile]);
  const unitLabel=unit==='segments'?'shared units / all units':'codepoints';
  return <section className="coder-attribute-agreement">
    <CoderAttributeEditor state={state} operate={operate} reviewer={reviewer}/>
    <h2>Agreement by coder attribute</h2><p className="muted">{profile.method}</p>
    <div className="filterbar"><label>Coder attribute<select aria-label="Agreement coder attribute" value={active} onChange={e=>setAttribute(e.target.value)} disabled={!names.length}>{!names.length&&<option value="">No coder attributes recorded</option>}{names.map(n=><option key={n} value={n}>{n}</option>)}</select></label><label>Unit<select aria-label="Agreement unit" value={unit} onChange={e=>setUnit(e.target.value)}><option value="codepoints">Codepoints</option><option value="segments">Segments</option></select></label><label className="caa-check"><input type="checkbox" checked={byCode} onChange={e=>setByCode(e.target.checked)}/> Split by code</label><button disabled={!active} onClick={()=>download('coder-attribute-agreement.csv',safeCSV(attributeAgreementExportRows(profile,{scope})),'text/csv')}>Export agreement CSV</button></div>
    {!active?<p>Record at least one coder attribute above to group coder pairs.</p>:profile.coders.length<2?<p>At least two coder identities with eligible text coding are needed in this scope.</p>:<>
      <p className="muted">{profile.coders.length} coder identities · {profile.pairCount} coder pairs · grouped by <strong>{active}</strong>. Diagonal cells compare coders within one value; off-diagonal cells compare coders across values. N/A means no coder pair with coded text in that cell. Select a cell for its contributing coder pairs.</p>
      <AgreementMatrix title={`All codes · ${unitLabel}`} profile={profile} cells={profile.cells} selected={selected} onSelect={setSelected}/>
      {byCode&&profile.codes.map(code=><AgreementMatrix key={code.codeId} title={`${code.codeName} · ${unitLabel}`} profile={profile} cells={code.cells} selected={selected} onSelect={setSelected}/>)}
      {selected&&<div className="caa-detail" aria-live="polite"><h3>{selected.rowGroup} ↔ {selected.columnGroup} · {selected.kind}-group · {number(selected.agreement)}</h3><p className="muted">{selected.pairCount} of {selected.possiblePairs} possible coder pairs contribute coded text; {selected.sourceCount} source{selected.sourceCount===1?'':'s'}{selected.sources.length?': '+selected.sources.join(', '):''}.</p>{selected.coderPairs.length>0&&<div className="table-wrap"><table><thead><tr><th>Coder A</th><th>Coder B</th><th>Intersection</th><th>Union</th><th>Agreement</th><th>Evidence</th></tr></thead><tbody>{selected.coderPairs.map(p=><tr key={p.a+'\u0000'+p.b}><th>{p.a}<small>{p.groupA}</small></th><th>{p.b}<small>{p.groupB}</small></th><td>{p.intersection.toLocaleString()}</td><td>{p.union.toLocaleString()}</td><td>{number(p.agreement)}</td><td><button type="button" onClick={()=>{const keys=new Set(p.dimensions.map(d=>d.documentId+'\u0000'+d.codeId));onDrill(p.a+' ↔ '+p.b+' · '+active+' · '+number(p.agreement),selected.rows.filter(r=>(r.coder===p.a||r.coder===p.b)&&keys.has(r.documentId+'\u0000'+r.codeId)));}}>Read</button></td></tr>)}</tbody></table></div>}<div className="filterbar"><button type="button" onClick={()=>onDrill(selected.rowGroup+' ↔ '+selected.columnGroup+' · '+active,selected.rows)} disabled={!selected.rows.length}>Read all evidence in this cell</button><button type="button" onClick={()=>setSelected(null)}>Close</button></div></div>}
    </>}
  </section>;
}
