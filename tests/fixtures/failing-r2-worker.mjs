// Test-only Worker: wraps the built app and makes one R2 object body error mid-stream.
// Header x-test-r2-fail: "<key suffix>:<get number to break (1-based)>:<bytes before the error>".
import app from '../../dist/server/index.js';

function failingBucket(bucket,rule){
 const [suffix,nth,after]=rule.split(':');let seen=0;
 return new Proxy(bucket,{get(target,prop){
  if(prop!=='get')return typeof target[prop]==='function'?target[prop].bind(target):target[prop];
  return async(key,options)=>{
   const object=await target.get(key,options);
   if(!key.endsWith(suffix)||!object?.body||++seen!==Number(nth))return object;
   const reader=object.body.getReader();let sent=0;
   const body=new ReadableStream({async pull(controller){
    if(sent>=Number(after)){controller.error(Error('Injected R2 read failure'));return;}
    const {done,value}=await reader.read();if(done){controller.close();return;}
    const part=value.subarray(0,Math.max(1,Number(after)-sent));sent+=part.length;controller.enqueue(part);
   }});
   return new Proxy(object,{get:(o,p)=>p==='body'?body:typeof o[p]==='function'?o[p].bind(o):o[p]});
  };
 }});
}

export default {fetch(req,env,ctx){const rule=req.headers.get('x-test-r2-fail');return app.fetch(req,rule?{...env,BUCKET:failingBucket(env.BUCKET,rule)}:env,ctx);}};
