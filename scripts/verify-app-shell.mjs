// Read-only browser regression checks. Install Playwright in a temporary tooling
// directory, then pass its index.mjs path as the first argument. No backend calls.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(resolve(process.argv[2] || 'node_modules/playwright/index.mjs')));
const output = resolve(process.argv[3] || 'tmp/shell-qa');
const source = resolve(process.argv[4] || '.');
mkdirSync(output, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:860},reducedMotion:'reduce'});
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname !== 'shell.test') return route.fulfill({status:503,contentType:'application/json',body:'{"error":"Offline visual fixture"}'});
  const path = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!['index.html','app-ui.js','app-ui.css'].includes(path) && !path.startsWith('assets/fonts/')) return route.fulfill({status:404,body:''});
  const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'};
  return route.fulfill({contentType:types[extname(path)],body:readFileSync(resolve(source,path))});
});
const page = await context.newPage();
await page.goto('http://shell.test/');
await page.waitForFunction(()=>typeof showAppSection === 'function');
assert.equal(await page.getAttribute('html','data-theme'),'light');
await page.evaluate(()=>{
  currentUser={email:'anmadaan@gmail.com',uid:'visual-fixture'};
  currentAccessMode='staff';
  document.getElementById('access-screen').style.display='none';
  updateAuthenticatedNavigationForMode();
  showAppSection('draft');
});

async function geometry() {
  return page.evaluate(()=>{
    const visible=e=>getComputedStyle(e).display!=='none'&&e.getClientRects().length;
    const workspace=[...document.querySelectorAll('body > .app-workspace')].find(visible);
    const bar=document.querySelector('.topbar'),sidebar=document.querySelector('.app-sidebar');
    return {top:workspace.getBoundingClientRect().top,barBottom:bar.getBoundingClientRect().bottom,
      row:getComputedStyle(bar).gridRowStart,barHeight:getComputedStyle(bar).height,barTop:bar.getBoundingClientRect().top,barTransform:getComputedStyle(bar).transform,barStyle:bar.getAttribute('style'),scrollHeight:workspace.scrollHeight,clientHeight:workspace.clientHeight,
      horizontal:workspace.scrollWidth>workspace.clientWidth,bodyHeight:document.body.scrollHeight,
      viewport:innerHeight,sidebarTop:sidebar.getBoundingClientRect().top,
      titles:[...workspace.querySelectorAll('h1')].filter(visible).map(e=>e.textContent),
      controls:[...bar.querySelectorAll('button')].filter(visible).map(e=>e.id),
      backgrounds:[workspace,...workspace.querySelectorAll('.landing')].filter(visible).map(e=>getComputedStyle(e).backgroundColor)};
  });
}
async function checkShell(label) {
  const g=await geometry();
  assert.equal(g.top,g.barBottom,label+' workspace below utility bar '+JSON.stringify(g));
  assert.equal(g.row,'1',label+' dedicated utility row');
  assert.equal(g.horizontal,false,label+' horizontal overflow');
  assert.equal(g.bodyHeight,g.viewport,label+' body does not scroll');
  assert.equal(g.sidebarTop,0,label+' stable sidebar');
  assert.ok(g.controls.includes('app-theme-toggle'),label+' theme control');
  assert.ok(!g.controls.some(id=>['btn-back-landing','btn-logout','btn-draft-url','btn-new-guest-story','rbtn'].includes(id)));
  assert.equal(await page.locator('.topbar h1,.topbar #app-page-title').count(),0);
  return g;
}

const baselineLight=await page.locator('.app-launcher').first().evaluate(e=>{
  const c=getComputedStyle(e);return {background:c.backgroundColor,radius:c.borderRadius,padding:c.padding,font:c.fontFamily};
});
assert.equal(baselineLight.background,'rgb(255, 255, 255)');
assert.equal(baselineLight.radius,'11px');
await checkShell('Light desktop');
await page.screenshot({path:resolve(output,'light-draft-1440.png')});
await page.locator('#app-theme-toggle').click();
await page.evaluate(()=>document.fonts.ready);
assert.equal(await page.evaluate(()=>localStorage.getItem('wocult_ui_theme')),'dark');
const tokens=await page.evaluate(()=>{
  const c=getComputedStyle(document.documentElement);return Object.fromEntries(['--app-workspace-dark','--app-sidebar','--app-surface-dark','--app-accent'].map(k=>[k,c.getPropertyValue(k).trim()]));
});
assert.deepEqual(tokens,{'--app-workspace-dark':'#1C1C1F','--app-sidebar':'#141416','--app-surface-dark':'#232326','--app-accent':'#FFC500'});
const colors=await page.locator('.app-launcher').first().evaluate(e=>{
  const c=getComputedStyle(e),chip=getComputedStyle(e.querySelector('.app-launcher-icon'));
  return {background:c.backgroundColor,radius:c.borderRadius,border:c.borderTopColor,chip:chip.color,width:chip.width};
});
assert.deepEqual(colors,{background:'rgb(35, 35, 38)',radius:'14px',border:'rgba(255, 255, 255, 0.07)',chip:'rgb(255, 197, 0)',width:'38px'});
assert.equal(await page.evaluate(()=>{
 const anchor=document.createElement('a');anchor.href='#';anchor.textContent='Legacy link';document.getElementById('landing').appendChild(anchor);
 const color=getComputedStyle(anchor).color;anchor.remove();return color;
}),'rgb(245, 243, 238)','unstyled legacy links cannot inherit browser blue');

