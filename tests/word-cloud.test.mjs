import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutCloud,overlaps,fontSize,rotationFor,contrast,ensureContrast,cloudSVG,cloudCaption,escapeXML,clampWords,dominantSource,sourceLegend,BACKGROUNDS,SCHEMES,SCALES} from '../src/word-cloud.mjs';

// Synthetic vocabulary only: invented syllable words with Zipf-like counts spread over four fake sources.
const syll=['ka','lo','mi','ren','tu','sha','vo','pex','dri','nal','qua','zo'];
function vocabulary(n=300,seed=11){let s=seed;const r=()=>(s=(s*16807)%2147483647)/2147483647;return Array.from({length:n},(_,i)=>{const count=Math.max(1,Math.round(900/(i+1))),hits=Array.from({length:Math.min(count,12)},(_,j)=>({documentId:'src-'+((i+j*(i%3===0?0:1))%4)}));return {term:Array.from({length:2+Math.floor(r()*2)},()=>syll[Math.floor(r()*syll.length)]).join('')+i,count,hits};});}
const strip=l=>JSON.stringify({w:l.words.map(({term,x,y,size,rotate,color})=>[term,x,y,size,rotate,color]),d:l.dropped.map(d=>d.term)});

test('layout is deterministic for the same seed and input order', () => {
 const words=vocabulary(200),a=layoutCloud(words,{width:900,height:520,seed:3,maxWords:150}),b=layoutCloud([...words].reverse(),{width:900,height:520,seed:3,maxWords:150});
 assert.equal(strip(a),strip(b));assert.ok(a.words.length>20);
 const c=layoutCloud(words,{width:900,height:520,seed:4,maxWords:150});assert.notEqual(strip(a),strip(c),'a different seed changes placement');
});

test('placed rectangles never overlap and stay inside the canvas', () => {
 for(const rotation of ['none','mixed','vertical'])for(const [width,height] of [[960,560],[358,390]]){const l=layoutCloud(vocabulary(300),{width,height,maxWords:300,rotation,minSize:11,maxSize:60});
  for(let i=0;i<l.words.length;i++){const a=l.words[i].box;assert.ok(a.x0>=0&&a.y0>=0&&a.x1<=width&&a.y1<=height,'inside canvas');for(let j=i+1;j<l.words.length;j++)assert.ok(!overlaps(a,l.words[j].box),l.words[i].term+' overlaps '+l.words[j].term);}}
});

test('size scales are monotonic in count and respect the size bounds', () => {
 for(const scale of SCALES){let prev=-1;for(let c=1;c<=400;c+=7){const s=fontSize(c,1,400,{scale,minSize:12,maxSize:72});assert.ok(s>=prev,scale+' monotonic');assert.ok(s>=12&&s<=72);prev=s;}assert.equal(fontSize(1,1,400,{scale,minSize:12,maxSize:72}),12);assert.equal(fontSize(400,1,400,{scale,minSize:12,maxSize:72}),72);}
 assert.ok(fontSize(20,1,400,{scale:'log'})>fontSize(20,1,400,{scale:'sqrt'}),'log lifts mid counts above sqrt');assert.ok(fontSize(20,1,400,{scale:'sqrt'})>fontSize(20,1,400,{scale:'linear'}));
 const l=layoutCloud(vocabulary(120),{width:1000,height:600,scale:'sqrt'});for(let i=1;i<l.words.length;i++)if(l.words[i].count<l.words[i-1].count)assert.ok(l.words[i].size<=l.words[i-1].size);
});

test('rotation modes: none, mixed by rank, vertical only', () => {
 const w=vocabulary(60),opts={width:1000,height:700,maxWords:60};
 assert.ok(layoutCloud(w,{...opts,rotation:'none'}).words.every(x=>x.rotate===0));
 assert.ok(layoutCloud(w,{...opts,rotation:'vertical'}).words.every(x=>x.rotate===-90));
 const mixed=layoutCloud(w,{...opts,rotation:'mixed'}).words;assert.ok(mixed.some(x=>x.rotate===0)&&mixed.some(x=>x.rotate===-90));assert.ok(mixed.every(x=>x.rotate===rotationFor(x.rank,'mixed')));assert.equal(rotationFor(0,'mixed'),0,'the top word stays horizontal');
 const v=layoutCloud(w,{...opts,rotation:'vertical'}).words[0];assert.ok(v.box.y1-v.box.y0>v.box.x1-v.box.x0,'vertical boxes are taller than wide');
});

