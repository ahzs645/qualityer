import {Unzip,UnzipInflate} from 'fflate';

export const SOURCE_IMPORT_LIMITS={fileBytes:16*1024*1024,archiveBytes:32*1024*1024,memberBytes:8*1024*1024,members:2048,textUnits:2000000};
export const TEXT_ENCODINGS=[['auto','Automatic (BOM, otherwise strict UTF-8)'],['utf-8','UTF-8'],['utf-16le','UTF-16 little endian'],['utf-16be','UTF-16 big endian'],['windows-1252','Windows-1252']];
const supported=new Set(TEXT_ENCODINGS.map(([value])=>value));
export function decodeSourceText(bytes,encoding='auto'){
 if(!supported.has(encoding))throw Error('Unsupported text encoding.');
 let chosen=encoding,bom=0;
 if(bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf){bom=3;if(chosen==='auto')chosen='utf-8';}
 else if(bytes[0]===0xff&&bytes[1]===0xfe){bom=2;if(chosen==='auto')chosen='utf-16le';}
 else if(bytes[0]===0xfe&&bytes[1]===0xff){bom=2;if(chosen==='auto')chosen='utf-16be';}
 else if(chosen==='auto')chosen='utf-8';
 const expected=bom===3?'utf-8':bytes[0]===0xff?'utf-16le':'utf-16be';
 if(bom&&chosen!==expected)throw Error('Chosen encoding disagrees with this file’s byte-order mark.');
 let text;try{text=new TextDecoder(chosen,{fatal:true,ignoreBOM:true}).decode(bytes.subarray(bom));}catch{throw Error('The file does not decode cleanly as '+chosen+'. Select its original encoding before import.');}
 if(text.includes('\0'))throw Error('Decoded text contains NUL bytes. Select the original text encoding.');
 return {text,encoding:chosen,bomBytes:bom};
}
export async function sourceByteProvenance(bytes,file,format,extra={}){
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return {kind:'file',name:file.name,mediaType:file.type||null,byteLength:bytes.byteLength,sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join(''),format,extractor:'research-weave-plain-text-v1',originalBytesRetained:false,...extra};
}
function checkText(text){if(text.length>SOURCE_IMPORT_LIMITS.textUnits)throw Error('Extracted source exceeds the two-million-unit text limit.');return text;}
function xml(raw){if(/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('XML document declarations and custom entities are not supported.');const doc=new DOMParser().parseFromString(raw,'application/xml');if(doc.querySelector('parsererror'))throw Error('Document XML could not be parsed.');return doc;}
const nodes=(node,local)=>Array.from(node.getElementsByTagNameNS('*',local));
const first=(node,local)=>nodes(node,local)[0];
const safePath=name=>{if(!name||name.startsWith('/')||name.includes('\\')||name.includes('\0')||/^[a-z]+:/i.test(name)||name.split('/').some(p=>p==='..'))throw Error('Archive has an unsafe member path.');return name;};
export function inspectDocumentArchive(bytes){
 if(bytes.byteLength>SOURCE_IMPORT_LIMITS.fileBytes)throw Error('Document archive exceeds the 16 MiB input limit.');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break;}
 if(end<0)throw Error('Document archive has no valid ZIP directory.');
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),offset=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||view.getUint16(end+8,true)!==count||count===65535||offset===0xffffffff||size===0xffffffff||offset+size>end)throw Error('Multi-volume and ZIP64 documents are not supported.');
 if(count>SOURCE_IMPORT_LIMITS.members)throw Error('Document archive contains too many members.');
 let position=offset,total=0;const paths=new Set(),members=new Map();
 for(let i=0;i<count;i++){
  if(position+46>offset+size||view.getUint32(position,true)!==0x02014b50)throw Error('Document archive has an invalid ZIP directory entry.');
  const flags=view.getUint16(position+8,true),method=view.getUint16(position+10,true),compressed=view.getUint32(position+20,true),length=view.getUint32(position+24,true),nameLength=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true),next=position+46+nameLength+extra+comment;
  if(next>offset+size)throw Error('Document archive has a truncated ZIP directory.');
  if(flags&1)throw Error('Encrypted document archives are not supported.');
  if(![0,8].includes(method))throw Error('Document archive uses unsupported compression.');
  let name;try{name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(position+46,position+46+nameLength));}catch{throw Error('Document archive member names must be UTF-8.');}
  safePath(name);if(paths.has(name))throw Error('Document archive contains duplicate member paths.');paths.add(name);members.set(name,{length,crc:view.getUint32(position+16,true)});
  total+=length;if(length>SOURCE_IMPORT_LIMITS.memberBytes||total>SOURCE_IMPORT_LIMITS.archiveBytes||compressed===0xffffffff||length===0xffffffff)throw Error('Document archive exceeds safe extraction limits.');
  position=next;
 }
 if(position!==offset+size)throw Error('Document archive directory size does not match.');
 return {count,total,paths,members};
}
const CRC_TABLE=Uint32Array.from({length:256},(_,i)=>{let value=i;for(let bit=0;bit<8;bit++)value=(value&1)?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function documentArchive(bytes){
 const inspected=inspectDocumentArchive(bytes),archive=Object.create(null),seen=new Set();let total=0;
 const unzip=new Unzip(file=>{
  const expected=inspected.members.get(file.name);if(!expected||seen.has(file.name))throw Error('Archive local entries disagree with its directory.');seen.add(file.name);
  let length=0,crc=0xffffffff;const chunks=[];
  file.ondata=(error,chunk,final)=>{if(error)throw Error('Document archive could not be decompressed safely.');length+=chunk.length;total+=chunk.length;
   if(length>expected.length||length>SOURCE_IMPORT_LIMITS.memberBytes||total>SOURCE_IMPORT_LIMITS.archiveBytes){file.terminate();throw Error('Document archive exceeds its declared safe extraction limits.');}
   for(const value of chunk)crc=CRC_TABLE[(crc^value)&255]^(crc>>>8);chunks.push(chunk);
   if(final){if(length!==expected.length||((crc^0xffffffff)>>>0)!==expected.crc)throw Error('Document archive member checksum or size does not match.');const member=new Uint8Array(length);let offset=0;for(const part of chunks){member.set(part,offset);offset+=part.length;}archive[file.name]=member;}
  };file.start();
 });
 unzip.register(UnzipInflate);
 try{for(let position=0;position<bytes.length;position+=1024)unzip.push(bytes.subarray(position,position+1024),position+1024>=bytes.length);}catch(error){throw Error(error?.message||'Document archive could not be decompressed safely.');}
 if(seen.size!==inspected.count||Object.keys(archive).length!==seen.size)throw Error('Document archive has incomplete member data.');return archive;
}
function memberText(archive,path){const bytes=archive[path];if(!bytes)throw Error('Document archive is missing '+path+'.');return decodeSourceText(bytes).text;}
function directionOf(root){const dir=root?.getAttribute?.('dir');return ['ltr','rtl','auto'].includes(dir)?dir:'auto';}
export function extractHTML(raw){
 // A disconnected template parses HTML without activating scripts, events or resource elements.
 const template=document.createElement('template');template.innerHTML=raw;
 const root=template.content,blocked=new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','IFRAME','OBJECT','EMBED','HEAD','SVG','MATH']),blocks=new Set(['P','DIV','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE','NAV','H1','H2','H3','H4','H5','H6','UL','OL','LI','BLOCKQUOTE','PRE','TR','TABLE','DL','DT','DD']);let output='';
 const newline=()=>{if(output&&!output.endsWith('\n'))output+='\n';};
 const walk=(node,pre=false)=>{
  if(node.nodeType===3){const content=pre?node.nodeValue:node.nodeValue.replace(/[\t\r\n ]+/g,' ');output+=content;return;}
  if(node.nodeType!==1&&node.nodeType!==11)return;
  if(node.nodeType===1){const tag=node.tagName;if(blocked.has(tag)||node.hasAttribute('hidden')||node.getAttribute('aria-hidden')==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(node.getAttribute('style')||''))return;if(tag==='BR'){output+='\n';return;}if(tag==='HR'){newline();return;}if(blocks.has(tag))newline();if(['TD','TH'].includes(tag)&&output&&!output.endsWith('\n')&&!output.endsWith('\t'))output+='\t';}
  for(const child of node.childNodes)walk(child,pre||node.tagName==='PRE');
  if(blocks.has(node.tagName))newline();
 };
 walk(root);const text=checkText(output.replace(/ *\n */g,'\n').replace(/^\n+|\n+$/g,''));
 // The template HTML parser omits outer html/body wrappers; inspect those direction attributes inertly.
 const wrapper=/^\s*(?:<!doctype[^>]*>\s*)?<html\b[^>]*\bdir\s*=\s*["']?(rtl|ltr|auto)/i.exec(raw)||/<body\b[^>]*\bdir\s*=\s*["']?(rtl|ltr|auto)/i.exec(raw);
 return {text,direction:wrapper?.[1]?.toLowerCase()||directionOf(root.querySelector('[dir]')),warnings:['HTML is imported as canonical plain text. Scripts, styles, hidden elements, images, links, formatting and layout are omitted; no page is executed.']};
}
export function extractODT(bytes){
 const archive=documentArchive(bytes),doc=xml(memberText(archive,'content.xml')),body=first(doc,'text');if(!body)throw Error('ODT has no text body.');let output='';
 const walk=(node,inText=false)=>{if(node.nodeType===3){if(inText)output+=node.nodeValue;return;}if(node.nodeType!==1)return;const name=node.localName;if(['tracked-changes','annotation','annotation-end','binary-data','scripts'].includes(name))return;if(name==='s'){const count=Number(node.getAttributeNS('urn:oasis:names:tc:opendocument:xmlns:text:1.0','c')||1);if(!Number.isInteger(count)||count<1||count>10000)throw Error('ODT space run is invalid.');output+=' '.repeat(count);return;}if(name==='tab'){output+='\t';return;}if(name==='line-break'){output+='\n';return;}for(const child of node.childNodes)walk(child,inText||['p','h'].includes(name));if(['p','h'].includes(name))output+='\n';if(name==='table-cell'&&!output.endsWith('\n'))output+='\t';};
 walk(body);return {text:checkText(output.replace(/\n$/,'')),direction:'auto',warnings:['ODT paragraphs, headings, lists and table cells are imported as canonical plain text. Formatting, images, page layout, annotations and tracked-change records are omitted.']};
}
function resolveArchivePath(base,href){if(!href||/^[a-z]+:|^\/|^\\/i.test(href))throw Error('EPUB uses an external or absolute content path.');let decoded;try{decoded=decodeURIComponent(href.split(/[?#]/)[0]);}catch{throw Error('EPUB content path has invalid escaping.');}const parts=base.split('/').slice(0,-1);for(const part of decoded.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)throw Error('EPUB content path escapes the archive.');parts.pop();}else parts.push(part);}return safePath(parts.join('/'));}
export function extractEPUB(bytes){
 const archive=documentArchive(bytes);if(archive['META-INF/encryption.xml'])throw Error('Encrypted or obfuscated EPUBs require an unencrypted text export.');
 const container=xml(memberText(archive,'META-INF/container.xml')),path=safePath(first(container,'rootfile')?.getAttribute('full-path')||''),packageDoc=xml(memberText(archive,path));
 const manifest=new Map(nodes(packageDoc,'item').map(item=>[item.getAttribute('id'),item])),spine=nodes(packageDoc,'itemref').filter(item=>item.getAttribute('linear')!=='no');if(!spine.length)throw Error('EPUB has no readable spine.');
 let text='',direction='auto';const chapters=[];
 for(const item of spine){const entry=manifest.get(item.getAttribute('idref'));if(!entry)throw Error('EPUB spine refers to a missing manifest item.');if(!['application/xhtml+xml','text/html'].includes(entry.getAttribute('media-type')))throw Error('EPUB spine contains unsupported non-HTML content.');const contentPath=resolveArchivePath(path,entry.getAttribute('href')),read=extractHTML(memberText(archive,contentPath));if(text)text+='\n\n';const start=Array.from(text).length;text+=read.text;chapters.push({path:contentPath,start,end:Array.from(text).length});if(direction==='auto')direction=read.direction;checkText(text);}
 return {text,direction,chapters,warnings:['EPUB chapters follow the declared linear spine and are separated by blank lines. Formatting, images, navigation, non-linear sections, links and layout are omitted. Original chapter paths and canonical text bounds are retained.']};
}
const RTF_DESTINATIONS=new Set(['fonttbl','colortbl','stylesheet','info','pict','object','objdata','datastore','xmlnstbl','themedata','colorschememapping','listtable','listoverridetable','revtbl','generator','header','headerl','headerr','footer','footerl','footerr','annotation','fldinst']);
export function extractRTF(raw){
 if(!/^\s*{\\rtf\d/.test(raw))throw Error('RTF document header is missing.');
 let output='',position=0,state={skip:false,uc:1,encoding:'windows-1252'},stack=[],fallback=0;
 const emit=content=>{if(fallback){fallback--;return;}if(!state.skip)output+=content;if(output.length>SOURCE_IMPORT_LIMITS.textUnits)throw Error('Extracted source exceeds the text limit.');};
 while(position<raw.length){const char=raw[position++];if(char==='{'){stack.push({...state});continue;}if(char==='}'){if(!stack.length)throw Error('RTF group is unbalanced.');state=stack.pop();fallback=0;continue;}if(char!=='\\'){if(char!=='\r'&&char!=='\n')emit(char);continue;}const next=raw[position++];if(next===undefined)throw Error('RTF escape is incomplete.');if(['\\','{','}'].includes(next)){emit(next);continue;}if(next==="'"){const pair=raw.slice(position,position+2);if(!/^[0-9a-f]{2}$/i.test(pair))throw Error('RTF hex escape is invalid.');position+=2;emit(new TextDecoder(state.encoding).decode(Uint8Array.of(parseInt(pair,16))));continue;}if(next==='*'){state.skip=true;continue;}if(next==='~'){emit('\u00a0');continue;}if(next==='-'){emit('\u00ad');continue;}if(next==='_'){emit('\u2011');continue;}if(!/[a-z]/i.test(next))continue;
  let word=next;while(/[a-z]/i.test(raw[position]||''))word+=raw[position++];let digits='';if(raw[position]==='-')digits+=raw[position++];while(/[0-9]/.test(raw[position]||''))digits+=raw[position++];const value=digits?Number(digits):null;if(raw[position]===' ')position++;
  if(RTF_DESTINATIONS.has(word)){state.skip=true;continue;}if(word==='bin'){if(!Number.isInteger(value)||value<0||position+value>raw.length)throw Error('RTF binary run is invalid.');position+=value;continue;}if(word==='ansicpg'){if(value!==1252)throw Error('RTF code page '+value+' is unsupported. Export as UTF-8 TXT instead.');state.encoding='windows-1252';continue;}if(word==='uc'){if(!Number.isInteger(value)||value<0||value>16)throw Error('RTF Unicode fallback count is invalid.');state.uc=value;continue;}if(word==='u'){if(!Number.isInteger(value)||value<-32768||value>65535)throw Error('RTF Unicode escape is invalid.');if(!state.skip){output+=String.fromCharCode(value<0?value+65536:value);fallback=state.uc;}continue;}if(['par','line','page'].includes(word))emit('\n');else if(word==='tab')emit('\t');else if(word==='emdash')emit('—');else if(word==='endash')emit('–');else if(word==='bullet')emit('•');else if(word==='lquote')emit('‘');else if(word==='rquote')emit('’');else if(word==='ldblquote')emit('“');else if(word==='rdblquote')emit('”');
 }
 if(stack.length)throw Error('RTF group is unbalanced.');
 if(typeof output.isWellFormed==='function'&&!output.isWellFormed())throw Error('RTF contains an incomplete Unicode surrogate pair.');
 return {text:checkText(output.replace(/\n$/,'')),direction:'auto',warnings:['RTF imports canonical plain text and Unicode escapes. Formatting, images, embedded objects, headers/footers, annotations and field instructions are omitted. Windows-1252 and Unicode RTF are supported; other code pages need a text export.']};
}
export async function readTextDocument(file,{encoding='auto'}={}){
 const extension=file.name.toLowerCase().split('.').at(-1);if(!['txt','md','html','htm','odt','epub','rtf'].includes(extension))return null;
 if(file.size>SOURCE_IMPORT_LIMITS.fileBytes)throw Error('Document exceeds the 16 MiB input limit.');const bytes=new Uint8Array(await file.arrayBuffer());let read,decoded;
 if(extension==='odt')read=extractODT(bytes);else if(extension==='epub')read=extractEPUB(bytes);else {try{decoded=decodeSourceText(bytes,encoding);}catch(error){if(extension!=='rtf'||encoding!=='auto')throw error;decoded=decodeSourceText(bytes,'windows-1252');}read=['html','htm'].includes(extension)?extractHTML(decoded.text):extension==='rtf'?extractRTF(decoded.text):{text:checkText(decoded.text),direction:'auto',warnings:[]};}
 return {...read,turns:[],importProvenance:await sourceByteProvenance(bytes,file,extension,{encoding:decoded?.encoding||'archive-xml',bomBytes:decoded?.bomBytes||0,losses:read.warnings,chapters:read.chapters||[]})};
}
export async function pastedSource(text,name,direction='auto'){
 if(typeof text!=='string'||!text.trim()||!name?.trim())throw Error('Name the source and paste its text.');if(!['auto','ltr','rtl'].includes(direction))throw Error('Choose a text direction.');checkText(text);
 const bytes=new TextEncoder().encode(text),provenance=await sourceByteProvenance(bytes,{name:name.trim(),type:'text/plain'},'pasted-text',{kind:'paste',encoding:'utf-8',losses:[]});return {text,turns:[],direction,warnings:['Pasted text has no supplied timestamps or original file bytes.'],importProvenance:provenance};
}
