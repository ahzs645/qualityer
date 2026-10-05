import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PeakAccumulator,audioIndex,planRanges,streamingPeaks,bindImportedPeaks,topLevelBoxes} from '../src/streaming-peaks.mjs';
import {quantizePeaks,validateMediaPeaks} from '../src/media-peaks.mjs';
import {ffmpegPeaks} from '../scripts/media-peaks.mjs';

let ffmpeg=true;try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{ffmpeg=false;}
const dir=mkdtempSync(join(tmpdir(),'peaks-'));
// 6 s stereo AAC: 3 s of a loud tone then 3 s of silence; ffmpeg writes the index (moov) after the audio.
function fixture(){const f=join(dir,'tone.m4a');execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=3','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-filter_complex','[0]volume=6,aformat=channel_layouts=stereo[a];[1]atrim=duration=3[b];[a][b]concat=n=2:v=0:a=1','-c:a','aac','-b:a','96k',f]);return f;}
const reader=bytes=>async(a,b)=>{const s=bytes.subarray(a,b);return s.buffer.slice(s.byteOffset,s.byteOffset+s.byteLength);};

test('accumulated chunks give the same peaks as decoding everything at once',()=>{
 const rate=1000,seconds=12,n=rate*seconds,left=new Float32Array(n),right=new Float32Array(n);for(let i=0;i<n;i++){left[i]=Math.sin(i/7)*(i/n);right[i]=-Math.cos(i/5)*0.3;}
 const whole=quantizePeaks([left,right],{sampleRate:rate,duration:seconds,recordingKey:'k',etag:'e',size:1,bucketsPerSecond:10});
 const acc=new PeakAccumulator({duration:seconds,bucketsPerSecond:10});for(let i=0;i<n;i+=777)acc.add([left.subarray(i,i+777),right.subarray(i,i+777)],i/rate,rate);
 const parts=acc.result({recordingKey:'k',etag:'e',size:1,sampleRate:rate});assert.deepEqual(parts.min,whole.min);assert.deepEqual(parts.max,whole.max);
 validateMediaPeaks(parts);
});
test('byte ranges stay contiguous and bounded',()=>{const s=[{offset:10,size:5},{offset:15,size:5},{offset:20,size:5},{offset:40,size:5}];assert.deepEqual(planRanges(s,10).map(r=>[r.start,r.end,r.samples.length]),[[10,20,2],[20,25,1],[40,45,1]]);});
test('imported peaks are bound to the recording only when durations agree',()=>{const p={duration:100,sampleRate:8000,bucketsPerSecond:10,min:[0],max:[1]};assert.equal(bindImportedPeaks(p,{recordingKey:'k',etag:'e',size:9,duration:100.1}).recordingKey,'k');assert.throws(()=>bindImportedPeaks(p,{recordingKey:'k',etag:'e',size:9,duration:130}),/100\.0 s recording/);assert.throws(()=>bindImportedPeaks({},{}),/not a waveform peaks file/);});

test('MP4 index is read from small ranges, with the AAC decoder config',{skip:!ffmpeg&&'ffmpeg not installed'},async()=>{
 const bytes=readFileSync(fixture()),reads=[],read=async(a,b)=>{reads.push(b-a);return reader(bytes)(a,b);};
 const index=await audioIndex(read,bytes.length);
 assert.match(index.config.codec,/^mp4a\.40\.2$/);assert.equal(index.config.numberOfChannels,2);assert.equal(index.config.sampleRate,48000);assert.ok(index.config.description?.length>=2);
 assert.ok(Math.abs(index.duration-6)<0.1);const mdat=index.boxes.find(b=>b.type==='mdat');
 assert.ok(index.samples.every(s=>s.offset>=mdat.start&&s.offset+s.size<=mdat.start+mdat.size));
 assert.ok(!reads.some(n=>n>=mdat.size),'the audio data itself is never read while indexing');
});
test('streaming decode feeds every sample in order and releases frames',{skip:!ffmpeg&&'ffmpeg not installed'},async()=>{
 const bytes=readFileSync(fixture());let closed=0,fed=0,lastTs=-1,configured=null;
 class FakeChunk{constructor(o){Object.assign(this,o);}}
 // Stands in for WebCodecs: emits 1024 frames per chunk, loud before 3 s and silent after, like the fixture.
 class FakeDecoder{constructor({output}){this.output=output;this.decodeQueueSize=0;}static async isConfigSupported(c){return {supported:/^mp4a/.test(c.codec)};}configure(c){configured=c;}decode(chunk){assert.ok(chunk.timestamp>lastTs);lastTs=chunk.timestamp;fed++;const n=1024,level=chunk.timestamp<3e6?0.8:0,planes=[new Float32Array(n).fill(level),new Float32Array(n).fill(-level)];this.output({numberOfFrames:n,numberOfChannels:2,sampleRate:48000,timestamp:chunk.timestamp,copyTo:(dst,{planeIndex})=>dst.set(planes[planeIndex]),close:()=>closed++});}async flush(){}close(){}}
 let progress=0;const peaks=await streamingPeaks({readRange:reader(bytes),size:bytes.length,AudioDecoderImpl:FakeDecoder,EncodedAudioChunkImpl:FakeChunk,onProgress:p=>{progress=p;}});
 const index=await audioIndex(reader(bytes),bytes.length);assert.equal(fed,index.samples.length);assert.equal(closed,fed);assert.equal(progress,1);assert.ok(configured.description);
 const at=s=>peaks.max[Math.floor(s*peaks.bucketsPerSecond)];assert.equal(at(1),Math.round(0.8*127));assert.equal(at(5),0);
 assert.equal(validateMediaPeaks({...peaks,recordingKey:'k',etag:'e',size:bytes.length}).duration,peaks.duration);
});
test('an incomplete recording is reported instead of producing a partial waveform',{skip:!ffmpeg&&'ffmpeg not installed'},async()=>{
 const bytes=readFileSync(fixture()),cut=bytes.subarray(0,Math.floor(bytes.length*0.6));
 await assert.rejects(audioIndex(reader(cut),cut.length),/incomplete/);
 const boxes=await topLevelBoxes(reader(cut),cut.length);assert.ok(boxes.at(-1).truncated);
 await assert.rejects(streamingPeaks({readRange:reader(bytes),size:bytes.length,AudioDecoderImpl:null}),/WebCodecs is unavailable/);
});
test('the ffmpeg script finds the loud and silent halves',{skip:!ffmpeg&&'ffmpeg not installed'},async()=>{
 const p=await ffmpegPeaks(fixture());assert.ok(Math.abs(p.duration-6)<0.1);const at=s=>Math.max(p.max[Math.floor(s*p.bucketsPerSecond)],-p.min[Math.floor(s*p.bucketsPerSecond)]);
 assert.ok(at(1.5)>50,'tone is loud: '+at(1.5));assert.ok(at(4.5)<3,'silence is quiet: '+at(4.5));assert.equal(p.recordingKey,undefined);
 const bound=bindImportedPeaks(p,{recordingKey:'k',etag:'e',size:10,duration:p.duration});validateMediaPeaks(bound);
});
