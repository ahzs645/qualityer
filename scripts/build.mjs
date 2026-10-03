import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
await rm('dist/server',{recursive:true,force:true});
await rm('dist/client',{recursive:true,force:true});
await rm('.sites-runtime/start',{recursive:true,force:true});
const result=spawnSync('npx',['vite','build'],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);
// Sites deploys one Worker. Embed Vite's emitted assets without altering Start's handler.
const assetRoot='dist/client',assets={};
const mime={'.js':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json','.html':'text/html'};
async function walk(dir){for(const ent of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,ent.name);if(ent.isDirectory())await walk(file);else{const key='/'+path.relative(assetRoot,file).replaceAll('\\','/');assets[key]={data:(await readFile(file)).toString('base64'),type:mime[path.extname(file)]||'application/octet-stream'};}}}
await walk(assetRoot);await mkdir('.sites-runtime',{recursive:true});
await writeFile('.sites-runtime/assets.mjs','export default '+JSON.stringify(assets)+';');
await cp('dist/server','.sites-runtime/start',{recursive:true});
await writeFile('.sites-runtime/entry.mjs',`import start from './start/index.js';import assets from './assets.mjs';export default {async fetch(request,env,ctx){const asset=assets[new URL(request.url).pathname];if(asset){if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff'}});}return start.fetch(request,env,ctx);}};`);
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['.sites-runtime/entry.mjs'],bundle:true,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2022',outfile:'dist/server/index.js',minify:true,external:['node:*','cloudflare:*']});
await cp('drizzle','dist/server/drizzle',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({name:'research-weave',main:'index.js',compatibility_date:'2025-10-01',compatibility_flags:['nodejs_compat'],d1_databases:[{binding:'DB',database_name:'research-weave',database_id:'local-research-weave'}],r2_buckets:[{binding:'BUCKET',bucket_name:'research-weave-media'}]}));
console.log('Built TanStack Start serverless Worker and embedded client assets.');
