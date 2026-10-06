// Live check that mouse-drag selections are stored as exactly the highlighted source range, including drags that start
// at a row's first character or cross turn boundaries, and that a failed highlight never codes the previous passage.
// Needs a running app: npm run dev; then PLAYWRIGHT_MODULE=... CHROMIUM_PATH=... node tests/browser-coding-selection.mjs
import {pathToFileURL} from 'node:url';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'));}
catch{console.log('SKIP: playwright is not installed (set PLAYWRIGHT_MODULE).');process.exit(0);}
const cps=t=>Array.from(t),lines=['Interviewer: Thanks for joining today.','Participant: The regional hub links existing research groups across the north.','Interviewer: How does that work in practice?','Participant: People find one visible entry point, then we connect them to labs, clinics and community partners.','Participant: Funding is still the main constraint for equipment and staff.','Interviewer: Anything else?','Participant: Relationships with First Nations partners take years and must be kept up.'];
let text='',turns=[];for(const [i,l] of lines.entries()){const start=cps(text).length;text+=l+'\n';turns.push({id:'t'+i,sourceIndex:i,start,end:start+cps(l).length,speaker:l.startsWith('Interviewer')?'Speaker 1':'Speaker 2'});}
const name='Selection check '+Date.now(),state={name,documents:[{id:'a',name:'Interview A',text,revision:1,turns}],codes:[{id:'k',name:'Theme',color:'#227e8a',codable:true}],categories:[],cases:[],codings:[]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']}),page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage(),failures=[],errors=[];
page.on('pageerror',e=>errors.push(String(e)));
await page.goto(base);await page.waitForTimeout(1500);
const created=await page.evaluate(async s=>{const r=await fetch('/api/projects',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:s})});return {status:r.status,body:await r.json()};},state);
await page.reload();await page.waitForTimeout(2000);const opts=await page.locator('.rail select option').allTextContents();await page.selectOption('.rail select',{index:opts.findIndex(o=>o.includes(name))});await page.waitForTimeout(1500);
await page.locator('.rail nav button').filter({hasText:/^Workspace$/}).click();await page.waitForTimeout(1500);
// Drag from the first character of turn a to the last character of turn b with the real mouse.
async function drag(a,b){
 // Like a person: press at the first character, move a little, wheel-scroll while holding the button, then release at the last character.
 const point=(t,edge)=>page.evaluate(([t,edge])=>{const spans=[...document.querySelectorAll('[data-transcript-text]')].filter(s=>Number(s.dataset.start)<t.end&&Number(s.dataset.end)>t.start);const s=edge==='start'?spans[0]:spans.at(-1);const r=document.createRange(),n=s.firstChild;if(edge==='start'){r.setStart(n,0);r.setEnd(n,1);}else{r.setStart(n,n.length-1);r.setEnd(n,n.length);}const q=r.getBoundingClientRect(),pane=document.querySelector('.transcript-scroll').getBoundingClientRect();return {x:edge==='start'?q.left+0.5:q.right-0.5,y:q.top+q.height/2,visible:q.top>=pane.top+4&&q.bottom<=pane.bottom-4};},[t,edge]);
 await page.evaluate(t=>{const s=[...document.querySelectorAll('[data-transcript-text]')].find(s=>Number(s.dataset.start)<t.end&&Number(s.dataset.end)>t.start);s.scrollIntoView({block:'start'});document.querySelector('.transcript-scroll').scrollBy(0,-40);},turns[a]);await page.waitForTimeout(300);
 const from=await point(turns[a],'start');await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+30,from.y+2,{steps:4});
 for(let i=0;i<40&&!(await point(turns[b],'end')).visible;i++){await page.mouse.wheel(0,90);await page.waitForTimeout(60);await page.mouse.move(from.x+30+(i%2),from.y+4,{steps:1});}
 const to=await point(turns[b],'end');await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();await page.waitForTimeout(600);
}

const cases=[[1,1],[3,3],[1,3],[3,4],[4,6],[6,6]];
for(const [a,b] of cases){
 await drag(a,b);
 const label=await page.getByRole('button',{name:/^Apply coding/}).first().innerText().catch(()=>'');const expected=a===b?'T'+(a+1):'T'+(a+1)+'–T'+(b+1);
 if(!label.includes(expected))failures.push(`drag T${a+1}..T${b+1}: Apply button says "${label.trim()}", expected ${expected}`);
 const picker=page.locator('select').filter({has:page.locator('option',{hasText:'Choose a code'})}).first();if(await picker.count())await picker.selectOption({label:'Theme'});else{const box=page.getByRole('checkbox',{name:/Theme/}).first();if(await box.count()&&!(await box.isChecked()))await box.check();}await page.waitForTimeout(200);
 await page.getByRole('button',{name:/^Apply coding/}).first().click();await page.waitForTimeout(1200);
}
const stored=await page.evaluate(async id=>{const j=await (await fetch('/api/projects/'+id)).json();return (j.state.codings||[]).filter(c=>!c.deletedAt).map(c=>[c.start,c.end]);},created.body.id);
for(const [a,b] of cases){const want=[turns[a].start,turns[b].end];if(!stored.some(([s,e])=>s===want[0]&&e===want[1]))failures.push(`no coding stored for exactly T${a+1}..T${b+1} (${want}); stored ${JSON.stringify(stored)}`);}
if(stored.length!==cases.length)failures.push('expected '+cases.length+' codings, found '+stored.length);
// A highlight that includes interface text cannot be matched; it must clear the panel instead of keeping the previous passage.
await drag(1,1);await page.evaluate(()=>{const span=[...document.querySelectorAll('[data-transcript-text]')].find(x=>Number(x.dataset.start)>=39&&x.textContent.length>20),row=span.closest('.transcript-reading-row'),ui=row.querySelector('[data-transcript-ui] span');const r=document.createRange();r.setStart(ui.firstChild,0);r.setEnd(span.firstChild,10);const s=getSelection();s.removeAllRanges();s.addRange(r);});
await page.locator('.transcript-reader').first().dispatchEvent('pointerup');await page.waitForTimeout(500);
const after=await page.getByRole('button',{name:/^Apply coding/}).first().innerText().catch(()=>'none');if(/T2\b/.test(after))failures.push('previous passage still targeted after an unmatched highlight: '+after);
errors.forEach(e=>failures.push('page error '+e));await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('coding selection: every drag stored exactly the highlighted turns; unmatched highlights do not reuse the old passage');