test('every colour scheme keeps WCAG 4.5:1 contrast on light and dark backgrounds', () => {
 const w=vocabulary(150);for(const background of ['light','dark'])for(const scheme of SCHEMES)for(const reverse of [false,true]){const l=layoutCloud(w,{width:1000,height:640,maxWords:150,scheme,background,reverse,accent:background==='dark'?'#1a237e':'#ffee58'});assert.ok(l.words.length>10);for(const x of l.words)assert.ok(contrast(x.color,BACKGROUNDS[background])>=4.5,scheme+' '+background+' '+x.color);}
 for(const c of ['#ffffff','#ffff00','#777777','#000000'])for(const bg of Object.values(BACKGROUNDS))assert.ok(contrast(ensureContrast(c,bg),bg)>=4.5);
 for(const l of sourceLegend(['a','b','c'],'dark'))assert.ok(contrast(l.color,BACKGROUNDS.dark)>=4.5);
 const top=layoutCloud(w,{width:1000,height:640,scheme:'top',topN:5});assert.equal(new Set(top.words.filter(x=>x.rank<5).map(x=>x.color)).size,1);assert.notEqual(top.words.find(x=>x.rank>=5).color,top.words[0].color);
});

test('source scheme colours each word by the source contributing most hits', () => {
 assert.equal(dominantSource([{documentId:'b'},{documentId:'a'},{documentId:'b'}],['a','b']),'b');assert.equal(dominantSource([{documentId:'b'},{documentId:'a'}],['a','b']),'a','ties go to the earlier source');
 const l=layoutCloud([{term:'alpha',count:5,hits:[{documentId:'x'},{documentId:'y'},{documentId:'y'}]},{term:'beta',count:4,hits:[{documentId:'x'}]}],{scheme:'source',sources:[{id:'x'},{id:'y'}],maxWords:25}),legend=sourceLegend(['x','y'],'light');
 assert.equal(l.words.find(w=>w.term==='alpha').color,legend[1].color);assert.equal(l.words.find(w=>w.term==='beta').color,legend[0].color);assert.equal(l.words.find(w=>w.term==='alpha').sources,2);
});

test('words that do not fit are reported, and max words is clamped to 25–500', () => {
 const w=vocabulary(400),l=layoutCloud(w,{width:300,height:200,maxWords:400,minSize:14,maxSize:60});
 assert.ok(l.dropped.length>0);assert.equal(l.words.length+l.dropped.length,400);assert.ok(l.dropped.every(d=>d.reason&&d.term));assert.equal(new Set([...l.words,...l.dropped].map(x=>x.term)).size,400);
 const huge=layoutCloud([{term:'x'.repeat(80),count:9}],{width:300,height:200,maxSize:60});assert.equal(huge.words.length,0);assert.equal(huge.dropped[0].reason,'larger than the canvas');
 assert.equal(clampWords(3),25);assert.equal(clampWords(9000),500);assert.equal(layoutCloud(vocabulary(600),{maxWords:9000,width:2000,height:2000}).considered,500);
 assert.match(cloudCaption({layout:l,scope:'Synthetic',stopList:'English'}),new RegExp(l.dropped.length+' did not fit'));
});

test('SVG output escapes XML and carries the scope, stop list and frequency caption', () => {
 const l=layoutCloud([{term:'<b>&"quote\'s"',count:9,hits:[{documentId:'s1'}]},{term:'plain',count:3,hits:[]}],{width:400,height:240,maxWords:25,maxSize:20}),caption=cloudCaption({layout:l,scope:'Synthetic <scope> & co',stopList:'English',hidden:['zz']}),svg=cloudSVG(l,{title:'Cloud & "test"',caption});
 assert.match(svg,/&lt;b&gt;&amp;&quot;quote&apos;s&quot;/);assert.doesNotMatch(svg,/<b>/);assert.match(svg,/Synthetic &lt;scope&gt; &amp; co/);assert.match(svg,/Stop list: English; hidden by viewer: zz/);assert.match(caption,/describe word frequency in the selected text, not importance/);assert.match(svg,/not importance/);assert.match(svg,/^<\?xml[^>]*\?>\n<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
 assert.equal(escapeXML('a\u0001b\u0008'),'ab');const opens=(svg.match(/<text\b/g)||[]).length,closes=(svg.match(/<\/text>/g)||[]).length;assert.equal(opens,closes);
});

test('layout of 300 words stays well under 150 ms', () => {
 const w=vocabulary(300);layoutCloud(w,{width:960,height:560,maxWords:300});const times=[];for(let i=0;i<5;i++){const t=performance.now();layoutCloud(w,{width:960,height:560,maxWords:300,seed:i+1,rotation:i%2?'mixed':'none'});times.push(performance.now()-t);}times.sort((a,b)=>a-b);
 assert.ok(times[2]<150,'median '+times[2].toFixed(1)+' ms');
});
