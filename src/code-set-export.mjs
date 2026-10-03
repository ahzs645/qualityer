const hasId=id=>id!==null&&id!==undefined&&id!=='';
import {exportQDC} from './refi.mjs';
const unique=rows=>{const map=new Map();for(const row of rows||[]){const id=String(row.id);if(map.has(id))throw Error('Duplicate codebook identifiers prevent a reliable export.');map.set(id,row);}return map;};
export function codeSetCodebook(state,setId){
 const set=state.codeSets?.find(s=>s.id===setId);if(!set||!Array.isArray(set.codeIds)||!set.codeIds.length)throw Error('Choose a named code set containing existing codes.');
 const all=unique(state.codes),categories=unique(state.categories),selected=new Set(set.codeIds.map(String)),included=new Set(),includedCategories=new Set();
 const visit=(id,path=new Set())=>{if(path.has(id))throw Error('Selected code ancestry contains a cycle.');const code=all.get(id);if(!code||code.deletedAt)throw Error('A selected code or necessary ancestor is missing or deleted.');if(selected.has(id)&&code.archivedAt)throw Error('A selected code is archived. Update the set before exporting.');if(included.has(id))return;const next=new Set([...path,id]);if(code.parentId!=null&&code.parentId!=='')visit(String(code.parentId),next);included.add(id);};
 for(const id of selected)visit(id);
 const categoryVisit=(id,path=new Set())=>{if(path.has(id))throw Error('Necessary category ancestry contains a cycle.');const cat=categories.get(id);if(!cat||cat.deletedAt)throw Error('A necessary category is missing or deleted.');if(includedCategories.has(id))return;const next=new Set([...path,id]);if(cat.parentId!=null&&cat.parentId!=='')categoryVisit(String(cat.parentId),next);includedCategories.add(id);};
 for(const id of included){const c=all.get(id);if(!hasId(c.parentId)&&hasId(c.categoryId))categoryVisit(String(c.categoryId));}
 const categoryIds=new Map();for(const id of includedCategories){let exported='category:'+id;while(all.has(exported)||[...categoryIds.values()].includes(exported))exported='category:'+exported;categoryIds.set(id,exported);}
 const definition=(r,id,parentId,codable)=>{if(typeof r.name!=='string'||!r.name.trim())throw Error('Every exported definition needs a name.');return {id,name:r.name,description:String(r.description??r.memo??''),color:/^#[0-9a-f]{6}$/i.test(r.color||'')?r.color:'#537a92',parentId:parentId||null,codable};};
 const codes=[...includedCategories].map(id=>{const c=categories.get(id);return definition(c,categoryIds.get(id),hasId(c.parentId)?categoryIds.get(String(c.parentId)):null,false);}).concat([...included].map(id=>{const c=all.get(id),parent=hasId(c.parentId)?String(c.parentId):hasId(c.categoryId)?categoryIds.get(String(c.categoryId)):null;return definition(c,id,parent,c.codable!==false);}));
 if(codes.length>5000)throw Error('Portable codebook collections support at most 5,000 definitions.');
 return {format:'research-weave-codebook-set',version:1,name:String(set.name||'Named code set'),codes,selectedCodeIds:[...selected],scope:{ancestorCodeIds:[...included].filter(id=>!selected.has(id)),categories:'Necessary categories represented as non-codable ancestor codes for portable hierarchy.',excluded:'Sources, applications, cases, memos, private notes, review histories, AI configuration and timestamps are not included.'}};
}
export function exportCodeSetJSON(state,id){return JSON.stringify(codeSetCodebook(state,id),null,2);}
export function exportCodeSetQDC(state,id){const collection=codeSetCodebook(state,id);return exportQDC({codes:collection.codes,categories:[]});}
