import React from 'react';
import {MemoReferences} from './memo-references.jsx';
const label=key=>key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/^./,s=>s.toUpperCase());
function JournalValue({value,depth=0}){
 if(value==null)return null;if(typeof value!=='object')return <p>{typeof value==='boolean'?(value?'Yes':'No'):String(value)}</p>;
 if(depth>=5)return <p>Additional structured notes are retained in the project export.</p>;
 if(Array.isArray(value))return <ul>{value.map((item,i)=><li key={i}><JournalValue value={item} depth={depth+1}/></li>)}</ul>;
 return <dl>{Object.entries(value).map(([key,item])=><React.Fragment key={key}><dt>{label(key)}</dt><dd><JournalValue value={item} depth={depth+1}/></dd></React.Fragment>)}</dl>;
}
export function ReadableJournal({state,content,onNavigate}){
 let data;try{data=JSON.parse(content);}catch{}
 if(!data||typeof data!=='object'||Array.isArray(data))return <p className="memo-text"><MemoReferences state={state} content={content} onNavigate={onNavigate}/></p>;
 const known=['method','scope','negativeCases','reviewLimits','revisionHistory'],keys=known.filter(key=>data[key]!=null);
 return <div className="readable-journal">{(keys.length?keys:Object.keys(data)).map((key,i)=><details key={key} open={i===0}><summary>{label(key)}</summary><JournalValue value={data[key]}/></details>)}</div>;
}
