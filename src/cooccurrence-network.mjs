// Code co-occurrence network: deterministic Louvain communities, a seeded force layout, and SVG/GraphML/CSV exports.
// Mirrors QualCoder's spring network and community cluster graph without randomness, so the same saved coding always yields the same picture.

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const round=(value,places=4)=>value==null||!Number.isFinite(value)?null:Number(value.toFixed(places));
const EPS=1e-12;
/** Categorical slots in fixed order (validated reference palette); communities past the eighth and unconnected codes fall back to grey. */
export const COMMUNITY_COLORS=['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
export const ISOLATED_COLOR='#9aa5ac';
export const communityColor=(index,isolated=false)=>isolated||index==null||index>=COMMUNITY_COLORS.length?ISOLATED_COLOR:COMMUNITY_COLORS[index];
export const measureLabel=measure=>measure==='jaccard'?'Jaccard (shared / union codepoints)':'Distinct overlap intervals';

/** Weighted undirected graph from a co-occurrence matrix. Node order is codebook order; edges with no overlap or below minWeight are dropped. */
export function cooccurrenceGraph(matrix,{measure='count',minWeight=0,codes=matrix.codes}={}){
 const nodes=codes.map(c=>({id:c.id,name:c.name})),edges=[];
 for(let i=0;i<codes.length;i++)for(let j=i+1;j<codes.length;j++){const cell=matrix.cell(codes[i].id,codes[j].id);if(!cell?.count)continue;const weight=measure==='jaccard'?cell.jaccard:cell.count;if(!(weight>0)||weight<minWeight-EPS)continue;edges.push({source:codes[i].id,target:codes[j].id,weight,count:cell.count,jaccard:cell.jaccard,applications:cell.applications||[]});}
 return {nodes,edges};
}

function adjacency(graph){
 const index=new Map(graph.nodes.map((n,i)=>[n.id,i])),n=graph.nodes.length,adj=Array.from({length:n},()=>new Map());
 for(const e of graph.edges){const a=index.get(e.source),b=index.get(e.target),w=Number(e.weight);if(a==null||b==null||a===b||!(w>0))continue;adj[a].set(b,(adj[a].get(b)||0)+w);adj[b].set(a,(adj[b].get(a)||0)+w);}
 return {index,adj,degree:adj.map(m=>[...m.values()].reduce((s,w)=>s+w,0))};
}

/** Newman modularity Q = Σ_c [L_c/m − (d_c/2m)²] for a node→community assignment (array in node order). Null when the graph has no edge weight. */
export function modularity(graph,membership){
 const {adj,degree}=adjacency(graph),m2=degree.reduce((s,d)=>s+d,0);if(!m2)return null;
 const inside=new Map(),total=new Map();
 adj.forEach((links,i)=>{const c=membership[i];total.set(c,(total.get(c)||0)+degree[i]);for(const [j,w] of links)if(membership[j]===c)inside.set(c,(inside.get(c)||0)+w);});
 let q=0;for(const [c,t] of total)q+=(inside.get(c)||0)/m2-(t/m2)**2;return q;
}

// One Louvain level: greedy local moves over super-nodes in fixed order, ties kept/broken by lowest community id. w is a symmetric Map list with self-loops counted twice.
function localMoves(w,k,m2,start=null){
 const n=w.length,comm=start?[...start]:[...Array(n).keys()],tot=new Array(n).fill(0);comm.forEach((c,i)=>tot[c]+=k[i]);let moved=false,improved=true,guard=0;
 while(improved&&guard++<100){improved=false;
  for(let i=0;i<n;i++){
   const own=comm[i],links=new Map();for(const [j,x] of w[i])if(j!==i)links.set(comm[j],(links.get(comm[j])||0)+x);
   tot[own]-=k[i];
   const gain=c=>(links.get(c)||0)-tot[c]*k[i]/m2;let best=own,bestGain=gain(own);
   for(const c of [...links.keys()].sort((a,b)=>a-b)){const g=gain(c);if(g>bestGain+EPS){best=c;bestGain=g;}}
   tot[best]+=k[i];if(best!==own){comm[i]=best;improved=moved=true;}
  }
 }
 return {comm,moved};
}

/** Deterministic Louvain (resolution 1). Returns membership per node (communities renumbered by first member in node order), communities, Q and weighted degree. */
export function louvain(graph){
 const {adj,degree}=adjacency(graph),n=graph.nodes.length,m2=degree.reduce((s,d)=>s+d,0);
 let membership=[...Array(n).keys()];
 if(m2>0){
  let w=adj.map(m=>new Map(m)),k=[...degree],nodeOf=[...Array(n).keys()];
  for(let level=0;level<50;level++){
   const {comm,moved}=localMoves(w,k,m2);if(!moved)break;
   const ids=new Map();for(const c of comm)if(!ids.has(c))ids.set(c,ids.size);
   nodeOf=nodeOf.map(s=>ids.get(comm[s]));
   const next=Array.from({length:ids.size},()=>new Map());w.forEach((links,i)=>{const a=ids.get(comm[i]);for(const [j,x] of links){const b=ids.get(comm[j]);next[a].set(b,(next[a].get(b)||0)+x);}});
   w=next;k=next.map(m=>[...m.values()].reduce((s,x)=>s+x,0));
  }
  membership=localMoves(adj,degree,m2,nodeOf).comm;// final single-code refinement on the original graph
 }
 const ids=new Map();membership=membership.map(c=>{if(!ids.has(c))ids.set(c,ids.size);return ids.get(c);});
 const communities=Array.from({length:ids.size},()=>[]);membership.forEach((c,i)=>communities[c].push(graph.nodes[i].id));
 return {membership,communities,modularity:modularity(graph,membership),degree};
}

/** Seeded layout: nodes start on a circle ordered by community, then Fruchterman–Reingold relaxes for a fixed number of iterations. No randomness. */
export function networkLayout(graph,{width=800,height=560,membership=null,iterations=240,padding=48,labelWidth=110,labelHeight=24}={}){
 const n=graph.nodes.length;if(!n)return [];
 const {adj}=adjacency(graph),order=[...Array(n).keys()].sort((a,b)=>(membership?membership[a]-membership[b]:0)||a-b),w=width-2*padding,h=height-2*padding;
 if(n===1)return [{x:width/2,y:height/2}];
 const maxW=Math.max(EPS,...adj.flatMap(m=>[...m.values()])),area=w*h,k=Math.sqrt(area/n)*0.9;
 const pos=new Array(n);order.forEach((node,rank)=>{const t=2*Math.PI*rank/n-Math.PI/2;pos[node]={x:Math.cos(t)*w/2.6,y:Math.sin(t)*h/2.6};});
 let temp=Math.min(w,h)/8;const cool=temp/(iterations+1);
 for(let it=0;it<iterations;it++){
  const disp=pos.map(()=>({x:0,y:0}));
  for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){let dx=pos[i].x-pos[j].x,dy=pos[i].y-pos[j].y,d=Math.hypot(dx,dy);if(d<0.01){dx=0.01*(i-j);dy=0.01;d=Math.hypot(dx,dy);}const f=k*k/d;disp[i].x+=dx/d*f;disp[i].y+=dy/d*f;disp[j].x-=dx/d*f;disp[j].y-=dy/d*f;}
  for(let i=0;i<n;i++)for(const [j,x] of adj[i])if(j>i){const dx=pos[i].x-pos[j].x,dy=pos[i].y-pos[j].y,d=Math.max(0.01,Math.hypot(dx,dy)),f=d*d/k*(0.35+0.65*x/maxW);disp[i].x-=dx/d*f;disp[i].y-=dy/d*f;disp[j].x+=dx/d*f;disp[j].y+=dy/d*f;}
  for(let i=0;i<n;i++){disp[i].x-=pos[i].x*0.6;disp[i].y-=pos[i].y*0.6;const d=Math.hypot(disp[i].x,disp[i].y);if(d>0){pos[i].x+=disp[i].x/d*Math.min(d,temp);pos[i].y+=disp[i].y/d*Math.min(d,temp);}}
  temp=Math.max(0.5,temp-cool);
 }
 const xs=pos.map(p=>p.x),ys=pos.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const sx=maxX-minX>EPS?w/(maxX-minX):0,sy=maxY-minY>EPS?h/(maxY-minY):0;
 const out=pos.map(p=>({x:sx?padding+(p.x-minX)*sx:width/2,y:sy?padding+(p.y-minY)*sy:height/2}));
 // Label-box collision pass in pixels. Each box spans the node and its label on the side the label is drawn (left of the node past 62% of the width), then overlapping boxes are pushed apart along the axis needing the smaller relative shift.
 const bw=graph.nodes.map(node=>Math.min(labelWidth,w/2,18+7.2*String(node.name??'').length)),bh=labelHeight,clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),cx=i=>out[i].x>width*0.62?out[i].x+12-bw[i]/2:out[i].x-12+bw[i]/2;
 for(let it=0;it<300;it++){let moved=false;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const dx=cx(j)-cx(i),dy=out[j].y-out[i].y,wx=(bw[i]+bw[j])/2,ox=wx-Math.abs(dx),oy=bh-Math.abs(dy);if(ox<=0.01||oy<=0.01)continue;moved=true;if(ox/wx<oy/bh){const s=(dx<0?-1:1)*ox/2;out[i].x-=s;out[j].x+=s;}else{const s=(dy<0?-1:1)*oy/2;out[i].y-=s;out[j].y+=s;}}for(const p of out){p.x=clamp(p.x,padding,width-padding);p.y=clamp(p.y,padding,height-padding);}if(!moved)break;}
 return out.map(p=>({x:round(p.x,2),y:round(p.y,2)}));
}

