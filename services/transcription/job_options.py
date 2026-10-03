"""Server-owned, reproducible transcription options; speaker labels are anonymous."""
import re

def normalize_options(diarize=False,num_speakers=None,min_speakers=None,max_speakers=None,language=None,batch_size=None):
    if not isinstance(diarize,bool): raise ValueError('Diarization must be a boolean')
    result={'diarize':diarize}
    counts={'numSpeakers':num_speakers,'minSpeakers':min_speakers,'maxSpeakers':max_speakers}
    for key,value in counts.items():
        if value is not None:
            if isinstance(value,bool) or not isinstance(value,int) or not 1<=value<=100: raise ValueError('Speaker counts must be integers from 1 to 100')
            result[key]=value
    if num_speakers is not None and (min_speakers is not None or max_speakers is not None): raise ValueError('Use exact count or min/max bounds')
    if min_speakers is not None and max_speakers is not None and min_speakers>max_speakers: raise ValueError('Minimum exceeds maximum')
    if not diarize and any(value is not None for value in counts.values()): raise ValueError('Speaker counts require diarization')
    if language:
        if not isinstance(language,str) or not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z]{2,4})?',language): raise ValueError('Invalid language code')
        result['language']=language
    if batch_size is not None:
        if isinstance(batch_size,bool) or not isinstance(batch_size,int) or not 1<=batch_size<=64: raise ValueError('Batch size must be from 1 to 64')
        result['batchSize']=batch_size
    return result
