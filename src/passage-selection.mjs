import {cp,slice} from './domain.mjs';
export function passageDraft(document,start,end){
 if(!document||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start||end>cp(document.text).length)return null;
 return {documentId:document.id,sourceRevision:document.revision||1,start,end,text:slice(document.text,start,end)};
}
export function passageIsCurrent(document,draft){return !!draft&&!draft.stale&&draft.documentId===document?.id&&draft.sourceRevision===(document.revision||1)&&passageDraft(document,draft.start,draft.end)?.text===draft.text;}
export function transcriptUnits(document,mode='turns'){
 if(mode==='turns')return (document.turns||[]).map((turn,index)=>{const draft=passageDraft(document,turn.start,turn.end);return draft&&turn.anchorStatus!=='needs_review'&&(turn.text==null||turn.text===draft.text)?{...draft,id:turn.id||'turn-'+index,number:index+1,speaker:turn.speaker||'Unassigned',timeStart:turn.timeStart,timeEnd:turn.timeEnd,label:'Turn '+(index+1)+' · '+(turn.speaker||'Unassigned')}:null;}).filter(Boolean);
 let start=0;return document.text.split('\n').map((line,index)=>{const content=line.endsWith('\r')?line.slice(0,-1):line,end=start+cp(content).length,draft=passageDraft(document,start,end);start+=cp(line).length+1;return draft&&content.trim()?{...draft,id:'line-'+index,number:index+1,label:'Line '+(index+1)}:null;}).filter(Boolean);
}
export function browserPassage(element,document,selection){
 if(!element||!selection||selection.isCollapsed||selection.rangeCount!==1||!element.contains(selection.anchorNode)||!element.contains(selection.focusNode))return null;
 const range=selection.getRangeAt(0),before=range.cloneRange();before.selectNodeContents(element);before.setEnd(range.startContainer,range.startOffset);
 const start=cp(before.toString()).length,draft=passageDraft(document,start,start+cp(range.toString()).length);return draft?.text===range.toString()?draft:null;
}
