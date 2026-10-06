import {interactiveChartHtml} from '../chart-zoom.mjs';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {cooccurrenceNetwork,networkSVG,networkGraphML,communityRows,networkCaption,edgeWidth,nodeRadius,NETWORK_NOTE,ISOLATED_COLOR} from '../cooccurrence-network.mjs';
import {safeCSV} from '../report-export.mjs';
import {download} from '../exchange.js';
import './cooccurrence-network.css';

const fmt=(measure,w)=>measure==='jaccard'?(w*100).toFixed(1)+'%':String(w);
function useWidth(){const ref=useRef(null),[width,setWidth]=useState(800);useEffect(()=>{const el=ref.current;if(!el||typeof ResizeObserver==='undefined')return;const ro=new ResizeObserver(([entry])=>setWidth(Math.round(entry.contentRect.width)||800));ro.observe(el);return ()=>ro.disconnect();},[]);return [ref,width];}

/** Interactive community network of code co-occurrence. Layout is recomputed for the container width so labels stay legible on phones. */
export function CooccurrenceNetwork({matrix,codes,measure,minWeight,scope,onEdge}){
 const [ref,box]=useWidth(),[focus,setFocus]=useState(null),width=Math.max(300,Math.min(1000,box)),narrow=width<560,height=narrow?Math.round(width*1.35):Math.round(Math.min(620,width*0.62));
 const codeKey=codes.map(c=>c.id).join('\u0000'),network=useMemo(()=>cooccurrenceNetwork(matrix,{measure,minWeight,codes,width,height,labelWidth:narrow?136:200}),[matrix,measure,minWeight,codeKey,width,height,narrow]);
 const byId=useMemo(()=>new Map(network.nodes.map(n=>[n.id,n])),[network]),focused=focus&&byId.get(focus);
 const links=focused?network.edges.filter(e=>e.source===focus||e.target===focus):[],near=new Set(links.flatMap(e=>[e.source,e.target]));
 const exportNetwork=()=>cooccurrenceNetwork(matrix,{measure,minWeight,codes,width:900,height:620});
 const max=narrow?16:26,label=name=>name.length>max?name.slice(0,max-1)+'…':name;
 const toggle=id=>setFocus(f=>f===id?null:id);
 if(!network.nodes.length)return <p className="muted">No co-occurring codes in this scope.</p>;
 return <div className="con-network">
  <div className="con-actions"><button onClick={()=>download('code-cooccurrence-network.svg',networkSVG(exportNetwork(),{scope}),'image/svg+xml')}>Export network SVG</button><button onClick={()=>{const n=exportNetwork();download('code-cooccurrence-network.html',interactiveChartHtml({title:'Code co-occurrence network',caption:scope,svg:networkSVG(n,{scope}),rows:[['Code A','Code B','Weight'],...(n.edges||n.links||[]).map(e=>[n.nodes.find(x=>x.id===(e.source??e.a))?.name??e.source??e.a,n.nodes.find(x=>x.id===(e.target??e.b))?.name??e.target??e.b,e.weight??e.count??''])]}),'text/html');}}>Export network HTML</button><button onClick={()=>download('code-cooccurrence-communities.graphml',networkGraphML(network),'application/xml')}>Export GraphML with communities</button><button onClick={()=>download('code-communities.csv',safeCSV(communityRows(network,{scope})),'text/csv')}>Export community CSV</button></div>
  <p className="muted con-caption">{networkCaption(network,{scope})}. {NETWORK_NOTE} Edge width follows the measure; node size follows weighted degree. Select a code to highlight its neighbours, or a line to open its passages.</p>
  <div className="con-canvas" ref={ref}><svg viewBox={`0 0 ${width} ${height}`} role="group" aria-label={'Co-occurrence network of '+network.nodes.length+' codes in '+network.communities.filter(c=>!c.isolated).length+' clusters'}>
   <rect width={width} height={height} fill="transparent" onClick={()=>setFocus(null)}/>
   <g className="con-edges">{network.edges.map(e=>{const a=byId.get(e.source),b=byId.get(e.target),on=focused&&(e.source===focus||e.target===focus);return <g key={e.source+'|'+e.target} className={'con-edge'+(on?' on':focused?' dim':'')} onClick={()=>onEdge(e,a,b)}><title>{a.name+' – '+b.name+': '+fmt(measure,+e.weight.toFixed(4))+' · '+e.count+' overlap intervals'}</title><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="hit"/><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={edgeWidth(network,e.weight)}/></g>})}</g>
   <g className="con-nodes">{network.nodes.map(n=>{const r=nodeRadius(network,n.degree),right=n.x>width*0.62,state=focused?(n.id===focus?' on':near.has(n.id)?' near':' dim'):'';return <g key={n.id} className={'con-node'+state} role="button" tabIndex={0} aria-pressed={n.id===focus} aria-label={n.name+', '+(n.isolated?'not connected':'cluster '+(n.community+1))+', weighted degree '+(+n.degree.toFixed(4))} onClick={()=>toggle(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle(n.id);}}}><title>{n.name}</title><circle cx={n.x} cy={n.y} r={r} fill={n.color}/><text x={right?n.x-r-4:n.x+r+4} y={n.y+4} textAnchor={right?'end':'start'}>{label(n.name)}</text></g>})}</g>
  </svg></div>
  {focused&&<div className="con-links"><strong>{focused.name}</strong>{links.length?<ul>{links.map(e=>{const other=byId.get(e.source===focus?e.target:e.source);return <li key={other.id}><button onClick={()=>onEdge(e,focused,other)}>{other.name}<span>{fmt(measure,+e.weight.toFixed(4))}</span></button></li>})}</ul>:<span className="muted"> has no edges at this threshold.</span>}</div>}
  <div className="con-legend"><p><strong>Modularity Q = {network.modularity==null?'not defined':network.modularity.toFixed(3)}</strong> <span className="muted">Louvain communities on the edges shown; higher Q means denser overlap inside clusters than between them.</span></p><ol>{network.communities.filter(c=>!c.isolated).map(c=><li key={c.index}><i style={{background:c.color}}/><span><b>{c.label}</b> {c.codes.map((n,i)=><React.Fragment key={n.id}>{i?', ':''}<button className="con-code" onClick={()=>toggle(n.id)}>{n.name}</button></React.Fragment>)}</span></li>)}{network.nodes.some(n=>n.isolated)&&<li><i style={{background:ISOLATED_COLOR}}/><span><b>Not connected</b> {network.nodes.filter(n=>n.isolated).map(n=>n.name).join(', ')}</span></li>}</ol></div>
 </div>;
}
