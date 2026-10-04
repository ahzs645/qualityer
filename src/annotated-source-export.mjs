import {zipSync,strToU8} from 'fflate';
import {esc} from './report-export.mjs';
import {restrictedSourceRanges} from './source-consent.mjs';

const points = text => Array.from(text || '');
const overlaps = (a,b) => Math.max(a.start,b.start) < Math.min(a.end,b.end);
const layers = new Set(['all','coded','provisional','accepted','flagged']);
const fallbackColor = '#537a92';
const color = value => /^#[a-f\d]{6}$/i.test(value || '') ? value.toLowerCase() : fallbackColor;
const palette = value => { const rgb = color(value).slice(1).match(/../g).map(v => Math.round(parseInt(v,16)*.2+255*.8)); return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''); };
const withheldText = '[Passage withheld: consent review pending or permission withheld]';

function codePath(code,codes){
 const names=[],seen=new Set(); let current=code;
 while(current && !seen.has(current.id)){ seen.add(current.id); names.unshift(current.name || 'Unnamed code'); current=codes.get(current.parentId); }
 return names.join(' / ');
}

/** Build from the authenticated project projection; never fetch or reconstruct hidden coders. */
export function annotatedSourceModel(state,documentId,{coder='',status='all'}={}){
 if(!layers.has(status))throw Error('Choose a supported coding layer.');
 const doc=state.documents?.find(d=>d.id===documentId);
 if(!doc)throw Error('Choose an existing source.');
 const text=points(doc.text),revision=doc.revision||1,codes=new Map((state.codes||[]).map(c=>[c.id,c]));
 // An invalid restricted anchor cannot safely identify which text may be shared.
 const activeFlags=(doc.reviewFlags||[]).filter(f=>f.status!=='included'||f.anchorStatus==='needs_review');
 if(activeFlags.some(f=>!Number.isInteger(f.start)||!Number.isInteger(f.end)||f.start<0||f.end<=f.start||f.end>text.length))throw Error('Resolve invalid consent anchors before exporting an annotated source.');
 const flags=restrictedSourceRanges(doc);
 const selected=(state.codings||[]).filter(c=>c.documentId===doc.id&&!c.deletedAt&&(!coder||c.coder===coder)&&(status==='all'||c.status===status));
 const eligible=selected.filter(c=>(!c.kind||c.kind==='text')&&c.status!=='needs_review'&&codes.has(c.codeId)&&(c.sourceRevision??1)===revision&&Number.isInteger(c.start)&&Number.isInteger(c.end)&&c.start>=0&&c.end>c.start&&c.end<=text.length&&text.slice(c.start,c.end).join('')===c.text&&!flags.some(f=>overlaps(f,c)));
 eligible.sort((a,b)=>a.start-b.start||a.end-b.end||codePath(codes.get(a.codeId),codes).localeCompare(codePath(codes.get(b.codeId),codes))||String(a.coder).localeCompare(String(b.coder))||String(a.id).localeCompare(String(b.id)));
 const applications=eligible.map((c,i)=>({number:i+1,id:c.id,codeId:c.codeId,code:codePath(codes.get(c.codeId),codes),color:color(codes.get(c.codeId).color),coder:String(c.coder||'Unattributed'),status:String(c.status||'coded'),start:c.start,end:c.end,text:c.text}));
 const boundaries=[...new Set([0,text.length,...applications.flatMap(c=>[c.start,c.end]),...flags.flatMap(f=>[f.start,f.end])])].sort((a,b)=>a-b),segments=[];
 for(let i=0;i<boundaries.length-1;i++){
  const start=boundaries[i],end=boundaries[i+1]; if(end<=start)continue;
  const restricted=flags.some(f=>overlaps(f,{start,end}));
  const applied=restricted?[]:applications.filter(c=>c.start<=start&&c.end>=end);
  // Merge adjacent restricted fragments so overlapping flags do not repeat placeholders.
  if(restricted&&segments.at(-1)?.restricted){segments.at(-1).end=end;continue;}
  segments.push({start,end,text:restricted?withheldText:text.slice(start,end).join(''),restricted,applications:applied.map(c=>c.number),color:applied.length?palette(applied[0].color):null});
 }
 return {title:doc.name||'Untitled source',project:state.name||'Untitled study',documentId:doc.id,revision,direction:['ltr','rtl'].includes(doc.direction)?doc.direction:'auto',reviewStatus:doc.reviewStatus||'Pending',sourceRole:doc.sourceRole||'interview',scope:{coder:coder||'All available coders',status},restrictedRanges:flags.length,excludedApplications:selected.length-applications.length,applications,segments};
}

function metadata(model){return [['Study',model.project],['Source',model.title],['Source ID',model.documentId],['Source revision',model.revision],['Transcript review',model.reviewStatus],['Source role',model.sourceRole],['Researcher scope',model.scope.coder],['Decision layer',model.scope.status],['Text code applications',model.applications.length],['Excluded selected applications',model.excludedApplications],['Restricted intervals',model.restrictedRanges]];}
const guidance='Coding highlights identify exact current text applications in the selected scope. Overlapping applications retain separate numbered references. Counts describe coding decisions, not thematic prevalence. Audio, image and PDF region applications, deleted decisions and stale or restricted quotations are excluded. Source revisions, private notes, review rationales, arbitrary source attributes and media bytes are not included.';

