"""Synthetic adapter boundary and orchestration checks; no model execution."""
import copy, io, math, tempfile, unittest, wave
from unittest.mock import Mock
from result_validation import validate_result
from inference_helpers import alignment_for_language
from queue_store import Queue

class ResultTests(unittest.TestCase):
    def test_missing_null_zero_fractional_overlap_and_raw_provenance_preserved(self):
        result={'segments':[{'text':'zero', 'start':0, 'end':1.125, 'speaker':'SPEAKER_00', 'words':[{'word':'zero','start':0,'end':None,'score':0.8},{'word':'untimed'}]}, {'text':'overlap','start':0.75,'end':1.5}, {'text':'untimed','start':None}], 'engine':'whisperx'}
        before=copy.deepcopy(result)
        self.assertIs(validate_result(result),result)
        self.assertEqual(result,before)
    def test_rejects_invalid_bounds_for_segments_and_words(self):
        for bad in [True,False,'0',-1,math.nan,math.inf,-math.inf,{},[]]:
            for field in ['start','end','timeStart','timeEnd','start_time','end_time']:
                with self.subTest(value=bad,field=field):
                    with self.assertRaises(ValueError):validate_result({'segments':[{'text':'x',field:bad}]})
                    with self.assertRaises(ValueError):validate_result({'segments':[{'text':'x','words':[{'word':'x',field:bad}]}]})
        for segment in [{'text':'x','start':2,'end':1},{'text':'x','timeStart':2,'end':1},{'text':'x','words':[{'word':'x','start':2,'end':1}]}]:
            with self.assertRaises(ValueError):validate_result({'segments':[segment]})
    def test_rejects_malformed_segments_words_and_speakers(self):
        for result in [None,[],{}, {'segments':{}}, {'segments':[None]}, {'segments':[{'text':2}]}, {'segments':[{'text':'x','words':None}]}, {'segments':[{'text':'x','words':[None]}]}, {'segments':[{'text':'x','words':[{'word':2}]}]}, {'segments':[{'text':'x','speaker':2}]}, {'segments':[{'text':'x','words':[{'word':'x','speaker':2}]}]}]:
            with self.subTest(result=result):
                with self.assertRaises(ValueError):validate_result(result)

class AlignmentTests(unittest.TestCase):
    def test_same_language_reuses_and_changed_language_reloads(self):
        api=Mock()
        api.load_align_model.side_effect=lambda language_code,device:(object(),{'language':language_code})
        english=alignment_for_language(api,None,'en','cpu')
        self.assertIs(alignment_for_language(api,english,'en','cpu'),english)
        french=alignment_for_language(api,english,'fr','cpu')
        self.assertEqual(french[1]['language'],'fr')
        self.assertEqual(api.load_align_model.call_count,2)

class QueueBoundaryTests(unittest.TestCase):
    def test_invalid_result_cannot_complete_and_valid_times_survive_queue(self):
        audio=io.BytesIO()
        with wave.open(audio,'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\0\0'*16)
        with tempfile.TemporaryDirectory() as root:
            queue=Queue(root)
            row=queue.submit('synthetic','result-check',audio.getvalue())
            job=queue.claim()
            with self.assertRaises(ValueError):queue.complete(job,{'segments':[{'text':'x','start':2,'end':1}]})
            self.assertEqual(queue.get('synthetic',row['id'])['state'],'running')
            result={'segments':[{'text':'x','start':0,'end':1.125,'words':[{'word':'x','end':None}]}]}
            self.assertTrue(queue.complete(job,result))
            self.assertEqual(queue.get('synthetic',row['id'])['result'],result)

if __name__=='__main__':unittest.main()
