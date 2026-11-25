// Waveform peaks for long recordings without holding the decoded audio in memory.
// MP4-family files (m4a, mp4, mov, qta) are indexed with mp4box from small byte-range reads, each compressed
// sample is fed to the browser's WebCodecs AudioDecoder, and decoded frames are folded into min/max buckets
// and released immediately. Memory stays at a few megabytes whatever the recording length.
import {createFile} from 'mp4box';
import {PEAKS_VERSION,PEAKS_MAX_BUCKETS,peaksBucketsPerSecond} from './media-peaks.mjs';

const q=v=>Math.max(-127,Math.min(127,Math.round((Number.isFinite(v)?v:0)*127)));

/** Min/max per time bucket, accumulated chunk by chunk. Chunks may arrive in any order and at any sample rate. */
export class PeakAccumulator{
 constructor({duration,bucketsPerSecond=peaksBucketsPerSecond(duration)}){if(!(duration>0))throw Error('Recording duration is unknown.');this.duration=duration;this.bucketsPerSecond=bucketsPerSecond;this.buckets=Math.max(1,Math.min(PEAKS_MAX_BUCKETS,Math.ceil(duration*bucketsPerSecond)));this.min=new Float32Array(this.buckets);this.max=new Float32Array(this.buckets);this.frames=0;}
 /** channels: Float32Array per channel (planar); startTime in seconds; sampleRate of these frames. */
 add(channels,startTime,sampleRate){const length=channels[0]?.length||0,{min,max,buckets,bucketsPerSecond:bps}=this;for(let i=0;i<length;i++){const b=Math.min(buckets-1,Math.max(0,Math.floor((startTime+i/sampleRate)*bps)));let lo=min[b],hi=max[b];for(const c of channels){const v=c[i];if(v<lo)lo=v;else if(v>hi)hi=v;}min[b]=lo;max[b]=hi;}this.frames+=length;}
 result({recordingKey,etag,size,sampleRate}){return {version:PEAKS_VERSION,recordingKey,etag,size,sampleRate,duration:this.duration,bucketsPerSecond:this.bucketsPerSecond,min:Array.from(this.min,q),max:Array.from(this.max,q)};}
}

/** Top-level ISO BMFF boxes from 16-byte header reads. `readRange(start,end)` returns an ArrayBuffer for [start,end). */
export async function topLevelBoxes(readRange,size){const boxes=[];let at=0;while(at+8<=size&&boxes.length<64){const head=new DataView(await readRange(at,Math.min(size,at+16)));let length=head.getUint32(0),header=8;const type=String.fromCharCode(head.getUint8(4),head.getUint8(5),head.getUint8(6),head.getUint8(7));if(length===1){length=Number(head.getBigUint64(8));header=16;}else if(length===0)length=size-at;if(length<header||!/^[\x20-\x7e]{4}$/.test(type))throw Error('This recording is not a readable MP4/QuickTime file.');boxes.push({type,start:at,size:length,truncated:at+length>size});at+=length;}return boxes;}

/** MP4 sample-entry codec names → WebCodecs codec strings. */
export function webCodecsCodec(codec){const c=String(codec||'');if(/^opus$/i.test(c))return 'opus';if(/^mp4a\.(6b|69)$/i.test(c)||/^\.mp3$/i.test(c))return 'mp3';if(/^flac$/i.test(c))return 'flac';if(/^(ulaw|alaw)$/i.test(c))return c.toLowerCase();return c;}
/** Parse ftyp + moov only, and return the first audio track's decoder config and sample table (absolute file offsets). */
export async function audioIndex(readRange,size){
 const boxes=await topLevelBoxes(readRange,size),ftyp=boxes.find(b=>b.type==='ftyp'),moov=boxes.find(b=>b.type==='moov');
 if(!moov)throw Error(boxes.some(b=>b.truncated)?'This recording file is incomplete: its index (moov) is missing, so it cannot be decoded.':'This recording has no MP4 index (moov).');
 if(moov.truncated)throw Error('This recording file is incomplete: its index (moov) is cut off.');
 if(moov.size>64*1024*1024)throw Error('This recording’s index is unexpectedly large.');
 const file=createFile();let info=null,error=null;file.onReady=i=>{info=i;};file.onError=e=>{error=e;};
 let at=0;if(ftyp){const b=await readRange(ftyp.start,ftyp.start+ftyp.size);b.fileStart=0;file.appendBuffer(b);at=ftyp.size;}
 const m=await readRange(moov.start,moov.start+moov.size);m.fileStart=at;file.appendBuffer(m);file.flush();
 if(error||!info)throw Error('The recording index could not be read'+(error?': '+error:'.'));
 const track=info.audioTracks?.[0];if(!track)throw Error('This recording has no audio track.');
 const trak=file.getTrackById(track.id),entry=trak.mdia.minf.stbl.stsd.entries[0],samples=trak.samples.map(s=>({offset:s.offset,size:s.size,cts:s.cts,duration:s.duration}));
 const asc=entry.esds?.esd?.descs?.[0]?.descs?.[0]?.data,description=asc?new Uint8Array(asc):undefined;
 const config={codec:webCodecsCodec(track.codec),sampleRate:track.audio.sample_rate,numberOfChannels:track.audio.channel_count,...(description?{description}:{})};
 const end=samples.reduce((n,s)=>Math.max(n,s.offset+s.size),0);if(end>size)throw Error('This recording file is incomplete: its audio data is cut off.');
 return {config,timescale:track.timescale,duration:track.duration/track.timescale,samples,boxes};
}

