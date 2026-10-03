"""Synthetic process/audio transport checks; never stand in for model accuracy."""
import io,os,sys,tempfile,threading,time,unittest,wave
from pathlib import Path
from queue_store import Queue,execute_subprocess
from job_options import normalize_options

def wav():
    data=io.BytesIO()
    with wave.open(data,'wb') as audio:audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(16000);audio.writeframes(b'\0\0'*1600)
    return data.getvalue()
class AdapterBounds(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.queue=Queue(self.tmp.name)
    def tearDown(self):self.tmp.cleanup()
    def claim(self):self.row=self.queue.submit('project','key',wav());return self.queue.claim()
    def test_stdout_flood_killed_before_unbounded_accumulation(self):
        result=execute_subprocess(self.queue,self.claim(),[sys.executable,'-c',"import sys; sys.stdout.write('x'*1000000);sys.stdout.flush();import time;time.sleep(30)"],max_stdout=4096)
        self.assertTrue(result['failed']);self.assertEqual(self.queue.get('project',self.row['id'])['state'],'failed')
        with self.assertRaises(ProcessLookupError):os.kill(result['pid'],0)
    def test_stderr_flood_is_also_bounded(self):
        result=execute_subprocess(self.queue,self.claim(),[sys.executable,'-c',"import sys; sys.stderr.write('x'*1000000);sys.stderr.flush();import time;time.sleep(30)"],max_stderr=4096)
        self.assertTrue(result['failed']);self.assertIn('diagnostic',self.queue.get('project',self.row['id'])['error'])
    def test_trusted_stage_does_not_create_percentage(self):
        result=execute_subprocess(self.queue,self.claim(),[sys.executable,'-c',"import sys,json;print('@research-stage:aligning',file=sys.stderr,flush=True);print(json.dumps({'segments':[],'kind':'queue-test-no-transcription'}))"])
        self.assertTrue(result['completed']);row=self.queue.get('project',self.row['id']);self.assertEqual(row['stage'],'validating');self.assertNotIn('progress',row)
    def test_runtime_limit_kills_descendants(self):
        result=execute_subprocess(self.queue,self.claim(),[sys.executable,'-c',"import subprocess,time,sys;subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)']);time.sleep(30)"],max_seconds=.1)
        self.assertTrue(result['failed']);self.assertIn('runtime',self.queue.get('project',self.row['id'])['error'])
    def test_nonzero_model_diagnostics_not_persisted(self):
        execute_subprocess(self.queue,self.claim(),[sys.executable,'-c',"import sys;print('private transcript contents',file=sys.stderr);sys.exit(7)"])
        self.assertEqual(self.queue.get('project',self.row['id'])['error'],'adapter exited with code 7')
    def test_cancellation_cleans_child_and_fences_result(self):
        job=self.claim();result={};worker=threading.Thread(target=lambda:result.update(execute_subprocess(self.queue,job,[sys.executable,'-c','import time;time.sleep(30)'])))
        worker.start();time.sleep(.1);self.queue.cancel('project',self.row['id']);worker.join(3);self.assertFalse(worker.is_alive());self.assertTrue(result['cancelled']);self.assertIsNone(self.queue.get('project',self.row['id'])['result'])
    def test_reproducible_count_hints(self):
        self.assertEqual(normalize_options(True,num_speakers=2,language='fr',batch_size=4),{'diarize':True,'numSpeakers':2,'language':'fr','batchSize':4})
        for options in [{'diarize':False,'num_speakers':2},{'diarize':True,'min_speakers':3,'max_speakers':2},{'diarize':True,'num_speakers':2,'min_speakers':1},{'diarize':True,'num_speakers':True},{'language':'/private'},{'batch_size':65}]:
            with self.assertRaises(ValueError):normalize_options(**options)
if __name__=='__main__':unittest.main(verbosity=2)
