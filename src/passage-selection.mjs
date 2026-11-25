import {cp,slice} from './domain.mjs';
import {pointLength} from './text-points.mjs';
import {transcriptReadingRows} from './transcript-presentation.mjs';
export function passageDraft(document,start,end){
 if(!document||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>pointLength(document.text))return null;
 return {documentId:document.id,sourceRevision:document.revision||1,start,end,text:slice(document.text,start,end)};
}
export function passageIsCurrent(document,draft){return !!draft&&!draft.stale&&draft.documentId===document?.id&&draft.sourceRevision===(document.revision||1)&&passageDraft(document,draft.start,draft.end)?.text===draft.text;}
export function transcriptUnits(document,mode='turns'){
 if(mode==='sentences')return transcriptReadingRows(document,'sentences').filter(row=>row.text.trim()).map(row=>({...passageDraft(document,row.start,row.end),id:row.id,number:row.number,label:'Sentence '+row.number}));
 if(mode==='turns')return (document.turns||[]).map((turn,index)=>{const draft=passageDraft(document,turn.start,turn.end);return draft&&turn.anchorStatus!=='needs_review'&&(turn.text==null||turn.text===draft.text)?{...draft,id:turn.id||'turn-'+index,number:index+1,speaker:turn.speaker||'Unassigned',timeStart:turn.timeStart,timeEnd:turn.timeEnd,label:'Turn '+(index+1)+' · '+(turn.speaker||'Unassigned')}:null;}).filter(Boolean);
 let start=0;return document.text.split('\n').map((line,index)=>{const content=line.endsWith('\r')?line.slice(0,-1):line,end=start+cp(content).length,draft=passageDraft(document,start,end);start+=cp(line).length+1;return draft&&content.trim()?{...draft,id:'line-'+index,number:index+1,label:'Line '+(index+1)}:null;}).filter(Boolean);
}
// Each rendered transcript span carries its exact source offsets (data-start/data-end). Offsets are taken from the span
// that contains each end of the selection, so rows, gaps, labels or virtualised content elsewhere cannot shift them.
function spanPoint(element,container,offset,edge){
 const node=container.nodeType===1?container:container.parentElement,span=node?.closest?.('[data-transcript-text]');
 if(span&&element.contains(span)){const r=span.ownerDocument.createRange();r.selectNodeContents(span);r.setEnd(container,offset);return Number(span.dataset.start)+cp(r.toString()).length;}
 // Boundary between spans (e.g. at a row edge): use the nearest span after (for a start) or before (for an end).
 const spans=[...element.querySelectorAll('[data-transcript-text]')],probe=element.ownerDocument.createRange();probe.setStart(container,offset);probe.collapse(true);
 if(edge==='start'){const next=spans.find(s=>probe.comparePoint(s,0)>=0);return next?Number(next.dataset.start):null;}
 const prev=[...spans].reverse().find(s=>probe.comparePoint(s,s.childNodes.length)<=0);return prev?Number(prev.dataset.end):null;
}
const squash=t=>String(t).replace(/\s+/g,'');
export function browserPassage(element,document,selection){
 if(!element||!selection||selection.isCollapsed||selection.rangeCount!==1||!element.contains(selection.anchorNode)||!element.contains(selection.focusNode))return null;
 const range=selection.getRangeAt(0);
 const inControls=node=>(node.nodeType===1?node:node.parentElement)?.closest?.('[data-transcript-ui]');if(inControls(selection.anchorNode)||inControls(selection.focusNode))return null;
 const sourceText=r=>{const fragment=r.cloneContents();fragment.querySelectorAll('[data-transcript-ui]').forEach(node=>node.remove());return fragment.textContent;};
 const text=sourceText(range);
 if(element.querySelector('[data-transcript-text]')){
  const start=spanPoint(element,range.startContainer,range.startOffset,'start'),end=spanPoint(element,range.endContainer,range.endOffset,'end');
  if(!Number.isInteger(start)||!Number.isInteger(end)||end<=start)return null;
  const draft=passageDraft(document,start,end);
  // Rendered rows omit some whitespace between turns, so compare without whitespace; any other difference means the selection is not this source text.
  return draft&&squash(draft.text)===squash(text)?draft:null;
 }
 const before=range.cloneRange();before.selectNodeContents(element);before.setEnd(range.startContainer,range.startOffset);
 const start=cp(sourceText(before)).length,draft=passageDraft(document,start,start+cp(text).length);return draft?.text===text?draft:null;
}

