// Waveform peaks are a display aid bound to one stored recording version. They never alter timing data.
export const PEAKS_VERSION=1,PEAKS_MAX_BYTES=2000000,PEAKS_MAX_BUCKETS=180000;
const q=v=>Math.max(-127,Math.min(127,Math.round((Number.isFinite(v)?v:0)*127)));
export function peaksBucketsPerSecond(duration){return Math.max(1,Math.min(100,Math.floor(PEAKS_MAX_BUCKETS/Math.max(duration,1e-6))));}
export function quantizePeaks(channels,{sampleRate,duration,recordingKey,etag,size,bucketsPerSecond=peaksBucketsPerSecond(duration)}){const length=channels[0]?.length||0,buckets=Math.max(1,Math.min(PEAKS_MAX_BUCKETS,Math.ceil(duration*bucketsPerSecond))),step=length/buckets,min=new Array(buckets),max=new Array(buckets);for(let b=0;b<buckets;b++){let lo=0,hi=0;const from=Math.floor(b*step),to=Math.max(from+1,Math.min(length,Math.floor((b+1)*step)));for(const channel of channels)for(let i=from;i<to&&i<length;i++){const v=channel[i];if(v<lo)lo=v;if(v>hi)hi=v;}min[b]=q(lo);max[b]=q(hi);}return {version:PEAKS_VERSION,recordingKey,etag,size,sampleRate,duration,bucketsPerSecond,min,max};}
export function dequantizePeaks(p){return {min:p.min.map(v=>v/127),max:p.max.map(v=>v/127),duration:p.duration,bucketsPerSecond:p.bucketsPerSecond};}
// Overview bars (0..1) for a fixed number of columns, independent of stored resolution.
export function overviewPeaks(p,columns=500){const n=p.min.length,out=[];if(!n)return out;const per=n/Math.min(columns,n);for(let c=0;c<Math.min(columns,n);c++){let high=0;for(let i=Math.floor(c*per);i<Math.min(n,Math.max(Math.floor(c*per)+1,Math.floor((c+1)*per)));i++)high=Math.max(high,Math.abs(p.min[i]),Math.abs(p.max[i]));out.push(high/127);}return out;}
const int8=v=>Number.isInteger(v)&&v>=-128&&v<=127;
export function validateMediaPeaks(p,expected={}){
 if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Waveform peaks must be an object.');
 if(p.version!==PEAKS_VERSION)throw Error('Unsupported waveform peaks version.');
 if(typeof p.recordingKey!=='string'||!p.recordingKey||p.recordingKey.length>300)throw Error('Waveform peaks need a recording key.');
 if(typeof p.etag!=='string'||!p.etag||p.etag.length>200||!Number.isInteger(p.size)||p.size<=0)throw Error('Waveform peaks need the recording version (etag and size).');
 for(const key of ['recordingKey','etag','size'])if(expected[key]!=null&&expected[key]!==p[key])throw Object.assign(Error('Waveform peaks belong to another recording or recording version.'),{status:409});
 if(!Number.isFinite(p.sampleRate)||p.sampleRate<=0||p.sampleRate>768000||!Number.isFinite(p.duration)||p.duration<=0||p.duration>172800||!Number.isFinite(p.bucketsPerSecond)||p.bucketsPerSecond<=0||p.bucketsPerSecond>1000)throw Error('Waveform peaks have an invalid sample rate, duration or resolution.');
 if(!Array.isArray(p.min)||!Array.isArray(p.max)||!p.min.length||p.min.length!==p.max.length||p.min.length>PEAKS_MAX_BUCKETS)throw Error('Waveform peaks need equal bounded min and max arrays.');
 if(Math.abs(p.min.length-Math.ceil(p.duration*p.bucketsPerSecond))>2)throw Error('Waveform peaks do not match the stated duration and resolution.');
 for(let i=0;i<p.min.length;i++)if(!int8(p.min[i])||!int8(p.max[i])||p.min[i]>p.max[i])throw Error('Waveform peaks must be ordered Int8 values.');
 return {version:p.version,recordingKey:p.recordingKey,etag:p.etag,size:p.size,sampleRate:p.sampleRate,duration:p.duration,bucketsPerSecond:p.bucketsPerSecond,min:p.min,max:p.max};
}
export function peaksURL(mediaURL){return mediaURL.replace(/\/media\/([^/]+)$/,'/media-peaks/$1');}
// Min/max columns (-1..1) for drawing a zoomed strip without rendering every stored bucket.
export function peakColumns(p,columns){const n=p.min.length,count=Math.max(1,Math.min(n,Math.floor(columns))),per=n/count,min=new Array(count),max=new Array(count);for(let c=0;c<count;c++){let lo=127,hi=-127;const from=Math.floor(c*per),to=Math.max(from+1,Math.min(n,Math.floor((c+1)*per)));for(let i=from;i<to;i++){if(p.min[i]<lo)lo=p.min[i];if(p.max[i]>hi)hi=p.max[i];}min[c]=lo/127;max[c]=hi/127;}return {min,max};}