/** Group samples into contiguous byte ranges of about `chunkBytes`, preserving order. */
export function planRanges(samples,chunkBytes=4*1024*1024){const ranges=[];let cur=null;for(const s of samples){if(cur&&s.offset===cur.end&&cur.end-cur.start+s.size<=chunkBytes){cur.end+=s.size;cur.samples.push(s);}else{cur={start:s.offset,end:s.offset+s.size,samples:[s]};ranges.push(cur);}}return ranges;}

/**
 * Decode an MP4-family recording to peaks with WebCodecs. Dependencies are injectable for tests.
 * readRange(start,end) → ArrayBuffer; returns the quantized peaks object (recordingKey/etag/size filled by caller).
 */
export async function streamingPeaks({readRange,size,AudioDecoderImpl=globalThis.AudioDecoder,EncodedAudioChunkImpl=globalThis.EncodedAudioChunk,onProgress=()=>{},signal}){
 if(!AudioDecoderImpl||!EncodedAudioChunkImpl)throw Error('This browser cannot stream-decode recordings (WebCodecs is unavailable).');
 const index=await audioIndex(readRange,size),{config,timescale,samples}=index;
 const support=await AudioDecoderImpl.isConfigSupported?.(config);if(support&&!support.supported)throw Error('This browser cannot decode the recording’s audio codec ('+config.codec+'); another browser may.');
 const acc=new PeakAccumulator({duration:index.duration});let failure=null,decodedRate=config.sampleRate;
 const decoder=new AudioDecoderImpl({output:data=>{try{const n=data.numberOfFrames,channels=[];decodedRate=data.sampleRate;for(let c=0;c<data.numberOfChannels;c++){const plane=new Float32Array(n);data.copyTo(plane,{planeIndex:c,format:'f32-planar'});channels.push(plane);}acc.add(channels,data.timestamp/1e6,data.sampleRate);}catch(e){failure=e;}finally{data.close();}},error:e=>{failure=e;}});
 decoder.configure(config);
 const ranges=planRanges(samples),total=ranges.reduce((n,r)=>n+r.end-r.start,0);let done=0;
 try{for(const r of ranges){if(signal?.aborted)throw Error('Waveform generation cancelled.');if(failure)throw failure;const bytes=new Uint8Array(await readRange(r.start,r.end));for(const s of r.samples){decoder.decode(new EncodedAudioChunkImpl({type:'key',timestamp:Math.round(s.cts/timescale*1e6),duration:Math.round(s.duration/timescale*1e6),data:bytes.subarray(s.offset-r.start,s.offset-r.start+s.size)}));}
   while(decoder.decodeQueueSize>64){await new Promise(resolve=>setTimeout(resolve,0));if(failure)throw failure;}
   done+=r.end-r.start;onProgress(done/total);}
  await decoder.flush();if(failure)throw failure;
 }finally{try{decoder.close();}catch{}}
 if(!acc.frames)throw Error('No audio could be decoded from this recording.');
 return acc.result({sampleRate:decodedRate});
}

/** Fill the recording identity into peaks produced elsewhere (e.g. scripts/media-peaks.mjs) after checking duration. */
export function bindImportedPeaks(p,{recordingKey,etag,size,duration}){if(!p||typeof p!=='object'||!Array.isArray(p.min)||!Array.isArray(p.max))throw Error('This is not a waveform peaks file.');if(Number.isFinite(duration)&&duration>0&&Math.abs(p.duration-duration)>Math.max(1,duration*0.002))throw Error('These peaks are for a '+p.duration.toFixed(1)+' s recording, but this recording is '+duration.toFixed(1)+' s.');return {version:PEAKS_VERSION,recordingKey,etag,size,sampleRate:p.sampleRate,duration:p.duration,bucketsPerSecond:p.bucketsPerSecond,min:p.min,max:p.max};}
