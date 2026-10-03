// Independent media comparison. Seconds and normalized region area are separate units.
const KINDS=['media','image','pdf'];
const key=o=>JSON.stringify(o);
function union(spans){const out=[];for(const pair of spans.map(x=>[...x]).sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const last=out.at(-1);if(last&&pair[0]<=last[1])last[1]=Math.max(last[1],pair[1]);else out.push(pair);}return out;}
const sum=spans=>spans.reduce((n,[a,b])=>n+b-a,0);
function intersection(a,b){let total=0,i=0,j=0;while(i<a.length&&j<b.length){total+=Math.max(0,Math.min(a[i][1],b[j][1])-Math.max(a[i][0],b[j][0]));if(a[i][1]<b[j][1])i++;else j++;}return total;}
export function intervalOverlapMeasures(left,right){const a=union(left),b=union(right),l=sum(a),r=sum(b),i=intersection(a,b);return {left:l,right:r,intersection:i,union:l+r-i,jaccard:l+r-i>0?i/(l+r-i):null};}
export function rectangleOverlapMeasures(left,right){const all=[...left,...right],bounds=[...new Set(all.flatMap(r=>[r.x,r.x+r.width]))].sort((a,b)=>a-b);let l=0,r=0,i=0;for(let n=0;n<bounds.length-1;n++){const x=bounds[n],end=bounds[n+1],a=union(left.filter(q=>q.x<=x&&q.x+q.width>=end).map(q=>[q.y,q.y+q.height])),b=union(right.filter(q=>q.x<=x&&q.x+q.width>=end).map(q=>[q.y,q.y+q.height]));l+=(end-x)*sum(a);r+=(end-x)*sum(b);i+=(end-x)*intersection(a,b);}const u=l+r-i;return {left:l,right:r,intersection:i,union:u,jaccard:u>0?i/u:null};}
function validRect(r,w,h){return r&&[r.x,r.y,r.width,r.height,w,h].every(Number.isFinite)&&w>0&&h>0&&r.x>=0&&r.y>=0&&r.width>0&&r.height>0&&r.x+r.width<=w+.000001&&r.y+r.height<=h+.000001;}
function normalizeRect(r,w,h){return {x:r.x/w,y:r.y/h,width:r.width/w,height:r.height/h};}
export function mediaComparisonScope(s,f={}){
 const sourceId=f.sourceId||'',status=f.status||'all',excluded={reference:0,restricted:0,stale:0,invalid:0,unbound:0,dimensionConflict:0};
 const docs=new Map();for(const d of s.documents||[]){if(sourceId&&d.id!==sourceId)continue;if(d.sourceRole==='reference'){excluded.reference++;continue;}if(d.deletedAt||d.reviewFlags?.length||d.reviewStatus==='restricted'){excluded.restricted++;continue;}docs.set(d.id,d);}
 const codings=[];for(const c of s.codings||[]){if(!KINDS.includes(c.kind)||(!['all',''].includes(status)&&c.status!==status)||(f.codeId&&c.codeId!==f.codeId))continue;const d=docs.get(c.documentId);if(!d)continue;if(c.deletedAt||c.status==='needs_review'||c.anchorStatus==='needs_review'||(c.sourceRevision!=null&&c.sourceRevision!==(d.revision??1))){excluded.stale++;continue;}
 if(!d.mediaKey){excluded.unbound++;continue;}
 if(d.mediaType&&((c.kind==='media'&&!/^(audio|video)\//.test(d.mediaType))||(c.kind==='image'&&!d.mediaType.startsWith('image/'))||(c.kind==='pdf'&&d.mediaType!=='application/pdf'))){excluded.invalid++;continue;}
 const mediaIdentity=c.recordingKey||c.mediaKey||c.regionMediaKey||null;
 if(c.kind==='media'){
 if(mediaIdentity!==d.mediaKey){excluded.unbound++;continue;}if(!Number.isFinite(c.timeStart)||!Number.isFinite(c.timeEnd)||c.timeStart<0||c.timeEnd<=c.timeStart){excluded.invalid++;continue;}
 codings.push({...c,comparisonGroup:key([d.id,c.kind,d.mediaKey]),comparisonExtent:[c.timeStart,c.timeEnd]});continue;
 }
 const replaced=(d.versions||[]).some(v=>v.mediaKey&&v.mediaKey!==d.mediaKey);
 if((mediaIdentity&&mediaIdentity!==d.mediaKey)||(!mediaIdentity&&replaced)){excluded.unbound++;continue;}
 const reg=c.region;
 if(c.kind==='image'){
 if(!validRect(reg,1,1)){excluded.invalid++;continue;}const w=Number.isFinite(d.mediaWidth)?d.mediaWidth:null,h=Number.isFinite(d.mediaHeight)?d.mediaHeight:null;
 codings.push({...c,comparisonGroup:key([d.id,c.kind,d.mediaKey,w,h]),comparisonExtent:{...normalizeRect(reg,1,1)}});continue;
 }
 if(!Number.isInteger(reg?.page)||reg.page<1||!validRect(reg,reg.pageWidth,reg.pageHeight)){excluded.invalid++;continue;}
 const page=(d.pages||[]).find(p=>(p.number??p.page)===reg.page);const pageW=page?.width??page?.pageWidth,pageH=page?.height??page?.pageHeight;
 if((Number.isFinite(pageW)&&pageW!==reg.pageWidth)||(Number.isFinite(pageH)&&pageH!==reg.pageHeight)){excluded.dimensionConflict++;continue;}
 codings.push({...c,comparisonPageKey:key([d.id,c.kind,d.mediaKey,reg.page]),comparisonDimensions:key([reg.pageWidth,reg.pageHeight]),comparisonGroup:key([d.id,c.kind,d.mediaKey,reg.page,reg.pageWidth,reg.pageHeight]),comparisonExtent:normalizeRect(reg,reg.pageWidth,reg.pageHeight)});
 }
 const dimensionSets=new Map();for(const c of codings.filter(c=>c.kind==='pdf')){if(!dimensionSets.has(c.comparisonPageKey))dimensionSets.set(c.comparisonPageKey,new Set());dimensionSets.get(c.comparisonPageKey).add(c.comparisonDimensions);}
 const safe=codings.filter(c=>{if(c.kind==='pdf'&&dimensionSets.get(c.comparisonPageKey).size>1){excluded.dimensionConflict++;return false;}return true;});
 return {codings:safe,documents:[...docs.values()],excluded,filters:{sourceId,status,codeId:f.codeId||''},method:'Current media only; reference sources and sources with pending consent flags are withheld. Removed/stale coding, missing or superseded recording bindings, invalid ranges and conflicting PDF page dimensions are excluded. Region coding without a media key is withheld when replacement history exists.'};
}
function exact(rows,a,b){const selections=new Map();for(const c of rows){if(c.coder!==a&&c.coder!==b)continue;const id=key([c.comparisonGroup,c.comparisonExtent]);if(!selections.has(id))selections.set(id,[new Set(),new Set()]);selections.get(id)[c.coder===a?0:1].add(c.codeId);}const matched=[...selections.values()].filter(([l,r])=>l.size===r.size&&[...l].every(c=>r.has(c))).length;return {units:selections.size,matched,percent:selections.size?100*matched/selections.size:null};}
export function compareMediaCoders(s,a,b,f={}){
 if(!a||!b||a===b)throw Error('Choose two distinct coders.');const scope=mediaComparisonScope(s,f),rows=scope.codings.filter(c=>c.coder===a||c.coder===b),codes=new Map((s.codes||[]).map(c=>[c.id,c])),kinds=KINDS.map(kind=>{
 const relevant=rows.filter(c=>c.kind===kind),ids=f.codeId?[f.codeId]:[...new Set(relevant.map(c=>c.codeId))];
 const byCode=ids.map(codeId=>{const applications=relevant.filter(c=>c.codeId===codeId),groups=[...new Set(applications.map(c=>c.comparisonGroup))];let left=0,right=0,intersection=0,totalUnion=0;for(const group of groups){const bound=coder=>applications.filter(c=>c.comparisonGroup===group&&c.coder===coder).map(c=>c.comparisonExtent),m=kind==='media'?intervalOverlapMeasures(bound(a),bound(b)):rectangleOverlapMeasures(bound(a),bound(b));left+=m.left;right+=m.right;intersection+=m.intersection;totalUnion+=m.union;}return {codeId,code:codes.get(codeId)?.name||codeId,left,right,intersection,union:totalUnion,jaccard:totalUnion>0?intersection/totalUnion:null,applications,groupCount:groups.length};});
 const intersection=byCode.reduce((n,c)=>n+c.intersection,0),u=byCode.reduce((n,c)=>n+c.union,0);return {kind,units:kind==='media'?'seconds':'normalized source/page area',byCode,intersection,union:u,jaccard:u>0?intersection/u:null,exact:exact(relevant,a,b),applicationCount:relevant.length};
 });
 return {a,b,scope,kinds,method:'Recording Jaccard uses interval unions in seconds on each current source recording. Region IoU uses true rectangle union/intersection per source/page with equal coordinate dimensions, normalized to page area; duplicate/overlapping selections count once. Codes and sources remain separate; totals weight each code by its selected union. Text codepoints, seconds and area are separate measures. Exact-selection agreement compares code sets at identical boundaries; unmatched selections count as disagreement. No media corpus kappa, researcher independence, consensus or population inference is claimed.'};
}
export function mediaComparisonExportRows(r){return [['First coder','Second coder','Source scope','Decision scope','Selection kind','Units','Code','Code ID','Left union','Right union','Intersection','Union','Jaccard or IoU','Exact selection units','Exact matched sets','Exact percent','Method'],...r.kinds.flatMap(k=>k.byCode.map(c=>[r.a,r.b,r.scope.filters.sourceId||'All eligible sources',r.scope.filters.status,k.kind,k.units,c.code,c.codeId,c.left,c.right,c.intersection,c.union,c.jaccard,k.exact.units,k.exact.matched,k.exact.percent,r.method+' '+r.scope.method]))];}