/** Full network for display/export: graph, Louvain communities, layout and per-node colour. */
export function cooccurrenceNetwork(matrix,{measure='count',minWeight=0,codes,width=800,height=560,layout=true,labelWidth=210}={}){
 const graph=cooccurrenceGraph(matrix,{measure,minWeight,codes}),result=louvain(graph),points=layout?networkLayout(graph,{width,height,membership:result.membership,labelWidth}):[];
 const nodes=graph.nodes.map((node,i)=>{const isolated=result.degree[i]===0,community=result.membership[i];return {...node,community,degree:result.degree[i],isolated,color:communityColor(community,isolated),x:points[i]?.x,y:points[i]?.y};});
 const communities=result.communities.map((ids,index)=>({index,label:'Cluster '+(index+1),codes:ids.map(id=>nodes.find(n=>n.id===id)),isolated:ids.length===1&&nodes.find(n=>n.id===ids[0]).isolated,color:communityColor(index,ids.length===1&&nodes.find(n=>n.id===ids[0]).isolated)}));
 return {measure,minWeight,width,height,nodes,edges:graph.edges,communities,modularity:result.modularity,maxWeight:Math.max(0,...graph.edges.map(e=>e.weight))};
}
/** Codes ordered so each community's members sit together (communities in first-member order, members in codebook order). */
export function clusterOrder(network){return [...network.nodes].sort((a,b)=>a.isolated-b.isolated||a.community-b.community).map(n=>n.id);}
const weightText=(measure,w)=>measure==='jaccard'?(w*100).toFixed(1)+'%':String(w);
export const edgeWidth=(network,weight)=>1+4*(network.maxWeight?weight/network.maxWeight:0);
export const nodeRadius=(network,degree)=>{const max=Math.max(EPS,...network.nodes.map(n=>n.degree));return 7+9*Math.sqrt(degree/max);};
export function networkCaption(network,{scope=''}={}){return [scope&&'Scope: '+scope,'Measure: '+measureLabel(network.measure),network.minWeight>0?'Edges ≥ '+weightText(network.measure,network.minWeight):'All overlapping pairs','Louvain communities, Q = '+(network.modularity==null?'not defined (no edges)':round(network.modularity,3))].filter(Boolean).join(' · ');}
export const NETWORK_NOTE='Clusters describe where saved coding overlaps, not the importance of themes.';

