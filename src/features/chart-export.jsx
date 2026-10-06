import React,{useEffect,useRef,useState} from 'react';
import {serializeInlineSvg,svgToPng} from '../image-export.mjs';
import {download} from '../exchange.js';
import {parseViewBox,formatViewBox,zoomView,panView,zoomLevel,interactiveChartHtml} from '../chart-zoom.mjs';
import './chart-export.css';

const resolve=target=>typeof target==='string'?globalThis.document?.getElementById(target):target?.current;

/**
 * Zoom/pan for an on-screen SVG chart: buttons, Ctrl/⌘+wheel or pinch, and drag to pan once zoomed.
 * A drag never triggers the chart's own click handlers; a plain click still does.
 */
export function ChartZoomControls({target}){
 const state=useRef({base:null,view:null,applied:null}),[level,setLevel]=useState(1);
 function current(el){const s=state.current,attr=el.getAttribute('viewBox');if(!s.base||attr!==s.applied){s.base=parseViewBox(attr);s.view=null;s.applied=attr;}return s;}
 function apply(el,view){const s=state.current;s.view=view;s.applied=formatViewBox(view);el.setAttribute('viewBox',s.applied);if(zoomLevel(s.base,view)>1.001)el.dataset.baseViewbox=formatViewBox(s.base);else delete el.dataset.baseViewbox;setLevel(zoomLevel(s.base,view));}
 function step(factor){const el=resolve(target);if(!el)return;const s=current(el);if(!s.base)return;apply(el,factor?zoomView(s.base,s.view,factor):s.base);}
 const gesture=useRef({drag:null,moved:false});
 useEffect(()=>{const el=resolve(target);if(!el)return;const g=gesture.current;
  const point=e=>{const s=current(el),r=el.getBoundingClientRect(),v=s.view||s.base;return {x:v.x+(e.clientX-r.left)/r.width*v.w,y:v.y+(e.clientY-r.top)/r.height*v.h};};
  const wheel=e=>{const s=current(el);if(!s.base||(!e.ctrlKey&&!e.metaKey))return;e.preventDefault();apply(el,zoomView(s.base,s.view,e.deltaY<0?1.2:1/1.2,point(e)));};
  const down=e=>{const s=current(el);if(!s.base||zoomLevel(s.base,s.view)<=1.001||e.button!==0)return;g.drag={x:e.clientX,y:e.clientY,view:s.view};g.moved=false;};
  const move=e=>{const d=g.drag;if(!d)return;const s=state.current,r=el.getBoundingClientRect();if(!g.moved&&Math.hypot(e.clientX-d.x,e.clientY-d.y)<5)return;g.moved=true;el.classList.add('chart-panning');apply(el,panView(s.base,d.view,-(e.clientX-d.x)/r.width*d.view.w,-(e.clientY-d.y)/r.height*d.view.h));};
  const up=()=>{g.drag=null;el.classList.remove('chart-panning');};
  const click=e=>{if(g.moved){e.stopPropagation();e.preventDefault();g.moved=false;}};
  el.addEventListener('wheel',wheel,{passive:false});el.addEventListener('pointerdown',down);globalThis.addEventListener('pointermove',move);globalThis.addEventListener('pointerup',up);el.addEventListener('click',click,true);
  return ()=>{el.removeEventListener('wheel',wheel);el.removeEventListener('pointerdown',down);globalThis.removeEventListener('pointermove',move);globalThis.removeEventListener('pointerup',up);el.removeEventListener('click',click,true);};
 },[target]);
 return <span className="chart-zoom" role="group" aria-label="Chart zoom"><button type="button" onClick={()=>step(1.4)} disabled={level>=7.99}>Zoom in</button><button type="button" onClick={()=>step(1/1.4)} disabled={level<=1.001}>Zoom out</button><button type="button" onClick={()=>step(0)} disabled={level<=1.001}>Reset view</button><span className="chart-zoom-level" aria-live="polite">{Math.round(level*100)}%</span><small className="chart-zoom-hint">Ctrl/⌘ + scroll or pinch to zoom; drag to pan when zoomed.</small></span>;
}

// One SVG source feeds every format so SVG, PNG and HTML carry identical content and provenance captions.
export function ChartExportButtons({name,svg,target,caption,svgLabel='Export SVG',pngLabel='Export PNG',htmlLabel='Export interactive HTML',title,rows,zoom=true,children}){const [error,setError]=useState(''),[busy,setBusy]=useState(false),captionText=()=>typeof caption==='function'?caption():caption||'',source=()=>{if(svg)return svg();const el=resolve(target),zoomed=el?.dataset?.baseViewbox,shown=el?.getAttribute('viewBox');if(zoomed)el.setAttribute('viewBox',zoomed);try{return serializeInlineSvg(el,{caption:captionText()});}finally{if(zoomed)el.setAttribute('viewBox',shown);}};function saveSvg(){try{download(name+'.svg',source(),'image/svg+xml');setError('');}catch(e){setError('SVG export failed: '+e.message);}}async function savePng(){setBusy(true);try{download(name+'.png',await svgToPng(source()),'image/png');setError('');}catch(e){setError('PNG export failed: '+e.message);}finally{setBusy(false);}}function saveHtml(){try{const data=typeof rows==='function'?rows():rows;download(name+'.html',interactiveChartHtml({title:title||name.replace(/[-_]+/g,' ').replace(/^./,c=>c.toUpperCase()),caption:captionText(),svg:source(),rows:data}),'text/html');setError('');}catch(e){setError('HTML export failed: '+e.message);}}return <span className="chart-export">{children}{zoom&&target&&<ChartZoomControls target={target}/>}<button type="button" onClick={saveSvg}>{svgLabel}</button><button type="button" disabled={busy} onClick={savePng}>{busy?'Rendering PNG…':pngLabel}</button><button type="button" onClick={saveHtml}>{htmlLabel}</button>{error&&<span role="alert">{error}</span>}</span>;}
