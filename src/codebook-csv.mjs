// Dependency-free proposal. CSV paths remain literal unless a hierarchy separator is explicitly chosen.
export function parseCodebookCSV(text) {
  const rows=[];let row=[],value='',quoted=false,closed=false;
  const cell=()=>{row.push(value);value='';closed=false;};
  const line=()=>{cell();if(row.some(v=>v!==''))rows.push(row);row=[];};
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=ch;continue;}
    if(ch==='"'){if(value||closed)throw Error('Unexpected CSV quotation.');quoted=true;}
    else if(ch===',')cell();
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;line();}
    else {if(closed)throw Error('Unexpected text after CSV quotation.');value+=ch;}
  }
  if(quoted)throw Error('Unclosed CSV quotation.');line();return rows;
}

export function previewCodebookCSV(text,state={codes:[]},{separator=null}={}) {
  if(String(text).length>10000000)throw Error('Choose a codebook under 10 MB.');
  if(separator!==null&&(typeof separator!=='string'||!separator.length))throw Error('Choose a non-empty hierarchy separator.');
  const rows=parseCodebookCSV(text);if(rows.length<2)throw Error('Include a header and at least one code.');
  const header=rows[0].map(h=>h.trim().toLowerCase());
  const pathColumns=header.map((h,i)=>['tag','name','path'].includes(h)?i:-1).filter(i=>i>=0);
  if(pathColumns.length!==1)throw Error('Use exactly one tag, name, or path column.');
  if(header.filter(h=>h==='description').length>1)throw Error('Duplicate description column.');
  const pathCol=pathColumns[0],descriptionCol=header.indexOf('description'),existing=new Map(),codes=new Map((state.codes||[]).map(c=>[c.id,c])),warnings=[],errors=[],incoming=new Map();
  const fullPath=(code,seen=new Set())=>{if(seen.has(code.id))throw Error('Existing code hierarchy contains a cycle.');seen.add(code.id);if(separator&&code.name.includes(separator))throw Error('A code name contains the chosen path separator. Choose another separator.');if(!separator||!code.parentId)return code.name;const parent=codes.get(code.parentId);if(!parent)throw Error('Existing code hierarchy contains a missing parent.');if(code.name.includes(separator))throw Error('A code name contains the chosen path separator. Choose another separator.');return fullPath(parent,seen)+separator+code.name;};
  for(const c of state.codes||[]){const path=fullPath(c);if(existing.has(path))existing.set(path,null);else existing.set(path,c);}
  for(let i=1;i<rows.length;i++) {
    const row=rows[i],path=String(row[pathCol]??'').trim(),description=descriptionCol<0?'':String(row[descriptionCol]??'').trim();
    if(row.length<=pathCol||(descriptionCol>=0&&row.length<=descriptionCol)){errors.push({row:i+1,message:'Not enough columns.'});continue;}
    if(!path){errors.push({row:i+1,message:'Empty code name.'});continue;}
    if(separator&&path.split(separator).some(part=>!part.trim())){errors.push({row:i+1,message:'A hierarchy path contains an empty segment.'});continue;}
    if(incoming.has(path)){const prior=incoming.get(path);if(prior.description!==description)errors.push({row:i+1,message:'Duplicate path has conflicting descriptions: '+path});else warnings.push('Duplicate row skipped: '+path);continue;}
    incoming.set(path,{path,description,row:i+1,explicit:true});
    if(/^[=+@-]/.test(path)||/^[=+@-]/.test(description))warnings.push('Spreadsheet formula-like text in row '+(i+1)+'.');
  }
  // Create absent ancestors only when requested. An explicit parent definition is never overwritten by inference.
  if(separator)for(const item of [...incoming.values()]){const parts=item.path.split(separator);for(let i=1;i<parts.length;i++){const path=parts.slice(0,i).join(separator);if(!incoming.has(path)&&!existing.has(path))incoming.set(path,{path,description:'',row:item.row,explicit:false});}}
  const sorted=[...incoming.values()].sort((a,b)=>(separator?a.path.split(separator).length-b.path.split(separator).length:0)||a.row-b.row);
  const entries=[],ids=new Map();let index=0;
  for(const item of sorted){const prior=existing.get(item.path);if(existing.has(item.path)&&prior===null){errors.push({row:item.row,message:'Existing path is ambiguous: '+item.path});continue;}const parts=separator?item.path.split(separator):[item.path],parentPath=parts.length>1?parts.slice(0,-1).join(separator):null;const parent=parentPath?(ids.get(parentPath)||existing.get(parentPath)?.id):null;if(parentPath&&!parent){errors.push({row:item.row,message:'Parent path is ambiguous or missing: '+parentPath});continue;}let id=prior?.id;if(!id){do{id='csv-preview-'+(++index);}while(codes.has(id));}ids.set(item.path,id);if(prior&&item.description&&item.description!==prior.description)warnings.push('Existing description retained: '+item.path);entries.push({...item,id,name:parts.at(-1),parentId:parent,existing:!!prior,codable:item.explicit?true:false,color:prior?.color||'#537a92'});}
  return {entries,errors,warnings:[...new Set(warnings)],codes:entries.filter(e=>!e.existing).map(({id,name,description,parentId,codable,color})=>({id,name,description,parentId,codable,color})),separator};
}

export function exportCodebookCSV(state,{separator='/',spreadsheetSafe=false}={}) {
  if(typeof separator!=='string'||!separator)throw Error('Choose a non-empty hierarchy separator.');
  const codes=new Map(state.codes.map(c=>[c.id,c]));
  const path=(c,seen=new Set())=>{if(seen.has(c.id))throw Error('Code hierarchy contains a cycle.');seen.add(c.id);if(c.name.includes(separator))throw Error('A code name contains the chosen path separator. Choose another separator.');const parent=c.parentId?codes.get(c.parentId):null;if(c.parentId&&!parent)throw Error('Code hierarchy contains a missing parent.');return parent?path(parent,seen)+separator+c.name:c.name;};
  const quote=value=>{let text=String(value??'');if(spreadsheetSafe&&/^[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['tag','description','number of highlights','number of documents']];
  for(const c of state.codes){const applications=(state.codings||[]).filter(x=>x.codeId===c.id&&!x.deletedAt);rows.push([path(c),c.description||'',applications.length,new Set(applications.map(x=>x.documentId)).size]);}
  return rows.map(r=>r.map(quote).join(',')).join('\r\n');
}
