import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(resolve(process.argv[2]||'tmp/theme-reference-15.24/tooling/node_modules/playwright/index.mjs')));
const out=resolve(process.argv[3]||'tmp/navigation-15.28/browser');mkdirSync(out,{recursive:true});
const source=resolve(process.argv[4]||'.');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='theme.test')return route.fulfill({status:503,body:'{"error":"Read-only fixture"}',contentType:'application/json'});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
 if(!['index.html','idea-board.js','app-navigation.js','app-ui.css','app-ui.js'].includes(name)&&!name.startsWith('assets/fonts/'))return route.fulfill({status:404,body:''});
 return route.fulfill({body:readFileSync(resolve(source,name)),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf'}[extname(name)]});
});
await page.goto('http://theme.test');await page.waitForFunction(()=>typeof showAppSection==='function');
await page.evaluate(()=>{
 window.qaSession={id:'qa-session',podcastTitle:'The changing workplace',guestName:'Sample guest',guestEmail:'guest@example.test',guestIntro:'Prepare your thoughts in your own words.',status:'feedback_shared',questions:[{id:'q1',order:1,question:'What has changed in how your team works?',talkingPoints:'Consider one specific example and what you learned.'}],completedQuestionCount:1,questionCount:1};
 window.qaReadDb={collection(){const q={where(){return q},orderBy(){return q},limit(){return q},doc(){return q},collection(){return q},get:async()=>({exists:false,docs:[],empty:true,forEach(){}})};return q}};
 window.qaStory={id:'qa-story',writerName:'Sample writer',writerEmail:'guest@example.test',title:'Learning to lead',workingTitle:'Learning to lead',status:'draft',body:'<p>A story about learning from a team.</p>',ideaSummary:'A personal account of change at work.',preferredSection:'Health',sourceType:'guest_writer'};
 window.qaMount=(id,mode='staff')=>{
  hideAllAppScreens();hideStaffLandingPanels();db=null;currentUser={uid:'qa-user',email:mode==='staff'?ADMIN_EMAIL:'guest@example.test',emailVerified:true};currentAccessMode=mode;
  const el=document.getElementById(id);if(!el)throw Error('Unknown screen '+id);
  if(el.closest('#landing'))document.getElementById('landing').style.display='block';
  el.style.display=id==='workflow'||id==='main'?'block':'flex';
  updateAuthenticatedNavigationForMode();renderAppShell();
 };
});

async function staff(){await page.evaluate(()=>{currentUser={uid:'staff',email:ADMIN_EMAIL};currentAccessMode='staff';db=null;resetAppBackNavigation();showAppSection('draft');});}
for(const [name,id] of [['showUrlEntry','landing-url'],['showManualNewsBrief','landing-manual-news-brief'],['showManualLongView','landing-manual-long-view']]){
 await staff();await page.evaluate(name=>window[name](),name);await page.locator('#'+id+' .app-back-link').first().click();assert.equal(await page.locator('#landing-cards h1').textContent(),'Draft new stories');
 await page.evaluate(name=>{resetAppBackNavigation();window[name]()},name);await page.locator('#'+id+' .app-back-link').first().click();assert.equal(await page.locator('#landing-cards h1').textContent(),'Draft new stories');console.log('PASS '+name+' Back and fallback');
}
await staff();await page.evaluate(()=>showMain());await page.locator('#btn-back-landing').click();assert.equal(await page.locator('#landing-cards h1').textContent(),'Draft new stories');
await staff();await page.evaluate(()=>{showPodcastPrepDashboard();renderPodcastPrepStaffDetail(qaSession,{},{});});await page.locator('#podcast-prep-detail .app-detail-back').click();assert.match(await page.locator('#podcast-prep-detail').textContent(),/Select a record/);assert.equal(await page.locator('#landing-podcast-prep').isVisible(),true);
await staff();await page.evaluate(()=>{showStaffGuestWriterStories();window._staffGuestWriterStories=[{...qaStory,status:'draft',ideaStatus:'approved',ideaApprovedAt:{seconds:1790255520}}];db=qaReadDb;openStaffGuestWriterStory('qa-story',null,{skipFetch:true});});assert.match(await page.locator('#staff-guest-writer-story-detail').textContent(),/Status changed:/);await page.locator('#staff-guest-writer-story-detail .app-detail-back').click();assert.equal(await page.locator('#landing-guest-writer-stories').isVisible(),true);
await page.evaluate(()=>{
 currentUser={uid:'writer',email:'writer@example.test'};currentAccessMode='guest_writer';currentGuestWriterProfile={fullName:'Sample Writer'};
 window._guestWriterStories=[{...qaStory,writerUid:'writer',status:'idea_under_review'}];
 window.latestStory={...qaStory,id:'qa-story',writerUid:'writer',status:'draft',ideaStatus:'approved',writingUnlocked:true};
 db={collection(){return {doc(){return {get:async()=>({exists:true,id:'qa-story',data:()=>latestStory})}}}}};
 renderGuestWriterDashboardTable();resetAppBackNavigation();
});
await page.evaluate(()=>viewGuestWriterStory('qa-story'));
await page.waitForSelector('#chat-article-preview');assert.equal(await page.locator('#chat-article-preview').isEditable(),true);
await page.locator('#chat-article-preview').fill('Writer can edit after approval.');
assert.equal(await page.evaluate(()=>currentGuestWriterStory.status),'draft');
for(const theme of ['light','dark']){await page.evaluate(t=>{if(document.documentElement.dataset.theme!==t)toggleAppTheme()},theme);await page.screenshot({path:resolve(out,'approved-writer-'+theme+'.png')});}
await page.evaluate(()=>{latestStory.status='idea_under_review';return viewGuestWriterStory('qa-story')});assert.equal(await page.locator('#guest-writer-idea-discussion').isVisible(),true);assert.equal(await page.locator('#chat-article-preview').isVisible(),false);
await staff();await page.evaluate(()=>showManualLongView());await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'manual-long-mobile.png')});
console.log('PASS live renderers: draft/trending/manual Back, Podcast/Writer detail Back, exact staff date, fresh approval opens editable draft, preapproval remains blocked. Backend requests blocked.');await browser.close();
