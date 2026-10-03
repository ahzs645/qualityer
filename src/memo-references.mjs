const lists={code:'codes',source:'documents',case:'cases',memo:'memos'};
const points=s=>Array.from(String(s||''));
export function referenceToken(kind,id){if(!Object.hasOwn(lists,kind)||!String(id).length||points(id).length>200)throw Error('Choose an existing record reference.');return '@'+kind+'{'+encodeURIComponent(String(id))+'}';}
export function tokenizeMemo(content){
 const text=String(content||''),parts=[],pattern=/@(code|source|case|memo)\{([^{}\s]{1,2400})\}/gu;let cursor=0,offset=0;
 for(const match of text.matchAll(pattern)){let id;try{id=decodeURIComponent(match[2]);}catch{continue;}if(!id||points(id).length>200)continue;
  const before=text.slice(cursor,match.index);if(before){const length=points(before).length;parts.push({kind:'text',text:before,start:offset,end:offset+length});offset+=length;}
  const length=points(match[0]).length;parts.push({kind:'reference',referenceKind:match[1],id,text:match[0],start:offset,end:offset+length});offset+=length;cursor=match.index+match[0].length;
 }if(cursor<text.length||!parts.length)parts.push({kind:'text',text:text.slice(cursor),start:offset,end:offset+points(text.slice(cursor)).length});return parts;
}
export function resolveMemoReference(s,kind,id,{actor,blind=false}={}){
 if(!Object.hasOwn(lists,kind))return {kind,id,available:false,label:'Unsupported reference'};
 const record=(s[lists[kind]]||[]).find(r=>String(r.id)===String(id));
 if(!record||record.deletedAt||kind==='memo'&&blind&&record.author!==actor)return {kind,id,available:false,label:'Unavailable '+kind+' reference'};
 return {kind,id:String(id),available:true,label:String(record.name||record.title||kind),archived:!!record.archivedAt,record};
}
export function memoReferenceOptions(s){return Object.entries(lists).flatMap(([kind,list])=>(s[list]||[]).filter(r=>!r.deletedAt).map(r=>({kind,id:String(r.id),label:String(r.name||r.title||kind),archived:!!r.archivedAt})));}
export function memoReferenceMetadata(s,content,actor,role){const blind=s.settings?.teamAccess?.blindCoding===true&&role==='coder';return tokenizeMemo(content).filter(p=>p.kind==='reference').map(p=>{const resolved=resolveMemoReference(s,p.referenceKind,p.id,{actor,blind});return {kind:p.referenceKind,id:p.id,start:p.start,end:p.end,token:p.text,labelAtSave:resolved.label,availableAtSave:resolved.available};});}
export function insertMemoReference(text,kind,id,cursor){const token=referenceToken(kind,id),content=String(text||'');let at=Number.isInteger(cursor)?Math.max(0,Math.min(content.length,cursor)):content.length;if(at>0&&at<content.length&&/[\uD800-\uDBFF]/.test(content[at-1])&&/[\uDC00-\uDFFF]/.test(content[at]))at++;return {content:content.slice(0,at)+token+content.slice(at),cursor:at+token.length};}
