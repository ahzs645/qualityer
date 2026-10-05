import test from 'node:test';
import assert from 'node:assert/strict';
import {louvain,modularity,networkLayout,cooccurrenceGraph,cooccurrenceNetwork,clusterOrder,networkSVG,networkGraphML,communityRows} from '../src/cooccurrence-network.mjs';
import {cooccurrenceMatrix} from '../src/visual-statistics.mjs';
const node=id=>({id,name:id.toUpperCase()}),edge=(source,target,weight=1)=>({source,target,weight});
const graph=(ids,edges)=>({nodes:ids.split('').map(node),edges});
// Two triangles joined by one bridge edge.
const bridged=(w=1,bridge=1)=>graph('abcdef',[edge('a','b',w),edge('b','c',w),edge('a','c',w),edge('d','e',w),edge('e','f',w),edge('d','f',w),edge('c','d',bridge)]);
// A matrix-shaped fixture so cooccurrenceNetwork can be tested without a project.
function matrixOf(g){const cells=new Map(g.edges.flatMap(e=>[[e.source+'|'+e.target,e],[e.target+'|'+e.source,e]]));return {codes:g.nodes,cell:(a,b)=>{if(a===b)return {diagonal:true,count:null};const e=cells.get(a+'|'+b);return e?{count:e.weight,jaccard:e.weight/10,applications:[{id:a+b}]}:{count:0,jaccard:0,applications:[]};}};}

