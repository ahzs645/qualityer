// Live check of the Code consistency tab: the off-topic excerpt is flagged and can be sent to the processing desk.
// Needs a running app: npm run dev; then PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node tests/browser-consistency.mjs
import {pathToFileURL} from 'node:url';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'));}
catch{console.log('SKIP: playwright is not installed (set PLAYWRIGHT_MODULE).');process.exit(0);}
const name='Consistency check '+Date.now();
const lines=['The hospital funding for research equipment was cut again this year.','Research equipment funding from the health authority keeps the lab running.','Without equipment funding our research capacity in the north would collapse.','Funding for shared research equipment is the main bottleneck we face.','My grandmother taught me to fish on the river every summer.'];
let text='',codings=[];for(const [i,l] of lines.entries()){const start=Array.from(text).length;text+=l+'\n';codings.push({id:'c'+i,documentId:'a',codeId:'fund',start,end:start+Array.from(l).length,text:l,status:'accepted',coder:'me'});}
const state={name,documents:[{id:'a',name:'Interview A',text,revision:1,turns:[]}],codes:[{id:'fund',name:'Research funding',color:'#227e8a',codable:true}],categories:[],cases:[],codings};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage(),failures=[],errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.goto(base);await page.waitForTimeout(2000);
const created=await page.evaluate(async s=>{const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:s})});return {status:r.status,body:await r.json().catch(()=>({}))};},state);
if(created.status>299){console.error('could not create the synthetic project: HTTP '+created.status);process.exit(1);}
await page.reload();await page.waitForTimeout(2500);
const select=page.locator('.rail select').first(),options=await select.locator('option').allTextContents();
await select.selectOption({index:options.findIndex(o=>o.includes(name))});await page.waitForTimeout(2500);
await page.locator('.rail nav button').filter({hasText:/^Analysis workbench$/}).first().click();await page.waitForTimeout(1200);
await page.locator('.tabs [role=tab]').filter({hasText:/^Code consistency$/}).click();await page.waitForTimeout(1000);
const main=async()=>(await page.innerText('main')).replace(/\s+/g,' ');
if(!/5 distinct excerpts compared\. 1 falls below the cutoff/.test(await main()))failures.push('expected exactly one flagged excerpt of five');
const flagged=await page.locator('.consistency-list li.flagged').allInnerTexts();
if(flagged.length!==1||!/grandmother/.test(flagged[0]))failures.push('the off-topic excerpt should be the flagged one: '+JSON.stringify(flagged));
await page.getByRole('button',{name:/Send 1 flagged excerpt to the processing desk/}).click();await page.waitForTimeout(1500);
if(!/1 review task added to the processing desk/.test(await main()))failures.push('no confirmation after sending');
const tasks=await page.evaluate(async id=>{const r=await fetch('/api/projects/'+id);const j=await r.json();return (j.state||j.project?.state||{}).reviewTasks||[];},created.body.id);
if(tasks.length!==1||tasks[0].issue!=='Read lexical outlier'||!/grandmother/.test(tasks[0].text))failures.push('review task not stored as expected: '+JSON.stringify(tasks.map(t=>t.issue)));
errors.forEach(e=>failures.push('page error '+e));
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('code consistency: off-topic excerpt flagged and stored as a processing-desk review task');
