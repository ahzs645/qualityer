import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else if(/\.(js|html|json)$/.test(p)){const text=await readFile(p,'utf8');for(const marker of ['calibration_owner','margot-demo','oai-authenticated-user','hidden-test-secret'])assert.ok(!text.includes(marker),'Private server material in '+p);}}}
await walk('dist/pages');assert.ok((await readFile('dist/pages/index.html','utf8')).includes('script'));console.log('Pages artifact contains a static synthetic demo; no private server fixtures found.');
