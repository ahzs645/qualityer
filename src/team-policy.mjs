import {memoReferenceMetadata} from './memo-references.mjs';
// Role permissions are enforced by the Worker; client controls are explanatory.
export const TEAM_CAPABILITIES = ['coding','codebook','sources','structure','memos','ai','audio','history','recovery'];
export const TEAM_ROLES = ['reviewer','coder','viewer'];
const all = value => Object.fromEntries(TEAM_CAPABILITIES.map(key=>[key,value]));
export const DEFAULT_ROLE_CAPABILITIES = {
 reviewer:all(true), coder:all(true), viewer:{...all(false),history:true,recovery:true}
};
export function normalizeTeamPolicy(value){
 if(value==null)return {blindCoding:false,roles:structuredClone(DEFAULT_ROLE_CAPABILITIES)};
 if(typeof value!=='object'||Array.isArray(value)||typeof value.blindCoding!=='boolean')throw Error('Choose an explicit blind-coding setting.');
 const out={blindCoding:value.blindCoding,roles:structuredClone(DEFAULT_ROLE_CAPABILITIES)};
 if(value.roles!=null){if(typeof value.roles!=='object'||Array.isArray(value.roles))throw Error('Invalid role permissions.');for(const [role,caps] of Object.entries(value.roles)){if(!TEAM_ROLES.includes(role)||!caps||typeof caps!=='object'||Array.isArray(caps))throw Error('Invalid role permissions.');for(const [key,on] of Object.entries(caps)){if(!TEAM_CAPABILITIES.includes(key)||typeof on!=='boolean')throw Error('Invalid role capability.');if(role==='viewer'&&on&&!['history','recovery'].includes(key))throw Error('Viewers remain read-only. Assign coder or reviewer access for editing.');out.roles[role][key]=on;}}}
 return out;
}
export function teamAccess(state,role,user){const policy=normalizeTeamPolicy(state.settings?.teamAccess);return {policy,blind:policy.blindCoding&&role==='coder',actor:user.id,role,capabilities:role==='owner'?all(true):policy.roles[role]||all(false)};}
const forbidden=message=>{throw Object.assign(Error(message),{status:403});};
export function requireCapability(access,key){if(!access.capabilities[key])forbidden('Your project role does not permit '+key+'.');}
const own=(row,access,key)=>row?.[key]===access.actor;
const ownOperations=new Set(['coding.create','coding.delete','coding.restore','memo.save','journal.save','reading.mark','query.save','query.delete','passage.pin','passage.link','suggestions.add','suggestion.dismiss','suggestion.accept','reviewTasks.add','extraction.save','autocoding.apply','autocoding.undo','codeSet.save','codeSet.delete','query.results.save']);
export function authorizeOperation(state,op,access){
 if(!op||typeof op.type!=='string')throw Error('Choose a project operation.');
 const type=op.type,data=op.data||{};
 if(type==='permissions.update'){if(access.role!=='owner')forbidden('Only the owner can configure project permissions.');normalizeTeamPolicy(data);return;}
 if(type==='settings.save'&&Object.hasOwn(data,'teamAccess'))forbidden('Use the owner permissions control to change team access.');
 const capability=/^(coding\.|autocoding\.|consensus\.|reviewTask|review\.example)/.test(type)?'coding':/^(code\.|codebook\.|category\.|hierarchy\.|query.materialize|query.results.materialize)/.test(type)?'codebook':/^source\./.test(type)?'sources':/^(case\.|attribute\.|protocol\.|settings\.|map\.)/.test(type)?'structure':/^(memo\.|journal\.|reading\.|query\.|passage\.|extraction\.|coverage\.|codeSet\.)/.test(type)?'memos':/^suggestion/.test(type)?'ai':null;
 if(!capability)forbidden('This operation is not enabled by a project permission.');
 requireCapability(access,capability);
 if(!access.blind)return;
 if(!ownOperations.has(type))forbidden('Blind coders can change their own decisions and notes. Ask a reviewer to change shared study structure.');
 const checks={
  'coding.delete':['codings','coder'],'coding.restore':['codings','coder'],
  'memo.save':['memos','author'],'journal.save':['journals','coder'],
  'autocoding.undo':['autocodingRuns','actor'],'codeSet.save':['codeSets','author'],'codeSet.delete':['codeSets','author'],'query.delete':['savedQueries','author'],'extraction.save':['extractions','author'],
  'suggestion.dismiss':['suggestions','createdBy'],'suggestion.accept':['suggestions','createdBy']
 };
 if(checks[type]&&data.id){const [list,key]=checks[type],row=(state[list]||[]).find(x=>x.id===data.id);if(row&&!own(row,access,key))forbidden('That record is unavailable in your blind-coding view.');}
 if(type==='extraction.save'&&!state.codings.some(c=>c.id===data.codingId&&own(c,access,'coder')))forbidden('Choose one of your own code applications.');
 // No hidden application may be cited by guessing an identifier.
 const visible=new Set(state.codings.filter(c=>own(c,access,'coder')).map(c=>c.id));
 for(const c of data.citations||[])if(c.codingId&&!visible.has(c.codingId))forbidden('A citation is unavailable in your blind-coding view.');
}
export function updateTeamPolicy(state,data){const next=structuredClone(state);next.settings={...next.settings,teamAccess:normalizeTeamPolicy(data)};return next;}
const pick=(row,keys)=>Object.fromEntries(Object.entries(structuredClone(row)).filter(([key])=>keys.includes(key)));
const omit=(row,keys)=>{const out=structuredClone(row);for(const key of keys)delete out[key];return out;};
export function visibleProjectState(state,access){
 if(!access.blind)return structuredClone(state);
 // An allowlist prevents imported/legacy or future derived analysis fields from bypassing blindness.
 const s={name:state.name,protocol:state.protocol,documents:state.documents.map(d=>pick(d,['id','name','text','revision','sourceRole','attributes','turns','pages','versions','excludeAI','reviewFlags','reviewStatus','mediaKey','mediaType','mediaWidth','mediaHeight','mediaPath','avTextId','risId','alignment','transcription','transcriptMetadata','speakerMappings','diarization','ingestionMetadata','textDirection','direction','importProvenance','ocr'])),categories:(state.categories||[]).map(c=>pick(c,['id','name','parentId','color','order'])),attributeTypes:(state.attributeTypes||[]).map(t=>pick(t,['name','scope','valueType','id'])),settings:pick(state.settings||{},['teamAccess','aiEndpoint','aiModel','audioEndpoint'])};
 s.codes=state.codes.map(c=>pick(c,['id','name','description','definition','parentId','categoryId','color','codable','order','archivedAt','originalCodable']));
 s.cases=(state.cases||[]).map(c=>({...pick(c,['id','name','documentIds','attributes']),passages:(c.passages||[]).filter(p=>own(p,access,'actor'))}));
 for(const d of s.documents){delete d.codingHistory;delete d.analysis;d.versions=(d.versions||[]).map(v=>Object.fromEntries(Object.entries(v).filter(([key])=>['revision','text','turns','alignment','transcriptMetadata','transcription','speakerMappings','diarization','ingestionMetadata','textDirection','direction','importProvenance','ocr','date','mediaKey','mediaType','pages','reviewFlags'].includes(key))));}
 const lists={codings:'coder',memos:'author',journals:'coder',extractions:'author',coverage:'actor',suggestions:'createdBy',reviewTasks:'addedBy',assistantRuns:'createdBy',readingProgress:'actor',savedQueries:'author',passagePins:'actor',passageLinks:'actor',autocodingRuns:'actor',codeSets:'author'};
 for(const [list,key] of Object.entries(lists))s[list]=(state[list]||[]).filter(row=>own(row,access,key)&&(list!=='extractions'||state.codings.some(c=>c.id===row.codingId&&own(c,access,'coder')))).map(row=>omit(row,['reviews','reviewer','reviewNote','reviewedBy','history','versions','querySources','modifiedBy','relatedEvidence','queryResult','autocodingUndoSnapshot',...(list==='autocodingRuns'?[]:['codingIds'])]));
 s.memos=s.memos.map(m=>({...m,references:memoReferenceMetadata(s,m.content,access.actor,access.role)}));
 s.consensus=[];s.codeMerges=[];
 return s;
}
