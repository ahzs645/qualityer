"""Isolated durable audio queue proof. Not wired to the application or deployed.
No fake transcript: adapters must return validated output, fixture tests are labelled.
"""
import base64, hashlib, hmac, json, os, signal, sqlite3, subprocess, time, uuid, wave
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from result_validation import validate_result

TERMINAL={'completed','failed','cancelled','expired'}
class Queue:
    def __init__(self,root,clock=time.time,max_bytes=50_000_000):
        self.root=Path(root);self.root.mkdir(parents=True,exist_ok=True);self.clock=clock;self.max_bytes=max_bytes
        with self.db() as d:
            d.execute('''CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,project TEXT NOT NULL,idem TEXT NOT NULL,digest TEXT NOT NULL,state TEXT NOT NULL,attempt INTEGER DEFAULT 0,max_attempts INTEGER NOT NULL,available REAL NOT NULL,lease_until REAL,lease_id TEXT,cancel INTEGER DEFAULT 0,created REAL NOT NULL,updated REAL NOT NULL,expires REAL NOT NULL,config TEXT NOT NULL,result TEXT,error TEXT,UNIQUE(project,idem))''')
    def db(self):
        d=sqlite3.connect(self.root/'queue.sqlite',timeout=20);d.row_factory=sqlite3.Row;d.execute('PRAGMA journal_mode=WAL');return d
    def submit(self,project,idem,audio,config=None,retention=86400,max_attempts=3):
        if not project or not idem:raise ValueError('project and idempotency key required')
        if not isinstance(audio,bytes) or not 0<len(audio)<=self.max_bytes:raise ValueError('audio size invalid')
        # POC permits PCM WAV only; real adapter must decode/sniff additional supported formats.
        with wave.open(BytesIO(audio)) as w:
            if w.getnframes()<=0 or w.getnchannels()>2:raise ValueError('invalid PCM WAV')
        cfg=json.dumps(config or {},sort_keys=True,separators=(',',':'));digest=hashlib.sha256(audio+b'\0'+cfg.encode()).hexdigest();now=self.clock();jid=uuid.uuid4().hex
        with self.db() as d:
            d.execute('BEGIN IMMEDIATE');existing=d.execute('SELECT * FROM jobs WHERE project=? AND idem=?',(project,idem)).fetchone()
            if existing:
                if existing['digest']!=digest:raise ValueError('idempotency key reused with changed input/config')
                return dict(existing)
            path=self.root/(jid+'.wav');tmp=path.with_suffix('.tmp');tmp.write_bytes(audio);os.chmod(tmp,0o600);tmp.replace(path)
            try:d.execute('INSERT INTO jobs(id,project,idem,digest,state,max_attempts,available,created,updated,expires,config) VALUES(?,?,?,?,?,?,?,?,?,?,?)',(jid,project,idem,digest,'queued',max_attempts,now,now,now,now+retention,cfg))
            except BaseException:path.unlink(missing_ok=True);raise
        return self.get(project,jid)
    def get(self,project,jid):
        with self.db() as d:r=d.execute('SELECT * FROM jobs WHERE id=? AND project=?',(jid,project)).fetchone()
        if not r:raise KeyError('job not found')
        row=dict(r);row.pop('lease_id',None);row['config']=json.loads(row['config']);row['result']=json.loads(row['result']) if row['result'] else None;return row
    def claim(self,lease_seconds=60):
        now=self.clock()
        with self.db() as d:
            d.execute('BEGIN IMMEDIATE')
            # Expired leases are retried only if not cancelled and budget remains.
            d.execute("UPDATE jobs SET state=CASE WHEN cancel=1 THEN 'cancelled' WHEN attempt>=max_attempts THEN 'failed' ELSE 'queued' END,available=?,lease_id=NULL,lease_until=NULL,updated=?,error='Worker lease expired' WHERE state='running' AND lease_until<=?",(now,now,now))
            d.execute("UPDATE jobs SET state='expired',result=NULL,error=NULL,updated=? WHERE expires<=? AND state!='expired'",(now,now))
            row=d.execute("SELECT * FROM jobs WHERE state='queued' AND cancel=0 AND available<=? AND expires>? ORDER BY created,id LIMIT 1",(now,now)).fetchone()
            if not row:return None
            lease=uuid.uuid4().hex;d.execute("UPDATE jobs SET state='running',attempt=attempt+1,lease_id=?,lease_until=?,updated=? WHERE id=?",(lease,now+lease_seconds,now,row['id']))
            return {'id':row['id'],'project':row['project'],'lease':lease,'input':str(self.root/(row['id']+'.wav')),'config':json.loads(row['config'])}
    def heartbeat(self,job,lease_seconds=60):
        now=self.clock()
        with self.db() as d:return d.execute("UPDATE jobs SET lease_until=?,updated=? WHERE id=? AND lease_id=? AND state='running' AND cancel=0 AND expires>? AND lease_until>?",(now+lease_seconds,now,job['id'],job['lease'],now,now)).rowcount==1
    def complete(self,job,result):
        # Reject malformed generated results; retain valid null/missing times exactly.
        validate_result(result)
        now=self.clock()
        with self.db() as d:
            d.execute('BEGIN IMMEDIATE');r=d.execute("UPDATE jobs SET state='completed',result=?,updated=?,lease_id=NULL,lease_until=NULL WHERE id=? AND lease_id=? AND state='running' AND cancel=0 AND expires>? AND lease_until>?",(json.dumps(result),now,job['id'],job['lease'],now,now));return r.rowcount==1
    def retry(self,job,error,transient=True):
        now=self.clock()
        with self.db() as d:
            d.execute('BEGIN IMMEDIATE');r=d.execute('SELECT * FROM jobs WHERE id=? AND lease_id=?',(job['id'],job['lease'])).fetchone()
            if not r:return False
            state='cancelled' if r['cancel'] else ('queued' if transient and r['attempt']<r['max_attempts'] else 'failed')
            d.execute('UPDATE jobs SET state=?,available=?,updated=?,lease_id=NULL,lease_until=NULL,error=? WHERE id=?',(state,now+min(60,2**r['attempt']),now,str(error)[:500],job['id']));return True
    def cancel(self,project,jid):
        now=self.clock()
        with self.db() as d:r=d.execute("UPDATE jobs SET cancel=1,state='cancelled',result=NULL,updated=?,lease_id=NULL,lease_until=NULL WHERE id=? AND project=? AND state IN('queued','running')",(now,jid,project));return r.rowcount==1
    def purge(self):
        now=self.clock()
        with self.db() as d:
            d.execute('BEGIN IMMEDIATE');rows=d.execute('SELECT id FROM jobs WHERE expires<=?',(now,)).fetchall()
            for r in rows:(self.root/(r['id']+'.wav')).unlink(missing_ok=True)
            d.execute("UPDATE jobs SET state='expired',result=NULL,error=NULL,config='{}',lease_id=NULL,lease_until=NULL,updated=? WHERE expires<=?",(now,now))
            # Remove unreferenced temp/input artifacts left by a process crash.
            known={r[0] for r in d.execute('SELECT id FROM jobs')}
            for f in self.root.glob('*.tmp'):f.unlink(missing_ok=True)
            for f in self.root.glob('*.wav'):
                if f.stem not in known:f.unlink(missing_ok=True)
        return len(rows)

