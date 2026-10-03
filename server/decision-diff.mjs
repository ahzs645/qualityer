// Bounded previews supplement the complete revision snapshots; they never replace them.
export const DECISION_DIFF_MAX_BYTES=4096;
const encoder=new TextEncoder();
const bytes=x=>encoder.encode(JSON.stringify(x)).byteLength;
const sensitive=/token|password|secret|api.?key|authorization|credential|connection/i;
const fields={
 documents:['name','text','revision','sourceRole','reviewStatus','attributes','excludeAI','direction','mediaKey','mediaType','alignment','turns','speakerMappings'],
 codings:['documentId','codeId','start','end','text','kind','timeStart','timeEnd','recordingKey','mediaKey','region','coder','status','sourceRevision','memo','reviewer','reviewNote','deletedAt','deletedBy'],
 codes:['name','description','parentId','categoryId','color','codable','order','archivedAt'],
 memos:['title','content','documentId','codeId','caseId','start','end','sourceRevision','author','modifiedBy','citations'],
 cases:['name','documentIds','attributes','passages'],categories:['name','parentId','memo','order']
};
function equal(a,b){if(Object.is(a,b))return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const ak=Object.keys(a),bk=Object.keys(b);if(ak.length!==bk.length)return false;return ak.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));}
function clip(text,limit=160,start=0){let a=Math.max(0,Math.min(text.length,start)),b=Math.min(text.length,a+limit);if(a&&/^[\uDC00-\uDFFF]$/.test(text[a]))a--;if(b<text.length&&/^[\uDC00-\uDFFF]$/.test(text[b]))b--;return {value:text.slice(a,b),truncated:a>0||b<text.length,startUTF16:a,totalUTF16:text.length};}
function snapshot(value,present,focus=0){if(!present)return {present:false};let truncated=false;const visit=(v,depth=0)=>{if(v===undefined)return null;if(typeof v==='string'){const p=clip(v,160,depth===0?focus:0);truncated||=p.truncated;return p.truncated?{preview:p.value,truncated:true,startUTF16:p.startUTF16,totalUTF16:p.totalUTF16}:p.value;}if(v===null||typeof v!=='object')return v;if(depth>=4){truncated=true;return {preview:'Nested value omitted',truncated:true};}const keys=Object.keys(v);if(keys.length>12)truncated=true;if(Array.isArray(v))return keys.slice(0,12).map(k=>visit(v[k],depth+1));const out={};for(const key of keys.slice(0,12)){if(sensitive.test(key)){out[key]='[redacted]';truncated=true;}else out[key]=visit(v[key],depth+1);}return out;};const out={present:true,value:visit(value)};if(truncated){out.truncated=true;if(Array.isArray(value))out.totalItems=value.length;else if(value&&typeof value==='object')out.totalKeys=Object.keys(value).length;}if(bytes(out)>900)return {present:true,preview:'Structured value exceeds audit preview budget',truncated:true,...(Array.isArray(value)?{totalItems:value.length}:{})};return out;}
const label=r=>r?.name||r?.title||r?.documentId||r?.id||'';
function focusFor(a,b){if(typeof a!=='string'||typeof b!=='string')return 0;let i=0;while(i<a.length&&i<b.length&&a[i]===b[i])i++;return Math.max(0,i-50);}
export function decisionDiff(before,after,operation){
 const type=String(operation?.type||'');
 // Configuration and unknown operations must not copy service credentials into audit rows.
 if(type.length>100||!/^(coding\.|code\.|codebook\.|source\.|memo\.|case\.|category\.|hierarchy\.|query\.|autocoding\.|reviewTask\.|reviewTasks\.|review\.example|suggestion\.)/.test(type))return null;
 const out={version:1,operation:type,targets:[],changedTargets:0,omittedTargets:0,boundedPreview:true};
 const primary=type.startsWith('code')?'codes':type.startsWith('memo')?'memos':type.startsWith('case')?'cases':'documents';
 const collections=[primary,...Object.keys(fields).filter(k=>k!==primary)];
 for(const collection of collections){const old=new Map((before?.[collection]||[]).map(r=>[String(r.id),r])),next=new Map((after?.[collection]||[]).map(r=>[String(r.id),r]));const ids=[...new Set([...old.keys(),...next.keys()])];if(operation.data?.id!=null)ids.sort((a,b)=>(b===String(operation.data.id))-(a===String(operation.data.id)));
  for(const id of ids){const a=old.get(id),b=next.get(id),changed=fields[collection].filter(key=>!!a!==!!b||Object.hasOwn(a||{},key)!==Object.hasOwn(b||{},key)||!equal(a?.[key],b?.[key]));if(!changed.length)continue;out.changedTargets++;
   const target={collection,id,change:!a?'created':!b?'removed':'updated',label:clip(String(label(b||a)),80).value,fields:[],omittedFields:0};
   const rev={before:a?.sourceRevision??a?.revision??null,after:b?.sourceRevision??b?.revision??null};if(rev.before!==null||rev.after!==null)target.revision=rev;
   if(collection==='codings'){const q=clip(String(b?.text??a?.text??''));target.quotation=q.value;if(q.truncated)target.quotationTruncated=true;}
   // A record creation/removal shows only fields that exist on at least one side.
   for(const key of changed){if(!Object.hasOwn(a||{},key)&&!Object.hasOwn(b||{},key))continue;const focus=key==='text'||key==='content'?focusFor(a?.[key],b?.[key]):0;const field={field:key,before:snapshot(a?.[key],Object.hasOwn(a||{},key),focus),after:snapshot(b?.[key],Object.hasOwn(b||{},key),focus)};target.fields.push(field);out.targets.push(target);const fits=bytes(out)<DECISION_DIFF_MAX_BYTES-160;out.targets.pop();if(!fits){target.fields.pop();target.omittedFields++;}}
   out.targets.push(target);if(bytes(out)>=DECISION_DIFF_MAX_BYTES-100){out.targets.pop();out.omittedTargets++;}
  }
 }
 return out;
}
