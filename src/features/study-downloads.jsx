import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import './study-downloads.css';

const size=n=>n==null?'':n<1048576?Math.max(1,Math.round(n/1024))+' KB':(n/1048576).toLocaleString(undefined,{maximumFractionDigits:1})+' MB';

/** Owner-only complete-study download: one study ZIP, plus each recording as its own resumable file. */
export function StudyDownloads({projectId}){
 const [list,setList]=useState(null),[error,setError]=useState(''),base='/api/projects/'+projectId+'/archive';
 useEffect(()=>{let live=true;api('/projects/'+projectId+'/archive/media').then(r=>live&&setList(r),e=>live&&setError(e.message));return ()=>{live=false;};},[projectId]);
 const recordings=list?.recordings||[],missing=recordings.filter(r=>r.missing);
 return <section className="study-downloads"><h3>Download all saved work</h3><p>Both interviews and all saved analysis, speaker estimates, consent decisions, review history, full recovery copies and retained processing results. These downloads stream directly to your device.</p>
  <a href={base+(recordings.length&&!missing.length?'?media=separate':'')}>Download study ZIP{recordings.length&&!missing.length?' (lists recordings below)':''}</a>
  {recordings.length>0&&<><h4>Recordings · {recordings.length} file{recordings.length===1?'':'s'}{list.totalBytes?' · '+size(list.totalBytes):''}</h4><ol className="study-recordings">{recordings.map(r=><li key={r.n}>{r.missing?<span className="study-recording-missing">{r.name} · missing from project storage</span>:<a href={r.download} download={r.filename}><span>{r.filename}</span><small>{size(r.size)}</small></a>}</li>)}</ol>
  <p>Each recording downloads separately with its exact size, so an interrupted download shows as failed and can be resumed from your browser’s downloads list. To restore recordings later, import the study ZIP and select its recording files together with it.</p></>}
  {missing.length>0&&<p role="alert">{missing.length} referenced recording{missing.length===1?' is':'s are'} missing from project storage. The study ZIP above does not list recordings until they are restored.</p>}
  {error&&<p role="alert">Recording list unavailable: {error}</p>}
  {recordings.length>0&&!missing.length&&<a className="secondary" href={base}>Download study ZIP without the recording list</a>}
  <p>The study ZIP lists every entry first (EXPORT-SCOPE.json) and has an exact size. If a download stops early, importing it still opens the saved project and names what is missing.</p></section>;
}
