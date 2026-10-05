// Source anchors count Unicode codepoints. Long transcripts are checked many times per render and
// per operation, so codepoint offsets are cached per exact text value: a revised text is a different
// key, so a stale entry can never answer for it. Text without surrogates needs no offset table.
const cache=new Map(),MIN=256,MAX_ENTRIES=24,MAX_UNITS=8_000_000;let units=0;
function build(text){
 if(!/[\uD800-\uDFFF]/.test(text))return {length:text.length,offsets:null};
 const offsets=new Uint32Array(text.length+1);let n=0;
 for(let i=0;i<text.length;n++){offsets[n]=i;const c=text.charCodeAt(i);i+=c>=0xD800&&c<=0xDBFF&&i+1<text.length&&(text.charCodeAt(i+1)&0xFC00)===0xDC00?2:1;}
 offsets[n]=text.length;return {length:n,offsets:offsets.slice(0,n+1)};
}
export function textIndex(value){
 const text=typeof value==='string'?value:String(value??'');if(text.length<MIN)return build(text);
 let hit=cache.get(text);if(hit){if(cache.size>1){cache.delete(text);cache.set(text,hit);}return hit;}
 hit=build(text);cache.set(text,hit);units+=text.length;
 for(const key of cache.keys()){if(cache.size<=MAX_ENTRIES&&units<=MAX_UNITS)break;cache.delete(key);units-=key.length;}
 return hit;
}
export const pointLength=text=>textIndex(text).length;
const bound=(value,length,fallback)=>{if(value===undefined)return fallback;const n=Math.trunc(Number(value))||0;return n<0?Math.max(length+n,0):Math.min(n,length);};
// Same result as Array.from(text).slice(start,end).join('').
export function pointSlice(text,start,end){
 const value=typeof text==='string'?text:String(text??''),{length,offsets}=textIndex(value),a=bound(start,length,0),b=bound(end,length,length);
 if(b<=a)return '';return offsets?value.slice(offsets[a],offsets[b]):value.slice(a,b);
}
// UTF-16 offset of a codepoint index (clamped to the text).
export function pointOffset(text,index){const {length,offsets}=textIndex(text),i=Math.max(0,Math.min(length,Math.trunc(index)||0));return offsets?offsets[i]:i;}
// A frozen codepoint array for callers that index many single points; cached alongside the offsets.
const arrays=new Map();
export function codepoints(value){
 const text=typeof value==='string'?value:String(value??'');if(text.length<MIN)return Array.from(text);
 let hit=arrays.get(text);if(hit)return hit;hit=Object.freeze(Array.from(text));arrays.set(text,hit);
 while(arrays.size>8)arrays.delete(arrays.keys().next().value);return hit;
}
export function clearTextPointCache(){cache.clear();arrays.clear();units=0;}
