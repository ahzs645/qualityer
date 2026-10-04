"""Choose a deployment-owned inference engine; clients cannot switch engines."""
import os


def backend_name(environ=None):
    value = (os.environ if environ is None else environ).get('WHISPER_BACKEND', 'whisperx')
    if value not in {'whisperx', 'faster-whisper'}:
        raise ValueError('WHISPER_BACKEND must be whisperx or faster-whisper')
    return value


def backend_options(config, backend):
    if backend == 'faster-whisper' and config.get('diarize'):
        raise ValueError('The faster-whisper backend provides transcription only; diarization requires the WhisperX backend')
    if backend == 'faster-whisper' and 'batchSize' in config:
        raise ValueError('Batch size applies to the WhisperX backend; faster-whisper uses sequential decoding')
    return config
