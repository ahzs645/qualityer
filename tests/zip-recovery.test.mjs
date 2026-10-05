import test from 'node:test';
import assert from 'node:assert/strict';
import {Zip,ZipDeflate,ZipPassThrough,unzipSync,strToU8,strFromU8} from 'fflate';
import {emptyState} from '../src/domain.mjs';
import {exportProjectArchive,readRecoveredProjectArchive} from '../src/project-archive.mjs';
import {crc32,hasEndOfCentralDirectory,looksLikeZip,recoverZipEntries} from '../src/zip-recovery.mjs';

function fixture(){
 const s=emptyState('Synthetic recovery');
 s.documents=[{id:'d',name:'Interview synthetic',text:'Alpha 😀 beta.\n',revision:1,mediaKey:'p/one',mediaType:'audio/mp4',turns:[]}];
 s.codes=[{id:'c',name:'Theme',color:'#537a92'}];
 s.codings=[{id:'old',documentId:'d',codeId:'c',kind:'media',recordingKey:'p/two',timeStart:0,timeEnd:1,text:'Earlier recording range',coder:'Reviewer',status:'accepted'}];
 return s;
}
const noise=(n,seed)=>{const b=new Uint8Array(n);let x=seed;for(let i=0;i<n;i++){x=(x*1103515245+12345)>>>0;b[i]=x>>>24;}return b;};

// Mirrors the earlier streaming study download: deflated text with data descriptors, stored media, manifest written last.
function streamingZip(entries){
 const chunks=[];const zip=new Zip((error,chunk)=>{if(error)throw error;chunks.push(chunk);});
 for(const [path,bytes,stored] of entries){const file=stored?new ZipPassThrough(path):new ZipDeflate(path,{level:1});zip.add(file);for(let at=0;at<bytes.length;at+=50000)file.push(bytes.subarray(at,at+50000));file.push(new Uint8Array(),true);}
 zip.end();const out=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;
}

test('CRC-32 matches the ZIP polynomial and continues across chunks',()=>{
 assert.equal(crc32(strToU8('hello')),0x3610a686);assert.equal(crc32(strToU8('lo'),crc32(strToU8('hel'))),0x3610a686);assert.equal(crc32(new Uint8Array()),0);
});

test('a streaming ZIP cut off inside the second recording recovers every complete entry and names the incomplete one',async()=>{
 const s=fixture(),one=noise(180000,1),two=noise(400000,2);
 const bytes=streamingZip([['research-weave.json',strToU8(JSON.stringify({format:'research-weave',version:1,state:s}))],['research-weave-project-metadata.json',strToU8('{"events":[]}')],['Transcripts/0001-Interview synthetic.txt',strToU8(s.documents[0].text)],['Media/0001-one.m4a',one,true],['Media/0002-two.qta',two,true],['research-weave-archive.json',strToU8('{}')],['EXPORT-SCOPE.json',strToU8('{}')],['README.txt',strToU8('Last')]]);
 assert.ok(hasEndOfCentralDirectory(bytes));assert.equal(recoverZipEntries(bytes).truncated,false);assert.deepEqual(Object.keys(recoverZipEntries(bytes).files),Object.keys(unzipSync(bytes)));
 const name=strToU8('Media/0002-two.qta'),header=bytes.findIndex((_,i)=>name.every((b,j)=>bytes[i+j]===b)),cut=bytes.subarray(0,header+name.length+250000);
 assert.ok(looksLikeZip(cut));assert.equal(hasEndOfCentralDirectory(cut),false);assert.throws(()=>unzipSync(cut));
 const recovery=recoverZipEntries(cut);
 assert.equal(recovery.truncated,true);assert.equal(recovery.stop,'truncated');
 assert.deepEqual(recovery.complete.map(e=>e.path),['research-weave.json','research-weave-project-metadata.json','Transcripts/0001-Interview synthetic.txt','Media/0001-one.m4a']);
 assert.deepEqual(recovery.files['Media/0001-one.m4a'],one);assert.equal(strFromU8(recovery.files['Transcripts/0001-Interview synthetic.txt']),s.documents[0].text);
 assert.equal(recovery.incomplete.length,1);assert.equal(recovery.incomplete[0].path,'Media/0002-two.qta');assert.ok(recovery.incomplete[0].receivedBytes>200000&&recovery.incomplete[0].receivedBytes<two.length);
 const opened=await readRecoveredProjectArchive(recovery);
 assert.deepEqual(opened.state,s);assert.equal(opened.mediaFiles.length,1);assert.equal(opened.mediaFiles[0].originalKey,'p/one');assert.deepEqual(opened.mediaFiles[0].bytes,one);
 assert.deepEqual(opened.missingMedia.map(m=>m.key),['p/two']);
 assert.match(opened.warnings[0],/^This ZIP is truncated: it has no end-of-central-directory record.*inside Media\/0002-two\.qta\.$/);
 assert.ok(opened.warnings.some(w=>w.startsWith('Incomplete: Media/0002-two.qta (')));
 assert.ok(opened.warnings.some(w=>w.includes('older download did not list its entries')));
 assert.ok(opened.warnings.some(w=>w.startsWith('Recordings not restored:')));
 assert.deepEqual(opened.recovery.incomplete.map(e=>e.path),['Media/0002-two.qta']);
});

test('a ZIP cut off before its native snapshot is complete fails with a clear truncation message',async()=>{
 const s=fixture(),bytes=streamingZip([['research-weave.json',strToU8(JSON.stringify({format:'research-weave',version:1,state:{...s,padding:Array.from(noise(150000,5),b=>b.toString(16)).join('')}}))],['README.txt',strToU8('Last')]]);
 const recovery=recoverZipEntries(bytes.subarray(0,4000));
 assert.equal(recovery.complete.length,0);assert.equal(recovery.incomplete[0].path,'research-weave.json');
 await assert.rejects(readRecoveredProjectArchive(recovery),/^Error: This ZIP is truncated: .*inside research-weave\.json\. Its native project snapshot \(research-weave\.json\) did not arrive complete/);
 const header=recoverZipEntries(bytes.subarray(0,20));assert.equal(header.incomplete[0].reason,'An entry header was cut off.');
});

test('archives with sizes in local headers (exportProjectArchive) recover the same way',async()=>{
 const s=fixture(),one=noise(90000,3),two=noise(120000,4);
 const bytes=await exportProjectArchive(s,{includeMedia:true,mediaFiles:{'p/one':one,'p/two':two}}),whole=recoverZipEntries(bytes);
 assert.equal(whole.truncated,false);assert.equal(whole.incomplete.length,0);assert.deepEqual(Object.keys(whole.files).sort(),Object.keys(unzipSync(bytes)).sort());
 const cut=recoverZipEntries(bytes.subarray(0,bytes.length-60000)),missing=cut.incomplete[0];
 assert.equal(cut.truncated,true);assert.ok(cut.files['research-weave.json']);assert.ok(missing.path.startsWith('Media/0002-'));assert.equal(missing.expectedBytes,two.length);
 const opened=await readRecoveredProjectArchive(cut);assert.deepEqual(opened.state,s);assert.deepEqual(opened.mediaFiles.map(m=>m.originalKey),['p/one']);
});
