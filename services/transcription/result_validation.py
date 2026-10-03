"""Validate generated transcript structure without creating or filling timing."""
import math


def _time(record, key):
    value = record.get(key)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError('Transcript timing must be finite nonnegative numeric seconds')
    return value


def _pair(record):
    # Match transcript import precedence; null means missing and never falls back.
    starts, ends = ('timeStart', 'start_time', 'start'), ('timeEnd', 'end_time', 'end')
    for key in starts + ends:
        _time(record, key)
    start = next((_time(record, key) for key in starts if key in record), None)
    end = next((_time(record, key) for key in ends if key in record), None)
    if start is not None and end is not None and end < start:
        raise ValueError('Transcript end precedes start')


def validate_result(result):
    if not isinstance(result, dict) or not isinstance(result.get('segments'), list):
        raise ValueError('Transcript result needs a segments array')
    for segment in result['segments']:
        if not isinstance(segment, dict) or not isinstance(segment.get('text'), str):
            raise ValueError('Each transcript segment needs text')
        _pair(segment)
        if segment.get('speaker') is not None and not isinstance(segment['speaker'], str):
            raise ValueError('Transcript speaker must be a string')
        words = segment.get('words', [])
        if not isinstance(words, list):
            raise ValueError('Transcript words must be an array')
        for word in words:
            if not isinstance(word, dict) or not isinstance(word.get('word'), str):
                raise ValueError('Each transcript word needs word text')
            _pair(word)
            if word.get('speaker') is not None and not isinstance(word['speaker'], str):
                raise ValueError('Word speaker must be a string')
    return result
