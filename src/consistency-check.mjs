// Offline, deterministic per-code consistency screening. Each distinct excerpt of a code is compared with the
// other excerpts of the same code using TF-IDF word vectors (leave-one-out centroid, cosine similarity).
// Unusually dissimilar excerpts are reading prompts: they may be miscoded, a distinct sub-theme, or simply
// phrased differently. The same cutoff rule as the server's embedding outlier review is used, so results are
// comparable, but this method only sees shared vocabulary, not meaning.
import {wordTokens} from './analysis-domain.mjs';
import {stopwordSet,normalizeWord} from './stopwords.mjs';

export const MIN_EXCERPTS=4,SHORT_TOKENS=5;
export const METHOD='TF-IDF word vectors over the code’s distinct excerpts; cosine similarity of each excerpt to the leave-one-out centroid of the others; flagged when below the mean by at least 1.5 population standard deviations and 0.05. Vocabulary only — no meaning, no model, no data leaves the browser.';

function terms(text,stop){return wordTokens(String(text||'')).map(t=>normalizeWord(t.word)).filter(w=>Array.from(w).length>=3&&!stop.has(w)&&!/^\d+$/.test(w));}
const norm=v=>Math.sqrt([...v.values()].reduce((n,x)=>n+x*x,0));
function cosine(a,b){const na=norm(a),nb=norm(b);if(!na||!nb)return 0;let dot=0;for(const [k,x] of a){const y=b.get(k);if(y)dot+=x*y;}return dot/(na*nb);}
/** Same rule as server/research-ai.mjs outlierCutoff, so local and embedding reviews flag on the same basis. */
export function outlierCutoff(scores){if(scores.length<MIN_EXCERPTS)return null;const mean=scores.reduce((n,x)=>n+x,0)/scores.length,spread=Math.sqrt(scores.reduce((n,x)=>n+(x-mean)**2,0)/scores.length);return mean-Math.max(1.5*spread,0.05);}

/** Distinct text excerpts of one code within the already-scoped applications. */
export function codeExcerpts(rows,codeId){const seen=new Map();for(const r of rows)if(r.codeId===codeId&&(!r.kind||r.kind==='text')&&r.text){const key=[r.documentId,r.start,r.end].join(':');if(!seen.has(key))seen.set(key,{key,id:r.id,documentId:r.documentId,start:r.start,end:r.end,text:r.text,sourceRevision:r.sourceRevision,coders:new Set(),applicationIds:[]});const e=seen.get(key);e.coders.add(r.coder);e.applicationIds.push(r.id);}return [...seen.values()].map(e=>({...e,coders:[...e.coders].filter(Boolean).sort()}));}

/**
 * Screen one code. `corpus` (all scoped applications) supplies document frequencies so very common interview
 * words weigh less. Returns every excerpt ranked from least to most typical, with the flagged subset marked.
 */
export function lexicalConsistency(rows,codeId,{language='en',corpus=rows}={}){
 const excerpts=codeExcerpts(rows,codeId),stop=stopwordSet(language);
 if(excerpts.length<MIN_EXCERPTS)return {codeId,excerpts:[],flagged:[],cutoff:null,n:excerpts.length,method:METHOD,reason:'At least '+MIN_EXCERPTS+' distinct excerpts are needed for a comparison.'};
 const docs=new Map();for(const r of corpus)if(r.text&&(!r.kind||r.kind==='text'))docs.set([r.documentId,r.start,r.end].join(':'),r.text);
 const df=new Map();for(const text of docs.values())for(const w of new Set(terms(text,stop)))df.set(w,(df.get(w)||0)+1);
 const N=Math.max(docs.size,excerpts.length),idf=w=>Math.log((1+N)/(1+(df.get(w)||0)))+1;
 const vectors=excerpts.map(e=>{const tf=new Map();const list=terms(e.text,stop);for(const w of list)tf.set(w,(tf.get(w)||0)+1);const v=new Map();for(const [w,c] of tf)v.set(w,c*idf(w));const n=norm(v);if(n)for(const [w,x] of v)v.set(w,x/n);return {v,tokens:list.length};});
 const total=new Map();for(const {v} of vectors)for(const [w,x] of v)total.set(w,(total.get(w)||0)+x);
 const scored=excerpts.map((e,i)=>{const {v,tokens}=vectors[i],others=new Map();for(const [w,x] of total){const y=x-(v.get(w)||0);if(y>1e-12)others.set(w,y/(excerpts.length-1));}
  const score=cosine(v,others),shared=[...others].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);
  return {...e,score,tokens,short:tokens<SHORT_TOKENS,ownTerms:[...v].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([w])=>w),missingTerms:shared.filter(w=>!v.has(w)).slice(0,5)};});
 const cutoff=outlierCutoff(scored.map(x=>x.score)),ranked=scored.map(x=>({...x,flagged:cutoff!==null&&x.score<cutoff})).sort((a,b)=>a.score-b.score||a.key.localeCompare(b.key));
 return {codeId,excerpts:ranked,flagged:ranked.filter(x=>x.flagged),cutoff,n:excerpts.length,method:METHOD,language};
}

/** Review-task payloads for the processing desk; human review decides what, if anything, changes. */
export function consistencyTasks(result,code,{uid,language}={}){return result.flagged.map(f=>({id:uid(),documentId:f.documentId,start:f.start,end:f.end,text:f.text,sourceRevision:f.sourceRevision,issue:'Read lexical outlier',rationale:'Vocabulary similarity '+f.score.toFixed(3)+' to other “'+code.name+'” excerpts is below the cutoff '+result.cutoff.toFixed(3)+'.'+(f.missingTerms.length?' Common words in this code that it lacks: '+f.missingTerms.join(', ')+'.':'')+(f.short?' Short excerpt; similarity is unreliable.':'')+' A reading prompt, not a coding error.',agent:'Local lexical consistency check'+(language?' · stop list '+language:''),suggestedCodeIds:[],relatedEvidence:[]}));}
