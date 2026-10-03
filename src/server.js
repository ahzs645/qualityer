import handler from '@tanstack/react-start/server-entry';
import apiWorker from '../server/worker.mjs';
export default {async fetch(request,env,ctx){const path=new URL(request.url).pathname;if(path.startsWith('/api/')||path==='/favicon.svg')return apiWorker.fetch(request,env,ctx);const response=await handler.fetch(request);response.headers.set('Cache-Control','no-store');response.headers.set('X-Content-Type-Options','nosniff');response.headers.set('Referrer-Policy','same-origin');return response;}};
