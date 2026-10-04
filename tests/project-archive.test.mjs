import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8,strToU8} from 'fflate';
import {emptyState} from '../src/domain.mjs';
import {canSeekTurn} from '../src/transcript-alignment.mjs';
import {exportProjectArchive,projectMediaReferences,readProjectArchive,restoreProjectMedia} from '../src/project-archive.mjs';

function fixture(){
 const s=emptyState('Synthetic archive');
 s.description='Archive round trip 😀';
 s.documents=[{id:'d',name:'../Interview A',text:'é😀 text\r\n',revision:2,mediaKey:'original/current',mediaType:'audio/wav',attributes:{Consent:false},turns:[{id:'t',start:0,end:9,timeStart:0,timeEnd:1.125,words:[{word:'é😀',start:0,end:.125}]}],alignment:{recordingKey:'original/current',status:'matched',units:'seconds',note:'Verified'},transcription:{recordingKey:'original/current',jobId:'job'},diarization:{recordingKey:'original/current',history:[{recordingKey:'original/previous'}],corrections:[{recordingKey:'original/current',speaker:'Participant'}]},versions:[{revision:1,text:'Previous',mediaKey:'original/previous',mediaType:'audio/mpeg',alignment:{recordingKey:'original/previous',status:'matched'}}]}];
 s.codes=[{id:'c',name:'Theme',color:'#537a92'}];
 s.codings=[{id:'text',documentId:'d',codeId:'c',start:0,end:2,text:'é😀',coder:'Reviewer',status:'accepted'},{id:'media',documentId:'d',codeId:'c',kind:'media',recordingKey:'original/current',timeStart:0,timeEnd:1.125,text:'Media range',coder:'Reviewer',status:'accepted'},{id:'old',documentId:'d',codeId:'c',kind:'media',recordingKey:'original/previous',timeStart:0,timeEnd:1,text:'Previous range',coder:'Reviewer',status:'needs_review'}];
 return s;
}
const mediaFiles={'original/current':new Uint8Array([1,2,3,4]),'original/previous':new Uint8Array([5,6,7])};

test('ZIP with media retains exact project and historical recordings, transcript companions and supplied metadata',async()=>{
 const s=fixture(),before=JSON.stringify(s),metadata={project:{id:'project',revision:4},events:[{action:'coding.review'}],members:[{role:'reviewer'}],jobs:[{id:'job'}],backups:[{revision:3}]};
 const files=unzipSync(await exportProjectArchive(s,{includeMedia:true,mediaFiles,metadata})),result=await readProjectArchive(files);
 assert.equal(JSON.stringify(s),before);
 assert.deepEqual(result.state,s);assert.deepEqual(result.metadata,metadata);
 assert.equal(result.mediaFiles.length,2);
 for(const m of result.mediaFiles)assert.deepEqual(m.bytes,mediaFiles[m.originalKey]);
 const names=Object.keys(files);assert.equal(names.filter(n=>n.startsWith('Media/')).length,2);
 assert.ok(names.every(n=>!n.includes('../')));
 const transcript=JSON.parse(strFromU8(files[names.find(n=>n.endsWith('.transcript.json'))]));
 assert.equal(transcript.text,s.documents[0].text);assert.deepEqual(transcript.versions,s.documents[0].versions);
 assert.equal(strFromU8(files[names.find(n=>n.startsWith('Transcripts/')&&n.endsWith('.txt'))]),s.documents[0].text);
 const scope=JSON.parse(strFromU8(files['EXPORT-SCOPE.json']));assert.ok(scope.excluded.includes('Private account notes'));
});

test('transcript-only ZIP keeps metadata and identifiers while safely detaching unavailable playback',async()=>{
 const s=fixture(),files=unzipSync(await exportProjectArchive(s)),result=await readProjectArchive(files);
 assert.deepEqual(result.state,s);assert.equal(result.mediaFiles.length,0);
 assert.ok(!Object.keys(files).some(n=>n.startsWith('Media/')));
 const detached=restoreProjectMedia(result.state,{});
 assert.equal(detached.documents[0].mediaKey,null);assert.equal(detached.documents[0].alignment.status,'unbound');
 assert.equal(canSeekTurn(detached.documents[0],detached.documents[0].turns[0]),false);
 assert.equal(detached.codings[1].recordingKey,'original/current');assert.equal(detached.codings[1].status,'accepted');
 assert.equal(detached.documents[0].versions[0].mediaKey,'original/previous');assert.deepEqual(s,result.state);
});