test('two cliques joined by a weak edge split into two communities',()=>{
 const r=louvain(graph('abcdefgh',[...['ab','ac','ad','bc','bd','cd'].map(p=>edge(p[0],p[1],5)),...['ef','eg','eh','fg','fh','gh'].map(p=>edge(p[0],p[1],4)),edge('d','e',1)]));
 assert.deepEqual(r.communities,[['a','b','c','d'],['e','f','g','h']]);
 assert.deepEqual(r.membership,[0,0,0,0,1,1,1,1]);
 assert.deepEqual(r.degree,[15,15,15,16,13,12,12,12]);
});
test('modularity matches a hand computation',()=>{
 // m=7; each triangle has 3 internal edges and degree sum 7: Q = 2·(3/7 − (7/14)²) = 5/14.
 assert.ok(Math.abs(modularity(bridged(),[0,0,0,1,1,1])-5/14)<1e-12);
 assert.ok(Math.abs(louvain(bridged()).modularity-5/14)<1e-12);
 // Everything in one community: Q = 1 − 1 = 0. Weighted: triangles weight 2, bridge 1 → m=13, Q = 2·(6/13 − (13/26)²).
 assert.ok(Math.abs(modularity(bridged(),[0,0,0,0,0,0]))<1e-12);
 assert.ok(Math.abs(modularity(bridged(2,1),[0,0,0,1,1,1])-2*(6/13-0.25))<1e-12);
 // Singletons on a single edge: Q = −2·(1/2)² = −0.5.
 assert.equal(modularity(graph('ab',[edge('a','b')]),[0,1]),-0.5);
});
test('clustering and layout are deterministic',()=>{
 const g=graph('abcdefghij',[edge('a','b',3),edge('b','c',2),edge('c','a',1),edge('d','e',2),edge('e','f',2),edge('f','g',1),edge('g','d',2),edge('h','i',4),edge('i','j',1),edge('j','h',1),edge('c','d',1),edge('g','h',1)]);
 assert.deepEqual(louvain(g),louvain(g));
 const m=louvain(g).membership,one=networkLayout(g,{membership:m}),two=networkLayout(g,{membership:m});
 assert.deepEqual(one,two);
 for(const p of one){assert.ok(p.x>=0&&p.x<=800&&p.y>=0&&p.y<=560);}
 assert.equal(new Set(one.map(p=>p.x+','+p.y)).size,one.length);
 assert.deepEqual(cooccurrenceNetwork(matrixOf(g)),cooccurrenceNetwork(matrixOf(g)));
});
test('empty graphs and isolated nodes',()=>{
 const empty=louvain({nodes:[],edges:[]});
 assert.deepEqual([empty.communities,empty.membership,empty.modularity],[[],[],null]);
 assert.deepEqual(networkLayout({nodes:[],edges:[]}),[]);
 const lone=louvain(graph('abc',[]));
 assert.deepEqual(lone.communities,[['a'],['b'],['c']]);assert.equal(lone.modularity,null);assert.deepEqual(lone.degree,[0,0,0]);
 const mixed=cooccurrenceNetwork(matrixOf(graph('abcz',[edge('a','b',2),edge('b','c',2),edge('a','c',2)])));
 const z=mixed.nodes.find(n=>n.id==='z');
 assert.equal(z.isolated,true);assert.equal(z.degree,0);assert.equal(mixed.communities.length,2);assert.equal(mixed.communities[1].isolated,true);
 assert.equal(mixed.modularity,0);
 assert.deepEqual(clusterOrder(mixed),['a','b','c','z']);
 assert.equal(communityRows(mixed).at(-1)[1],'Not connected');
 assert.ok(Number.isFinite(z.x)&&Number.isFinite(z.y));
});
test('threshold drops weak edges before clustering and Jaccard weights are used when chosen',()=>{
 const m=matrixOf(bridged(3,1));
 assert.equal(cooccurrenceGraph(m,{minWeight:2}).edges.length,6);
 const net=cooccurrenceNetwork(m,{minWeight:2,layout:false});
 assert.equal(net.edges.some(e=>e.source==='c'&&e.target==='d'),false);assert.equal(net.communities.length,2);
 assert.ok(Math.abs(net.modularity-0.5)<1e-12);
 assert.deepEqual(cooccurrenceGraph(m,{measure:'jaccard'}).edges.map(e=>e.weight),[0.3,0.3,0.3,0.1,0.3,0.3,0.3]);
});
test('works on a real co-occurrence matrix',()=>{
 const text='abcdefghijklmnopqrstuvwxyz',s={documents:[{id:'d',name:'Source',text,revision:1}],codes:['a','b','c','d'].map(node),codings:[],cases:[]};
 const add=(id,codeId,start,end)=>s.codings.push({id,documentId:'d',start,end,text:text.slice(start,end),codeId,coder:'R',sourceRevision:1,status:'coded'});
 add('1','a',0,5);add('2','b',2,6);add('3','c',10,15);add('4','d',12,18);
 const net=cooccurrenceNetwork(cooccurrenceMatrix(s),{layout:false});
 assert.deepEqual(net.communities.map(c=>c.codes.map(n=>n.id)),[['a','b'],['c','d']]);
 assert.equal(net.edges[0].applications.length,2);
});
test('SVG export escapes labels and states measure, scope and caveat',()=>{
 const g={nodes:[{id:'x',name:'<script>&"\'x'},{id:'y',name:'Y'}],edges:[edge('x','y',2)]};
 const svg=networkSVG(cooccurrenceNetwork(matrixOf(g)),{scope:'Source <1> & all coders'});
 assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;&amp;&quot;&#39;x'));
 assert.ok(svg.includes('Scope: Source &lt;1&gt; &amp; all coders'));assert.ok(svg.includes('Measure: Distinct overlap intervals'));
 assert.ok(svg.includes('not the importance of themes'));assert.ok(svg.includes('stroke-width="5"'));
 assert.match(svg,/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"[^>]*viewBox="0 0 800 /);
});
test('GraphML carries a community attribute per node',()=>{
 const xml=networkGraphML(cooccurrenceNetwork(matrixOf(graph('abcdefz',bridged().edges)),{layout:false}));
 assert.ok(xml.includes('<key id="community" for="node" attr.name="community" attr.type="int"/>'));
 const communities=[...xml.matchAll(/<node id="(\w)"><data key="label">\w<\/data><data key="community">(-?\d+)<\/data>/g)].map(m=>m[1]+m[2]).join(' ');
 assert.equal(communities,'a1 b1 c1 d2 e2 f2 z-1');
 assert.ok(xml.includes('<data key="degree">3</data>'));assert.equal((xml.match(/<edge /g)||[]).length,7);
 const amp=networkGraphML(cooccurrenceNetwork(matrixOf({nodes:[{id:'p&q',name:'P <&> Q'},{id:'r',name:'R'}],edges:[edge('p&q','r')]}),{layout:false}));
 assert.ok(amp.includes('id="p&amp;q"'));assert.ok(amp.includes('P &lt;&amp;&gt; Q'));
});
