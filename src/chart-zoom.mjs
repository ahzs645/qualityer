// Zoom and pan for SVG charts by rewriting the viewBox, plus a standalone interactive HTML export.
// The chart's own coordinates never change, so clicks, labels and exports keep working while zoomed.
export const MAX_ZOOM=8;
export function parseViewBox(value){const n=String(value||'').trim().split(/[\s,]+/).map(Number);return n.length===4&&n.every(Number.isFinite)&&n[2]>0&&n[3]>0?{x:n[0],y:n[1],w:n[2],h:n[3]}:null;}
export const formatViewBox=v=>[v.x,v.y,v.w,v.h].map(n=>Number(n.toFixed(3))).join(' ');
/** Keep a view inside the base chart and between 1× and MAX_ZOOM×. */
export function clampView(base,v){const w=Math.min(base.w,Math.max(base.w/MAX_ZOOM,v.w)),h=w*base.h/base.w;return {x:Math.min(base.x+base.w-w,Math.max(base.x,v.x)),y:Math.min(base.y+base.h-h,Math.max(base.y,v.y)),w,h};}
/** Zoom by `factor` (>1 zooms in) keeping the point `at` (chart coordinates) fixed; defaults to the view centre. */
export function zoomView(base,view,factor,at){const v=view||base,cx=at?.x??v.x+v.w/2,cy=at?.y??v.y+v.h/2,w=v.w/factor,h=v.h/factor;return clampView(base,{x:cx-(cx-v.x)*w/v.w,y:cy-(cy-v.y)*h/v.h,w,h});}
/** Pan by a distance in chart coordinates. */
export function panView(base,view,dx,dy){const v=view||base;return clampView(base,{...v,x:v.x+dx,y:v.y+dy});}
export const zoomLevel=(base,view)=>view?base.w/view.w:1;

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Remove anything executable from serialized chart markup before embedding it in a standalone page. */
export function inertSvg(svg){return String(svg).replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi,'').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,'').replace(/(href\s*=\s*["'])\s*javascript:[^"']*/gi,'$1#');}

/**
 * A self-contained HTML page: the chart, wheel/pinch/keyboard zoom, drag to pan, hover/focus details from each
 * mark's <title>, and an optional data table. No network requests; works offline and in any modern browser.
 * `rows` is an array of arrays with a header row.
 */
export function interactiveChartHtml({title='Chart',caption='',svg,rows=null}){
 const table=Array.isArray(rows)&&rows.length>1?'<details open><summary>Data table</summary><div class="table"><table><thead><tr>'+rows[0].map(h=>'<th scope="col">'+escapeHtml(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(1).map(r=>'<tr>'+r.map((v,i)=>i?'<td>'+escapeHtml(v)+'</td>':'<th scope="row">'+escapeHtml(v)+'</th>').join('')+'</tr>').join('')+'</tbody></table></div></details>':'';
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
:root{color-scheme:light;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#243c49;background:#f5f7f9}body{margin:0;padding:16px;max-width:1200px;margin-inline:auto}h1{font-size:20px;margin:0 0 4px}p.caption{color:#40545f;font-size:14px;margin:0 0 12px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px}button{font:inherit;min-height:44px;padding:0 14px;border:1px solid #9bb0bd;border-radius:6px;background:#fff;color:#16323f;cursor:pointer}button:focus-visible,.stage:focus-visible{outline:3px solid #1f747c;outline-offset:2px}
.stage{background:#fff;border:1px solid #dce5eb;border-radius:8px;overflow:hidden;touch-action:none;cursor:grab}.stage.dragging{cursor:grabbing}.stage svg{display:block;width:100%;height:auto;max-height:80vh}
#tip{position:fixed;pointer-events:none;background:#14262f;color:#fff;padding:6px 8px;border-radius:4px;font-size:13px;max-width:320px;display:none;z-index:2}.table{overflow:auto;background:#fff;border:1px solid #dce5eb;border-radius:8px}table{border-collapse:collapse;font-size:14px}th,td{padding:6px 10px;border-bottom:1px solid #e6edf1;text-align:left;vertical-align:top}details{margin-top:14px}summary{cursor:pointer;min-height:44px;display:flex;align-items:center}
</style></head><body><h1>${escapeHtml(title)}</h1>${caption?'<p class="caption">'+escapeHtml(caption)+'</p>':''}
<div class="bar"><button type="button" data-z="in">Zoom in</button><button type="button" data-z="out">Zoom out</button><button type="button" data-z="reset">Reset view</button><span id="level" aria-live="polite">100%</span></div>
<div class="stage" tabindex="0" role="group" aria-label="Chart. Use plus and minus to zoom, arrow keys to pan, 0 to reset; Ctrl or ⌘ with scroll, or pinch, to zoom; drag to pan.">${inertSvg(svg)}</div><div id="tip" role="status"></div>${table}
<p class="caption">Exported from Research Weave. Counts describe coding decisions in the stated scope, not prevalence.</p>
<script>(function(){var stage=document.querySelector('.stage'),svg=stage.querySelector('svg'),tip=document.getElementById('tip'),level=document.getElementById('level');if(!svg)return;var b=(svg.getAttribute('viewBox')||'').split(/[\\s,]+/).map(Number);if(b.length!==4||!(b[2]>0)){var r=svg.getBBox();b=[r.x,r.y,r.width,r.height];}var base={x:b[0],y:b[1],w:b[2],h:b[3]},v=Object.assign({},base),MAX=${MAX_ZOOM};
function clamp(n){var w=Math.min(base.w,Math.max(base.w/MAX,n.w)),h=w*base.h/base.w;return{x:Math.min(base.x+base.w-w,Math.max(base.x,n.x)),y:Math.min(base.y+base.h-h,Math.max(base.y,n.y)),w:w,h:h};}
function apply(){svg.setAttribute('viewBox',[v.x,v.y,v.w,v.h].join(' '));level.textContent=Math.round(base.w/v.w*100)+'%';}
function zoom(f,cx,cy){cx=cx==null?v.x+v.w/2:cx;cy=cy==null?v.y+v.h/2:cy;var w=v.w/f,h=v.h/f;v=clamp({x:cx-(cx-v.x)*w/v.w,y:cy-(cy-v.y)*h/v.h,w:w,h:h});apply();}
function pt(e){var r=svg.getBoundingClientRect();return{x:v.x+(e.clientX-r.left)/r.width*v.w,y:v.y+(e.clientY-r.top)/r.height*v.h};}
document.querySelectorAll('[data-z]').forEach(function(btn){btn.addEventListener('click',function(){var z=btn.getAttribute('data-z');if(z==='reset'){v=Object.assign({},base);apply();}else zoom(z==='in'?1.4:1/1.4);});});
stage.addEventListener('wheel',function(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();var p=pt(e);zoom(e.deltaY<0?1.2:1/1.2,p.x,p.y);},{passive:false});
var drag=null;stage.addEventListener('pointerdown',function(e){drag={x:e.clientX,y:e.clientY,v:Object.assign({},v)};stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');});
stage.addEventListener('pointermove',function(e){if(drag){var r=svg.getBoundingClientRect();v=clamp({x:drag.v.x-(e.clientX-drag.x)/r.width*v.w,y:drag.v.y-(e.clientY-drag.y)/r.height*v.h,w:v.w,h:v.h});apply();return;}var t=e.target.closest&&e.target.closest('[aria-label],g,rect,circle,ellipse,path,line,polyline,polygon,text');var title=null;while(t&&t!==svg){var c=t.querySelector&&t.querySelector(':scope>title');if(c){title=c.textContent;break;}if(t.getAttribute&&t.getAttribute('aria-label')){title=t.getAttribute('aria-label');break;}t=t.parentNode;}if(title){tip.textContent=title;tip.style.display='block';tip.style.left=Math.min(innerWidth-330,e.clientX+12)+'px';tip.style.top=(e.clientY+12)+'px';}else tip.style.display='none';});
['pointerup','pointercancel','pointerleave'].forEach(function(n){stage.addEventListener(n,function(){drag=null;stage.classList.remove('dragging');if(n==='pointerleave')tip.style.display='none';});});
stage.addEventListener('keydown',function(e){var s=v.w*0.1,k=e.key;if(k==='+'||k==='=')zoom(1.4);else if(k==='-'||k==='_')zoom(1/1.4);else if(k==='0'){v=Object.assign({},base);apply();}else if(k.indexOf('Arrow')===0){v=clamp({x:v.x+(k==='ArrowLeft'?-s:k==='ArrowRight'?s:0),y:v.y+(k==='ArrowUp'?-s:k==='ArrowDown'?s:0),w:v.w,h:v.h});apply();}else return;e.preventDefault();});
svg.querySelectorAll('line,polyline').forEach(function(l){var t=l.querySelector(':scope>title')||(l.parentNode.querySelectorAll(':scope>line,:scope>polyline').length===1&&l.parentNode.querySelector(':scope>title'));if(!t)return;var hit=l.cloneNode(false);hit.setAttribute('stroke','transparent');hit.setAttribute('stroke-width','14');hit.setAttribute('pointer-events','stroke');hit.removeAttribute('marker-end');hit.appendChild(t.cloneNode(true));l.parentNode.insertBefore(hit,l.nextSibling);});svg.removeAttribute('width');svg.removeAttribute('height');apply();})();</script></body></html>`;
}
