"""Gateway contract test, synthetic audio; no inference/model substitutes."""
import io,os,sys,tempfile,unittest,uuid,wave
ROOT=tempfile.TemporaryDirectory();os.environ['AUDIO_DATA_DIR']=ROOT.name;os.environ['AUDIO_WORKER_TOKEN']='synthetic-test-token-123456789'
sys.path.insert(0,os.path.dirname(__file__))
import app
import httpx
class GatewayTests(unittest.IsolatedAsyncioTestCase):
 async def test_private_stream_upload_idempotency_scope_and_cancel(self):
  data=io.BytesIO()
  with wave.open(data,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(b'\0\0'*1600)
  job=str(uuid.uuid4());headers={'Authorization':'Bearer '+app.TOKEN,'Idempotency-Key':job,'Content-Type':'audio/wav'}
  async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app.app),base_url='http://gateway') as c:
   self.assertEqual((await c.get('/health')).status_code,401)
   r=await c.post('/jobs',params={'project_id':'p','job_id':job},headers=headers,content=data.getvalue());self.assertEqual(r.status_code,202);self.assertEqual(r.json()['id'],job)
   again=await c.post('/jobs',params={'project_id':'p','job_id':job},headers=headers,content=data.getvalue());self.assertEqual(again.json()['id'],job)
   self.assertEqual((await c.get('/jobs/'+job,params={'project_id':'other'},headers=headers)).status_code,404)
   self.assertEqual((await c.delete('/jobs/'+job,params={'project_id':'p'},headers=headers)).json()['status'],'cancelled')
   self.assertEqual((await c.get('/jobs/'+job,params={'project_id':'p'},headers=headers)).json()['status'],'cancelled')
if __name__=='__main__':unittest.main()
