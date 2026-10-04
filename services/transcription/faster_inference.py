"""Real optional CPU ASR adapter. Native ASR timestamps, no forced alignment or speakers."""
import importlib.metadata
import os

from global_recording import absolute_times


def native_segment(segment):
    return {'text': segment.text, 'start': segment.start, 'end': segment.end,
            'avg_logprob': segment.avg_logprob, 'no_speech_prob': segment.no_speech_prob,
            'words': [{'word': word.word, 'start': word.start, 'end': word.end,
                       'score': word.probability, 'confidence_kind': 'asr-word-probability'}
                      for word in (segment.words or [])]}


def transcribe_recording(recording, config, device, model_name, limits, stage):
    if config['diarize']:
        raise ValueError('faster-whisper does not provide diarization')
    from faster_whisper import WhisperModel
    stage('loading_model')
    compute_type = os.environ.get('WHISPER_COMPUTE_TYPE', 'int8' if device == 'cpu' else 'float16')
    model = WhisperModel(model_name, device=device, compute_type=compute_type,
                         cpu_threads=int(os.environ.get('WHISPER_CPU_THREADS', '4')),
                         local_files_only=os.environ.get('WHISPER_LOCAL_FILES_ONLY', 'false').lower() == 'true')
    segments, languages, chunks = [], [], []
    for part in recording['parts']:
        stage('transcribing')
        iterator, info = model.transcribe(str(part['path']), language=config.get('language'),
                                          word_timestamps=True, beam_size=5, vad_filter=False,
                                          condition_on_previous_text=False)
        rows = [native_segment(segment) for segment in iterator]
        shifted = absolute_times({'segments': rows}, part['start'])['segments']
        for row in shifted:
            row['detected_language'] = info.language
        segments.extend(shifted)
        if info.language not in languages:
            languages.append(info.language)
        chunks.append({'start': part['start'], 'end': part['end'],
                       'detected_language': info.language,
                       'language_source': 'requested' if config.get('language') else 'detected',
                       **({} if config.get('language') else {'language_probability': info.language_probability})})
    return {'segments': segments, 'model': model_name, 'engine': 'faster-whisper',
            'engine_version': importlib.metadata.version('faster-whisper'),
            'language': languages[0] if len(languages) == 1 else 'mixed',
            'detected_languages': languages, 'chunks': chunks, 'diarization': False,
            'options': config, 'speaker_tracks': None,
            'engine_configuration': {'device': device, 'model': model_name, 'compute_type': compute_type,
                                     'chunk_seconds': limits['chunk_seconds'],
                                     'recording_duration': recording['duration'], 'beam_size': 5,
                                     'vad_filter': False, 'condition_on_previous_text': False,
                                     'word_timestamps': 'native-asr', 'forced_alignment': False,
                                     'confidence_kind': 'asr-word-probability', 'diarization_scope': None}}
