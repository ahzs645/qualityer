"""Recording preparation/global speaker assignment. Model-free helpers, no inferred timing."""
import copy,math,os,subprocess,wave
from pathlib import Path

RATE=16000

def positive_float(value,name):
    try:number=float(value)
    except (TypeError,ValueError):raise ValueError(name+' must be a positive finite number')
    if not math.isfinite(number) or number<=0:raise ValueError(name+' must be a positive finite number')
    return number

def resource_limits(environ=None):
    environ=os.environ if environ is None else environ
    return {'global_seconds':positive_float(environ.get('DIARIZATION_MAX_HOURS','2'),'DIARIZATION_MAX_HOURS')*3600,
            'global_waveform_bytes':positive_float(environ.get('DIARIZATION_MAX_WAVEFORM_MB','512'),'DIARIZATION_MAX_WAVEFORM_MB')*1000000,
            'recording_seconds':positive_float(environ.get('TRANSCRIPTION_MAX_HOURS','12'),'TRANSCRIPTION_MAX_HOURS')*3600,
            'chunk_seconds':positive_float(environ.get('TRANSCRIPTION_CHUNK_SECONDS','1200'),'TRANSCRIPTION_CHUNK_SECONDS')}

def wav_duration(path):
    with wave.open(str(path),'rb') as audio:
        if audio.getnchannels()!=1 or audio.getframerate()!=RATE or audio.getsampwidth()!=2:raise ValueError('Normalized recording must be 16 kHz mono PCM16')
        duration=audio.getnframes()/RATE
    if duration<=0:raise ValueError('Recording has no decoded samples')
    return duration

def global_eligible(duration,limits):
    if duration>limits['global_seconds']:raise ValueError('Recording exceeds whole-recording diarization duration limit; use transcription-only or configure a capable worker')
    waveform_bytes=duration*RATE*4 # WhisperX v3.8 file input loads float32 samples.
    if waveform_bytes>limits['global_waveform_bytes']:raise ValueError('Whole-recording diarization waveform exceeds configured memory budget; use transcription-only')
    return waveform_bytes

def prepare_recording(path,folder,diarize=False,limits=None):
    limits=resource_limits() if limits is None else limits;folder=Path(folder);folder.mkdir(parents=True,exist_ok=True)
    max_seconds=min(limits['recording_seconds'],limits['global_seconds'],limits['global_waveform_bytes']/(RATE*4)) if diarize else limits['recording_seconds']
    whole=folder/'recording.wav'
    # Decode at most limit+1 seconds. Over-limit recordings are rejected, never returned truncated.
    subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(path),'-vn','-ac','1','-ar',str(RATE),'-t',str(max_seconds+1),'-c:a','pcm_s16le',str(whole)],check=True)
    os.chmod(whole,0o600);duration=wav_duration(whole)
    if duration>limits['recording_seconds']:raise ValueError('Recording exceeds configured transcription duration limit')
    if diarize:global_eligible(duration,limits)
    chunks=folder/'chunks';chunks.mkdir()
    subprocess.run(['ffmpeg','-nostdin','-v','error','-i',str(whole),'-c:a','copy','-f','segment','-segment_time',str(limits['chunk_seconds']),'-reset_timestamps','1',str(chunks/'%05d.wav')],check=True)
    parts=sorted(chunks.glob('*.wav'))
    if not parts:raise ValueError('Recording produced no decodable parts')
    offset=0;records=[]
    for part in parts:
        os.chmod(part,0o600);length=wav_duration(part);records.append({'path':part,'start':offset,'end':offset+length});offset+=length
    if abs(offset-duration)>1/RATE:raise ValueError('Decoded recording parts do not cover the complete recording')
    return {'path':whole,'duration':duration,'parts':records,'waveform_bytes':duration*RATE*4}

def positive_pair(record):
    start,end=record.get('start'),record.get('end')
    return all(not isinstance(value,bool) and isinstance(value,(int,float)) and math.isfinite(value) and value>=0 for value in [start,end]) and end>start

def absolute_times(aligned,offset):
    if not isinstance(aligned,dict) or not isinstance(aligned.get('segments'),list):raise ValueError('Alignment needs segments')
    result=copy.deepcopy(aligned)
    for segment in result['segments']:
        for record in [segment,*segment.get('words',[])]:
            for key in ['start','end']:
                value=record.get(key)
                if value is None:continue
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:raise ValueError('Alignment supplied invalid seconds')
                record[key]=value+offset
    return result

def assign_global_speakers(whisperx,tracks,aligned):
    """Assign only complete timed evidence; untimed/zero-length words stay untouched."""
    result=copy.deepcopy(aligned);eligible=[];locations=[]
    for index,segment in enumerate(result['segments']):
        if not positive_pair(segment):continue
        subset=copy.deepcopy(segment);subset.pop('speaker',None);word_locations=[];words=[]
        for word_index,word in enumerate(segment.get('words',[])):
            if positive_pair(word):word_copy=copy.deepcopy(word);word_copy.pop('speaker',None);words.append(word_copy);word_locations.append(word_index)
        if 'words' in subset:subset['words']=words
        eligible.append(subset);locations.append((index,word_locations))
    if eligible:
        assigned=whisperx.assign_word_speakers(tracks,{'segments':eligible},fill_nearest=False)
        if len(assigned.get('segments',[]))!=len(locations):raise ValueError('Speaker assignment changed segment count')
        for assigned_segment,(index,word_locations) in zip(assigned['segments'],locations):
            if 'speaker' in assigned_segment:result['segments'][index]['speaker']=assigned_segment['speaker']
            assigned_words=assigned_segment.get('words',[])
            if len(assigned_words)!=len(word_locations):raise ValueError('Speaker assignment changed word count')
            for word,word_index in zip(assigned_words,word_locations):
                if 'speaker' in word:result['segments'][index]['words'][word_index]['speaker']=word['speaker']
    return result

def track_rows(frame,duration):
    rows=[]
    for _,record in frame.iterrows():
        start,end,speaker=record['start'],record['end'],record['speaker']
        start,end=float(start),float(end)
        if not positive_pair({'start':start,'end':end}) or end>duration+1/RATE or not isinstance(speaker,str) or not speaker.strip():raise ValueError('Global diarizer supplied invalid recording bounds or speaker label')
        rows.append({'timeStart':start,'timeEnd':end,'speaker':speaker,'rawSpeaker':speaker})
    return rows

def global_diarization(recording,config,device,diarizer_factory,token,limits=None,model_name=None):
    limits=resource_limits() if limits is None else limits;global_eligible(recording['duration'],limits)
    if not token:raise ValueError('Whole-recording diarization requires the configured model token and accepted model terms')
    diarizer=diarizer_factory(token=token,device=device,**({'model_name':model_name} if model_name else {}))
    hints={({ 'numSpeakers':'num_speakers','minSpeakers':'min_speakers','maxSpeakers':'max_speakers'}[key]):config[key] for key in ['numSpeakers','minSpeakers','maxSpeakers'] if key in config}
    # One call on the complete normalized file: speaker IDs remain global across all parts.
    frame=diarizer(str(recording['path']),**hints)
    rows=track_rows(frame,recording['duration'])
    return frame,{'regular':rows,'exclusive':[],'exclusive_available':False,'scope':'whole-recording','engine':'whisperx-global','model':model_name or 'pyannote/speaker-diarization-community-1'}
