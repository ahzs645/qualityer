import React,{useEffect,useState} from 'react';
import {api} from '../services/api.js';
import './study-downloads.css';

const size=n=>n==null?'':n<1e6?Math.max(1,Math.round(n/1e3))+' kB':(n/1e6).toLocaleString(undefined,{maximumFractionDigits:1})+' MB';

/** Owner-only complete-study download: one study ZIP, plus each recording as its own resumable file. */
export function StudyDownloads({projectId}){
 const [list,setList]=useState(null),[error,setError]=useState(''),base='/api/projects/'+projectId+'/archive';
 useEffect(()=>{let live=true;api('/projects/'+projectId+'/archive/media').then(r=>live&&setList(r),e=>live&&setError(e.message));return ()=>{live=false;};},[projectId]);
 const recordings=list?.recordings||[],missing=recordings.filter(r=>r.missing),available=recordings.filter(r=>!r.missing);
 return <section className="study-downloads"><h3>Download all saved work</h3><p>Both interviews and all saved analysis, speaker estimates, consent decisions, review history, the most recent recovery copies (older ones stay on the server and are listed in the ZIP) and retained processing results. These downloads stream directly to your device.</p>
  <a href={base+(available.length?'?media=separate':'')}>Download study ZIP{available.length?' (lists '+(missing.length?'the available ':'')+'recordings below)':''}</a>
  {recordings.length>0&&<><h4>Recordings · {available.length} available{missing.length?' · '+missing.length+' missing':''}{list.totalBytes?' · '+size(list.totalBytes):''}</h4><ol className="study-recordings">{recordings.map(r=><li key={r.n}>{r.missing?<span className="study-recording-missing">{r.name} · missing from project storage</span>:<a href={r.download} download={r.filename}><span>{r.filename}</span><small>{size(r.size)}</small></a>}</li>)}</ol>
  <p>Each recording downloads separately with its exact size, so an interrupted download shows as failed and can be resumed from your browser’s downloads list. To restore recordings later, import the study ZIP and select its recording files together with it.</p></>}
  {missing.length>0&&<p role="alert">{missing.length} referenced recording{missing.length===1?' is':'s are'} missing from project storage. The study ZIP names {missing.length===1?'it':'them'} as missing{available.length?' and lists the '+available.length+' available recording'+(available.length===1?'':'s')+' for separate download':''}.</p>}
  {error&&<p role="alert">Recording list unavailable: {error}</p>}
  {available.length>0&&<a className="secondary" href={base}>Download study ZIP without the recording list</a>}
  <p>The study ZIP lists every entry first (EXPORT-SCOPE.json) and has an exact size. If a download stops early, importing it still opens the saved project and names what is missing.</p></section>;
}
