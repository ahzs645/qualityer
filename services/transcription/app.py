"""Team-hosted durable transcription gateway. No inference runs in the Site worker."""
import asyncio, hashlib, hmac, json, os, shutil, sqlite3, subprocess, sys, threading, time, uuid
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from queue_store import Queue, execute_subprocess

ROOT=Path(os.environ.get('AUDIO_DATA_DIR','/data'));ROOT.mkdir(parents=True,exist_ok=True)
TOKEN=os.environ.get('AUDIO_WORKER_TOKEN','')
if len(TOKEN)<24:raise RuntimeError('Set AUDIO_WORKER_TOKEN to a random secret of at least 24 characters.')
queue=Queue(ROOT,max_bytes=2_000_000_000)
app=FastAPI(docs_url=None,redoc_url=None)
def authorize(req):
    if not hmac.compare_digest(req.headers.get('authorization',''),'Bearer '+TOKEN):raise HTTPException(401,'Unauthorized')
def view(row):
    return {'id':row['id'],'status':'failed' if row['state']=='expired' else row['state'],'progress':100 if row['state']=='completed' else 0,'result':row['result'],'error':row['error'],'attempt':row['attempt']}
@app.get('/health')
async def health(request:Request):
    authorize(request);return {'queue':'ready','model':os.environ.get('WHISPER_MODEL','small'),'engine':'whisperx','gpu':os.environ.get('WHISPER_DEVICE','cpu')}
@app.post('/jobs',status_code=202)
async def submit(request:Request,project_id:str,job_id:str,diarize:bool=False,name:str='recording'):
    authorize(request)
    if not project_id or not __import__('re').fullmatch(r'[a-fA-F0-9-]{32,36}',job_id) or request.headers.get('idempotency-key')!=job_id:raise HTTPException(400,'Project and idempotency key required')
    if diarize and not os.environ.get('HF_TOKEN'):raise HTTPException(503,'Diarization requires HF_TOKEN and acceptance of the configured model terms.')
    temp=ROOT/(uuid.uuid4().hex+'.upload');digest=hashlib.sha256();size=0
    try:
        with temp.open('wb') as f:
            os.chmod(temp,0o600)
            async for chunk in request.stream():
                size+=len(chunk)
                if size>queue.max_bytes:raise HTTPException(413,'Recording exceeds 2 GB')
                f.write(chunk);digest.update(chunk)
        if not size:raise HTTPException(400,'Empty recording')
        probe=await asyncio.create_subprocess_exec('ffprobe','-v','error','-select_streams','a:0','-show_entries','stream=codec_type','-of','json',str(temp),stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.DEVNULL)
        output,_=await asyncio.wait_for(probe.communicate(),30)
        if probe.returncode or not json.loads(output).get('streams'):raise HTTPException(400,'Recording has no decodable audio stream')
        config={'diarize':diarize};cfg=json.dumps(config,sort_keys=True,separators=(',',':'));digest.update(b'\0'+cfg.encode());hashed=digest.hexdigest();jid=job_id;now=time.time()
        with queue.db() as db:
            db.execute('BEGIN IMMEDIATE');existing=db.execute('SELECT * FROM jobs WHERE project=? AND idem=?',(project_id,job_id)).fetchone()
            if existing:
                if existing['digest']!=hashed:raise HTTPException(409,'Idempotency key reused with changed recording')
                return view(queue.get(project_id,existing['id']))
            # Legacy Queue storage uses .wav paths; ffmpeg detects bytes regardless of extension.
            temp.replace(ROOT/(jid+'.wav'))
            db.execute('INSERT INTO jobs(id,project,idem,digest,state,max_attempts,available,created,updated,expires,config) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(jid,project_id,job_id,hashed,'queued',3,now,now,now,now+int(os.environ.get('AUDIO_RETENTION_SECONDS','604800')),cfg))
        return view(queue.get(project_id,jid))
    finally:temp.unlink(missing_ok=True)
@app.get('/jobs/{jid}')
async def status(jid:str,project_id:str,request:Request):
    authorize(request)
    try:return view(queue.get(project_id,jid))
    except KeyError:raise HTTPException(404,'Job not found')
@app.delete('/jobs/{jid}')
async def cancel(jid:str,project_id:str,request:Request):
    authorize(request)
    try:queue.get(project_id,jid)
    except KeyError:raise HTTPException(404,'Job not found')
    queue.cancel(project_id,jid);return {'id':jid,'status':'cancelled'}
def consume():
    while True:
        queue.purge()
        for orphan in ROOT.glob('*.upload'):
            if time.time()-orphan.stat().st_mtime>86400:orphan.unlink(missing_ok=True)
        job=queue.claim()
        if not job:time.sleep(1);continue
        execute_subprocess(queue,job,[sys.executable,str(Path(__file__).with_name('inference.py')),job['input'],json.dumps(job['config'])])
@app.on_event('startup')
async def start():threading.Thread(target=consume,daemon=True).start()
