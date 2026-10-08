import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(resolve(process.argv[2]||'tmp/theme-reference-15.24/tooling/node_modules/playwright/index.mjs')));
const out=resolve(process.argv[3]||'tmp/guest-profile-15.33/browser');mkdirSync(out,{recursive:true});
const source=resolve(process.argv[4]||'.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Asia/Kolkata',reducedMotion:'reduce'});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='profiles.test')return route.fulfill({status:503,body:'{}',contentType:'application/json'});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','idea-board.js','app-navigation.js','app-ui.css','app-ui.js'].includes(name)&&!name.startsWith('assets/fonts/'))return route.fulfill({status:404,body:''});
 return route.fulfill({body:readFileSync(resolve(source,name)),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'}[extname(name)]});
});
try{
 await page.goto('http://profiles.test');await page.waitForFunction(()=>typeof showAppSection==='function');
 await page.evaluate(()=>{
  hideAllAppScreens();currentUser={uid:'staff',email:ADMIN_EMAIL};currentAccessMode='staff';
  document.getElementById('landing').style.display='block';
  const stamp=iso=>({toDate:()=>new Date(iso)});
  const common={email:'writer@example.test',alias:'A writer',phone:'1234567890',location:'New Delhi',preferredSection:'Work',shortBio:'A thoughtful contributor.',storyPitch:'A story about learning.',experiencePerspective:'Experience working with teams.'};
  window.profileFixtures=[
   {...common,id:'legacy',fullName:'Historical approved',status:'approved',updatedAt:stamp('2026-10-09T00:00:00Z')},
   {...common,id:'older',fullName:'Earlier approved',status:'approved',createdAt:stamp('2026-10-07T00:12:00Z'),approvedAt:stamp('2026-10-07T01:00:00Z')},
   {...common,id:'new',fullName:'Newest request',status:'pending',createdAt:stamp('2026-10-08T00:12:00Z')}
  ];
  window._guestWriterApplications=profileFixtures;window._guestWriterApplicationsLoaded=true;
  window.firebase={firestore:{FieldValue:{serverTimestamp:()=>stamp('2026-10-08T01:00:00Z')}}};
  const ref=id=>({id,get:async()=>({exists:true,data:()=>profileFixtures.find(p=>p.id===id)})});
  db={collection:name=>({doc:ref,get:async()=>({forEach:callback=>profileFixtures.forEach(p=>callback({id:p.id,data:()=>p}))})}),runTransaction:async callback=>callback({get:r=>r.get(),update:(r,patch)=>Object.assign(profileFixtures.find(p=>p.id===r.id),patch)})};
  showGuestWriterApplications();renderAppShell();
 });
 const cards=page.locator('#guest-writer-applications-list > div');
 assert.match(await cards.nth(0).textContent(),/Newest request/);assert.match(await cards.nth(2).textContent(),/Historical approved/);
 assert.match(await cards.first().textContent(),/Requested: 8 Oct 2026/);assert(!((await cards.first().textContent()).includes('Approved:')));
 assert.match(await cards.nth(2).textContent(),/Requested: Date unavailableApproved: Date unavailable/);
 await cards.first().getByRole('button',{name:'Open',exact:true}).click();
 const detail=page.locator('#guest-writer-application-detail');assert.match(await detail.textContent(),/Requested: 08 Oct 2026, 05:42 am/);
 assert(!((await detail.textContent()).includes('Approved:')));
 await detail.getByRole('button',{name:'Approve',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('guest-writer-application-detail').textContent.includes('Approved: 08 Oct 2026, 06:30 am'));
 assert.match(await cards.first().textContent(),/Approved: 8 Oct 2026/);assert(await detail.getByRole('button',{name:'Approved',exact:true}).isDisabled());
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  for(const theme of ['light','dark']){
   await page.evaluate(t=>{if(document.documentElement.dataset.theme!==t)toggleAppTheme();},theme);
   assert(await detail.isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.screenshot({path:resolve(out,`profiles-${width}-${theme}.png`),fullPage:true});
  }
 }
 await cards.nth(2).getByRole('button',{name:'Open',exact:true}).click();assert.match(await detail.textContent(),/Approved: Date unavailable/);
 assert.equal(await page.locator('#app-version').textContent(),'v15.33');
 for(const mode of ['guest_writer','podcast_prep_guest','guest']){
  await page.evaluate(m=>{hideAllAppScreens();currentUser={uid:'guest',email:'guest@example.test'};currentAccessMode=m;renderAppShell();showGuestWriterApplications();},mode);
  assert(!(await page.locator('#landing-guest-writer-applications').isVisible()));
 }
 console.log('PASS: profile date/time, ordering, historical records, approval refresh, staff-only screen, Light/Dark desktop/mobile, v15.33. No production writes.');
}finally{await browser.close();}
