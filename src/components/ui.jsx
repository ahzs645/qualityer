import React,{useState,useEffect,useRef,useId} from 'react';
import {Files,X,Sparkles} from 'lucide-react';
export const time=n=>new Date(n).toLocaleString();
export const fmt=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(Math.floor(n%60)).padStart(2,'0');
export function IconButton({icon:Icon,label,onClick,...rest}){return <button className="icon-button" aria-label={label} title={label} onClick={onClick} {...rest}><Icon size={17}/></button>}
export function PlayIcon(){return <Sparkles size={17}/>;}
export function Badge({children,type=''}){return <span className={'badge '+type}>{children}</span>}
export function Empty({icon:Icon=Files,title,children,action}){return <div className="empty"><Icon size={32}/><h3>{title}</h3><p>{children}</p>{action}</div>}
export function Modal({title,children,onClose,wide=false}){
 const ref=useRef(null),close=useRef(onClose),titleId=useId();close.current=onClose;
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;
 const controls=()=>Array.from(dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
 (controls()[0]||dialog).focus();
 const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close.current();}if(e.key==='Tab'){const list=controls(),first=list[0]||dialog,last=list.at(-1)||dialog;if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}}};
 dialog.addEventListener('keydown',key);return()=>{dialog.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};},[]);
 return <div className="modal-shade" onClick={onClose}><section ref={ref} tabIndex={-1} className={'modal '+(wide?'wide':'')} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e=>e.stopPropagation()}><header><h2 id={titleId}>{title}</h2><IconButton icon={X} label="Close dialog" onClick={onClose}/></header>{children}</section></div>;
}
export function Field({label,children}){return <label className="field"><span>{label}</span>{children}</label>}
export function FormModal({title,fields,initial={},onSave,onClose,wide=false,help}){const [data,set]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState('');return <Modal title={title} onClose={onClose} wide={wide}><form onSubmit={async e=>{e.preventDefault();setBusy(true);try{await onSave(data);onClose();}catch(e){setError(e.message);}finally{setBusy(false);}}}>{help&&<p className="muted">{help}</p>}{fields.map(f=><Field label={f.label} key={f.key}>{f.options?<select value={data[f.key]??''} onChange={e=>set({...data,[f.key]:e.target.value})}>{f.options.map(o=><option value={typeof o==='string'?o:o.value} key={typeof o==='string'?o:o.value}>{typeof o==='string'?o:o.label}</option>)}</select>:f.textarea?<textarea rows={f.rows||6} value={data[f.key]??''} onChange={e=>set({...data,[f.key]:e.target.value})}/>:<input type={f.type||'text'} required={f.required} value={data[f.key]??''} onChange={e=>set({...data,[f.key]:e.target.value})}/>}</Field>)}{error&&<p className="error">{error}</p>}<footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save'}</button></footer></form></Modal>}
