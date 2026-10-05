// Live check that the case-attribute filter changes counts in Visualizations, the Analysis workbench and Explore.
// Needs a running app: npm run dev; then PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node tests/browser-case-attribute.mjs
import {pathToFileURL} from 'node:url';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'));}
catch{console.log('SKIP: playwright is not installed (set PLAYWRIGHT_MODULE).');process.exit(0);}
const name='Case attribute check '+Date.now();
const doc=(id,n,text)=>({id,name:n,text,revision:1,turns:[]});
const state={name,documents:[doc('a','Interview A','Alpha account text here.\n'),doc('b','Interview B','Beta account text here.\n'),doc('c','Interview C','Gamma account text here today.\n')],
 codes:[{id:'c1',name:'Theme one',color:'#227e8a',codable:true},{id:'c2',name:'Theme two',color:'#a15e71',codable:true}],categories:[],
 attributeTypes:[{name:'region',scope:'case',valueType:'text'},{name:'years',scope:'case',valueType:'number'}],
 cases:[{id:'k1',name:'North one',documentIds:['a'],attributes:{region:'north',years:3}},{id:'k2',name:'North two',documentIds:['b'],attributes:{region:'north',years:8}},{id:'k3',name:'South one',documentIds:['c'],attributes:{region:'south',years:12}}],
 codings:[{id:'1',documentId:'a',codeId:'c1',start:0,end:5,text:'Alpha',status:'accepted',coder:'me'},{id:'2',documentId:'b',codeId:'c1',start:0,end:4,text:'Beta',status:'accepted',coder:'me'},{id:'3',documentId:'c',codeId:'c1',start:0,end:5,text:'Gamma',status:'accepted',coder:'me'},{id:'4',documentId:'c',codeId:'c2',start:6,end:13,text:'account',status:'accepted',coder:'me'}]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage(),failures=[],errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.goto(base);await page.waitForTimeout(2000);
const created=await page.evaluate(async s=>{const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:s})});return r.status;},state);
if(created>299){console.error('could not create the synthetic project: HTTP '+created);process.exit(1);}
await page.reload();await page.waitForTimeout(2500);
const select=page.locator('.rail select').first(),options=await select.locator('option').allTextContents();
await select.selectOption({index:options.findIndex(o=>o.includes(name))});await page.waitForTimeout(2500);
const nav=t=>page.locator('.rail nav button').filter({hasText:new RegExp('^'+t+'$')}).first().click().then(()=>page.waitForTimeout(1200));
const expectText=async(label,pattern)=>{const t=(await page.innerText('main')).replace(/\s+/g,' ');if(!pattern.test(t))failures.push(label+': expected '+pattern+' in page text');};
// Analysis workbench
await nav('Analysis workbench');
await expectText('workbench unfiltered',/4 applications · 4 excerpts/);
await page.selectOption('select[aria-label="Analysis case attribute"]','region');await page.selectOption('select[aria-label="Analysis case attribute"]','region');
await page.fill('input[aria-label="Analysis case attribute value"]','north');await page.waitForTimeout(600);
await expectText('workbench region=north',/2 applications · 2 excerpts/);
await page.fill('input[aria-label="Analysis case attribute value"]','south');await page.waitForTimeout(600);
await expectText('workbench region=south',/2 applications · 2 excerpts/);
await page.selectOption('select[aria-label="Analysis case attribute"]','years');
await page.selectOption('select[aria-label="Analysis case attribute comparison"]','gte');await page.fill('input[aria-label="Analysis case attribute value"]','8');await page.waitForTimeout(600);
await expectText('workbench years>=8',/3 applications · 3 excerpts/);
// Visualizations (pooled themes view)
await nav('Visualizations');
await page.selectOption('select[aria-label="Visualization source"]','__all__');
await page.locator('.tabs [role=tab]').filter({hasText:/^Theme map$/}).click();await page.waitForTimeout(800);
await expectText('visualizations unfiltered',/4\s*Selected coded excerpts/);
await page.selectOption('select[aria-label="Visualization case attribute"]','region');await page.selectOption('select[aria-label="Visualization case attribute value"]','north');await page.waitForTimeout(800);
await expectText('visualizations region=north',/2\s*Selected coded excerpts/);
// Explore
await nav('Explore');
await expectText('explore unfiltered',/4\s*Code applications/);
await page.selectOption('select[aria-label="Explore case attribute"]','region');await page.selectOption('select[aria-label="Explore case attribute value"]','south');await page.waitForTimeout(800);
await expectText('explore region=south',/2\s*Code applications/);
await page.selectOption('select[aria-label="Explore case attribute"]','');await page.waitForTimeout(500);
await expectText('explore cleared',/4\s*Code applications/);
errors.forEach(e=>failures.push('page error '+e));
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('case-attribute filter: counts change correctly in the workbench, Visualizations and Explore');
