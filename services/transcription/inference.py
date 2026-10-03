"""Real WhisperX/pyannote adapter; model errors fail the job, never fabricate output."""
import contextlib,json,os,subprocess,sys,tempfile
from inference_helpers import alignment_for_language
path=sys.argv[1];config=json.loads(sys.argv[2]);device=os.environ.get('WHISPER_DEVICE','cpu');model_name=os.environ.get('WHISPER_MODEL','small')
# WhisperX loads complete waveforms. Process 20-minute parts to bound working memory.
with tempfile.TemporaryDirectory() as tmp,contextlib.redirect_stdout(sys.stderr):
    subprocess.run(['ffmpeg','-nostdin','-v','error','-i',path,'-vn','-ac','1','-ar','16000','-f','segment','-segment_time','1200',tmp+'/%05d.wav'],check=True)
    chunks=sorted(__import__('pathlib').Path(tmp).glob('*.wav'))
    if config.get('diarize') and len(chunks)>1:raise RuntimeError('Diarization across recording parts requires a whole-recording speaker worker; choose transcription without diarization or a worker with global speaker clustering.')
    import whisperx
    model=whisperx.load_model(model_name,device,compute_type=os.environ.get('WHISPER_COMPUTE_TYPE','int8' if device=='cpu' else 'float16'))
    segments=[];offset=0;language=None;alignment=None;languages=[];chunk_metadata=[]
    for chunk in chunks:
        audio=whisperx.load_audio(str(chunk));result=model.transcribe(audio,batch_size=int(os.environ.get('WHISPER_BATCH_SIZE','4')));language=result['language']
        alignment=alignment_for_language(whisperx,alignment,language,device)
        if language not in languages:languages.append(language)
        chunk_metadata.append({'start':offset,'end':offset+len(audio)/16000,'detected_language':language})
        aligned=whisperx.align(result['segments'],*alignment,audio,device,return_char_alignments=False)
        if config.get('diarize'):
            from whisperx.diarize import DiarizationPipeline
            diarizer=DiarizationPipeline(token=os.environ['HF_TOKEN'],device=device)
            aligned=whisperx.assign_word_speakers(diarizer(audio),aligned)
        for s in aligned['segments']:
            s['detected_language']=language
            if s.get('start') is not None:s['start']+=offset
            if s.get('end') is not None:s['end']+=offset
            for w in s.get('words',[]):
                if w.get('start') is not None:w['start']+=offset
                if w.get('end') is not None:w['end']+=offset
            segments.append(s)
        offset+=len(audio)/16000
result={'segments':segments,'model':model_name,'engine':'whisperx','language':languages[0] if len(languages)==1 else 'mixed','detected_languages':languages,'chunks':chunk_metadata,'diarization':bool(config.get('diarize'))}
print(json.dumps(result))