test('verified media remapping keeps accepted coding and matched alignment across current and historical fields',()=>{
 const s=fixture(),next=restoreProjectMedia(s,{'original/current':'new/current','original/previous':'new/previous'}),d=next.documents[0];
 assert.equal(d.mediaKey,'new/current');assert.equal(d.alignment.recordingKey,'new/current');assert.equal(d.alignment.status,'matched');
 assert.equal(canSeekTurn(d,d.turns[0]),true);assert.equal(next.codings[1].status,'accepted');assert.equal(next.codings[1].recordingKey,'new/current');
 assert.equal(next.codings[2].recordingKey,'new/previous');assert.equal(next.codings[2].status,'needs_review');
 assert.equal(d.versions[0].mediaKey,'new/previous');assert.equal(d.versions[0].alignment.recordingKey,'new/previous');
 assert.equal(d.diarization.recordingKey,'new/current');assert.equal(d.diarization.history[0].recordingKey,'new/previous');
 assert.equal(d.diarization.corrections[0].recordingKey,'new/current');assert.equal(d.transcription.recordingKey,'new/current');
 assert.equal(s.documents[0].mediaKey,'original/current');assert.deepEqual(d.turns,s.documents[0].turns);
});

test('media references include history once and export fails clearly if any requested media is unavailable',async()=>{
 const refs=projectMediaReferences(fixture());assert.equal(refs.length,2);
 assert.equal(refs.find(r=>r.key==='original/current').historical,false);
 assert.equal(refs.find(r=>r.key==='original/previous').type,'audio/mpeg');
 await assert.rejects(exportProjectArchive(fixture(),{includeMedia:true,mediaFiles:{'original/current':mediaFiles['original/current']}}),/missing requested media: original\/previous/);
});

test('import rejects missing or altered binary media rather than silently omitting assets',async()=>{
 const files=unzipSync(await exportProjectArchive(fixture(),{includeMedia:true,mediaFiles})),manifest=JSON.parse(strFromU8(files['research-weave-archive.json'])),path=manifest.assets[0].path;
 const corrupted={...files,[path]:new Uint8Array([9,2,3,4])};await assert.rejects(readProjectArchive(corrupted),/integrity check failed/);
 const missing={...files};delete missing[path];await assert.rejects(readProjectArchive(missing),/missing media/);
});

test('archives without a native ZIP manifest are left to the existing format importer',async()=>{
 assert.equal(await readProjectArchive({}),null);
});

test('archive uses canonical MIME types and meaningful suffixes for legacy recording containers',async()=>{
 const s=fixture();s.documents[0].mediaType='audio/x-quicktime';s.documents[0].versions[0].mediaType='audio/x-m4a';
 const files=unzipSync(await exportProjectArchive(s,{includeMedia:true,mediaFiles})),result=await readProjectArchive(files);
 assert.equal(result.manifest.assets[0].type,'audio/quicktime');assert.ok(result.manifest.assets[0].path.endsWith('.qta'));
 assert.equal(result.manifest.assets[1].type,'audio/mp4');assert.ok(result.manifest.assets[1].path.endsWith('.m4a'));
 assert.deepEqual(result.state,s);
});

test('import enforces exact media asset coverage, unique identifiers/paths and transcript-only scope',async()=>{
 const files=unzipSync(await exportProjectArchive(fixture(),{includeMedia:true,mediaFiles})),original=JSON.parse(strFromU8(files['research-weave-archive.json']));
 const altered=manifest=>({...files,'research-weave-archive.json':strToU8(JSON.stringify(manifest))});
 await assert.rejects(readProjectArchive(altered({...original,assets:[original.assets[0],original.assets[0]]})),/duplicate media identifiers/);
 await assert.rejects(readProjectArchive(altered({...original,assets:[original.assets[0],{...original.assets[1],path:original.assets[0].path}]})),/duplicate media paths/);
 await assert.rejects(readProjectArchive(altered({...original,includeMedia:false})),/Transcript-only/);
 await assert.rejects(readProjectArchive(altered({...original,assets:[original.assets[0]]})),/missing requested media/);
 await assert.rejects(readProjectArchive(altered({...original,assets:[...original.assets,{...original.assets[0],key:'not-in-state',path:'Media/extra.wav'}]})),/unreferenced media/);
});

test('imported server reference history neither requests unavailable media nor rewrites recorded operation metadata',()=>{
 const s=fixture();s.archiveImport={metadata:{events:[{operation:{data:{mediaKey:'previous-server/missing',recordingKey:'original/current'}}}]}};
 assert.equal(projectMediaReferences(s).length,2);
 const next=restoreProjectMedia(s,{'original/current':'new/current','original/previous':'new/previous'});
 assert.deepEqual(next.archiveImport,s.archiveImport);
});