export function annotatedSourceHTML(state,documentId,options={}){
 const model=annotatedSourceModel(state,documentId,options);
 const body=model.segments.map(s=>s.restricted?'<span class="withheld">'+esc(s.text)+'</span>':s.applications.length?'<mark style="background:'+s.color+'" title="'+esc(s.applications.map(n=>{const a=model.applications[n-1];return a.code+' · '+a.coder+' · '+a.status;}).join('; '))+'">'+esc(s.text)+'</mark><sup>'+s.applications.map(n=>'<a href="#application-'+n+'">['+n+']</a>').join('')+'</sup>':esc(s.text)).join('');
 return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(model.title)+' · Annotated source</title><style>body{max-width:70rem;margin:2rem auto;padding:0 1.25rem;font:16px/1.6 system-ui;color:#18232c}h1,h2{line-height:1.2}.transcript{white-space:pre-wrap;overflow-wrap:anywhere}.withheld{background:#eee;color:#555}sup{font-size:.65em;white-space:nowrap}sup a{margin-right:.2em;color:#40596f}table{width:100%;border-collapse:collapse}td,th{padding:.5rem;border:1px solid #ccc;text-align:start;vertical-align:top;white-space:pre-wrap;overflow-wrap:anywhere}.scope{font-size:.9rem;color:#485663}blockquote{white-space:pre-wrap;margin:.3rem 0}mark{color:inherit}@media print{body{margin:0;font-size:10pt}thead{display:table-header-group}tr{break-inside:avoid}a{color:inherit;text-decoration:none}mark,.withheld{print-color-adjust:exact;-webkit-print-color-adjust:exact}}</style></head><body><h1>'+esc(model.title)+'</h1><p class="scope">Annotated source · '+esc(model.project)+'</p><table aria-label="Export scope"><tbody>'+metadata(model).map(([k,v])=>'<tr><th>'+esc(k)+'</th><td>'+esc(v)+'</td></tr>').join('')+'</tbody></table><p class="scope">'+guidance+'</p><h2>Source text with coding references</h2><section class="transcript" dir="'+model.direction+'">'+body+'</section><h2>Coding reference ledger</h2><table><thead><tr><th>Reference / code</th><th>Researcher / layer</th><th>Codepoint range</th><th>Exact quotation</th></tr></thead><tbody>'+model.applications.map(a=>'<tr id="application-'+a.number+'"><td>['+a.number+'] '+esc(a.code)+'</td><td>'+esc(a.coder)+'<br>'+esc(a.status)+'</td><td>'+a.start+'–'+a.end+'</td><td>'+esc(a.text)+'</td></tr>').join('')+'</tbody></table>'+(!model.applications.length?'<p>No eligible text coding in this scope. The source remains available above.</p>':'')+'</body></html>';
}

function wordRun(text,{fill,bold=false}={}){
 const properties=(fill?'<w:shd w:val="clear" w:color="auto" w:fill="'+fill.slice(1)+'"/>':'')+(bold?'<w:b/>':'');
 return '<w:r>'+(properties?'<w:rPr>'+properties+'</w:rPr>':'')+String(text??'').split(/\r\n|\r|\n/).map((part,i)=>(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+esc(part)+'</w:t>').join('')+'</w:r>';
}
const paragraph=(text,style='')=>'<w:p>'+(style?'<w:pPr><w:pStyle w:val="'+style+'"/></w:pPr>':'')+wordRun(text)+'</w:p>';
export function annotatedSourceDOCX(state,documentId,options={}){
 const model=annotatedSourceModel(state,documentId,options);
 const content=paragraph(model.title,'Title')+paragraph('Annotated source · '+model.project)+metadata(model).map(([k,v])=>paragraph(k+': '+v)).join('')+paragraph(guidance)+paragraph('Source text with coding references','Heading1')+'<w:p>'+(model.direction==='rtl'?'<w:pPr><w:bidi/></w:pPr>':'')+model.segments.map(s=>wordRun(s.text,{fill:s.restricted?'#eeeeee':s.color})+(s.applications.length?wordRun(s.applications.map(n=>'['+n+']').join(''),{bold:true}):'')).join('')+'</w:p>'+paragraph('Coding reference ledger','Heading1')+model.applications.map(a=>paragraph('['+a.number+'] '+a.code,'Heading2')+paragraph('Researcher: '+a.coder+' · Layer: '+a.status+' · Codepoints: '+a.start+'–'+a.end)+paragraph(a.text)).join('')+(!model.applications.length?paragraph('No eligible text coding in this scope. The source remains available above.'):'');
 const files={
  '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  '_rels/.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/_rels/document.xml.rels':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  'word/styles.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style></w:styles>',
  'word/document.xml':'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+content+'<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080"/></w:sectPr></w:body></w:document>'
 };
 return zipSync(Object.fromEntries(Object.entries(files).map(([path,value])=>[path,strToU8(value)])));
}
