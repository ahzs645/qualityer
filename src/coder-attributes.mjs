import {attributesFor} from './research-operations.mjs';
// Coder attributes describe saved coder identities (human or AI) exactly as labelled on codings; they never rename or merge identities.
const plain=v=>v!=null&&typeof v==='object'&&!Array.isArray(v);
const reserved=new Set(['__proto__','constructor','prototype']);
function coderName(value){if(typeof value!=='string'||!value.trim()||value.length>200||reserved.has(value))throw Error('Choose a saved coder identity.');return value;}
function cleanValues(values){
 if(!plain(values))throw Error('Choose coder attribute values.');const entries=Object.entries(values);if(entries.length>100)throw Error('Record up to 100 attributes per coder.');
 return Object.fromEntries(entries.flatMap(([raw,value])=>{const name=String(raw).trim();if(!name||name.length>100||reserved.has(name))throw Error('Coder attribute names need 1–100 characters.');if(value==null||(typeof value==='string'&&!value.trim()))return [];if(!(typeof value==='string'&&value.length<=1000||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)))throw Error('Coder attribute values must be text, numbers, true/false or dates.');return [[name,typeof value==='string'?value.trim():value]];}));
}
export function validateCoderAttributes(s){if(s.coderAttributes==null)return;if(!plain(s.coderAttributes))throw Error('Invalid coder attributes.');for(const [coder,values] of Object.entries(s.coderAttributes)){coderName(coder);cleanValues(values);}}
export function setCoderAttributes(s,data,isReviewer){
 if(!isReviewer)throw Error('Reviewer access required.');const coder=coderName(data.coder);
 const values=data.clear?{}:Object.fromEntries(Object.entries(attributesFor(s,cleanValues(data.attributes??{}),'coder')).filter(([,v])=>v!=null));
 const next=Object.fromEntries(Object.entries(s.coderAttributes||{}).filter(([key])=>key!==coder));if(Object.keys(values).length)next[coder]=values;s.coderAttributes=next;
}
export function recoerceCoderAttributes(s){if(s.coderAttributes)s.coderAttributes=Object.fromEntries(Object.entries(s.coderAttributes).map(([coder,values])=>[coder,Object.fromEntries(Object.entries(attributesFor(s,values,'coder')).filter(([,v])=>v!=null))]));}
const order=(a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true});
export const knownCoders=s=>[...new Set([...(s.codings||[]).filter(c=>!c.deletedAt&&c.coder).map(c=>c.coder),...Object.keys(s.coderAttributes||{})])].sort(order);
export const coderAttributeNames=s=>[...new Set([...(s.attributeTypes||[]).filter(t=>t.scope==='coder').map(t=>t.name),...Object.values(s.coderAttributes||{}).flatMap(v=>Object.keys(v))])].sort(order);