for (const width of [1920,1440,900,390]) {
  await page.setViewportSize({width,height:860});
  for(const section of ['home','draft','interviews','podcast','community','editorial','webcomm','admin']) {
    await page.evaluate(s=>showAppSection(s),section);
    const g=await checkShell(section+' '+width);
    assert.equal(g.titles.length,1,section+' one primary title');
    assert.ok(g.backgrounds.every(c=>c==='rgb(28, 28, 31)'),section+' continuous Dark workspace');
    await page.screenshot({path:resolve(output,`dark-${section}-${width}.png`)});
  }
  await page.evaluate(()=>showUrlEntry());
  await checkShell('URL '+width);
  await page.screenshot({path:resolve(output,`dark-url-${width}.png`)});
  await page.evaluate(()=>showMain());
  await checkShell('News dashboard '+width);
  assert.equal(await page.locator('#stats-bar').evaluate(e=>e.closest('.app-workspace').id),'main');
  assert.ok(await page.locator('#stats-bar').evaluate(e=>e.getBoundingClientRect().top>=64));
}

// Real scrolling, focus scrolling, and the mobile drawer must preserve the row boundary.
await page.evaluate(()=>showAppSection('draft'));
await page.locator('.app-launcher').last().focus();
await checkShell('focused last mobile card');
await page.evaluate(()=>document.getElementById('landing').scrollTo(0,400));
assert.ok(await page.locator('#landing').evaluate(e=>e.scrollTop)>0);
assert.equal(await page.evaluate(()=>document.elementFromPoint(200,30).closest('.topbar')!==null),true);
await page.screenshot({path:resolve(output,'dark-mobile-scrolled.png')});
const scrollBeforeDrawer=await page.locator('#landing').evaluate(e=>e.scrollTop);
const urlBeforeDrawer=page.url();
await page.locator('#app-menu-toggle').click();
assert.equal(await page.getAttribute('#app-menu-toggle','aria-expanded'),'true');
await page.keyboard.press('Shift+Tab');
assert.equal(await page.evaluate(()=>document.activeElement.className),'app-logout','drawer wraps backwards');
await page.keyboard.press('Tab');
assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-section')),'home','drawer wraps forwards');
await page.keyboard.press('Escape');
assert.equal(await page.getAttribute('#app-menu-toggle','aria-expanded'),'false');
assert.equal(page.url(),urlBeforeDrawer,'drawer preserves route');
assert.equal(await page.locator('#landing').evaluate(e=>e.scrollTop),scrollBeforeDrawer,'drawer preserves workspace scroll');
assert.equal(await page.evaluate(()=>document.activeElement.id),'app-menu-toggle');
await page.locator('#app-menu-toggle').click();
await page.locator('#app-sidebar-backdrop').click({position:{x:350,y:500}});
assert.equal(await page.getAttribute('#app-menu-toggle','aria-expanded'),'false');
await page.evaluate(()=>scrollAppWorkspaceToTop());
assert.equal(await page.locator('#landing').evaluate(e=>e.scrollTop),0);
await page.locator('#app-theme-toggle').click();
await checkShell('Light mobile');
await page.screenshot({path:resolve(output,'light-mobile.png')});
await page.locator('.app-launcher').last().focus();
await checkShell('Light mobile focus scrolling');
await page.locator('#app-theme-toggle').click();

await page.setViewportSize({width:1440,height:860});
for(const mode of ['podcast_prep_guest','guest_writer','guest']){
 await page.evaluate(mode=>{
   currentAccessMode=mode;
   currentUser={email:'guest@example.test',uid:'visual-guest'};
   hideAllAppScreens();
   if(mode==='podcast_prep_guest') {
     showPodcastPrepGuestShell();
     window._podcastPrepGuest.session={podcastTitle:'Podcast Prep',guestName:'Guest',guestIntro:'Prepare your thoughts before the conversation.',questions:[{id:'q1',question:'What has changed in your work?',talkingPoints:'Consider one example.'}]};
     renderPodcastPrepGuestWelcome();
   }
   else document.getElementById(mode==='guest_writer'?'guest-writer-dashboard':'guest-placeholder').style.display='flex';
   if(mode==='guest_writer') {window._guestWriterStories=[];currentGuestWriterStory=null;updateGuestWriterNewStoryButton();}
   updateAuthenticatedNavigationForMode();renderAppShell();
 },mode);
 await checkShell(mode);
 await page.screenshot({path:resolve(output,`dark-${mode}.png`)});
 if(mode==='podcast_prep_guest') assert.equal(await page.locator('#notification-bell').isVisible(),false);
 if(mode==='guest_writer') {
   assert.equal(await page.locator('#btn-new-guest-story').isVisible(),true);
   assert.equal(await page.locator('#btn-new-guest-story').evaluate(e=>e.closest('.app-workspace').id),'guest-writer-dashboard');
 }
 if(mode==='podcast_prep_guest') {
   await page.evaluate(()=>renderPodcastPrepQuestion());
   await page.screenshot({path:resolve(output,'dark-podcast-question.png')});
 }
}
await page.reload();
assert.equal(await page.getAttribute('html','data-theme'),'dark','theme persists across reload');
await page.locator('#app-theme-toggle').click();
assert.equal(await page.getAttribute('html','data-theme'),'light');
await page.evaluate(()=>{
 currentUser={email:STAFF_EMAILS.find(email=>email!==ADMIN_EMAIL)};currentAccessMode='staff';
 renderAppShell();
});
assert.equal(await page.locator('[data-section="admin"]').count(),0,'admin not exposed to unauthorized user');
console.log('PASS: Dark tokens, all eight sections at four widths, Light card contract, deeper screens, three guest shells, focus/scroll boundaries, mobile drawer, theme persistence and admin visibility.');
await browser.close();