class API(BaseHTTPRequestHandler):
    queue=None;token=None
    def log_message(self,*args):pass  # Do not log tokens/media/body.
    def response(self,status,data):
        b=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(b)));self.end_headers();self.wfile.write(b)
    def dispatch(self):
        if not self.token or not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.token):self.response(401,{'error':'unauthorized'});return
        project=self.headers.get('X-Project-Id','')
        if not project:self.response(400,{'error':'project scope required'});return
        try:
            if self.command=='POST' and self.path=='/jobs':
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=self.queue.max_bytes*2:self.response(413,{'error':'request too large'});return
                b=json.loads(self.rfile.read(length));audio=base64.b64decode(b['audio_base64'],validate=True)
                self.response(202,self.queue.submit(project,self.headers.get('Idempotency-Key',''),audio,b.get('config')));return
            if self.path.startswith('/jobs/'):
                jid=self.path.split('/')[-1]
                if self.command=='DELETE':self.queue.get(project,jid);self.response(200,{'cancelled':self.queue.cancel(project,jid)});return
                if self.command=='GET':self.response(200,self.queue.get(project,jid));return
            self.response(404,{'error':'not found'})
        except KeyError:self.response(404,{'error':'not found'})
        except (ValueError,wave.Error,json.JSONDecodeError):self.response(400,{'error':'invalid request or idempotency conflict'})
    do_GET=do_POST=do_DELETE=dispatch

def server(queue,token,port=0):
    if not token:raise ValueError('bearer secret required')
    handler=type('BoundAPI',(API,),{'queue':queue,'token':token});return ThreadingHTTPServer(('127.0.0.1',port),handler)


def execute_subprocess(queue,job,command):
    """Execute a trusted adapter command; cancel kills process group, fences output.
    Command comes from server-owned adapter configuration, never user input.
    Adapter stdout must contain one bounded-size JSON result.
    """
    proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
    while True:
        try:out,err=proc.communicate(timeout=.05);break
        except subprocess.TimeoutExpired:
            if not queue.heartbeat(job):
                os.killpg(proc.pid,signal.SIGTERM)
                try:proc.communicate(timeout=1)
                except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.communicate()
                return {'cancelled':True,'pid':proc.pid}
    if proc.returncode:
        queue.retry(job,'adapter failed: '+err.decode(errors='replace')[:300]);return {'failed':True,'pid':proc.pid}
    if len(out)>4_000_000:
        queue.retry(job,'adapter response exceeds limit',transient=False);return {'failed':True,'pid':proc.pid}
    try:result=json.loads(out);completed=queue.complete(job,result)
    except (ValueError,json.JSONDecodeError):queue.retry(job,'invalid adapter output',transient=False);completed=False
    return {'completed':completed,'pid':proc.pid}