/** Standalone SVG: nodes coloured by community, edge width scaled by weight, legend and caption. */
export function networkSVG(network,{scope='',title='Code co-occurrence network'}={}){
 const {width,height}=network,top=72,legendRows=network.communities.filter(c=>!c.isolated).length+(network.nodes.some(n=>n.isolated)?1:0),total=top+height+28+legendRows*20+30,idx=new Map(network.nodes.map(n=>[n.id,n]));
 const edges=network.edges.map(e=>{const a=idx.get(e.source),b=idx.get(e.target);return `<line x1="${a.x}" y1="${a.y+top}" x2="${b.x}" y2="${b.y+top}" stroke="#7d8b93" stroke-opacity="0.55" stroke-width="${round(edgeWidth(network,e.weight),2)}"><title>${esc(a.name+' – '+b.name+': '+weightText(network.measure,round(e.weight,4)))}</title></line>`;}).join('');
 const nodes=network.nodes.map(n=>{const r=round(nodeRadius(network,n.degree),2),right=n.x>width*0.62;return `<g><title>${esc(n.name+' · '+(n.isolated?'not connected':'Cluster '+(n.community+1))+' · weighted degree '+round(n.degree,4))}</title><circle cx="${n.x}" cy="${n.y+top}" r="${r}" fill="${n.color}" stroke="#fff" stroke-width="2"/><text x="${right?n.x-r-4:n.x+r+4}" y="${n.y+top+4}" font-size="12" fill="#1f2d35" text-anchor="${right?'end':'start'}" paint-order="stroke" stroke="#fff" stroke-width="3">${esc(n.name.length>28?n.name.slice(0,27)+'…':n.name)}</text></g>`;}).join('');
 let y=top+height+28;const legend=network.communities.filter(c=>!c.isolated).map(c=>{const row=`<rect x="20" y="${y-10}" width="12" height="12" rx="3" fill="${c.color}"/><text x="40" y="${y}" font-size="12" fill="#1f2d35">${esc(c.label+': '+c.codes.map(n=>n.name).join(', '))}</text>`;y+=20;return row;}).join('')+(network.nodes.some(n=>n.isolated)?`<rect x="20" y="${y-10}" width="12" height="12" rx="3" fill="${ISOLATED_COLOR}"/><text x="40" y="${y}" font-size="12" fill="#1f2d35">${esc('Not connected: '+network.nodes.filter(n=>n.isolated).map(n=>n.name).join(', '))}</text>`:'');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}" font-family="system-ui, sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="20" y="26" font-size="16" font-weight="600">${esc(title)}</text><text x="20" y="46" font-size="11" fill="#53616b">${esc(networkCaption(network,{scope}))}</text><text x="20" y="62" font-size="11" fill="#53616b">${esc(NETWORK_NOTE)}</text><g>${edges}</g><g>${nodes}</g>${legend}</svg>`;
}

/** GraphML with a community attribute per node (−1 for unconnected codes) and weighted degree. */
export function networkGraphML(network){
 const isJ=network.measure==='jaccard';
 return '<?xml version="1.0" encoding="UTF-8"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns"><key id="label" for="node" attr.name="label" attr.type="string"/><key id="community" for="node" attr.name="community" attr.type="int"/><key id="degree" for="node" attr.name="weighted_degree" attr.type="double"/><key id="weight" for="edge" attr.name="weight" attr.type="'+(isJ?'double':'int')+'"/><key id="count" for="edge" attr.name="overlap_intervals" attr.type="int"/><key id="jaccard" for="edge" attr.name="jaccard" attr.type="double"/><graph edgedefault="undirected">'+network.nodes.map(n=>'<node id="'+esc(n.id)+'"><data key="label">'+esc(n.name)+'</data><data key="community">'+(n.isolated?-1:n.community+1)+'</data><data key="degree">'+round(n.degree,6)+'</data></node>').join('')+network.edges.map((e,i)=>'<edge id="e'+i+'" source="'+esc(e.source)+'" target="'+esc(e.target)+'"><data key="weight">'+round(e.weight,6)+'</data><data key="count">'+e.count+'</data>'+(e.jaccard==null?'':'<data key="jaccard">'+round(e.jaccard,6)+'</data>')+'</edge>').join('')+'</graph></graphml>';
}

/** CSV rows: scope preamble then Code, Community, Weighted degree. */
export function communityRows(network,{scope=''}={}){
 return [['Scope',scope],['Measure',measureLabel(network.measure)],['Minimum edge weight',network.minWeight],['Modularity Q',network.modularity==null?'N/A':round(network.modularity,4)],['Note',NETWORK_NOTE],[],['Code','Community','Weighted degree'],...network.nodes.map(n=>[n.name,n.isolated?'Not connected':n.community+1,round(n.degree,4)])];
}
