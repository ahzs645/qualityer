#!/usr/bin/env node
// Generate waveform peaks for a recording with ffmpeg, for browsers that cannot decode it (for example AAC on
// some Linux builds) or for very long files. Import the JSON from the waveform panel ("Import waveform peaks");
// the app binds it to the stored recording after checking the duration. Peaks are a display aid only.
//   node scripts/media-peaks.mjs interview.m4a [out.json]
import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import {PeakAccumulator} from '../src/streaming-peaks.mjs';

export async function ffmpegPeaks(file,{ffmpeg='ffmpeg',ffprobe='ffprobe'}={}){
 const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-select_streams','a:0','-show_entries','stream=channels,sample_rate:format=duration','-of','json',file]).toString());
 const stream=probe.streams?.[0],duration=Number(probe.format?.duration),channels=Number(stream?.channels),sampleRate=Number(stream?.sample_rate);
 if(!stream||!(duration>0)||!(channels>0)||!(sampleRate>0))throw Error('ffprobe found no decodable audio stream in '+file);
 const acc=new PeakAccumulator({duration}),child=spawn(ffmpeg,['-v','error','-i',file,'-vn','-f','f32le','-acodec','pcm_f32le','-ac',String(channels),'-ar',String(sampleRate),'pipe:1']);
 let frame=0,carry=Buffer.alloc(0),stderr='';child.stderr.on('data',d=>{stderr+=d;});
 for await(const chunk of child.stdout){const data=carry.length?Buffer.concat([carry,chunk]):chunk,bytesPerFrame=4*channels,frames=Math.floor(data.length/bytesPerFrame);
  const planes=Array.from({length:channels},()=>new Float32Array(frames));for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)planes[c][i]=data.readFloatLE((i*channels+c)*4);
  acc.add(planes,frame/sampleRate,sampleRate);frame+=frames;carry=data.subarray(frames*bytesPerFrame);}
 const code=await new Promise(resolve=>child.on('close',resolve));if(code!==0)throw Error('ffmpeg failed: '+stderr.trim());
 const result=acc.result({sampleRate});delete result.recordingKey;delete result.etag;delete result.size;return {...result,source:basename(file),generator:'scripts/media-peaks.mjs (ffmpeg)'};
}

if(import.meta.url===`file://${process.argv[1]}`){
 const [file,out=file.replace(/\.[^.]+$/,'')+'.peaks.json']=process.argv.slice(2);
 if(!file){console.error('Usage: node scripts/media-peaks.mjs <recording> [out.json]');process.exit(2);}
 const started=Date.now(),peaks=await ffmpegPeaks(file);writeFileSync(out,JSON.stringify(peaks));
 console.log(`Wrote ${out}: ${peaks.min.length} buckets for ${peaks.duration.toFixed(1)} s in ${((Date.now()-started)/1000).toFixed(1)} s.`);
}
