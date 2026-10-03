"""Bounded subprocess transport. No model imports; stdout is one validated JSON result."""
import json,os,selectors,signal,subprocess,time

STAGES={'decoding','loading_model','transcribing','aligning','diarizing','validating'}
PREFIX=b'@research-stage:'

def stop_group(proc):
    try:os.killpg(proc.pid,signal.SIGTERM)
    except ProcessLookupError:return
    try:proc.wait(timeout=1)
    except subprocess.TimeoutExpired:
        try:os.killpg(proc.pid,signal.SIGKILL)
        except ProcessLookupError:pass
        proc.wait(timeout=5)
    # A child can outlive a leader that exited on TERM. Kill any remaining group.
    try:os.killpg(proc.pid,signal.SIGKILL)
    except ProcessLookupError:pass

def execute_bounded(queue,job,command,max_stdout=4_000_000,max_stderr=256_000,max_seconds=21600):
    proc=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True,bufsize=0)
    selector=selectors.DefaultSelector();selector.register(proc.stdout,selectors.EVENT_READ,'stdout');selector.register(proc.stderr,selectors.EVENT_READ,'stderr')
    output=bytearray();error_bytes=0;error_tail=bytearray();partial=bytearray();started=time.monotonic();last_heartbeat=started
    failure=None;cancelled=False
    try:
        while selector.get_map():
            now=time.monotonic()
            if now-started>max_seconds:failure='adapter exceeded runtime limit';break
            if now-last_heartbeat>=.05:
                if not queue.heartbeat(job):cancelled=True;break
                last_heartbeat=now
            for key,_ in selector.select(timeout=.05):
                block=os.read(key.fileobj.fileno(),65536)
                if not block:selector.unregister(key.fileobj);continue
                if key.data=='stdout':
                    if len(output)+len(block)>max_stdout:failure='adapter response exceeds limit';break
                    output.extend(block)
                else:
                    error_bytes+=len(block)
                    if error_bytes>max_stderr:failure='adapter diagnostic output exceeds limit';break
                    error_tail.extend(block);error_tail=error_tail[-512:];partial.extend(block)
                    while b'\n' in partial:
                        line,_,remaining=partial.partition(b'\n');partial=bytearray(remaining)
                        if line.startswith(PREFIX):
                            stage=line[len(PREFIX):].decode('ascii',errors='ignore').strip()
                            if stage in STAGES and hasattr(queue,'stage'):queue.stage(job,stage)
            if failure:break
        if cancelled or failure:
            stop_group(proc)
            if failure:queue.retry(job,failure,transient=False)
            return {'cancelled':True,'pid':proc.pid} if cancelled else {'failed':True,'pid':proc.pid}
        proc.wait(timeout=5)
        if proc.returncode:
            # Never persist model diagnostics, which can include raw transcript/audio paths.
            queue.retry(job,'adapter exited with code '+str(proc.returncode));return {'failed':True,'pid':proc.pid}
        try:
            if hasattr(queue,'stage'):queue.stage(job,'validating')
            result=json.loads(output);completed=queue.complete(job,result)
        except (ValueError,json.JSONDecodeError):queue.retry(job,'invalid adapter output',transient=False);completed=False
        return {'completed':completed,'pid':proc.pid}
    except BaseException:
        stop_group(proc);raise
    finally:
        stop_group(proc);selector.close();proc.stdout.close();proc.stderr.close()
