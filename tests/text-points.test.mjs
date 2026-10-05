import test from 'node:test';
import assert from 'node:assert/strict';
import {pointLength,pointSlice,pointOffset,codepoints,textIndex,clearTextPointCache} from '../src/text-points.mjs';
import {citationCurrent} from '../src/analysis-memos.mjs';
import {frameworkCellCurrent} from '../src/framework-method.mjs';
import {validateState,emptyState} from '../src/domain.mjs';
import {comparisonScope} from '../src/coder-comparison.mjs';
import {chunksForRow} from '../src/transcript-presentation.mjs';

// Synthetic long transcripts only: generated words, emoji, combining marks and lone surrogates.
const words=['field','note','river','café','naïve','😀','mañana','👩🏽‍🔬','é','policy','قال','x'];
function synthetic(length,seed=7){let text='',n=seed;while(text.length<length){n=(n*1103515245+12345)%2147483648;text+=words[n%words.length]+(n%13===0?'.\n':' ');}return text;}
const reference=(text,start,end)=>Array.from(text).slice(start,end).join('');

test('Codepoint helpers match Array.from for astral, combining, lone surrogate and out-of-range offsets',()=>{
 clearTextPointCache();
 for(const text of ['', 'plain ascii', 'A😀 café\r\n', '\uD800lone\uDC00 high\uD83D', synthetic(5000), synthetic(20000,3)]){
  assert.equal(pointLength(text),Array.from(text).length);
  const n=Array.from(text).length;
  for(const [a,b] of [[0,n],[0,1],[1,3],[n-2,n],[-5,undefined],[3,-2],[5,2],[n,n+10],[undefined,undefined],[2.7,9.2]])assert.equal(pointSlice(text,a,b),reference(text,a,b),JSON.stringify([text.length,a,b]));
  for(let i=0;i<=n;i+=Math.max(1,Math.floor(n/37)))assert.equal(text.slice(0,pointOffset(text,i)),reference(text,0,i));
  assert.deepEqual([...codepoints(text)],Array.from(text));
 }
 assert.equal(pointLength(null),0);assert.equal(pointSlice(undefined,0,3),'');
});

test('Cached offsets are keyed by exact text, so a revised transcript never reuses stale positions',()=>{
 clearTextPointCache();
 const original=synthetic(40000),revised='😀'+original;
 assert.equal(pointLength(original),Array.from(original).length);
 const cached=textIndex(original);assert.equal(textIndex(original),cached,'repeat lookups reuse the cached index');
 assert.equal(pointLength(revised),Array.from(revised).length);
 assert.equal(pointSlice(revised,0,5),reference(revised,0,5));
 assert.notEqual(pointSlice(revised,0,5),pointSlice(original,0,5));
 // Many other long strings evict old entries without changing any answer.
 for(let i=0;i<60;i++)assert.equal(pointLength(original.slice(i,i+3000)),Array.from(original.slice(i,i+3000)).length);
 assert.equal(pointSlice(original,100,140),reference(original,100,140));
});

test('Citation currency follows text and revision changes even after the cache has been warmed',()=>{
 clearTextPointCache();
 const text=synthetic(80000),doc={id:'d',name:'Synthetic',text,revision:3,reviewFlags:[]},state={documents:[doc]};
 const citation={documentId:'d',sourceRevision:3,start:500,end:540,text:reference(text,500,540)};
 assert.equal(citationCurrent(state,citation),true);
 assert.equal(citationCurrent({documents:[{...doc,revision:4}]},citation),false,'revision change makes the citation stale');
 assert.equal(citationCurrent({documents:[{...doc,text:'👩🏽‍🔬'+text}]},citation),false,'shifted text no longer matches');
 assert.equal(citationCurrent({documents:[{...doc,reviewFlags:[{start:520,end:530,status:'pending'}]}]},citation),false,'consent review still restricts');
 assert.equal(citationCurrent({documents:[{...doc,reviewFlags:[{start:0,end:Array.from(text).length+1,status:'pending'}]}]},citation),false,'invalid restriction anchors restrict the whole source');
 assert.equal(citationCurrent(state,citation),true);
});

test('Binary-searched reading-row chunks equal a full scan for contiguous and irregular chunk lists',()=>{
 const text=synthetic(3000),n=Array.from(text).length,bounds=[0,n];for(let i=1;i<60;i++)bounds.push(Math.floor(i*n/61)+(i%5));
 const sorted=[...new Set(bounds)].sort((a,b)=>a-b),chunks=sorted.slice(0,-1).map((start,i)=>({start,end:sorted[i+1],text:reference(text,start,sorted[i+1])}));
 const scan=(row,list)=>list.filter(c=>c.start<row.end&&c.end>row.start).map(c=>{const start=Math.max(row.start,c.start),end=Math.min(row.end,c.end);return {...c,start,end,text:reference(c.text,start-c.start,end-c.start)};});
 const overlapping=[{start:10,end:400,text:reference(text,10,400)},{start:5,end:30,text:reference(text,5,30)},{start:200,end:220,text:reference(text,200,220)}];
 for(let start=0;start<n;start+=97)for(const width of [1,40,500]){const row={start,end:Math.min(n,start+width)};assert.deepEqual(chunksForRow(row,chunks),scan(row,chunks));assert.deepEqual(chunksForRow(row,overlapping),scan(row,overlapping));}
});

test('Performance regression: 200 citations, 200 codings and 24 framework cells on an 80k-character source stay fast',()=>{
 clearTextPointCache();
 const text=synthetic(80000),points=Array.from(text),n=points.length,quote=(a,b)=>points.slice(a,b).join(''),doc={id:'d',name:'Synthetic',text,revision:1,reviewFlags:[],turns:[]};
 const spans=Array.from({length:200},(_,i)=>{const start=Math.floor(i*(n-200)/200);return {start,end:start+60};});
 const citations=spans.map(s=>({documentId:'d',sourceRevision:1,...s,text:quote(s.start,s.end),relation:'evidence'}));
 const state={...emptyState('Synthetic'),documents:[doc],codes:[{id:'c',name:'Code',color:'#537a92',codable:true}],codings:spans.map((s,i)=>({id:'k'+i,documentId:'d',codeId:'c',...s,text:quote(s.start,s.end),coder:'r',status:'coded',sourceRevision:1})),frameworkCells:Array.from({length:24},(_,i)=>({id:'f'+i,studyId:'s',documentId:'d',themeId:'t'+i,sourceRevision:1,finding:'observed',evidence:citations.slice(i*8,i*8+8)}))};
 const started=performance.now();
 for(let round=0;round<3;round++){assert.ok(citations.every(c=>citationCurrent(state,c)));assert.ok(state.frameworkCells.every(c=>frameworkCellCurrent(state,c)));validateState(state);assert.equal(comparisonScope(state).codings.length,200);}
 const elapsed=performance.now()-started;
 // Recomputing codepoint arrays per check took several seconds here; cached offsets take a few milliseconds.
 assert.ok(elapsed<400,'currency checks took '+elapsed.toFixed(0)+' ms');
});
