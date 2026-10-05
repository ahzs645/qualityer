// Browser smoke test for every visualization tab. Not part of `npm test` (needs a running app and Playwright):
//   npm run dev   # in one shell
//   BASE_URL=http://127.0.0.1:5173 npm run test:browser
// Set PLAYWRIGHT_MODULE to a playwright index.mjs when it is not installed locally.
import {pathToFileURL} from 'node:url';
const base=process.env.BASE_URL||'http://127.0.0.1:5173';
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright'));}
catch{console.log('SKIP: playwright is not installed (set PLAYWRIGHT_MODULE).');process.exit(0);}
const groups={
  'Visualizations':['Interview overview','Source & speakers','Coding sequence','Theme map','Theme reading','Theme connections','Evidence report'],
  'Analysis workbench':['Charts & matrix','Coverage & coder overlap','Code hierarchy','Code relationships','Project map','Coding portrait','Words & concordance','Fragments & corpus search','Attributes','Report builder'],
  'Explore':['Coding matrix','Coding query','Co-occurrence','Word frequency','Themes']};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
const failures=[];
for(const vp of [{width:1440,height:900},{width:390,height:844}]){
  const page=await (await browser.newContext({viewport:vp})).newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base);await page.waitForTimeout(2500);
  if(vp.width<500)await page.locator('button[aria-controls="app-navigation"]').first().click();
  const demo=page.locator('select[aria-label*="tudy" i], .rail select').first();
  const option=await demo.locator('option').evaluateAll(o=>o.find(x=>/synthetic/i.test(x.textContent))?.value);
  if(option)await demo.selectOption(option);else await page.getByRole('button',{name:/Open example demo/}).first().click({force:true});
  await page.waitForTimeout(2500);
  const phone=vp.width<500;
  if(phone){await page.keyboard.press('Escape');await page.waitForTimeout(500);const hidden=await page.evaluate(()=>getComputedStyle(document.querySelector('.rail')).visibility==='hidden');if(!hidden)failures.push('phone: closed sidebar is still focusable');}
  for(const [nav,tabs] of Object.entries(groups)){
    if(phone)await page.locator('button[aria-controls="app-navigation"]').first().click();
    await page.locator('.rail nav button').filter({hasText:new RegExp('^'+nav+'$')}).first().click();await page.waitForTimeout(1000);
    for(const t of tabs){
      const tab=page.locator('.tabs [role=tab]').filter({hasText:new RegExp('^'+t.replace(/[&]/g,'\\&')+'$')}).first();
      try{await tab.click({timeout:4000});}catch{failures.push(`${vp.width} ${nav} > ${t}: tab not found`);continue;}
      await page.waitForTimeout(700);
      const r=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,selected:document.querySelectorAll('.tabs [role=tab][aria-selected=true]').length>0,body:document.querySelector('main')?.innerText.length||0}));
      if(r.overflow)failures.push(`${vp.width} ${nav} > ${t}: horizontal overflow`);
      if(!r.selected)failures.push(`${vp.width} ${nav} > ${t}: no aria-selected tab`);
      if(r.body<50)failures.push(`${vp.width} ${nav} > ${t}: empty view`);
    }
  }
  errors.forEach(e=>failures.push(`${vp.width}: page error ${e}`));
}
await browser.close();
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log('browser smoke: all visualization tabs passed at 1440 and 390 px');
