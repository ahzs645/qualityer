import base64, concurrent.futures, io, json, os, subprocess, sys, tempfile, threading, time, unittest, urllib.request, urllib.error, wave
from pathlib import Path
from queue_store import Queue,server,execute_subprocess

def wav():
    b=io.BytesIO()
    with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*1600)
    return b.getvalue()
class Tests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.now=1000;self.q=Queue(self.tmp.name,clock=lambda:self.now)
    def tearDown(self):self.tmp.cleanup()
    def submit(self,idem='a',**kwargs):return self.q.submit('p',idem,wav(),**kwargs)
    def test_restart_and_idempotency(self):
        a=self.submit();q=Queue(self.tmp.name,clock=lambda:self.now);self.assertEqual(q.get('p',a['id'])['state'],'queued');self.assertEqual(self.submit()['id'],a['id'])
        with self.assertRaises(ValueError):self.q.submit('p','a',wav(),{'language':'fr'})
    def test_atomic_single_claim(self):
        self.submit()
        with concurrent.futures.ThreadPoolExecutor(4) as pool:claims=list(pool.map(lambda _:self.q.claim(),range(4)))
        self.assertEqual(sum(x is not None for x in claims),1)
    def test_expired_lease_recovery_and_stale_result(self):
        a=self.submit();first=self.q.claim(lease_seconds=5);self.now+=6;second=self.q.claim();self.assertIsNotNone(second);self.assertFalse(self.q.complete(first,{'segments':[]}));self.assertTrue(self.q.complete(second,{'segments':[],'kind':'queue-test-fixture'}));self.assertEqual(self.q.get('p',a['id'])['attempt'],2)
    def test_retry_budget_backoff(self):
        a=self.submit(max_attempts=2);j=self.q.claim();self.q.retry(j,'transient');self.assertIsNone(self.q.claim());self.now+=3;j=self.q.claim();self.q.retry(j,'still failing');self.assertEqual(self.q.get('p',a['id'])['state'],'failed');self.assertIsNone(self.q.claim())
    def test_cancel_queued_running_and_late_completion(self):
        a=self.submit();self.assertTrue(self.q.cancel('p',a['id']));self.assertIsNone(self.q.claim());b=self.submit('b');j=self.q.claim();self.assertTrue(self.q.cancel('p',b['id']));self.assertFalse(self.q.heartbeat(j));self.assertFalse(self.q.complete(j,{'segments':[]}));self.assertEqual(self.q.get('p',b['id'])['state'],'cancelled')
    def test_retention_delete_input_output_and_orphans(self):
        a=self.submit(retention=5);j=self.q.claim();self.q.complete(j,{'segments':[],'kind':'queue-test-fixture'});(Path(self.tmp.name)/'orphan.wav').write_bytes(b'orphan');self.now+=6;self.q.purge();r=self.q.get('p',a['id']);self.assertEqual(r['state'],'expired');self.assertIsNone(r['result']);self.assertFalse(list(Path(self.tmp.name).glob('*.wav')))
    def test_heartbeat_and_scope(self):
        a=self.submit();j=self.q.claim(5);self.now+=4;self.assertTrue(self.q.heartbeat(j,5));self.now+=2;self.assertIsNone(self.q.claim())
        with self.assertRaises(KeyError):self.q.get('different-project',a['id'])
    def test_expired_lease_cannot_finish_without_reclaim(self):
        self.submit();j=self.q.claim(5);self.now+=6;self.assertFalse(self.q.complete(j,{'segments':[]}));self.assertFalse(self.q.heartbeat(j))
    def test_cancel_running_adapter_kills_process(self):
        a=self.submit();j=self.q.claim();result={}
        t=threading.Thread(target=lambda:result.update(execute_subprocess(self.q,j,[sys.executable,'-c','import time; time.sleep(30)'])))
        t.start();time.sleep(.1);self.q.cancel('p',a['id']);t.join(2);self.assertFalse(t.is_alive());self.assertTrue(result['cancelled'])
        with self.assertRaises(ProcessLookupError):os.kill(result['pid'],0)
    def test_real_ffmpeg_decode_media_fixture(self):
        a=self.submit();j=self.q.claim();out=Path(self.tmp.name)/'normalized.wav'
        r=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-i',j['input'],'-ac','1','-ar','16000',str(out)],capture_output=True,timeout=10);self.assertEqual(r.returncode,0)
        with wave.open(str(out)) as w:self.assertEqual(w.getframerate(),16000);self.assertEqual(w.getnframes(),1600)
        out.unlink();self.assertTrue(self.q.complete(j,{'segments':[],'kind':'media-decode-check-not-transcription'}))
    def test_auth_http_and_project_boundary(self):
        srv=server(self.q,'synthetic-test-secret');t=threading.Thread(target=srv.serve_forever,daemon=True);t.start();base='http://127.0.0.1:'+str(srv.server_port)
        def call(path,method='GET',body=None,auth='Bearer synthetic-test-secret',project='p'):
            req=urllib.request.Request(base+path,method=method,data=json.dumps(body).encode() if body else None,headers={'Authorization':auth,'X-Project-Id':project,'Idempotency-Key':'http-a','Content-Type':'application/json'})
            try:
                with urllib.request.urlopen(req) as r:return r.status,json.loads(r.read())
            except urllib.error.HTTPError as r:return r.code,json.loads(r.read())
        try:
            self.assertEqual(call('/jobs',auth='Bearer wrong')[0],401);status,a=call('/jobs','POST',{'audio_base64':base64.b64encode(wav()).decode()});self.assertEqual(status,202);self.assertEqual(call('/jobs/'+a['id'],project='other')[0],404);self.assertEqual(call('/jobs/'+a['id'])[0],200);self.assertTrue(call('/jobs/'+a['id'],'DELETE')[1]['cancelled']);self.assertEqual(call('/jobs/'+a['id'])[1]['state'],'cancelled')
        finally:srv.shutdown();srv.server_close();t.join()
if __name__=='__main__':unittest.main(verbosity=2)
