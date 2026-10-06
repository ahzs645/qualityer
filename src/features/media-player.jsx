import React,{forwardRef,useEffect,useState} from 'react';
const REASONS={1:'Playback was stopped before the recording loaded.',2:'The recording could not be downloaded (network or server error).',3:'The recording is damaged or uses features this browser cannot decode.',4:'This browser cannot play this recording’s format'};
/** Audio/video element that explains load and decode failures instead of sitting at 0:00. */
export const MediaPlayer=forwardRef(function MediaPlayer({src,type,video=false,label,...rest},ref){
 const [error,setError]=useState(null);useEffect(()=>setError(null),[src]);
 const Tag=video?'video':'audio',codec=/mp4|m4a|quicktime/i.test(type||'')?' (often AAC audio, which some Linux and open-source browser builds cannot decode)':'';
 return <div className="media-player"><Tag controls ref={ref} src={src} aria-label={label} onError={e=>setError(e.currentTarget.error?.code||4)} onLoadedMetadata={()=>setError(null)} {...rest}/>{error&&<p className="media-player-error" role="alert">{REASONS[error]||REASONS[4]}{error===4?' ('+(type||'unknown type')+')'+codec+'. Try Chrome, Edge or Safari, or download the recording to play it locally. Timing, coding and review still work.':''} <a href={src} download>Download recording</a></p>}</div>;
});
/** Shown where a source refers to a recording that is not stored in this project (for example, missing from an imported download). */
export function MissingRecordingNotice({doc}){return <details className="callout media-missing" role="note"><summary><strong>Recording not available in this project</strong> · transcript, timings and coding still work</summary> {doc?.name?'“'+doc.name+'” ':'This source '}keeps its transcript, timings and coding, but its {/^video\//.test(doc?.mediaType||'')?'video':'audio'} file was not restored (for example, it was missing or incomplete in the imported download). Listening and waveform tools are disabled until the recording is attached again.</details>;}
export const recordingMissing=doc=>!!doc&&!doc.mediaKey&&/^(audio|video)\//.test(doc.mediaType||'');
