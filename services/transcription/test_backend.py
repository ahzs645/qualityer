"""Backend contracts tested without model substitutes or downloads."""
import os
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))
TEST_ROOT = tempfile.TemporaryDirectory()
os.environ.setdefault('AUDIO_DATA_DIR', TEST_ROOT.name)
os.environ.setdefault('AUDIO_WORKER_TOKEN', 'synthetic-test-token-123456789')
from backend_config import backend_name, backend_options
from faster_inference import native_segment
from global_recording import absolute_times


class BackendTests(unittest.TestCase):
    def test_default_and_unknown_backend(self):
        self.assertEqual(backend_name({}), 'whisperx')
        self.assertEqual(backend_name({'WHISPER_BACKEND': 'faster-whisper'}), 'faster-whisper')
        with self.assertRaises(ValueError):
            backend_name({'WHISPER_BACKEND': 'mock'})

    def test_backend_rejects_unsupported_options(self):
        with self.assertRaisesRegex(ValueError, 'diarization'):
            backend_options({'diarize': True}, 'faster-whisper')
        with self.assertRaisesRegex(ValueError, 'Batch size'):
            backend_options({'diarize': False, 'batchSize': 4}, 'faster-whisper')
        self.assertEqual(backend_options({'diarize': False}, 'faster-whisper'), {'diarize': False})
        self.assertTrue(backend_options({'diarize': True}, 'whisperx')['diarize'])

    def test_native_word_timing_confidence_and_absolute_offset(self):
        # Supplied dataclass-shaped records exercise serialization, not inference.
        word = SimpleNamespace(word=' hello', start=0.25, end=0.8, probability=0.41)
        row = native_segment(SimpleNamespace(text=' hello', start=0.0, end=1.25,
                                             avg_logprob=-0.7, no_speech_prob=0.03, words=[word]))
        shifted = absolute_times({'segments': [row]}, 1200)['segments'][0]
        self.assertEqual(shifted['start'], 1200)
        self.assertEqual(shifted['words'][0]['start'], 1200.25)
        self.assertEqual(shifted['words'][0]['score'], 0.41)
        self.assertEqual(shifted['words'][0]['confidence_kind'], 'asr-word-probability')
        self.assertNotIn('speaker', shifted)

    def test_health_and_submit_follow_real_deployment_capabilities(self):
        import asyncio
        import httpx
        import app
        async def exercise():
            with patch.object(app, 'BACKEND', 'faster-whisper'):
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app.app), base_url='http://gateway') as client:
                    headers = {'Authorization': 'Bearer ' + app.TOKEN}
                    health = (await client.get('/health', headers=headers)).json()
                    self.assertEqual(health['engine'], 'faster-whisper')
                    self.assertFalse(health['capabilities']['speaker_count_hints'])
                    self.assertFalse(health['capabilities']['global_chunk_diarization'])
                    self.assertEqual(health['capabilities']['word_timestamps'], 'native-asr')
                    headers['Idempotency-Key'] = '00000000-0000-4000-8000-000000000001'
                    params = {'project_id': 'p', 'job_id': headers['Idempotency-Key'], 'diarize': 'true'}
                    rejected = await client.post('/jobs', params=params, headers=headers, content=b'not audio')
                    self.assertEqual(rejected.status_code, 400)
                    self.assertIn('transcription only', rejected.json()['detail'])
        asyncio.run(exercise())


if __name__ == '__main__':
    unittest.main()
