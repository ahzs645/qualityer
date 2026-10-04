"""Real WhisperX/pyannote adapter. Global diarization is one recording-wide call."""
import contextlib,gc,json,os,sys,tempfile
from inference_helpers import alignment_for_language
from job_options import normalize_options
from backend_config import backend_name,backend_options
from global_recording import prepare_recording,resource_limits,absolute_times,assign_global_speakers,global_diarization

path=sys.argv[1];raw_config=json.loads(sys.argv[2]);config=normalize_options(raw_config.get('diarize',False),raw_config.get('numSpeakers'),raw_config.get('minSpeakers'),raw_config.get('maxSpeakers'),raw_config.get('language'),raw_config.get('batchSize'));device=os.environ.get('WHISPER_DEVICE','cpu');model_name=os.environ.get('WHISPER_MODEL','small');limits=resource_limits()
backend=backend_name();backend_options(config,backend)
def stage(name):print('@research-stage:'+name,file=sys.stderr,flush=True)
with tempfile.TemporaryDirectory() as tmp,contextlib.redirect_stdout(sys.stderr):
    stage('decoding');recording=prepare_recording(path,tmp,config['diarize'],limits)
    if backend=='faster-whisper':
        from faster_inference import transcribe_recording
        result=transcribe_recording(recording,config,device,model_name,limits,stage)
    else:
        import whisperx
        speaker_frame=None;speaker_tracks=None
        if config['diarize']:
            stage('diarizing')
            from whisperx.diarize import DiarizationPipeline
            speaker_frame,speaker_tracks=global_diarization(recording,config,device,DiarizationPipeline,os.environ.get('HF_TOKEN'),limits,os.environ.get('DIARIZATION_MODEL'))
            gc.collect()
            if device=='cuda':
                import torch
                torch.cuda.empty_cache()
        stage('loading_model');compute_type=os.environ.get('WHISPER_COMPUTE_TYPE','int8' if device=='cpu' else 'float16')
        model=whisperx.load_model(model_name,device,compute_type=compute_type)
        segments=[];alignment=None;languages=[];chunk_metadata=[]
        for part in recording['parts']:
            stage('transcribing');audio=whisperx.load_audio(str(part['path']))
            result=model.transcribe(audio,batch_size=config.get('batchSize',int(os.environ.get('WHISPER_BATCH_SIZE','4'))),**({'language':config['language']} if config.get('language') else {}));language=result['language']
            alignment=alignment_for_language(whisperx,alignment,language,device)
            if language not in languages:languages.append(language)
            chunk_metadata.append({'start':part['start'],'end':part['end'],'detected_language':language})
            stage('aligning');aligned=whisperx.align(result['segments'],*alignment,audio,device,return_char_alignments=False)
            aligned=absolute_times(aligned,part['start'])
            if speaker_frame is not None:aligned=assign_global_speakers(whisperx,speaker_frame,aligned)
            for segment in aligned['segments']:segment['detected_language']=language;segments.append(segment)
        result={'segments':segments,'model':model_name,'engine':'whisperx','language':languages[0] if len(languages)==1 else 'mixed','detected_languages':languages,'chunks':chunk_metadata,'diarization':config['diarize'],'options':config,'engine_configuration':{'device':device,'model':model_name,'compute_type':compute_type,'batch_size':config.get('batchSize',int(os.environ.get('WHISPER_BATCH_SIZE','4'))),'chunk_seconds':limits['chunk_seconds'],'recording_duration':recording['duration'],'global_diarization_seconds_limit':limits['global_seconds'],'global_waveform_bytes_limit':limits['global_waveform_bytes'],'diarization_scope':'whole-recording' if config['diarize'] else None},'speaker_tracks':speaker_tracks}
print(json.dumps(result))
