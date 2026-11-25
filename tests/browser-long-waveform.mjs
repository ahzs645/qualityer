// Live check that a long recording gets a waveform without in-memory decoding, that it is saved for later visits,
// and that peaks made by scripts/media-peaks.mjs can be imported. Needs ffmpeg and a running app:
//   npm run dev; then PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node tests/browser-long-waveform.mjs
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'));}
catch{console.log('SKIP: playwright is not installed (set PLAYWRIGHT_MODULE).');process.exit(0);}
try{execFileSync('ffmpeg',['-version'],{stdio:'ignore'});}catch{console.log('SKIP: ffmpeg is not installed.');process.exit(0);}
// 30 minutes of Opus in MP4: loud for 15 minutes, then a tenth of the level. Too long for in-memory decoding
// (30 min × 48 kHz × 2 channels ≫ 50 M samples), so only the streaming path can draw it. Opus is used because
// open-source Chromium builds lack AAC; the MP4 indexing and range reads are identical.
const media=join(tmpdir(),'research-weave-long-opus-v1.mp4');
if(!existsSync(media))execFileSync('ffmpeg',['-v','error','-y','-f','lavfi','-i','anoisesrc=color=pink:amplitude=0.6:sample_rate=48000:duration=1800','-af',"volume='if(lt(t,900),1,0.1)':eval=frame,aformat=channel_layouts=stereo",'-c:a','libopus','-b:a','128k','-f','mp4',media]);
const {ffmpegPeaks}=await import('../scripts/media-peaks.mjs'),peaksFile=join(tmpdir(),'research-weave-long-opus-v1.peaks.json');
if(!existsSync(peaksFile))writeFileSync(peaksFile,JSON.stringify(await ffmpegPeaks(media)));

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),failures=[];
async function study(page,name){
 await page.goto(base);await page.waitForTimeout(1500);
 const status=await page.evaluate(async n=>(await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:{name:n,documents:[],codes:[],categories:[],cases:[],codings:[]}})})).status,name);if(status>299)throw Error('could not create project: '+status);
 await page.reload();await page.waitForTimeout(2000);const opts=await page.locator('.rail select option').allTextContents();await page.selectOption('.rail select',{index:opts.findIndex(o=>o.includes(name))});await page.waitForTimeout(1500);
 await page.locator('.rail nav button').filter({hasText:/^Sources$/}).click();await page.waitForTimeout(500);
 const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:/Import source/}).first().click()]);await fc.setFiles(media);
 await page.locator('.modal button',{hasText:/^Import source$/}).click();
 await page.waitForFunction(()=>/100%/.test(document.body.innerText),null,{timeout:120000}).catch(()=>{});await page.waitForTimeout(1500);
 await page.locator('.rail nav button').filter({hasText:/^Workspace$/}).click();await page.waitForTimeout(1500);await page.getByRole('button',{name:/^Recording$/}).click();await page.waitForTimeout(1500);
}
const button=page=>page.locator('.audio-waveform > .filterbar button').first().innerText();
const statusText=async page=>(await page.locator('.audio-waveform > [role=status]').allInnerTexts()).join(' ');
const levels=async page=>{const h=await page.$$eval('.audio-waveform svg[aria-label="Waveform seek"] line',ls=>ls.slice(0,500).map(l=>Number(l.getAttribute('y2'))-Number(l.getAttribute('y1'))));const avg=a=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);return [avg(h.slice(0,240)),avg(h.slice(260,500))];};

{ // Streaming decode, saved, reloaded.
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const name='Long waveform '+Date.now();await study(page,name);
 await page.getByRole('button',{name:/Generate local waveform/}).click();let sawProgress=false,peakHeap=0;
 for(let i=0;i<300;i++){await page.waitForTimeout(1000);if(await page.locator('.audio-waveform progress').count())sawProgress=true;peakHeap=Math.max(peakHeap,await page.evaluate(()=>performance.memory?.usedJSHeapSize||0));if(!/^Decoding/.test(await button(page)))break;}
 if(!/Waveform ready/.test(await button(page)))failures.push('streaming decode did not finish: '+await button(page)+' / '+await statusText(page));
 if(!sawProgress)failures.push('no progress was shown while decoding');
 if(peakHeap>400e6)failures.push('heap grew to '+Math.round(peakHeap/1e6)+' MB while decoding');
 const [loud,quiet]=await levels(page);if(!(loud>quiet*5))failures.push('waveform does not show the loud and quiet halves: '+loud.toFixed(1)+' vs '+quiet.toFixed(1));
 await page.waitForFunction(()=>/saved for later visits/.test(document.querySelector('.audio-waveform')?.innerText||''),null,{timeout:20000}).catch(()=>failures.push('waveform was not saved'));
 await page.reload();await page.waitForTimeout(2500);const opts=await page.locator('.rail select option').allTextContents();await page.selectOption('.rail select',{index:opts.findIndex(o=>o.includes(name))});await page.waitForTimeout(1500);
 await page.locator('.rail nav button').filter({hasText:/^Workspace$/}).click();await page.waitForTimeout(1500);await page.getByRole('button',{name:/^Recording$/}).click();await page.waitForTimeout(2500);
 if(!/Saved waveform loaded/.test(await button(page)))failures.push('saved waveform not loaded on a later visit');
 errors.forEach(e=>failures.push('page error '+e));
}
{ // Import peaks produced by the ffmpeg script.
 const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await study(page,'Imported waveform '+Date.now());
 const [fc]=await Promise.all([page.waitForEvent('filechooser'),page.getByRole('button',{name:/Import waveform peaks/}).click()]);await fc.setFiles(peaksFile);
 await page.waitForFunction(()=>/Imported waveform peaks/.test(document.querySelector('.audio-waveform')?.innerText||''),null,{timeout:20000}).catch(async()=>failures.push('peaks import failed: '+await statusText(page)));
 if(!/duration checked/.test(await statusText(page)))failures.push('imported peaks were not checked against the recording duration: '+await statusText(page));
 const [loud,quiet]=await levels(page);if(!(loud>quiet*5))failures.push('imported waveform levels wrong: '+loud.toFixed(1)+' vs '+quiet.toFixed(1));
 errors.forEach(e=>failures.push('page error '+e));
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('long waveform: streamed without in-memory decoding, saved for later visits, and ffmpeg peaks import correctly');
