import React,{useMemo,useState} from 'react';
import {lexicalConsistency,consistencyTasks,codeExcerpts,MIN_EXCERPTS} from '../consistency-check.mjs';
import {STOPWORD_LANGUAGES} from '../stopwords.mjs';
import {safeCSV} from '../report-export.mjs';
import {download} from '../exchange.js';
import {uid} from '../domain.mjs';

/** Per-code consistency screening that runs locally; flagged excerpts can be sent to the processing desk. */
export function CodeConsistency({state:s,rows,scope,jump,operate,canWrite}){
 const candidates=useMemo(()=>s.codes.filter(c=>c.codable!==false).map(code=>({code,n:codeExcerpts(rows,code.id).length})).filter(x=>x.n>0).sort((a,b)=>b.n-a.n),[s.codes,rows]);
 const [codeId,setCodeId]=useState(''),[language,setLanguage]=useState('en'),[showAll,setShowAll]=useState(false),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const active=candidates.find(c=>c.code.id===codeId)||candidates.find(c=>c.n>=MIN_EXCERPTS)||candidates[0],code=active?.code;
 const result=useMemo(()=>code?lexicalConsistency(rows,code.id,{language}):null,[rows,code,language]);
 const shown=result?(showAll?result.excerpts:result.flagged):[];
 const name=id=>s.documents.find(d=>d.id===id)?.name||id;
 async function send(){setBusy(true);setMessage('');try{const tasks=consistencyTasks(result,code,{uid,language});await operate('reviewTasks.add',{runId:uid(),name:'Lexical consistency · '+code.name,method:result.method,tasks});setMessage(tasks.length+' review task'+(tasks.length===1?'':'s')+' added to the processing desk. Nothing was recoded.');}catch(e){setMessage(e.message);}finally{setBusy(false);}}
 function exportCSV(){download('code-consistency-'+code.name.replace(/[^\w-]+/g,'-')+'.csv',safeCSV([['Code','Source','Start (codepoint)','End (codepoint)','Similarity','Cutoff','Flagged','Short excerpt','Distinctive words','Common code words it lacks','Coders','Quotation'],...result.excerpts.map(e=>[code.name,name(e.documentId),e.start,e.end,Number(e.score.toFixed(4)),result.cutoff==null?'':Number(result.cutoff.toFixed(4)),e.flagged?'yes':'no',e.short?'yes':'no',e.ownTerms.join('; '),e.missingTerms.join('; '),e.coders.join('; '),e.text])]),'text/csv');}
 if(!candidates.length)return <p className="viz-empty" role="status">No coded text in this scope.</p>;
 return <section className="code-consistency" aria-label="Code consistency check">
  <div className="callout">This check runs in your browser and compares the <strong>words</strong> each excerpt uses with the other excerpts of the same code. An unusual excerpt is a reading prompt: it may be miscoded, a distinct sub-theme, or simply worded differently. It does not understand meaning. For meaning-level checks, a connected embedding or language model can run the semantic outlier and consistency reviews under <em>Team, services &amp; examples → AI review</em>.</div>
  <div className="filterbar"><label>Code<select aria-label="Consistency code" value={code?.id||''} onChange={e=>{setCodeId(e.target.value);setMessage('');}}>{candidates.map(c=><option key={c.code.id} value={c.code.id} disabled={c.n<MIN_EXCERPTS}>{c.code.name} · {c.n} excerpt{c.n===1?'':'s'}{c.n<MIN_EXCERPTS?' (too few)':''}</option>)}</select></label><label>Stop list<select aria-label="Consistency stop list" value={language} onChange={e=>setLanguage(e.target.value)}>{STOPWORD_LANGUAGES.map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/> Show every excerpt, least typical first</label>{result?.excerpts.length>0&&<button onClick={exportCSV}>Export check CSV</button>}{canWrite&&result?.flagged.length>0&&<button className="primary" disabled={busy} onClick={send}>Send {result.flagged.length} flagged excerpt{result.flagged.length===1?'':'s'} to the processing desk</button>}</div>
  {result&&<p role="status">{result.reason||(result.n+' distinct excerpts compared. '+(result.flagged.length?result.flagged.length+' fall below the cutoff of '+result.cutoff.toFixed(3)+'.':'None fall below the cutoff of '+result.cutoff.toFixed(3)+'; the excerpts use similar vocabulary.'))}</p>}
  {message&&<p className="notice" role="status">{message}</p>}
  <ol className="consistency-list">{shown.map(e=><li key={e.key} className={e.flagged?'flagged':''}><div className="consistency-score"><span className="consistency-bar" aria-hidden="true"><i style={{width:Math.max(2,Math.round(e.score*100))+'%'}}/></span><strong>{e.score.toFixed(3)}</strong>{e.flagged&&<span className="badge warning">Below cutoff</span>}{e.short&&<span className="badge">Short excerpt</span>}</div><button className="quote-link" onClick={()=>jump({documentId:e.documentId,start:e.start,end:e.end,text:e.text})}>{e.text.length>400?e.text.slice(0,399)+'…':e.text}</button><small>{name(e.documentId)} · codepoints {e.start}–{e.end} · {e.coders.join(', ')}</small>{(e.ownTerms.length>0||e.missingTerms.length>0)&&<small>{e.ownTerms.length>0&&<>Distinctive words: {e.ownTerms.join(', ')}. </>}{e.missingTerms.length>0&&<>Common code words it lacks: {e.missingTerms.join(', ')}.</>}</small>}</li>)}</ol>
  {result&&!showAll&&!result.flagged.length&&result.excerpts.length>0&&<p className="muted">Tick “Show every excerpt” to read them from least to most typical.</p>}
  <details><summary>Method</summary><p className="muted">{result?.method}</p><p className="muted">Scope: {scope}</p></details>
 </section>;
}
